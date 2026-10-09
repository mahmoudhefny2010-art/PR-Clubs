// Static frontend regression checks. No running backend or database is required.
// Run: node tests/verify-structure.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'public');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const files = [...walk(publicRoot), ...walk(path.join(root, 'private'))];
let scripts = 0, inlineScripts = 0, references = 0;
const read = (file) => fs.readFileSync(file, 'utf8');
const relative = (file) => path.relative(root, file);
function checkAsset(url, source) {
  if (!url.startsWith('/assets/') && !url.startsWith('/components/')) return;
  const file = path.join(publicRoot, url.split(/[?#]/)[0]);
  assert.ok(fs.existsSync(file) && fs.statSync(file).isFile(), `${relative(source)} references missing asset ${url}`);
  references++;
}
for (const file of files) {
  if (!/\.(html|css|js)$/.test(file)) continue;
  const source = read(file);
  assert.ok(!/assets\/css\/style\.css|assets\/js\/script\.js/.test(source), `Stale monolith reference in ${relative(file)}`);
  if (file.endsWith('.js')) { new vm.Script(source, { filename: relative(file) }); scripts++; }
  if (file.endsWith('.html')) {
    for (const match of source.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/gi)) checkAsset(match[1], file);
    for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/.test(match[1]) || !match[2].trim() || /application\/(?:ld\+)?json/.test(match[1])) continue;
      new vm.Script(match[2], { filename: `${relative(file)} inline script` }); inlineScripts++;
    }
    if (!file.includes(`${path.sep}components${path.sep}`) && !/[/\\](?:404|500)\.html$/.test(file)) {
      for (const css of ['base.css', 'responsive.css', 'dark.css']) assert.ok(source.includes(`/assets/css/${css}`), `${relative(file)} missing ${css}`);
      assert.ok(source.includes('/assets/js/layout.js'), `${relative(file)} missing shared layout`);
      if (!file.endsWith(`${path.sep}attendance.html`)) assert.ok(source.includes('id="site-footer"'), `${relative(file)} missing shared footer`);
    }
  }
  if (file.endsWith('.js') || file.endsWith('.css')) {
    for (const match of source.matchAll(/["'](\/(?:assets|components)\/[^"'\s`$]+)["']/g)) checkAsset(match[1], file);
  }
}
const homepage = read(path.join(publicRoot, 'index.html'));
const orderedScripts = ['app-home.js', 'app-admin.js', 'app-dashboard.js'];
const positions = orderedScripts.map((name) => homepage.indexOf(`/assets/js/${name}`));
assert.ok(positions.every((pos, i) => pos >= 0 && (!i || pos > positions[i - 1])), 'Homepage shared globals must load in the original order');
new vm.Script(orderedScripts.map((file) => read(path.join(publicRoot, 'assets/js', file))).join('\n'), { filename: 'homepage-shared-scope.js' });
assert.ok(homepage.indexOf("document.documentElement.classList.add('auth-route-pending')") < homepage.indexOf('<body'), 'Keep the authentication guard before page rendering');
for (const component of ['site-header.html', 'site-footer.html']) assert.ok(fs.existsSync(path.join(publicRoot, 'components', component)));
console.log(`Structure passed: ${files.filter((file) => file.endsWith('.html')).length} HTML files, ${scripts} external scripts, ${inlineScripts} inline scripts, ${references} local asset references; homepage execution order and combined scope valid.`);
