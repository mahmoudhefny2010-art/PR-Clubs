# Runtime relationships and unchanged interfaces

This map describes the original project. Every interface below is retained. Literal path extraction is conservative: dynamically constructed requests are listed as patterns, not assumed dead code.

## Shared asset consumers

| Asset | Original page consumers |
|---|---|
| `/assets/css/base.css` | `private/admin-club-credentials.html`, `private/global-admin.html`, `public/attendance.html`, `public/dashboards/dean-dashboard.html`, `public/dashboards/english-dashboard.html`, `public/dashboards/pr-dashboard.html`, `public/dashboards/sso-dashboard.html`, `public/index.html`, `public/pages/applicant-login.html`, `public/pages/booth-form.html`, `public/pages/booths.html`, `public/pages/club-content.html`, `public/pages/event-form.html`, `public/pages/event.html`, `public/pages/events.html`, `public/pages/feed-form.html`, `public/pages/forgot-password.html`, `public/pages/reset-password.html`, `public/pages/sponsor-form.html`, `public/pages/sponsors.html` |
| `/assets/css/dark.css` | `private/admin-club-credentials.html`, `private/global-admin.html`, `public/404.html`, `public/500.html`, `public/attendance.html`, `public/dashboards/dean-dashboard.html`, `public/dashboards/english-dashboard.html`, `public/dashboards/pr-dashboard.html`, `public/dashboards/sso-dashboard.html`, `public/index.html`, `public/pages/applicant-login.html`, `public/pages/booth-form.html`, `public/pages/booths.html`, `public/pages/club-content.html`, `public/pages/event-form.html`, `public/pages/event.html`, `public/pages/events.html`, `public/pages/feed-form.html`, `public/pages/forgot-password.html`, `public/pages/reset-password.html`, `public/pages/sponsor-form.html`, `public/pages/sponsors.html` |
| `/assets/css/event-modal.css` | `public/index.html`, `public/pages/booths.html`, `public/pages/events.html`, `public/pages/sponsors.html` |
| `/assets/css/features.css` | `private/admin-club-credentials.html`, `private/global-admin.html`, `public/dashboards/dean-dashboard.html`, `public/dashboards/english-dashboard.html`, `public/dashboards/pr-dashboard.html`, `public/dashboards/sso-dashboard.html`, `public/index.html`, `public/pages/applicant-login.html`, `public/pages/booth-form.html`, `public/pages/booths.html`, `public/pages/club-content.html`, `public/pages/event-form.html`, `public/pages/event.html`, `public/pages/events.html`, `public/pages/feed-form.html`, `public/pages/forgot-password.html`, `public/pages/reset-password.html`, `public/pages/sponsor-form.html`, `public/pages/sponsors.html` |
| `/assets/css/pages/events.css` | `public/pages/booths.html`, `public/pages/event.html`, `public/pages/events.html`, `public/pages/sponsors.html` |
| `/assets/css/responsive.css` | `private/admin-club-credentials.html`, `private/global-admin.html`, `public/attendance.html`, `public/dashboards/dean-dashboard.html`, `public/dashboards/english-dashboard.html`, `public/dashboards/pr-dashboard.html`, `public/dashboards/sso-dashboard.html`, `public/index.html`, `public/pages/applicant-login.html`, `public/pages/booth-form.html`, `public/pages/booths.html`, `public/pages/club-content.html`, `public/pages/event-form.html`, `public/pages/event.html`, `public/pages/events.html`, `public/pages/feed-form.html`, `public/pages/forgot-password.html`, `public/pages/reset-password.html`, `public/pages/sponsor-form.html`, `public/pages/sponsors.html` |
| `/assets/img/pics/logo.svg.png` | `private/admin-club-credentials.html`, `private/global-admin.html`, `public/attendance.html`, `public/components/site-footer.html`, `public/components/site-header.html`, `public/dashboards/dean-dashboard.html`, `public/dashboards/english-dashboard.html`, `public/dashboards/pr-dashboard.html`, `public/dashboards/sso-dashboard.html`, `public/index.html`, `public/pages/applicant-login.html`, `public/pages/booth-form.html`, `public/pages/booths.html`, `public/pages/club-content.html`, `public/pages/event-form.html`, `public/pages/event.html`, `public/pages/events.html`, `public/pages/feed-form.html`, `public/pages/forgot-password.html`, `public/pages/reset-password.html`, `public/pages/sponsor-form.html`, `public/pages/sponsors.html` |
| `/assets/js/admin-data-status.js` | `public/index.html` |
| `/assets/js/app-admin.js` | `public/index.html` |
| `/assets/js/app-dashboard.js` | `public/index.html` |
| `/assets/js/app-home.js` | `public/index.html` |
| `/assets/js/attendance-approval-workflow.js` | `public/dashboards/dean-dashboard.html`, `public/dashboards/pr-dashboard.html`, `public/dashboards/sso-dashboard.html` |
| `/assets/js/attendance-checkin.js` | `public/attendance.html` |
| `/assets/js/attendance-dashboard.js` | `public/index.html` |
| `/assets/js/committee-attendance.js` | `public/dashboards/dean-dashboard.html`, `public/dashboards/pr-dashboard.html` |
| `/assets/js/committee-dashboard.js` | `public/dashboards/dean-dashboard.html`, `public/dashboards/english-dashboard.html`, `public/dashboards/pr-dashboard.html` |
| `/assets/js/committee-sidebar.js` | `public/dashboards/dean-dashboard.html`, `public/dashboards/english-dashboard.html`, `public/dashboards/pr-dashboard.html`, `public/dashboards/sso-dashboard.html`, `public/index.html` |
| `/assets/js/content-studio.js` | `public/pages/booth-form.html`, `public/pages/club-content.html`, `public/pages/event-form.html`, `public/pages/feed-form.html`, `public/pages/sponsor-form.html` |
| `/assets/js/event-modal.js` | `public/index.html`, `public/pages/events.html` |
| `/assets/js/layout.js` | `private/admin-club-credentials.html`, `private/global-admin.html`, `public/attendance.html`, `public/dashboards/dean-dashboard.html`, `public/dashboards/english-dashboard.html`, `public/dashboards/pr-dashboard.html`, `public/dashboards/sso-dashboard.html`, `public/index.html`, `public/pages/applicant-login.html`, `public/pages/booth-form.html`, `public/pages/booths.html`, `public/pages/club-content.html`, `public/pages/event-form.html`, `public/pages/event.html`, `public/pages/events.html`, `public/pages/feed-form.html`, `public/pages/forgot-password.html`, `public/pages/reset-password.html`, `public/pages/sponsor-form.html`, `public/pages/sponsors.html` |
| `/assets/js/member-directory.js` | `public/dashboards/pr-dashboard.html`, `public/index.html` |
| `/assets/js/pages/booths.js` | `public/pages/booths.html` |
| `/assets/js/pages/event-detail.js` | `public/pages/event.html` |
| `/assets/js/pages/events.js` | `public/pages/events.html` |
| `/assets/js/pages/sponsors.js` | `public/pages/sponsors.html` |
| `/assets/js/theme.js` | `private/admin-club-credentials.html`, `private/global-admin.html`, `public/404.html`, `public/500.html`, `public/attendance.html`, `public/dashboards/dean-dashboard.html`, `public/dashboards/english-dashboard.html`, `public/dashboards/pr-dashboard.html`, `public/dashboards/sso-dashboard.html`, `public/index.html`, `public/pages/applicant-login.html`, `public/pages/booth-form.html`, `public/pages/booths.html`, `public/pages/club-content.html`, `public/pages/event-form.html`, `public/pages/event.html`, `public/pages/events.html`, `public/pages/feed-form.html`, `public/pages/forgot-password.html`, `public/pages/reset-password.html`, `public/pages/sponsor-form.html`, `public/pages/sponsors.html` |

