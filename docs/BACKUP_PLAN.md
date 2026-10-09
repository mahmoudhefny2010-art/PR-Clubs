# MIU Clubs data backup plan

## Current storage

MongoDB is the source of truth for applications, club content requests, event registrations, clubs, accounts, and site settings. The application's local `data/` JSON files are not a backup of submitted applications. The repository currently has no automated database backup job. Confirm the Atlas cluster's backup status in its Atlas project before relying on any existing snapshots.

## Goals

- Keep a recoverable copy if an application deployment or database has an outage.
- Keep backups separate from the application host and the live database.
- Never tell a person that a form was saved until MongoDB confirms the write.
- Keep student application data private and restrict who can download or restore it.

## Primary backup

1. In MongoDB Atlas, open the project and cluster's **Backup** settings. Confirm the cluster supports the desired backup feature and turn on Atlas Cloud Backup if it is available.
2. Set a scheduled snapshot at least once per day and retain daily snapshots for 30 days. Take an on-demand snapshot before significant releases, migrations, or bulk administrative changes.
3. If the cluster cannot use Atlas Cloud Backup, schedule a nightly `mongodump` from a trusted runner and upload the encrypted archive to a private object-storage bucket that is separate from the application host and database account.
4. Keep backup credentials outside the repository and outside the website's public directory. Give the backup job write-only access to its destination where possible; limit restore access to designated administrators.
5. Alert a responsible administrator when a scheduled backup fails. Check that a recent successful snapshot/archive exists at least weekly.

## Retention and recovery targets

Initial targets (confirm these with the club before production):

- Recovery point: no more than 24 hours of data loss for a database-wide incident.
- Recovery time: restore service within one business day.
- Keep daily copies for 30 days, weekly copies for 12 weeks, and monthly copies for 12 months when using the separate object-storage fallback.

Atlas snapshot frequency, retention, point-in-time recovery, and pricing depend on the cluster configuration. Confirm the actual available controls and cost in Atlas before choosing the final schedule.

## Restore procedure

1. Alert the site owner and stop writes or put the application in maintenance mode if the incident requires it.
2. Restore the selected backup to a separate temporary cluster. Do not overwrite the live cluster as the first recovery step.
3. Verify that the `applications`, `contentrequests`, and `eventregistrations` collections and expected recent records are present. Check that application photos and workflow statuses are intact.
4. Have an authorized administrator approve the recovered data, then point the application to the restored cluster using the deployment's protected `MONGO_URI` setting.
5. Confirm read and write health, then resume submissions. Record the restore date, source snapshot, and any missing data.

## Restore drills

- Once per month, restore a recent copy to an isolated test cluster.
- Verify collection counts and inspect a small set of records without exposing student details in logs or reports.
- Record whether the recovery point and recovery time targets were met, and fix failed steps before relying on the backup.
- Never test restores against the live production cluster.

## External file backup after edits

The project includes a separate MongoDB change-stream worker at `scripts/database-backup-worker.js`. It writes a complete encrypted snapshot to an external persistent directory at startup and after every insert, update, replacement, or deletion in the database. Each archive uses AES-256-GCM encryption and gzip compression. The worker also updates one Excel workbook at `EXCEL_BACKUP_FILE`; the default filename is `miu project new.xlsx`. It has separate sheets for Applications, Content Requests, Event Registrations, Attendance, Attendance Sessions, Clubs, Club Accounts, Site Settings, and Audit Logs. Application columns follow the form fields, followed by any custom questions. The workbook omits passwords, hashes, tokens, and photo bytes; the encrypted archive remains the complete backup. The worker persists its change-stream resume token in the backup directory so it can continue monitoring after a restart. A restore utility is provided at `scripts/restore-database-backup.js` and requires an explicit confirmation environment variable before replacing records.

This worker must run as a separate, always-on process with a persistent disk. The repository includes Vercel serverless routing (`api/index.js` and `vercel.json`), so writing backups from a Vercel request handler would not provide a persistent file path. Run the worker on a trusted server or computer with a persistent disk, configure `BACKUP_DIR` to a directory outside the project, and keep `MONGO_URI` and `BACKUP_ENCRYPTION_KEY` only in that worker's protected environment. The live website may continue to run on Vercel.

The worker's encrypted file snapshots are the external recovery copy; the single Excel workbook is a readable working copy, and MongoDB Atlas backups remain the preferred full disaster-recovery layer.

### Worker setup

1. On the always-on backup host, install the project dependencies and copy `scripts/backup-worker.env.example` to a private `.env` file. Set `MONGO_URI` to a database user with read access and change-stream access, choose a persistent `BACKUP_DIR` and `EXCEL_BACKUP_FILE` outside the project, and generate a fresh 32-byte encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. Store the encryption key in a password manager separate from the backup disk. If the key is lost, the encrypted snapshots cannot be restored.
3. Run `npm run backup:watch` under a service manager that restarts it after a process or host restart. It creates an initial baseline and then one full encrypted snapshot after each monitored database change. Watch worker logs and disk capacity; a failed snapshot stops the worker rather than silently claiming a backup was made.
4. To restore, set `BACKUP_FILE` to the selected snapshot, set `MONGO_URI` to an isolated target database, set `ALLOW_DATABASE_RESTORE=YES`, then run `npm run backup:restore`. Verify the restored records before pointing the live site at that database.

The code is prepared, but no backup host, persistent disk, database credentials, or encryption key is configured by this repository. The worker is not active until it is installed and run on that separate host. The Excel workbook contains student personal data, so restrict access to the folder containing `EXCEL_BACKUP_FILE` to people authorized to view applications. No backup passwords or keys should be sent in chat or committed to Git.

## Before calling backups operational

- [ ] Confirm the production MongoDB Atlas project and cluster.
- [ ] Confirm or enable the chosen Atlas backup policy, or provision the separate encrypted object-storage destination and scheduled dump job.
- [ ] Assign an owner to check alerts and weekly backup status.
- [ ] Complete a restore drill and record the result.
- [ ] Install and run `npm run backup:watch` on an always-on host with a persistent disk.
- [ ] Configure `MONGO_URI`, `BACKUP_DIR`, `EXCEL_BACKUP_FILE`, and a generated `BACKUP_ENCRYPTION_KEY` from `scripts/backup-worker.env.example` in the worker's protected environment.
- [ ] Confirm the worker creates its initial encrypted snapshot and the single Excel workbook, then make a harmless test edit and confirm both are updated.
- [ ] Complete a restore drill against a separate test database before relying on recovery.
