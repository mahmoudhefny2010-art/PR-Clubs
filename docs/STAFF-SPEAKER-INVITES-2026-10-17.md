# Staff speaker invitations

Dean and Supervisor dashboards can create permanent speaker form links and QR codes for MIU. Dean may select any active club; Supervisor may select only currently assigned active clubs or MIU. Club presidents and heads retain their existing club invitation and request workflow. Ordinary students and unrelated roles remain denied.

MIU uses the existing university clubId=0 convention and existing nullable club foreign-key mapping. Public MIU submissions save hostingType=miu and pending_dean. Club submissions retain pending_club. Staff invitation authors are not assigned as committee heads. Dean attachment access and completed-request listing include MIU requests. Existing approval and self-review checks remain enforced.

Files: services/staff-speaker-invites.js; server.js; models.js; database/migrations/001-platform.sql and 005-staff-speaker-invites.sql; scripts/sqlserver-speaker-invites.cjs; public/dashboards/dean-dashboard.html and supervisor-dashboard.html; public/assets/js/speaker-review.js, supervisor-dashboard.js, supervisor-speaker-invitations.js; tests/staff-speaker-invites.test.js; tests/frontend-audit/staff-speaker-invites.cjs.

Validation actually run:
- Node API/permission/workflow suites: 31 passed, zero failures.
- node tests/speaker-request-workflow.js: passed.
- npm.cmd run check:frontend: passed (44 HTML files, 70 external scripts, 620 asset references).
- Chrome browser test with isolated fixtures: MIU selection, link generation, rotation, panel switching with no assigned clubs, mobile width passed. Initial sandbox browser attempts timed out; rerun outside sandbox exposed and verified a panel-switching correction.
- Migration 005 applied to configured local SQL database. Initial sandbox connection timed out; authorized rerun succeeded.
- Actual SQL insert/read for synthetic Dean and Supervisor MIU invitations succeeded inside a transaction rolled back afterward. No real invitation or member records were changed by this test.

Not deployed or pushed. Other environments must apply migration 005 before enabling Supervisor invitation creation. Real delivery of invitation links, private attachment storage and production approval were not exercised.
