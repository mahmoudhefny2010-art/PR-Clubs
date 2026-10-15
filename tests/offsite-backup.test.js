const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { encryptBackup, decryptBackup, offsiteConfiguration } = require('../services/offsite-backup');
test('verified backup encryption roundtrip, tampering, duplicate and destination protection', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'miu-offsite-'));
  try {
    const workspace = path.join(root, 'workspace'), local = path.join(root, 'local'), directory = path.join(root, 'remote');
    await Promise.all([workspace, local, directory].map(p => fs.mkdir(p)));
    const source = path.join(local, 'clubs_auto_test.bak'), payload = crypto.randomBytes(128 * 1024), key = crypto.randomBytes(32).toString('base64');
    await fs.writeFile(source, payload);
    await assert.rejects(encryptBackup({ source, directory, key, workspace }), /ENOENT/);
    await fs.writeFile(source + '.verified.json', JSON.stringify({ file: path.basename(source), database: 'clubs', bytes: payload.length, checksumVerified: true, verifiedAt: new Date().toISOString() }));
    await assert.rejects(encryptBackup({ source, directory: workspace, key, workspace }), /outside/);
    const evidence = await encryptBackup({ source, directory, key, workspace });
    assert.equal(evidence.sourceSha256, crypto.createHash('sha256').update(payload).digest('hex'));
    const encrypted = path.join(directory, evidence.file), restored = path.join(root, 'restored.bak');
    await assert.rejects(encryptBackup({ source, directory, key, workspace }), /EEXIST/);
    assert.ok((await fs.stat(encrypted)).size > payload.length);
    await decryptBackup({ source: encrypted, destination: restored, key });
    assert.deepEqual(await fs.readFile(restored), payload);
    await assert.rejects(decryptBackup({ source: encrypted, destination: restored, key }), /EEXIST/);
    assert.deepEqual(await fs.readFile(restored), payload);
    const badDestination = path.join(root, 'wrong-key.bak');
    await assert.rejects(decryptBackup({ source: encrypted, destination: badDestination, key: crypto.randomBytes(32).toString('base64') }));
    await assert.rejects(fs.stat(badDestination), /ENOENT/);
    const changed = await fs.readFile(encrypted); changed[50] ^= 1; await fs.writeFile(encrypted, changed);
    await assert.rejects(decryptBackup({ source: encrypted, destination: badDestination, key }));
    await assert.rejects(fs.stat(badDestination), /ENOENT/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('offsite configuration stays disabled until a complete valid configuration exists', () => {
  assert.equal(offsiteConfiguration({}), null);
  assert.throws(() => offsiteConfiguration({ SQL_BACKUP_OFFSITE_DIRECTORY: 'D:/remote' }), /both/);
  assert.throws(() => offsiteConfiguration({ SQL_BACKUP_OFFSITE_DIRECTORY: 'D:/remote', SQL_BACKUP_OFFSITE_KEY: 'short' }), /32-byte/);
});
