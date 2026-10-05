// Structure regression test for the refactored frontend.
// Run with: node tests/verify-structure.js  (requires the local server on :1111)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const pub = path.join(root, 'public');

// Expected content hashes of the concatenated split bundles.
// If these change, the CSS/JS modules were edited — update the hash on purpose.
const EXPECTED_CSS_HASH = '2a9aa3edd6f5f1e259be4349b7db272a8f46125a1075be4302ab835ececa5248';
const EXPECTED_JS_HASH = '22785f108b35edd8671b87baa0310090422db91adced2592923cec3d8dabd517';

const CSS_FILES = ['base.css', 'responsive.css', 'dark.css', 'features.css'];
const JS_FILES = ['app-home.js', 'app-admin.js', 'app-dashboard.js'];

const read = (f) => fs.readFileSync(f, 'utf8');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(html|js|css|json)$/i.test(e.name)) out.push(full);
  }
  return out;
};

// 1. Split bundles still reproduce the expected content (regression guard).
const cssBundle = CSS_FILES.map((f) => read(path.join(pub, 'assets/css', f))).join('');
assert.strictEqual(
  crypto.createHash('sha256').update(cssBundle).digest('hex'),
  EXPECTED_CSS_HASH,
  'CSS bundle content changed — update EXPECTED_CSS_HASH if intentional',
);
const jsBundle = JS_FILES.map((f) => read(path.join(pub, 'assets/js', f))).join('');
assert.strictEqual(
  crypto.createHash('sha256').update(jsBundle).digest('hex'),
  EXPECTED_JS_HASH,
  'JS bundle content changed — update EXPECTED_JS_HASH if intentional',
);
console.log('CSS/JS module bundles match expected hashes ✓');

// 2. No stale references to the removed monolith files.
let stale = 0;
for (const file of [...walk(pub), ...walk(path.join(root, 'private'))]) {
  const c = read(file);
  if (/assets\/css\/style\.css|assets\/js\/script\.js/.test(c)) {
    console.log('STALE REF:', file);
    stale++;
  }
}
assert.strictEqual(stale, 0, 'stale references found');
console.log('No stale references to style.css / script.js ✓');

// 3. Every page loads the four stylesheets.
const htmlFiles = [...walk(pub), ...walk(path.join(root, 'private'))]
  .filter((f) => f.endsWith('.html') && !f.includes(path.join('public', 'components')));
for (const file of htmlFiles) {
  const c = read(file);
  for (const css of CSS_FILES) assert.ok(c.includes(`/assets/css/${css}`), `${file} missing ${css}`);
}
console.log(`All ${htmlFiles.length} HTML pages load the four CSS files ✓`);

// 4. The SPA index loads the three JS modules plus the shared helpers.
const index = read(path.join(pub, 'index.html'));
for (const js of [...JS_FILES, 'layout.js', 'theme.js']) assert.ok(index.includes(`/assets/js/${js}`), `index missing ${js}`);
console.log('index.html loads app-home, app-admin, app-dashboard, layout, theme ✓');

// 5. Shared header/footer components + placeholders on every page.
for (const comp of ['site-header.html', 'site-footer.html']) {
  assert.ok(fs.existsSync(path.join(pub, 'components', comp)), `missing ${comp}`);
}
const ownHeaderPages = ['applicant-login.html', 'admin-club-credentials.html'];
for (const file of htmlFiles) {
  const c = read(file);
  assert.ok(c.includes('id="site-footer"'), `${file} missing footer placeholder`);
  assert.ok(c.includes('/assets/js/layout.js'), `${file} missing layout.js`);
  if (!ownHeaderPages.some((n) => file.endsWith(n))) {
    assert.ok(c.includes('id="site-header"'), `${file} missing header placeholder`);
  }
}
console.log('Header/footer placeholders + layout.js present on every page ✓');

// 6. Live checks against the running local server.
(async () => {
  const base = 'http://localhost:1111';
  const checks = [
    '/', '/pages/club-content.html?embed=1', '/pages/applicant-login.html',
    '/dashboards/pr-dashboard.html', '/dashboards/english-dashboard.html', '/dashboards/dean-dashboard.html',
    '/assets/css/base.css', '/assets/css/responsive.css', '/assets/css/dark.css', '/assets/css/features.css',
    '/assets/js/app-home.js', '/assets/js/app-admin.js', '/assets/js/app-dashboard.js',
    '/assets/js/layout.js', '/assets/js/theme.js',
    '/components/site-header.html', '/components/site-footer.html',
    '/assets/img/pics/logo.svg.png', '/assets/img/pics/mun.jpg',
  ];
  for (const p of checks) {
    const res = await fetch(base + p);
    assert.ok(res.ok, `${p} -> ${res.status}`);
  }
  console.log(`All ${checks.length} local URLs return 200 ✓`);

  const clubs = await fetch(base + '/api/clubs').then((r) => r.json());
  assert.ok(Array.isArray(clubs) && clubs.length > 0, 'clubs API empty');
  assert.ok(clubs[0].image.startsWith('/assets/img/pics/'), 'club image path wrong');
  console.log(`API: ${clubs.length} clubs, images at ${clubs[0].image} ✓`);
  console.log('\nALL CHECKS PASSED');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
