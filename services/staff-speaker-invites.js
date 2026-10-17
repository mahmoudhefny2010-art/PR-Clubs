const { assignedIds } = require('./supervisor-dashboard');
const MIU_HOST = Object.freeze({ id: 0, name: 'MIU' });
function staffSpeakerHostAllowed(account, clubId) {
  return Number.isSafeInteger(clubId) && clubId >= 0
    && (account?.role === 'dean' || account?.role === 'supervisor'
      && (clubId === 0 || assignedIds(account).includes(clubId)));
}
function registerStaffSpeakerInvites(app, deps) {
  const { requireClubAuth, requireLiveDatabase, isSameOriginRequest, Club,
    getOrCreateStableSpeakerInvite, speakerInviteResponse } = deps;
  for (const role of ['dean', 'supervisor']) {
    app.get(`/api/${role}/speaker-invites/clubs`, requireClubAuth, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (req.clubAccount?.role !== role) return res.status(403).json({ message: 'This dashboard role cannot create these speaker links.' });
      if (!requireLiveDatabase(res)) return;
      try {
        const filter = { archivedAt: null };
        if (role === 'supervisor') filter.id = { $in: assignedIds(req.clubAccount) };
        const clubs = await Club.find(filter).select('id name').sort({ name: 1 }).lean();
        res.json([MIU_HOST, ...clubs.map(({ id, name }) => ({ id, name }))]);
      } catch { res.status(503).json({ message: 'Could not load hosting organizations.' }); }
    });
    app.post(`/api/${role}/speaker-invites`, requireClubAuth, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (req.clubAccount?.role !== role) return res.status(403).json({ message: 'This dashboard role cannot create these speaker links.' });
      if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'Reload the page and try again.' });
      const rawId = req.body?.clubId;
      const clubId = Number(rawId);
      if (rawId === undefined || rawId === null || rawId === '' || typeof rawId === 'boolean'
        || !Number.isSafeInteger(clubId) || clubId < 0) return res.status(400).json({ message: 'Choose MIU or a hosting club.' });
      if (!staffSpeakerHostAllowed(req.clubAccount, clubId)) return res.status(403).json({ message: 'You can create links only for MIU or your assigned clubs.' });
      if (!requireLiveDatabase(res)) return;
      try {
        const club = clubId === 0 ? MIU_HOST : await Club.findOne({ id: clubId, archivedAt: null }).select('id name').lean();
        if (!club) return res.status(404).json({ message: 'The hosting club is not available.' });
        const result = await getOrCreateStableSpeakerInvite(club, req.clubAccount, req.body?.rotate === true);
        res.status(result.reused ? 200 : 201).json(speakerInviteResponse(result.invite, result.token, result.reused));
      } catch { res.status(503).json({ message: 'Could not create a speaker invitation link.' }); }
    });
  }
}
module.exports = { MIU_HOST, staffSpeakerHostAllowed, registerStaffSpeakerInvites };
