# MIU staff Google sign-in

The existing Google button checks an authenticated, verified MIU Google identity against the explicitly configured administrator email, then ClubAccount, before the student account flow. All club staff roles (president, head, supervisor, PR, English, Security, SSO, Dean and Software Development team) use their assigned role, club scope and session version. An MIU domain alone never grants staff permissions: an administrator must first provision the staff role and scope. Global admin Google access requires the exact configured admin email and a bound Google subject.

The server continues to verify the Google signature, audience, nonce, hosted domain and verified email using the existing Google verifier. The verified subject is linked to the staff account with a unique sparse googleSub index. Subject collisions, replacing an existing subject and concurrent account changes are rejected. The role is never read from a Google form payload. Staff receive the existing HttpOnly club cookie; previous student/admin cookies are cleared in that browser when switching accounts.

For a new supervisor, the admin can enter the MIU email and at least one club, leaving Initial password empty. The server stores an unpredictable password hash to satisfy the existing account schema; no temporary password is returned or displayed. The staff member uses the existing Google button on the sign-in page. No new OAuth credentials are needed: existing GOOGLE_CLIENT_ID and Google authorized origins remain in use.

Supervisor management and Staff accounts & roles now provide **New password** and **Confirm new password** for both new and existing accounts. A supplied password must match confirmation and contain 12–200 characters. Saving replaces the active salt/hash and revokes previous sessions; leaving the fields empty keeps the existing password or provisions Google-only sign-in for a new MIU account. A password save reports success only after reading the account from the primary database with majority read concern and verifying the supplied password against its persisted hash. No real account password was reset during implementation.

## Assigning every staff role

Open **Admin → Staff accounts & roles**, beside the archived clubs and supervisor management buttons. Enter the staff member's MIU Google email and select the role. Presidents and committee heads require exactly one active club; heads also require a committee name. Supervisors require at least one club and can oversee several. PR, English, Security, SSO and Dean use their existing committee dashboards and do not take club assignments. Save, then the user signs in with Google through the existing sign-in page. Existing emails can be edited; saving a role change revokes previous sessions and preserves the account ID, password hash and Google binding. An email has one staff role at a time; multiple staff can be explicitly assigned to a club or committee by the admin.

The new GET/PUT `/api/admin/staff-accounts` endpoints sit behind the existing requireAdmin middleware. The write endpoint also checks same origin, MIU email, role allowlist, required scope, active clubs and concurrent changes. Password hashes/Google subjects are not returned to the management UI. Staff management cannot assign the global admin role or overwrite the configured global admin account. Creating an account never changes another account's role implicitly.

## Password sign-in consistency

Both portal password login endpoints now read ClubAccount from the primary database with majority read concern. If the database is unavailable, they return 503 instead of authenticating against a potentially stale private cache. Bootstrap account insertion matches the unique email rather than clubId plus email, preserving persisted password/role changes across restarts. A known staff email with the wrong password cannot fall back to an older student password for that email. Password recovery and admin password tools now recognize a real staff account even when a historical student record has the same email. Browser cookies for another account type are cleared when switching sign-in type.

`services/account-passwords.js` centralizes password input validation, hashing and persisted-password verification for account management. `tests/account-password-lifecycle.test.js` exercises actual management and password sign-in handlers with isolated persistence: new accounts for all nine dashboard roles, old-password rejection after replacement, Google-binding preservation, session revocation, empty-password preservation, confirmation errors, read-confirmation failures and stale-cache denial. Thirty related tests passed; the live account diagnostic was read-only and did not compare or change its current password.

Global admin Google sign-in retains the existing password and session version. If the admin uses environment-based credentials without a database auth record, Google linking creates that auth record using a hash of the existing configured password; it does not generate a replacement password. Non-MIU administrator emails continue to use their existing sign-in because the Google verifier accepts only the MIU domain.

Additional files: `services/staff-account-admin.js`, `public/dashboards/staff-management.html`, `public/assets/js/staff-management.js` and `tests/staff-account-admin.test.js`. The admin toolbar, shared management CSS and global admin Google binding schema are integrated as well. No live role assignments or passwords were changed while implementing this feature.

When provisioning a Google-only supervisor, an existing student account with the same verified MIU email can be retained. It is not deleted or merged; staff login takes precedence because the admin explicitly assigned that role. Other student email collisions and accounts assigned a different staff role are still rejected by supervisor management.

## Multiple dashboard roles per account

An MIU staff account can hold several dashboard assignments under one email, Google subject and password. Each assignment stores its own role, club scope, committee and destination. The first assignment remains the default after sign-in; the profile menu lists the other assigned dashboards. Switching sends a same-origin request and issues a signed session containing the chosen role and scope. The server checks that assignment on every request; role edits increment the shared session version and revoke old sessions. Supervisor management can add or remove only the supervisor assignment while retaining other roles.

`tests/supervisor-dashboard.test.js` verifies signed role selection and rejects a role or club scope that is not assigned. `tests/staff-account-admin.test.js` verifies multi-role validation, duplicate-role rejection and role-specific scopes. Dashboard switching requires the live database and same-origin request.

Changed files: server.js, models.js, services/staff-google-auth.js, services/supervisor-admin.js, supervisor management HTML/JS, applicant login HTML/JS, and tests/staff-google-auth.test.js.

Validation uses mocked Google/DB boundaries and real password hashing. It checks every staff redirect, preservation of assignments, unknown-email handling, subject collisions, attempted role injection, invalid credentials, Google-only provisioning, and rejection of silently changing an existing password. No real Google sign-in or live account modification is performed by the tests. A read-only MongoDB check confirmed the reported supervisor account exists, has one club assignment and a password hash of the expected length; it did not verify the password entered in the screenshot.

## Software Development team and navigation

Administrators can assign the software_development role through Staff accounts & roles using an MIU email. It grants the existing administrator dashboard and API permissions. No club assignment is needed. Google sign-in uses the existing verified identity flow; only a stored role grants access. Delegated administrators retain individual signed ClubAccount sessions and notification identities. Administrator authorization requires a modern session and a live database lookup; changing the role/session version removes access. Admin logout clears both administrator and staff cookies.

Both password and Google sign-in send staff directly to their role dashboard. Students default to My Dashboard and retain safe explicit return links. Shared Back links return to a prior same-origin page, excluding login pages, and retain their href as fallback for direct visits. Dashboard Home links remain explicit. Inline dashboard Back controls preserve their previous view.

Validation: 18 isolated tests passed for role assignment, Google binding, password login, delegated admin revocation/offline denial and safe Back navigation. No live Google login or browser/device navigation was performed.
