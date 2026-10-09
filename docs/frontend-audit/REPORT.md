# Frontend audit and preservation report

Audit date: 9 October 2026 (Africa/Cairo). Baseline commit: `9bd35a9dd8ac58ff7827462c813be6ebbf68d15b`. Branch: `feature/site-analytics-and-dashboard-updates`. The original working tree was clean.

## Outcome

The frontend was reorganized through source-preserving extraction. Sixteen public pages now load page stylesheets, and seven substantial public-page scripts now live in `public/assets/js/pages/`. Identical style blocks are shared by the four content forms and by the two password recovery pages. HTML structure, UI text, CSS declarations and cascade order, script scope/order, and application logic were retained.

Production backend code, API handlers, models, dependency files, startup/backup scripts, and deployment configuration were not edited. The audit did not start or import the real server, connect to MongoDB, send real account emails, or write application records.

### Follow-up feature added after the audit

After the frontend audit was complete, the club portal gained a separate Entry Permit workflow at the user's request. This intentional feature update changes `server.js`, `models.js`, the club-content and committee screens, and their shared frontend assets; it is not part of the source-preserving cleanup described above. Entry Permits route Club → PR → Security Office → Dean. Dean approval sets the internal `approved` state and keeps the permit available to the owning club account. It is not copied into public club events, posts, sponsors, or booths. Other content keeps the existing PR → English → Dean flow. The existing PR → SSO → Dean attendance-review workflow and club-only attendance visibility were left unchanged.

`tests/entry-permit-workflow.js` checks stage transitions, access by review role, and the public-content boundary without loading credentials or connecting to a database. The new Chrome fixture run is reported separately in `RESULTS.md`; it does not replace or modify the historical 172-case cleanup comparison.

During the final checks, `data/club-views.json` and `data/event-views.json` changed independently of the audit tools. The preservation check flagged those counter files. Their existing changes were retained; they were not reverted, absorbed into the baseline, or described as unchanged. All 32 other protected/config/image files passed the preservation checks, and all 50 original frontend sources were reconstructed exactly with line endings normalized.

## Original state and relationships

The audit inventoried 86 tracked files, including 63 frontend files: 50 HTML/CSS/JavaScript sources and 13 image assets. There are 22 standalone HTML pages plus two shared components. Ignored credentials/environment settings and third-party dependencies were classified as protected local inputs rather than cleanup candidates; their contents were not exposed in these documents.

- [Baseline manifest](baseline.json): original sizes, SHA-256 fingerprints, Git status, page dependencies and inline-block hashes.
- [Audit and complete tracked-file inventory](AUDIT.md): file groups, original loading order, constraints and findings.
- [Relationship and API-consumer map](RELATIONSHIPS.md): shared asset consumers, frontend API references, backend entry points and route inventory.
- [Staged plan](PLAN.md): stages and acceptance gates established before application edits.

The homepage's `app-home.js`, `app-admin.js`, and `app-dashboard.js` share a global lexical scope and retain their original order. `layout.js` still injects the shared header/footer, formats time, validates forms and sends visitor pings. `theme.js` retains its original theme behavior. Content forms still use `ContentStudio.init`; committee pages retain their existing shared dashboard, sidebar and attendance modules.

## Changes

| Area | Change | Preservation evidence |
|---|---|---|
| Public page styles | 16 inline blocks moved to 12 stylesheets under `public/assets/css/pages/` | Same declarations and exact cascade position; original blocks reconstructed by tests |
| Content forms | Event/feed/sponsor/booth pages share `content-form.css` | Original four blocks were byte-identical |
| Password recovery | Forgot/reset pages share `password-recovery.css` | Original two blocks were byte-identical |
| Page scripts | Login, forgot/reset password and four content-form initializers moved into seven page scripts | Same classic-script scope and position, no added `async`/`defer`, unchanged statements and payloads |
| Existing checks | Replaced obsolete bundle hashes with asset, syntax, shared-scope and load-order checks | Runs without requiring a database-capable server |
| Audit tooling | Added source reconstruction, isolated Chrome fixtures and screenshot/state/API comparisons | No production dependencies added; no application data used |
| Local artifacts | Added `.frontend-audit/` to `.gitignore` | Keeps profiles, original snapshots and synthetic screenshots on D: and out of Git |

Only trailing whitespace outside extracted CSS/JavaScript statements was normalized to a final newline. The preservation checker restores that original whitespace when comparing the reconstructed HTML. No styles were renamed or merged based merely on similar selectors. No existing project document, image, data file, or source file was deleted as an “unused” guess.

