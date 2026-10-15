const net = require('node:net');
const production = env => env.NODE_ENV === 'production' || Boolean(env.VERCEL);
function secureCookie(req, env = process.env) { return req.secure || production(env) ? ' Secure;' : ''; }
function trustedClientIp(req, env = process.env) {
  const forwarded = env.VERCEL ? String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  const address = forwarded || req.ip || req.socket?.remoteAddress || '';
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  return net.isIP(normalized) ? normalized : '';
}
function sameOrigin(req, env = process.env) {
  const value = req.get('origin');
  if (!value || value === 'null') return false;
  try {
    const origin = new URL(value);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) return false;
    const expectedProtocol = req.secure || production(env) ? 'https:' : 'http:';
    return origin.host.toLowerCase() === String(req.get('host') || '').toLowerCase() && origin.protocol === expectedProtocol;
  } catch { return false; }
}
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  // Existing inline handlers remain compatible. Restrictive script policy is
  // reported first, while framing, plugins and base-URL injection are blocked.
  res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  res.setHeader('Content-Security-Policy-Report-Only', "default-src 'self'; script-src 'self' https://accounts.google.com https://cdn.onesignal.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' blob: https://res.cloudinary.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://api.cloudinary.com https://res.cloudinary.com https://*.onesignal.com; frame-src https://accounts.google.com https://*.onesignal.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if (production(process.env)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
}
function protectMutations(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!sameOrigin(req) || req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ message: 'This request could not be verified. Reload the website and try again.' });
  next();
}
function sameOriginCors(req, callback) {
  callback(null, { origin: req.get('origin') && sameOrigin(req) ? req.get('origin') : false, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type'], maxAge: 600 });
}
module.exports = { production, secureCookie, trustedClientIp, sameOrigin, securityHeaders, protectMutations, sameOriginCors };
