function speakerManagerIdentity(account) {
  if (!account || !['president', 'head'].includes(account.role)
    || !Number.isSafeInteger(Number(account.clubId)) || Number(account.clubId) <= 0
    || !account.email || account.role === 'head' && !String(account.committee || '').trim()) return null;
  return {
    type: 'club', id: `club:${Number(account.clubId)}:${String(account.email).toLowerCase()}`,
    email: account.email, name: account.name || (account.role === 'head' ? `${account.committee} head` : 'Club representative'),
    role: account.role, clubId: Number(account.clubId)
  };
}
function createSpeakerManagerGuard({ getClubAccountFromRequest, getStudentAccountFromRequest, Club, requireLiveDatabase, deny }) {
  const reject = deny || ((_req, res, status, message) => res.status(status).json({ message }));
  return async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const account = await getClubAccountFromRequest(req);
      const identity = speakerManagerIdentity(account);
      if (!identity) {
        const authenticated = account || await getStudentAccountFromRequest(req, res);
        return reject(req, res, authenticated ? 403 : 401, 'Speaker requests are available only to authorized club presidents and committee heads in the Club Dashboard.');
      }
      const body = req.body || {}, query = req.query || {};
      if (query.as !== undefined && query.as !== 'club'
        || body.requesterType !== undefined && body.requesterType !== 'club'
        || body.hostingType !== undefined && body.hostingType !== 'club'
        || [body.clubId, query.clubId].some(id => id !== undefined && Number(id) !== identity.clubId)) {
        return reject(req, res, 403, 'You can submit speaker requests only for your assigned club.');
      }
      if (!requireLiveDatabase(res)) return;
      const club = await Club.findOne({ id: identity.clubId, archivedAt: null }).select('id name').lean();
      if (!club) return reject(req, res, 403, 'Speaker requests are not available for this club.');
      req.speakerRequester = identity;
      req.speakerClub = club;
      return next();
    } catch {
      return reject(req, res, 503, 'Speaker request access could not be verified. Please try again.');
    }
  };
}
module.exports = { speakerManagerIdentity, createSpeakerManagerGuard };
