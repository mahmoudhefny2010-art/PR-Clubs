const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const formats = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']);
function validSponsorAttachment(source) {
  if (source === '' || source === undefined || source === null) return true;
  if (typeof source !== 'string' || source.length > MAX_ATTACHMENT_BYTES * 4 / 3 + 200) return false;
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
  if (!match || !formats.has(match[1]) || match[2].length % 4) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES || bytes.toString('base64') !== match[2]) return false;
  if (match[1] === 'application/pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (match[1].includes('openxmlformats')) return bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  return bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}
module.exports = { validSponsorAttachment, MAX_ATTACHMENT_BYTES };
