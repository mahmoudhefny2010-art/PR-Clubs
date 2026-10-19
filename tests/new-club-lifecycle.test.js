const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { Club, ClubAccount } = require('../models');
const { assignNewClubRole, removeClubRoleAssignment } = require('../services/new-club-accounts');
const source = fs.readFileSync(require.resolve('../server'), 'utf8');

function chain(value) {
  const result = { select() { return this; }, sort() { return this; }, read() { return this; },
    readConcern() { return this; }, session() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
  return result;
}
function fixture() {
  const routes = new Map(); const dbClubs = [{ id: 50, name: 'Existing', members: 18, memberRoster: [], archivedAt: null }]; const dbAccounts = [];
  let failAccount = false; let studentCollision = false; let aborted = 0;
  const session = { pendingUpdates: [], pendingClubs: [], pendingAccounts: [], startTransaction() {},
    async commitTransaction() { dbClubs.push(...this.pendingClubs); dbAccounts.push(...this.pendingAccounts); for (const update of this.pendingUpdates) Object.assign(update.existing,update.value); },
    async abortTransaction() { aborted++; this.pendingClubs = []; this.pendingAccounts = []; this.pendingUpdates = []; }, async endSession() {} };
  const context = { reverseAttendanceService: { bindDevice: async () => {} },
    console: { error() {} }, crypto, Buffer, mongoReady: true,
    clubs: [{ id: 1, name: 'Stale cached club' }], clubAccounts: [],
    app: { post: (path, ...handlers) => routes.set(`POST ${path}`, handlers.at(-1)),
      get: (path, ...handlers) => routes.set(`GET ${path}`, handlers.at(-1)) },
    mongoose: { startSession: async () => session },
    Club: {
      findOne: () => chain(dbClubs.at(-1)), find: () => chain(dbClubs),
      aggregate: () => chain(dbClubs.filter(club => !club.archivedAt)),
      create: async ([value], { session }) => {
        const doc = new Club(value); const error = doc.validateSync(); if (error) throw error;
        session.pendingClubs.push(doc.toObject());
      }
    },
    ClubAccount: {
      findOne: filter => chain(dbAccounts.find(account => filter.email ? account.email === filter.email : filter.googleSub ? account.googleSub === filter.googleSub : String(account._id) === String(filter._id)) || null),
      findOneAndUpdate(filter, update, options) {
        const existing = dbAccounts.find(account => String(account._id) === String(filter._id) && (filter.sessionVersion === undefined || (account.sessionVersion || 0) === filter.sessionVersion));
        if (!existing) return chain(null);
        const value = { ...existing, ...update.$set, sessionVersion: (existing.sessionVersion || 0) + (update.$inc?.sessionVersion || 0) };
        if (options?.session) session.pendingUpdates.push({ existing, value }); else Object.assign(existing,value);
        return chain(value);
      },
      create: async ([value], { session }) => {
        if (failAccount) throw new Error('ACCOUNT_WRITE_FAILED');
        const doc = new ClubAccount(value); const error = doc.validateSync(); if (error) throw error;
        session.pendingAccounts.push(doc.toObject()); return [doc];
      }
    },
    StudentAccount: { exists: async () => studentCollision },
    Application: { aggregate: () => chain([]) },
    require: name => name === './services/new-club-accounts' ? require('../services/new-club-accounts') : ({ StudentFeedback: { aggregate: () => chain([]) } }),
    publicFields: '', publicClubProjection: () => ({}), sendRevalidatedPublicJson: (req, res, records) => res.json(records),
    toApiRecord: value => value, sanitizePublicClub: require('../services/public-club-media').sanitizePublicClub,
    cleanText: (value, limit) => String(value || '').trim().slice(0, limit), positiveNumber: value => Math.max(0, Number(value) || 0),
    normalizeApplicationFields: value => value || [],
    cloudinaryFolders: { club: 'clubs' }, readCloudinaryAsset: async url => ({ url, publicId: 'test-only' }),
    emailMatches: () => false, requireLiveDatabase: () => true, removeClubImage: async () => {}, writePrivateClubAccountsFile: () => {}, notifyClubOpening: async () => {},
    checkLoginSourceLock: async () => false, clearLoginSourceFailures: async () => true,
    countLoginSourceFailure: async () => false, recordSuccessfulSignIn: async () => {},
    clubPasswordMatches: (password, account) => typeof password === 'string'
      && crypto.scryptSync(password, account.salt, 64).toString('hex') === account.passwordHash,
    setClubSessionCookie: (req, res) => res.setHeader('Set-Cookie', 'test-session'), requireClubAuth() {}
    , secureCookieSuffix: () => ''
  };
  vm.createContext(context);
  function evaluate(from, to) { vm.runInContext(source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from))), context); }
  evaluate('async function makeClub(', 'function removeManagedImage(');
  evaluate('function toPublicClubRecord(', "app.use('/api/ask-ai'");
  evaluate("app.post('/api/admin/clubs',", "app.put('/api/admin/clubs/order'");
  evaluate("app.get('/api/clubs',", "app.get('/api/university-content'");
  evaluate("app.post('/api/auth/login',", "app.post('/api/admin/setup'");
  evaluate("app.get('/api/club/dashboard',", '// Public event registration');
  const payload = { name: 'Brand New Club', committee: 'New Committee', category: 'Science', tagline: 'New activities',
    description: 'Student club description', requirements: 'Interest in science', status: 'open', seats: 30,
    imageUrl: 'https://example.test/club.png', clubLoginEmail: 'new-president@miuegypt.edu.eg' };
  async function call(method, path, req = {}) {
    const response = { code: 200, headers: {}, status(code) { this.code = code; return this; },
      json(body) { this.body = body; }, setHeader(key, value) { this.headers[key] = value; }, append() {} };
    await routes.get(`${method} ${path}`)({ body: payload, query: {}, ...req }, response);
    return response;
  }
  return { call, payload, dbClubs, dbAccounts, context, failAccount: () => { failAccount = true; },
    studentCollision: () => { studentCollision = true; }, aborted: () => aborted };
}

