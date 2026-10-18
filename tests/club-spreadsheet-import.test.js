const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const accountsService = require('../services/new-club-accounts');
const source = fs.readFileSync(require.resolve('../server'), 'utf8');

function createImportHarness({ clubs = [], accounts = [], failCommit = false } = {}) {
  const routes = new Map();
  const state = { clubs: structuredClone(clubs), accounts: structuredClone(accounts), undoRecords: [], imagesDeleted: [] };
  let sessionNumber = 0;
  const matchesRole = (account, role, clubId) => (account.roleAssignments || []).some(item => item.role === role && item.clubId === clubId)
    || account.role === role && account.clubId === clubId;
  const viewAccounts = session => {
    const result = [...state.accounts, ...(session?.pendingAccounts || [])].map(account => ({ ...account }));
    for (const update of session?.pendingAccountUpdates || []) {
      const index = result.findIndex(account => account._id === update.id);
      if (index >= 0) result[index] = { ...result[index], ...update.value };
    }
    return result.filter(account => !(session?.pendingDeletes || []).includes(account._id));
  };
  const session = () => {
    const value = { pendingClubs: [], pendingClubUpdates: [], pendingAccounts: [], pendingAccountUpdates: [], pendingDeletes: [], pendingUndoRecords: [], pendingUndoUpdates: [],
      startTransaction() {}, async commitTransaction() {
        if (failCommit) throw new Error('COMMIT_ACK_LOST');
        for (const update of this.pendingClubUpdates) Object.assign(update.existing, update.value);
        for (const update of this.pendingAccountUpdates) {
          const existing = [...state.accounts, ...this.pendingAccounts].find(account => account._id === update.id);
          if (existing) Object.assign(existing, update.value);
        }
        for (const update of this.pendingUndoUpdates) {
          const existing = state.undoRecords.find(record => record.id === update.id);
          if (existing) Object.assign(existing, update.value);
        }
        state.clubs.push(...this.pendingClubs); state.accounts.push(...this.pendingAccounts); state.undoRecords.push(...this.pendingUndoRecords);
        state.accounts = state.accounts.filter(account => !this.pendingDeletes.includes(account._id));
        state.clubs = state.clubs.filter(club => !(this.pendingClubDeletes || []).includes(club.id));
      }, async abortTransaction() { this.pendingClubs = []; this.pendingClubUpdates = []; this.pendingAccounts = []; this.pendingAccountUpdates = []; this.pendingDeletes = []; this.pendingUndoRecords = []; this.pendingUndoUpdates = []; this.pendingClubDeletes = []; }, async endSession() {} };
    return value;
  };
  const query = value => ({ select() { return this; }, read() { return this; }, session() { return this; }, lean: async () => value });
  const context = {
    app: { post: (path, ...handlers) => routes.set(`POST ${path}`, handlers.at(-1)), get: (path, ...handlers) => routes.set(`GET ${path}`, handlers.at(-1)) },
    isSameOriginRequest: () => true, requireLiveDatabase: () => true,
    cleanText: (value, max) => String(value || '').trim().slice(0, max), emailMatches: () => false,
    cloudinaryFolders: { club: 'clubs' }, cloudinaryConfigured: true,
    cloudinary: { uploader: { destroy: async id => { state.imagesDeleted.push(id); } } },
    readCloudinaryAsset: async (url, publicId) => ({ url, publicId }),
    makeClub: async (payload, existing, id, image) => ({ id, sortOrder: id, name: payload.name, committee: payload.committee,
      category: payload.category, tagline: payload.tagline, description: payload.description, requirements: payload.requirements,
      image: image.url, imagePublicId: image.publicId, imageFit: 'contain', status: 'open', seats: 0, members: 0,
      memberRoster: [], committeeAvailability: [], applicants: 0, applicationFields: [], archivedAt: null }),
    removeClubImage: async club => { state.imagesDeleted.push(club.imagePublicId); }, writePrivateClubAccountsFile() {},
    clubs: [], clubAccounts: [], console: { error() {} }, crypto, sessionSecret: 'test-session-secret', mongoose: { startSession: async () => session() },
    Club: {
      find: () => ({ select() { return this; }, read() { return this; }, lean: async () => state.clubs.map(club => ({ ...club })) }),
      findOne(filter) { let active; return { session(value) { active = value; return this; }, read() { return this; }, lean: async () => {
        const club = [...state.clubs, ...(active?.pendingClubs || [])].find(item => item.id === filter.id);
        return club ? { ...club } : null;
      } }; },
      findOneAndUpdate(filter, operation, options) {
        const existing = state.clubs.find(club => club.id === filter.id && !club.archivedAt);
        if (!existing) return query(null);
        const updated = { ...existing, ...operation.$set };
        if (options.session) options.session.pendingClubUpdates.push({ existing, value: updated });
        return query(updated);
      },
      create: async ([club], options) => { const saved = structuredClone(club); options.session.pendingClubs.push(saved); return [saved]; }
      ,deleteOne: async (filter, options) => { const session = options?.session; const club = state.clubs.find(item => item.id === filter.id);
        if (!club) return { deletedCount: 0 }; session.pendingClubDeletes ||= []; session.pendingClubDeletes.push(filter.id); return { deletedCount: 1 }; }
    },
    ClubAccount: {
      findOne(filter) {
        let activeSession;
        return { session(value) { activeSession = value; return this; },
          lean: async () => viewAccounts(activeSession).find(account => account.email === filter.email) || null };
      },
      find(filter) {
        let sessionValue;
        const alternatives = filter.$or || [];
        return { session(value) { sessionValue = value; return this; }, lean: async () => viewAccounts(sessionValue).filter(account => alternatives.some(test => {
          const assignment = test.roleAssignments?.$elemMatch;
          return assignment ? matchesRole(account, assignment.role, assignment.clubId)
            : account.role === test.role && account.clubId === test.clubId;
        })) };
      },
      findOneAndUpdate(filter, operation, options) {
        const current = viewAccounts(options.session).find(account => account._id === filter._id);
        if (!current) return query(null);
        const updated = { ...current, ...operation.$set, sessionVersion: (current.sessionVersion || 0) + (operation.$inc?.sessionVersion || 0) };
        options.session.pendingAccountUpdates.push({ id: filter._id, value: updated });
        return query(updated);
      },
      deleteOne: async (filter, options) => { const current = viewAccounts(options.session).find(account => filter._id ? account._id === filter._id : account.email === filter.email);
        if (current) options.session.pendingDeletes.push(current._id); return { deletedCount: current ? 1 : 0 }; },
      create: async ([account], options) => {
        const created = { ...account, _id: `account-${++sessionNumber}` };
        options.session.pendingAccounts.push(created);
        return [{ toObject: () => created }];
      }
    },
    AuditLog: {
      findOne(filter) {
        let active;
        return { session(value) { active = value; return this; }, read() { return this; }, lean: async () => {
          const records = [...state.undoRecords, ...(active?.pendingUndoRecords || [])];
          return records.find(item => Object.entries(filter).every(([key, value]) => item[key] === value)) || null;
        } };
      },
      find(filter) {
        let active, limit = Infinity;
        return { session(value) { active = value; return this; }, read() { return this; }, sort() { return this; }, limit(value) { limit = value; return this; }, lean: async () =>
          [...state.undoRecords, ...(active?.pendingUndoRecords || [])].filter(item => Object.entries(filter).every(([key, value]) => item[key] === value)).slice(-limit).reverse() };
      },
      findOneAndUpdate(filter, operation, options) {
        const current = [...state.undoRecords, ...(options.session?.pendingUndoRecords || [])].find(item => item.id === filter.id);
        if (!current) return query(null);
        const updated = { ...current, ...operation.$set };
        options.session.pendingUndoUpdates.push({ id: current.id, value: updated });
        return query(updated);
      },
      create: async ([record], options) => { options.session.pendingUndoRecords.push(structuredClone(record)); return [record]; }
    },
    Application: { countDocuments: () => ({ session() { return this; }, then(resolve) { resolve(0); } }) },
    ContentRequest: { countDocuments: () => ({ session() { return this; }, then(resolve) { resolve(0); } }) },
    EventRegistration: { countDocuments: () => ({ session() { return this; }, then(resolve) { resolve(0); } }) },
    AttendanceSession: { countDocuments: () => ({ session() { return this; }, then(resolve) { resolve(0); } }) },
    AttendanceAssignment: { countDocuments: () => ({ session() { return this; }, then(resolve) { resolve(0); } }) },
    AttendanceRecord: { countDocuments: () => ({ session() { return this; }, then(resolve) { resolve(0); } }) },
    SpeakerRequest: { countDocuments: () => ({ session() { return this; }, then(resolve) { resolve(0); } }) },
    SpeakerInvite: { countDocuments: () => ({ session() { return this; }, then(resolve) { resolve(0); } }) },
    StudentInterest: { countDocuments: () => ({ session() { return this; }, then(resolve) { resolve(0); } }) },
    adminAuthState: { email: 'admin@miuegypt.edu.eg' }, getConfiguredAdminEmail: () => 'admin@miuegypt.edu.eg',
    require: name => name === './services/new-club-accounts' ? accountsService
      : name === './services/club-import-undo' ? require('../services/club-import-undo') : require(name)
  };
  vm.createContext(context);
  const start = source.indexOf("app.post('/api/admin/clubs/import/cleanup'");
  const end = source.indexOf("app.get('/api/admin/applications'", start);
  vm.runInContext(source.slice(start, end), context);
  async function importBatch(records) {
    const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
      setHeader(key, value) { this.headers[key] = value; }, json(body) { this.body = body; return this; } };
    await routes.get('POST /api/admin/clubs/import')({ body: { records } }, res);
    return res;
  }
  async function undoImport(importId) {
    const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
      setHeader(key, value) { this.headers[key] = value; }, json(body) { this.body = body; return this; } };
    await routes.get('POST /api/admin/clubs/import/undo')({ body: { importId } }, res);
    return res;
  }
  async function latestUndo() {
    const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
      setHeader(key, value) { this.headers[key] = value; }, json(body) { this.body = body; return this; } };
    await routes.get('GET /api/admin/clubs/import/undo/latest')({}, res);
    return res;
  }
  return { state, importBatch, undoImport, latestUndo };
}

