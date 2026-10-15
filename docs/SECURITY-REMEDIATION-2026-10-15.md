# Security repairs — 15 October 2026

The original review is retained in `SECURITY-REVIEW-2026-10-15.md`. Repairs are in the local working tree; this task has not deployed them to Vercel.

## Implemented

- Administrator setup rejects production, existing administrators and non-opted-in bootstrap. Existing credentials remain behind authenticated settings.
- Login counters are independent per target identity/source and aggregate source. A different successful login cannot clear the victim's counter. Storage is shared through the existing database.
- API mutations require same-origin browser requests. CORS is restricted to that origin. Privileged cookies receive Secure in production, including proxy deployments. Forwarded visitor addresses are trusted only through the Vercel platform path.
- Responses include nosniff, frame restrictions, referrer/permissions policies and production HSTS. CSP blocks embedded objects, foreign base URLs and framing. The stricter script/resource policy is Report-Only while existing inline handlers and integrations remain compatible; strict script CSP is not yet enforced.
- Public club DTOs and Mongo projections exclude interview forms, member rosters, sponsor attachments and private sponsor details. V2 content management uses a protected endpoint to retain administrative access.
- Sensitive mutation audit entries include actor, route, safe target identifier, result and time. Bodies, query strings, passwords and tokens are excluded. Recent entries appear in V2's Data status tool behind its existing permissions.
- SQL runtime was changed from sysadmin/db_owner to a dedicated login with mapped-table CRUD, metadata reads and append-only AuditLog permissions. Protected operations credentials are separate settings for the scheduled backup/cleanup CLI; do not expose them in deployments. Runtime has no AuditLog UPDATE/DELETE or database/server administration rights.
- Public AI, uploads, applications and speaker submissions have shared database-backed abuse limits. Missing protection storage returns an explicit temporary failure.
- Legacy sponsor uploads receive server-side size, MIME and file-signature validation. Error text and document links are rendered safely.
- Dependencies were updated without downgrading ExcelJS. Node's native watcher replaces the vulnerable development watcher chain. A stable local signing secret is explicit; production requires an explicit signing secret of at least 32 characters. Existing Vercel production configuration contains that setting.
- Conversation exports and native/encrypted backups are excluded from Git/deployment. The accidental conversation export was archived locally in ignored audit storage. Private local data is excluded from Vercel packaging.

## Verification

- Full unit suite: 276 tests, 274 passed, 2 explicitly isolated-SQL tests skipped. No failures.
- Browser fixture suite: all 28 V2 tools, authentication/permissions, saves, card ordering, cache/live updates, offline behavior, feed image/video upload/edit/review/playback passed. Fixture writes only.
- Frontend structure and installed ExcelJS browser distribution checks passed.
- npm audit, all dependencies: 0 known vulnerabilities at verification time.
- Live local SQL: application readiness, all four public-notification triggers and limited-account permissions passed. A no-row Club update ran successfully inside a transaction and was rolled back. Audit permissions were checked with SQL permission metadata; append allowed, update/delete denied.
- Offsite encryption tests passed: verified-backup requirement, AES-256-GCM roundtrip, hashes, wrong-key/tamper rejection, duplicate protection and workspace destination rejection.

An additional live audit/limiter test was rejected by automatic approval review because its model writes might escape the transaction. It was not executed. Those paths were verified with isolated tests instead.

## External configuration still required

### Google phone prompts

Enable Google 2-Step Verification for every privileged Google account, then sign in through Google. Google controls whether a phone prompt or number match is shown; ordinary Sign in with Google does not prove to this website that every login used MFA. Password sign-in remains available under the existing workflow, so MFA is not globally enforced by these repairs. A mandatory site-wide second factor or managed Google policy requires a separate rollout decision.

Official instructions: [enable 2-Step Verification](https://support.google.com/accounts/answer/185839?hl=en), [Google phone prompts and number matching](https://support.google.com/accounts/answer/7026266?hl=en).

### Encrypted off-machine backups

The destination has not been selected. No external copy has been made; local native backup scheduling remains in place. The exporter supports an operator-mounted private directory on separate storage. An ordinary directory on the same disk does not provide machine-loss recovery.

Configure `SQL_BACKUP_OFFSITE_DIRECTORY` as an existing absolute protected destination and `SQL_BACKUP_OFFSITE_KEY` as a cryptographically random 32-byte key in canonical base64. Keep a recovery copy of the key separately from the encrypted backups. Do not send the key in chat or commit it. The Windows SYSTEM task must have access to the mounted destination; an interactive user's drive mapping may not be available to that task.

`node scripts/backup-offsite.cjs --check` reports configuration without secrets. Once both settings exist, each scheduled verified native backup also exports an authenticated encrypted copy plus checksum manifest. Configured export failures fail the job visibly and retain the native source. No existing remote files are overwritten or pruned. Remote retention and periodic recovery tests must be set for the chosen storage service.

Manual commands:

```text
node scripts/backup-offsite.cjs export "D:\private\clubs_auto_example.bak"
node scripts/backup-offsite.cjs decrypt "Z:\private\clubs_auto_example.bak.enc" "D:\private\recovery-new.bak"
```

Decryption creates a new file exclusively and authenticates the ciphertext. Restore that native backup to a separate SQL database for recovery validation; never overwrite the active database for a test.

### Deployment and operations

Restart the local server to load the new SQL runtime credentials. Keep the operations credential pair only in protected local operations configuration; future schema migration/QA commands need the operator account, not the web runtime account. The verification script selects the operator account for its isolated restored database.

Deploy and verify production HTTPS headers, authentication, external integrations and provider readiness before treating the hosted version as updated. The current hosted provider remains MongoDB. Audit retention should follow the organization's privacy/recovery policy; runtime cannot edit or delete SQL audit records, and automatic expiry cleanup does not delete audit history.
