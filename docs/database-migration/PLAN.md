# MongoDB → Microsoft SQL Server migration: stage 1

Audit date: 2026-10-14 (Africa/Cairo). This document records the original stage 1 design and backup gate. **Follow-up: the user subsequently requested offline backend code without SQL credentials. That code is now prepared; no data was migrated and MongoDB remains selected.** See [the implemented design and current limits](../../database/README.md) and [implementation results](IMPLEMENTATION.md). Production cutover remains blocked on verified recovery and real SQL validation.

## Evidence and scope

The offline inventory covers 221 non-minified JavaScript, HTML and CSS source files, 30 declared models, 539 schema paths including nested paths, and 245 route/middleware registration candidates. See [inventory.json](inventory.json) for source hashes, file/line references, environment-variable names, declared indexes, field defaults, validators, transformations, selection rules and database call sites. See [FIELD-MAPPING.md](FIELD-MAPPING.md) for every declared collection and field's proposed SQL representation. The inventory script never loads the server or connects to MongoDB.

This is a source-level audit and design, not a completed live database audit. Production may contain undeclared collections, historical fields, indexes and invalid records. No live counts, actual index definitions, data lengths, duplicate analysis, foreign-key coverage, backup availability or SQL Server configuration have been verified. No production startup, seed, restore or database write was invoked.

## Current architecture

- CommonJS Node.js, Express 4, Mongoose 8; no SQL Server driver currently installed. `server.js` contains most routes, authentication, connection lifecycle, state caches and startup data changes. Service modules register additional routes through injected models and guards.
- Static HTML and browser JavaScript under `public/`, frontend source/styles under `frontend/`; preserve their routes, payloads and rendering. `api/index.js` invokes `ensureReady` for Vercel requests; `vercel.json` routes all requests to that function. Local entry points are `server.js` and `dev.js`.
- `models.js` declares 27 models; `services/account-photo.js`, `services/event-reports.js`, and `services/student-feedback.js` each declare another. Missing these service-owned models would lose features.
- Mongoose queries, hydrated documents, `.save()`, `.lean()`, projections (including private `deviceHash`), sorting, upserts, aggregation, raw collection indexes, majority reads/writes and sessions are used directly. Replacing the connection URI is insufficient.
- `initializeMongoData` creates indexes, drops a legacy unique club index, seeds empty collections, upserts accounts, rewrites legacy content workflow states, and hydrates application caches. Auditing live data must use an independent read-only client, never import/run the application.
- MongoDB is authoritative; local `data/*.json` are fallback/cache/configuration data, not a full backup. `data/admin.json`, `data/club-accounts.json` and generated club logins are ignored private local files and must be separately protected if used. Existing `data/event-views.json` is a pre-existing working-tree modification and is outside migration work.
- Cloudinary stores media, with URL/public ID references in MongoDB; legacy data URLs/embedded media also occur. Signed upload endpoints, speaker CV claims, image ownership/deletion and downloads depend on database state. Keep media bytes, public IDs, names, formats and access policy; database backup alone does not back up remote media.
- Nodemailer/email, Google identity verification, OneSignal notification deduplication, Excel downloads and AI context depend on saved accounts/content or authorization. Preserve side-effect ordering: notify after confirmed commit; retries must not duplicate dispatches.

## Mandatory backup gate

The existing `docs/BACKUP_PLAN.md` describes a policy and unverified deployment checklist. Documentation and the presence of a workbook do **not** establish a safe backup.

Observed recovery defects in `scripts/restore-database-backup.js`:

1. `decryptSnapshot` calls `crypto.createDecipheriv` without importing Node's crypto module.
2. Each target collection is cleared with `deleteMany({})` before insertion, without a whole-restore transaction or enforcement of an empty, isolated destination. A failure can leave a partial restore. Do not run this utility against the original database.
3. The archive carries documents but no collection validators/options/index definitions. Replaying application startup is not a substitute for restoring actual indexes.

The backup worker serially reads collections without a consistent snapshot transaction or oplog replay. Change-stream triggering does not make those multi-collection reads point-in-time consistent. Its archive encryption is useful, but recovery correctness is unproven.

