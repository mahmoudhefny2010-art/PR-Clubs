const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../server'), 'utf8');
const start = source.indexOf("app.post('/api/applications',");
const end = source.indexOf("app.get('/api/student/my-forms',", start);

function harness({ status = 'removed', signedIn = true, failRelease = false, failCreate = false, keyConflict = false } = {}) {
  const records = [{ id: 10, clubId: 1, email: 'member@example.test', status, studentAccountId: 'student', studentClubKey: 'student:1', notes: 'Interview history' }];
  let handler, releases = 0;
  const query = value => ({ select() { return this; }, read() { return this; }, readConcern() { return this; }, lean: async () => value });
  const context = { require: name => require(require('node:path').resolve(__dirname, '..', name)),
    app: { post(_path, callback) { handler = callback; } },
    requireLiveDatabase: () => true,
    Club: { findOne: () => query({ id: 1, status: 'open', applicationFields: [] }) },
    clubAccounts: [{ clubId: 1, role: 'head', committee: 'IT' }],
    cleanText: value => String(value || '').trim(),
    getManagedCommittees: () => ['IT'], getCommitteeApplicationStatus: () => 'open',
    getStudentAccountFromRequest: async () => signedIn ? { _id: 'student', email: 'member@example.test', sessionVersion: 1 } : null,
    getApplicantPhoto: async () => ({ url: '/photo.png', publicId: '' }),
    generateMyFormCode: () => 'fixture-token', hashMyFormToken: () => 'fixture-hash',
    applications: [], toApiRecord: value => value,
    console: { error() {} },
    StudentAccount: { findOneAndUpdate(_filter, update) { return query(update.$set); } },
    Application: {
      findOne(filter) {
        assert.equal(filter.status.$ne, 'removed');
        return query(records.find(row => row.clubId === filter.clubId && row.status !== filter.status.$ne
          && filter.$or.some(identity => Object.entries(identity).every(([key, value]) => row[key] === value))));
      },
      async updateMany(filter, update) {
        releases++;
        if (failRelease) throw new Error('Database unavailable');
        assert.equal(filter.status, 'removed');
        for (const row of records) if (row.studentClubKey === filter.studentClubKey && row.status === 'removed') {
          for (const key of Object.keys(update.$unset)) delete row[key];
        }
      },
      async create(record) {
        if (failCreate) throw new Error('Save failed');
        if (keyConflict || (record.studentClubKey && records.some(row => row.studentClubKey === record.studentClubKey))) {
          throw Object.assign(new Error('Duplicate'), { code: 11000, keyPattern: { studentClubKey: 1 } });
        }
        records.push({ ...record });
      }
    }
  };
  vm.runInNewContext(source.slice(start, end), context);
  return { records, get releases() { return releases; }, async submit() {
    const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ body: { clubId: 1, committee: 'IT', email: 'member@example.test', studentName: 'Fixture Member' } }, response);
    return response;
  } };
}

test('removed member can reapply; old record is preserved and the new pending application blocks another submission', async () => {
  const h = harness();
  assert.equal((await h.submit()).code, 201);
  assert.equal(h.records.length, 2);
  assert.equal(h.records[0].status, 'removed');
  assert.equal(h.records[0].notes, 'Interview history');
  assert.equal(h.records[0].studentClubKey, undefined);
  assert.equal(h.records[1].status, 'pending');
  assert.equal(h.records[1].studentClubKey, 'student:1');
  assert.equal((await h.submit()).code, 409);
  assert.equal(h.records.length, 2);
});

for (const status of ['pending', 'accepted', 'rejected']) {
  test(`${status} application still blocks duplicate submission`, async () => {
    const h = harness({ status });
    assert.equal((await h.submit()).code, 409);
    assert.equal(h.releases, 0);
    assert.equal(h.records.length, 1);
    assert.equal(h.records[0].studentClubKey, 'student:1');
  });
}

test('removed application also permits the existing unsigned-in submission flow', async () => {
  const h = harness({ signedIn: false });
  assert.equal((await h.submit()).code, 201);
  assert.equal(h.records[0].status, 'removed');
  assert.equal(h.records[1].status, 'pending');
  assert.equal(h.releases, 0);
});

for (const option of ['failRelease', 'failCreate']) {
  test(`${option} does not report success or insert a pending application`, async () => {
    const h = harness({ [option]: true });
    assert.equal((await h.submit()).code, 503);
    assert.equal(h.records.length, 1);
    assert.equal(h.records[0].status, 'removed');
  });
}

test('concurrent unique-key conflict returns duplicate error instead of success', async () => {
  const h = harness({ keyConflict: true });
  assert.equal((await h.submit()).code, 409);
  assert.equal(h.records.length, 1);
});
