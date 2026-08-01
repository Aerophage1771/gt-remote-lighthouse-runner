import { assertKnownIds, isMain, parseArgs, readManifest, splitIds } from "./lib.mjs";

export function buildMatrix({ mode, routeIds = [], manifest }) {
  if (!["diagnostic", "baseline", "candidate"].includes(mode)) {
    throw new Error("mode must be diagnostic, baseline, or candidate");
  }
  const knownIds = new Set(manifest.routes.map((route) => route.id));
  assertKnownIds(routeIds, knownIds, "route IDs");
  const selected = routeIds.length
    ? manifest.routes.filter((route) => routeIds.includes(route.id))
    : manifest.routes;
  if (mode !== "diagnostic" && selected.length !== manifest.routes.length) {
    throw new Error("baseline and candidate modes must audit every manifest route");
  }
  const runs = mode === "diagnostic" ? manifest.diagnosticRuns : manifest.authoritativeRuns;
  return {
    include: selected.flatMap((route) => manifest.profiles.map((profile) => ({
      routeId: route.id,
      routePath: route.path,
      profile: profile.id,
      runs,
    }))),
  };
}

async function main() {
  const args = parseArgs();
  const manifest = await readManifest(args.manifest);
  process.stdout.write(JSON.stringify(buildMatrix({
    mode: String(args.mode || "diagnostic"),
    routeIds: splitIds(args.routes),
    manifest,
  })));
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
