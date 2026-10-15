const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const MAGIC = Buffer.from('MIUBAK01');
function keyBytes(value) {
  const key = Buffer.from(value || '', 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) throw new Error('A canonical base64 32-byte offsite encryption key is required.');
  return key;
}
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
async function regular(file) {
  const stat = await fsp.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('A regular backup file is required.');
  return stat;
}
async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function encryptBackup({ source, directory, key, workspace = path.resolve(__dirname, '..') }) {
  const secret = keyBytes(key);
  if (!path.isAbsolute(source) || !path.isAbsolute(directory)) throw new Error('Absolute backup paths are required.');
  const stat = await regular(source);
  const actualSource = await fsp.realpath(source), actualDirectory = await fsp.realpath(directory);
  if (inside(await fsp.realpath(workspace), actualDirectory) || inside(path.dirname(actualSource), actualDirectory)) throw new Error('Offsite destination must be outside the workspace and local backup directory.');
  const marker = JSON.parse(await fsp.readFile(source + '.verified.json', 'utf8'));
  if (marker.file !== path.basename(source) || marker.bytes !== stat.size || marker.checksumVerified !== true || !Number.isFinite(Date.parse(marker.verifiedAt))) throw new Error('Only verified native backups can be exported.');
  const file = path.basename(source) + '.enc', destination = path.join(actualDirectory, file);
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
  const header = Buffer.concat([MAGIC, iv]); cipher.setAAD(header);
  const sourceHash = crypto.createHash('sha256');
  const tap = new Transform({ transform(chunk, encoding, callback) { sourceHash.update(chunk); callback(null, chunk); } });
  let created = false, manifestCreated = false, handle;
  try {
    handle = await fsp.open(destination, 'wx', 0o600); created = true;
    await handle.write(header);
    const output = fs.createWriteStream(destination, { fd: handle.fd, autoClose: false, start: header.length });
    await pipeline(fs.createReadStream(actualSource), tap, cipher, output);
    await handle.write(cipher.getAuthTag(), 0, 16, header.length + stat.size);
    await handle.sync(); await handle.close(); handle = null;
    const evidence = { version: 1, algorithm: 'AES-256-GCM', file, database: marker.database, bytes: stat.size, sourceSha256: sourceHash.digest('hex'), encryptedSha256: await digest(destination), exportedAt: new Date().toISOString() };
    await fsp.writeFile(destination + '.json', JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); manifestCreated = true;
    return evidence;
  } catch (error) {
    await handle?.close().catch(() => {});
    if (created) await fsp.unlink(destination).catch(() => {});
    if (manifestCreated) await fsp.unlink(destination + '.json').catch(() => {});
    throw error;
  }
}
async function decryptBackup({ source, destination, key }) {
  const secret = keyBytes(key), stat = await regular(source);
  if (!path.isAbsolute(destination) || stat.size < 36) throw new Error('Invalid encrypted backup or restore destination.');
  const input = await fsp.open(source, 'r');
  let created = false;
  try {
    const header = Buffer.alloc(20), tag = Buffer.alloc(16);
    await input.read(header, 0, 20, 0); await input.read(tag, 0, 16, stat.size - 16);
    if (!header.subarray(0, 8).equals(MAGIC)) throw new Error('Unsupported backup format.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', secret, header.subarray(8));
    decipher.setAAD(header); decipher.setAuthTag(tag);
    const handle = await fsp.open(destination, 'wx', 0o600); created = true;
    try { await pipeline(fs.createReadStream(source, { start: 20, end: stat.size - 17 }), decipher, handle.createWriteStream()); }
    finally { await handle.close().catch(() => {}); }
    return { restored: true, bytes: stat.size - 36 };
  } catch (error) {
    if (created) await fsp.unlink(destination).catch(() => {});
    throw error;
  } finally { await input.close(); }
}
function offsiteConfiguration(env = process.env) {
  const directory = env.SQL_BACKUP_OFFSITE_DIRECTORY, key = env.SQL_BACKUP_OFFSITE_KEY;
  if (!directory && !key) return null;
  if (!directory || !key) throw new Error('Configure both offsite directory and encryption key.');
  keyBytes(key);
  return { directory, key };
}
module.exports = { encryptBackup, decryptBackup, offsiteConfiguration };
