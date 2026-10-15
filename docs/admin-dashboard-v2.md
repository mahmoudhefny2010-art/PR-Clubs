# Admin Dashboard

Open `/admin`. The former V2 is now the only administration dashboard, with 27 administrative tools. The old homepage administration, Global Admin and standalone credentials templates and their exclusive scripts were removed. The Club account directory card, page and exclusive listing API were removed; staff roles are managed in Staff accounts. See [the coverage review](admin-dashboard-v2-coverage.md) for the feature and permissions comparison.

Every card opens its own protected page under `/admin/<tool>`. Club editing uses `clubs?club=<id>` and committee-head editing uses `heads?email=<email>`. Anonymous visitors go to `/admin/login` and return to their requested tool after sign-in. Back uses browser history for one previous page, with the overview as the fallback for a new tab. Existing email/password, Google authentication and explicit local first-time setup remain supported; accounts, roles, data and API operations were not deleted.

Club application, interview and student-form code previously bundled in the retired admin script now lives in `public/assets/js/app-forms.js`. It remains on public/club pages without loading the removed administration interface. The service-worker cache version was advanced so cached homepage shells cannot keep references to deleted scripts.

The shell uses a dedicated administration navbar with the MIU logo, admin shortcuts, search, theme, refresh, website link and sign-out. The Administrator card sits at the top of the sidebar. The website's original footer, startup loader, small loading indicator and offline notice remain shared. Tools use inline confirmations rather than dialogs or browser confirmation popups. Existing staff, supervisor, university publishing and attendance/report forms are rendered within this shell from trusted repository templates.

Essential overview requests run in parallel. Homepage settings, archived clubs and the member directory warm in the background after startup. JSON snapshots are stored in the current tab, scoped to an opaque identifier derived from the verified signed admin/staff session. Snapshots are checked against current revisions before reuse. Staff directories stay in memory; Excel/download responses bypass JSON caching.

`/api/admin/dashboard-state` and `/api/admin/dashboard-stream` are protected by the existing admin guard. The browser receives change notifications through EventSource; it does not repeatedly reload data on a timer. MongoDB uses change streams. SQL Server/Azure SQL check hashes of row IDs and optimistic versions every three seconds on the server, coalescing concurrent readers. These checks exclude payloads and require no schema changes. Only affected cached sections are invalidated. Unsaved forms and active MIU attendance sessions defer automatic refresh until the user applies updates.

Verification:

```text
npm run check:frontend
node --test tests/admin-dashboard.test.js tests/admin-dashboard-data.test.js tests/admin-session-read.test.js
node tests/frontend-audit/admin-dashboard-v2.cjs
node scripts/verify-provider-routes.cjs --write
```

Browser checks use an isolated fixture server and in-memory mutations, never production records. Live SQL verification for this change reads revision metadata only.