test('club import cannot silently move a Vice President role from another club', async () => {
  const current = { _id:'account-1', email:'vp@miuegypt.edu.eg', role:'vice_president', clubId:8,
    roleAssignments:[{ role:'vice_president', clubId:8, assignedClubIds:[], committee:'' }], sessionVersion:2 };
  const ClubAccount = { findOne: () => ({ session() { return this; }, lean: async () => current }) };
  await assert.rejects(assignNewClubRole({ ClubAccount, session:{}, email:current.email, clubId:9, role:'vice_president' }),
    error => error.status === 409 && /already manages another club/i.test(error.message));
});

test('replacing an imported officer removes only that club role and preserves other account roles', async () => {
  const account = { _id: 'account-1', email: 'officer@miuegypt.edu.eg', role: 'president', clubId: 8,
    roleAssignments: [
      { role: 'president', clubId: 8, committee: '' },
      { role: 'head', clubId: 12, committee: 'Media' }
    ], sessionVersion: 3 };
  let update;
  const ClubAccount = {
    findOne: () => ({ session() { return this; }, lean: async () => account }),
    findOneAndUpdate(filter, value) {
      assert.equal(filter.sessionVersion, 3);
      update = { ...account, ...value.$set, sessionVersion: 4 };
      return { session() { return this; }, lean: async () => update };
    }
  };
  const result = await removeClubRoleAssignment({ ClubAccount, session: {}, email: account.email, clubId: 8, role: 'president' });
  assert.equal(result.removed, true);
  assert.deepEqual(result.account.roleAssignments, [{ role: 'head', clubId: 12, assignedClubIds: [], committee: 'Media' }]);
  assert.equal(result.account.role, 'head');
  assert.equal(result.account.clubId, 12);
  assert.equal(result.account.sessionVersion, 4);
});

