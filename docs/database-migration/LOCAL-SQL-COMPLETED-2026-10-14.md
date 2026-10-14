# Local SQL migration completed — 2026-10-14

The authorized transfer from MongoDB `clubs_dashboard` to the local SQL Server
database `clubs` completed successfully. `DATABASE_PROVIDER=sqlserver` remains
selected. The running website at `http://localhost:1111` now serves SQL data.

## Connection and data

- SQL instance: `DESKTOP-I3P8NGR\MSSQLSERVER01`, reached locally through
  `localhost:14330`. TCP/IP and mixed SQL/Windows authentication were enabled
  with Administrator approval. Existing logins/passwords were not changed.
- All 30 declared models are covered. **296 records** were imported with their
  IDs, complete supported document contents, account hashes, dates, ordered
  arrays, photo links and relationships retained.
- Every record's canonical content hash and stored scalar fields matched the
  verified export. All check/foreign-key constraints were validated by the SQL
  engine and confirmed enabled/trusted before the readiness marker was set.
- Four additional indexes found in the live source were explicitly mapped to
  SQL, preserving their existing uniqueness and lookup behavior. Original Mongo
  indexes were not altered. See `database/legacy-indexes.js`.
- The original Mongo database was only read. A native change stream check from
  the snapshot timestamp confirmed no source changes during the transfer.

## Backup and recovery evidence

Private artifacts are retained outside the repository in:

`D:\pr-private-migrations\20261014-transfer-01`

The directory has restricted Windows ACLs for the current account, SYSTEM and
Administrators. It contains an AES-256-GCM encrypted backup, its private key,
restore evidence, the private source export, migration reports and verification
reports. Never publish or commit these files; the export includes personal and
authentication data. The key must be preserved with controlled access to recover
the encrypted backup.

The backup was captured using a Mongo snapshot session, decrypted and compared,
then restored into a separate uniquely named `clubs_restore_...` database. Its
document contents and non-TTL indexes were checked before export. TTL indexes
are retained in backup metadata but omitted from the isolated restore to prevent
records expiring during extraction. After extraction, that disposable restore
was used for normal Mongo application startup and HTTP comparison; the encrypted
backup remains the immutable recovery artifact.

## Actual verification

- Three public API responses matched exactly, with no ignored fields:
  `/api/clubs`, `/api/clubs?media=links`, `/api/university-content`.
- The unauthenticated `/api/admin/homepage` guard matched: HTTP 401 on both
  providers. This tests the guard, not authenticated administration UI flows.
- SQL SSE initialization passed and was verified again on the main site using
  its `sql:` resume token.
- Both opt-in real SQL integration tests passed. They exercised CRUD, uniqueness,
  token consumption, references, retained supervisor history, notification
  revisions, no-op writes, deletes and rollback. Fixture writes were rolled back.
- The offline suite passed **229 tests**, with the two real SQL tests skipped
  there and then executed separately against SQL successfully.
- Main site verification: clubs HTTP 200 with 12 clubs; university content HTTP
  200 with one record; SQL notification stream HTTP 200.

## Issues resolved during the real transfer

- Mongo's multi-host URI required the driver's connection-string parser rather
  than a generic URL parser when selecting the isolated restore.
- SQL Server 17.0.1000.7 raised DBCC 2509 with preceding collation error 446 while
  constructing constraint diagnostics. Physical CHECKDB returned no errors.
  Verification now uses `ALTER TABLE ... WITH CHECK CHECK CONSTRAINT ALL` plus
  trusted/enabled constraint metadata, without disabling checks or skipping
  relationships.
- The staging host needed IPv4 for reliable Atlas connectivity; this workaround
  is confined to the isolated staging launcher.
- The development launcher previously inherited stale database values from
  `.env`. It now reads its port separately and lets each server load current
  settings. The identified project watcher/server were restarted successfully.

## Scope

Azure SQL was not selected or connected. This local transfer does not create
ongoing synchronization between SQL and Mongo. Future application writes now go
to SQL. The legacy Mongo backup worker does not back up future SQL changes;
SQL-native backups and the documented scheduled SQL TTL cleanup remain separate
operational setup. No cloud deployment or external email/push delivery was
performed as part of the migration tests.
