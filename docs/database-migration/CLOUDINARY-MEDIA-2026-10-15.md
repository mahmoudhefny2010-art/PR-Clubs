# Existing media migration — 15 October 2026

The local SQL `clubs` database contains legacy inline images and references to packaged image files. Cloudinary is configured and its authenticated ping succeeded. Existing Cloudinary media is retained.

## Prepared scope

The read-only plan found 92 legacy image references, requiring 32 uploads totaling 3,163,563 bytes after deduplication within each purpose folder. No legacy video source requires migration. Five existing Cloudinary references are already present.

| Model | Legacy references |
| --- | ---: |
| Club | 80 |
| Application | 3 |
| UniversityContent | 1 |
| ContentRequest | 8 |

Of the ContentRequest images, three are published events, three are approved sponsor requests, one is a pending event and one belongs to a deleted event record. Migrating a media reference does not restore, publish or change the status of its record. Applicant photos and non-published content require an explicit private-media export decision because ordinary Cloudinary delivery URLs can be opened by anyone holding the URL.

The initial execution was rejected by automatic approval review pending explicit consent for those private images. At that point no upload or database-reference change had occurred. The CLI supports `--public-only`, or `--include-private-media` after specific consent for the full payload. The user's choice and actual completion must be recorded separately; this preparation record is not evidence of an executed migration.

## Backup and transaction safeguards

A native SQL backup passed checksum verification before execution was attempted:

`D:\pr-private-sql-operations\backups\clubs_auto_2026-10-15T15-52-05-450Z_1d78a116dab3.bak`

The apply command requires a matching verified backup less than two hours old and a protected journal directory outside the workspace. It uploads and verifies all selected files before touching SQL. Verification includes Cloudinary ownership/resource metadata and a SHA-256 comparison of the actual delivered original bytes. Identical bytes are reused within the same purpose folder; different privacy/purpose folders remain separate. Existing Cloudinary assets and packaged original files are never deleted or overwritten.

Previous field values and replacement references are durably journaled. SQL changes use one explicit transaction/session and the existing application write lock. Changed source values abort the migration rather than overwriting concurrent edits. Only media and associated declared public-ID fields change; timestamps, statuses, accounts and unrelated content remain intact. The transaction appends an audit entry. A second plan verifies that no selected legacy references remain.

## Commands

Read-only inventory:

```text
node scripts/migrate-cloudinary-media.cjs --database clubs --plan
node scripts/migrate-cloudinary-media.cjs --database clubs --plan --public-only
```

Apply requires `--apply --directory <protected existing directory> --backup <verified native .bak>`. Add `--public-only` to exclude private images, or `--include-private-media` only with explicit private-media export consent.

Rollback requires `--database clubs --rollback <absolute committed journal.json> --backup <fresh verified native .bak>`. It restores original media fields in one transaction only when their current values still match that migration's replacements. Uploaded Cloudinary copies remain; cleanup is a separate explicit operation.

The script refuses production, Vercel and remote SQL targets. This local migration does not update the Vercel MongoDB database or remove static assets required by its existing records and website branding.
