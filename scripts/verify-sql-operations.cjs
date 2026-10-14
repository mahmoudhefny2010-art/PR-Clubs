const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork, spawn } = require('node:child_process');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const sql = require('mssql');
const { identifier } = require('../database/schema');
const { verifiedBackups, localProfile, cleanup, ttlTargets } = require('./sqlserver-operations.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function browserChecks(origin, accounts, password, directory) {
  const candidates = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
  let executable;
  for (const candidate of candidates) if (await fs.stat(candidate).catch(() => null)) { executable = candidate; break; }
  assert.ok(executable, 'A Chrome-compatible browser is required for UI verification.');
  const profile = path.join(directory, 'browser-profile');
  const browser = spawn(executable, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--disable-extensions', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Browser startup timeout')), 15000);
      browser.once('error', error => { clearTimeout(timeout); reject(error); });
      browser.stderr.on('data', chunk => { output += chunk.toString(); const m = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timeout); resolve(m[1]); } });
    });
    const http = endpoint.replace(/^ws:/, 'http:').split('/devtools/')[0];
    const target = await (await fetch(http + '/json/new?about:blank', { method: 'PUT' })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let next = 0; const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data), item = pending.get(message.id);
      if (!item) return; clearTimeout(item.timer); pending.delete(message.id);
      message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timeout: ' + method)); }, 20000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('Browser evaluation failed'); return r.result.value;
    };
    const wait = async (expression, label) => {
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(100); }
      throw new Error('Browser wait failed: ' + label);
    };
    await send('Page.enable'); await send('Network.enable');
    // Block external resources; QA never needs Google, push or external assets.
    await send('Network.setBlockedURLs', { urls: ['https://*'] });
    const results = [];
    for (const account of accounts) {
      await send('Network.clearBrowserCookies');
      await send('Page.navigate', { url: origin + '/pages/applicant-login.html?redirect=/' });
      await wait("document.readyState === 'complete' && Boolean(document.getElementById('studentLoginForm')) && typeof studentReturnTarget === 'function'", 'login form scripts');
      await evaluate(`document.getElementById('uniId').value=${JSON.stringify(account.email)}; document.getElementById('uniPassword').value=${JSON.stringify(password)}; document.getElementById('studentLoginForm').requestSubmit(); true;`);
      await wait("!location.pathname.includes('applicant-login')", account.role + ' redirect');
      const sessionPath = account.role === 'admin' ? '/api/admin/session' : account.role === 'student' ? '/api/student-auth/session' : '/api/club-auth/session';
      assert.equal(await evaluate(`fetch(${JSON.stringify(sessionPath)}).then(async r => r.status===200 && (await r.json()).authenticated===true)`), true, account.role + ' browser session');
      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(directory, 'browser-' + account.role + '.png'), Buffer.from(screenshot.data, 'base64'));
      results.push({ role: account.role, loginForm: true, session: true, redirect: await evaluate('location.pathname') });
      console.log('PASS: browser login and redirect ' + account.role);
    }
    return results;
  } finally { socket?.close(); browser.kill(); }
}