Before application changes, obtain evidence of a fresh consistent backup and successful isolated restore: backup identifier/time, source database identity, encrypted artifact checksum or provider snapshot identity, destination identity, index/collection verification, counts and content digests, media recovery coverage, key custodian and measured recovery time. Retain the original source unchanged. Prefer an Atlas consistent snapshot or topology-appropriate native backup; a replica-set `mongodump --oplog` workflow has restrictions and must be selected after topology inspection. Do not assume it applies to a sharded cluster or restricted database dump.

**Gate result: NOT CONFIRMED.** Stop application integration here under the user's mandatory steps 3 and strict unavailable-credentials/data-loss constraint. No SQL schema is applied and no cutover is authorized by this audit.

## Proposed architecture after gate passes

Use a maintained Node SQL Server client (proposed `mssql` with its supported driver after target authentication/runtime verification) behind explicit repositories and a unit-of-work transaction boundary. Keep domain validation separate from persistence. Do not build a general Mongoose query emulator. Extract repository interfaces by domain, then replace all call sites listed in the inventory, including service-owned models, health checks, scripts and Vercel initialization. MongoDB remains the default during preparation; configure a provider explicitly in isolated staging. SQL initialization must not silently seed demo data or migrate production data on HTTP requests.

Use parameterized statements and an allowlist for dynamic identifiers/sort keys. Preserve API serialization of `_id`, numeric `id`, dates, omitted/null/default fields and private fields. Return existing duplicate/validation/unavailable statuses, translating SQL errors (including unique violations) at the repository boundary without leaking credentials or record contents. A failed SQL connection/write must not report success or fall back to demo records for protected operations.

Preserve scrypt salt/hash bytes, `googleSub`, `sessionVersion`, last-login/password timestamps and signed-cookie formats. Existing roles include president/head/PR/English/security/SSO/dean/supervisor/MIU events/software development; keep committee and assigned-club scope and unified Google student access. Password-reset consumption/password update/session revocation must be one transaction. Retain the existing `ADMIN_SESSION_SECRET` and other signing secrets across deployment. Visitor and login-attempt HMAC derivation currently may fall back to `MONGO_URI`; removing/changing it can alter tracking and rate-limit keys. Preserve effective secret material securely or explicitly plan key/version transitions. Stable speaker invites and attendance device bindings must remain valid.

## Schema conventions and exactness requirements

Each of the 30 collections maps to a same-named singular SQL table (`dbo.<Model>`); all source fields and nested validation are listed in the field inventory. This is a **proposed** mapping, pending live profiling and target-version confirmation, not executable DDL.

- Preserve ObjectId primary keys as lowercase hexadecimal `CHAR(24)` with binary comparison; preserve the string `_id` of SpeakerCvUpload as a profiled bounded NVARCHAR key. Keep public numeric `id` columns unique; do not renumber or substitute SQL identity values. New identifiers retain the established API format. Profile numeric IDs for integer/safe range before choosing BIGINT. Replace max-plus-one races with transactionally allocated compatible IDs.
- BSON Number is a double: retain non-integer values (rating, quantities, counters where present) and reject NaN/infinity/out-of-range conversions explicitly. Use BIGINT only for fields proven integer, or FLOAT(53) to preserve declared numeric behavior; business decimal changes require an explicit decision.
- Unicode strings use NVARCHAR. Preserve leading zeros in university IDs, phone numbers, dates stored as text, budget/amount fields and event time strings. Date-valued fields become UTC DATETIME2(3), while date/time **string** fields remain strings unless a lossless conversion is proven. Never parse an ambiguous locale date silently.
- Choose profiled bounded lengths for indexed strings; do not truncate long legacy values. Review SQL index byte limits for composite keys. Preserve case-sensitive Mongo comparisons with binary collation, plus explicit existing lowercase/trim normalization at writes. Do not use a blanket case-insensitive university database collation. SQL trailing-space comparison differs even with binary collation: profile collisions and design exact key encoding/length checks where needed before index creation.
- Preserve absence versus explicit null, especially for sparse unique fields. Use presence flags where SQL NULL would merge these meanings. Mongo sparse unique indexes include explicit null and exclude missing; `WHERE key IS NOT NULL` alone is not exact parity when explicit null exists. Type-filtered partial indexes require type-aware migration. Report all collisions; never choose a winning record silently.
- Maintain timestamp/default/version behavior in the repository. Required fields, enums, min/max, string lengths, normalization, nested validators and defaults remain domain rules plus SQL CHECK/NOT NULL constraints where equivalent. Old invalid records remain in immutable staging and block promotion; do not apply current defaults retroactively without recording the transformation.
- Preserve unknown live fields in a canonical Extended JSON staging payload. Mixed objects cannot be normalized from source declarations alone. JSON columns use NVARCHAR(MAX) with ISJSON validation for object/array payloads on supported SQL versions. BSON-specific values need an explicit tagged encoding and reconstruction. Never silently stringify away Date/ObjectId/Decimal128/Binary distinctions.
- Keep embedded-array order using a parent key plus `ordinal`, and keep any embedded `_id`. Club events are addressed by array index, legacy report keys hash `[index,title,date]`, and legacy attendance IDs can be negative. Do not reorder arrays or force a positive-only event-ID constraint.
- No cascading deletion of historical applications/attendance/workflow records by default. Analyze current deletion/archive behavior before choosing foreign-key actions.

