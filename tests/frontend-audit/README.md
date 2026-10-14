# Frontend preservation checks

These tests never import `server.js`, read `.env`, connect to MongoDB, or write application data. All fixtures use invented accounts and content. Do not substitute a real API base URL.

## Static checks

```powershell
node tests/verify-structure.js
node tests/frontend-audit/preservation.cjs
```

The first checks JavaScript syntax, local asset dependencies, homepage script ordering and shared scope, and the existing page-specific layout conventions. The second compares all original frontend sources and protected backend/data/config/image files to the recorded commit. It reconstructs inline blocks from the extracted files, restoring only their original trailing whitespace. This detects changed statements, CSS declarations, markup, script attributes, or source order.

The preservation check is strict by default. If someone uses the actual site while the audit runs, `data/` counters can change independently. `node tests/frontend-audit/preservation.cjs --allow-runtime-data-drift` reports those paths separately while continuing to enforce every source/config/image invariant. It neither resets those records nor reports them as unchanged. Only use that option when concurrent runtime data changes have been identified.

## Browser comparisons

Use an installed Chrome/Chromium browser. The runner locates Chrome or Edge on Windows; alternatively set `FRONTEND_AUDIT_BROWSER` to its executable path. Node 24 provides the built-in WebSocket client, so no npm or browser download is needed.

```powershell
node tests/frontend-audit/prepare-baseline.cjs
node tests/frontend-audit/browser.cjs baseline
node tests/frontend-audit/browser.cjs final
node tests/frontend-audit/compare.cjs final
```

The runner starts its own HTTP server on an ephemeral **127.0.0.1** port. It uses a disposable Chrome profile inside `.frontend-audit/` on the project disk. It does not use your normal Chrome profile, cookies, or signed-in accounts. If the sandbox prevents Chrome from responding, the browser runner needs permission to launch outside that restriction.

All 22 standalone HTML pages are included, plus 21 additional states/interactions, in light and dark modes at 1366×900 and 390×844. The 172 scenarios include content editing, login errors, recovery requests, invalid/valid password reset, event draft submission, required-field validation, admin analysis, club details, calendar, committee request dialogs, attendance link states, embedded studio, and theme switching.

Every scenario records a viewport PNG, full visible element geometry/computed styles and input state, body text, API method/path/body calls, and JavaScript exceptions. The comparison requires exact state and API equality. Screenshot differences are bounded to at most 2/255 per channel and 0.5% of pixels; this accommodates Chrome's edge/validation-tooltip rasterization noise, which was reproduced against unchanged original pages. Reports retain the exact pixel counts and maximum channel differences.

For diagnosis only, `--quick` selects desktop, `--match 'pattern'` selects scenarios, `--original` renders the original code, and `--no-baseline` treats a filtered run as a feature smoke test with explicit assertions. Use a separate diagnostic stage name to retain the original baseline results. `--merge` replaces selected scenarios in an existing report while retaining the other scenarios and its external-host/missing-fixture metadata. Recheck the same selection in both baseline and final when refining capture timing. `compare.cjs` requires matching coverage, so do not replace the complete baseline with a filtered run.

## Limits

Google Fonts and the QR library CDN are served empty responses by the isolated harness; other external URLs are also intercepted. Screenshots therefore use the same system fallback fonts on both sides. Animations/transitions are disabled for repeatable final-state comparisons, and the clock is fixed. Native required-field validation is asserted, then its transient browser-owned popup is dismissed before the screenshot to avoid rasterization timing noise. The actual production font/QR services, real sign-in, email delivery, file uploads, database authorization, and backend behavior are not exercised. Original references and backend source are preserved and checked separately.

The capture waits for document and nested scroll positions to remain stable for eight animation frames, avoiding geometry snapshots during smooth scrolling. This changes only test capture timing.

Artifacts remain local under `.frontend-audit/`; they are ignored by Git. The condensed audit, baseline manifest, relationship map, and final results are in `docs/frontend-audit/`.

## Comparing a later architectural refactor

The original October 9 source-preservation test remains historical evidence; subsequent authorized feature changes mean it is not a baseline for the current portal. Freeze current `public/` and `private/` sources under an ignored directory and pass `--source .frontend-audit/architecture-source` to capture that version. Use distinct stage names to retain the historical evidence.

`--settled` clears per-tab navigation state, navigates away between scenarios, waits for startup jobs and the homepage typewriter, decodes completed images, and moves the pointer outside controls. Use the same procedure and scenario selection on both sides. It changes only the test environment.

`--all-pages` adds current standalone public HTML pages to the historical page inventory, so newer attendance, speaker, supervisor and reporting pages can be selected too.

```powershell
node tests/frontend-audit/compare.cjs architecture-settled-after architecture-settled-before
```

The optional second stage argument chooses a reference other than `baseline`. Default comparison still fails for missing fixtures. `--allow-existing-fixture-gaps` permits only fixture gaps already recorded in the reference, reports those gaps explicitly, and continues to fail for new gaps, exceptions, unequal API calls/state, or screenshots outside the original tolerance. This demonstrates equivalence in the covered fixture environment; it does not demonstrate the missing workflows work in production.

The unchanged header and push client can each request `GET /api/site/account-session`: whether the push client receives the header's session event before its own startup request is a timing race. `--allow-repeated-session-reads` reports differing counts for this one read only, requires it on both sides, and continues to compare every other request (including all writes) exactly. Strict comparison remains the default. Do not use this option for new/missing requests or other endpoints.
