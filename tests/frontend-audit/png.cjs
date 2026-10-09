const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

function decode(png) {
  let offset = 8, width, height, channels;
  const chunks = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.equal(data[8], 8); assert.equal(data[12], 0);
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      assert.ok(channels, 'Expected RGB/RGBA screenshot.');
    } else if (type === 'IDAT') chunks.push(data);
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const result = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); return x <= y && x <= z ? a : y <= z ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const a = x >= channels ? result[i - channels] : 0;
      const b = y ? result[i - stride] : 0;
      const c = y && x >= channels ? result[i - stride - channels] : 0;
      const value = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c);
      result[i] = (raw[y * (stride + 1) + 1 + x] + value) & 255;
    }
  }
  return { width, height, channels, data: result };
}

function fingerprint(png) {
  const { width, height, data } = decode(png);
  return { width, height, hash: crypto.createHash('sha256').update(data).digest('hex') };
}

function compare(before, after) {
  const a = decode(before), b = decode(after);
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) return { pass: false, reason: 'Image dimensions/format changed' };
  let changedPixels = 0, maximumChannelDelta = 0;
  for (let i = 0; i < a.data.length; i += a.channels) {
    let changed = false;
    for (let c = 0; c < a.channels; c++) {
      const delta = Math.abs(a.data[i + c] - b.data[i + c]);
      if (delta) changed = true;
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
    }
    if (changed) changedPixels++;
  }
  const changedRatio = changedPixels / (a.width * a.height);
  // Allow only tiny Chrome edge/native-tooltip rasterization noise. Geometry,
  // computed styles, text, input state, API calls, and exceptions remain exact.
  return { pass: maximumChannelDelta <= 2 && changedRatio <= 0.005, changedPixels, changedRatio, maximumChannelDelta };
}
module.exports = { fingerprint, compare };
