import test from "node:test";
import assert from "node:assert/strict";
import { readManifest } from "../performance/scripts/lib.mjs";
import { buildMatrix } from "../performance/scripts/build-matrix.mjs";
import { validateReleaseIdentity } from "../performance/scripts/validate-release-inputs.mjs";

test("authoritative matrix contains sixteen isolated workers and eighty samples", async () => {
  const manifest = await readManifest();
  const matrix = buildMatrix({ mode: "baseline", manifest });
  assert.equal(matrix.include.length, 16);
  assert.equal(matrix.include.reduce((sum, worker) => sum + worker.runs, 0), 80);
  assert.equal(new Set(matrix.include.map((worker) => `${worker.routeId}:${worker.profile}`)).size, 16);
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
