# Event organizer and usher attendance

An accepted club attendance assignment identifies its student as an Organizer
for that event/booth. An accepted MIU attendance task identifies its assigned
student/staff account as an Usher. These are event participation labels, not
new account permissions. Only the signed-in account assigned to the task can
record its own attendance; the browser cannot choose another email or role.

## Using the feature

- Club organizer: accept the task in the member dashboard, then choose
  **Record my organizer attendance**.
- MIU usher: open **Attendance usher task**, accept the task, then submit
  **Record my usher attendance**. Student profile details are prefilled;
  staff accounts can enter missing name, MIU ID and major.
- The existing QR presentation action stays available after self check-in.
  A self check-in does not open a second public session or add another person.
- Presidents and heads keep their existing self check-in form and their own
  event role is recorded as President or Head.

Attendance is saved to the existing `AttendanceRecord` model and existing
event/audience/reviewer workflow. MIU ushers retain the assigned supervisor.
An assigned usher can check in even without club membership; the record stays
**Non-member**, with **Usher** as its separate event role. Ordinary attendees
still pass the original membership gate for members-only events.

One signed browser device identity is used across ordinary QR scans and self
check-in routes, in addition to the task's existing device binding. Event-level
email/device unique indexes remain in force. Same-device repeats reuse the
existing person's record; an accepted task can label that existing record
without creating another check-in or replacing its attendance timestamp.
Another device cannot take over the task or move an existing self check-in.
Legacy signed attendance/task device cookies are recognized during migration.
As with existing attendance, device identity is browser-cookie based, rather
than a hardware fingerprint.

## Review and exports

The attendance table, committee review sheets and supervisor participant lists
show the event role separately from membership and member clubs. MIU supervisor
review now handles both members-only and open-student audiences, with separate
lists and audience-scoped decisions. Existing supervisor → PR → SSO → Dean
approval and restrictions on reviewing one's own task are retained.

CSV and Excel attendance exports include **Event role**, **Membership** and
**Member clubs** for both member and open attendance.
An additional **Attendance category** column shows Organizer or Usher for assigned
event staff; other attendees show Member or Non-member from their saved membership.
Club names stay in their separate column.
Workbooks count Organizer, Usher, President and Head rows inside the existing attendance total. Registered
attendees are still distinguished from verified attendance and receive no
invented attendance role. Legacy records without role metadata display Attendee;
historical roles are not guessed or bulk-backfilled.

The metadata is stored in nested `eventParticipation.role`, supported by the
existing Mongo document and SQL JSON payload. No SQL column migration or source
data rewrite is required. Public static cache v14 and the changed feature script
versions refresh the affected browser assets.

## Verification

Completed verification on 2026-10-14: **246 offline tests passed**, with two
optional SQL tests skipped in that suite; frontend validation passed. The
focused live SQL run passed **36 HTTP/export checks**, actual Chrome task
acceptance and self check-in, and Supervisor → PR → SSO → Dean approval for
both MIU audience types. Private evidence:
`D:\pr-private-sql-operations\verification-1791994073183_a7c00dcf\report.json`.
The disposable database was removed. A final source check found 12 clubs,
no QA fixture accounts and no QA databases; the local site returned HTTP 200,
and the new self check-in endpoint correctly rejected anonymous requests.

`tests/attendance-participation.test.js` covers signed identity, accepted tasks,
non-member ushers, replay/device collisions, expired/closed/unpublished events,
cross-origin denial, member snapshots, ordinary QR collision/race handling,
the usher form and supervisor audience isolation. Workbook/export tests verify
role, membership, club names and counts independently.

The isolated live verification command restores a native SQL backup, seeds
temporary fixture accounts/events, exercises organizer/usher HTTP check-in and
actual Excel output, submits the real usher form in Chrome, then tests the
supervisor/PR/SSO/Dean review chain for both MIU audience types:

```powershell
node scripts/verify-sql-operations.cjs 'D:\pr-private-sql-operations\backups' --attendance --attendance-focus
```

The focused mode checks the restore's checksum and targets attendance flows.
The default broader mode also runs the restored database physical check and
the wider account/CRUD/browser suite. QA databases are uniquely named and
removed afterward; local credential caches, screenshots and reports stay in
the private operations directory outside Git. External notifications/uploads
are disabled during QA. This work does not publish a Vercel deployment.
