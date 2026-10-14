# Semester event reports

Open **Semester event reports** in the president dashboard or supervisor sidebar (`/pages/event-reports.html`). Presidents can access only their own club. Supervisors can access only clubs in their current `assignedClubIds`. Committee heads and other roles have no reporting permission.

## Periods and existing events

No university academic calendar was found. The user must supply the official start and end dates in the date controls; the server requires real `YYYY-MM-DD` dates with start <= end. Boundaries are inclusive. No semester dates are inferred. The same boundaries can be entered for each club to compare the same semester.

Only published events already embedded in `Club.events` are included; content requests are not a second source of events. Missing or invalid event dates are excluded and counted separately. Empty periods return zero events. No event records or existing relationships are modified.

## Policy and workflow

One `EventReport` per club/event, independent of reporting period, enforced by a unique compound MongoDB index initialized with the other database indexes. Request-backed events use their existing `requestId`. Legacy event keys hash their existing index, title and date to avoid attaching a report to a replacement event at the same index. Changing or reordering a legacy event can leave its old report inaccessible; migrate legacy events to stable request IDs before reorganizing them if report continuity is required. No automatic title-based report reassignment occurs.

Presidents save drafts, edit drafts and submit completed reports. All five narrative fields are required for submission and limited to 5000 characters each. Submitted reports lock. Assigned supervisors can mark a submitted report reviewed or request changes with a required review note (maximum 2000 characters). A request for changes unlocks editing and resubmission. Reviewed reports stay locked. These report decisions do not change existing event or attendance approvals.

Every successful write increments a revision. Saves must supply the last observed revision (zero for creation). Updates atomically match revision, club, event and permitted status. Duplicate creations and stale or locked updates return 409. Submission time records the latest submission; the append-only action history retains earlier submission/review times, actors and notes. Creation/update timestamps are also stored.

## Statistics

- Registered attendees: existing `EventRegistration` records matching the club, current event index and exact stored event title. The title check avoids assigning stale index records to a different event. Historical title changes may make older registrations unavailable to this calculation.
- Verified attendance: existing `AttendanceRecord` check-ins matching club, event type and request ID. Legacy events use the existing negative index convention and additionally match title/date. This counts check-ins regardless of administrative approval status, clearly labeled in the page; it is not a count of Dean-approved attendance lists.
- Zero records with explicitly enabled tracking means zero. Without an explicit tracking flag or matching records, the figure is unavailable (`null`), rather than an invented zero.
- Semester totals sum the available per-event figures. Missing-data event counts accompany these partial totals. These are event participations, not unique students across the semester. Registration and verified check-ins remain separate; no attendance rate or manually supplied attendance count is used.

The API returns only count inputs from attendance/registration records, without student personal data. Account checks use the existing signed session resolver; mutations use the existing same-origin guard. Query/authentication failures return 503 and the UI clears old totals before loading. An uncertain save instructs the user to reload before retrying.

## Validation

Run `node --test tests/event-reports.test.js tests/supervisor-dashboard.test.js`.
The reporting tests use an HTTP harness with isolated in-memory model doubles to cover real-date validation, inclusive period filtering, empty semesters, missing data, record mapping, unique-index declaration, submission/edit/review transitions, stale revisions, duplicates, cross-club and role restrictions, invalid payloads, origin checks, and database readiness/read/write failures. Supervisor tests check compatibility with existing access and workflow behavior. This does not constitute a live MongoDB or visual browser test.

Changed files: `services/event-reports.js`, `server.js`, `public/pages/event-reports.html`, `public/assets/js/pages/event-reports.js`, `public/assets/css/pages/event-reports.css`, `public/index.html`, `public/dashboards/supervisor-dashboard.html`, `tests/event-reports.test.js`, and this document.

## Downloads

### Inline dashboard access

Reports and per-event attendance sheets now mount as native content panels beside the dashboard sidebar, without a new page or iframe. PR and SSO have the attendance-sheet panel. Dean, admin, supervisor and president have both event-report exports and attendance-sheet panels. Existing overview/review/navigation sections remain accessible. The admin tab navigation is arranged as a sidebar on desktop and wraps above content on small screens.

Attendance export access has explicitly expanded to PR, admin and president. President exports remain restricted to the own club; supervisor exports remain restricted to current assigned clubs. PR, SSO, Dean and admin can export across clubs. Report exports remain available to president, supervisor, Dean and admin. The standalone URLs remain available for compatibility, while dashboard entry points open the controls inline. Each event still has separate registration and verified-check-in downloads.

The download pages now have separate purposes: `?type=reports` downloads event reports only, and `?type=attendance` lists events for the selected club/period. There is no combined download-type selector. Each event card offers its own registered-attendee CSV and verified-check-in CSV, with event-specific filenames. Registration sheets are explicitly labeled as registrations, not proof of attendance. Existing aggregate download API routes remain available for compatibility, while the attendance page uses `/api/report-downloads/events` and `/api/report-downloads/event-sheet.csv`. The server validates the selected event against the authorized club and date period before reading participant data.

`/pages/report-downloads.html` provides Excel-compatible UTF-8 CSV downloads. Dashboard links are available to presidents, supervisors, Dean, SSO and global admin as appropriate. Select one authorized club or all authorized clubs, then a full **calendar year** (January 1–December 31) or inclusive custom start/end dates. Academic years that cross calendar years use the custom dates; no academic dates are assumed.

- Event reports: president (own club), supervisor (assigned clubs), Dean and admin (all clubs). Includes all existing dated events in the period, narrative report fields, status, report timestamps/revision/history, and separate registration/check-in counts. Events without a report are included with `No report`.
- Attendance details: supervisor (assigned clubs), SSO and Dean (all clubs). Includes recorded check-ins for events and booths filtered by the stored activity date, not registration date or submission time. Columns include full name, MIU email, university ID, major, club/activity, check-in time and approval status. Name uses the current matched student profile when available, otherwise the recorded check-in name. ID and major are joined by the recorded account email to `StudentAccount`; they reflect the current profile, not a historical snapshot. Missing profile values stay blank and a data-status column explains them. No ID or major is guessed from the email or unrelated applications.

Archived clubs remain available for historical exports. Invalid or absent event dates are excluded. Empty results download headings only. CSV fields are quoted and formula-like values are neutralized before spreadsheet use. Files are constructed only after every database read succeeds; failures return 503 instead of partial files. Downloads use the existing signed account resolver, live supervisor assignments, and the existing admin/software-development session checks. Other roles cannot widen their scope via a club ID or the all-club option.

Run `node --test tests/report-downloads.test.js tests/event-reports.test.js tests/supervisor-dashboard.test.js` for the download and existing reporting/access checks. Download tests additionally cover CSV escaping/formula handling, full-year boundaries, personal-data joins, missing profiles, role restrictions, assignment isolation, empty results, and database errors. These tests use model doubles, not live MongoDB or a visual browser.