const image = index => ({ url: `https://res.cloudinary.com/test/image/upload/clubs/club-${index}.jpg`,
  publicId: `clubs/clubs-00000000-0000-4000-8000-${String(index).padStart(12, '0')}` });
const row = (name, index, presidentEmail = 'president@miuegypt.edu.eg', vicePresidentEmail = 'vice@miuegypt.edu.eg') => ({
  name, category: 'Student club', description: `${name} description`, presidentName: 'President Name', presidentEmail,
  vicePresidentName: 'Vice President Name', vicePresidentEmail, image: image(index),
  newClub: { committee: 'Main Committee', tagline: `${name} activities`, requirements: 'Open to MIU students' }
});

test('club import creates clubs, verifies images, and saves both MIU dashboard roles atomically', async () => {
  const harness = createImportHarness();
  const result = await harness.importBatch([row('New Club', 1)]);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.imported, 1);
  assert.equal(result.body.created, 1);
  assert.equal(result.body.updated, 0);
  assert.equal(result.body.rolesAssigned, 2);
  assert.equal(harness.state.clubs.length, 1);
  assert.equal(harness.state.clubs[0].name, 'New Club');
  assert.equal(harness.state.clubs[0].imagePublicId, image(1).publicId);
  assert.equal(harness.state.accounts.find(account => account.role === 'president').email, 'president@miuegypt.edu.eg');
  assert.equal(harness.state.accounts.find(account => account.role === 'vice_president').email, 'vice@miuegypt.edu.eg');
});

