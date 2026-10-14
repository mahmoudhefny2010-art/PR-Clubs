# One Google sign-in across roles and student features

Previously Google sign-in for an assigned staff/club role intentionally cleared the student cookie. Event registration, attendance, feedback and student forms accepted only the student cookie, so a signed-in person was asked to sign in again. Repeating Google sign-in selected the same staff role and did not resolve the loop.

Student authentication now also accepts an existing, server-validated staff/admin session whose saved Google identity belongs to the MIU domain. This uses the existing signature, expiry, session-version and role-assignment checks. An absent, expired or revoked role session cannot authorize access. Password-only staff accounts and non-MIU accounts do not gain this fallback.

The shared resolver reuses the matching student profile or creates one atomically when student features are first accessed. It preserves passwords, student profile fields, session versions and Google links, rejects conflicting subjects, and never changes staff roles or club/member eligibility. There is no new student cookie that can outlive the role session. Normal student-cookie validation remains unchanged, including rejecting invalid/revoked student cookies.

The header continues to represent the selected staff identity; it does not silently switch the signed-in person into the student dashboard or change notification identity. Existing role choices remain available when a browser also has a normal student session. Sign-out clears student, club and admin cookies together. Registration sign-in links retain the current page as the return destination.

The correction applies to existing Google role sessions without a migration or another sign-in. Focused tests cover reuse, concurrent profile provisioning, identity collisions, invalid sessions, Google admin access, role-menu preservation, sign-out and event-registration status through the existing HTTP endpoint. Tests use synthetic models and isolated local HTTP servers, without real accounts or database writes.