`theme.js` also appends `theme-toggle.css`; `layout.js` injects `components/site-header.html` and `components/site-footer.html`. Club image paths and dynamic content come from API responses. Absence of a literal image reference is not evidence that the file is unused.

## Frontend API consumers

### `private/admin-club-credentials.html`

- `/api/admin/club-credentials`
- `/api/admin/logout`

### `private/global-admin.html`

- `/api/site/visitor-ping`
- `/api/admin/visitor-analytics`
- `/api/admin/club-heads/${encodeURIComponent(btn.dataset.email)}`
- `/api/admin/club-heads`
- `/api/admin/club-views`
- `/api/admin/event-analytics`
- `/api/admin/clubs/${activeCommitteeClubId}/committee-availability`
- `/api/admin/applications`
- `/api/admin/applications/${id}`
- `/api/admin/applications/${id}/status`
- `/api/admin/logout`
- `/api/clubs`

### `public/assets/js/admin-data-status.js`

- `/api/admin/system/data-status`

### `public/assets/js/app-admin.js`

- `/api/admin/session`
- `/api/admin/clubs/archived`
- `/api/admin/clubs/order`
- `/api/club/application-form`
- `/api/club/interview-form`
- `/api/admin/clubs/${clubId}/archive`
- `/api/admin/clubs/${clubId}/restore`
- `/api/clubs/${clubId}/view`
- `/api/my-forms/${encodeURIComponent(editing.id)}`
- `/api/applications`

