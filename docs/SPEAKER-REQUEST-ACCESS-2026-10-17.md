# Speaker Request access restriction

Implemented locally on 17 October 2026. This change has not been deployed.

The audited existing submission/invitation/review rules explicitly authorize club presidents and committee heads. Vice Presidents have question-management access but no existing Speaker Request permission, so they remain excluded. Supervisor and Dean review permissions are retained.

## Changes

- Removed Speaker Request from student navigation.
- Club Dashboard loads and shows the submission/invitation tools only for presidents and heads. Manual selection of a forbidden section returns to Overview.
- The old standalone URL redirects authorized managers into the Club Dashboard. Its public HTML is also a redirect-only fallback, with no standalone request form. The server rejects unauthenticated or unpermitted direct page requests.
- A shared server guard protects context, listing, creation, resubmission, private upload setup and club invitation creation. It verifies the current authenticated account, permitted role, assigned club, active club, and any supplied club/hosting/requester parameters.
- Student mode, unrelated roles, inactive clubs and different club IDs are rejected before upload or write. Requester identity is derived from the authenticated club account.
- Private attachment ownership/expiry/validation, request fields, notifications, duplicate protection and review stages are retained. Already verified club metadata is reused to avoid duplicate reads.
- Legacy student-request status notifications now lead to the homepage rather than the retired standalone request form. Existing requests and their history remain stored and available to authorized reviewers.
- Token-authorized external speaker intake and authorized Supervisor/Dean review/invitation flows are retained; these are existing explicit permissions, not general student submission access.

## Files

- `services/speaker-manager-access.js`: shared identity and access guard.
- `server.js`: guard registration, protected legacy URL, trusted club requester, verified club reuse and retired notification link.
- `services/speaker-requests.js`: rejects student hosting and mismatched hosting parameters.
- `public/index.html`, `public/assets/js/app-home.js`: student navigation removal and role-specific Club Dashboard tools.
- `public/assets/js/speaker-request.js`: club-only context and client permission check.
- `public/speaker-request.html`: redirect-only fallback.
- `tests/speaker-manager-access.test.js`: direct HTTP page/API permission, club isolation, submission, upload and resubmission coverage with fixtures.
- `tests/speaker-request-workflow.js`: updated hosting-policy assertions; existing validation, attachments, invitation and decision checks.
- `tests/frontend-audit/club-questions.cjs`: browser coverage for permitted heads, absent student entry and denied Vice President section access.

## Verification performed

- 44 Node tests passed, zero failures or skips: speaker manager access, supervisor dashboard/workflow, university-account sessions, Google staff authentication and session persistence.
- `node tests/speaker-request-workflow.js` passed existing speaker payload/file/invitation/decision/schema checks, with updated hosting permissions.
- Chrome fixture test passed Head access, student navigation removal and hidden/blocked Vice President speaker tools; the existing question-editor regressions also passed.
- `npm.cmd run check:frontend` passed (44 HTML files, 69 external scripts, 5 inline scripts, 618 local asset references).

HTTP and browser tests used isolated fixture accounts and storage. File upload checks used mocked Cloudinary storage, with the actual file validator and owner-key generation. No real upload, real staff-role reassignment, database migration or production deployment was performed for this task.
