const crypto = require('crypto');

function keyFor(secret) {
  return crypto.createHash('sha256').update(`clubs-import-undo:${String(secret || '')}`).digest();
}

function seal(payload, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

function open(value, secret) {
  const [iv, tag, ciphertext] = String(value || '').split('.').map(part => Buffer.from(part, 'base64url'));
  if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !ciphertext?.length) throw new Error('Invalid undo record.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(secret), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
}

function fingerprint(value) {
  const canonical = item => {
    if (item instanceof Date) return { $date: item.toISOString() };
    if (item && typeof item === 'object' && item._bsontype === 'ObjectId') return { $oid: item.toString() };
    if (Buffer.isBuffer(item)) return { $buffer: item.toString('base64') };
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])]));
    return item;
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

module.exports = { seal, open, fingerprint };
