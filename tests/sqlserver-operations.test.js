const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ttlTargets, verifiedBackups, backupName } = require('../scripts/sqlserver-operations.cjs');

test('SQL cleanup selects only reviewed zero-second expiresAt TTL models', () => {
  const targets = ttlTargets().map(t => t.name).sort();
  assert.deepEqual(targets, ['LoginAttempt', 'PasswordRecoveryRateLimit', 'PasswordResetToken', 'SpeakerCvUpload', 'StudentEmailCode', 'SiteVisitorPresence'].sort());
  const spec = { name: 'Bad', columns: [{ name: 'expiresAt', path: { instance: 'Date' } }], indexes: [{ keys: { other: 1 }, options: { expireAfterSeconds: 0 } }] };
  assert.throws(() => ttlTargets([spec]), /Unreviewed TTL/);
});
test('backup discovery excludes malformed, missing and size-mismatched backup evidence', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sql-backup-test-'));
  try {
    const file = backupName('clubs');
    await fs.writeFile(path.join(directory, file), 'verified-backup');
    const entry = { database: 'clubs', file, bytes: 15, checksumVerified: true, verifiedAt: new Date().toISOString() };
    await fs.writeFile(path.join(directory, file + '.verified.json'), JSON.stringify(entry));
    assert.equal((await verifiedBackups(directory, 'clubs')).length, 1);
    await fs.appendFile(path.join(directory, file), 'tampered');
    assert.equal((await verifiedBackups(directory, 'clubs')).length, 0);
    assert.throws(() => backupName('../clubs'), /Unsupported/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
