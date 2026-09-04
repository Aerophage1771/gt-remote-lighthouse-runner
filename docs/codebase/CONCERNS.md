# Codebase Concerns

## Core Sections (Required)

### 1) Top Risks (Prioritized)

| Severity | Concern | Evidence | Impact | Suggested action |
|----------|---------|----------|--------|------------------|
| Medium | Fragility in Netlify URL formatting / API behavior | `collect-netlify-workers.mjs` uses `netlify api listSiteDeploys` | Changes to Netlify's undocumented branch deploy lifecycle might break the fallback worker | Add explicit e2e test or verification |
| Low | Headless Chrome variability | `run-lighthouse-shard.mjs` running in CI | Variance across runs could falsely fail baseline thresholds | Rely on robust median/variance logic already implemented in `lib.mjs` |

### 2) Technical Debt

| Debt item | Why it exists | Where | Risk if ignored | Suggested fix |
|-----------|---------------|-------|-----------------|---------------|
| Hardcoded GitHub Workflow Path | Quick integration test | `release-runner.test.mjs` | If the file `.github/workflows/remote-lighthouse.yml` moves, the test will fail without checking | Parameterize or accept as an orchestration expectation |

### 3) Security Concerns

| Risk | OWASP category (if applicable) | Evidence | Current mitigation | Gap |
|------|--------------------------------|----------|--------------------|-----|
| Insecure dependencies | A06:2021-Vulnerable and Outdated Components | `package.json` | None. | `package.json` disables audit (`--no-audit`); might want to enable dependency scanning |

### 4) Performance and Scaling Concerns

| Concern | Evidence | Current symptom | Scaling risk | Suggested improvement |
|---------|----------|-----------------|-------------|-----------------------|
| Worker runtime limit | `run-lighthouse-shard.mjs` | Each Lighthouse run takes several seconds | Running 5 sequential runs per shard might exceed standard Netlify worker build times if expanded to 10+ runs | Keep isolated run counts small |

### 5) Fragile/High-Churn Areas

| Area | Why fragile | Churn signal | Safe change strategy |
|------|-------------|-------------|----------------------|
| Manifests | Contains exact expected routes / version paths | [TODO] | Make sure to update tests in `release-runner.test.mjs` when altering manifest configurations |

### 6) `[ASK USER]` Questions

1. [ASK USER] Should we enable ESLint and Prettier for strict formatting/linting given the lack of explicit configurations?
2. [ASK USER] Are there any plans to add test coverage tools (like `c8` or `istanbul`) to enforce coverage metrics?

### 7) Evidence

- `tests/release-runner.test.mjs`
- `performance/scripts/collect-netlify-workers.mjs`
