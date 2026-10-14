# SQL Server backend and migration

The existing Express routes select MongoDB, Microsoft SQL Server or Azure SQL through `DATABASE_PROVIDER`. MongoDB is the default when the setting is absent. The current local `.env` selects SQL Server: the authorized 2026-10-14 transfer into `clubs` imported and verified 296 records and the main site is running on SQL. The original Mongo database was preserved. Azure SQL is implemented but has not been connected or live-verified. See [the completed local migration report](../docs/database-migration/LOCAL-SQL-COMPLETED-2026-10-14.md).

## Choose the database

| `DATABASE_PROVIDER` | Connection profile | Backend/HTTP behavior |
| --- | --- | --- |
| `mongodb` | Existing `MONGO_URI` | Existing Mongoose persistence. |
| `sqlserver` | [sqlserver.env.example](sqlserver.env.example), `SQLSERVER_*` | Microsoft SQL Server, same Express routes and frontend fetch calls. |
| `azuresql` | [azure-sql.env.example](azure-sql.env.example), `AZURE_SQL_*` | Azure SQL Database or compatible Azure SQL Managed Instance endpoint, same SQL persistence/schema/routes. |

Configure the selected profile privately and restart the application when switching. Profiles are independent: Azure settings never silently reuse SQL Server credentials. Each SQL target must first receive and validate the intended dataset using the existing migration commands. Switching the provider does not transfer or synchronize records between databases. Preserve the original Mongo source and all existing application signing/media/email settings.

Azure SQL supports `AZURE_SQL_AUTH_MODE=sql` for a SQL login, `entra-default` for the driver's default Microsoft Entra credential chain (including a permitted managed identity), or `entra-service-principal` with `AZURE_SQL_CLIENT_ID`, `AZURE_SQL_TENANT_ID` and protected `AZURE_SQL_CLIENT_SECRET`. Entra modes do not require/forward SQL username/password values. An optional `AZURE_SQL_CLIENT_ID` selects a user-assigned identity in default mode. Provision the corresponding Azure database user/roles and runtime identity separately; the code does not create cloud identities or grant permissions. These modes are validated against the installed driver configuration, not a live Azure tenant.

For Azure, use the actual server hostname only, usually `<server>.database.windows.net`, and a separate port (default 1433); do not paste an entire SSMS/ADO connection string into the host field. Verified TLS is required in all Azure environments. Configure the authorized firewall/private endpoint and DNS/network access for the application and migration host. For SQL Server named instances, set `SQLSERVER_INSTANCE` and omit `SQLSERVER_PORT`; otherwise provide host/port normally.

Azure and SQL Server share the same `sql:schema:apply`, `sql:dry-run`, `sql:import`, `sql:validate` and `sql:cleanup` commands and migration schema. With Azure selected, the target gate requires `AZURE_SQL_MIGRATION_TARGET_DATABASE=AZURE_SQL_DATABASE`; production readiness uses `AZURE_SQL_CUTOVER_APPROVED=true`. The shared empty-schema creation opt-in remains `ALLOW_SQLSERVER_SCHEMA=CREATE_EMPTY_TARGET`. The opt-in integration test command remains `SQLSERVER_INTEGRATION_TESTS=true` for either selected SQL target. Azure SQL Database has no SQL Agent: use an external scheduler for expiry cleanup, and configure/verify Azure-native backup and restore separately.

## How saving works

`server.js` and the 30 exported models use `database/index.js`. Mongo mode returns the original Mongoose models and connection behavior. SQL mode routes the application's supported model operations through `database/models.js`, using the `mssql` client, parameterized SQL predicates and SQL transactions. Mongoose remains a schema casting/validation library in SQL mode; it does not save SQL records to MongoDB. The three models owned by service modules are included.

Each model has its own SQL table, preserved `_id`, typed scalar columns, declared indexes and checked JSON payload. The payload uses BSON Extended JSON to retain mixed Date/ObjectId values, Arabic text, unknown historical fields and embedded-array order. Columns support SQL filtering/constraints; the payload reconstructs the same document responses expected by existing backend code. This deliberately keeps embedded arrays as JSON in this migration phase rather than changing index-based event IDs or flattening arbitrary application answers. It is a compatibility implementation for this application's observed operations, not a general implementation of the MongoDB query language. Unsupported operations fail explicitly.

