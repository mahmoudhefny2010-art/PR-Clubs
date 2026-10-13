# Page loading and shared API performance

## Findings and evidence

Read-only MongoDB probes found 11 club documents occupying 1,829,075 JSON bytes. Event images accounted for roughly 1.30 MB; sponsor logos and attachments for another 0.50 MB. Multiple pages fetched all of this through `/api/clubs` before rendering. One complete database read took 19,266 ms. These are individual observations, not percentile benchmarks.

The original local `/api/clubs` request exceeded an 8-second measurement deadline. After the changes, `/api/clubs?media=links` returned 23,870 decoded bytes in 672 ms. University content returned in 121 ms, the Feed HTML in 38 ms, and an independently requested JPEG returned HTTP 200 with 54,850 bytes in 1,021 ms. Measurements used the existing local server and live database; timing varies with network/server state.

The shared loader also stopped tracking at HTTP headers, before JSON body consumption. The previous change additionally released the home page before university content arrived. Both behaviors have been corrected.

## Changes

- `services/public-club-media.js`: opt-in public listing projection replaces inline base64 media with versioned URLs inside MongoDB. Media is loaded separately using a narrow projection and can be cached. Collection/field allowlists, active-club filtering, version checks, MIME handling and sandbox headers protect the route. Database records are not rewritten.
- `server.js`: retains the original `/api/clubs` response by default; `media=links` enables the lighter response. Adds HTTP compression, MongoDB wire compression, existence probes instead of collection counts during initialization, and parallel reads of independent startup collections.
- Public club, Feed, event, sponsor, booth and member-directory clients opt into media links. Existing fields, IDs, routes and workflows remain available.
- `api/index.js`: public HTML/assets and the deployment marker can return without waiting for MongoDB initialization. Data APIs and protected admin routes still wait.
- Shared loader tracks response body consumption and allows rendering frames before removing the overlay. Homepage startup explicitly holds it through its complete initialization, including university content and settings. Header/footer loads are tracked as well. There is no fixed maximum loading duration. Failed homepage startup renders a retry message rather than an empty directory.
- Notification setup and deployment polling remain background work. Public script versions and the service-worker cache version are updated.
- `package.json` / `package-lock.json`: add `compression`.

## Validation

- `node --test tests/page-loading.test.js tests/public-club-media.test.js`: **7 passed**. Covers slow JSON, chained requests/rendering, failures, background notification requests, serverless database gating, compression byte equality, media bytes, restricted fields, stale versions and database errors.
- Syntax checks passed for changed server, shared loading and page scripts.
- Read-only comparison on all 11 live clubs confirmed every non-media field is unchanged, including missing legacy fields. The optimized database projection returned roughly 24 KB in 511 ms and contained no embedded base64 media.
- Isolated HTTP compression measurements: base CSS 79,657 → 15,180 bytes; home JavaScript approximately 75,698 → 18,156 bytes. Decoded response bytes were identical. Synthetic private JSON retained its `no-store` header.
- The existing OneSignal client suite has four failures. The same four fail when evaluated against its original `HEAD` client source; its browser mock omits timer APIs used by the client. No unrelated notification behavior was changed to conceal these failures.

## Limits

This is not a production Vercel benchmark or a complete browser journey test. No push/deployment was performed. Cold startup still runs the existing initialization/migration logic and hydrates legacy collections; that work has not been removed. Images still require network transfer when first displayed, but no longer travel inside every opted-in listing response. Old media URLs can return 404 after their club is changed; a fresh listing supplies the current versioned URLs.

Database diagnostics used read-only driver queries and did not print credentials or records. No data migration or media deletion was performed.
