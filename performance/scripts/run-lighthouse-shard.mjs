import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import { ReportGenerator } from "lighthouse/report/generator/report-generator.js";
import lighthousePackage from "lighthouse/package.json" with { type: "json" };
import { isMain, parseArgs, readManifest } from "./lib.mjs";
import { validateRemoteMetadata } from "./validate-release-inputs.mjs";

const categories = ["performance", "accessibility", "best-practices", "seo"];

function requireArgument(args, name) {
  const value = args[name];
  if (!value || value === true) throw new Error(`--${name} is required`);
  return String(value);
}

function safeFileSegment(value) {
  if (!/^[a-z0-9-]+$/i.test(value)) throw new Error(`unsafe file segment: ${value}`);
  return value;
}

async function assertRouteAvailable(url) {
  const response = await fetch(url, { redirect: "error", cache: "no-store" });
  if (response.status !== 200) throw new Error(`${url} returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error(`${url} returned ${contentType || "no content type"}, not HTML`);
  }
}

export async function runShard({
  commitSha,
  deployUrl,
  releaseId,
  routeId,
  routePath,
  profile,
  runs,
  outputDirectory,
  manifest,
}) {
  const manifestRoute = manifest.routes.find((route) => route.id === routeId);
  if (!manifestRoute || manifestRoute.path !== routePath) {
    throw new Error(`route ${routeId} does not match manifest ${manifest.manifestVersion}`);
  }
  if (!manifest.profiles.some((entry) => entry.id === profile)) {
    throw new Error(`profile ${profile} is not defined in the route manifest`);
  }
  if (!Number.isInteger(runs) || runs < 1 || runs > manifest.authoritativeRuns) {
    throw new Error(`invalid run count: ${runs}`);
  }

  const identity = {
    commitSha,
    deployUrl,
    releaseId,
    manifestVersion: manifest.manifestVersion,
  };
  await validateRemoteMetadata(identity);

  const targetUrl = new URL(routePath, deployUrl).toString();
  await assertRouteAvailable(targetUrl);
  await mkdir(outputDirectory, { recursive: true });

  const chrome = await chromeLauncher.launch({
    chromeFlags: [
      "--headless",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
    ],
  });

  const reports = [];
  try {
    for (let run = 1; run <= runs; run += 1) {
      const result = await lighthouse(targetUrl, {
        port: chrome.port,
        logLevel: "error",
        output: "json",
        onlyCategories: categories,
        ...(profile === "desktop" ? { preset: "desktop" } : {}),
      });
      if (!result?.lhr) throw new Error(`Lighthouse returned no result for run ${run}`);
      if (result.lhr.runtimeError) {
        throw new Error(`Lighthouse runtime error on run ${run}: ${result.lhr.runtimeError.message}`);
      }
      if (result.lhr.lighthouseVersion !== lighthousePackage.version) {
        throw new Error(`Lighthouse reported ${result.lhr.lighthouseVersion}, expected ${lighthousePackage.version}`);
      }

      const releaseContext = {
        commitSha,
        deployUrl: new URL(deployUrl).origin,
        releaseId,
        routeManifestVersion: manifest.manifestVersion,
        lighthouseVersion: lighthousePackage.version,
        routeId,
        routePath,
        profile,
        run,
      };
      const enriched = { ...result.lhr, releaseContext };
      const prefix = `${safeFileSegment(routeId)}-${safeFileSegment(profile)}-${run}`;
      const jsonPath = path.join(outputDirectory, `${prefix}.report.json`);
      const htmlPath = path.join(outputDirectory, `${prefix}.report.html`);
      await Promise.all([
        writeFile(jsonPath, `${JSON.stringify(enriched)}\n`),
        writeFile(htmlPath, ReportGenerator.generateReport(enriched, "html")),
      ]);
      reports.push({ ...releaseContext, jsonPath: path.basename(jsonPath) });
      process.stdout.write(`Completed ${routeId} ${profile} run ${run}/${runs} with Lighthouse ${lighthousePackage.version}\n`);
    }
  } finally {
    await chrome.kill();
  }

  await writeFile(
    path.join(outputDirectory, "shard-manifest.json"),
    `${JSON.stringify({ identity, routeId, routePath, profile, reports }, null, 2)}\n`
  );
}

async function main() {
  const args = parseArgs();
  const manifest = await readManifest(args.manifest);
  await runShard({
    commitSha: requireArgument(args, "commit-sha"),
    deployUrl: requireArgument(args, "deploy-url"),
    releaseId: requireArgument(args, "release-id"),
    routeId: requireArgument(args, "route-id"),
    routePath: requireArgument(args, "route-path"),
    profile: requireArgument(args, "profile"),
    runs: Number(requireArgument(args, "runs")),
    outputDirectory: path.resolve(requireArgument(args, "output-dir")),
    manifest,
  });
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