## Relationships, child tables and dependency mapping

| Model/domain | Proposed relationship and dependency treatment |
| --- | --- |
| Club | Numeric `id` unique plus preserved `_id`; ordered child tables for memberRoster, committeeAvailability, applicationFields/options, interviewForms, events, posts, sponsors, booths. Mixed child payloads retain all fields in JSON with ordinal; profile event request links before enforcing them. |
| Application | clubId → Club.id; nullable studentAccountId → StudentAccount._id. Answers and interviewEvaluations retain ordered payloads. Unique numeric id and studentClubKey semantics, counters, status/club/email and creation indexes preserved. |
| SiteSetting | Unique key; homepage title/subtitle and timestamps retained. |
| UniversityContent | Unique numeric id; ordered poll options; event/announcement source for MIU activity and feedback. |
| ClubAccount | Unique email/googleSub; roleAssignments and assignedClubIds become ordered child tables with club/committee scope. clubId=0 is used for global roles: do not create a fake Club or unconditional club FK. Represent scope explicitly while returning existing 0 to clients. |
| StudentAccount, AdminAuthState | Separate identities with unique email/googleSub per source semantics, hashes, session versions and timestamps retained; do not merge same-email roles or rehash passwords. |
| ContentRequest | clubId → Club.id after orphan audit; ordered PermitItem, WorkflowHistory, CommentHistory, HiddenCommentRole children; preserve nested comments and all sponsor/booth fields. |
| SpeakerRequest | inviteId → SpeakerInvite._id when populated; requesterId is polymorphic (student/club/speaker), so no unconditional account FK. MIU hosting/clubId=0 needs explicit scope. Attachment and DecisionHistory children; preserve activeRequesterKey partial uniqueness. |
| SpeakerCvUpload | String _id, unique publicId, requester key, expiry and consumedAt retained. Upload claim consumption remains atomic. |
| SpeakerInvite | Preserve token hashes and stable-token logic; active stable unique `(clubId,createdByEmail)` when stableToken=true and revokedAt is null. Club/global MIU scope must be profiled. |
| EventRegistration | Nullable studentAccountId → StudentAccount._id; club/eventIndex/title legacy linkage retained. eventRequestId may refer to club requests or university content; classify source before FK. Preserve all three uniqueness rules. |
| AttendanceSession | Preserved _id and unique tokenHash; club/MIU source and member/device binding retained; eventRequestId is polymorphic and legacy negative IDs exist. |
| AttendanceActivityClosure | Composite unique clubId/itemType/eventRequestId; preserve closure actor and timestamp. |
| AttendanceAssignment | Same activity composite unique key; member/day unique partial key and device state; preserve status CAS transitions. |
| AttendanceRecord | sessionId → AttendanceSession._id subject to orphan audit; ordered ApprovalHistory and MemberClubName children; email uniqueness and type-filtered device uniqueness, private deviceHash selection retained. |
| StudentInterest | Composite unique studentEmail/clubId/eventIndex; retain event order and registration flags. Email is a historical string reference: do not impose an account FK without profiling. |
| StudentFeedback | Unique kind/targetKey/email; targetKey references Club._id or UniversityContent._id by kind. Split optional FKs plus discriminator CHECK after profiling, retaining targetId and targetKey in API. |
| EventReport | Unique clubId/eventKey; preserve request and legacy keys, revision optimistic concurrency and ordered History. |
| AccountPhoto | Unique email, media publicId/url, prompt dismissal. Shared across account roles; no unconditional FK to StudentAccount. |
| SupervisorReview | supervisorId → ClubAccount._id; clubId → Club.id where applicable; targetType content/speaker is polymorphic and targetId remains exact string; preserve compound uniqueness. |
| AuditLog | Numeric id unique, actor/timestamp indexes. Historical target IDs and actor emails intentionally do not cascade with entity deletion. |
| SiteVisitor, SiteNetwork, SiteVisitorPresence | Unique visitorId/ipHash; preserve metadata and timestamps. Presence expiry requires external scheduled cleanup, not an in-process serverless timer. |
| StudentEmailCode, LoginAttempt, PasswordResetToken, PasswordRecoveryRateLimit | Preserve unique keys, retry windows, hashes, attempts/counts, expiry and token account type; scheduled expiry cleanup plus query-time expiry checks. Never log token/hash values. |
| NotificationDispatch | Unique eventKey and state/provider result; claim and transition must prevent duplicate side effects across workers. |

