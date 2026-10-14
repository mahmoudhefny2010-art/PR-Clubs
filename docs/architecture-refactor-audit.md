# Architectural refactor audit — 14 October 2026

This report records the architectural refactor before the separately requested authentication correction. The later authorized Google multi-role session fix changes backend authentication and is documented in [unified-google-session.md](unified-google-session.md); the preservation claims below refer to the earlier refactor snapshot.

## Implemented boundaries

- Added `public/assets/js/shared.js` and synchronous dependency declarations before consumers.
- Replaced ten equivalent escaping implementations and seven JSON request implementations. Preserved feature-specific messages, cache/credential options, malformed-JSON handling and attendance HTTP-status errors.
- Extracted modal close rails, password visibility controls and form validation from `layout.js`, keeping their original lifecycle order. Calendar and event overlays use shared visibility operations.
- Retained the established theme manager, header/footer templates, navbar/account rendering, mobile sidebar system, Back/Exit navigation, content form lifecycle and notification modules as the owners of those responsibilities.
- Separated shared CSS into seven sources with deterministic assembly at the existing asset URL. The generated stylesheet is byte-identical to the frozen starting stylesheet, including declaration and selector order.
- Restored the already referenced ExcelJS browser asset from the installed dependency, with its license. Before this work, the static dependency check failed because `/assets/vendor/exceljs.min.js` was absent.
- Added build verification, dependency-order checks, shared helper regression tests and a current-source browser comparison mode. Historical audit records remain intact.

The compatibility and ownership guide is [frontend-architecture.md](frontend-architecture.md).

## Verification

The Node test suite passes **160 tests**. `tests/speaker-request-workflow.js` also passes. Static verification passes for **43 HTML files, 60 external scripts, six inline scripts and 598 local asset references**, including homepage shared lexical scope and execution order. Frontend asset generation is deterministic. `git diff --check` passes.

The first stabilized browser comparison covers **92 scenarios** at desktop/mobile sizes in light/dark themes. Every screenshot is pixel-exact, every recorded DOM/computed-style/input state matches, and both sides have zero JavaScript exceptions.

Every recorded API method/path/body matches except differing duplicate counts of the existing `GET /api/site/account-session` read in 36 scenarios. The unchanged header and push client race to obtain or receive that session. The comparison explicitly reports these counts; it does not normalize other endpoints or any writes. Ten missing API fixtures exist on both sides, with no new fixture gaps. The comparison passes only with these two explicit, documented allowances; strict mode continues to report them.

Browser artifacts and complete request/count evidence are retained under `.frontend-audit/browser-architecture-settled-before/` and `.frontend-audit/browser-architecture-settled-after/`. The original short-wait runs are retained too; startup rendering and typewriter timing made those captures nondeterministic. The settled procedure changes only the harness.

An additional **68 scenarios** cover newer standalone pages: supervisor and staff administration, MIU Events, reports, attendance tasks, speaker pages, feed, policy/help, offline and error pages. All DOM states match and there are no JavaScript exceptions. After recapturing one mobile speaker-review logo raster difference, 66 screenshots are pixel-exact; the remaining two differ by 10 and six pixels at a maximum channel delta of one, within the existing tolerance. These captures have 11 baseline fixture gaps and seven reported session-read count differences, with no new gaps. Evidence is under `.frontend-audit/browser-architecture-additional-{before,after}/`.

The final **24 scenarios** cover Security, Ask AI, club content, Entry Permit, event detail and private club credentials. All 24 screenshots are pixel-exact and all DOM states match, with zero JavaScript exceptions, four unchanged fixture gaps and six reported session-read count differences. Initial captures exposed an about:blank storage exception in the harness and logo rasterization differences; after removing the harness injection before navigating away and recapturing affected cases, the final comparison passes. Evidence is under `.frontend-audit/browser-architecture-remaining-{before,after}/`.

Together the three batches cover **184 unique scenarios: all 40 standalone HTML entry pages and six additional interaction states**, at both viewport sizes in both themes. The private server-rendered error template and two header/footer fragments are checked statically; the fragments are also exercised through pages that inject them. **182 screenshots are pixel-exact and two are within the original tolerance.** All 184 DOM states match. There are 17 distinct pre-existing fixture gaps across the batches and 49 explicitly reported session-read count differences; there are no new gaps or changed non-session requests. The compact results are in [architecture-refactor-verification.json](architecture-refactor-verification.json).

```powershell
npm.cmd run check:frontend
node --test tests/*.test.js
node tests/speaker-request-workflow.js
node tests/frontend-audit/compare.cjs architecture-settled-after architecture-settled-before --allow-existing-fixture-gaps --allow-repeated-session-reads
git diff --check
```

## Protected sources and known limits

The frozen comparison verifies 37 backend, service, model, database-data, deployment and lockfile paths unchanged after the initial snapshot. Git also shows no changes to backend sources, routes, services, models, deployment configuration or lockfile. Environment files were neither read nor edited. A one-count change in `data/event-views.json` appeared during the initial audit before the frozen snapshot; it is outside the refactor and was not overwritten or reverted.

`tests/entry-permit-workflow.js` has a pre-existing failure: a source-text regular expression expects an old president-only filter expression that the unchanged server no longer contains. Its preceding workflow transition checks pass. Backend code was not changed to satisfy that historical assertion. The older full browser fixture suite also fails an Entry Permit expectation on the starting code; this is why the new comparison uses a frozen current source and explicitly selected scenarios.

Real production sign-in, MongoDB persistence, provider email/push delivery, file uploads, external font/CDN behavior and every possible role/state are not exercised by these isolated fixtures. Native dialog focus/cleanup and feature-specific Save/Cancel policies deliberately retain their existing owners. The checks support behavior preservation in the covered scenarios; they are not a claim of exhaustive production validation.
