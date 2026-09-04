# Architecture

## Core Sections (Required)

### 1) Architectural Style

- Primary style: CI/CD Job Orchestration & Worker/Shard pattern.
- Why this classification: The system orchestrates multiple isolated Lighthouse processes (shards) across distributed environments (GitHub Actions or Netlify branch deploys) and aggregates the results into a final authoritative report.
- Primary constraints: Complete isolation between tests (1 route/profile per shard), immutability of deployments under test, and verifiable identities of workers and target deployments.

### 2) System Flow

```text
[Matrix Generation] -> [Worker Execution (Lighthouse Shards)] -> [Collection/Aggregation] -> [Final Validation Report]
```

1. **Matrix Generation**: `build-matrix.mjs` parses the selected route manifest (e.g., `routes.website.v1.json`) and generates a matrix of required shards.
2. **Worker Execution**: `run-lighthouse-shard.mjs` runs on a single node. It fetches the target deploy URL, verifies the deployment identity, and runs Lighthouse `N` times for a specific route and profile.
3. **Collection**: In Netlify fallback mode, `collect-netlify-workers.mjs` fetches the completed shard outputs from branch deploy URLs.
4. **Aggregation**: `aggregate-release-report.mjs` combines the raw JSON reports, verifies statistical variance, and produces a final validated JSON artifact.

### 3) Layer/Module Responsibilities

| Layer or module | Owns | Must not own | Evidence |
|-----------------|------|--------------|----------|
| `run-lighthouse-shard.mjs` | Spawning Chrome, running Lighthouse, saving raw `.report.json`/`.html` | Aggregating metrics, parsing manifests beyond its single assigned route | `run-lighthouse-shard.mjs` |
| `collect-netlify-workers.mjs` | Querying Netlify API, downloading artifacts, verifying shard identities | Generating Lighthouse metrics | `collect-netlify-workers.mjs` |
| `lib.mjs` | Shared CLI parsing, math (median, variance), manifest reading | Core application logic (Lighthouse execution) | `lib.mjs` |

### 4) Reused Patterns

| Pattern | Where found | Why it exists |
|---------|-------------|---------------|
| Identity Verification | `validate-release-inputs.mjs`, `collect-netlify-workers.mjs` | Ensures that every worker tested the exact same immutable deploy and commit SHA. |

### 5) Known Architectural Risks

- Netlify worker fallback relies heavily on undocumented or specific internal Netlify CDN timing for artifact availability (`collect-netlify-workers.mjs` polls/downloads from URL).
- Using headless Chrome inside CI pipelines is prone to variable CPU scheduling which can affect performance scores and variance.

### 6) Evidence

- `performance/scripts/run-lighthouse-shard.mjs`
- `README.md`
