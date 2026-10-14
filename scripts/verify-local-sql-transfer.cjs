require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork, spawnSync } = require('node:child_process');
const { MongoClient } = require('mongoose').mongo;
const { isolatedRestoreUri } = require('./sqlserver-transfer-local.cjs');
const { compareApis } = require('./verify-database-api-parity.cjs');
const { protectedPath } = require('./sqlserver-migrate.cjs');

async function launch(env) {
  const child = fork(path.join(__dirname, 'provider-staging-server.cjs'), [], { env: { ...process.env, ...env, NODE_ENV: 'test' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  // Child diagnostics can contain deployment values; retain no raw logs.
  child.stdout.resume(); child.stderr.resume();
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Staging ' + env.DATABASE_PROVIDER + ' startup timed out.')); }, 180000);
    child.once('error', () => { clearTimeout(timeout); reject(new Error('Staging process failed.')); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Staging exited before readiness.')); });
    child.on('message', message => {
      if (message?.type === 'ready') { clearTimeout(timeout); resolve('http://127.0.0.1:' + message.port); }
      if (message?.type === 'failed') { clearTimeout(timeout); reject(new Error('Staging ' + env.DATABASE_PROVIDER + ' readiness failed: ' + (message.reason || 'unknown'))); }
    });
  });
  return { child, origin };
}
async function stop(staging) {
  if (!staging || staging.child.exitCode !== null) return;
  await new Promise(resolve => {
    const timeout = setTimeout(() => { staging.child.kill(); resolve(); }, 10000);
    staging.child.once('exit', () => { clearTimeout(timeout); resolve(); });
    staging.child.send({ type: 'stop' });
  });
}
async function main(directory) {
  if (process.env.DATABASE_PROVIDER !== 'sqlserver' || process.env.SQLSERVER_DATABASE !== 'clubs') throw new Error('Expected the approved SQL target.');
  const evidence = JSON.parse(fs.readFileSync(protectedPath(path.join(directory, 'backup-evidence.json')), 'utf8'));
  if (evidence.sourceDatabase === evidence.restoredDatabase || !/^clubs_restore_[a-z0-9_]+$/.test(evidence.restoredDatabase)) throw new Error('Refusing staging startup against the original Mongo database.');
  const client = new MongoClient(process.env.MONGO_URI);
  const restoredUri = isolatedRestoreUri(process.env.MONGO_URI, evidence.restoredDatabase, client.options.credentials?.source);
  let mongo, sql;
  try {
    // Mongo's normal startup may normalize records only in this disposable
    // restore, after export/import verification has completed. Never use source.
    const launches = await Promise.allSettled([
      launch({ DATABASE_PROVIDER: 'mongodb', MONGO_URI: restoredUri }),
      launch({ DATABASE_PROVIDER: 'sqlserver', SQLSERVER_MIGRATION_TARGET_DATABASE: 'clubs' })
    ]);
    mongo = launches[0].status === 'fulfilled' ? launches[0].value : null;
    sql = launches[1].status === 'fulfilled' ? launches[1].value : null;
    for (const result of launches) if (result.status === 'rejected') throw result.reason;
    const cases = [
      { path: '/api/clubs?media=links', expectedStatus: 200 },
      { path: '/api/university-content', expectedStatus: 200 },
      { name: 'Unauthenticated admin settings guard', path: '/api/admin/homepage', expectedStatus: 401 },
      { path: '/api/clubs', expectedStatus: 200 }
    ];
    console.log('Both staging databases are ready; comparing public HTTP responses.');
    const fetcher = async (url, options) => {
      const started = Date.now();
      const response = await fetch(url, options);
      console.log('Public response headers:', url.origin === sql.origin ? 'SQL' : 'Mongo', url.pathname, response.status, 'elapsedMs:', Date.now() - started);
      return response;
    };
    const report = await compareApis({ mongoOrigin: mongo.origin, sqlOrigin: sql.origin, cases, fetcher, requestTimeoutMs: 90000 });
    console.log('Live public API comparisons:', JSON.stringify({ passed: report.passed, cases: report.results.length, results: report.results }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let streamReady = false;
    try {
      const response = await fetch(sql.origin + '/api/site/public-data-stream', { signal: controller.signal });
      if (response.status !== 200) throw new Error('SQL SSE initialization failed.');
      const reader = response.body.getReader();
      let data = '';
      while (!data.includes('event: invalidate')) { const next = await reader.read(); if (next.done) break; data += Buffer.from(next.value).toString(); }
      streamReady = data.includes('event: invalidate') && data.includes('universityContent');
    } finally { clearTimeout(timeout); controller.abort(); }
    if (!report.passed || !streamReady) throw new Error('Live public contract verification failed.');
    const integration = spawnSync(process.execPath, ['--test', 'tests/sqlserver-integration.test.js'], {
      cwd: path.resolve(__dirname, '..'), windowsHide: true, encoding: 'utf8', timeout: 90000,
      env: { ...process.env, NODE_ENV: 'test', DATABASE_PROVIDER: 'sqlserver', SQLSERVER_MIGRATION_TARGET_DATABASE: 'clubs', SQLSERVER_INTEGRATION_TESTS: 'true' }
    });
    // Tests expose only fixture data and status, never configured credentials.
    process.stdout.write(integration.stdout || '');
    if (integration.status !== 0) throw new Error('Real SQL integration tests failed.');
    const final = { passed: true, checkedAt: new Date().toISOString(), publicApi: report, sqlSse: streamReady, sqlRollbackIntegration: true, originalMongoWritten: false };
    const filename = protectedPath(path.join(directory, 'live-verification-' + crypto.randomBytes(4).toString('hex') + '.json'));
    fs.writeFileSync(filename, JSON.stringify(final, null, 2), { flag: 'wx', mode: 0o600 });
    console.log('SQL live public APIs, SSE and rolled-back CRUD/notification tests: passed.');
  } finally { await Promise.allSettled([stop(mongo), stop(sql)]); await client.close().catch(() => {}); }
}
if (require.main === module) main(process.argv[2]).catch(error => {
  console.error('Live SQL verification stopped:', error.code || error.name);
  if (error.constructor === Error && !error.code) console.error(error.message);
  process.exitCode = 1;
});
