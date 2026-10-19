# Custom staff roles and generated dashboards

Open **Admin → Staff & access → Roles & dashboards** (`/admin/custom-roles`).

1. Enter the role/dashboard name and a short description.
2. Choose access to assigned clubs or all clubs.
3. Select the dashboard tools: Request inbox and/or Notifications.
4. For the request inbox, select the request types and allowed actions: approve,
   reject, request corrections, comment, assign, escalate, history and scoped
   visibility. These are maximum permissions, not administrator rights.
5. Add one or more MIU staff email addresses. For club scope, choose clubs by
   name for each member. Save the role.
6. In **Workflow management**, select the new role as a stage reviewer. Its
   permitted actions are preselected when it is added; the stage can narrow them.
   Only roles eligible for the selected request type appear in the role picker.

Assigned staff sign in using **MIU Google**. Existing accounts retain their
passwords and other role assignments. A newly provisioned account receives a
random, undisclosed password and uses the existing verified Google sign-in; no
password is emailed or displayed. The named dashboard appears in **My dashboards**.
Switching to it uses the existing signed, revocable staff session.

The dashboard is generated from a shared template at
`/dashboards/custom-role.html?role=<generated-key>`, with the site's sidebar,
cards, responsive layout and dark theme. It displays only selected tools and
request types. Review actions still require the matching configured workflow
stage. Dashboard links cannot grant access to unassigned users.

## Scope and security

- Definitions and assignments live in the existing database, not a browser store.
  `CustomStaffRole` stores the role; `ClubAccount.roleAssignments` stores staff
  assignment and club scope. Built-in roles retain their existing identities.
- New role keys use a reserved generated prefix. Names are display text; they
  cannot become route paths, executable rules or administrator capabilities.
- Role management is admin-only, same-origin protected, version checked and
  transactional. Definitions, account assignments, session invalidation and the
  AuditLog write succeed or roll back together.
- In a selected custom dashboard, workflow authorization uses that role's live
  permissions, scope, modules and request types. It does not merge in the user's
  other staff roles. Existing built-in authentication and scope checks remain.
- Assignment changes revoke old staff sessions. Disabling a role immediately
  denies it even with a valid old cookie. Removing an account's last custom role
  cannot reactivate it through the legacy primary-role fallback. Credentials and
  Google binding are retained so reassigning the same account is safe.
- Request decisions reload custom grants inside the workflow transaction.
  Role permissions and stage permissions intersect; neither can increase the
  other. Clubs, types and private attachments enforce the same scope on the API.
- Notifications check access again before display and email delivery. Pending
  email for a revoked recipient is stopped and audited with
  `RECIPIENT_ACCESS_REVOKED`; SMTP delivery is never falsely reported as success.
- Disabled roles can be re-enabled. Their previous request snapshots retain the
  role key. If an active request needs a disabled role, restore that role or its
  eligible staffing before continuing; decisions do not skip required review.

The initial capability catalog is the existing **approval workflow**: requests,
notifications and the listed review actions/types. These roles do not implicitly
grant attendance administration, university publishing, account management or
arbitrary admin widgets. Those established capabilities remain with their
existing roles.

## Database setup

SQL migration `database/migrations/008-custom-staff-roles.sql` adds the role table,
grants its runtime CRUD permissions, and updates only ClubAccount checks that
reference the role column. Existing built-in accounts and audit restrictions are
preserved. Applied successfully to the configured local SQL target:

```powershell
node scripts/custom-role-schema.cjs --apply
```

The command uses the established explicit isolated-target gate and protected
operations credentials. Fresh SQL schemas also include the model. MongoDB
initializes the new model/index through the existing startup path. Transactions
require a replica set/sharded MongoDB deployment, as for the workflow engine.

No new external provider is required. MIU Google and optional SMTP reuse the
existing environment configuration. Real SMTP was not exercised or claimed sent.

## Verification

- Role service and HTTP tests verify admin-only writes, MIU emails, scope,
  generated links, account provisioning, preserving built-in assignments and
  passwords, rollback, version conflicts, disabled/revoked access, module guards,
  and per-type/per-stage permission enforcement.
- Google tests cover custom dashboard login, stored subject ownership and
  disabled-role fallback without staff access. Workflow tests cover cancellation
  of queued emails after staff access is removed.
- Browser fixture checks create a role, assign an email and club, save permission
  changes, open its generated dashboard and verify unselected tools are absent.
  Light/dark and 375px/1440px layouts are checked. Account-menu checks cover the
  generated dashboard label and destination.
- `node scripts/check-workflow-sql.cjs` passed with the runtime SQL account:
  role creation, staff provisioning, workflow routing to the new role, approval
  and revocation. All QA data was rolled back; no test transaction was committed.
- Final `node --test tests/*.test.js`: **489 tests, 487 passed, 2 skipped,
  0 failed**. The skipped generic SQL tests require their explicit opt-in setup;
  the rollback-only custom role SQL check above ran successfully.
- `npm.cmd run check:frontend` passed: 46 HTML pages, 79 external scripts and
  662 local asset references. Custom role builder/dashboard browser checks and
  all four custom account-menu viewport/theme checks passed without script errors.

Main files: `services/custom-staff-roles.js`, `services/custom-staff-role-routes.js`,
`services/custom-staff-role-model.js`, `services/custom-staff-access.js`,
`services/staff-role-keys.js`, `public/assets/js/custom-role-admin.js`,
`public/assets/js/custom-role-dashboard.js`, `public/dashboards/custom-role.html`.
Existing staff authentication, header, role management, workflow engine, admin
tool registry, SQL catalog and related styles are extended to integrate them.
