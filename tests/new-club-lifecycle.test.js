const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { Club, ClubAccount } = require('../models');
const source = fs.readFileSync(require.resolve('../server'), 'utf8');

function chain(value) {
  const result = { select() { return this; }, sort() { return this; }, read() { return this; },
    readConcern() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
  return result;
}
function fixture() {
  const routes = new Map(); const dbClubs = [{ id: 50, name: 'Existing', archivedAt: null }]; const dbAccounts = [];
  let failAccount = false; let studentCollision = false; let aborted = 0;
  const session = { pendingClubs: [], pendingAccounts: [], startTransaction() {},
    async commitTransaction() { dbClubs.push(...this.pendingClubs); dbAccounts.push(...this.pendingAccounts); },
    async abortTransaction() { aborted++; this.pendingClubs = []; this.pendingAccounts = []; }, async endSession() {} };
  const context = {
    console: { error() {} }, crypto, Buffer, mongoReady: true,
    clubs: [{ id: 1, name: 'Stale cached club' }], clubAccounts: [],
    app: { post: (path, ...handlers) => routes.set(`POST ${path}`, handlers.at(-1)),
      get: (path, ...handlers) => routes.set(`GET ${path}`, handlers.at(-1)) },
    mongoose: { startSession: async () => session },
    Club: {
      findOne: () => chain(dbClubs.at(-1)), find: () => chain(dbClubs.filter(club => !club.archivedAt)),
      aggregate: () => chain(dbClubs.filter(club => !club.archivedAt)),
      create: async ([value], { session }) => {
        const doc = new Club(value); const error = doc.validateSync(); if (error) throw error;
        session.pendingClubs.push(doc.toObject());
      }
    },
    ClubAccount: {
      findOne: ({ email }) => chain(dbAccounts.find(account => account.email === email) || null),
      create: async ([value], { session }) => {
        if (failAccount) throw new Error('ACCOUNT_WRITE_FAILED');
        const doc = new ClubAccount(value); const error = doc.validateSync(); if (error) throw error;
        session.pendingAccounts.push(doc.toObject());
      }
    },
    StudentAccount: { exists: async () => studentCollision },
    Application: { aggregate: () => chain([]) },
    require: () => ({ StudentFeedback: { aggregate: () => chain([]) } }),
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
  evaluate("app.post('/api/club-auth/login',", "app.post('/api/club-auth/logout'");
  evaluate("app.get('/api/club/dashboard',", '// Public event registration');
  const payload = { name: 'Brand New Club', committee: 'New Committee', category: 'Science', tagline: 'New activities',
    description: 'Student club description', requirements: 'Interest in science', status: 'open', seats: 30,
    imageUrl: 'https://example.test/club.png', clubLoginEmail: 'new-club@example.edu', clubInitialPassword: 'test-password-12345' };
  async function call(method, path, req = {}) {
    const response = { code: 200, headers: {}, status(code) { this.code = code; return this; },
      json(body) { this.body = body; }, setHeader(key, value) { this.headers[key] = value; }, append() {} };
    await routes.get(`${method} ${path}`)({ body: payload, query: {}, ...req }, response);
    return response;
  }
  return { call, payload, dbClubs, dbAccounts, context, failAccount: () => { failAccount = true; },
    studentCollision: () => { studentCollision = true; }, aborted: () => aborted };
}

test('new club receives a president account and appears in both public API variants and its dashboard', async () => {
  const state = fixture();
  const created = await state.call('POST', '/api/admin/clubs');
  assert.equal(created.code, 201);
  assert.equal(created.body.id, 51, 'ID comes from database rather than stale instance cache');
  assert.equal(state.dbAccounts[0].clubId, 51); assert.equal(state.dbAccounts[0].role, 'president');
  assert.equal(state.dbAccounts[0].password, undefined);
  assert.ok(state.dbAccounts[0].passwordHash);
  assert.equal(state.dbClubs.at(-1).archivedAt, null);
  assert.ok(Array.isArray(state.dbClubs.at(-1).events));
  for (const query of [{}, { media: 'links' }]) {
    const homepage = await state.call('GET', '/api/clubs', { query });
    assert.equal(homepage.code, 200);
    assert.ok(homepage.body.some(club => club.id === 51 && club.name === state.payload.name));
  }
  const login = await state.call('POST', '/api/club-auth/login', { body: { email: state.payload.clubLoginEmail, password: state.payload.clubInitialPassword } });
  assert.equal(login.code, 200); assert.equal(login.body.club.id, 51); assert.equal(login.body.club.role, 'president');
  assert.equal(login.headers['Set-Cookie'], 'test-session');
  const dashboard = await state.call('GET', '/api/club/dashboard', { clubAccount: state.dbAccounts[0] });
  assert.equal(dashboard.body.id, 51); assert.equal(dashboard.body.role, 'president');
  const wrongPassword = await state.call('POST', '/api/club-auth/login', { body: { email: state.payload.clubLoginEmail, password: 'wrong-password' } });
  assert.equal(wrongPassword.code, 401);
});
test('account write failure rolls back club creation and does not update the public cache', async () => {
  const state = fixture(); state.failAccount();
  const result = await state.call('POST', '/api/admin/clubs');
  assert.equal(result.code, 503); assert.equal(state.aborted(), 1);
  assert.equal(state.dbClubs.length, 1); assert.equal(state.dbAccounts.length, 0);
  assert.equal(state.context.clubs.length, 1); assert.equal(state.context.clubAccounts.length, 0);
});
test('student email collisions, missing images and invalid initial passwords fail before creation', async () => {
  const collision = fixture(); collision.studentCollision();
  assert.equal((await collision.call('POST', '/api/admin/clubs')).code, 409);
  assert.equal(collision.dbClubs.length, 1);
  const noImage = fixture();
  assert.equal((await noImage.call('POST', '/api/admin/clubs', { body: { ...noImage.payload, imageUrl: '' } })).code, 400);
  const shortPassword = fixture();
  assert.equal((await shortPassword.call('POST', '/api/admin/clubs', { body: { ...shortPassword.payload, clubInitialPassword: 'short' } })).code, 400);
});
