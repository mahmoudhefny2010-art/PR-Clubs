const test = require('node:test');
const assert = require('node:assert/strict');
const { registerClubMemberRemoval } = require('../services/club-member-removal');

function harness({ roster = [], accepted = [], count = roster.length, failSave = false, ready = true } = {}) {
  let dbClub = { id: 1, memberRoster: structuredClone(roster), members: count };
  let dbApplications = structuredClone(accepted);
  const clubs = [structuredClone(dbClub)], applications = structuredClone(accepted);
  let handlers, ended = false;
  const session = {
    async withTransaction(action) {
      const before = structuredClone({ dbClub, dbApplications });
      try { await action(); } catch (error) { dbClub = before.dbClub; dbApplications = before.dbApplications; throw error; }
    },
    async endSession() { ended = true; }
  };
  const query = value => ({
    select() { return this; }, session(value) { assert.equal(value, session); return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  });
  registerClubMemberRemoval({ delete(path, ...callbacks) { assert.equal(path, '/api/club/members/:memberId'); handlers = callbacks; } }, {
    requireClubAuth(req, res, next) { return req.clubAccount ? next() : res.status(401).json({}); },
    requireClubPresident(req, res, next) { return req.clubAccount.role === 'president' ? next() : res.status(403).json({}); },
    requireLiveDatabase(res) { if (!ready) res.status(503).json({}); return ready; },
    mongoose: { startSession: async () => session }, clubs, applications,
    Club: { findOne(filter) {
      const value = filter.id === dbClub.id ? { ...structuredClone(dbClub), async save(options) {
        assert.equal(options.session, session);
        if (failSave) throw new Error('SAVE_FAILED');
        dbClub = { id: this.id, members: this.members, memberRoster: this.memberRoster, removedMembers: this.removedMembers };
      } } : null;
      return query(value);
    } },
    Application: {
      find: filter => query(dbApplications.filter(a => a.clubId === filter.clubId && a.status === filter.status)),
      async updateMany(filter, update, options) {
        assert.equal(options.session, session);
        for (const a of dbApplications) if (a.clubId === filter.clubId && a.status === filter.status && filter.id.$in.includes(a.id)) {
          Object.assign(a, update.$set);
          for (const key of Object.keys(update.$unset || {})) delete a[key];
        }
      }
    }
  });
  return { async remove(id, role = 'president', clubId = 1) {
    const req = { params: { memberId: id }, clubAccount: role ? { role, clubId } : null };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    let index = 0;
    await (async function next() { if (handlers[index]) await handlers[index++](req, res, next); })();
    return res;
  }, snapshot: () => ({ dbClub, dbApplications, clubs, applications, ended }) };
}

test('removes a manual member, updates count and cache, and does not remove other members', async () => {
  const h = harness({ roster: [{ id: 'one', email: 'one@miuegypt.edu.eg' }, { id: 'two' }], count: 23 });
  assert.equal((await h.remove('one')).statusCode, 200);
  const s = h.snapshot();
  assert.deepEqual(s.dbClub.memberRoster, [{ id: 'two' }]);
  assert.equal(s.dbClub.members, 1, 'stored count is synchronized from the remaining member records');
  assert.equal(s.dbClub.removedMembers[0].status, 'removed');
  assert.equal(s.dbClub.removedMembers[0].id, 'one');
  assert.deepEqual(s.clubs[0], s.dbClub);
  assert.equal(s.ended, true);
  assert.equal((await h.remove('one')).statusCode, 404);
  assert.equal(h.snapshot().dbClub.members, 1);
});

test('removes both membership sources and duplicate accepted applications without deleting history or touching another club', async () => {
  const h = harness({ roster: [{ id: 'manual', email: 'Same@miuegypt.edu.eg' }], count: 1, accepted: [
    { id: 10, clubId: 1, email: 'same@miuegypt.edu.eg', status: 'accepted', studentClubKey: 'student:1', notes: 'Keep interview notes' },
    { id: 11, clubId: 1, email: 'same@miuegypt.edu.eg', status: 'accepted' },
    { id: 12, clubId: 2, email: 'same@miuegypt.edu.eg', status: 'accepted' }
  ] });
  assert.equal((await h.remove('application-10')).statusCode, 200);
  const s = h.snapshot();
  assert.equal(s.dbClub.memberRoster.length, 0);
  assert.equal(s.dbClub.members, 0);
  assert.deepEqual(s.dbApplications.map(a => a.status), ['removed', 'removed', 'accepted']);
  assert.equal(s.dbApplications[0].notes, 'Keep interview notes');
  assert.equal(s.dbApplications[0].studentClubKey, undefined);
  assert.equal(s.applications[0].studentClubKey, undefined);
  assert.equal(s.dbClub.removedMembers[0].status, 'removed');
  assert.deepEqual(s.dbClub.removedMembers[0].applicationIds, [10, 11]);
  assert.deepEqual(s.applications.map(a => a.status), ['removed', 'removed', 'accepted']);
});

test('manual removal also revokes a matching accepted membership', async () => {
  const h = harness({ roster: [{ id: 'manual', email: 'one@miuegypt.edu.eg' }], accepted: [{ id: 5, clubId: 1, email: 'one@miuegypt.edu.eg', status: 'accepted' }] });
  assert.equal((await h.remove('manual')).statusCode, 200);
  assert.equal(h.snapshot().dbApplications[0].status, 'removed');
});

test('removal does not reclassify genuinely rejected or pending applications', async () => {
  const h = harness({ count: 1, accepted: [
    { id: 1, clubId: 1, email: 'member@example.test', status: 'accepted' },
    { id: 2, clubId: 1, email: 'rejected@example.test', status: 'rejected' },
    { id: 3, clubId: 1, email: 'pending@example.test', status: 'pending' }
  ] });
  assert.equal((await h.remove('application-1')).statusCode, 200);
  assert.deepEqual(h.snapshot().dbApplications.map(item => item.status), ['removed', 'rejected', 'pending']);
});

test('requires president authentication and rejects cross-club or malformed member identities', async () => {
  const h = harness({ roster: [{ id: 'one' }], accepted: [{ id: 5, clubId: 2, status: 'accepted' }] });
  assert.equal((await h.remove('one', null)).statusCode, 401);
  for (const role of ['head', 'pr', 'member']) assert.equal((await h.remove('one', role)).statusCode, 403);
  assert.equal((await h.remove('one', 'president', 2)).statusCode, 404);
  assert.equal((await h.remove('application-5')).statusCode, 404);
  assert.equal((await h.remove('application-bad')).statusCode, 400);
  assert.equal(h.snapshot().dbClub.members, 1);
});

test('database failure rolls back application changes and leaves caches untouched', async () => {
  const h = harness({ failSave: true, accepted: [{ id: 5, clubId: 1, status: 'accepted' }] });
  assert.equal((await h.remove('application-5')).statusCode, 503);
  const s = h.snapshot();
  assert.equal(s.dbApplications[0].status, 'accepted');
  assert.equal(s.applications[0].status, 'accepted');
  assert.equal(s.ended, true);
});

test('fails closed while the database is unavailable', async () => {
  const h = harness({ ready: false, roster: [{ id: 'one' }] });
  assert.equal((await h.remove('one')).statusCode, 503);
  assert.equal(h.snapshot().dbClub.memberRoster.length, 1);
});
