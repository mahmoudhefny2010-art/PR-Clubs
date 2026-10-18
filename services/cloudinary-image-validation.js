const crypto = require('node:crypto');

function publicIdFromCloudinaryUrl(value, cloudName) {
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com'
    || parsed.port || parsed.search || parsed.hash || !cloudName) return null;
  const prefix = `/${cloudName}/image/upload/`;
  if (!parsed.pathname.startsWith(prefix)) return null;
  const parts = parsed.pathname.slice(prefix.length).split('/');
  if (/^v\d+$/.test(parts[0] || '')) parts.shift();
  if (!parts.length) return null;
  let assetPath;
  try { assetPath = parts.map(decodeURIComponent).join('/'); } catch { return null; }
  const lastSlash = assetPath.lastIndexOf('/');
  const fileName = assetPath.slice(lastSlash + 1).replace(/\.(?:png|jpe?g|webp)$/i, '');
  return `${assetPath.slice(0, lastSlash + 1)}${fileName}`;
}

function getImageFormat(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function verifyCloudinaryUploadResponse(url, publicId, version, signature, expectedFolder, cloudName, apiSecret, cloudinaryUtils) {
  if (typeof publicId !== 'string' || typeof version !== 'string' && typeof version !== 'number'
    || !/^\d+$/.test(String(version)) || typeof signature !== 'string' || !/^[a-f\d]{40,64}$/i.test(signature)) return false;
  const parts = publicId.split('/');
  const leafId = parts.at(-1);
  if (!leafId?.startsWith(`${expectedFolder}-`)
    || !new RegExp(`^${expectedFolder}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, 'i').test(leafId)
    || parts.length > 2 || (parts.length === 2 && parts[0] !== expectedFolder)
    || publicIdFromCloudinaryUrl(url, cloudName) !== publicId) return false;
  try {
    // Cloudinary signs its upload response using public_id and version with
    // signature version 1. This proves the asset was actually accepted by
    // Cloudinary without requiring the server's Admin API to be reachable.
    const expected = cloudinaryUtils.api_sign_request({ public_id: publicId, version: String(version) }, apiSecret, null, 1);
    const suppliedBytes = Buffer.from(signature.toLowerCase(), 'hex');
    const expectedBytes = Buffer.from(expected, 'hex');
    return suppliedBytes.length === expectedBytes.length && crypto.timingSafeEqual(suppliedBytes, expectedBytes);
  } catch {
    return false;
  }
}

async function verifyPublicCloudinaryImage(url, publicId, cloudName, maxBytes, fetchImpl = fetch) {
  const assetPath = publicIdFromCloudinaryUrl(url, cloudName);
  if (!assetPath || assetPath !== publicId) return { valid: false, reason: 'invalid-reference' };

  let response;
  try {
    response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  } catch {
    return { valid: false, reason: 'resource-unavailable' };
  }
  if (!response.ok) return { valid: false, reason: 'resource-unavailable' };
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => {});
    return { valid: false, reason: 'file-too-large' };
  }

  const chunks = [];
  let total = 0;
  if (!response.body) return { valid: false, reason: 'invalid-image' };
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { valid: false, reason: 'file-too-large' };
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  const format = getImageFormat(Buffer.concat(chunks, total));
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const expectedType = format === 'jpeg' ? ['image/jpeg', 'image/jpg'] : format ? [`image/${format}`] : [];
  if (!total || !format || !expectedType.includes(contentType)) return { valid: false, reason: 'invalid-image' };
  return { valid: true, format, bytes: total };
}

module.exports = { publicIdFromCloudinaryUrl, getImageFormat, verifyPublicCloudinaryImage, verifyCloudinaryUploadResponse };
