const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerSecurityCenter } = require('../services/security-center');

test('activity log returns all records and can filter every developer-only entry without truncation', async t => {
  let filter;
  let appliedLimit = null;
  const rows = Array.from({ length: 135 }, (_, index) => ({ actorRole: index % 2 ? 'software_development' : 'president', action: `PATCH /api/admin/clubs/${index}` }));
  rows.push({ actorRole: 'admin', action: 'club_import_undo_state', details: 'encrypted undo snapshot' });
  const AuditLog = {
    find(value) {
      filter = value;
      const selectedRows = rows.filter(row => row.action !== value?.action?.$ne && (!value?.actorRole || row.actorRole === value.actorRole));
      const query = {
        select() { return this; }, sort() { return this; }, limit(value) { appliedLimit = value; return this; },
        lean: async () => selectedRows
      };
      return query;
    }
  };
  const app = express();
  registerSecurityCenter(app, { requireAdmin: (_req, _res, next) => next(), AuditLog });
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${base}/api/admin/security/audit?actorRole=software_development`);
  assert.equal(response.status, 200);
  assert.deepEqual(filter, { action: { $ne: 'club_import_undo_state' }, actorRole: 'software_development' });
  assert.equal((await response.json()).logs.length, 67, 'the developer view must include every developer record');
  const allResponse = await fetch(`${base}/api/admin/security/audit`);
  assert.equal(allResponse.status, 200);
  assert.deepEqual(filter, { action: { $ne: 'club_import_undo_state' } });
  assert.equal((await allResponse.json()).logs.length, 135, 'the all-activity endpoint must include every role');
  const recentResponse = await fetch(`${base}/api/admin/security/audit?limit=50`);
  assert.equal(recentResponse.status, 200);
  assert.equal(appliedLimit, 50, 'summary panels can request a bounded recent window');
  assert.equal((await fetch(`${base}/api/admin/security/audit?actorRole=president`)).status, 400);
  assert.equal((await fetch(`${base}/api/admin/security/audit?limit=500`)).status, 400);
});
