# SQL backend code: follow-up implementation

Date: 2026-10-14. The user requested backend code without supplying SQL credentials. This authorizes code preparation; it does not establish a backup or permit an unvalidated production cutover.

## Delivered code

- Provider selection wired into `server.js`, all 27 `models.js` exports and the three service-owned models for photos, feedback and event reports. MongoDB remains the default and the actual `.env` was not changed.
- SQL client dependency (`mssql`), environment validation, bounded pool, verified TLS defaults, readiness gate, SQL transactions, transaction-owned write lock, optimistic row versions, duplicate error mapping and fail-closed SQL connection behavior.
- Versioned DDL generator and `database/migrations/001-platform.sql` for all 30 models, primary/unique keys, scalar indexes/checks, sparse presence flags, supported partial indexes and relational FKs. Global club scope and historical deleted-supervisor reviews are handled explicitly.
- Existing application model calls routed through a supported-operation compatibility adapter. SQL executes filters/counts/sorts and stores each model in its own table, with typed scalar columns and a full BSON Extended JSON payload. Arrays remain ordered JSON rather than being destructively flattened. Mongoose supplies schema validation, not Mongo persistence in SQL mode.
- Explicit export/dry-run/schema/import/validation tools, immutable source fingerprints, per-record transactional migration ledger, resumable matching-source import, source/target reconciliation and report-before-readiness gating. No source deletes or target overwrites.
- External scheduler command for SQL TTL cleanup. Mongo seeding is rejected in SQL mode; HTTP startup never applies DDL/imports or rewrites migrated workflows.
- Configuration example, staging instructions, backup requirements, rollback and known limitations in [database/README.md](../../database/README.md).

This revises the initial design preference to rewrite every domain caller into new repository interfaces: an isolated compatibility adapter preserves the existing business/authentication call sites while handling only the operations observed in this application. Unsupported operations fail explicitly. The implementation uses hybrid relational/JSON tables rather than a fully normalized redesign of embedded arrays.

## Validation evidence

- Existing tests after provider wiring: **167 passed, 0 failed**.
- Final complete suite after reconciliation and maintenance-script fixes: **188 passed, 0 failed, 1 skipped** (189 total).
- SQL-specific tests including numeric-driver reconciliation: **21 passed, 0 failed, 1 skipped**.
- Real SQL integration test is skipped until explicitly enabled against an isolated configured SQL target. It covers CRUD, uniqueness, token consumption, relationship metadata and preserved supervisor history in a rollback-only transaction.
- Frontend checks passed: 43 HTML files, 60 external scripts, 6 inline scripts, 598 local asset references. No UI redesign or route changes.
- Offline SQL schema generation succeeded; source inventory regenerated with 30 models, 539 schema paths and 234 source files. No DDL was executed.
- `git diff --check` passed. The pre-existing change to `data/event-views.json` remains outside this task.

## What is not proven or completed

No SQL Server connection, real DDL execution, real source export/import, data reconciliation, backup recovery or full feature parity against SQL Server has been performed. No SQL credentials were invented and no production traffic was switched. Generated SQL and driver semantics still need real-server testing.

Complex reporting/media aggregations run after SQL filtering in Node. The subsequent [provider parity work](PARITY.md) removes the initial 20,000-row cutoff using backpressured streaming and incremental aggregation, and aligns cache normalization/projections/query casting. The global write lock and large report outputs require throughput/memory measurement. Indexed-string bounds, unsupported BSON, unexplained live indexes/validators and orphaned relationships block rather than silently alter data. Windows/managed identity authentication, automatic SQL backup provisioning and a reverse data importer are not implemented. See the README for exact operational requirements.

## Changed-file groups

| Files | Purpose |
| --- | --- |
| `database/*.js` | Connection/provider/schema/catalog/query/model/value layers. |
| `database/migrations/001-platform.sql` | Generated offline versioned schema. |
| `database/README.md`, `database/sqlserver.env.example` | Implemented configuration, execution, limitations and recovery instructions. |
| `scripts/sqlserver-*.cjs` | Explicit schema generation, migration workflow and expiry cleanup. |
| `models.js`, `server.js`, three model-owning services | Connect existing backend operations to the selected provider. |
| `seed.js`, Mongo backup/restore scripts, Security Office reset script | Reject Mongo-only maintenance in SQL mode; use the selected provider for account resets. |
| `package.json`, `package-lock.json` | SQL client and migration/test commands. |
| `tests/sqlserver*.test.js` | Offline contracts/error/transaction tests plus opt-in SQL integration test. |
| `docs/database-migration/*`, offline audit script | Source/schema mapping and audit/validation evidence. |