test('club-only import creates a club with safe defaults and no officer accounts', async () => {
  const harness = createImportHarness();
  const clubOnly = { name: 'Sketching Club', description: 'A club for drawing and design.', image: image(11) };
  const result = await harness.importBatch([clubOnly]);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.created, 1);
  assert.equal(result.body.rolesAssigned, 0);
  assert.equal(harness.state.clubs[0].category, 'Other');
  assert.equal(harness.state.clubs[0].committee, 'Sketching Club');
  assert.equal(harness.state.clubs[0].tagline, 'A club for drawing and design.');
  assert.equal(harness.state.clubs[0].requirements, 'Contact the club for current application requirements.');
  assert.equal(harness.state.accounts.length, 0);
});

test('omitting officer emails preserves existing club role assignments', async () => {
  const existing = { id: 8, name: 'Existing Club', category: 'Arts', description: 'Old description', image: 'old-image', imagePublicId: 'clubs/old-image', archivedAt: null };
  const president = { _id: 'president-8', email: 'president@miuegypt.edu.eg', role: 'president', clubId: 8,
    roleAssignments: [{ role: 'president', clubId: 8, committee: '' }] };
  const vice = { _id: 'vice-8', email: 'vice@miuegypt.edu.eg', role: 'vice_president', clubId: 8,
    roleAssignments: [{ role: 'vice_president', clubId: 8, committee: '' }] };
  const harness = createImportHarness({ clubs: [existing], accounts: [president, vice] });
  const result = await harness.importBatch([{ name: 'Existing Club', description: 'Updated description', image: image(12) }]);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.rolesAssigned, 0);
  assert.deepEqual(harness.state.accounts.map(account => account.email).sort(), [president.email, vice.email].sort());
  assert.equal(harness.state.clubs[0].category, 'Arts');
  assert.deepEqual(harness.state.accounts[0].roleAssignments.map(item => item.role), ['president']);
  assert.deepEqual(harness.state.accounts[1].roleAssignments.map(item => item.role), ['vice_president']);
});

