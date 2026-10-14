const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { BSON } = require('mongoose').mongo;
const { canonical } = require('../scripts/sqlserver-migrate.cjs');
const { encryptBackup, decryptBackup, isolatedRestoreUri, restoreIndex } = require('../scripts/sqlserver-transfer-local.cjs');

test('migration backup round trips BSON types and detects tampering and wrong keys', () => {
  const key = crypto.randomBytes(32);
  const source = { createdAt: new Date(), documents: [{ _id: new BSON.ObjectId(), name: 'جامعة', id: '00012' }] };
  const envelope = encryptBackup(source, key);
  assert.equal(canonical(decryptBackup(envelope, key)), canonical(source));
  assert.throws(() => decryptBackup(envelope, crypto.randomBytes(32)));
  assert.throws(() => decryptBackup({ ...envelope, tag: Buffer.alloc(16).toString('base64') }, key));
});
test('restore URI changes only the isolated database and preserves the original authentication scope', () => {
  const uri = 'mongodb+srv://test-user:test-pass@example.test/clubs_dashboard?retryWrites=true';
  const restored = new URL(isolatedRestoreUri(uri, 'clubs_restore_test_123', 'admin'));
  assert.equal(restored.pathname, '/clubs_restore_test_123');
  assert.equal(restored.searchParams.get('authSource'), 'admin');
  assert.equal(restored.searchParams.get('retryWrites'), 'true');
  assert.equal(restored.username, 'test-user');
  assert.throws(() => isolatedRestoreUri(uri, 'clubs_dashboard', 'admin'));
  const seeds = isolatedRestoreUri('mongodb://test-user:test-pass@one.test:27017,two.test:27017/clubs_dashboard?replicaSet=test', 'clubs_restore_test_456', 'admin');
  assert.ok(seeds.includes('one.test:27017,two.test:27017/'));
  assert.ok(seeds.includes('clubs_restore_test_456'));
  assert.ok(seeds.includes('authSource=admin'));
});
test('isolated restore retains uniqueness but disables TTL expiration without changing the original index metadata', () => {
  const ttl = { name: 'expiresAt_1', key: { expiresAt: 1 }, expireAfterSeconds: 0 };
  assert.equal(restoreIndex(ttl), null);
  assert.equal(ttl.expireAfterSeconds, 0);
  const index = { name: 'email_1', key: { email: 1 }, unique: true, sparse: true, v: 2 };
  assert.deepEqual(restoreIndex(index), { key: { email: 1 }, name: 'email_1', unique: true, sparse: true });
});