test('replacing an imported officer deletes an account only when that was its final role', async () => {
  const account = { _id: 'account-2', email: 'officer@miuegypt.edu.eg', role: 'vice_president', clubId: 8,
    roleAssignments: [{ role: 'vice_president', clubId: 8 }], sessionVersion: 0 };
  let deleted = false;
  const ClubAccount = {
    findOne: () => ({ session() { return this; }, lean: async () => account }),
    deleteOne: async (filter, options) => { assert.equal(filter._id, account._id); assert.ok(options.session); deleted = true; return { deletedCount: 1 }; }
  };
  const result = await removeClubRoleAssignment({ ClubAccount, session: {}, email: account.email, clubId: 8, role: 'vice_president' });
  assert.equal(deleted, true);
  assert.equal(result.removed, true);
  assert.equal(result.account, null);
});

test('new club receives a president account and appears in both public API variants and its dashboard', async () => {
  const state = fixture();
  const created = await state.call('POST', '/api/admin/clubs');
  assert.equal(created.code, 201);
  assert.equal(created.body.id, 51, 'ID comes from database rather than stale instance cache');
  assert.equal(created.body.seats, 0, 'clubs have no application seat limit');
  assert.equal(state.dbAccounts[0].clubId, 51); assert.equal(state.dbAccounts[0].role, 'president');
  assert.equal(state.dbAccounts[0].password, undefined);
  assert.ok(state.dbAccounts[0].passwordHash);
  assert.equal(state.dbClubs.at(-1).archivedAt, null);
  assert.ok(Array.isArray(state.dbClubs.at(-1).events));
  for (const query of [{}, { media: 'links' }]) {
    const homepage = await state.call('GET', '/api/clubs', { query });
    assert.equal(homepage.code, 200);
    assert.ok(homepage.body.some(club => club.id === 51 && club.name === state.payload.name));
    assert.equal(homepage.body.find(club => club.id === 50).members, 0, 'member totals come from roster and accepted applications, not the legacy manual count');
  }
  const login = await require('../services/staff-google-auth').resolveStaffGoogleAccount(state.context.ClubAccount,
    { email: state.payload.clubLoginEmail, googleSub: 'verified-google-subject' });
  assert.equal(login.redirect, '/club-dashboard'); assert.equal(login.account.role, 'president');
  assert.equal(login.account.googleSub, 'verified-google-subject');
  const dashboard = await state.call('GET', '/api/club/dashboard', { clubAccount: state.dbAccounts[0] });
  assert.equal(dashboard.body.id, 51); assert.equal(dashboard.body.role, 'president');
  const wrongPassword = await state.call('POST', '/api/auth/login', { body: { email: state.payload.clubLoginEmail, password: 'wrong-password' } });
  assert.equal(wrongPassword.code, 401);
});
test('account write failure rolls back club creation and does not update the public cache', async () => {
  const state = fixture(); state.failAccount();
  const result = await state.call('POST', '/api/admin/clubs');
  assert.equal(result.code, 503); assert.equal(state.aborted(), 1);
  assert.equal(state.dbClubs.length, 1); assert.equal(state.dbAccounts.length, 0);
  assert.equal(state.context.clubs.length, 1); assert.equal(state.context.clubAccounts.length, 0);
});
test('club creation rejects an existing name regardless of case, spacing, or archive status', async () => {
  const active = fixture();
  const activeResult = await active.call('POST', '/api/admin/clubs', { body: { ...active.payload, name: '  eXISTING  ' } });
  assert.equal(activeResult.code, 409);
  assert.equal(activeResult.body.code, 'CLUB_ALREADY_EXISTS');
  assert.equal(activeResult.body.existingClubId, 50);
  assert.equal(activeResult.body.archived, false);
  assert.equal(active.dbClubs.length, 1);
  assert.equal(active.dbAccounts.length, 0);

  const archived = fixture();
  archived.dbClubs[0].archivedAt = new Date();
  const archivedResult = await archived.call('POST', '/api/admin/clubs', { body: { ...archived.payload, name: 'Existing' } });
  assert.equal(archivedResult.code, 409);
  assert.equal(archivedResult.body.archived, true);
  assert.match(archivedResult.body.message, /Archived clubs/);
  assert.equal(archived.dbClubs.length, 1);
});
test('existing student can become president through Google; invalid emails and missing image reject creation', async () => {
  const student = fixture(); student.studentCollision();
  assert.equal((await student.call('POST', '/api/admin/clubs')).code, 201);
  const noImage = fixture();
  assert.equal((await noImage.call('POST', '/api/admin/clubs', { body: { ...noImage.payload, imageUrl: '' } })).code, 400);
  for (const patch of [{clubLoginEmail:'outside@example.com'}, {supervisorEmail:'outside@example.com'}, {supervisorEmail:student.payload.clubLoginEmail}]) {
    const state=fixture(); assert.equal((await state.call('POST','/api/admin/clubs',{body:{...state.payload,...patch}})).code,400);
    assert.equal(state.dbClubs.length,1);
  }
});

