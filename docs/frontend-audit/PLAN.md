# Frontend preservation and cleanup plan

Baseline: `9bd35a9dd8ac58ff7827462c813be6ebbf68d15b`, branch `feature/site-analytics-and-dashboard-updates`. The working tree was clean before this audit. There were 86 tracked files, including 63 frontend source/image files. `baseline.json` records every tracked file's size and SHA-256, HTML dependency order, inline-block hashes, and literal API references. No credentials or data records are copied into the report.

## Constraints

- Preserve rendered markup, text, CSS declarations and their order, JavaScript execution order and scope, routes, request bodies, authentication, and existing features.
- Freeze `server.js`, `models.js`, `api/`, `seed.js`, `dev.js`, `scripts/`, `data/`, dependencies, lockfile, Vercel configuration, and existing business documents.
- Do not start the application server for this audit. Its MongoDB initialization can create indexes and update records. Preview through a separate loopback-only test server with synthetic API fixtures; no production or local database access.
- Keep the protected admin scripts in their protected HTML pages. Do not expose those scripts through new public asset URLs.
- Preserve the small synchronous authentication guard before the homepage renders, existing inline handlers, and the small content-studio initializer.

## Stages and acceptance gates

1. **Inventory and baseline.** Map all first-party files and relationships, record the existing test failure, preserve a frontend copy on D:, build an isolated browser comparison harness, and capture light/dark desktop/mobile baselines.
2. **Styles.** Move public-page style blocks into page stylesheets at exactly the same positions. Reuse a single stylesheet only for proven identical blocks (four content forms, two password recovery pages). Require exact reconstruction of each original style block and unchanged markup outside replacements. Only whitespace after the last declaration/statement is normalized to a final newline in extracted assets and restored by the reconstruction test. Run source, dependency, syntax, and browser comparisons before continuing.
3. **Scripts.** Move seven substantial public-page scripts into `public/assets/js/pages/`, preserving their statements, global scope, script position, and blocking/deferred behavior. Require exact reconstruction and unchanged API references, with the same trailing-whitespace normalization as styles. Repeat browser and interaction comparisons. Do not convert the mutually dependent homepage scripts to modules or change async sequencing.
4. **Verification and handoff.** Replace the obsolete hash-only structure test with dependency and syntax checks that can run without the backend. Verify every protected file against the baseline. Review screenshots, document exact changes and performance tradeoffs, and record any pre-existing or unverified issues.

Performance claims will be limited to measurable code deduplication and reusable external assets. Externalization adds cold-load requests; it is not evidence of a faster first visit without a production network benchmark. No deployment is part of this cleanup task.
