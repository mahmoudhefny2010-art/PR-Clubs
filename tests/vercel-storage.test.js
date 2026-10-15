const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path').posix;
const source = fs.readFileSync(require.resolve('../server'), 'utf8');
const fragment = source.slice(source.indexOf('const dataDirectory ='), source.indexOf('function readJsonFile'));
function initialize(env) {
  const created = [];
  vm.runInNewContext(fragment, { process: { env }, path, __dirname: '/var/task', require: name => {
    assert.equal(name, 'node:os'); return { tmpdir: () => '/tmp' };
  }, fs: { mkdirSync(directory) {
    if (env.VERCEL && !directory.startsWith('/tmp/')) throw new Error('Read-only deployment filesystem');
    created.push(directory);
  } } });
  return created;
}
test('Vercel initializes local caches only in writable temporary storage and never creates public asset directories', () => {
  assert.deepEqual(initialize({ VERCEL: '1' }), ['/tmp/miu-clubs-data']);
});
test('local development retains its existing data and image directories and supports an explicit cache path', () => {
  assert.deepEqual(initialize({}), ['/var/task/data', '/var/task/public/assets/img/pics']);
  assert.equal(initialize({ LOCAL_DATA_DIRECTORY: '/tmp/custom-cache' })[0], '/tmp/custom-cache');
});