### `public/assets/js/app-dashboard.js`

- `/api/applications/${appId}`
- `/api/club/heads`
- `/api/club/committee-availability`
- `/api/club/members`
- `/api/club/heads/${encodeURIComponent(head.email)}`
- `/api/clubs/${clubId}/application-committees`
- `/api/applications/${state.selectedApplication.id}/status`
- `/api/club-auth/logout`
- `/api/admin/setup`
- `/api/admin/login`
- `/api/club-auth/login`
- `/api/admin/logout`
- `/api/admin/homepage`
- `/api/admin/clubs/${clubId}`
- `/api/admin/clubs`

### `public/assets/js/app-home.js`

- `/api/my-forms/${encodeURIComponent(entry.id)}`
- `/api/my-forms/${encodeURIComponent(item.id)}`
- `/api/clubs`
- `/api/admin/homepage`
- `/api/club/applications`
- `/api/club/heads`
- `/api/club/members`
- `/api/club/attendance-records`
- `/api/club/content`
- `/api/club-auth/session`

### `public/assets/js/attendance-approval-workflow.js`

- `/api/committee/attendance-reviews`
- `/api/committee/attendance-reviews/${escapePathPart(review.clubId)}/${escapePathPart(review.itemType)}/${escapePathPart(review.eventRequestId)}/approve`
- `/api/club-auth/logout`
- `/api/club-auth/session`

### `public/assets/js/attendance-checkin.js`

- `/api/attendance/${encodeURIComponent(token)}`
- `/api/student-auth/session`

### `public/assets/js/attendance-dashboard.js`

- `/api/club/attendance-qr-challenge`
- `/api/club/attendance-events`
- `/api/club/attendance-records`
- `/api/club/attendance-sessions`

### `public/assets/js/committee-attendance.js`

- `/api/committee/attendance-overview`
- `/api/committee/attendance-records?${query}`
- `/api/committee/attendance-records?clubId=all`

### `public/assets/js/committee-dashboard.js`

- `/api/club-auth/session`
- `/api/committee/requests/${item.id}/comment`
- `/api/committee/requests`
- `/api/committee/status`
- `/api/committee/requests/${item.id}/action`
- `/api/committee/requests/${item.id}`
- `/api/committee/status/${id}`
- `/api/committee/requests/${item.id}/return-to-committee`
- `/api/committee/requests/${item.id}/reopen`
- `/api/committee/requests/${activeRequest.id}/return-to-committee`
- `/api/club-auth/logout`

### `public/assets/js/content-studio.js`

- `/api/club-auth/session`
- `/api/club/content`
- `/api/club/content/${id}`
- `/api/club/content/${editingId}`
- `/api/club/content/${type}`
- `/api/club-auth/logout`

### `public/assets/js/event-modal.js`

- `/api/events/${encodeURIComponent(event.clubId)}/${encodeURIComponent(event.eventIndex)}/view`
- `/api/events/${encodeURIComponent(activeEvent.clubId)}/${encodeURIComponent(activeEvent.eventIndex)}/registrations`

### `public/assets/js/layout.js`

