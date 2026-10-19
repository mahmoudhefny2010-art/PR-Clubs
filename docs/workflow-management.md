# Workflow management

## Existing architecture audit

The application uses Express (`server.js`), Mongoose schemas (`models.js`) and a
SQL Server compatibility adapter (`database/`). The configured local provider is
SQL Server; MongoDB remains supported. Admin tools are registered in
`admin-dashboard-tools.js` and rendered within the existing admin workspace.

ContentRequest already stores events, feed posts, sponsors, booths and entry
permits, comments and workflow history. SpeakerRequest is a separate existing
request model. ClubAccount supports multiple staff assignments and club scopes.
Supervisor review, PR, English, Security and Dean routes currently hardcode their
transitions. Existing publication code writes approved content into Club arrays.
Attendance approvals have a separate established lifecycle and remain intact.

Existing return-for-edit actions identify the returning role but do not persist
an exact field allowlist. Legacy resubmission changes most form fields. Several
legacy actions save the request and publication separately. Content notifications
currently use OneSignal/NotificationDispatch; SMTP is already configured through
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM. AuditLog is the
existing append-only audit destination.

## Integration design

Workflow definitions are versioned database records, one current definition per
request type. Requests remain in ContentRequest/SpeakerRequest and carry an
embedded immutable definition snapshot, revision number, current stage, selected
revision fields, reviewer assignments and before/after history. Configuration
changes apply to future submissions; existing requests keep their snapshot.
No user-supplied executable expressions are accepted.

Managed requests use the same authentication and club scopes. Club-owned roles
are scoped to their own club; supervisors to assigned clubs; global reviewers to
their established staff role. Configuration changes require the existing admin
guard. The engine uses transactions and compare-and-swap revision checks, and
persists notifications with the same request decision. Email delivery is retried
outside the approval transaction. Legacy requests retain their existing routing;
legacy mutation endpoints cannot bypass a managed request's engine.

Field identifiers come from explicit server schemas for each request type.
Revision patches permit only the fields selected by the reviewer. Structured
permit rows and uploads retain dedicated validators; identity, club, status,
workflow, timestamps and publication metadata are never client-editable.

## Administration and daily use

Open **Admin → Website & clubs → Workflow management** (`/admin/workflows`).
Select a request type. Rename stages, add/remove/reorder stages, select a starting
stage, next stage and resubmission destination. A blank next stage means final
approval. Choose eligible existing staff roles and their individual permissions.
Staff accounts and club assignments continue to be managed through the existing
Staff & access tools; configuring a stage never grants a user a staff role.

Choose either one eligible approver or one distinct approver per assigned role.
For automatic forwarding, clear correction fields and the request-changes
permission, select a next stage and enable automatic forwarding. Disabled stages
are bypassed along their configured next links. Escalation targets must be later
enabled stages on the forward path. Revision loops are explicit, separate from
forward routing. Invalid, cyclic, inaccessible or approverless configurations
are rejected. Saving uses a version check and archives the previous definition.

Existing pending requests retain their complete definition snapshot, including
permissions and correction rules. Legacy requests without a snapshot retain
their original review process; they are not silently migrated. New submissions
and existing drafts first submitted after installation use the current definition.
A review stage remains pending when its roles have no eligible reviewers.
Empty roles are never skipped automatically. The request keeps its saved
workflow, current stage and existing approvals. Only stages explicitly disabled
or configured for automatic forwarding are bypassed.

Open **Admin ? Website & clubs ? Blocked approval requests**
(`/admin/blocked-requests`) to see the stage and shortage. Open a request to
review it using the same request fields, correction controls and decision form
used by role reviewers. Administrators select **Review on behalf of role** and
can approve, reject, request corrections or comment according to that role's
saved stage permissions, including when the role is empty or disabled.
This is available for any current-stage role, including staffed roles.

Each administrator action is audited under the administrator's real email and
role, with `onBehalfOfRole` identifying the selected review role. An all-roles
stage requires a separate explicit decision for every role; the administrator
can cover multiple roles, but cannot approve the same role twice. Ordinary
reviewers still require distinct people and retain all existing scope checks.
Approval advances only to the saved next stage. Correction fields, required
comments, escalation destinations and optimistic revision checks still apply.

The administrator-only inbox API is
`GET /api/admin/workflows/blocked?page=1` (50 rows per page). Opening the inbox
rechecks availability; the server also checks pending requests every 30 seconds.
Assigning staff or repairing scope clears the shortage without advancing the
request. Existing skip-waiver metadata is removed on recheck; requests already
advanced under a previous policy are not rewound automatically.

