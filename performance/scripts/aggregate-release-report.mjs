import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import lighthousePackage from "lighthouse/package.json" with { type: "json" };
import { isMain, median, parseArgs, readJson, readManifest, round, variance } from "./lib.mjs";

const categoryIds = ["performance", "accessibility", "best-practices", "seo"];
const metricAudits = {
  largestContentfulPaintMs: "largest-contentful-paint",
  totalBlockingTimeMs: "total-blocking-time",
  cumulativeLayoutShift: "cumulative-layout-shift",
};

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return files.flat();
}

function requireNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} is unavailable`);
  return value;
}

function summarizeReport(lhr) {
  const scores = Object.fromEntries(categoryIds.map((categoryId) => [
    categoryId,
    round(requireNumber(lhr.categories?.[categoryId]?.score, categoryId) * 100),
  ]));
  const metrics = Object.fromEntries(Object.entries(metricAudits).map(([name, auditId]) => [
    name,
    round(requireNumber(lhr.audits?.[auditId]?.numericValue, auditId)),
  ]));
  return { scores, metrics };
}

function summarizeGroup(reports) {
  const samples = reports
    .sort((left, right) => left.context.run - right.context.run)
    .map((report) => ({ run: report.context.run, ...summarizeReport(report.lhr) }));
  const scoreMedian = {};
  const scoreVariance = {};
  for (const categoryId of categoryIds) {
    const values = samples.map((sample) => sample.scores[categoryId]);
    scoreMedian[categoryId] = round(median(values));
    scoreVariance[categoryId] = variance(values);
  }
  const metricMedian = {};
  const metricVariance = {};
  for (const metricName of Object.keys(metricAudits)) {
    const values = samples.map((sample) => sample.metrics[metricName]);
    metricMedian[metricName] = round(median(values));
    metricVariance[metricName] = variance(values);
  }
  return {
    sampleCount: samples.length,
    samples,
    median: { scores: scoreMedian, metrics: metricMedian },
    variance: { scores: scoreVariance, metrics: metricVariance },
  };
}

function assertSharedContext(reports, expected) {
  const seen = new Set();
  for (const report of reports) {
    for (const [key, value] of Object.entries(expected)) {
      if (report.context[key] !== value) {
        throw new Error(`report context mismatch for ${key}: expected ${value}, received ${report.context[key]}`);
      }
    }
    const sample = `${report.context.routeId}:${report.context.profile}:${report.context.run}`;
    if (seen.has(sample)) throw new Error(`duplicate Lighthouse sample: ${sample}`);
    seen.add(sample);
  }
}

function evaluateCandidate(groups, baseline, thresholds) {
  const failures = [];
  for (const [key, group] of Object.entries(groups)) {
    const original = baseline.groups?.[key];
    if (!original) {
      failures.push(`${key}: missing original preview baseline`);
      continue;
    }
    const scores = group.median.scores;
    const metrics = group.median.metrics;
    const baselineScores = original.median.scores;
    if (scores.performance < thresholds.performance) failures.push(`${key}: Performance ${scores.performance} is below ${thresholds.performance}`);
    if (scores.performance < baselineScores.performance - thresholds.maximumPerformanceDrop) {
      failures.push(`${key}: Performance ${scores.performance} is more than ${thresholds.maximumPerformanceDrop} points below baseline ${baselineScores.performance}`);
    }
    if (metrics.largestContentfulPaintMs > thresholds.largestContentfulPaintMs) failures.push(`${key}: LCP ${metrics.largestContentfulPaintMs}ms exceeds ${thresholds.largestContentfulPaintMs}ms`);
    if (metrics.totalBlockingTimeMs > thresholds.totalBlockingTimeMs) failures.push(`${key}: TBT ${metrics.totalBlockingTimeMs}ms exceeds ${thresholds.totalBlockingTimeMs}ms`);
    if (metrics.cumulativeLayoutShift > thresholds.cumulativeLayoutShift) failures.push(`${key}: CLS ${metrics.cumulativeLayoutShift} exceeds ${thresholds.cumulativeLayoutShift}`);
    for (const categoryId of thresholds.nonRegressionCategories) {
      if (scores[categoryId] < baselineScores[categoryId]) failures.push(`${key}: ${categoryId} ${scores[categoryId]} regressed from ${baselineScores[categoryId]}`);
    }
  }
  return failures;
}

function markdownReport(report, manifest) {
  const lines = [
    `# Remote Lighthouse ${report.mode} report`,
    "",
    `Commit: \`${report.context.commitSha}\``,
    "",
    `Immutable deploy: ${report.context.deployUrl}`,
    "",
    `Lighthouse: \`${report.context.lighthouseVersion}\``,
    "",
    `Route manifest: \`${report.context.routeManifestVersion}\``,
    "",
    "| Route | Profile | Perf | A11y | Best Practices | SEO | LCP | TBT | CLS | Runs |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const route of manifest.routes) {
    for (const profile of manifest.profiles) {
      const group = report.groups[`${route.id}::${profile.id}`];
      if (!group) continue;
      const scores = group.median.scores;
      const metrics = group.median.metrics;
      lines.push(`| ${route.label} | ${profile.id} | ${scores.performance} | ${scores.accessibility} | ${scores["best-practices"]} | ${scores.seo} | ${metrics.largestContentfulPaintMs}ms | ${metrics.totalBlockingTimeMs}ms | ${metrics.cumulativeLayoutShift} | ${group.sampleCount} |`);
    }
  }
  lines.push("", `Promotion eligible from Lighthouse: ${report.promotionEligible ? "yes" : "no"}`, "");
  if (report.failures.length) lines.push("## Failures", "", ...report.failures.map((failure) => `- ${failure}`));
  else lines.push("No Lighthouse threshold failures were recorded.");
  lines.push("");
  return lines.join("\n");
}