- `/api/site/visitor-ping`

### `public/assets/js/member-directory.js`

- `/api/clubs`
- `/api/committee/club-members`
- `/api/admin/club-members`

### `public/assets/js/pages/booths.js`

- `/api/clubs`

### `public/assets/js/pages/event-detail.js`

- `/api/clubs`
- `/api/events/${encodeURIComponent(clubId)}/${encodeURIComponent(eventIndex)}/view`
- `/api/events/${clubId}/${eventIndex}/registrations`

### `public/assets/js/pages/events.js`

- `/api/clubs`

### `public/assets/js/pages/sponsors.js`

- `/api/clubs`

### `public/pages/applicant-login.html`

- `/api/auth/login`
- `/api/student-auth/google-config`
- `/api/student-auth/google`

### `public/pages/forgot-password.html`

- `/api/password-reset/request`

### `public/pages/reset-password.html`

- `/api/password-reset/confirm`

## Server entry points and API routes (read-only inventory)

All source code and route handlers here remain unchanged. `api/index.js` exports a Vercel handler that awaits `server.ensureReady()`. `server.js` imports `models.js` and seed helpers. `dev.js` starts nodemon; package scripts also invoke backup/restore tools, which import mongoose and the XLSX helper. These are database-capable entry points, so none are imported by the audit tests.