The generated DDL includes PKs, unique/filtered indexes, enum/range checks, JSON checks, student/account/session/invite foreign keys and conditional club references. Existing `clubId=0` remains global/MIU scope with a NULL internal club reference. Supervisor review actor IDs remain historical data; a separate nullable current-account FK uses `ON DELETE SET NULL`, so deleting a supervisor does not delete/block historical reviews.

Writes run in SQL transactions under one transaction-owned application write lock; updates lock matching rows and enforce a version check. Password-reset token consumption and password/session-version changes share the same transaction. Existing notification/email/upload services continue using the existing routes and validation. SQL startup only loads caches from already validated tables; it never calls the Mongo seeder or startup workflow rewrite routine. `seed.js` and the legacy Mongo backup/restore tools explicitly refuse SQL mode. The Security Office account-reset utility uses the selected provider.

## Configuration and running the current site

See [sqlserver.env.example](sqlserver.env.example). These settings are implemented now. No credentials are required to keep running MongoDB or to generate/review SQL code.

```powershell
npm.cmd start
npm.cmd run sql:schema:generate
npm.cmd run test:sql
npm.cmd run sql:routes:verify
```

For any new target, keep the source provider in service until the SQL/Azure target has been imported and verified. The current local SQL transfer is complete. Preserve the original `MONGO_URI` and signing/Google/email/Cloudinary/OneSignal secrets. SQL logins and the documented Azure Entra modes are implemented; Windows integrated authentication is not implemented. The selected SQL database requires compatibility level 130 or newer. TLS verification is on by default, mandatory in production, and mandatory for Azure in all environments.

## Migration prerequisites

1. A consistent MongoDB backup and a successful restore to a **different isolated database**. Freeze that restored source against writes. Use native/provider recovery tools; the older repository restore utility has the defects recorded in the audit and is not used by this migration.
2. A genuinely empty SQL target with its exact name set both as `SQLSERVER_DATABASE` and `SQLSERVER_MIGRATION_TARGET_DATABASE`. Configure the protected SQL credentials separately from production.
3. A private persistent artifact directory **outside this repository**, encrypted/restricted by the host administrator. CLI-created exports/reports are private plaintext Extended JSON files and contain credentials/hashes/student data from the database. File mode 0600 is requested, but Windows NTFS ACLs and storage encryption must be configured on the host. They are never written under `public/` or committed. Do not share these artifacts in chat.
4. A backup evidence JSON file in that directory. Record real identifiers and restore evidence, for example these field names:

```json
{
  "backupId": "ACTUAL_BACKUP_IDENTIFIER",
  "sourceDatabase": "ACTUAL_ORIGINAL_DATABASE_NAME",
  "restoredDatabase": "ACTUAL_ISOLATED_RESTORE_DATABASE_NAME",
  "isolatedRestoreVerifiedAt": "ACTUAL_ISO_TIMESTAMP"
}
```

The CLI checks presence/identity; an evidence file is an operator attestation, not independent proof of a backup. Keep the actual restore drill, checksums, indexes, media recovery coverage and recovery-time evidence with it. No credentials or backup evidence are invented by the code.

## Explicit migration commands

Set the migration environment values shown in the example on the trusted migration host; use `NODE_ENV` other than production. Configure `MIGRATION_SOURCE_URI` as a read-only URI to the restored database, `MIGRATION_SOURCE_IS_ISOLATED_RESTORE=true`, artifact paths and evidence path. Do not use production application startup as an extractor.

```powershell
# Writes a new private source export. Refuses an existing export file.
npm.cmd run sql:export

# Offline preflight: no SQL connection required.
# Choose a new MIGRATION_REPORT_FILE for each command.
npm.cmd run sql:dry-run

# Explicit empty-target schema creation; requires ALLOW_SQLSERVER_SCHEMA.
npm.cmd run sql:schema:apply

# Only after preflight passes. Target is not enabled while import is incomplete.
npm.cmd run sql:import

# Independently rechecks the source and target.
npm.cmd run sql:validate
```

Source export captures all declared collections plus actual collection/index metadata, rejects unmapped extra collections and requires a verified isolated source identity. Preflight checks current schema validation, explicit missing/null values, duplicate `_id` and unique keys, references, ordered data, SQL key lengths, integer safety, finite numbers, dates, supported BSON types and unexplained live indexes/validators. It never silently picks a duplicate, truncates strings, fabricates a parent or drops an unknown field. Unsupported data remains in the original/export and blocks import.

