const crypto = require('node:crypto');
const sensitiveField = /password|token|secret|cookie|credential|email|phone|address|cv|file|attachment|answer|comment|note|bio|student|member|image|photo|upload|google|identity/i;
const valueFields = new Set(['clubId', 'committee', 'role', 'status', 'title', 'subtitle', 'category', 'tagline', 'description', 'requirements', 'applicationIntro', 'date', 'time', 'location', 'venue', 'seats', 'capacity', 'enabled', 'open', 'archived', 'registrationEnabled', 'attendanceEnabled', 'imageFit', 'sortOrder', 'type', 'position', 'required', 'active', 'clubName']);
function summarizeChanges(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.entries(body).filter(([field]) => !sensitiveField.test(field)).slice(0, 40).map(([field, value]) => {
    const change = { field: String(field).slice(0, 80) };
    if (!valueFields.has(field)) return change;
    if (typeof value === 'string') change.value = value.slice(0, 240);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) change.value = value;
    return change;
  });
}
function auditMiddleware({ model, ready, ip, adminEmail, onError = error => console.error('Security audit write failed:', error.code || error.name) }) {
  return (req, res, next) => {
    const path = req.originalUrl.split('?')[0];
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !/^\/api\/(?:admin|club|applications|committee|dean|supervisor|miu-events|speaker-requests|password-reset|auth|student-auth)(?:\/|-|$)/.test(path)) return next();
    const end = res.end;
    let finishing = false;
    res.end = function (...args) {
      if (finishing) return res;
      finishing = true;
      res.end = end;
      const actor = req.securityActor || req.clubAccount || req.studentAccount;
      const role = actor?.role || (actor ? 'student' : 'anonymous');
      const email = actor?.email || (role === 'admin' ? adminEmail() : '') || 'anonymous';
      const route = typeof req.route?.path === 'string' ? req.route.path : path.replace(/[a-f0-9]{24,}|[A-Za-z0-9_-]{32,}/g, ':token');
      const id = String(req.params?.id || req.params?.clubId || '');
      const entry = {
        actorEmail: String(email).slice(0, 254), actorRole: String(role).slice(0, 40),
        action: `${req.method} ${route}`.slice(0, 240), targetType: path.split('/')[2].slice(0, 60),
        targetId: /^(?:\d{1,16}|[a-f0-9]{24})$/.test(id) ? id : '', targetName: '',
        details: JSON.stringify({ status: res.statusCode, outcome: res.statusCode < 400 ? 'success' : 'denied-or-failed', changes: summarizeChanges(req.body) }),
        ip: ip(req), timestamp: new Date()
      };
      // Finish only after the write settles, so serverless execution cannot
      // freeze an unawaited post-response audit operation. Never record bodies.
      const write = async () => {
        if (!ready()) throw Object.assign(new Error('Audit database unavailable'), { code: 'AUDIT_UNAVAILABLE' });
        for (let attempt = 0; attempt < 3; attempt++) {
          try { await model.create({ ...entry, id: crypto.randomBytes(6).readUIntBE(0, 6) }); return; }
          catch (error) { if (error.code !== 11000 || attempt === 2) throw error; }
        }
      };
      write().catch(onError).finally(() => end.apply(res, args));
      return res;
    };
    next();
  };
}
module.exports = { auditMiddleware, summarizeChanges };