Every declared index, including compound order, uniqueness, sparse/partial conditions and TTL, is preserved in the inventory. Compare with live `listIndexes` before authoring migration DDL; retain extra indexes until reviewed. TTL requires an external SQL Agent job or supported scheduler with monitoring, and security checks must enforce expiresAt independently. Enforce FKs only after source discriminators, global sentinel IDs and orphan handling have been resolved; no `WITH NOCHECK` promotion or fabricated parents.

## Repeatable data migration design (not implemented)

1. Use read-only MongoDB credentials or a restored consistent backup. Inventory every live collection, validator, index and BSON type; compare to this source inventory and fail on unexplained differences. Never use app startup or seed.js as an extractor.
2. Export a consistent source with canonical BSON Extended JSON, counts, per-document hashes, array order and a manifest. Encrypt on protected persistent storage outside the public site/repository. Keep backups and original database untouched.
3. Create versioned SQL DDL with PKs, unique/filtered indexes, validated FKs/checks, child tables, migration ledger and typed immutable staging. No target drop/truncate/delete. Verify expected database identity, TLS, permissions and empty migration namespace before import.
4. Dry run validates all records, not a sample. Report duplicate exact and collation keys, absent/empty/null required values, invalid dates/types, non-finite/unsafe numbers, oversized indexed strings, BSON variants and missing references. A manifest of rejected IDs/reasons is protected; public reports contain aggregate counts only. Fail closed with zero target promotion if unresolved records exist.
5. Import parents then dependents in deterministic batches with bounded memory. Use SQL transactions, XACT_ABORT, rollback on failure and a run ID + source fingerprint + migration-version ledger. A rerun of the same immutable source is a no-op only when hashes match; changed rows are conflicts, not blind upserts. Resume only committed verified batches. Constraints must be enabled/trusted before validation.
6. Reconstruct API-equivalent documents and compare per-ID canonical digests, field presence, timestamps, hashes, references, array order and aggregate reports. Count equality alone is insufficient. Record source/extracted/inserted/unchanged/rejected counts, transaction failures, versions, checksums and constraint results in the migration report.
7. Validate against staging with email/push side effects stubbed. Final cutover requires a write freeze or a proven delta-capture/replay path, final backup, repeat import/reconciliation and explicit readiness approval. Prevent Mongo and SQL writers from diverging. Never automatically switch production on a passing unit test.

## Incremental implementation and validation stages

| Stage | Deliverable and exit condition |
| --- | --- |
| 1: audit (this change) | Source inventory, schema proposals, risks, baseline tests; blocked on backup evidence. |
| 2: prerequisites | Verified isolated restore, live data/index profile, SQL version/authentication/TLS and staging connectivity; all anomalies have agreed lossless handling. |
| 3: persistence | Versioned DDL, explicit repositories, provider configuration, unit-of-work and error mapping; run baseline plus real SQL CRUD/constraint/rollback/disconnect tests. Mongo remains default. |
| 4: import | Repeatable dry-run/import/validate scripts, idempotence and deliberate interruption tests; full reconciliation passes against immutable source. |
| 5: feature parity | Registration/email codes, password and Google logins for every role, cookie/session revocation, password reset/reuse/expiry/rate limits, club creation/archive/deletion/sorting/rosters/applications/interviews, full approvals/edits/comments, speaker invites/requests/CV claims, university and club event registration, attendance assignments/device/email deduplication/closure/approval, feedback, reports/Excel/photo uploads/deletion, visitors/TTL, notifications and AI data context. Compare routes/statuses/payloads/permissions and test concurrent requests. |
| 6: production readiness | Final data validation and recovery rehearsal, measured performance/pool limits on Vercel, scheduler monitoring, backup approval, release rollback rehearsal and final controlled cutover. |