test('optional supervisor is saved atomically with a scoped role; blank creates only the president',async()=>{
  const blank=fixture();assert.equal((await blank.call('POST','/api/admin/clubs',{body:{...blank.payload,supervisorEmail:'  '}})).code,201);assert.equal(blank.dbAccounts.length,1);
  const state=fixture();const result=await state.call('POST','/api/admin/clubs',{body:{...state.payload,supervisorEmail:'SUPERVISOR@miuegypt.edu.eg'}});
  assert.equal(result.code,201);assert.equal(state.dbAccounts.length,2);const supervisor=state.dbAccounts.find(account=>account.role==='supervisor');
  assert.equal(supervisor.email,'supervisor@miuegypt.edu.eg');assert.deepEqual(supervisor.assignedClubIds,[51]);
});

test('existing supervisor retains Google identity, other roles and clubs; existing president conflict rolls back',async()=>{
  const state=fixture();const existing=new ClubAccount({email:'supervisor@miuegypt.edu.eg',role:'dean',clubId:0,salt:'kept',passwordHash:'kept',googleSub:'kept-sub',sessionVersion:3,
    roleAssignments:[{role:'dean',clubId:0},{role:'supervisor',clubId:50,assignedClubIds:[50]}]}).toObject();state.dbAccounts.push(existing);
  assert.equal((await state.call('POST','/api/admin/clubs',{body:{...state.payload,supervisorEmail:existing.email}})).code,201);
  assert.equal(existing.role,'dean');assert.equal(existing.googleSub,'kept-sub');assert.equal(existing.passwordHash,'kept');assert.equal(existing.sessionVersion,4);
  assert.deepEqual(existing.roleAssignments.find(item=>item.role==='supervisor').assignedClubIds,[50,51]);
  const conflict=fixture();conflict.dbAccounts.push(new ClubAccount({email:conflict.payload.clubLoginEmail,role:'president',clubId:50,salt:'kept',passwordHash:'kept'}).toObject());
  assert.equal((await conflict.call('POST','/api/admin/clubs')).code,409);assert.equal(conflict.dbClubs.length,1);assert.equal(conflict.aborted(),1);
});

test('failure while assigning supervisor rolls back club and new president',async()=>{
  const state=fixture();const create=state.context.ClubAccount.create;let count=0;
  state.context.ClubAccount.create=async(...args)=>{if(++count===2)throw Error('SUPERVISOR_WRITE_FAILED');return create(...args);};
  assert.equal((await state.call('POST','/api/admin/clubs',{body:{...state.payload,supervisorEmail:'supervisor@miuegypt.edu.eg'}})).code,503);
  assert.equal(state.dbClubs.length,1);assert.equal(state.dbAccounts.length,0);assert.equal(state.context.clubAccounts.length,0);
});
