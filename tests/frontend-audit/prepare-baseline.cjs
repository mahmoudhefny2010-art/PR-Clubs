// Restore only original frontend files into an ignored local test directory.
// No checkout, branch switch, server import, credentials, or data files are involved.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { commit, files } = require('../../docs/frontend-audit/baseline.json');
const root = path.resolve(__dirname, '../..');
const destination = path.join(root, '.frontend-audit/baseline');
let count = 0;
for (const file of files.filter((item) => /^(?:public|private)\//.test(item.path))) {
  const target = path.join(destination, file.path);
  if (fs.existsSync(target)) continue;
  const content = execFileSync('git', ['show', `${commit}:${file.path}`], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  count++;
}
console.log(`Prepared ${count} original frontend files from ${commit}; existing baseline snapshots retained.`);
