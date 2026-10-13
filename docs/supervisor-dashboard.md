# Club Supervisor Dashboard

## Audit and scope

The application uses Express, Mongoose/MongoDB and static HTML/JavaScript. ClubAccount stores portal passwords as salted scrypt hashes and uses the existing signed, versioned HttpOnly club session cookie. Before this change its roles were president, head, PR, English, security, SSO and Dean. President/head permissions are tied to clubId, with assignedHeadEmail for individual tasks; committees have separate workflow permissions.

Existing records are Club.events, ContentRequest (event/feed/sponsor/booth/entry_permit), SpeakerRequest and AttendanceRecord. Speaker attachments use authenticated Cloudinary downloads with short-lived URLs. No semester event report model or submission API was found. The dashboard displays existing attendance summaries under Activity reports and explicitly explains this limitation.

## Permission rules

- New `supervisor` role on ClubAccount. `assignedClubIds` is the only authority for supervisor scope; clubId is retained for cookie compatibility and never implicitly grants access.
- Only an authenticated platform admin can create supervisor accounts or assign existing club IDs. Existing accounts of another role cannot be converted. Duplicate emails, invalid IDs, missing clubs, duplicate assignments and student email collisions are rejected.
- Supervisors can read assigned club metadata, published events, content requests, speaker request details/materials and attendance counts grouped by event/status. No attendee names/emails are returned.
- Supervisors can save private supervision notes and approve, reject or request changes to assigned-club requests waiting in `pending_supervisor`. Decisions are recorded in the existing workflow history and use conditional database updates so a second decision cannot advance the request twice. They cannot decide requests for another club or jump directly to publication/final approval.
- Speaker CV access reuses the existing secured download endpoint and checks the supervisor's current assignments on every request.
- Legacy club and committee APIs using requireClubAuth explicitly deny supervisor access. Existing roles retain their current behavior. Admin and Dean approval powers are not granted.
- Database outages fail closed. Missing assignments yield an empty dashboard. Unassigned club IDs return 404 before fetching records. Assignment updates increment sessionVersion and require another login.

## Configuration and usage

No new environment variables or external services are required. Use the existing MongoDB connection and session secret. No live database writes or real accounts were created during implementation.

1. Sign in as the platform administrator. Open **Manage club supervisors** in the admin data section, or `/dashboards/supervisor-management.html`.
2. Enter the supervisor's email, an initial password of 12–200 characters, and select assigned clubs. The initial password is needed only when creating an account. Share it privately; the existing account password reset flow remains available.
3. The doctor signs in through the existing portal login and is directed to `/dashboards/supervisor-dashboard.html`. The header Dashboard link also points there.
4. To remove access, edit assignments and clear the clubs. This revokes the current session and leaves the account with an empty dashboard.

The additive schema uses a new SupervisorReview collection. A unique compound index prevents duplicate notes for the same supervisor, club and target; startup creates its indexes. Club records/events/requests are reused, not copied.

## Mandatory supervisor approval

New submissions and resubmissions follow these paths:

- Event/feed/sponsor/booth: club → assigned supervisor → PR → English → Dean → published.
- Entry permit: club → assigned supervisor → PR → Security → PR final approval. Dean retains view-only access.
- Club-authored speaker request: club → assigned supervisor → Dean. External speaker/student proposals retain club screening first, then supervisor and Dean.
- Attendance list: after attendance ends, assigned supervisor → PR → SSO → Dean.

Requests returned for club editing re-enter supervisor review and then resume the appropriate existing committee stage, stored on the server as supervisorNextStage. Requested changes/rejections require feedback. A supervisor cannot review their own submission. No assigned supervisor means a request remains pending_supervisor; there is no automatic bypass. Existing requests already in committee review are not bulk migrated or silently rewound. Re-submitting them applies the new gate.

All supervisors use the same dashboard and role. Admin management now shows every club with its assigned supervisor accounts and an Add club supervisor action. It supports a separate account per club as well as the existing explicit multi-club assignments. Notifications reuse OneSignal and include only supervisors assigned to the affected club, the club president and the next responsible committee; private comments are not included in pushes.

## Changed files for this feature

- `models.js`: supervisor role, assignments and SupervisorReview model/index.
- `server.js`: scoped router registration, admin management registration, login/session routing, role isolation, private attachment authorization and startup indexes.
- `services/supervisor-dashboard.js`: scoped reads and supervision note writes.
- `services/supervisor-admin.js`: admin-only account creation/assignment handling, password hashing and session revocation.
- `public/dashboards/supervisor-dashboard.html`, `public/assets/js/supervisor-dashboard.js`, `public/assets/css/pages/supervisor-dashboard.css`: dashboard, inline navigation, responsive layout and loading/error/empty states.
- `public/dashboards/supervisor-management.html`, `public/assets/js/supervisor-management.js`: admin assignment UI.
- `public/assets/js/app-home.js`, `public/assets/js/layout.js`, `public/index.html`: login redirect and navigation integration.
- `tests/supervisor-dashboard.test.js`: HTTP authorization/scope/failure tests and real session/middleware checks.
- `services/supervisor-workflow.js`, `tests/supervisor-workflow.test.js`: mandatory approval decisions, scoped transitions, resubmission routing and attendance gating.
- `services/content-request-notifications.js`, speaker workflow services and related client scripts: scoped notifications and updated progress/status displays.

## Validation and remaining decisions

Validation: all 10 tests passed with `node --test tests/supervisor-dashboard.test.js`; existing speaker workflow checks passed with `node tests/speaker-request-workflow.js`. JavaScript syntax checks passed for the changed backend and new dashboard scripts. The tests use in-memory database substitutes and local HTTP requests; no production records are changed. They cover assigned/unassigned reads, anonymous/other-role access, malformed IDs, cross-club writes, note validation, empty assignments, failed database access, cross-origin writes, admin-only assignments, session revocation, signed supervisor sessions across server instances, preservation of president middleware access and private attachment authorization before URL signing.

The expanded workflow validation passed 29 tests across supervisor access, supervisor decisions and OneSignal, plus the existing speaker workflow script. Tests include all five content types, real club submission/resubmission handlers, duplicate decisions, cross-club/self-review denial, feedback requirements, database failures, speaker routing, attendance closure and the new schema states.

Production MongoDB persistence, actual device push delivery and browser rendering still need deployment-environment verification. Semester report submission is not implemented by the existing platform. Private supervision notes remain editable; approval decisions are recorded in the workflow history.

Rollback: remove the supervisor navigation/route integrations and new role support after disabling supervisor access. Original club/request records have not been rewritten; keep SupervisorReview records if historical notes are needed. Do not drop any existing database collections or accounts.
