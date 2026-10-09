// Compare the refactor to the recorded original; never import the application server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const baseline = require('../../docs/frontend-audit/baseline.json');
const extractions = require('./extractions.json');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const normalized = (text) => text.replace(/\r\n/g, '\n');
const original = (file) => {
  const snapshot = path.join(root, '.frontend-audit/baseline', file);
  return fs.existsSync(snapshot) ? fs.readFileSync(snapshot, 'utf8')
    : execFileSync('git', ['show', `${baseline.commit}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
};
let frozen = 0;
let reconstructed = 0;
const allowRuntimeDataDrift = process.argv.includes('--allow-runtime-data-drift');
const runtimeDataDrift = [];
for (const file of baseline.files) {
  if (!file.path.startsWith('public/') && !file.path.startsWith('private/')) {
    if (['.gitignore', 'tests/verify-structure.js'].includes(file.path)) continue;
    const bytes = fs.readFileSync(path.join(root, file.path));
    // Git's autocrlf can change checkout bytes on another machine. Locally compare exact bytes;
    // elsewhere compare original Git content with line endings normalized for text files only.
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (hash !== file.sha256) {
      assert.match(file.path, /\.(?:js|json|md)$/);
      const unchanged = normalized(bytes.toString('utf8')) === normalized(original(file.path));
      if (!unchanged && allowRuntimeDataDrift && file.path.startsWith('data/')) {
        runtimeDataDrift.push(file.path);
        continue;
      }
      assert.ok(unchanged, `Protected file changed: ${file.path} (contents omitted)`);
    }
    frozen++;
    continue;
  }
  const currentBytes = fs.readFileSync(path.join(root, file.path));
  if (!/\.(html|css|js)$/.test(file.path)) {
    assert.equal(crypto.createHash('sha256').update(currentBytes).digest('hex'), file.sha256, `Asset changed: ${file.path}`);
    frozen++;
    continue;
  }
  let restored = currentBytes.toString('utf8');
  const before = original(file.path);
  const css = extractions.styles[file.path];
  const js = extractions.scripts[file.path];
  if (css) {
    const tag = `<link rel="stylesheet" href="/assets/css/${css}?v=1" />`;
    if (restored.includes(tag)) {
      const suffix = before.match(/<style>([\s\S]*?)<\/style>/)[1].match(/\s*$/)[0];
      restored = restored.replace(tag, `<style>${read(`public/assets/css/${css}`).trimEnd()}${suffix}</style>`);
    }
  }
  if (js) {
    const tag = `<script src="/assets/js/${js}?v=1"></script>`;
    if (restored.includes(tag)) {
      const suffix = before.match(/<script>([\s\S]*?)<\/script>/)[1].match(/\s*$/)[0];
      restored = restored.replace(tag, `<script>${read(`public/assets/js/${js}`).trimEnd()}${suffix}</script>`);
    }
  }
  assert.equal(normalized(restored), normalized(before), `Source, script order, or cascade changed: ${file.path}`);
  reconstructed++;
}
console.log(`Preservation passed: ${frozen} protected/data/config/image files; ${reconstructed} original frontend sources reconstructed exactly (line endings normalized).`);
if (runtimeDataDrift.length) console.log(`Runtime data drift reported, not restored or treated as unchanged: ${runtimeDataDrift.join(', ')}`);
