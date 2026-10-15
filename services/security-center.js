function registerSecurityCenter(app, { requireAdmin, AuditLog }) {
  app.get('/api/admin/security/audit', requireAdmin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const logs = await AuditLog.find().select('actorEmail actorRole action targetType targetId details timestamp -_id').sort({ timestamp: -1 }).limit(50).lean();
      res.json({ googleSignInConfigured: Boolean(process.env.GOOGLE_CLIENT_ID), logs });
    } catch { res.status(503).json({ message: 'Security activity is temporarily unavailable.' }); }
  });
}
module.exports = { registerSecurityCenter };
