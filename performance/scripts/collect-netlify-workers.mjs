import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import lighthousePackage from "lighthouse/package.json" with { type: "json" };
import { aggregateReports } from "./aggregate-release-report.mjs";
import { isMain, parseArgs, readManifest } from "./lib.mjs";

const execFileAsync = promisify(execFile);

function requireArg(args, name) {
  const value = args[name];
  if (!value) throw new Error(`--${name} is required`);
  return String(value);
}

function immutableDeployUrl(deploy, siteName) {
  return `https://${deploy.id}--${siteName}.netlify.app`;
}

export function selectWorkerDeploys({ deploys, manifest, runnerCommitSha }) {
  const expectedBranches = manifest.routes.flatMap((route) =>
    manifest.profiles.map((profile) => ({
      branch: `lh-${route.id}-${profile.id}`,
      route,
      profile,
    })),
  );

  const selected = [];
  for (const expected of expectedBranches) {
    const matches = deploys
      .filter((deploy) => deploy.commit_ref === runnerCommitSha && deploy.branch === expected.branch)
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
    if (!matches.length) throw new Error(`missing Netlify worker deploy for ${expected.branch}`);
    const deploy = matches[0];
    if (deploy.state !== "ready") {
      throw new Error(`${expected.branch} is ${deploy.state}, expected ready${deploy.error_message ? `: ${deploy.error_message}` : ""}`);
    }
    if (!deploy.id) throw new Error(`${expected.branch} has no immutable deploy ID`);
    selected.push({ ...expected, deploy });
  }

  return selected;
}