test('known club name variants update the existing record and use the workbook name and description', async () => {
  const existing = { id: 14, name: 'Theater', category: 'Arts', description: 'Current website description', image: 'old-image', imagePublicId: 'clubs/old-image', archivedAt: null };
  const harness = createImportHarness({ clubs: [existing] });
  const result = await harness.importBatch([{ name: 'MIU Theatre', category: 'Official theatre', description: 'Description from workbook', image: image(13) }]);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.created, 0);
  assert.equal(result.body.updated, 1);
  assert.equal(harness.state.clubs.length, 1);
  assert.equal(harness.state.clubs[0].id, 14);
  assert.equal(harness.state.clubs[0].name, 'MIU Theatre');
  assert.equal(harness.state.clubs[0].description, 'Description from workbook');
  assert.equal(harness.state.clubs[0].category, 'Official theatre');
  assert.deepEqual(harness.state.imagesDeleted, []);
});

test('each configured workbook variant maps to its current website club', async () => {
  for (const [workbookName, currentName] of [['Tuners','Tunners'], ['IEEE MIU SB','IEEE'], ['MIU-MUNAL','MUN']]) {
    const harness = createImportHarness({ clubs: [{ id: 21, name: currentName, description: 'Old', imagePublicId: 'clubs/old-image', archivedAt: null }] });
    const result = await harness.importBatch([{ name: workbookName, description: `${workbookName} description`, image: image(20) }]);
    assert.equal(result.statusCode, 200, `${workbookName} should update ${currentName}`);
    assert.equal(result.body.created, 0);
    assert.equal(result.body.updated, 1);
    assert.equal(harness.state.clubs.length, 1);
    assert.equal(harness.state.clubs[0].name, workbookName);
    assert.equal(harness.state.clubs[0].description, `${workbookName} description`);
  }
});

test('undo restores an updated club record and removes the imported image', async () => {
  const existing = { id: 30, name: 'Theater', category: 'Arts', description: 'Original description', image: 'old-url', imagePublicId: 'clubs/old-image', archivedAt: null };
  const harness = createImportHarness({ clubs: [existing] });
  const imported = await harness.importBatch([{ name: 'MIU Theatre', category: 'Official theatre', description: 'Workbook description', image: image(30) }]);
  assert.equal(imported.statusCode, 200);
  assert.equal(imported.body.undoAvailable, true);
  const latest = await harness.latestUndo();
  assert.equal(latest.body.available, true);
  assert.equal(latest.body.importId, imported.body.importId);
  const undone = await harness.undoImport(imported.body.importId);
  assert.equal(undone.statusCode, 200, JSON.stringify(undone.body));
  assert.equal(harness.state.clubs.length, 1);
  assert.equal(harness.state.clubs[0].name, 'Theater');
  assert.equal(harness.state.clubs[0].description, 'Original description');
  assert.equal(harness.state.clubs[0].imagePublicId, 'clubs/old-image');
  assert.deepEqual(harness.state.imagesDeleted, [image(30).publicId]);
  const secondUndo = await harness.undoImport(imported.body.importId);
  assert.equal(secondUndo.statusCode, 409);
});

