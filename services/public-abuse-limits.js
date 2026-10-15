const crypto = require('node:crypto');
function publicAbuseLimits({ model, ready, ip, secret }) {
  return async (req, res, next) => {
    if (req.method !== 'POST') return next();
    const path = req.originalUrl.split('?')[0];
    let policy;
    if (path === '/api/ask-ai' || path === '/api/ask-ai/') policy = { scope: 'ai', max: 20, window: 60000 };
    else if (path === '/api/uploads/cloudinary-signature') policy = { scope: 'media-upload', max: 100, window: 10 * 60000 };
    else if (path === '/api/applications') policy = { scope: 'application-submit', max: 100, window: 15 * 60000 };
    else if (/^\/api\/(?:speaker-requests(?:\/cv-upload)?|public\/speaker-invites\/[^/]+\/submit)$/.test(path)) policy = { scope: 'speaker-submit', max: 30, window: 15 * 60000 };
    if (!policy) return next();
    try {
      if (!ready()) throw new Error('DATABASE_UNAVAILABLE');
      const now = Date.now();
      const sourceHash = crypto.createHmac('sha256', secret()).update(`public-abuse-v1|${policy.scope}|${ip(req) || 'unknown'}`).digest('hex');
      const reset = { $or: [{ $eq: [{ $ifNull: ['$windowStart', null] }, null] }, { $lte: ['$windowStart', new Date(now - policy.window)] }] };
      const update = [{ $set: { sourceHash, windowStart: { $cond: [reset, new Date(now), '$windowStart'] }, count: { $cond: [reset, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] }, expiresAt: new Date(now + policy.window) } }];
      let entry;
      try { entry = await model.findOneAndUpdate({ sourceHash }, update, { upsert: true, new: true }).lean(); }
      catch (error) { if (error.code !== 11000) throw error; entry = await model.findOneAndUpdate({ sourceHash }, update, { new: true }).lean(); }
      if (entry.count > policy.max) {
        const retry = Math.max(1, Math.ceil((new Date(entry.windowStart).getTime() + policy.window - now) / 1000));
        return res.set('Retry-After', String(retry)).status(429).json({ message: 'Too many requests. Please wait and try again.', retryAfterSeconds: retry });
      }
      next();
    } catch { res.status(503).json({ message: 'Request protection is temporarily unavailable. Please try again shortly.' }); }
  };
}
module.exports = { publicAbuseLimits };
