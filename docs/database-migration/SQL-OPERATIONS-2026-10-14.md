# Local SQL maintenance and website verification — 2026-10-14

The local `clubs` SQL database now has working scheduled native backups and
expiry cleanup. The website's login, permissions and CRUD operations were
verified against a restored SQL backup, including actual browser sign-in.
This changes local SQL operations; Vercel still uses its existing Mongo profile.

## Installed Windows tasks

| Task | Schedule, in this computer's local time | Principal |
| --- | --- | --- |
| `PRClubs-SQL-DailyBackup` | Daily at 03:00 | SYSTEM |
| `PRClubs-SQL-ExpiredDataCleanup` | Every hour | SYSTEM |

Both jobs were launched through Task Scheduler and finished with
`LastTaskResult=0`. They run without a signed-in user, retry failures three times
at five-minute intervals, run missed schedules when the computer is available,
and permit operation on battery. The computer and SQL service must be running.
The database argument is pinned to `clubs`; changing the selected provider or
database in `.env` makes the local jobs refuse to operate on a different target.

Backups: `D:\pr-private-sql-operations\backups`.
History: `D:\pr-private-sql-operations\operations.jsonl`.
Use Windows Task Scheduler to inspect next runs and task results. The directory
is outside Git and Vercel, with access restricted to the operator, SYSTEM,
Administrators, and the SQL service's required directory/backup access.

## Backup and recovery

The job uses SQL Server `BACKUP DATABASE` with `COPY_ONLY`, `CHECKSUM` and
`COMPRESSION`, followed by `RESTORE VERIFYONLY ... WITH CHECKSUM`. A successful
verification produces a `.bak.verified.json` marker; failures do not count as
verified backups. Files have unique names and existing backup files are never
overwritten. Verified copies older than 14 days are removed only after a new
backup passes, while keeping at least the newest two verified copies. Foreign,
unverified, missing, symlinked and size-mismatched backup files are excluded
from automatic retention and the cleanup prerequisite.

A real native backup was restored to a uniquely named, separate `clubs_qa_*`
database and passed physical integrity checks. No `WITH REPLACE` is used.
Successful QA evidence is stored privately at:
`D:\pr-private-sql-operations\verification-1791986158014_e252b18d\report.json`.
For disaster recovery, restore a chosen `.bak` to a separate database in SSMS
(Restore Database → Device → select file), validate it, then configure the app
to use that recovered database. Do not overwrite the active `clubs` database
to test recovery. The reusable QA command below performs a safe test restore.

These are native local full database backups, protected by Windows permissions;
they are not an off-machine copy or a transaction-log backup policy. Loss of
this drive can also lose these backups. Copy verified backups to protected
separate storage for recovery from machine/drive failure. Daily backups can
lose changes since the latest successful backup in a recovery scenario.

## Expiry cleanup

Only zero-second `expiresAt` TTL definitions in the model catalog qualify:
`LoginAttempt`, `PasswordRecoveryRateLimit`, `PasswordResetToken`,
`SiteVisitorPresence`, `SpeakerCvUpload`, and `StudentEmailCode`.
The worker refuses unexpected TTL shapes. It deletes records whose expiration
has passed using the SQL clock, in batches of 500 and at most 10,000 per table
per invocation; remaining expired records are processed on a later run.
Each batch takes the same transaction-owned application lock as app writes.
It does not delete accounts, clubs, applications, attendance history, content,
or external uploaded files. Local automatic/manual deletion requires a
checksum-verified backup from the last 36 hours. Preview performs no deletes.

The real cleanup job ran successfully; its first run removed one expired
visitor-presence record. Isolated QA created an expired and an unexpired record
for every TTL model: all six expired fixtures were removed, all six live
fixtures remained, and account/club/content counts were unchanged.

Azure's existing manual/external-scheduler cleanup remains supported with
Azure-managed backups, without requiring local `.bak` files. Azure was not
connected, scheduled or changed by this work.

## Website checks

54 real HTTP checks passed on the isolated restored database, including:

- Admin, president, head, PR, English, security, SSO, dean, supervisor,
  MIU Events, Software Development and student sign-in.
- Guest guards, wrong-password rejection, role restrictions, delegated
  administration, supervisor assignment and committee/SSO/MIU access.
- President draft creation, edit and deletion; unassigned head edit and head
  delete denial; club-status permissions; deleted-item rejection.
- Admin head creation, duplicate rejection, transactional head edit, sign-in,
  deletion and subsequent sign-in denial; announcement publish/delete.
- Student profile persistence and logout revoking the previous session cookie.

Headless Chrome also submitted the actual login form and verified the redirect
and authenticated session for all 12 account types. Private screenshots are
stored alongside the QA report. Email, push, Google and external uploads were
disabled for isolated QA and were not tested against external services.
This covers the main login/access/CRUD paths, not every route/input combination.

The QA database was removed afterward. The active local website returned HTTP
200 with 12 clubs; the source database contained no QA fixture accounts and no
QA databases remained. The offline suite passed 231 tests (two optional SQL
tests skipped); frontend structure validation passed. No changes were pushed
to GitHub or deployed to Vercel during this maintenance task.

## Commands

Run from the repository; the selected profile must be the approved local SQL
database. Installing or verifying SYSTEM tasks requires Administrator rights.

```powershell
# Native backup and verification.
npm.cmd run sql:backup -- --directory 'D:\pr-private-sql-operations\backups' --database clubs
# Preview expired records without deleting.
npm.cmd run sql:cleanup -- --directory 'D:\pr-private-sql-operations\backups' --dry-run
# Perform gated expiry cleanup.
npm.cmd run sql:cleanup -- --directory 'D:\pr-private-sql-operations\backups'
# Restore a backup to a unique disposable DB, run HTTP/browser/TTL QA, remove it.
npm.cmd run sql:operations:verify -- 'D:\pr-private-sql-operations\backups'
# Install/reconfigure tasks and take an initial verified backup.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-local-sql-operations.ps1
# Launch both installed tasks and record their actual completion results.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-local-sql-tasks.ps1
```

`LOCAL_DATA_DIRECTORY` lets isolated application servers keep local credential
caches and counters in their own private directory. The normal application
continues using the existing `data` directory when this variable is absent.