Run the existing Node test suite after each implementation stage; use real isolated SQL integration tests for repository contracts, relationship constraints, concurrent uniqueness/CAS, transaction rollback, invalid values, expiry, migration restart and failed connections. Existing tests often inject Mongoose-shaped mocks or extract source snippets; they prove current behavior, not SQL compatibility. Adapt them to repository boundaries without dropping behavior checks. UI audits apply only if client behavior changes.

## Environment configuration proposal

Preserve existing protected environment values; inventory lists source-referenced names without reading `.env` values. Do not put credentials in chat, committed files or command-line arguments. No SQL credentials or target identity are verified.

After prerequisite validation, introduce `DATABASE_PROVIDER=mongodb|sqlserver` (default Mongo during preparation), `SQLSERVER_HOST`, `SQLSERVER_PORT`, `SQLSERVER_DATABASE`, `SQLSERVER_AUTH_MODE`, and the university-approved credential/identity settings. SQL authentication would require protected `SQLSERVER_USER` and `SQLSERVER_PASSWORD`; integrated/managed identity depends on the selected runtime/driver. Require TLS (`SQLSERVER_ENCRYPT=true`, `SQLSERVER_TRUST_SERVER_CERTIFICATE=false`), explicit timeouts and a bounded pool appropriate to serverless concurrency. These are **proposed names, not currently implemented settings**. Keep migration source/target credentials separate from application credentials; extractor read-only, migrator schema-scoped DDL/DML, runtime minimum CRUD. Never silently accept trust-server-certificate in production.

Keep `MONGO_URI` available for the unchanged production app and recovery until retirement is explicitly approved. Preserve session, Google, email, Cloudinary and push settings. Back up protected local account config if used. Do not deploy placeholder SQL credentials.

## Rollback

Before SQL cutover: stop/discard isolated SQL migration work only; production stays on MongoDB. No database restoration is necessary because source data was never modified. Preserve migration evidence and failed staging payloads securely.

After cutover but before new SQL writes: revert to the pinned Mongo deployment/provider and original protected configuration, clear application caches/restart instances, verify authentication and reads/writes, then reopen traffic.

After SQL accepts writes: **do not simply repoint to MongoDB**. Freeze writes, back up SQL, reconcile and replay every new/changed/deleted record into a separate restored Mongo target using a tested reverse migration/delta process, validate IDs/hashes/relationships and obtain recovery approval before switching. Keep the original Mongo database intact. Without a validated reverse path, remain in maintenance while recovering SQL; never knowingly discard post-cutover data.

## Unresolved prerequisites and deferred deliverables

- Backup artifact/provider snapshot and successful isolated restore evidence, including media and actual indexes; backup/restore tooling defects need remediation before relying on it.
- Approved read-only source access or consistent restored export, actual collections/fields/indexes/counts and data anomalies.
- SQL Server edition/version, compatibility level, host/database identity, network access, university-approved authentication, TLS certificate and isolated staging credentials through a protected environment.
- Global clubId=0, orphan/history, polymorphic event/requester/feedback relationships, exact sparse-null/collation behavior and profiled indexed lengths.
- Expiry scheduler, migration window/write freeze or delta capture, acceptable downtime, RPO/RTO, owner and post-cutover reverse-write strategy.
- Executable SQL DDL/migrations, data importer, backend SQL integration and real SQL feature/connection tests are deliberately **not implemented** before the mandatory backup gate. This document does not claim their completion.

## References

- [Microsoft: JSON storage and querying](https://learn.microsoft.com/en-us/sql/relational-databases/json/json-data-sql-server)
- [Microsoft: filtered indexes](https://learn.microsoft.com/en-us/sql/relational-databases/indexes/create-filtered-indexes)
- [MongoDB: mongodump and consistent backup restrictions](https://www.mongodb.com/docs/database-tools/mongodump/)
- [MongoDB: backup and restore tools](https://www.mongodb.com/docs/manual/tutorial/backup-and-restore-tools/)
