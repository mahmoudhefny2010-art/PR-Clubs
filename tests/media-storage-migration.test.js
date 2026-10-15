const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const migration = require('../services/media-storage-migration');
const { update, get } = require('../database/values');
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0rcAAAAASUVORK5CYII=', 'base64');
test('uploads verify the owned destination, resource metadata and actual delivered bytes before any database change', async t => {
  const crypto = require('node:crypto');
  const sha256 = crypto.createHash('sha256').update(pixel).digest('hex');
  const asset = { folder: 'miu-clubs', resourceType: 'image', mime: 'image/png', bytes: pixel, sha256 };
  const url = 'https://res.cloudinary.com/ours/image/upload/miu-clubs/test.png';
  let wrongMetadata = false, wrongDelivery = false;
  const cloudinary = {
    uploader: { async upload(source, options) {
      assert.equal(source, 'data:image/png;base64,' + pixel.toString('base64'));
      assert.equal(options.overwrite, false); assert.equal(options.folder, 'miu-clubs');
      return { secure_url: url, public_id: 'miu-clubs/test', resource_type: 'image' };
    } },
    api: { async resource(id, options) {
      assert.equal(id, 'miu-clubs/test'); assert.equal(options.resource_type, 'image');
      return { bytes: wrongMetadata ? 1 : pixel.length, secure_url: url };
    } }
  };
  t.mock.method(globalThis, 'fetch', async destination => {
    assert.equal(destination, url);
    return new Response(wrongDelivery ? Buffer.from('changed') : pixel);
  });
  assert.equal((await migration.uploadAsset(cloudinary, asset, 'ours')).sha256, sha256);
  wrongMetadata = true;
  await assert.rejects(migration.uploadAsset(cloudinary, asset, 'ours'), { code: 'CLOUDINARY_RESOURCE_MISMATCH' });
  wrongMetadata = false; wrongDelivery = true;
  await assert.rejects(migration.uploadAsset(cloudinary, asset, 'ours'), { code: 'CLOUDINARY_CHECKSUM_MISMATCH' });
  await assert.rejects(migration.uploadAsset(cloudinary, asset, 'different-account'), { code: 'CLOUDINARY_UPLOAD_MISMATCH' });
});
function sourceModels(records) {
  return Object.fromEntries(Object.keys(migration.modelFields).map(name => [name, { find() { return { select() { return { lean: async () => records[name] || [] }; } }; } }]));
}
test('migration plans preserve existing Cloudinary media, deduplicate bytes per folder and skip private document attachments', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'miu-media-plan-'));
  try {
    await fs.mkdir(path.join(root, 'assets')); await fs.writeFile(path.join(root, 'assets', 'logo.png'), pixel);
    const inline = 'data:image/png;base64,' + pixel.toString('base64');
    const models = sourceModels({
      Club: [{ _id: 'club', image: '/assets/logo.png', imagePublicId: '', events: [{ image: inline, sponsorAttachment: 'data:application/pdf;base64,JVBERi0=' }], posts: [{ image: inline }] }],
      Application: [{ _id: 'app', photo: inline, photoPublicId: '' }],
      AccountPhoto: [{ _id: 'photo', url: 'https://res.cloudinary.com/ours/image/upload/photo.png' }]
    });
    const plan = await migration.makePlan(models, { cloudName: 'ours', publicRoot: root });
    assert.deepEqual(plan.errors, []); assert.equal(plan.references.length, 4); assert.equal(plan.assets.length, 3);
    assert.equal(plan.existingCloudReferences, 1);
    assert.deepEqual(plan.assets.map(a => a.folder).sort(), ['miu-applicants', 'miu-clubs', 'miu-feed-media']);
    const uploads = Object.fromEntries(plan.assets.map(a => [a.key, { url: 'https://res.cloudinary.com/ours/image/upload/' + a.folder + '/new.png', publicId: a.folder + '/new' }]));
    const changes = migration.changesFor(plan, uploads);
    assert.equal(changes.length, 2);
    assert.ok(changes[0].fields.some(f => f.path === 'imagePublicId'));
    assert.ok(!changes[0].fields.some(f => f.path.includes('sponsorAttachment')));
    const publicOnly = migration.publicPlan(plan);
    assert.equal(publicOnly.references.length, 3);
    assert.equal(publicOnly.assets.length, 2);
    assert.equal(migration.summarize(publicOnly).privateReferences, 0);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('migration rejects traversal, remote fetches, invalid media and MIME spoofing without fetching outside the asset directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'miu-media-path-'));
  try {
    await fs.mkdir(path.join(root, 'assets')); await fs.writeFile(path.join(root, 'outside.png'), pixel);
    await assert.rejects(migration.loadSource('/assets/../outside.png', root), { code: 'INVALID_LOCAL_MEDIA_PATH' });
    await assert.rejects(migration.loadSource('/assets/%2e%2e/outside.png', root), { code: 'INVALID_LOCAL_MEDIA_PATH' });
    await assert.rejects(migration.loadSource('https://outside.test/file.png', root), { code: 'UNSUPPORTED_MEDIA_SOURCE' });
    await assert.rejects(migration.loadSource('data:image/png;base64,PGh0bWw+', root), { code: 'UNSUPPORTED_MEDIA_SIGNATURE' });
    await assert.rejects(migration.loadSource('data:image/png;base64,bad!', root), { code: 'INVALID_INLINE_MEDIA' });
    const video = Buffer.concat([Buffer.from([0,0,0,24]), Buffer.from('ftypmp42'), Buffer.alloc(12)]);
    assert.equal((await migration.loadSource('data:video/mp4;base64,' + video.toString('base64'), root)).resourceType, 'video');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('apply and rollback explicitly use one session, preserve unrelated data and refuse concurrent media edits', async () => {
  const session = { marker: 'one-transaction' };
  let record = { _id: 'club', name: 'Preserved', image: '/assets/old.png', events: [{ title: 'Unchanged', image: '/assets/event.png' }] };
  const model = {
    findById(id) { assert.equal(id, 'club'); return { session(value) { assert.equal(value, session); return { lean: async () => structuredClone(record) }; } }; },
    async updateOne(filter, operation, options) { assert.equal(options.session, session); assert.equal(options.timestamps, false); record = update(record, operation); return { matchedCount: 1 }; }
  };
  const changes = [{ model: 'Club', id: 'club', fields: [{ path: 'image', before: record.image, after: 'https://res.cloudinary.com/ours/image/upload/club.png' }, { path: 'imagePublicId', before: null, absentBefore: true, after: 'miu-clubs/new' }, { path: 'events.0.image', before: record.events[0].image, after: 'https://res.cloudinary.com/ours/image/upload/event.png' }] }];
  await migration.applyChanges({ Club: model }, changes, session);
  assert.equal(record.name, 'Preserved'); assert.equal(record.events[0].title, 'Unchanged'); assert.equal(record.imagePublicId, 'miu-clubs/new');
  await migration.applyChanges({ Club: model }, changes, session, { rollback: true });
  assert.equal(record.image, '/assets/old.png'); assert.equal(record.events[0].image, '/assets/event.png'); assert.equal(get(record, 'imagePublicId'), undefined);
  record.image = '/assets/changed-by-owner.png';
  await assert.rejects(migration.applyChanges({ Club: model }, changes, session), { code: 'MEDIA_CHANGED_SINCE_PLAN' });
  assert.equal(record.image, '/assets/changed-by-owner.png');
});
test('native backup precondition rejects absent, stale and size-mismatched evidence', async () => {
  const { verifyBackup } = require('../scripts/migrate-cloudinary-media.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'miu-media-backup-'));
  try {
    const file = path.join(root, 'clubs_auto_test.bak'); await fs.writeFile(file, 'backup');
    const marker = { database: 'clubs', file: path.basename(file), bytes: 6, checksumVerified: true, verifiedAt: new Date().toISOString() };
    await assert.rejects(verifyBackup(file, 'clubs'));
    await fs.writeFile(file + '.verified.json', JSON.stringify(marker));
    assert.equal((await verifyBackup(file, 'clubs')).database, 'clubs');
    await fs.writeFile(file + '.verified.json', JSON.stringify({ ...marker, bytes: 7 })); await assert.rejects(verifyBackup(file, 'clubs'));
    await fs.writeFile(file + '.verified.json', JSON.stringify({ ...marker, verifiedAt: '2020-01-01' })); await assert.rejects(verifyBackup(file, 'clubs'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
