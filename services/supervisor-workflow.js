
function contentResumeStage(record) {
  const allowed = ['pending_pr', 'pending_english', 'pending_security', 'pending_dean'];
  return allowed.includes(record.supervisorNextStage) ? record.supervisorNextStage : 'pending_pr';
}

function registerSupervisorDecisions(router, deps) {
  const { ContentRequest, SpeakerRequest, AttendanceRecord, sameOrigin, notifyContent,
    notifySpeaker, notifyAttendance, attendanceClosureMapFor, attendanceActivityKey, isAttendanceActivityEnded } = deps;
  router.post('/clubs/:clubId/decisions/:targetType/:targetId', async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload the page and try again.' });
    const { targetType, targetId } = req.params;
    const action = req.body.action;
    const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
    if (!['content', 'speaker'].includes(targetType) || !['approve', 'reject', 'request_edit'].includes(action)
      || comment.length > 2000 || action !== 'approve' && !comment) {
      return res.status(400).json({ message: 'Choose a decision and provide feedback for rejection or requested changes (up to 2000 characters).' });
    }
    if (targetType === 'content' ? !/^\d+$/.test(targetId) : !/^[a-f\d]{24}$/i.test(targetId)) {
      return res.status(404).json({ message: 'Request not found.' });
    }
    try {
      const model = targetType === 'content' ? ContentRequest : SpeakerRequest;
      const filter = { clubId: req.supervisorClubId, ...(targetType === 'content' ? { id: Number(targetId) } : { _id: targetId }) };
      const record = await model.findOne(filter).lean();
      if (!record) return res.status(404).json({ message: 'Request not found.' });
      if (record.status !== 'pending_supervisor') return res.status(409).json({ message: 'This request is no longer waiting for supervisor approval.' });
      const submittedBy = targetType === 'speaker' ? record.requesterEmail
        : [...(record.workflowHistory || [])].reverse().find(event => event.role === 'club')?.actorEmail;
      if (String(submittedBy || '').toLowerCase() === String(req.supervisor.email).toLowerCase()) {
        return res.status(403).json({ message: 'You cannot approve or review your own request.' });
      }
      const now = new Date();
      const nextStatus = action === 'approve' ? targetType === 'content' ? contentResumeStage(record) : 'pending_dean'
        : action === 'reject' ? 'rejected' : 'changes_requested';
      const set = { status: nextStatus, supervisorReviewerEmail: req.supervisor.email, supervisorReviewedAt: now };
      let update;
      if (targetType === 'content') {
        set.clubNotice = `Club supervisor ${action === 'approve' ? 'approved the request' : action === 'reject' ? 'rejected the request' : 'requested changes'}.${comment ? ` Feedback: ${comment}` : ''}`;
        set.editRequestedBy = action === 'request_edit' ? 'supervisor' : '';
        set.resubmitTo = action === 'request_edit' ? 'pending_supervisor' : 'pending_pr';
        update = { $set: set, $push: { workflowHistory: {
          role: 'supervisor', actorRole: 'supervisor', actorEmail: req.supervisor.email, action,
          fromStatus: 'pending_supervisor', toStatus: nextStatus, comment, createdAt: now
        } } };
        if (comment) {
          set['comments.supervisor'] = [record.comments?.supervisor, comment].filter(Boolean).join('\n').slice(-10000);
          update.$push.commentHistory = { role: 'supervisor', text: comment, createdAt: now };
        }
      } else {
        set.reviewerEmail = req.supervisor.email; set.reviewerRole = 'supervisor'; set.reviewerComment = comment;
        if (action === 'approve') set.clubReviewedAt = record.clubReviewedAt || now;
        if (action === 'reject') set.decidedAt = now;
        update = { $set: set, $push: { decisionHistory: {
          action: action === 'approve' ? 'supervisor_approved' : action === 'reject' ? 'rejected' : 'changes_requested',
          role: 'supervisor', email: req.supervisor.email, comment, createdAt: now
        } } };
        if (action === 'reject') update.$unset = { activeRequesterKey: 1 };
      }
      const saved = await model.findOneAndUpdate({ ...filter, status: 'pending_supervisor' }, update,
        { new: true, runValidators: true }).lean();
      if (!saved) return res.status(409).json({ message: 'Another reviewer already updated this request. Refresh and try again.' });
      // Notifications cannot turn a successfully saved decision into an error response.
      try { await (targetType === 'content' ? notifyContent?.(saved) : notifySpeaker?.(saved)); } catch {}
      res.json({ status: saved.status, message: 'Supervisor decision saved.' });
    } catch { res.status(503).json({ message: 'The decision could not be saved. Reload the request before retrying.' }); }
  });
  router.post('/clubs/:clubId/attendance/:itemType/:eventRequestId/decision', async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload and try again.' });
    const { itemType, eventRequestId } = req.params;
    const audience = req.query.audience === 'all_students' ? 'all_students' : req.query.audience === 'members' || req.query.audience === undefined ? 'members' : '';
    const action = req.body.action;
    const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
    if (!audience || !['event', 'booth'].includes(itemType) || !/^-?\d+$/.test(eventRequestId)
      || !Number.isSafeInteger(Number(eventRequestId)) || !['approve', 'reject'].includes(action)
      || comment.length > 500 || action === 'reject' && !comment) {
      return res.status(400).json({ message: 'Choose an attendance decision and provide a reason for rejection (up to 500 characters).' });
    }
    try {
      const filter = { clubId: req.supervisorClubId, itemType, eventRequestId: Number(eventRequestId), approvalStatus: 'pending_supervisor',
        ...(audience === 'all_students' ? { attendanceAudience: 'all_students' } : { attendanceAudience: { $in: ['members', null] } }) };
      const records = await AttendanceRecord.find(filter).lean();
      if (!records.length) return res.status(409).json({ message: 'This attendance list is not awaiting supervisor approval.' });
      const closures = await attendanceClosureMapFor(records);
      if (records.some(record => !isAttendanceActivityEnded(record.eventDate) && !closures.has(attendanceActivityKey(record)))) {
        return res.status(409).json({ message: 'The club must end attendance before this list can be reviewed.' });
      }
      const status = action === 'approve' ? 'pending_pr' : 'rejected';
      const result = await AttendanceRecord.updateMany(filter, { $set: { approvalStatus: status }, $push: { approvalHistory: {
        role: 'supervisor', email: req.supervisor.email, action: action === 'approve' ? 'approved' : 'rejected', note: comment, createdAt: new Date()
      } } });
      if (!result.modifiedCount) return res.status(409).json({ message: 'This list was already reviewed. Refresh and try again.' });
      try { await notifyAttendance?.({ clubId: req.supervisorClubId, itemType, eventRequestId: Number(eventRequestId) }, status, action); } catch {}
      res.json({ status, recordsUpdated: result.modifiedCount });
    } catch { res.status(503).json({ message: 'The attendance decision could not be saved. Refresh before retrying.' }); }
  });
}

module.exports = { contentResumeStage, registerSupervisorDecisions };
