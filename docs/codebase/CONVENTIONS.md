# Coding Conventions

## Core Sections (Required)

### 1) Naming Rules

| Item | Rule | Example | Evidence |
|------|------|---------|----------|
| Files | kebab-case with `.mjs` | `collect-netlify-workers.mjs` | `performance/scripts/` |
| Functions/methods | camelCase | `collectNetlifyWorkers`, `buildMatrix` | `collect-netlify-workers.mjs` |
| Types/interfaces | N/A (Plain JS) | N/A | N/A |
| Constants/env vars | SCREAMING_SNAKE_CASE | `CHROME_PATH`, `NODE_VERSION` | `run-lighthouse-shard.mjs`, `netlify.toml` |

### 2) Formatting and Linting

- Formatter: [TODO] No explicit config found.
- Linter: [TODO] No explicit config found.
- Most relevant enforced rules: None explicitly configured in standard config files.
- Run commands: [TODO]

### 3) Import and Module Conventions

- Import grouping/order: Node builtin modules first (`node:fs`, `node:path`), followed by external NPM modules (`lighthouse`), followed by relative internal modules.
- Alias vs relative import policy: Relative imports are strictly used for internal code, and must include `.mjs` extension.
- Public exports/barrel policy: Explicit named exports (`export async function...`).

### 4) Error and Logging Conventions

- Error strategy by layer: Explicit throw of standard `Error` with descriptive message string if validation fails (e.g. `throw new Error("--mode is required")`).
- Logging style and required context fields: Minimal logging to `process.stdout` using `process.stdout.write(...)` or `console.error` at the CLI entry point layer.
- Sensitive-data redaction rules: [TODO]

### 5) Testing Conventions

- Test file naming/location rule: Stored in `tests/` directory with `.test.mjs` extension.
- Mocking strategy norm: Favors integration/unit testing with real inputs or minimal inline mock data rather than extensive stubbing.
- Coverage expectation: [TODO] Not defined.

### 6) Evidence

- `performance/scripts/lib.mjs`
- `performance/scripts/run-lighthouse-shard.mjs`
- `tests/release-runner.test.mjs`
