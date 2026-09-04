# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

- Primary test framework: Node.js native test runner (`node:test`)
- Assertion/mocking tools: `node:assert/strict`
- Commands:

```bash
npm test
```

### 2) Test Layout

- Test file placement pattern: Separate `tests/` folder.
- Naming convention: `*.test.mjs` (e.g. `release-runner.test.mjs`)
- Setup files and where they run: N/A

### 3) Test Scope Matrix

| Scope | Covered? | Typical target | Notes |
|-------|----------|----------------|-------|
| Unit | yes | Data transformations (e.g. building matrix) | Uses static data or local manifests |
| Integration | partial | CI checks/orchestration files | Parses `.github/workflows/remote-lighthouse.yml` |
| E2E | no | Real Lighthouse runner flow | Relies on the user to run the actual scripts in CI environments |

### 4) Mocking and Isolation Strategy

- Main mocking approach: In-memory static objects or file reads. No elaborate test mocking frameworks are used.
- Isolation guarantees: Tests run serially or are functionally pure.
- Common failure mode in tests: Failing to update hardcoded baseline expected lengths when modifying the manifest.

### 5) Coverage and Quality Signals

- Coverage tool + threshold: [TODO] Not currently implemented or enforced.
- Current reported coverage: [TODO]
- Known gaps/flaky areas: Tests are deterministic but only validate orchestration logic, not the Lighthouse runtime interaction.

### 6) Evidence

- `tests/release-runner.test.mjs`
- `package.json`
