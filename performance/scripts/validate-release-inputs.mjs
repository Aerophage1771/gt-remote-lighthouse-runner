import { isMain, parseArgs, readManifest } from "./lib.mjs";

export function validateReleaseIdentity({ commitSha, deployUrl, releaseId, manifestVersion }) {
  if (!/^[a-f0-9]{40}$/i.test(commitSha || "")) {
    throw new Error("commit SHA must contain exactly 40 hexadecimal characters");
  }
  if (!/^[a-z0-9-]+$/i.test(releaseId || "")) {
    throw new Error("release ID contains unsupported characters");
  }
  const url = new URL(deployUrl);
  if (url.protocol !== "https:") throw new Error("deploy URL must use HTTPS");
  if (!url.hostname.endsWith(".netlify.app")) {
    throw new Error("authoritative testing requires a Netlify deploy permalink");
  }
  if (url.hostname.startsWith("deploy-preview-")) {
    throw new Error("a mutable Deploy Preview alias is not an immutable deploy URL");
  }
  if (!url.hostname.startsWith(`${releaseId.toLowerCase()}--`)) {
    throw new Error("deploy URL host must begin with the exact Netlify deploy ID");
  }
  if (!manifestVersion) throw new Error("route manifest version is required");
  return url;
}

export async function validateRemoteMetadata(identity, fetchImplementation = fetch) {
  const deploy = validateReleaseIdentity(identity);
  const response = await fetchImplementation(new URL("/release-meta.json", deploy), {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`release metadata returned HTTP ${response.status}`);
  const metadata = await response.json();
  const expected = {
    commitSha: identity.commitSha,
    deployUrl: deploy.origin,
    releaseId: identity.releaseId,
    routeManifestVersion: identity.manifestVersion,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (metadata[key] !== value) {
      throw new Error(`release metadata mismatch for ${key}: expected ${value}, received ${metadata[key]}`);
    }
  }
  return metadata;
}

async function main() {
  const args = parseArgs();
  const manifest = await readManifest(args.manifest);
  const metadata = await validateRemoteMetadata({
    commitSha: args["commit-sha"],
    deployUrl: args["deploy-url"],
    releaseId: args["release-id"],
    manifestVersion: manifest.manifestVersion,
  });
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
