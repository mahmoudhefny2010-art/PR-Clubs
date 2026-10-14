# Public data updates

The Clubs, Feed, Events, Sponsors and Booths pages share persistent public
snapshots in localStorage. Their two listing endpoints reuse these snapshots
instead of downloading them again on each navigation. Private APIs are excluded.

`services/public-data-stream.js` uses a MongoDB database change stream to send
only the affected dataset names over SSE. Public listing data is fetched when
that dataset changes. There is no browser interval that polls listing data.
Changes to clubs, university content, applications and feedback invalidate the
corresponding public snapshot. Saved data stays visible while it refreshes.

The browser saves a resume token and durable dirty markers. Reopening a page
resumes notifications from that token, including changes made while the page
was closed. An expired or missing token invalidates both snapshots once. Reads
in flight are shared; a further change during a read schedules another update.
Other tabs reuse snapshots through storage events. Hidden/offline pages close
their stream, then resume when visible/online. Refresh explicitly invalidates
saved data.

The stream closes before the configured 35-second Vercel function limit;
EventSource reconnects with its last token. Reconnection alone does not download
the listing data again. The request deadline includes database initialization.

MongoDB requires change-stream support (a replica set or sharded deployment)
and a database user allowed to watch the selected collections. The current
`.env` keeps MongoDB selected.

SQL Server and Azure SQL use the same SSE endpoint through
`services/sql-public-data-stream.js`. The SQL schema includes a singleton
revision row and four transaction-bound triggers. The server checks only that
row every three seconds while a connection is open and sends changed dataset
names. Browsers still do not poll or download unchanged lists. This is different
from MongoDB's native change stream. Startup checks the installed notification
schema; older isolated SQL targets need the additive `002-public-live.sql`
migration through `scripts/sqlserver-live-schema.cjs --apply`.

Local verification: `node --test tests/public-live-data.test.js
tests/page-loading.test.js tests/startup-prompts.test.js tests/static-worker.test.js`.
The tests simulate notifications and reconnection; they do not certify live
database permissions or production proxy streaming.
