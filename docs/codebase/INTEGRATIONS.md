# External Integrations

## Core Sections (Required)

### 1) Integration Inventory

| System | Type (API/DB/Queue/etc) | Purpose | Auth model | Criticality | Evidence |
|--------|---------------------------|---------|------------|-------------|----------|
| Target Web Deploy | External HTTP | Running Lighthouse tests on a specific deploy | None / Public HTTPS | High | `run-lighthouse-shard.mjs` |
| Netlify API | CLI/API | Fetching worker logs and deploy artifacts | Managed via Netlify CLI session | Medium (Fallback path) | `collect-netlify-workers.mjs` (`netlify api listSiteDeploys`) |

### 2) Data Stores

| Store | Role | Access layer | Key risk | Evidence |
|-------|------|--------------|----------|----------|
| File System (Local/Artifacts) | Store raw JSON/HTML reports, manifests | `node:fs/promises` | Disk space limits or artifact upload size limits on CI runners | `run-lighthouse-shard.mjs` |

### 3) Secrets and Credentials Handling

- Credential sources: Environment context (Netlify CLI authentication).
- Hardcoding checks: None found. The README explicitly states "never stores an access token in the repository or artifacts."
- Rotation or lifecycle notes: Handled by execution environment (GitHub Actions or Netlify contexts).

### 4) Reliability and Failure Behavior

- Retry/backoff behavior: The system bails out quickly if target URLs or HTTP endpoints fail (`assertRouteAvailable`).
- Timeout policy: [TODO] Implicitly defaults to fetch / Puppeteer limits.
- Circuit-breaker or fallback behavior: None explicitly beyond the top-level CI fallback to Netlify mentioned in README.

### 5) Observability for Integrations

- Logging around external calls: Status messages printed to stdout when Lighthouse shards complete.
- Metrics/tracing coverage: The entire tool *is* an observability tool, producing deep Lighthouse metrics.
- Missing visibility gaps: Network issues during `fetchFile` for Netlify artifacts will simply throw without retries.

### 6) Evidence

- `README.md`
- `performance/scripts/collect-netlify-workers.mjs`
- `performance/scripts/run-lighthouse-shard.mjs`
