# Codebase Structure

## Core Sections (Required)

### 1) Top-Level Map

| Path | Purpose | Evidence |
|------|---------|----------|
| `performance/scripts/` | Main application logic for the runner | `package.json` scripts |
| `performance/` | Route manifest JSON files | `README.md` |
| `tests/` | Test suite | `package.json` |
| `.github/workflows/` | CI/CD orchestrator workflows | `tests/release-runner.test.mjs` |

### 2) Entry Points

- Main runtime entry: Multiple CLI script entry points defined in `package.json`.
- Secondary entry points:
  - `performance/scripts/build-matrix.mjs`
  - `performance/scripts/validate-release-inputs.mjs`
  - `performance/scripts/run-lighthouse-shard.mjs`
  - `performance/scripts/aggregate-release-report.mjs`
  - `performance/scripts/collect-netlify-workers.mjs`
  - `performance/scripts/run-netlify-worker.mjs`
- How entry is selected: Invoked via `npm run <script>` in CI (GitHub Actions or Netlify).

### 3) Module Boundaries

| Boundary | What belongs here | What must not be here |
|----------|-------------------|------------------------|
| `run-lighthouse-shard.mjs` | Isolated Lighthouse execution on a single route/profile | Orchestration or aggregation logic across multiple routes |
| `collect-netlify-workers.mjs`| Netlify-specific worker retrieval logic | Raw Lighthouse execution logic |
| `aggregate-release-report.mjs`| Merging metrics from multiple shards | Worker deployment or retrieval logic |

### 4) Naming and Organization Rules

- File naming pattern: kebab-case with `.mjs` extensions for ESM modules (e.g., `run-lighthouse-shard.mjs`).
- Directory organization pattern: Domain-based (`performance/scripts`, `tests`).
- Import aliasing or path conventions: Relative imports with explicit `.mjs` extensions (`import { isMain } from "./lib.mjs"`).

### 5) Evidence

- `package.json`
- `performance/scripts/lib.mjs`
- `tests/release-runner.test.mjs`