The admin sidebar and blocked-request tool card show the total pending count.
The badge is red if any current blocked request has not been viewed, and yellow
after opening the inbox while requests remain pending. New arrivals restore red,
including while the inbox is open; automatic live refresh does not mark them
viewed. Opening the inbox again or explicitly refreshing it marks the loaded
snapshot viewed. The badge disappears at zero. Seen keys are stored in browser
storage under the authenticated admin session's cache key, with cross-tab
updates. `GET /api/admin/workflows/blocked?summary=1` returns only `total` and
all blocked identity `keys`, independent of inbox pagination. Keys include the
request, stage and start of its current blocked period, so routine updates do
not repeatedly create unread arrivals. Counts refresh on live invalidation,
successful local changes, reconnection, focus and returning to the tab.

Dashboard navigation links open `/pages/workflow.html` for clubs and reviewers;
the admin keeps its existing Workflow management card without an extra top card.
Managed requests are reviewed there; old reviewer queues continue to show legacy
requests. Filters include new, pending, changes requested, resubmitted, approved,
rejected, request type, club, stage and assigned email, with 50 records per page.
The admin card includes the same overview and email-delivery investigation view.

Reviewers select eligible correction fields and enter overall and per-field
instructions. Club owners see only those fields enabled; other fields remain
read-only. Resubmission sends only changed fields. The server rejects extra
fields, validates structured permit rows and upload grants, and preserves the
original locked values. By default every requested field must change; admins can
disable that rule per stage. Failed validation retains the entered form values.
History records each round's instructions and before/after values.

## Database installation

No new database engine or dependency is required. Request snapshots are Mixed
fields in the existing models and are retained in SQL's existing JSON payload.
`WorkflowDefinition` and `WorkflowNotification` are the two additional models.

For the configured isolated SQL target, using protected operations credentials:

```powershell
node scripts/workflow-schema.cjs --apply
```

The additive SQL migration is `database/migrations/007-workflows.sql`. It was
applied successfully to the local target during implementation. The existing
isolated-target gate must match the configured database. Runtime permissions are
granted on the two new tables; existing AuditLog append-only grants are preserved.
Fresh installations also include the tables in `001-platform.sql`.

MongoDB initializes the two models/indexes through the existing startup path.
Atomic workflow changes require transaction support (a replica set or sharded
deployment). Existing requests and public content are not deleted or rewritten.

## Notifications and SMTP

Request decisions, history, AuditLog entries and persistent in-app/outbox records
commit together. Final content approval also updates the existing Club publication
array in that transaction; permits and speaker requests remain internal. Existing
published-content OneSignal dispatch runs after commit.

Configure these existing environment variables on the server:

```dotenv
SMTP_HOST=your-provider-host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-provider-user
SMTP_PASSWORD=your-provider-secret
EMAIL_FROM=MIU Clubs <verified-sender@example.com>
SITE_URL=https://your-site.example
```

`ONESIGNAL_SITE_URL` is accepted when SITE_URL is absent. Never expose SMTP
variables in browser assets or commit `.env`. SMTP_HOST/USER/PASSWORD/EMAIL_FROM
were absent locally; no real email was sent or claimed delivered. Delivery tests
use fake transports to verify provider acceptance and failure paths.

Email runs outside request transactions, with persistent pending/sending/sent/
failed/unconfigured states, a two-minute claim lease, stable Message-ID, up to
five attempts and exponential backoff. Outcomes are audited. A stable event key
prevents duplicate outbox records. Provider acceptance means SMTP accepted the
message, not guaranteed inbox delivery. As with ordinary SMTP outboxes, a crash
after provider acceptance but before saving the result can cause a retry.

The long-running Node server drains the queue every 30 seconds; actions and the
notification views also trigger draining. Serverless platforms suspend timers:
without traffic, run the application as a persistent worker or arrange a
scheduled authenticated queue-draining request to the admin notification API.
Failed/unconfigured messages have a Retry email control. No SMTP outage blocks
or rolls back a successfully committed approval decision.

Notifications are recipient-bound and recheck current request access before
display/read/retry. Admin delivery investigation is globally authorized. Links
require the normal account session; attachment downloads additionally check the
stage's inspectable-field permission and generate short-lived private URLs.

## Security and operational boundaries

- Existing session authentication, administrator guard and staff/club scopes are
  reused. Clients cannot supply roles, ownership, workflow state or publication
  metadata. Request authors cannot approve their own submissions.
- Permission checks, selected-field allowlists, current stage and revision checks
  run on the server. Rejection is terminal; no implicit reopen exists.
- Atomic compare-and-swap rejects stale/concurrent decisions and duplicate stage
  approvals. Outbox failure rolls back request/history/publication/audit together.
- Old mutation endpoints reject managed requests. Old committee/supervisor queues
  exclude managed records so their broader field views cannot bypass the new
  inspector. Old private CV links pass through the new attachment authorization.
- Same-origin checks and existing HTTP security middleware protect mutations.
  Workflow mutations additionally have an account rate limit of 60/minute per
  process. A shared rate-limit store is needed for an aggregate multi-instance
  quota. Rules are declarative allowlisted data, never executable expressions.
