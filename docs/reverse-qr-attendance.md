# Reverse QR attendance implementation

## Audit and compatibility plan

The project is Express with browser JavaScript and Mongoose models. The existing
database adapter supports MongoDB and SQL Server/Azure SQL; use its transactions
and model bindings, not a second database. Club events are embedded in Club.events
and identified by published requestId (negative index fallback for legacy events).
University events use UniversityContent.id with clubId=0. Existing registrations
and AttendanceRecord/AttendanceSession remain authoritative; booths retain their
existing workflow. StudentAccount._id is already backend-generated, unique,
persistent and immutable, including on SQL Server. universityId is the distinct
official university field; no replacement ID or browser-generated account ID is
needed. Existing profile writes whitelist fields and do not accept _id.

Existing registration enforces club capacity transactionally; university public
registration needs the same locking. Existing attendance rotates a shared event
QR and lets students submit their own presence. Replace event self-check-in with
supervisor scanning while retaining legacy URLs and booth/delegated task features.
Retain existing approval history and attendance reports.

Implementation order: shared event resolution and timezone windows; existing
registration capacity extensions; short-lived authenticated QR payloads; persistent
device risk state and supervisor verification; transaction-safe attendance; scoped
management endpoints; student/scanner UI and existing dashboard links; migrations,
unit/integration/browser regression checks. No production migration or deployment
is implicit in this implementation request.

Policy: QR opens ten minutes before start and expires after 20 seconds (or at the
attendance end, whichever comes first). Default timezone is Africa/Cairo. Default
attendance close is the end of the event's local day; managers may configure an
earlier end time. Capacity reductions preserve registrations and close new places
until below the new limit. Shared-device warnings require an authorized manager
to compare the student's identity with their university card and explicitly
confirm; an assigned usher cannot silently override the warning. Browser identity
is a signed cookie plus a persistent database association, a risk signal rather
than proof of physical device identity. Clearing cookies creates a new association.

## Implemented behavior

- Club and university event references use stable request IDs, so registrations
  and attendance remain attached to the same event if an event list is reordered.
- Existing registration flows enforce capacity with transactional contention
  handling. Capacity changes preserve old registrations and do not delete history.
- Student QR payloads are authenticated/encrypted and short-lived. Supervisors
  scan them; attendance is committed transactionally and duplicate submissions
  preserve the first timestamp. An assigned scanner cannot check in their own
  account.
- A signed browser cookie plus persisted device association identifies a
  shared-browser risk. A different student produces a yellow warning; an
  authorized manager must verify the student's university card and record a
  note before attendance can be committed. The warning does not reveal the
  previous student's identity.
- Event timezone, start, and close windows are validated server-side. Scoped
  role checks cover club leadership, delegated scanners, MIU managers, and
  assigned MIU supervisor lanes. Legacy booth, registration, and attendance
  reporting paths remain integrated.
- The additive migration creates the device-binding table and stable unique
  indexes, and the backfill assigns stable IDs to legacy events while retaining
  attendance timestamps and student IDs. Migration 009 and its backfill were
  applied to the configured local SQL development database; no production
  migration or deployment was performed.

## Verification

- `node --test tests/*.test.js`: 549 tests, 546 passed, 3 skipped, 0 failed.
- Gated SQL integration (`tests/reverse-attendance-sql.test.js`): 1 passed,
  including QR encryption, concurrent duplicate prevention, shared-device
  verification, capacity contention, event reordering, and MIU review routing.
- Focused attendance unit/API tests: 22 passed.
- `npm.cmd run check:frontend`: passed (48 HTML files and 693 local asset
  references validated).
- The browser audit previously completed successfully in this work. Its latest
  rerun could not initialize the Chrome/Edge DevTools page (`Page.enable` timed
  out before the UI checks began). Physical camera hardware was not tested.
