# Student club-event registration

The existing club event URL, event modal, student sessions and EventRegistration collection are reused. University-wide event registration is outside this change and keeps its existing route. No club membership is required to register for club events.

## Workflow

Open an event from the existing Events page or calendar. The event form checks the signed-in student's registration status. Anonymous visitors receive a sign-in link. Eligible students register with one button; personal identity is taken from the authenticated StudentAccount, never submitted name, email or student ID. Successful registration and subsequent page visits show Already registered. Registration never creates an AttendanceRecord or implies physical presence.

Cancellation appears only when the existing event explicitly permits it. Cancellation deletes only the current student's registration and updates existing interest analytics. Verified check-ins remain unchanged. When no cancellation policy is configured, cancellation is disabled.

## Backend rules

GET, POST and DELETE use the existing `/api/events/:clubId/:eventIndex/registrations` URL and student authentication. Writes also require the existing same-origin policy. IDs must be nonnegative decimal safe integers with a positive club ID. Archived clubs, missing events, disabled registration, cancelled events, and explicit nonpublished statuses cannot accept new registrations. Real event dates are required. Dates use Africa/Cairo; past dates expire, and same-day events with a valid HH:mm start time stop accepting new registrations at that time. Other time formats use the date boundary; configure an explicit registrationDeadline for a precise cutoff.

Optional rules on the existing `Club.events` item:

- `capacity`: nonnegative integer. Absence means no configured limit; zero means full. Invalid values fail closed.
- `registrationDeadline`: a valid timestamp; use ISO 8601 with an explicit UTC offset. Missing means the event-date/start-time rules apply.
- `cancellationEnabled`: must be exactly true to permit cancellation while registration remains eligible.
- `cancellationDeadline`: optional valid timestamp, before which cancellation is permitted.

The current event editor has no capacity/deadline/cancellation controls. This change does not invent limits or alter existing event records; rules can be supplied in the existing event data by the university's configuration process. No membership restriction is introduced.

## Consistency

Mutations use MongoDB transactions and increment Club.registrationRevision to serialize competing registration/cancellation requests for the same club. Event rules and registration counts are checked inside that transaction, preventing concurrent overbooking. MongoDB must support transactions (replica set or Atlas). Existing unique club/index/email constraints are retained. A new sparse unique registrationKey and the existing requestId provide a stable event/student key for new request-backed registrations. New registrations also store studentAccountId and eventRequestId. No migration rewrites existing event/user relationships. Duplicate saves are idempotent; competing unique-key conflicts ask the student to refresh their status. Legacy index-based records are recognized by club/index/title/email; reorganizing legacy events still requires preserving their original relationships.

Registration writes are authoritative. Existing StudentInterest analytics are updated after successful mutations; an analytics failure does not undo a confirmed registration. Database failures never return registration success. The UI disables repeated requests and cancels obsolete status handlers when switching between modal events.

## Verification

Database ping and active-club count succeeded before edits. A read-only MongoDB transaction and abort verified live transaction support. No student registrations or existing event data were written during live verification.

`node --test tests/student-event-registration.test.js tests/report-downloads.test.js tests/event-reports.test.js`: 33 passed. Seven registration HTTP tests cover member and nonmember registration, forged identity payloads, status, duplicate submissions, concurrent capacity attempts, anonymous/cross-origin access, invalid IDs, missing/expired/closed events, deadlines, permitted/forbidden cancellation, and database read/write failures. These tests use isolated model doubles; concurrent transaction behavior is simulated rather than load-tested against live registrations. JavaScript syntax checks passed.

`node tests/mobile-sidebar-browser.cjs --registration`: passed in isolated Chrome at 390px, checking account-based submission without identity fields, persistent registration status, and permitted cancellation. The browser check uses local fixture responses, not real student accounts or live registrations.

## Changed files

`models.js`, `server.js`, `services/student-event-registration.js`, `public/assets/js/student-event-registration.js`, `public/assets/js/event-modal.js`, `public/assets/js/pages/event-detail.js`, `public/assets/js/pages/events.js`, `tests/student-event-registration.test.js`, `tests/mobile-sidebar-browser.cjs`, and this document. Event-page script version references are updated in `public/index.html`, `public/pages/events.html`, and `public/pages/event.html`.
