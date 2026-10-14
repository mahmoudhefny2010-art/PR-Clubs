# Stage 1 validation and changed-file summary

Date: 2026-10-14. This is offline validation, not a successful database migration.

Follow-up SQL backend implementation and current validation are documented in [IMPLEMENTATION.md](IMPLEMENTATION.md). The stage 1 entries below are historical; runtime files were subsequently changed at the user's explicit request for offline backend code. No production database migration or cutover has occurred.

## Results

- `node --test tests/*.test.js`: **167 passed, 0 failed, 0 skipped** before changes. Existing suite uses schema validation, service fixtures, source inspection and mocked persistence; it does not establish production database or SQL Server feature parity.
- Repeated the suite after stage 1: **167 passed, 0 failed, 0 skipped**.
- `npm.cmd run check:frontend`: passed; verified CSS/assets and 43 HTML files, 60 external scripts, 6 inline scripts and 598 local asset references. Used `npm.cmd` because PowerShell execution policy prevents invoking `npm.ps1`.
- Repeated offline inventory generation with identical totals; `git diff --check` passed for tracked changes. New audit files contain no environment values or database exports.
- `node scripts/audit-database-migration.cjs`: completed without database credentials, dotenv or server startup; generated 30 models, 539 nested/top-level fields, 221 source files and 245 route/middleware candidates. Static route candidates include mocks/tests and registrations through variables; review file/line references rather than interpreting this count as the number of production endpoints.
- Live MongoDB collections/indexes/data quality: **not verified**.
- Backup artifact, decryption, consistency and isolated restore: **not verified; source defects recorded in PLAN.md**.
- SQL Server connectivity, DDL, import, reconciliation and end-to-end SQL behavior: **not run**.
- Production traffic: no switch performed. Original database: no write, overwrite, delete or restore performed.

## Changed files

| File | Purpose |
| --- | --- |
| `scripts/audit-database-migration.cjs` | Repeatable offline schema/source inventory; reads declared models without importing the server, reading environment values or connecting to a database. |
| `docs/database-migration/inventory.json` | Machine-readable field defaults/validators, indexes, source references, environment names and dependency candidates. |
| `docs/database-migration/FIELD-MAPPING.md` | All declared collections and field-level proposed SQL mappings, with declared indexes. |
| `docs/database-migration/PLAN.md` | Architecture audit, compatibility risks, relational plan, backup gate, staged implementation/import/test design, proposed environment settings, rollback and unresolved prerequisites. |
| `docs/database-migration/VALIDATION.md` | Results, limitations and changed-file summary. |

No runtime application, frontend, dependencies, secrets or database connection settings were changed. The user's existing `data/event-views.json` modification is outside these changes.
