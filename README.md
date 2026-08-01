# GT Remote Lighthouse Runner

This public repository contains only the generic release-performance harness. It contains no student records, course source, private application code, or credentials.

The workflow provides two remote tiers:

- `diagnostic`: one mobile and one desktop measurement for selected route IDs.
- `baseline` or `candidate`: eight routes, two device profiles, and five measurements per route/profile, for 80 total Lighthouse measurements.

Every worker validates the target site's `/release-meta.json` before measuring. Every raw report records the exact course commit SHA, immutable Netlify deploy URL, Netlify release ID, route manifest version, Lighthouse version, route, profile, and run number.

Candidate mode downloads an earlier baseline artifact by workflow run ID and enforces the versioned thresholds in `performance/routes.v1.json`. Lighthouse is only one production gate. Dashboard, student, Obi, blog, analytics, and exact-deploy reviews remain mandatory in the private release package.

When GitHub-hosted runners are unavailable at the account level, the same shard implementation runs on isolated Netlify branch-deploy workers. Branches use the form `lh-<route-id>-<profile>`. Each Netlify build runs only one route/profile pair and publishes five raw JSON reports, five HTML reports, a shard manifest, and worker identity metadata.