| Method | Route or mount | Original line |
|---|---|---:|
| POST | `/api/site/visitor-ping` | 815 |
| GET | `/api/clubs` | 1142 |
| POST | `/api/clubs/:id/view` | 1155 |
| GET | `/api/admin/session` | 1168 |
| POST | `/api/events/:clubId/:eventIndex/view` | 1181 |
| GET | `/api/club-auth/session` | 1204 |
| POST | `/api/club-auth/login` | 1233 |
| POST | `/api/club-auth/logout` | 1273 |
| GET | `/api/club/dashboard` | 1278 |
| POST | `/api/events/:clubId/:eventIndex/registrations` | 1291 |
| GET | `/api/club/attendance-events` | 1336 |
| POST | `/api/club/attendance-sessions` | 1376 |
| POST | `/api/club/attendance-qr-challenge` | 1478 |
| GET | `/api/club/attendance-records` | 1497 |
| GET | `/api/committee/attendance-overview` | 1523 |
| GET | `/api/committee/attendance-records` | 1589 |
| GET | `/api/attendance/:token` | 1622 |
| POST | `/api/attendance/:token` | 1649 |
| GET | `/api/club/event-registrations` | 1696 |
| GET | `/api/clubs/:id/committees` | 1715 |
| GET | `/api/clubs/:id/application-committees` | 1797 |
| GET | `/api/club/committee-availability` | 1838 |
| PUT | `/api/club/committee-availability` | 1845 |
| GET | `/api/club/heads` | 1849 |
| GET | `/api/club/members` | 1855 |
| POST | `/api/club/members` | 1883 |
| GET | `/api/club/application-form` | 1917 |
| PUT | `/api/club/application-form` | 1926 |
| GET | `/api/club/interview-form` | 1949 |
| PUT | `/api/club/interview-form` | 1964 |
| POST | `/api/club/heads` | 1988 |
| PATCH | `/api/club/heads/:email` | 2031 |
| DELETE | `/api/club/heads/:email` | 2108 |
| GET | `/api/committee/attendance-reviews` | 2138 |
| POST | `/api/committee/attendance-reviews/:clubId/:itemType/:eventRequestId/approve` | 2172 |
| GET | `/api/committee/club-members` | 2202 |
| GET | `/api/club/content` | 2431 |
| POST | `/api/club/content` | 2445 |
| POST | `/api/club/content/${moduleType}` | 2457 |
| PUT | `/api/club/content/:id` | 2505 |
| DELETE | `/api/club/content/:id` | 2563 |
| GET | `/api/committee/requests` | 2590 |
| GET | `/api/committee/status` | 2602 |
| GET | `/api/committee/status/:id` | 2616 |
| POST | `/api/committee/requests/:id/reopen` | 2629 |
| POST | `/api/committee/requests/:id/return-to-committee` | 2669 |
| DELETE | `/api/committee/requests/:id` | 2710 |
| DELETE | `/api/committee/requests/:id/comment` | 2739 |
| POST | `/api/committee/requests/:id/action` | 2772 |
| GET | `/api/student-auth/google-config` | 2970 |
| POST | `/api/student-auth/google` | 2980 |
| GET | `/api/student-auth/session` | 3031 |
| POST | `/api/auth/login` | 3036 |
| POST | `/api/admin/setup` | 3096 |
| POST | `/api/admin/login` | 3126 |
| POST | `/api/admin/logout` | 3152 |
| POST | `/api/password-reset/request` | 3249 |
| POST | `/api/password-reset/confirm` | 3313 |
| USE | `/api/admin` | 3403 |
| GET | `/api/admin/visitor-analytics` | 3405 |
| GET | `/api/admin/system/data-status` | 3455 |
| GET | `/api/admin/clubs/:id/committee-availability` | 3508 |
| PUT | `/api/admin/clubs/:id/committee-availability` | 3516 |
| GET | `/api/admin/club-views` | 3522 |
| GET | `/api/admin/event-analytics` | 3531 |
| GET | `/api/admin/club-members` | 3586 |
| GET | `/api/admin/clubs/archived` | 3596 |
| GET | `/api/admin/applications` | 3609 |
| PATCH | `/api/admin/applications/:id/status` | 3622 |
| DELETE | `/api/admin/applications/:id` | 3647 |
| GET | `/api/admin/club-heads` | 3663 |
| POST | `/api/admin/club-heads` | 3675 |
| PATCH | `/api/admin/club-heads/:email` | 3719 |
| DELETE | `/api/admin/club-heads/:email` | 3789 |
| GET | `/api/admin/club-credentials` | 3807 |
| GET | `/admin/club-credentials` | 3820 |
| GET | `/admin/global` | 3825 |
| GET | `/api/admin/homepage` | 3830 |
| PUT | `/api/admin/homepage` | 3843 |
| POST | `/api/admin/clubs` | 3867 |
| PUT | `/api/admin/clubs/order` | 3937 |
| PATCH | `/api/admin/clubs/:id` | 3970 |
| POST | `/api/admin/clubs/:id/archive` | 3998 |
| POST | `/api/admin/clubs/:id/restore` | 4024 |
| GET | `/api/club/applications` | 4046 |
| GET | `/api/club/:id/applications` | 4059 |
| GET | `/api/applications` | 4073 |
| POST | `/api/applications` | 4085 |
| POST | `/api/my-forms/access` | 4175 |
| GET | `/api/my-forms/:id` | 4182 |
| PATCH | `/api/my-forms/:id` | 4189 |
| DELETE | `/api/my-forms/:id` | 4273 |
| PATCH | `/api/applications/:id/status` | 4298 |
| DELETE | `/api/applications/:id` | 4366 |
| GET | `/club.html` | 4386 |
| GET | `/apply.html` | 4387 |
| GET | `/committee.html` | 4388 |
| GET | `/club-application.html` | 4390 |
| GET | `/committee-dashboard.html` | 4394 |
| GET | `/attendance` | 4395 |

The additional SPA route array (`/admin`, `/club-login`, `/club-dashboard`) serves `public/index.html`. Express serves `public/` statically; the two `private/` pages are sent only through guarded admin routes. `404.html` and `500.html` are error views. Legacy redirects and request middleware remain unchanged.

## Local/generated inputs retained

| Input | Handling |
|---|---|
| `.env`, `.env.local` | Ignored local settings; contents not inspected or copied. |
| Ignored admin/club account JSON | Credential stores; contents not inspected or copied. |
| `.vercel/` | Deployment metadata, not refactored. |
| `node_modules/` | Installed vendor code, excluded from first-party cleanup. |
| `data/` tracked JSON | Fingerprinted without publishing records; no writes. |
| `miu project new.xlsx` | Existing business document, retained. |
| `ses_*.json` | Existing session-named project artifact; no proof it is disposable, retained. |
| `.frontend-audit/` | New ignored test snapshots, synthetic-data screenshots, Chrome profiles and test output, all on D:. |
