# Dynamic application and interview questions

Implemented locally on 17 October 2026. Not deployed by this task.

## Existing architecture and changes

The existing Club applicationFields and interviewForms, dashboard editors, application answer snapshots, interview evaluations, and API paths were reused. Previously only presidents could edit application questions, application questions had no committee scope, and invalid question definitions were silently normalized or omitted. Interview editors already had committee scopes and a club-level fallback.

- Presidents and Vice Presidents can manage whole-club questions or a selected assigned committee. Heads can manage only their assigned committee. All four management endpoints enforce these permissions on the server, including direct API requests.
- Whole-club application questions are combined with the selected committee's questions. Existing questions without a committee remain whole-club questions. The public Apply Form fetches current definitions from the backend when opened and when its committee changes.
- Editors support adding, editing, and removing short-text, long-text, and choice questions, required/optional flags, loading/error/empty/success states, and explicit reload controls. Existing section and question limits are retained per scope.
- The existing staff administration and Google sign-in role system now supports vice_president assigned to exactly one club. This does not grant administrator access or president-only operations.
- Club.questionHistory stores earlier configuration snapshots. Application answers retain stable keys and saved labels; editing an application retains removed answers and snapshots previous answers in answerHistory. Interview saves retain removed answers and previous evaluation snapshots. The interview UI includes previously saved answers.
- Saved editor versions detect stale edits; database writes also check the previously read updatedAt value. Invalid definitions or answers produce validation errors rather than silent question deletion.
- Existing multi-role head assignments are recognized when discovering managed committees and checking submission eligibility.

## Routes and storage

Existing routes: GET/PUT /api/club/application-form and GET/PUT /api/club/interview-form. Optional committee selects a scope; heads cannot select another scope. GET responses include version for subsequent writes.

New public route: GET /api/clubs/:id/application-form. It returns only application introduction and question definitions, never interview questions or configuration history.

The existing SQL JSON document storage persists the new nested fields. Migration 004-club-question-managers.sql adds vice_president to the ClubAccount role constraint. It was applied to the local clubs database without changing existing account assignments. For another SQL installation, run:

```powershell
node scripts/sqlserver-question-managers.cjs --apply --database <configured-database>
```

## Files changed for this feature

- services/club-questions.js: shared validation, scoped question routes, history, public definitions.
- server.js: route registration, scoped submission/edit validation, answer history, interview validation, role/committee integration.
- models.js: question committee scope, configuration/answer history, Vice President role.
- services/staff-google-auth.js, services/staff-account-admin.js, database/cache-snapshot.js: role assignment, routing and persistent cache support.
- services/public-club-media.js: excludes private configuration history from public club responses.
- public/index.html and public/assets/js/app-forms.js, app-home.js, app-dashboard.js: existing editors, scope selectors, dynamic public loading and historical interview answers.
- public/assets/js/staff-management.js and public/dashboards/staff-management.html: scoped Vice President assignment and cache version.
- database/migrations/001-platform.sql, 004-club-question-managers.sql and scripts/sqlserver-question-managers.cjs: new-install schema and existing-install migration.
- tests/club-questions.test.js, sqlserver-questions-live.cjs, frontend-audit/club-questions.cjs, frontend-audit/question-cdp.cjs: route, history, SQL and browser coverage.
- tests/application-auto-close.test.js, application-reapply.test.js and staff-account-admin.test.js: updated test dependencies and role expectations.

## Verification actually performed

- Focused Node regression suite: 114 tests, 112 passed, 2 existing opt-in SQL tests skipped, 0 failures. Includes question CRUD, committee/club isolation, anonymous and unrelated-role rejection, validation, stale versions, historical application/interview answer preservation, staff assignment/authentication, application submission/removal, and SQL adapter tests.
- Explicit live SQL test: real question API add/edit/remove, committee scope, configuration history, unchanged historical application/interview answers, Vice President storage, and readback after disconnect/reconnect. Only synthetic fixtures were used; the fixture club was archived before commit and every fixture was removed afterward.
- Chrome browser test: existing application editor add/remove/reload, public IT versus PR questions, interview add/edit/remove, President/Head/Vice President access, mobile screenshots, and no JavaScript exceptions. Uses isolated fixture APIs, not real users.
- npm.cmd run build:frontend and npm.cmd run check:frontend passed: 43 HTML files, 68 external scripts, 4 inline scripts and 622 local asset references.
- git diff --check passed.

The live SQL test reconnects storage; it does not restart the user's running server or perform a real Google sign-out/sign-in. Authentication and role behavior were tested with fixtures. Existing real application answers and role assignments were not modified by the tests.
