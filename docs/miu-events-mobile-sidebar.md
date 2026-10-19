# MIU Events mobile sidebar verification

## Cause and implementation

MIU Events omitted `layout.js`, which the working PR dashboard uses to load the shared `mobile-sidebars.css` and `mobile-sidebars.js`. Without that bootstrap, its mobile navigation remained a horizontal bar. The page also omitted `modal-controls.css`; loading the shared layout without that stylesheet left the drawer close control above its heading.

The production fix adds those two existing asset references to `public/dashboards/miu-events-dashboard.html`. It reuses the PR drawer's trigger, overlay, positioning, close control, transitions, keyboard handling, focus management, scrolling and navigation behavior. No separate drawer or CSS override was introduced. The existing breakpoint remains 760px, so 768px follows the established tablet layout rather than the phone drawer.

No backend, authentication, database, route, navigation destination or shared component implementation was changed for this fix. Earlier unrelated working-tree changes were retained.

Loading the missing layout also mounts the page's existing site-header/footer placeholders. The desktop sidebar retains its width (238px), typography, colors and non-drawer behavior. This is not a pixel-identical full-page result: the restored header affects vertical placement, and the shared close-control wrapper adds approximately 1px desktop / 4px tablet to the sidebar height. PR sidebar width, height and checked style properties remain unchanged.

## Files for this task

| File | Change |
| --- | --- |
| `public/dashboards/miu-events-dashboard.html` | Load the existing layout bootstrap and modal-control stylesheet. |
| `tests/frontend-audit/sidebar-checks.cjs` | New reusable browser interaction assertions against the actual shared drawer. |
| `tests/frontend-audit/browser.cjs` | MIU/PR capture and interaction scenarios, requested viewport matrix, state reporting and console diagnostics. |
| `tests/frontend-audit/fixtures.cjs` | Supply the existing feedback-access API contract for isolated layout startup. |
| `docs/miu-events-mobile-sidebar.md` | This verification report. |

## Automated coverage

Browser checks cover initial closed/inert state; trigger accessibility and hit targets; open geometry; overlay and page scroll lock; reachable, aligned close control; close button, overlay and Escape dismissal; focus entry, trapping and restoration; repeated toggles; panel selection and a single active item; registrations navigation; preserved attendance destination; restored main-page scrolling; actual overflowing sidebar scrolling in short landscape; tablet/desktop navigation; and horizontal overflow.

The existing dependency-free Chrome DevTools harness runs real repository HTML, CSS and JavaScript with its existing isolated API fixtures. Screenshots pair MIU with PR at matching sizes in both light and dark themes. Animations are disabled by the existing screenshot harness, so their duration is not measured; the production transition implementation is reused unchanged. These are desktop Chrome viewport simulations, not tests on physical mobile devices. Attendance destination is checked, while completing attendance is outside this drawer test.

Tested sizes: **320×568, 375×812, 390×844, 768×1024, 1366×768**, plus **568×320** to verify genuine navigation overflow.

## Executed checks

```powershell
npm.cmd run check:frontend
node --test tests/miu-event-admin.test.js tests/admin-role-navigation.test.js tests/staff-google-auth.test.js
node tests/frontend-audit/browser.cjs miu-sidebar-verified --settled --no-baseline --sidebar-viewports --match '^(miu|pr)-sidebar-contract$'
node tests/frontend-audit/browser.cjs miu-sidebar-events-regression --settled --no-baseline --narrow --match '^miu-sync-dashboard-(create|edit)$'
```

- Frontend validation passed: 46 HTML files, 80 external scripts, 5 inline scripts and 674 asset references.
- Authorization, account navigation and MIU administration regression tests: **18 passed, 0 failed**.
- Drawer matrix: **24 browser scenarios passed, 0 failed**, covering two dashboards × six sizes × two themes, with **968 interaction assertions**. No missing fixtures, runtime exceptions or unexpected console warnings/errors; 24 expected workflow-session 401 diagnostics are recorded separately.
- MIU creation/editing regression: **4 browser scenarios passed, 0 failed**, in light/dark at 320×720; no missing API fixtures or runtime exceptions.
- Targeted `git diff --check` passed.

The initial browser capture exposed a missing feedback-access fixture, which was supplied using its existing API shape. Visual comparison then exposed the close-control alignment dependency, which was fixed by loading the existing modal stylesheet and adding an alignment assertion.

Console collection exposed the existing fixtures' deliberate **401 `/api/workflow/context`** response on both MIU and PR (no workflow session in this isolated harness). The harness records that exact network diagnostic separately as expected, verifying the fixture actually returns 401; any other console warning/error, including other 401 responses, fails sidebar verification. No production authorization logic was changed to suppress it.

Screenshots and JSON results live in `.frontend-audit/browser-miu-sidebar-verified/`; before screenshots are in `.frontend-audit/browser-miu-sidebar-before/`. These generated local artifacts remain ignored by Git. A full live authenticated server session and physical-device testing were not performed; authorization behavior was checked separately through the 18 regression tests above.