export async function aggregateReports({ inputDirectory, outputDirectory, mode, commitSha, deployUrl, releaseId, manifest, baselinePath }) {
  if (!["diagnostic", "baseline", "candidate"].includes(mode)) throw new Error("mode must be diagnostic, baseline, or candidate");
  const reportFiles = (await walk(inputDirectory)).filter((file) => file.endsWith(".report.json"));
  if (!reportFiles.length) throw new Error("no Lighthouse JSON reports were found");
  const reports = await Promise.all(reportFiles.map(async (file) => {
    const lhr = JSON.parse(await readFile(file, "utf8"));
    if (!lhr.releaseContext) throw new Error(`${file} has no releaseContext`);
    return { file, lhr, context: lhr.releaseContext };
  }));
  const expectedContext = {
    commitSha,
    deployUrl: new URL(deployUrl).origin,
    releaseId,
    routeManifestVersion: manifest.manifestVersion,
    lighthouseVersion: lighthousePackage.version,
  };
  assertSharedContext(reports, expectedContext);
  const grouped = new Map();
  for (const report of reports) {
    if (!manifest.routes.some((route) => route.id === report.context.routeId)) throw new Error(`unknown report route: ${report.context.routeId}`);
    if (!manifest.profiles.some((profile) => profile.id === report.context.profile)) throw new Error(`unknown report profile: ${report.context.profile}`);
    const key = `${report.context.routeId}::${report.context.profile}`;
    grouped.set(key, [...(grouped.get(key) || []), report]);
  }
  const expectedRuns = mode === "diagnostic" ? manifest.diagnosticRuns : manifest.authoritativeRuns;
  const expectedGroups = mode === "diagnostic" ? grouped.size : manifest.routes.length * manifest.profiles.length;
  if (mode !== "diagnostic" && grouped.size !== expectedGroups) throw new Error(`expected ${expectedGroups} route/profile groups, received ${grouped.size}`);
  const groups = {};
  for (const [key, groupReports] of grouped.entries()) {
    if (groupReports.length !== expectedRuns) throw new Error(`${key} has ${groupReports.length} reports, expected ${expectedRuns}`);
    groups[key] = summarizeGroup(groupReports);
  }
  const expectedReportCount = expectedGroups * expectedRuns;
  if (reports.length !== expectedReportCount) throw new Error(`expected ${expectedReportCount} reports, received ${reports.length}`);

  let failures = [];
  let baselineContext = null;
  if (mode === "candidate") {
    if (!baselinePath) throw new Error("candidate mode requires --baseline");
    const baseline = await readJson(baselinePath);
    if (baseline.mode !== "baseline") throw new Error("candidate baseline artifact was not created in baseline mode");
    if (baseline.context.routeManifestVersion !== manifest.manifestVersion) throw new Error("candidate and baseline route manifest versions differ");
    baselineContext = baseline.context;
    failures = evaluateCandidate(groups, baseline, manifest.thresholds);
  }
  const promotionEligible = mode === "candidate" && failures.length === 0;
  const report = {
    schemaVersion: 1,
    mode,
    generatedAt: new Date().toISOString(),
    context: expectedContext,
    baselineContext,
    sampleCount: reports.length,
    expectedSampleCount: expectedReportCount,
    groups,
    thresholds: manifest.thresholds,
    failures,
    lighthouseGatePassed: promotionEligible,
    promotionEligible,
    promotionNote: mode === "candidate"
      ? "Lighthouse is one required gate. Dashboard, student, Obi, blog, analytics, and exact-commit reviews must also pass."
      : "Diagnostic and baseline reports cannot authorize production promotion.",
  };
  const decision = {
    commitSha,
    deployUrl: expectedContext.deployUrl,
    releaseId,
    mode,
    decision: promotionEligible ? "lighthouse-pass" : "do-not-promote",
    blockingFailures: failures,
    remainingRequiredGates: [
      "dashboard automated tests",
      "Preview Student visual review",
      "Student Internal and Student Deployed verification",
      "Obi authenticated account review",
      "complete published-blog crawl and indexing audit",
      "PostHog release-health and ingestion review",
      "exact reviewed commit and immutable deploy verification",
    ],
  };
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, "validated-release-report.json"), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(path.join(outputDirectory, "validated-release-report.md"), markdownReport(report, manifest)),
    writeFile(path.join(outputDirectory, "promotion-decision.json"), `${JSON.stringify(decision, null, 2)}\n`),
  ]);
  return report;
}

async function main() {
  const args = parseArgs();
  const report = await aggregateReports({
    inputDirectory: path.resolve(String(args["input-dir"])),
    outputDirectory: path.resolve(String(args["output-dir"])),
    mode: String(args.mode),
    commitSha: String(args["commit-sha"]),
    deployUrl: String(args["deploy-url"]),
    releaseId: String(args["release-id"]),
    manifest: await readManifest(args.manifest),
    baselinePath: args.baseline ? path.resolve(String(args.baseline)) : null,
  });
  process.stdout.write(`Validated ${report.sampleCount} Lighthouse reports. Promotion eligible: ${report.promotionEligible}\n`);
  if (args["fail-on-gate"] && !report.promotionEligible) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