async function fetchFile(url, label) {
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

export function expectedRunCount(mode, manifest) {
  return mode === "diagnostic" ? manifest.diagnosticRuns : manifest.authoritativeRuns;
}

function assertWorkerIdentity({ context, shard, worker, course, manifest, runnerCommitSha, workerUrl }) {
  const expectedRuns = expectedRunCount(course.mode, manifest);
  assertEqual(context.mode, course.mode, `${worker.branch} mode`);
  assertEqual(context.routeId, worker.route.id, `${worker.branch} route`);
  assertEqual(context.profile, worker.profile.id, `${worker.branch} profile`);
  assertEqual(context.runs, expectedRuns, `${worker.branch} run count`);
  assertEqual(context.courseCommitSha, course.commitSha, `${worker.branch} course commit`);
  assertEqual(new URL(context.courseDeployUrl).origin, new URL(course.deployUrl).origin, `${worker.branch} course deploy`);
  assertEqual(context.courseReleaseId, course.releaseId, `${worker.branch} course release`);
  assertEqual(context.routeManifestVersion, manifest.manifestVersion, `${worker.branch} manifest`);
  assertEqual(context.lighthouseVersion, lighthousePackage.version, `${worker.branch} Lighthouse version`);
  assertEqual(context.runnerCommitSha, runnerCommitSha, `${worker.branch} runner commit`);
  assertEqual(context.netlifyDeployId, worker.deploy.id, `${worker.branch} worker deploy ID`);
  assertEqual(new URL(context.netlifyDeployUrl).origin, new URL(workerUrl).origin, `${worker.branch} worker deploy URL`);

  assertEqual(shard.identity.commitSha, course.commitSha, `${worker.branch} shard commit`);
  assertEqual(new URL(shard.identity.deployUrl).origin, new URL(course.deployUrl).origin, `${worker.branch} shard deploy`);
  assertEqual(shard.identity.releaseId, course.releaseId, `${worker.branch} shard release`);
  assertEqual(shard.identity.manifestVersion, manifest.manifestVersion, `${worker.branch} shard manifest`);
  assertEqual(shard.routeId, worker.route.id, `${worker.branch} shard route`);
  assertEqual(shard.profile, worker.profile.id, `${worker.branch} shard profile`);
  assertEqual(shard.reports.length, expectedRuns, `${worker.branch} shard reports`);
}

async function collectWorker({ worker, siteName, outputDirectory, course, manifest, runnerCommitSha }) {
  const workerUrl = immutableDeployUrl(worker.deploy, siteName);
  const shardBase = `${workerUrl}/lighthouse/${worker.route.id}/${worker.profile.id}`;
  const contextBytes = await fetchFile(`${workerUrl}/worker-context.json`, `${worker.branch} worker context`);
  const shardBytes = await fetchFile(`${shardBase}/shard-manifest.json`, `${worker.branch} shard manifest`);
  const context = JSON.parse(contextBytes.toString("utf8"));
  const shard = JSON.parse(shardBytes.toString("utf8"));
  assertWorkerIdentity({ context, shard, worker, course, manifest, runnerCommitSha, workerUrl });

  const target = path.join(outputDirectory, "raw", worker.route.id, worker.profile.id);
  await mkdir(target, { recursive: true });
  await Promise.all([
    writeFile(path.join(target, "worker-context.json"), contextBytes),
    writeFile(path.join(target, "shard-manifest.json"), shardBytes),
    ...shard.reports.flatMap((report) => {
      const htmlPath = report.jsonPath.replace(/\.report\.json$/, ".report.html");
      return [
        fetchFile(`${shardBase}/${report.jsonPath}`, `${worker.branch} ${report.jsonPath}`)
          .then((bytes) => writeFile(path.join(target, report.jsonPath), bytes)),
        fetchFile(`${shardBase}/${htmlPath}`, `${worker.branch} ${htmlPath}`)
          .then((bytes) => writeFile(path.join(target, htmlPath), bytes)),
      ];
    }),
  ]);

  return {
    branch: worker.branch,
    routeId: worker.route.id,
    profile: worker.profile.id,
    workerDeployId: worker.deploy.id,
    workerDeployUrl: workerUrl,
    reportCount: shard.reports.length,
  };
}

async function listSiteDeploys(siteId) {
  const { stdout } = await execFileAsync(
    "npx",
    ["netlify", "api", "listSiteDeploys", "--data", JSON.stringify({ site_id: siteId })],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

export async function collectNetlifyWorkers({
  siteId,
  siteName,
  runnerCommitSha,
  course,
  outputDirectory,
  manifest,
}) {
  const expectedRuns = expectedRunCount(course.mode, manifest);
  const deploys = await listSiteDeploys(siteId);
  const workers = selectWorkerDeploys({ deploys, manifest, runnerCommitSha });
  await mkdir(outputDirectory, { recursive: true });
  const collected = [];
  for (const worker of workers) {
    collected.push(await collectWorker({
      worker,
      siteName,
      outputDirectory,
      course,
      manifest,
      runnerCommitSha,
    }));
  }

  const inventory = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    workerSiteId: siteId,
    workerSiteName: siteName,
    runnerCommitSha,
    course,
    routeManifestVersion: manifest.manifestVersion,
    lighthouseVersion: lighthousePackage.version,
    expectedWorkers: manifest.routes.length * manifest.profiles.length,
    expectedReports: manifest.routes.length * manifest.profiles.length * expectedRuns,
    workers: collected,
  };
  await writeFile(path.join(outputDirectory, "netlify-worker-inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);

  const report = await aggregateReports({
    inputDirectory: path.join(outputDirectory, "raw"),
    outputDirectory: path.join(outputDirectory, "combined"),
    mode: course.mode,
    commitSha: course.commitSha,
    deployUrl: course.deployUrl,
    releaseId: course.releaseId,
    manifest,
    baselinePath: course.baselinePath || null,
  });
  return { inventory, report };
}

async function main() {
  const args = parseArgs();
  const manifest = await readManifest(args.manifest);
  const result = await collectNetlifyWorkers({
    siteId: requireArg(args, "site-id"),
    siteName: requireArg(args, "site-name"),
    runnerCommitSha: requireArg(args, "runner-commit-sha"),
    course: {
      mode: requireArg(args, "mode"),
      commitSha: requireArg(args, "course-commit-sha"),
      deployUrl: requireArg(args, "course-deploy-url"),
      releaseId: requireArg(args, "course-release-id"),
      baselinePath: args.baseline ? path.resolve(String(args.baseline)) : null,
    },
    outputDirectory: path.resolve(requireArg(args, "output-dir")),
    manifest,
  });
  process.stdout.write(`Collected ${result.inventory.workers.length} Netlify workers and validated ${result.report.sampleCount} reports.\n`);
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