async function main(directory) {
  const source = process.env.SQLSERVER_DATABASE, config = localProfile(source);
  const backupDirectory = await fs.realpath(directory);
  const entries = await verifiedBackups(backupDirectory, source);
  assert.ok(entries[0], 'A verified native backup is required.');
  const suffix = Date.now() + '_' + crypto.randomBytes(4).toString('hex');
  const target = source + '_qa_' + suffix;
  assert.match(target, /^[A-Za-z0-9_-]+_qa_[0-9]+_[a-f0-9]{8}$/);
  assert.notEqual(source, target);
  const reportDirectory = path.resolve(backupDirectory, '..', 'verification-' + suffix);
  await fs.mkdir(reportDirectory);
  const report = { sourceDatabase: source, isolatedDatabase: target, backupFile: entries[0].file, startedAt: new Date().toISOString(), cases: [], passed: false };
  let master, pool, child, created = false;
  try {
    master = await new sql.ConnectionPool({ ...config, database: 'master' }).connect();
    const defaults = (await master.request().query("SELECT SERVERPROPERTY('InstanceDefaultDataPath') AS dataPath, SERVERPROPERTY('InstanceDefaultLogPath') AS logPath;")).recordset[0];
    const backupPath = path.join(backupDirectory, entries[0].file);
    const files = (await master.request().input('backup', sql.NVarChar, backupPath).query('RESTORE FILELISTONLY FROM DISK=@backup;')).recordset;
    const request = master.request().input('backup', sql.NVarChar, backupPath);
    const moves = files.map((file, i) => {
      assert.ok(['D', 'L'].includes(file.Type), 'Unsupported backup file type');
      request.input('logical' + i, sql.NVarChar, file.LogicalName);
      request.input('file' + i, sql.NVarChar, path.join(file.Type === 'L' ? defaults.logPath : defaults.dataPath, target + '_' + i + (file.Type === 'L' ? '.ldf' : '.mdf')));
      return `MOVE @logical${i} TO @file${i}`;
    });
    assert.equal((await master.request().input('target', sql.NVarChar, target).query('SELECT COUNT(*) AS count FROM sys.databases WHERE name=@target;')).recordset[0].count, 0);
    await request.query(`RESTORE DATABASE ${identifier(target)} FROM DISK=@backup WITH ${moves.join(', ')}, RECOVERY, CHECKSUM;`);
    created = true;
    console.log('PASS: native backup restored to an isolated database');
    process.env.SQLSERVER_DATABASE = target;
    process.env.SQLSERVER_MIGRATION_TARGET_DATABASE = target;
    process.env.NODE_ENV = 'test';
    pool = await new sql.ConnectionPool({ ...config, database: target }).connect();
    await pool.request().query('DBCC CHECKDB WITH PHYSICAL_ONLY, NO_INFOMSGS;');
    report.restoreChecksumAndPhysicalCheck = true;
    console.log('PASS: restored database physical integrity');
    const { catalog } = require('../database/catalog');
    const models = Object.fromEntries(catalog().map(spec => [spec.name, require('../database/models').bindModel(spec.model)]));
    const runtime = require('../database/runtime'); await runtime.connect();
    const password = 'Qa-' + crypto.randomBytes(24).toString('hex');
    const hash = await require('../services/account-passwords').hashAccountPassword(password);
    const club = await models.Club.findOne({ archivedAt: null }).lean(); assert.ok(club);
    const roles = ['president', 'head', 'pr', 'english', 'security', 'sso', 'dean', 'supervisor', 'miu_events', 'software_development'];
    const accounts = roles.map(role => ({ role, email: `qa-${role}-${suffix}@example.test` }));
    for (const account of accounts) await models.ClubAccount.create({ ...account, ...hash, clubId: ['president', 'head'].includes(account.role) ? club.id : 0, committee: 'QA ' + suffix, assignedClubIds: account.role === 'supervisor' ? [club.id] : [] });
    const student = { role: 'student', email: `qa-student-${suffix}@example.test` };
    await models.StudentAccount.create({ email: student.email, name: 'QA Student', ...hash });
    const admin = { role: 'admin', email: `qa-admin-${suffix}@example.test` };
    const ttlRecords = [];
    for (const targetSpec of ttlTargets()) {
      for (const expired of [true, false]) {
        const key = 'qa-' + suffix + '-' + expired;
        const fields = {
          LoginAttempt: { sourceHash: key, windowStart: new Date(), failures: 0 },
          PasswordRecoveryRateLimit: { sourceHash: key, windowStart: new Date(), count: 0 },
          PasswordResetToken: { accountType: 'student', email: key + '@example.test', tokenHash: key },
          SpeakerCvUpload: { _id: key, publicId: key, requesterKey: key },
          StudentEmailCode: { email: key + '@example.test', name: 'QA', ...hash, codeHash: key },
          SiteVisitorPresence: { visitorId: key }
        }[targetSpec.name];
        const record = await models[targetSpec.name].create({ ...fields, expiresAt: new Date(Date.now() + (expired ? -3600000 : 86400000)) });
        ttlRecords.push({ name: targetSpec.name, id: record._id, expired });
      }
    }
    const before = await Promise.all(['Club', 'ClubAccount', 'StudentAccount', 'UniversityContent'].map(name => models[name].countDocuments()));
    await cleanup(pool);
    for (const record of ttlRecords) assert.equal(Boolean(await models[record.name].findById(record.id).lean()), !record.expired, record.name + ' expiry behavior');
    assert.deepEqual(await Promise.all(['Club', 'ClubAccount', 'StudentAccount', 'UniversityContent'].map(name => models[name].countDocuments())), before);
    report.cleanup = { expiredFixturesDeleted: 6, unexpiredFixturesRetained: 6, accountAndContentCountsUnchanged: true };
    console.log('PASS: TTL cleanup removes expired fixtures and retains live data');
    await runtime.disconnect();
    const env = { ...process.env, LOCAL_DATA_DIRECTORY: path.join(reportDirectory, 'data'), ADMIN_EMAIL: admin.email, ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: crypto.randomBytes(32).toString('hex'), MONGO_URI: '', VERCEL: '', VERCEL_URL: '', SQLSERVER_INTEGRATION_TESTS: 'false' };
    for (const key of Object.keys(env)) if (/(SMTP|MAIL|ONESIGNAL|CLOUDINARY|GOOGLE)/i.test(key) && !['ADMIN_EMAIL'].includes(key)) env[key] = '';
    child = fork(path.join(__dirname, 'provider-staging-server.cjs'), [], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout.resume(); child.stderr.resume();
    const origin = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('QA application startup timeout')), 60000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('QA application exited before startup')); });
      child.on('message', message => { if (message.type === 'ready') { clearTimeout(timeout); resolve('http://127.0.0.1:' + message.port); } if (message.type === 'failed') { clearTimeout(timeout); reject(new Error('QA application initialization failed')); } });
    });
    const call = async (name, method, endpoint, expected, body, cookie = '') => {
      const response = await fetch(origin + endpoint, { method, headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000), redirect: 'manual' });
      const text = await response.text(); let data; try { data = JSON.parse(text); } catch {}
      assert.equal(response.status, expected, name + ': ' + method + ' ' + endpoint);
      report.cases.push({ name, method, endpoint, status: response.status });
      console.log('PASS:', name);
      const cookies = response.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => !c.endsWith('=')).join('; ');
      return { data, cookie: cookies };
    };
    await call('Guest admin guard', 'GET', '/api/admin/homepage', 401);
    await call('Guest club guard', 'GET', '/api/club/dashboard', 401);
    await call('Guest student guard', 'GET', '/api/student-auth/profile', 401);
    await call('Wrong password', 'POST', '/api/auth/login', 401, { email: student.email, password: 'wrong-password' });
    const sessions = {};
    for (const account of [admin, ...accounts, student]) {
      const session = await call(account.role + ' login', 'POST', '/api/auth/login', 200, { email: account.email, password });
      assert.equal(session.data.role, account.role); assert.ok(session.cookie); sessions[account.role] = session.cookie;
      if (!['admin', 'software_development'].includes(account.role)) await call(account.role + ' cannot administer', 'GET', '/api/admin/homepage', 401, undefined, session.cookie);
      if (['pr', 'english', 'security', 'dean'].includes(account.role)) await call(account.role + ' committee access', 'GET', '/api/committee/requests', 200, undefined, session.cookie);
    }
    await call('Admin settings read', 'GET', '/api/admin/homepage', 200, undefined, sessions.admin);
    await call('Software delegated administration', 'GET', '/api/admin/homepage', 200, undefined, sessions.software_development);
    await call('Supervisor assigned clubs', 'GET', '/api/supervisor/clubs', 200, undefined, sessions.supervisor);
    await call('MIU Events content access', 'GET', '/api/miu-events/content', 200, undefined, sessions.miu_events);
    await call('SSO attendance access', 'GET', '/api/committee/attendance-overview', 200, undefined, sessions.sso);
    await call('Head cannot change club status', 'PATCH', '/api/club/status', 403, { status: 'closed' }, sessions.head);
    await call('President status update', 'PATCH', '/api/club/status', 200, { status: 'closed' }, sessions.president);
    const content = await call('President create content draft', 'POST', '/api/club/content', 201, { type: 'feed', title: 'QA draft', description: 'QA isolated draft', submit: false }, sessions.president);
    const endpoint = '/api/club/content/' + content.data.id;
    await call('Head cannot edit unassigned content', 'PUT', endpoint, 403, { title: 'Forbidden' }, sessions.head);
    await call('President update draft', 'PUT', endpoint, 200, { title: 'QA edited draft', description: 'Edited', submit: false }, sessions.president);
    await call('Head cannot delete content', 'DELETE', endpoint, 403, undefined, sessions.head);
    await call('President delete draft', 'DELETE', endpoint, 204, undefined, sessions.president);
    await call('Deleted content unavailable', 'PUT', endpoint, 404, { title: 'Gone' }, sessions.president);
    const headEmail = 'qa-crud-' + suffix + '@example.test', committee = 'QA CRUD ' + suffix;
    await call('Admin create head', 'POST', '/api/admin/club-heads', 201, { clubId: club.id, email: headEmail, committee, password }, sessions.admin);
    await call('Duplicate head rejected', 'POST', '/api/admin/club-heads', 409, { clubId: club.id, email: headEmail, committee, password }, sessions.admin);
    await call('Admin edit head', 'PATCH', '/api/admin/club-heads/' + encodeURIComponent(headEmail), 200, { email: headEmail, committee: committee + ' edited' }, sessions.admin);
    await call('Created head can log in', 'POST', '/api/auth/login', 200, { email: headEmail, password });
    await call('Admin delete head', 'DELETE', '/api/admin/club-heads/' + encodeURIComponent(headEmail), 204, undefined, sessions.admin);
    await call('Deleted head cannot log in', 'POST', '/api/auth/login', 401, { email: headEmail, password });
    const published = await call('Admin publish announcement', 'POST', '/api/admin/university-content', 201, { type: 'announcement', title: 'QA announcement', description: 'Isolated restore verification' }, sessions.admin);
    await call('Admin delete announcement', 'DELETE', '/api/admin/university-content/' + published.data.id, 204, undefined, sessions.admin);
    await call('Student profile update', 'PUT', '/api/student-auth/profile', 200, { name: 'QA Edited', universityId: '00012', major: 'QA', age: '20' }, sessions.student);
    await call('Student logout', 'POST', '/api/student-auth/logout', 204, {}, sessions.student);
    await call('Revoked student cookie denied', 'GET', '/api/student-auth/profile', 401, undefined, sessions.student);
    report.browser = await browserChecks(origin, [admin, ...accounts, student], password, reportDirectory);
    report.passed = true;
  } finally {
    if (child) { child.send?.({ type: 'stop' }); await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(10000)]); if (child.exitCode === null) child.kill(); }
    await require('../database/runtime').disconnect().catch(() => {});
    await pool?.close();
    if (created && master) {
      assert.match(target, /^[A-Za-z0-9_-]+_qa_[0-9]+_[a-f0-9]{8}$/); assert.notEqual(target, source);
      await master.request().query(`ALTER DATABASE ${identifier(target)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${identifier(target)};`);
      report.isolatedDatabaseRemoved = true;
    }
    await master?.close();
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(reportDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ passed: report.passed, httpChecks: report.cases.length, browserRoles: report.browser?.length || 0, isolatedDatabaseRemoved: report.isolatedDatabaseRemoved, reportDirectory }));
  }
}
if (require.main === module) main(process.argv[2]).catch(error => { console.error('SQL QA failed:', error.code || error.name, error.code ? '' : error.message); process.exitCode = 1; });
module.exports = { main };