test('undo refuses to overwrite club edits made after the import', async () => {
  const existing = { id: 32, name: 'Theater', category: 'Arts', description: 'Original', imagePublicId: 'clubs/old-image', archivedAt: null };
  const harness = createImportHarness({ clubs: [existing] });
  const imported = await harness.importBatch([{ name: 'MIU Theatre', description: 'Workbook', image: image(32) }]);
  harness.state.clubs[0].description = 'Later admin change';
  const undone = await harness.undoImport(imported.body.importId);
  assert.equal(undone.statusCode, 409);
  assert.equal(harness.state.clubs[0].description, 'Later admin change');
});

test('undo removes a newly imported club when no activity was added afterward', async () => {
  const harness = createImportHarness();
  const imported = await harness.importBatch([{ name: 'Undo New Club', description: 'New club description', image: image(31) }]);
  assert.equal(imported.statusCode, 200);
  const undone = await harness.undoImport(imported.body.importId);
  assert.equal(undone.statusCode, 200, JSON.stringify(undone.body));
  assert.equal(harness.state.clubs.length, 0);
  assert.deepEqual(harness.state.imagesDeleted, [image(31).publicId]);
});

test('duplicate rows that use a known name variant are rejected before database changes', async () => {
  const harness = createImportHarness();
  const result = await harness.importBatch([
    { name: 'MIU Theatre', description: 'First description', image: image(14) },
    { name: 'Theater', description: 'Second description', image: image(15) }
  ]);
  assert.equal(result.statusCode, 400);
  assert.equal(harness.state.clubs.length, 0);
  assert.equal(harness.state.accounts.length, 0);
});

test('club import replaces the old officers, preserves their unrelated roles, and updates an existing club in place', async () => {
  const harness = createImportHarness({
    clubs: [{ id: 7, name: 'Existing Club', category: 'Old', description: 'Old description', image: 'old-image', imagePublicId: 'clubs/old-image', archivedAt: null }],
    accounts: [{ _id: 'old-president', email: 'old-president@miuegypt.edu.eg', role: 'president', clubId: 7, sessionVersion: 2,
      roleAssignments: [{ role: 'president', clubId: 7, committee: '' }, { role: 'head', clubId: 9, committee: 'Media' }] },
      { _id: 'old-vice', email: 'old-vice@miuegypt.edu.eg', role: 'vice_president', clubId: 7, sessionVersion: 0,
        roleAssignments: [{ role: 'vice_president', clubId: 7, committee: '' }] }]
  });
  const result = await harness.importBatch([row('Existing Club', 2, 'new-president@miuegypt.edu.eg', 'new-vice@miuegypt.edu.eg')]);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.created, 0);
  assert.equal(result.body.updated, 1);
  assert.equal(harness.state.clubs.length, 1);
  assert.equal(harness.state.clubs[0].id, 7);
  assert.equal(harness.state.clubs[0].description, 'Existing Club description');
  assert.equal(harness.state.accounts.some(account => account.email === 'old-vice@miuegypt.edu.eg'), false);
  const previousPresident = harness.state.accounts.find(account => account.email === 'old-president@miuegypt.edu.eg');
  assert.deepEqual(previousPresident.roleAssignments.map(item => item.role), ['head']);
  assert.equal(harness.state.accounts.some(account => account.email === 'new-president@miuegypt.edu.eg' && account.role === 'president'), true);
  assert.equal(harness.state.accounts.some(account => account.email === 'new-vice@miuegypt.edu.eg' && account.role === 'vice_president'), true);
  assert.deepEqual(harness.state.imagesDeleted, []);
});

test('club import rejects malformed manager identities before making any database changes', async () => {
  const harness = createImportHarness();
  const invalid = row('Invalid Club', 3, 'student@example.com');
  const result = await harness.importBatch([invalid]);
  assert.equal(result.statusCode, 400);
  assert.equal(harness.state.clubs.length, 0);
  assert.equal(harness.state.accounts.length, 0);
});

test('ambiguous transaction commit keeps uploaded images and tells the admin to verify before retrying', async () => {
  const harness = createImportHarness({ failCommit: true });
  const result = await harness.importBatch([row('Unconfirmed Club', 4)]);
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.commitUncertain, true);
  assert.equal(harness.state.clubs.length, 0);
  assert.equal(harness.state.accounts.length, 0);
  assert.deepEqual(harness.state.imagesDeleted, []);
});

\n