The importer inserts records in the export's parent-first order, one atomic record+ledger transaction at a time. Only a matching immutable source fingerprint can resume. Already committed rows are hash-checked; changed/existing target rows are conflicts, not overwritten. A failure may leave verified committed batches in isolated staging, but leaves the target unvalidated; rerun the same source to resume. A new source needs a new empty target. Final reconciliation checks counts, per-ID full-content hashes, scalar/payload agreement and enabled constraints before recording readiness. A repeated identical completed import performs verification without rewriting data. A failed import/validation emits a private report when preflight completed; a malformed export/configuration fails before target writes. Existing artifacts are never overwritten.

## Staging and production gating

After reconciliation succeeds, select `DATABASE_PROVIDER=sqlserver` or `DATABASE_PROVIDER=azuresql` in the isolated staging application's environment, then run the existing feature tests and real SQL tests. `SQLSERVER_INTEGRATION_TESTS=true` enables the opt-in database test for the selected SQL target; it uses a transaction that is rolled back. Test every authentication role, password lifecycle, club/application/content workflows, attendance, reports, uploads and external side effects in staging. An import hash match does not prove feature parity.

The backend refuses SQL tables without a validated migration marker. Production additionally requires the selected profile's flag (`SQLSERVER_CUTOVER_APPROVED=true` or `AZURE_SQL_CUTOVER_APPROVED=true`); this is an explicit deployment flag, **not a substitute for backup and feature QA**. No script sets it or switches production traffic. The final write freeze/delta reconciliation and cutover are still operator-controlled steps.

## Same routes, fetching and saved-data contracts

All three providers use the same Express application and the same frontend. The offline route check registers MongoDB, SQL Server and Azure SQL in isolated child processes with database connections disabled and compares actual method/path/router registrations. It currently verifies **195 identical registrations** across all three; evidence is in `docs/database-migration/provider-routes.json`. No SQL-specific frontend URLs or fetch functions are needed. Runtime cache normalization is shared so migrated legacy club sorting, pinning, roles and committees are interpreted identically.

One application process uses one selected provider. Existing records become the SQL dataset through the explicit export/import/reconciliation workflow, preserving IDs and relationships. Selecting a provider alone does not transfer records or synchronize subsequent writes across two independent databases.

Use `npm.cmd run sql:api:compare` after both isolated staging apps serve the same validated export. Configure `API_PARITY_STAGING_CONFIRMED=true`, `API_PARITY_MONGO_ORIGIN` and `API_PARITY_SQL_ORIGIN` to different staging HTTP(S) origins. The default public cases are in `database/api-parity.example.json`; a private `API_PARITY_CASES_FILE` can list authenticated routes and actual existing IDs. Supply role-appropriate cookies separately using `API_PARITY_MONGO_COOKIE` and `API_PARITY_SQL_COOKIE`, and run a separate comparison for each identity/role. Optional `API_PARITY_REPORT_FILE` must be an absolute new file outside this project.

The comparer issues GET requests only and checks expected status plus JSON contents, preserving array order, leading zeros, record IDs and field values while ignoring object-key serialization order. Explicit `ignoreFields` may omit volatile fields such as `checkedAt`; no fields are ignored by default. It rejects two matching 503 outages, redirected login HTML, self-comparison and cross-origin case paths as proof of successful parity. Reports contain case numbers/statuses/match flags, not cookies, student data, response values or URLs. This verifies listed read contracts; registration, password changes, approvals, attendance and other writes still require isolated integration tests and reconciliation.

Schedule `npm.cmd run sql:cleanup` on an external trusted scheduler to reproduce the six TTL collections' expiry cleanup (visitor presence, email codes, login attempts, recovery tokens/rate limits and CV upload grants). It only deletes already expired rows in declared TTL tables. Never use an in-process timer on Vercel for this job. Existing authorization checks still evaluate expiry in requests.

## Known limitations requiring staging verification

### Public page notifications

SQL Server and Azure SQL now serve `/api/site/public-data-stream` through the
same browser SSE/cache contract as MongoDB. Four transaction-bound triggers
advance the two public dataset revisions for club, application, university
content and feedback writes, including deletes and bulk SQL statements. A
rolled-back write also rolls back its notification revision. Unchanged datasets
are reused from browser storage; no public-list polling runs in the browser.

Mongo uses native change streams. SQL/Azure instead check one committed metadata
row on the server every three seconds while a visitor's SSE connection is open.
This is a behavioral compatibility implementation, not identical database
notification infrastructure or a zero-polling SQL push provider. It works across
application instances without SQL Agent, Service Broker or an external account.