- Request filtering applies club scope before loading and then checks individual
  visibility. Page slicing is currently in application memory; large installations
  should add indexed workflow projections before high request volumes.
- Attendance keeps its separate approval lifecycle. Custom roles are now managed
  through the integrated [Roles & dashboards builder](custom-staff-roles.md).
  Active requests are not transferred to a new definition and legacy decisions
  are not silently migrated.

## Verification performed

- `node --test tests/*.test.js`: 479 tests, **477 passed, 2 skipped, 0 failed**.
  The two generic SQL integration tests require their explicit opt-in environment.
- `tests/workflow.test.js`: 16 passing workflow tests covering all acceptance
  branches: routing, revisions, multiple rounds, rejection, scope/role/self-review,
  malicious patches, stale/concurrent actions, snapshots/config versions, all-role
  approvals, disabled/automatic stages, escalation, rollback, notification privacy,
  SMTP acceptance/failure, audit outcomes and duplicate-send prevention.
- `node tests/frontend-audit/admin-dashboard-v2.cjs --workflow-only`: passed using
  fixture API responses, not live requests. Verified configuration saves, one-field
  corrections, locked fields and resubmission at 375px/1440px in both themes. Eight
  screenshots are under ignored `.frontend-audit/admin-dashboard-v2/`.
- `node scripts/check-workflow-sql.cjs`: passed against the configured runtime SQL
  account: submission, description-only return, forbidden date patch, resubmission,
  approval, history and persisted notifications. All writes used a transaction
  that was rolled back; no test transaction was committed.
- `npm.cmd run check:frontend`: passed CSS/vendor consistency and structural checks
  for 45 HTML pages and 650 asset references. JavaScript syntax and diff whitespace
  checks passed.
- Updated the source-sliced speaker invitation fixture to mock the real engine
  entry point. Removed an existing literal `\\n` at the end of the spreadsheet
  import test that prevented the file from parsing; its tests now pass.
- Separate legacy `node tests/entry-permit-workflow.js` still fails its old source
  regex expecting a president-only filter. The same regex fails on the original
  HEAD version, whose filter already includes committee-head rules. This stale
  assertion is independent of the dynamic engine; it is not counted as a pass.

## Main implementation files

### Direct messages

The administrator's workflow board includes **Send a message** below the request
list. Enter one recipient address, a subject and a message, then choose Email,
In-app notification or both. Email accepts external addresses; in-app delivery
requires a registered staff account with notification access. Suggested staff
addresses come from `GET /api/admin/workflows/message-recipients`.

`POST /api/admin/workflows/messages` accepts `email`, `title` (160 characters),
`message` (5,000 characters), `channel` (`email`, `notification`, `both`) and a
UUID v4 `requestId`. Only same-origin authenticated administrators may send.
Reusing a request ID with the same payload returns the existing queued message;
changing its payload returns 409. Saving the message and its audit event is atomic.

Direct messages use notification kind `message`; `delivery` metadata is stored
in the existing JSON payload on both database providers, so no SQL migration is
required. Email-only messages are excluded from recipient site inboxes.
Notification-only messages have a null email status and cannot be retried as mail.
The existing email worker handles mail, delivery failures and retries. A queued
message is not reported as delivered; missing email configuration is shown as
`unconfigured`. The UI sends no mail until the administrator submits a message.

Backend: `services/workflow-policy.js`, `services/workflow-engine.js`,
`services/workflow-routes.js`, `services/workflow-models.js`, `server.js`,
`models.js`, `database/catalog.js`, `services/supervisor-dashboard.js`.

Admin integration: `public/assets/js/admin-dashboard-tools.js`,
`public/assets/js/pages/admin-dashboard-v2.js`, `services/admin-dashboard-pages.js`,
`services/admin-dashboard-live.js`.

Request interfaces: `public/pages/workflow.html`,
`public/assets/js/workflow-ui.js`, `public/assets/js/workflow-shortcuts.js`,
`public/assets/css/pages/workflow.css`, `public/assets/js/layout.js`,
`public/assets/js/content-studio.js`, `public/assets/js/committee-dashboard.js`,
`public/assets/js/speaker-request.js`, `public/assets/js/speaker-review.js`.

Migrations/tools: `database/migrations/007-workflows.sql`, updated
`database/migrations/001-platform.sql`, `scripts/workflow-schema.cjs`,
`scripts/check-workflow-sql.cjs`.

Tests: `tests/workflow.test.js`, `tests/frontend-audit/workflow-checks.cjs`, updated
browser harness/fixtures, SQL catalog tests, speaker invitation fixture and the
spreadsheet test syntax correction. Existing unrelated feed/media fixes remain
in the working tree and are not part of this workflow implementation.
