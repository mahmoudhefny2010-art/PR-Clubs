const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/assets/css/pages/error-page.css'), 'utf8');

test('all branded error pages use the shared responsive layout', () => {
  for (const page of ['private/error-page.html', 'public/404.html', 'public/500.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /error-page\.css\?v=20261017errorbrandcenter1/);
    assert.match(html, /class="error-card"/);
    assert.match(html, /class="error-actions"/);
  }
});

test('the MIU logo is centered above the portal label on every error page', () => {
  assert.match(css, /\.error-brand\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.error-brand\s*\{[^}]*margin:\s*0 auto 22px/);
  for (const page of ['private/error-page.html', 'public/404.html', 'public/500.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /class="error-logo"/);
    assert.match(html, /CLUBS PORTAL/);
  }
});

test('mobile error actions use two columns and let a lone final button span the full row', () => {
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /:only-child, \.error-actions > :last-child:nth-child\(odd\) \{ grid-column: 1 \/ -1; \}/);
});
