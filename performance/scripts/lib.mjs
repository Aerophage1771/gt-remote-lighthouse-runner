import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function isMain(url) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(url);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) throw new Error(`unexpected argument: ${current}`);
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function readManifest(file) {
  return readJson(path.resolve(file || path.join(projectRoot, "performance/routes.v1.json")));
}

export function splitIds(value) {
  if (!value || value === true) return [];
  return String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

export function assertKnownIds(ids, known, label) {
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`unknown ${label}: ${unknown.join(", ")}`);
}

export function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function variance(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return round(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

export function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
