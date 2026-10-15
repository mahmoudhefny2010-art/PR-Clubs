# Admin Dashboard V2 coverage review

This review applies only to the preview under `/admin/dashboard-v2`. The existing Admin, Global Admin, business API handlers, database models, migration code and role-specific workflows were preserved. A before/after SHA-256 comparison covers 56 existing backend and legacy-admin source files; the verification baseline lives in the local, ignored `.frontend-audit` directory. Fixture-server writes were used to exercise the interface; no site records were edited for this review.

The preview now has **27 tools**. The catalog in `public/assets/js/admin-dashboard-tools.js` is shared by HTML route registration and the browser, preventing cards from pointing to missing pages. All tools retain the preview's card styling, page layout, inline confirmations, browser Back, stable reload URLs, loading/offline behavior and session-scoped caches. The footer continues to use the original site component. The new administration navbar contains the MIU logo, admin shortcuts, tool search, theme, refresh, public-site link and sign-out. The Administrator account card replaces the former MIU Clubs brand at the top of the sidebar.

## Administrative coverage

| Existing capability | Preview tool and preserved behavior |
| --- | --- |
| Homepage title and introduction | `homepage`: existing GET/PUT settings APIs |
| Club creation, images, details, status, pin, capacity and account credentials | `clubs`: existing creation and update APIs; full editable fields and existing media are preserved |
| Club archive/restore | `clubs`, `archives`: existing archive/restore actions |
| Club card ordering | **`club-order`**: complete ordered ID list; moves stay inside registration/pin groups, matching the old interface |
| Club-specific form intro, text/long-answer/dropdown questions, required flags and ordering | **`application-forms`**: existing club update API; identifiers, unique questions and option limits are validated before saving |
| Per-committee open/full/closed state | **`committees`**: existing committee availability GET/PUT APIs; no committees are invented |
| Applications and decisions | `applications`: status and club filters, full applicant details, photos, custom answers, existing interview evaluations, notes, rating, accepted/rejected/pending decisions and confirmed deletion |
| Committee head accounts | `heads`: add, update, optional password replacement and removal through existing head APIs |
| Staff accounts and multiple dashboard/club assignments | `staff`: existing verified staff editor and role workflow |
| Supervisor accounts and club assignments | `supervisors`: existing assignment and removal workflow |
| Member rosters | `members`: existing member-directory API; admin remains a directory reviewer, not an unauthorized roster editor |
| Staff account emails and roles | **`staff`**: manage MIU Google accounts and assignments; the legacy club account directory and its exclusive listing API were removed |
| Emailed account reset | `recovery`: existing password-reset request and student-account policy |
| Direct club/dashboard password changes | **`account-passwords`**: existing confirmation, verification and session-revocation workflow |
| Current admin identity and local login changes | **`admin-settings`**: honors `editable` and `environmentManaged`; existing local/environment restrictions are retained |
| Account photo | **`profile`**: existing image upload and account-photo GET/PUT/DELETE APIs, with initial fallback |
| MIU announcements, events, audience, registration, attendance, custom images, polls and evaluations | `publishing`: existing MIU publishing form and APIs |
| Published club events/news/booths/sponsors and MIU updates | **`website-content`**: searchable read-only overview using existing published-data APIs; role-specific club content permissions are not bypassed |
| Club student ratings and individual comments | **`club-feedback`**: existing reviewer API, search/response filters and full response pages |
| University poll votes and evaluations | **`university-feedback`**: existing reviewer API; anonymous university response policy is preserved |
| Club views, demand/capacity, acceptance, top applicants and archived/full-club totals | **`club-analytics`**: existing analytics sources with the original submitted/accepted calculations |
| Event views, registrations, student interest/registrations and verified check-ins | **`event-analytics`**: existing analytics API and actual returned metrics |
| Visitor traffic, active accounts, devices and network information | `analytics`: restores the existing who-is-online information in addition to totals |
| MIU attendance teams, QR sessions and session closure | `miu-attendance`: existing manager form, account checks and workflow |
| Event reports and attendance exports | `reports`, `attendance`, `open-attendance`: existing date/year/event filters, permission scopes and Excel downloads |
| Database connectivity and section counts | `data`: existing read-only data-status API |
| Sign-in, Back, refresh, loading, offline and sign-out | Original authentication and site infrastructure, with an administration-specific navigation shell |

New tools are shown in **bold**. Existing tools were expanded rather than replaced with placeholders.

## Permission boundaries retained

Review included the HTML page inventory, registered Express route inventory, legacy Admin/Global Admin controls, the model fields used by those controls, and the handlers for staff, supervisors, feedback, university publishing, attendance, reports, content, speaker requests, student registration, accounts and recovery.

| Other project area | Existing access and preview treatment |
| --- | --- |
| PR / English / Security / Dean content approvals and entry permits | Committee-role endpoints remain restricted to their existing roles. No global-admin override or copied approval action was added. |
| PR / SSO / Dean attendance approvals | Original stage ordering and assigned-role checks remain intact. Admin exports show the stored review status. |
| Supervisor content/speaker/attendance reviews | Assigned-supervisor endpoints remain restricted to that identity and assigned clubs. Admin manages assignments through the existing administrative tool. |
| Club Content Studio, club event/news/booth/sponsor editors | Original president/head identities and assignment rules remain required. The admin content overview displays published content without impersonating club accounts. |
| Event report writing and supervisor review | Writing/review endpoints require a president or assigned supervisor. Admin retains its existing authorized export access. |
| Speaker invitations and requests | Student/club requester and review-role rules remain unchanged; no admin-only API exists to expose every request. |
| Student forms, profile, event registration, interests and feedback submission | Student ownership and Google account policies remain unchanged. Admin views only information already exposed by administrative APIs. |
| Public clubs, events, feed, sponsors, booths, calendar, help/privacy and Ask AI | Public behavior remains unchanged; the admin website link and published-content overview provide access without changing these pages. |
| Backup, TTL cleanup and provider migrations | Existing operational scripts and schedules remain outside the website UI; no unsupported backup or SQL-execution buttons were introduced. |

## Promotion to the only dashboard — 15 October 2026

The preview was promoted to `/admin`; tools use `/admin/<tool>` and login uses `/admin/login`. Legacy Admin, Global Admin and the standalone credentials page were removed. Their shared club/student form code was retained in `app-forms.js`. The preservation hashes below describe the earlier preview-only phase, before the user authorized retiring the legacy interfaces. Administrative API behavior, accounts and site records remain in place.

## Validation

- Frontend structure and local-asset validation.
- Unit checks for tool routes, shared shell, revision dependencies, cache isolation, failed responses and binary download bypass.
- Actual Chrome checks against an isolated fixture server: all 27 tool pages, admin navbar, footer, responsive widths, Back/reload, cached data, change notifications, unsaved edits, offline notice, legacy default Admin route, and representative saves for clubs, heads, committees, form questions, ordering, application reviews and password changes.
- Cross-provider route registration audit, with no database connections.
- Hash verification that the 56 existing backend/legacy-admin files stayed unchanged during this task.

The source SQL database was not mutated. UI mutation tests do not claim a live end-to-end save against production data.
