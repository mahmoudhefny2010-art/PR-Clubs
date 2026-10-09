# Frontend audit verification results

Date: 9 October 2026. Original commit: `9bd35a9dd8ac58ff7827462c813be6ebbf68d15b`.

## Stage results

| Stage | Check | Result |
|---|---|---|
| Original project | Original structure test | Failed before edits: obsolete CSS hash and layout assumptions |
| Original project | Replacement structure check | Passed: 24 HTML files, 19 external scripts, 11 inline scripts, 192 local asset references |
| Original browser baseline | Complete isolated browser capture | 172 scenarios; no JavaScript exceptions or missing fixtures |
| CSS extraction | Structure check | Passed: 24 HTML files, 19 external scripts, 11 inline scripts, 208 local asset references |
| CSS extraction | Source preservation | Passed: 34 protected/config/data/image files and 50 original frontend sources |
| CSS extraction | Browser comparison against original capture | Passed: 172 matching state/API scenarios; 159 pixel-exact images and 13 within raster tolerance |
| JavaScript extraction, final | Structure check | Passed: 24 HTML files, 26 external scripts, 4 inline scripts, 215 local asset references |
| Final | Source preservation, reporting concurrent runtime data drift | Passed: 32 protected/config/data/image files and 50 reconstructed frontend sources; two counter files reported separately |
| Final | Complete browser comparison | Passed: 172 state/API matches; 163 pixel-exact images and nine within raster tolerance; zero exceptions or missing fixtures |
| Final | Browser harness syntax | `node --check tests/frontend-audit/browser.cjs` passed |

The two counter files are `data/club-views.json` and `data/event-views.json`. Neither was written or reverted by this audit. The default preservation command remains strict and flags the changed counters. The reporting option does not declare their contents preserved.

## Commands

```powershell
node tests/verify-structure.js
node tests/frontend-audit/preservation.cjs --allow-runtime-data-drift
node --check tests/frontend-audit/browser.cjs
node tests/frontend-audit/compare.cjs final
git diff --check
```

Browser captures used `node tests/frontend-audit/browser.cjs baseline`, `styles`, and `final`. The final baseline was recaptured after dismissing transient native validation popups. PR dashboard screenshots were then recaptured on both sides using `--match '^pr-dashboard$' --merge` after adding a wait for scrolling to settle. The comparison still includes all 172 cases.

## Browser evidence

- Node 24.13.1; installed Chrome 153.0.8010.55; Windows; Africa/Cairo timezone.
- 22 standalone pages and 21 additional interaction states, each at desktop 1366 x 900 and mobile 390 x 844, in both light and dark modes.
- Exact recorded text, computed styles, input state, geometry rounded to 0.01 pixels, and API method/path/body records.
- Final screenshot tolerance: maximum channel difference 2/255 and at most 0.5% differing pixels. The largest final difference was 28 pixels in a mobile image (0.00851%); eight other images differed by 1 to 16 pixels.
- Manually inspected final homepage dark mode, SSO desktop dark mode, PR request details on mobile, and reset-password mobile dark mode.
- Browser profiles, cache, fixtures and screenshot artifacts are under `.frontend-audit/` on D:.

The archived CSS-stage comparison used the original validation-popup capture procedure. A later original-versus-original diagnostic reproduced its small native-popup raster fluctuations. Those initial artifacts remain in `browser-baseline-native-tooltip` and `browser-final-native-tooltip`; the final comparison uses the stabilized captures in `browser-baseline` and `browser-final`.

The last targeted capture's metadata lists only the external host it encountered. Archived full captures record both `fonts.googleapis.com` and `cdn.jsdelivr.net`. The harness has been corrected to retain this metadata when merging future partial runs; existing historical reports were not rewritten to imply a new browser capture.

## Follow-up Entry Permit feature

The separately requested workflow adds Club → PR → Security Office → Dean review and a club-only approved state; other content and the existing SSO attendance workflow retain their established routes. `node tests/entry-permit-workflow.js` validates review-stage transitions, role visibility, and the public-content boundary without opening the real backend or database.

The isolated browser fixture suite captured 24 new Entry Permit scenarios: form, club dashboard approval checkpoint, Security review, Dean review, and club-only approval state. Each scenario ran on desktop and mobile in light and dark themes. There were zero JavaScript exceptions and zero missing fixtures. Screenshots and state captures are in `.frontend-audit/browser-entry-permit-smoke/`.

A follow-up club attendance visibility smoke run captured four cases showing the SSO-approved, Dean-pending state in the club's private attendance records on desktop/mobile and light/dark themes. It had zero JavaScript exceptions and missing fixtures. Screenshots and state captures are in `.frontend-audit/browser-sso-club-visibility/`. These browser suites use synthetic API fixtures and do not exercise MongoDB persistence, production credentials, account provisioning, or real API authorization.

## Limits

The browser server uses synthetic responses and never starts or imports the application backend. External resources are intercepted, so Google Fonts and the QR library are stubbed. Screenshots use matching fallback fonts. Clocks are fixed and CSS animations/transitions disabled. Real authentication, email, uploads, QR generation, database operations, production networking and timing were not tested. No claim is made that every possible user state was exercised.

See [the detailed report](REPORT.md) for preserved boundaries, byte measurements and remaining issues. The [portable result summary](verification-results.json) includes the exact final raster differences. Full local evidence is in `.frontend-audit/browser-final/comparison.json` and its sibling screenshots/state files.
