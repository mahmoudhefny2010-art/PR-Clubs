function registerSecurityCenter(app, { requireAdmin, AuditLog }) {
  app.get('/api/admin/security/audit', requireAdmin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.query.actorRole && req.query.actorRole !== 'software_development') return res.status(400).json({ message: 'Unsupported activity filter.' });
    const limit = req.query.limit === undefined ? null : Number(req.query.limit);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100)) return res.status(400).json({ message: 'Choose a valid activity page size.' });
    try {
      const filter = { action: { $ne: 'club_import_undo_state' },
        ...(req.query.actorRole === 'software_development' ? { actorRole: 'software_development' } : {}) };
      let query = AuditLog.find(filter).select('actorEmail actorRole action targetType targetId details timestamp -_id').sort({ timestamp: -1 });
      if (limit !== null) query = query.limit(limit);
      const logs = await query.lean();
      res.json({ googleSignInConfigured: Boolean(process.env.GOOGLE_CLIENT_ID), logs });
    } catch { res.status(503).json({ message: 'Security activity is temporarily unavailable.' }); }
  });
}
module.exports = { registerSecurityCenter };
