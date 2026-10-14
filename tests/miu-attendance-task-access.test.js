const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

async function fixture(t, assignedEmail) {
  const app = express();
  const context = {
    app,
    getStudentAccountFromRequest: async req => req.headers['x-test-email']
      ? { email: req.headers['x-test-email'] }
      : null,
    getClubAccountFromRequest: async () => null,
    requireLiveDatabase: () => true,
    AttendanceSession: {
      exists: async filter => filter.assignedMemberEmail === assignedEmail
        ? { _id: 'active-assignment' }
        : null
    },
    path,
    __dirname: path.resolve(__dirname, '..')
  };
  vm.createContext(context);
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf('async function requireAttendanceTaskAuth');
  const end = source.indexOf("app.post('/api/miu-attendance-task/accept'", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return email => fetch(`http://127.0.0.1:${server.address().port}/pages/my-attendance-task.html`, {
    headers: email ? { 'x-test-email': email } : {}
  });
}

test('only the assigned account can open its active MIU attendance task page', async t => {
  const request = await fixture(t, 'usher@miuegypt.edu.eg');

  const assigned = await request('usher@miuegypt.edu.eg');
  assert.equal(assigned.status, 200);
  assert.match(await assigned.text(), /Attendance usher task/);

  const other = await request('other@miuegypt.edu.eg');
  assert.equal(other.status, 404);

  const anonymous = await request('');
  assert.equal(anonymous.status, 401);
});
