const net = require('node:net');

function getVisitorIpAddress(req) {
  const forwarded = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || '')
    .split(',')[0].trim();
  const address = forwarded || req.ip || req.socket?.remoteAddress || '';
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  return net.isIP(normalized) ? normalized : '';
}

module.exports = { getVisitorIpAddress };
