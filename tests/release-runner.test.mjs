import test from "node:test";
import assert from "node:assert/strict";
import { readManifest } from "../performance/scripts/lib.mjs";
import { buildMatrix } from "../performance/scripts/build-matrix.mjs";
import { validateReleaseIdentity } from "../performance/scripts/validate-release-inputs.mjs";
import { selectWorkerDeploys } from "../performance/scripts/collect-netlify-workers.mjs";

test("authoritative matrix contains sixteen isolated workers and eighty samples", async () => {
  const manifest = await readManifest();
  const matrix = buildMatrix({ mode: "baseline", manifest });
  assert.equal(matrix.include.length, 16);
  assert.equal(matrix.include.reduce((sum, worker) => sum + worker.runs, 0), 80);
  assert.equal(new Set(matrix.include.map((worker) => `${worker.routeId}:${worker.profile}`)).size, 16);
});

test("website manifest preserves the eight-route eighty-sample release gate", async () => {
  const manifest = await readManifest("performance/routes.website.v1.json");
  const matrix = buildMatrix({ mode: "candidate", manifest });
  assert.equal(manifest.manifestVersion, "2026-08-01.1");
  assert.equal(matrix.include.length, 16);
  assert.equal(matrix.include.reduce((sum, worker) => sum + worker.runs, 0), 80);
  assert.deepEqual(
    manifest.routes.map((route) => route.path),
    [
      "/",
      "/programs",
      "/methodology",
      "/blog",
      "/blog/lsat-score-plateau",
      "/blog/rc-question-type-map",
      "/resources/rc-question-type-map",
      "/login",
    ],
  );
});

test("diagnostic mode uses one sample and accepts selected routes", async () => {
  const manifest = await readManifest();
  const matrix = buildMatrix({ mode: "diagnostic", routeIds: ["home"], manifest });
  assert.equal(matrix.include.length, 2);
  assert.ok(matrix.include.every((worker) => worker.runs === 1));
});

test("immutable release identity rejects mutable deploy aliases", async () => {
  assert.throws(() => validateReleaseIdentity({
    commitSha: "a".repeat(40),
    deployUrl: "https://deploy-preview-1--example.netlify.app",
    releaseId: "abc123",
    manifestVersion: "v1",
  }), /mutable Deploy Preview alias/);
});

test("immutable release identity accepts deploy ID permalink", async () => {
  const url = validateReleaseIdentity({
    commitSha: "a".repeat(40),
    deployUrl: "https://abc123--example.netlify.app",
    releaseId: "abc123",
    manifestVersion: "v1",
  });
  assert.equal(url.origin, "https://abc123--example.netlify.app");
});

test("Netlify collector requires one ready deploy for every isolated worker", async () => {
  const manifest = await readManifest();
  const runnerCommitSha = "b".repeat(40);
  const deploys = manifest.routes.flatMap((route) =>
    manifest.profiles.map((profile, index) => ({
      id: `${route.id}-${profile.id}`,
      branch: `lh-${route.id}-${profile.id}`,
      commit_ref: runnerCommitSha,
      state: "ready",
      created_at: `2026-07-31T00:00:${String(index).padStart(2, "0")}Z`,
    })),
  );

  const selected = selectWorkerDeploys({ deploys, manifest, runnerCommitSha });
  assert.equal(selected.length, 16);
  assert.equal(new Set(selected.map((worker) => worker.branch)).size, 16);
});

test("Netlify collector rejects a worker that did not finish successfully", async () => {
  const manifest = await readManifest();
  const runnerCommitSha = "b".repeat(40);
  const deploys = manifest.routes.flatMap((route) =>
    manifest.profiles.map((profile) => ({
      id: `${route.id}-${profile.id}`,
      branch: `lh-${route.id}-${profile.id}`,
      commit_ref: runnerCommitSha,
      state: route.id === "home" && profile.id === "mobile" ? "error" : "ready",
      created_at: "2026-07-31T00:00:00Z",
    })),
  );

  assert.throws(
    () => selectWorkerDeploys({ deploys, manifest, runnerCommitSha }),
    /lh-home-mobile is error, expected ready/,
  );
});
