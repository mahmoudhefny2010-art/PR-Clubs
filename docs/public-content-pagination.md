# Public content pagination

Feed, Events, Sponsors, and Booths now request their current page from
`GET /api/public-content/:section`. Events has one paginated list; its former
secondary Latest Club Updates section and separate pager have been removed.

The existing `/api/clubs` and `/api/university-content` contracts remain available
for the homepage, calendar and individual event routes. The four paginated pages
do not download those complete datasets or render stale full-list browser caches.

## Configuration and response

Default sizes live in `services/public-content-pagination.js`: Feed 10, Events 8,
Sponsors 8, Booths 10, and the retained `updates` API 10. The optional `pageSize` parameter
accepts 1–50 items. `page` defaults to 1 and is clamped to the last available page.
An empty result returns page 1, totalItems 0, and totalPages 0.

Responses contain `items` and `pagination` with `page`, `pageSize`, `totalItems`,
and `totalPages`. Items contain the public club identity, sanitized content,
original array index and collection, and the university marker. Array indexes
remain the original published indexes for existing registration and media URLs.
Internal staff fields are excluded.

Optional filters:

- `filter`: all, events (upcoming only), announcements, or activities for Feed.
- `q`: literal, case-insensitive search in title, description, text and club name.
- `clubId`: only that non-archived club's published content.
- `post`: resolve the page containing a university content ID, preserving feed links.

Only published Club arrays and public UniversityContent records are queried;
pending or rejected approval requests are never used as listing sources.

## Database and UI behavior

SQL Server flattens the existing published JSON arrays, ranks scalar metadata in
a temporary table, counts matching records and returns only the selected page. No persistent schema
change or migration is required. JSON estimates can overstate sort workspace on
small SQL instances, so the queries cap memory grants and use one execution thread.
Only scalar identity and sort metadata are ranked; images are returned for the
selected page. A parent version check retries if a source changes during the read.

The MongoDB implementation uses unwind, union, window ranking and facets to count
and select records in the database (MongoDB 5.0 or newer). First/last-page recovery
and deep-link resolution use another bounded page read when required.

Events sort by publication time descending (publishedAt, falling back to createdAt,
submittedAt and date), so older publications move down and onto subsequent pages.
Booths retain ascending opening dates, with missing dates last; Sponsors retain
newest-first order; Feed and updates retain publication order.
Source, club, collection and original index break ties deterministically.

The shared browser controller owns independent page state per section in URL
parameters (`feedPage`, `eventsPage`, `sponsorsPage`, `boothsPage`, `updatesPage`).
Feed filters use `feedFilter`. Filter changes reset to page 1. Live invalidations
refresh the current page and update counts; the API clamps pages after deletion.
Concurrent identical requests are shared, outdated responses are ignored and
unchanged results do not rerender content. Paging removes obsolete post targets
from the URL after the reader navigates away.

Controls show Previous, numbered pages, ellipses and Next. One-page and empty
results hide navigation. Active, disabled, hover and keyboard focus states use the
existing theme; mobile shows fewer numbers. Clicking a page scrolls to the list.

## Verification

Run `node --test tests/public-content-pagination.test.js tests/university-feed.test.js`
and `npm.cmd run check:frontend`.

`node scripts/check-public-pagination-sql.cjs` checks real SQL counts, page
boundaries, ordering, filters/search, deep links, media URLs, growth, deletion and
archival. Every synthetic write is rolled back, including on failure.

Browser fixture checks:

`node tests/frontend-audit/browser.cjs public-pagination --settled --no-baseline --match '^pagination-'`

These cover paging all four lists, filtering, empty and single pages, details on
page two and last-page controls, across desktop/mobile and light/dark themes.

Verified results for this change: 495 automated tests passed, 2 optional tests
skipped, and no failures. The 11 focused pagination/feed checks also passed after
the final edits. SQL integration passed with all synthetic writes rolled back.
Frontend structure/build checks passed. Browser fixtures passed 60 desktop/mobile
cases plus 8 additional cases at 320px, with no missing API fixtures or exceptions.