The protected admin HTML pages retain their inline scripts and styles. Moving those scripts into public assets would change their exposure. The tiny early authentication guard and the short content-studio bootstrap remain inline intentionally.

## Measured size and performance effects

| Metric | Before | After | Change |
|---|---:|---:|---:|
| HTML bytes across all pages/components | 236,323 | 180,226 | 56,097 fewer (23.7%) |
| Total first-party frontend source bytes | 646,056 | 637,463 | 8,593 fewer (1.3%) |
| Repeated CSS removed from source | — | 9,721 bytes | Three duplicate form blocks and one recovery block removed |
| Inline substantial public-page scripts | 7 | 0 | 15,263 original bytes moved to reusable assets |

These are uncompressed source measurements, not claims about page-load time or Core Web Vitals. External files can be reused/revalidated separately across visits; the shared form and recovery styles now have single URLs. Extraction also adds a stylesheet request to each affected page and a script request to seven pages on a cold load. Network timing and backend response performance were not altered or benchmarked.

## Verification

The original `tests/verify-structure.js` failed before any edits because its expected CSS bundle hash was stale. It also assumed every page used the same four stylesheets and footer structure, which did not match the existing minimal error/attendance pages. The replacement checks the actual architecture rather than requiring those pages to change.

The test environment uses Node 24.13.1 and installed Chrome 153.0.8010.55. An isolated HTTP server binds only to `127.0.0.1`, serving the original or current frontend with invented API records. It never imports application backend files. Chrome uses its own profile under `.frontend-audit/` on D:.

Each browser pass covers 172 scenarios: all 22 standalone pages plus 21 interaction/state cases, each in light/dark modes at 1366×900 and 390×844. Coverage includes calendar and club details, admin analysis, PR/English/Dean request dialogs, embedded content studio, content editing, draft submission, required-field validation, rejected login, password-recovery submission, invalid/mismatched/successful password reset, attendance link states and theme switching.

For each scenario, the runner compares viewport screenshots, visible text, element geometry/computed styles, input state, API method/path/body records, and uncaught JavaScript exceptions. The API comparison checks request sets/payloads; it does not assert network timing. Geometry is recorded to 0.01 pixels. Screenshot comparison allows at most 2/255 channel variation on 0.5% of pixels; all other recorded state remains exact.

Chrome's native validation popup produced small, intermittent rasterization differences even when repeating unchanged original pages. The final procedure asserts validity, dismisses that transient popup, and then captures both versions. Original evidence is retained locally rather than silently discarded.

Final comparison passed all 172 scenarios: 163 screenshots matched pixel-for-pixel; nine had only small raster differences (at most 28 pixels in any image and a maximum channel difference of 2/255). Recorded state and API requests matched in every scenario, with zero JavaScript exceptions or missing fixtures. After adding a scroll-settling wait, the four PR dashboard variants were recaptured on both original and current code and merged into the complete reports.

Final per-stage counts and command results are recorded in [verification results](RESULTS.md), with a portable [machine-readable summary](verification-results.json). Full synthetic snapshots and comparison output are available locally in `.frontend-audit/`.

## Remaining issues and boundaries

1. **Concurrent runtime data drift:** `data/club-views.json` and `data/event-views.json` differ from the initial baseline. The strict data-inclusive test will continue to fail for those files until the owner intentionally establishes a new data baseline. The explicit `--allow-runtime-data-drift` mode reports them separately while still enforcing every source/config/image check.
2. **External services:** Google Fonts and QR CDN responses are stubbed in the isolated harness, so screenshots use the same fallback fonts on both sides. Real Google sign-in, QR generation, email delivery, file uploads, backend authorization and database operations were not exercised. Their existing references and implementation files remain unchanged.
3. **Animation/network behavior:** repeatable screenshots disable animations and transitions and freeze the clock. This verifies final states, not animation smoothness or live-service timing. No runtime performance percentage is claimed.
4. **Existing coupling:** homepage globals and layered CSS overrides remain substantial. Replacing them with modules, pruning dynamic selectors, changing polling or coalescing requests would need a separately scoped behavior review. The original committee screens perform repeated initial session/request fetches; these request patterns were preserved.
5. **Existing unused session UI helper:** `ContentStudio.init` defines `ensureSession` but does not invoke it. Activating it would change existing UI/flow, so this audit did not change session logic. Backend authorization remains exactly as implemented before the audit.

The changes remain in the working tree for review. No new commit, push, or deployment was performed for this audit task.
