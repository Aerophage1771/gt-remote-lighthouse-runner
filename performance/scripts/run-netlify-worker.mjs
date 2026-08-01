import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readManifest } from "./lib.mjs";
import { runShard } from "./run-lighthouse-shard.mjs";

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for a Netlify Lighthouse worker`);
  return value;
}

const branch = requireEnvironment("BRANCH");
const match = branch.match(/^lh-(.+)-(mobile|desktop)$/);
if (!match) throw new Error(`unsupported Lighthouse worker branch: ${branch}`);

const [, routeId, profile] = match;
const manifest = await readManifest(process.env.ROUTE_MANIFEST_PATH);
const route = manifest.routes.find((entry) => entry.id === routeId);
if (!route) throw new Error(`branch ${branch} references unknown route ${routeId}`);

const mode = process.env.LIGHTHOUSE_MODE || "diagnostic";
if (!["diagnostic", "baseline", "candidate"].includes(mode)) {
  throw new Error(`unsupported LIGHTHOUSE_MODE: ${mode}`);
}
const runs = mode === "diagnostic" ? manifest.diagnosticRuns : manifest.authoritativeRuns;
const outputDirectory = path.resolve("release-artifacts/lighthouse", routeId, profile);
await runShard({
  commitSha: requireEnvironment("COURSE_COMMIT_SHA"),
  deployUrl: requireEnvironment("COURSE_DEPLOY_URL"),
  releaseId: requireEnvironment("COURSE_RELEASE_ID"),
  routeId,
  routePath: route.path,
  profile,
  runs,
  outputDirectory,
  manifest,
});

await mkdir("release-artifacts", { recursive: true });
await writeFile(
  "release-artifacts/worker-context.json",
  `${JSON.stringify({
    mode,
    routeId,
    routePath: route.path,
    profile,
    runs,
    courseCommitSha: process.env.COURSE_COMMIT_SHA,
    courseDeployUrl: process.env.COURSE_DEPLOY_URL,
    courseReleaseId: process.env.COURSE_RELEASE_ID,
    routeManifestVersion: manifest.manifestVersion,
    lighthouseVersion: "13.4.1",
    runnerCommitSha: process.env.COMMIT_REF || null,
    netlifyDeployId: process.env.DEPLOY_ID || null,
    netlifyDeployUrl: process.env.DEPLOY_URL || null,
  }, null, 2)}\n`
);
