# MIU event synchronization

## Findings

The application already stores university publications in `UniversityContent`,
separately from student Club content. Both Feed and Events already combined those
sources. University publications are immediately public; the existing withdrawal
operation is deletion. This model has no draft, cancellation or separate
publication-status field. Pending club approval requests are not public sources.

The remaining problems were:

1. SQL persists BSON Extended JSON. The paginated reader used ordinary JSON
   parsing and scalar date paths, so real university `createdAt`/`updatedAt` Date
   values became objects or NULL sort keys. University entries could sort behind
   older club content or be excluded from the secondary updates timeline.
2. Homepage university loading started only after club loading succeeded. Its
   live callback also awaited club loading before fetching university updates.
3. The public browser cache ignored explicit `no-store`/`no-cache` reads. A missed
   live invalidation could preserve stale university content across revisits.
4. Event detail polling only checked existence. Titles, descriptions, dates,
   locations, images and registration controls remained at their initial values.
5. Today-event fallback links used `club=0` and array positions for university
   events, although the university detail route needs a stable university ID.
6. Publishing duplicated logic between MIU and admin routes, allocated IDs from
   the current maximum, and treated post-save notification errors as failed
   publication. The dashboard did not offer editing. Its registration list also
   discarded identified registrations after an event title changed.

## Changes and data flow

- `services/university-content.js` provides one public projection and organization
  identity for list, page and detail responses. The university is identified by
  the existing `UniversityContent` source plus registration scope `clubId=0`.
  There is no organization table to backfill and no student Club is reassigned.
  Organization output is `{id: 0, type: 'university', name: 'Misr International University', image: ...}`.
- `services/university-content-admin.js` provides shared confirmed creation,
  idempotent retries, validation, optimistic edits and deletion for both admin and
  MIU routes. Updates preserve the public ID, document ID, author and creation
  timestamp. Type changes are rejected to protect event relationships.
- `services/miu-event-admin.js` keeps the existing assigned-role guard and
  registration listing. Stable `eventRequestId` attribution survives title edits;
  only older records without that ID need the title fallback.
- `server.js` wires those shared services and keeps existing list/create/delete
  contracts. Admin authorization and MIU Events authorization remain in place.
- `services/public-content-pagination.js` decodes SQL payloads with the same BSON
  codec used by normal database reads. `database/public-content-pagination.js`
  recognizes scalar and Extended JSON dates before filtering/ranking, and returns
  only the selected page. It ranks narrow metadata without copying media payloads
  into an intermediate table. Existing grant bounds prevent excessive SQL memory
  reservations. Feed, events, updates, search and counts use the same sources.
- `public/assets/js/app-home.js` loads and refreshes university content independently
  of clubs, uses stable university IDs in Today links, and refreshes an open calendar.
- `public/assets/js/pages/event-detail.js` and `public/assets/js/event-modal.js`
  refresh visible event data from the same record, including registration changes.
  Deleted detail records are withdrawn. Ordinary refreshes preserve form input.
- `public/assets/js/public-live-data.js` honors fresh reads, reuses the existing
  SQL revision/change-stream infrastructure and adds a 30-second refresh fallback
  only while the live stream is unavailable. A recovered stream stops polling.
- `public/assets/js/miu-events-dashboard.js` edits in place, preserves existing
  images, sends version tokens and publication idempotency keys, and invalidates
  university snapshots after successful writes. Existing templates retain their
  design with Edit and Cancel editing controls. Generated admin publishing pages
  use the same updated dashboard script.

No duplicated Feed/Timeline event records, persistent tables, schema migrations,
database replacements or organization-reference rewrites were introduced.

## API additions and retry behavior

- `GET /api/university-content/:id`: fresh public event details; 404 after removal.
- `PUT /api/miu-events/content/:id` and `PUT /api/admin/university-content/:id`:
  edit the existing record. Supply `updatedAt` from the latest administrative
  record; older timestamp-less records accept their creation timestamp or an
  explicit null revision. Conflicting edits return 409.
- Existing POST routes accept `Idempotency-Key`. The dashboard reuses the key for
  retries of an unchanged submission. A deterministic document identity and the
  existing unique indexes resolve concurrent retries without a second event.
  Reusing a key with different content returns 409. Existing callers without the
  optional header remain compatible; distinct publish requests remain distinct.
- New publications use collision-checked timestamp/random public IDs instead of
  reusing the current maximum after deletion. Existing IDs are unchanged.

Notifications retain the existing source/event/revision deduplication. Failure
after confirmed publication is logged separately and cannot remove the saved
event/image or falsely report the publication as failed. Writes that cannot be
confirmed still return an error. No external notification provider was exercised
by these tests.

## Verification and boundaries

Unit/HTTP tests cover publication, repeated/concurrent retries, edits, legacy
records, stale updates, validation, access control, storage failures, notification
outages, shared public identity, Extended JSON dates, stale-cache bypass, fallback
recovery, and homepage refresh during club outages.

`node scripts/check-miu-event-sync-sql.cjs` exercises the real SQL provider and
publishing service: creation, replay, multi-page MIU and club data, timeline/feed
counts, Extended JSON dates, update consistency, media, stable IDs, details,
registration preservation and deletion. All fixtures are rolled back; no real
emails, push notifications or uploads are sent. The existing pagination SQL
integration check also passes after the query changes.

Browser fixtures exercise homepage/Today links, event details, Feed and Events
live updates, and dashboard creation/editing on desktop/mobile in light/dark mode.

Business rules are preserved: past dated events stay in the full Feed/Events
history and calendar, while Upcoming and Happening today retain date eligibility
filters. Unscheduled events have no calendar day. Drafts/cancellation states were
not invented. MongoDB fallback unit coverage remains available, but the real
database integration run uses the configured SQL Server provider.

Final results: 509 automated tests, 507 passed, 2 optional integration tests
skipped, and zero failures. The final focused synchronization checks passed.
Both SQL integration scripts passed with all fixtures rolled back. All 24 browser
scenarios passed with no missing API fixtures or browser exceptions. Frontend
checks passed for 46 HTML files, 80 external scripts and 672 local asset references.