Fresh `sql:schema:apply` includes the notification schema. An older isolated SQL
target needs `node scripts/sqlserver-live-schema.cjs --apply`, with the existing
matching target gate. This additive migration creates only the revision table
and four application-owned triggers; it does not import records or enable
production cutover. Runtime readiness verifies the revision row and enabled
triggers. The generated additive SQL is `migrations/002-public-live.sql`.

Offline tests cover schema generation, revision precision, cache resume,
dataset-specific notifications, missing schema and readiness gates. The opt-in
real SQL tests also verify trigger increments and rollback. They have not been
run during the initial offline implementation. The subsequent local SQL
transfer passed both real SQL integration tests and the public HTTP comparison;
see the completed migration report. Azure credentials and live verification
remain outstanding.

- The initial implementation was offline. The local SQL transfer now verifies real DDL/import, reconciliation, public response parity and rollback integration behavior. Azure execution and every authenticated role/UI flow still need separate staging coverage.
- Complex existing aggregation expressions run in the Node compatibility layer after SQL filtering through a backpressured SQL row stream. The former 20,000-row cutoff is removed; grouping keeps accumulators and response data rather than all input documents. Sorting, large distinct sets and reports returning individual people still require memory proportional to their result data. Benchmark these queries in staging and consider dedicated SQL reporting queries for measured bottlenecks. Ordinary filtering/counting/sorting runs in SQL, and large homogeneous ID/string/number membership lists use one JSON parameter to avoid SQL parameter-count limits.
- The global write lock favors correct legacy multi-model workflows over write throughput; benchmark against university traffic before considering finer lock partitioning.
- Indexed strings use reviewed default bounds (typically 254 UTF-16 code units); overlong keys and trailing-space indexed values block migration/writes for explicit handling. Sparse absent/null distinctions are preserved with presence columns. Other unsupported BSON types (including Decimal128/Binary) block rather than silently convert.
- JSON role assignments and polymorphic historical/event links do not all have native FKs. Import checks nested club scopes; existing domain guards still enforce runtime scope. Production data profiling must resolve any additional relationship rules.
- Historical source data that fails current validation or has extra indexes/validators needs an explicit reviewed migration mapping. No automatic cleanup has been applied.
- The existing backup worker is Mongo-only. After cutover, university administrators must configure SQL Server backups and verify SQL restore procedures, along with Cloudinary media recovery.

## Rollback

Before cutover, leave MongoDB selected and preserve the original database; discard no source records. No live restoration is needed.

After SQL cutover and before SQL receives new writes, restore the pinned MongoDB deployment/provider and original protected environment, restart instances and verify sign-in and CRUD before reopening writes.

After SQL receives new writes, freeze traffic and back up SQL. **Do not simply switch back to the stale Mongo database.** Reconcile and replay all post-cutover changes/deletions through a tested reverse migration to a separate restored Mongo target, then validate and approve recovery. No automated reverse importer is implemented here; cutover requires an agreed recovery path or a SQL recovery strategy that avoids losing those writes.

## Main files

| File | Responsibility |
| --- | --- |
| `database/config.js`, `index.js`, `runtime.js` | Provider selection, environment validation, connection pools, readiness and transactions. |
| `database/schema.js`, `catalog.js`, `migrations/001-platform.sql` | All 30 tables, generated indexes/constraints and model catalog. |
| `database/models.js`, `query.js`, `values.js` | Supported persistence operations, parameterized filters, validation, document reconstruction and compatibility reporting expressions. |
| `scripts/sqlserver-schema.cjs` | Offline, repeatable DDL generator. |
| `scripts/sqlserver-migrate.cjs` | Explicit export/preflight/schema/import/reconciliation CLI. |
| `scripts/sqlserver-cleanup.cjs` | External scheduler command for SQL expiry cleanup. |
| `tests/sqlserver*.test.js` | Offline contract/error tests and opt-in real SQL integration test. |

Technical references: [node-mssql](https://github.com/tediousjs/node-mssql), [Microsoft Azure SQL Node.js connection guide](https://learn.microsoft.com/en-us/azure/azure-sql/database/azure-sql-javascript-mssql-quickstart), [Tedious authentication options](https://tediousjs.github.io/tedious/api-connection.html), [SQL transaction-owned application locks](https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-getapplock-transact-sql), [OPENJSON compatibility requirements](https://learn.microsoft.com/en-us/sql/t-sql/functions/openjson-transact-sql).
