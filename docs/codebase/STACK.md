# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area | Value | Evidence |
|------|-------|----------|
| Primary language | JavaScript (ES Modules) | `package.json` (`"type": "module"`) |
| Runtime + version | Node.js >=22.19.0 | `package.json` (`engines`), `netlify.toml` (`NODE_VERSION`) |
| Package manager | npm | `package-lock.json`, `netlify.toml` (`npm test`) |
| Module/build system | ES Modules, no explicit build step | `package.json`, `.mjs` extensions |

### 2) Production Frameworks and Dependencies

| Dependency | Version | Role in system | Evidence |
|------------|---------|----------------|----------|
| lighthouse | 13.4.1 | Core measurement tool | `package.json` |
| puppeteer | 24.8.2 | Headless browser for Lighthouse | `package.json` |
| chrome-launcher | 1.2.1 | Chrome process management | `package.json` |

### 3) Development Toolchain

| Tool | Purpose | Evidence |
|------|---------|----------|
| node:test | Unit & Integration testing | `tests/release-runner.test.mjs`, `package.json` (`npm test`) |
| [TODO] | Linting and formatting | No explicit config found in repository |

### 4) Key Commands

```bash
npm install
npm test
npm run matrix
npm run shard -- ...
npm run collect:netlify -- ...
npm run validate -- ...
```

### 5) Environment and Config

- Config sources: `.github/workflows/remote-lighthouse.yml`, `netlify.toml`, `performance/routes.v1.json`, `performance/routes.website.v1.json`
- Required env vars: `CHROME_PATH` (optional override), Netlify CLI authentication (for `collect:netlify`)
- Deployment/runtime constraints: GitHub Actions environments or Netlify branch deploys (`lh-<route-id>-<profile>`).

### 6) Evidence

- `package.json`
- `netlify.toml`
- `README.md`
