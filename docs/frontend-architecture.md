# Frontend architecture

The portal uses classic browser scripts and server-served HTML. Keep that execution model: the homepage scripts share a lexical scope, some feature scripts run immediately, and other features are loaded dynamically. Converting everything to ES modules or renaming served files would change initialization and caching contracts.

## Shared ownership

| Responsibility | Source | Contract |
|---|---|---|
| Colors, spacing, transitions | `frontend/styles/tokens.css` | Existing custom properties and values |
| Dark theme variables | `frontend/styles/theme.css` | Existing selectors and cascade |
| Typography, reset, page shell | `frontend/styles/foundation.css` | Existing font stack and dimensions |
| Navbar and profile controls | `frontend/styles/navigation.css` | Existing header classes |
| Buttons | `frontend/styles/buttons.css` | Existing primary, secondary, save, cancel, logout and close styles |
| Form controls | `frontend/styles/forms.css` | Existing input and password-control styles |
| Cards and feature panels | `frontend/styles/components.css` | Existing component selectors |
| Theme selection | `public/assets/js/theme.js` | Existing storage key, toggle and mounting behavior |
| Escaping, JSON requests, button factory | `public/assets/js/shared.js` | `window.MiuUI` |
| Modal controls and form validation | `public/assets/js/shared.js` | Initialized by layout at the original lifecycle point |
| Header, navbar, account menu, footer | `public/assets/js/layout.js`, `public/components/` | Existing component URLs, authentication and account workflows |
| Back and Exit | `public/assets/js/layout.js`, `dashboard-navigation.js` | Existing history behavior and recovery-page exceptions |
| Mobile sidebars | `public/assets/js/mobile-sidebars.js`, `public/assets/css/mobile-sidebars.css` | Existing selectors, drawer breakpoints and styles |
| Content editing | `public/assets/js/content-studio.js`, `public/assets/js/pages/*-form.js` | Shared lifecycle with feature-specific collection and submission |
| Push/email preferences and welcome queue | `onesignal-notifications.js`, `install-welcome.js`, `site-loading.js` | Existing explicit opt-in, identity and sequential prompt ownership |

## Loading and reuse

Pages that consume `MiuUI` load `/assets/js/shared.js` synchronously before their feature scripts. It defines helpers without initializing the page, making it safe before the startup loader. `layout.js` invokes modal rails, password controls and validation in their original order during `DOMContentLoaded`. Existing feature script order and homepage globals remain intact. The structure check enforces shared dependency ordering.

Use `MiuUI.escapeHtml(value)` for the existing HTML escaping policy. The global homepage `escapeHtml` function remains as a compatibility adapter, preserving hoisting and callers in other homepage scripts.

`MiuUI.createJsonClient` centralizes only equivalent request plumbing. Its caller supplies defaults, fallback message, malformed-JSON policy and whether errors carry HTTP status. It does not infer endpoints, add headers, serialize bodies, retry, redirect, or alter credentials. Features with different response semantics keep their own request adapters.

`MiuUI.button(label, className, onClick)` creates an ordinary button using the existing classes and click handler. Save and cancel retain their form/domain handlers: validation, draft versus submission, confirmation, cleanup and permissions differ across workflows. Global interception would change behavior.

`MiuUI.modals.open/close` owns the existing hidden-class visibility operation for calendar and event overlays. Shared modal rails and close-control placement apply to all existing supported panels. Focus, scroll locking, native dialog lifecycle, Escape handling and feature cleanup stay with their existing owners. CSS retains existing transitions; the refactor adds no animation delays. Native dialogs and startup prompts keep their existing semantics rather than being forced through a different lifecycle.

## CSS assembly

Edit `frontend/styles/*.css`, then run:

```powershell
npm.cmd run build:frontend
npm.cmd run check:frontend
node --test tests/*.test.js
```

`frontend/styles/manifest.json` specifies the exact concatenation order. Assembly creates the existing `/assets/css/base.css` without adding imports or HTTP dependencies. The initial assembled output is byte-identical to the pre-refactor stylesheet. Commit both source files and generated output so the current deployment requires no new build step. Page-specific styles remain under `public/assets/css/pages/` and retain their ordering and overrides.

The build also copies the installed ExcelJS browser distribution and its license into the already referenced vendor path. That asset was missing before the refactor. No dependency version, lockfile or Excel export request changed.

## Scope and maintenance

Backend routes, server logic, models, services, database configuration and data are outside this refactor. No environment files are needed for frontend verification. Existing public asset URLs and HTML entry points remain valid; historical extraction tests and audit evidence are retained.

Some standalone pages intentionally omit `layout.js`; the structure check records these explicit exceptions without adding account requests or shell behavior to them. Shared primitives are included where their feature scripts need them.

Prefer feature-local logic for authorization-dependent actions, response schemas, notification eligibility and workflow transitions. Consolidate another implementation only after checking its null handling, error strings, fetch options, listener order, focus/scroll behavior and CSS specificity against the existing contract.
