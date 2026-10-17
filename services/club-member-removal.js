const normalizeEmail = value => String(value || '').trim().toLowerCase();

function registerClubMemberRemoval(app, { requireClubAuth, requireClubPresident, requireLiveDatabase, mongoose, Club, Application, clubs, applications }) {
  app.delete('/api/club/members/:memberId', requireClubAuth, requireClubPresident, async (req, res) => {
    const memberId = String(req.params.memberId || '').trim();
    if (!memberId || memberId.length > 100) return res.status(400).json({ message: 'Invalid member.' });
    const applicationId = memberId.startsWith('application-') ? Number(memberId.slice(12)) : null;
    if (applicationId !== null && (!Number.isSafeInteger(applicationId) || applicationId <= 0)) {
      return res.status(400).json({ message: 'Invalid member.' });
    }
    let session;
    try {
      if (!requireLiveDatabase(res)) return;
      session = await mongoose.startSession();
      let result;
      await session.withTransaction(async () => {
        result = null;
        const clubId = req.clubAccount.clubId;
        const club = await Club.findOne({ id: clubId }).select('id members memberRoster removedMembers').session(session);
        if (!club) return;
        const accepted = await Application.find({ clubId, status: 'accepted' }).select('id email studentName committee memberPosition memberType').session(session).lean();
        const roster = Array.from(club.memberRoster || []);
        const target = applicationId === null ? roster.find(member => member.id === memberId) : accepted.find(member => member.id === applicationId);
        if (!target) return;
        const email = normalizeEmail(target.email);
        const matches = member => member === target || (email && normalizeEmail(member.email) === email);
        const removedApplications = accepted.filter(matches).map(member => member.id);
        // An accepted application grants membership throughout the site. Revoke that
        // status, retaining the application and its interview/attendance history.
        if (removedApplications.length) {
          await Application.updateMany({ clubId, status: 'accepted', id: { $in: removedApplications } }, { $set: { status: 'removed' }, $unset: { studentClubKey: 1 } }, { session, runValidators: true });
        }
        const remainingRoster = roster.filter(member => !matches(member));
        const remainingAccepted = accepted.filter(member => !matches(member));
        const identities = new Set([...remainingRoster, ...remainingAccepted].map(member => normalizeEmail(member.email) || `id:${member.id}`));
        club.memberRoster = remainingRoster;
        club.removedMembers = [...(club.removedMembers || []), {
          id: memberId, name: target.name || target.studentName || '', email,
          committee: target.committee || '', position: target.position || target.memberPosition || 'Member',
          memberType: target.memberType || 'new', source: applicationId === null ? 'manual' : 'accepted-application',
          applicationIds: removedApplications, status: 'removed', removedAt: new Date()
        }];
        club.members = Math.max(0, (Number(club.members) || 0) - 1, identities.size);
        await club.save({ session });
        result = { memberRoster: remainingRoster, removedMembers: club.removedMembers, totalCount: club.members, removedApplications };
      }, { writeConcern: { w: 'majority' } });
      if (!result) return res.status(404).json({ message: 'Member not found in your club.' });
      const cachedClub = clubs.find(club => club.id === req.clubAccount.clubId);
      if (cachedClub) Object.assign(cachedClub, { memberRoster: result.memberRoster, removedMembers: result.removedMembers, members: result.totalCount });
      for (const application of applications) {
        if (application.clubId === req.clubAccount.clubId && result.removedApplications.includes(application.id)) {
          application.status = 'removed';
          delete application.studentClubKey;
        }
      }
      return res.json({ message: 'Member removed from this club.', totalCount: result.totalCount });
    } catch (error) {
      console.error('Club member removal failed:', { name: error.name, code: error.code, number: error.number, fields: Object.keys(error.errors || {}) });
      return res.status(503).json({ message: 'Could not remove this member right now. Refresh the list before retrying.' });
    } finally {
      if (session) await session.endSession();
    }
  });
}

module.exports = { registerClubMemberRemoval };
