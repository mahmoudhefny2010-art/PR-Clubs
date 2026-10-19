const P = require('./workflow-policy');
function registerWorkflowRoutes(app, { engine, actorFor, requireAdmin, ready, sameOrigin, uploadAttachment, attachmentUrl }) {
  const attempts = new Map();
  const safe = fn => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!await ready()) return res.status(503).json({ message: 'Workflow storage is temporarily unavailable.' });
      const actor = await actorFor(req, res);
      if (!actor) return res.status(401).json({ message: 'Sign in with an authorized account.' });
      if (req.path.startsWith('/api/workflow/requests') && actor.role?.startsWith('custom_') && !actor.customRoles?.some(role => role.key === actor.role && role.enabled && role.modules.includes('requests'))) P.fail(403, 'The request inbox is not enabled for this role.');
      if (!['GET', 'HEAD'].includes(req.method) && !sameOrigin(req)) return res.status(403).json({ message: 'Reload the page and try again.' });
      if (!['GET', 'HEAD'].includes(req.method)) {
        const now = Date.now(), recent = (attempts.get(actor.email) || []).filter(time => now - time < 60000);
        if (recent.length >= 60) return res.status(429).json({ message: 'Too many workflow actions. Please wait a minute.' });
        recent.push(now); attempts.set(actor.email, recent);
        if (attempts.size > 2000) for (const [email, times] of attempts) if (now - times[times.length - 1] > 60000) attempts.delete(email);
      }
      await fn(req, res, actor);
    } catch (error) {
      if (error.name === 'ValidationError') return res.status(422).json({ message: 'One or more fields are invalid or too long. Check the requested corrections.' });
      if (!error.status) console.error('Workflow operation failed:', error.code || error.name);
      res.status(error.status || 503).json({ message: error.status ? error.message : 'The workflow operation could not be confirmed. Refresh before retrying.' });
    }
  };
  function validRef(req) {
    if (!['content', 'speaker'].includes(req.params.kind) || (req.params.kind === 'content' ? !/^[1-9]\d{0,12}$/.test(req.params.id) : !/^[a-f0-9]{24}$/i.test(req.params.id))) P.fail(404, 'Request not found.');
  }
  async function notificationVisible(item, actor) {
    if (item.recipientEmail !== actor.email) return false;
    if (item.kind === 'message') return item.delivery?.channel !== 'email';
    if (item.kind === 'configuration') return actor.admin || P.assignments(actor).some(assignment => P.roles.includes(assignment.role) || actor.customRoles?.some(role => role.key === assignment.role && role.enabled && role.requestTypes.includes(item.requestRef)));
    const record = await engine.modelFor(item.kind).findOne(engine.filterFor(item.kind, item.requestRef)).lean();
    return !!record && P.mayView(actor, record);
  }
  function requireNotifications(actor) {
    if (actor.role?.startsWith('custom_') && !actor.customRoles?.some(role => role.key === actor.role && role.enabled && role.modules.includes('notifications'))) P.fail(403, 'Notifications are not enabled for this role.');
  }
  async function shape(kind, record, actor) {
    const flow = record.workflow, stage = flow.definition.stages.find(item => item.id === flow.stageId);
    const allowed = stage && flow.state === 'review' ? actor.admin ? stage.roles.flatMap(role => stage.permissions[role] || []) : P.eligibleRoles(actor, record, stage).flatMap(role => (stage.permissions[role] || []).filter(action => P.permitted(actor, role, action))) : [];
    const viewerStage = flow.definition.stages.find(item => item.roles.some(role => P.scoped(actor, role, record) && (item.id === flow.stageId || item.permissions[role]?.includes('view_all') && P.permitted(actor, role, 'view_all'))));
    const viewFields = actor.admin || P.owner(actor, record) ? Object.keys(P.fields[record.type || 'speaker']) : viewerStage?.reviewFields || [];
    const filterValues = values => values ? Object.fromEntries(Object.entries(values).filter(([key]) => viewFields.includes(key))) : values;
    const canReadHistory = actor.admin || P.owner(actor, record) || viewerStage?.roles.some(role => P.scoped(actor, role, record) && viewerStage.permissions[role]?.includes('history') && P.permitted(actor, role, 'history'));
    const history = canReadHistory ? flow.history.map(event => ({ ...event, before: filterValues(event.before), after: filterValues(event.after), values: filterValues(event.values) })) : [];
    return { kind, id: String(kind === 'content' ? record.id : record._id), title: record.title || record.proposedTopic || record.speakerName,
      type: record.type || 'speaker', clubId: record.clubId, clubName: record.clubName, updatedAt: record.updatedAt,
      values: filterValues(P.visibleFields(record)), fields: P.descriptors(record.type || 'speaker').filter(field => viewFields.includes(field.id)), workflow: { ...flow, history },
      actions: [...new Set([...allowed, ...(actor.admin && flow.state === 'review' ? ['assign', ...(stage?.escalationTargets.length ? ['forward'] : [])] : [])])], canResubmit: !actor.admin && P.owner(actor, record) && flow.state === 'changes_requested',
      adminReviewRoles: actor.admin && stage && flow.state === 'review' ? stage.roles.map(role => ({ id: role, actions: [...new Set([...(stage.permissions[role] || []), 'assign', ...(stage.escalationTargets.length ? ['forward'] : [])])] })) : [],
      eligibleReviewers: stage && (actor.admin || allowed.includes('assign')) ? (await engine.eligible({ ...record, workflow: { ...flow, assignedEmails: [] } }, stage)).map(account => account.email) : [] };
  }
  app.get('/api/workflow/context', safe(async (req, res, actor) => res.json({ admin: !!actor.admin, roles: P.roles, types: P.types,
    ...(actor.role?.startsWith('custom_') ? { dashboardUrl: require('./staff-role-keys').customDashboardUrl(actor.role), modules: actor.customRoles?.find(role => role.key === actor.role)?.modules || [], types: actor.customRoles?.find(role => role.key === actor.role)?.requestTypes || [] } : {}),
    fields: Object.fromEntries(P.types.map(type => [type, P.descriptors(type)])) })));
  app.get('/api/admin/workflows', requireAdmin, safe(async (req, res, actor) => {
    if (!actor.admin) P.fail(403, 'Administrator access is required.');
    const definitions = await engine.transaction(async session => { const result = []; for (const type of P.types) result.push(await engine.definition(type, session)); return result; });
    const custom = engine.customRoles ? await engine.customRoles.find({ enabled: true }).lean() : [];
    res.json({ definitions, roles: [...P.roles, ...custom.filter(role => role.modules.includes('requests')).map(role => role.key)], roleLabels: Object.fromEntries(custom.map(role => [role.key, role.name])), rolePermissions: Object.fromEntries(custom.map(role => [role.key, role.permissions])), roleTypes: Object.fromEntries(custom.map(role => [role.key, role.requestTypes])), actions: P.actions, fields: Object.fromEntries(P.types.map(type => [type, P.descriptors(type)])) });
  }));
  app.put('/api/admin/workflows/:type', requireAdmin, safe(async (req, res, actor) => res.json(await engine.saveDefinition(req.params.type, actor, req.body))));
  app.get('/api/admin/workflows/blocked', requireAdmin, safe(async (req, res, actor) => {
    if (!actor.admin) P.fail(403, 'Administrator access is required.');
    const summary = req.query.summary === '1';
    if (!summary) await engine.reconcile();
    const page = Number(req.query.page || 1), limit = 50;
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) P.fail(422, 'Choose a valid page.');
    const items = [];
    for (const kind of ['content', 'speaker']) {
      const rows = await engine.modelFor(kind).find({ 'workflow.state': 'review', 'workflow.blocked': { $exists: true } }).sort({ updatedAt: -1 }).lean();
      for (const row of rows) {
        const stage = row.workflow.definition.stages.find(item => item.id === row.workflow.stageId);
        const id = String(kind === 'content' ? row.id : row._id);
        items.push({ key: `${kind}:${id}:${row.workflow.stageId}:${row.workflow.blocked.since || ''}`, kind, id, title: row.title || row.proposedTopic || row.speakerName,
          clubName: row.clubName, type: row.workflow.definition.type || row.type || 'speaker', stage: stage?.name || row.workflow.stageId,
          blocked: row.workflow.blocked, updatedAt: row.updatedAt });
      }
    }
    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const keys = items.map(item => item.key);
    if (summary) return res.json({ total: items.length, keys });
    res.json({ total: items.length, keys, page, items: items.slice((page - 1) * limit, page * limit) });
  }));
  app.get('/api/workflow/requests', safe(async (req, res, actor) => {
    const all = [];
    const clubs = new Map(), stages = new Map();
    const page = Number(req.query.page || 1), limit = 50;
    if (!Number.isInteger(page) || page < 1 || page > 10000) P.fail(422, 'Choose a valid page.');
    // Query by established club scope first; never return unrelated private requests.
    const global = actor.admin || P.assignments(actor).some(item => item.role.startsWith('custom_') ? actor.customRoles?.some(role => role.key === item.role && role.enabled && role.scope === 'global') : !['president', 'vice_president', 'head', 'supervisor'].includes(item.role));
    const clubIds = [...new Set(P.assignments(actor).flatMap(item => item.role === 'supervisor' || item.role.startsWith('custom_') ? item.assignedClubIds || [] : [item.clubId]).map(Number).filter(id => id > 0))];
    const filter = { workflow: { $exists: true }, ...(!global ? { $or: [{ clubId: { $in: clubIds } }, { requesterEmail: actor.email }] } : {}) };
    for (const kind of ['content', 'speaker']) {
      const rows = await engine.modelFor(kind).find(filter).sort({ updatedAt: -1 }).lean();
      for (const row of rows) {
        if (!P.mayView(actor, row)) continue;
        clubs.set(String(row.clubId), row.clubName || 'Unnamed club');
        for (const stage of row.workflow.definition.stages) if (!stages.has(stage.id)) stages.set(stage.id, stage.name);
        if ((!req.query.state || (req.query.state === 'new' ? row.workflow.history.length === 1 : req.query.state === 'resubmitted' ? row.workflow.state === 'review' && row.workflow.history.some(event => event.action === 'resubmitted') : row.workflow.state === req.query.state))
        && (!req.query.type || (row.workflow.definition.type || row.type || 'speaker') === req.query.type)
        && (!req.query.clubId || Number(row.clubId) === Number(req.query.clubId))
        && (!req.query.stage || row.workflow.stageId === req.query.stage)
        && (!req.query.reviewer || row.workflow.assignedEmails?.includes(req.query.reviewer))) {
        const stage = row.workflow.definition.stages.find(item => item.id === row.workflow.stageId);
        all.push({ kind, id: String(kind === 'content' ? row.id : row._id), title: row.title || row.proposedTopic, type: row.type || 'speaker', clubName: row.clubName,
          state: row.workflow.state, stage: stage?.name || 'Completed', roles: stage?.roles || [], assignedEmails: row.workflow.assignedEmails || [], updatedAt: row.updatedAt,
          resubmitted: row.workflow.history.some(event => event.action === 'resubmitted'), revision: row.workflow.revision });
        }
      }
    }
    all.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const named = map => [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ total: all.length, page, items: all.slice((page - 1) * limit, page * limit), filters: { clubs: named(clubs), stages: named(stages) } });
  }));
  app.get('/api/workflow/requests/:kind/:id', safe(async (req, res, actor) => { validRef(req); res.json(await shape(req.params.kind, await engine.request(req.params.kind, req.params.id, actor), actor)); }));
  app.post('/api/workflow/requests/:kind/:id/decision', safe(async (req, res, actor) => { validRef(req); res.json(await shape(req.params.kind, await engine.decide(req.params.kind, req.params.id, actor, req.body), actor)); }));
  app.post('/api/workflow/requests/:kind/:id/resubmit', safe(async (req, res, actor) => { validRef(req); res.json(await shape(req.params.kind, await engine.resubmit(req.params.kind, req.params.id, actor, req.body), actor)); }));
  app.post('/api/workflow/requests/:kind/:id/upload', safe(async (req, res, actor) => {
    validRef(req); const record = await engine.request(req.params.kind, req.params.id, actor);
    if (req.params.kind !== 'speaker' || !P.owner(actor, record) || actor.admin || record.workflow.state !== 'changes_requested' || !record.workflow.revisionFields.includes('speakerAttachments')) P.fail(403, 'Attachments are locked for this request.');
    res.json(await uploadAttachment(record, actor, req.body));
  }));
  app.get('/api/workflow/requests/:kind/:id/attachments/:index', safe(async (req, res, actor) => {
    validRef(req); const record = await engine.request(req.params.kind, req.params.id, actor);
    const index = Number(req.params.index);
    const mayInspect = actor.admin || P.owner(actor, record) || record.workflow.definition.stages.some(stage => stage.reviewFields.includes('speakerAttachments') && stage.roles.some(role => P.scoped(actor, role, record) && (stage.id === record.workflow.stageId || stage.permissions[role]?.includes('view_all') && P.permitted(actor, role, 'view_all'))));
    if (!mayInspect || req.params.kind !== 'speaker' || !Number.isSafeInteger(index) || index < 0 || !record.speakerAttachments?.[index]) P.fail(404, 'Attachment not found.');
    res.json({ url: await attachmentUrl(record.speakerAttachments[index]) });
  }));
  app.get('/api/admin/workflows/message-recipients', requireAdmin, safe(async (req, res, actor) => {
    if (!actor.admin) P.fail(403, 'Administrator access is required.');
    res.json({ recipients: await engine.messageRecipients() });
  }));
  app.post('/api/admin/workflows/messages', requireAdmin, safe(async (req, res, actor) => {
    if (!actor.admin) P.fail(403, 'Administrator access is required.');
    res.status(202).json(await engine.sendMessage(actor, req.body));
  }));
  app.get('/api/admin/workflows/notifications', requireAdmin, safe(async (req, res, actor) => {
    if (!actor.admin) P.fail(403, 'Administrator access is required.');
    void engine.deliver();
    res.json(await engine.notifications.find().select('-leaseId').sort({ createdAt: -1 }).limit(100).lean());
  }));
  app.get('/api/workflow/notifications', safe(async (req, res, actor) => {
    requireNotifications(actor);
    void engine.deliver();
    const items = await engine.notifications.find({ recipientEmail: actor.email, 'delivery.channel': { $ne: 'email' } }).sort({ createdAt: -1 }).limit(100).lean();
    const visible = [];
    for (const item of items) if (await notificationVisible(item, actor)) { const { eventKey, leaseId, ...publicItem } = item; visible.push(publicItem); }
    res.json(visible);
  }));
  app.post('/api/workflow/notifications/:id/read', safe(async (req, res, actor) => {
    requireNotifications(actor);
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) P.fail(404, 'Notification not found.');
    const item = await engine.notifications.findOne({ _id: req.params.id, recipientEmail: actor.email }).lean();
    if (!item || !await notificationVisible(item, actor)) P.fail(404, 'Notification not found.');
    const row = await engine.notifications.findOneAndUpdate({ _id: req.params.id, recipientEmail: actor.email }, { $set: { readAt: new Date() } }, { new: true }).lean();
    if (!row) P.fail(404, 'Notification not found.'); res.json({ read: true });
  }));
  app.post('/api/workflow/notifications/:id/retry', safe(async (req, res, actor) => {
    if (!actor.admin) requireNotifications(actor);
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) P.fail(404, 'Notification not found.');
    const item = await engine.notifications.findOne({ _id: req.params.id }).lean();
    if (!item || item.delivery?.channel === 'notification' || !actor.admin && !await notificationVisible(item, actor)) P.fail(404, 'Notification not found.');
    const row = await engine.notifications.findOneAndUpdate({ _id: req.params.id, ...(actor.admin ? {} : { recipientEmail: actor.email }), emailStatus: { $in: ['failed', 'unconfigured'] } }, { $set: { attempts: 0, nextAttemptAt: new Date(), leaseUntil: null, emailStatus: 'pending' } }, { new: true }).lean();
    if (!row) P.fail(404, 'No failed notification is available to retry.'); void engine.deliver(); res.json({ queued: true });
  }));
  // A managed request can never be changed by an older, less restrictive action.
  app.use(async (req, res, next) => {
    // Old CV links must pass the same inspectable-field checks as the new page.
    const privateCv = /^\/api\/speaker-requests\/([a-f0-9]{24})\/cv$/i.exec(req.path);
    if (req.method === 'GET' && privateCv) {
      try {
        const row = await engine.modelFor('speaker').findOne(engine.filterFor('speaker', privateCv[1])).lean();
        if (!row?.workflow) return next();
        return res.redirect(307, `/api/workflow/requests/speaker/${privateCv[1]}/attachments/${encodeURIComponent(req.query.attachmentIndex || 0)}`);
      } catch { return res.status(503).json({ message: 'Attachment access could not be verified.' }); }
    }
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const content = /^\/api\/(?:club\/content|committee\/requests)\/(\d+)(?:\/|$)/.exec(req.path);
    const speaker = /^\/api\/(?:club\/|dean\/)?speaker-requests\/([a-f0-9]{24})\/(?:decision|resubmit)/i.exec(req.path);
    const supervisor = /^\/api\/supervisor\/clubs\/\d+\/decisions\/(content|speaker)\/([a-f0-9]+)$/i.exec(req.path);
    if (!content && !speaker && !supervisor) return next();
    try {
      const kind = content ? 'content' : speaker ? 'speaker' : supervisor[1], id = content?.[1] || speaker?.[1] || supervisor[2];
      const row = await engine.modelFor(kind).findOne(engine.filterFor(kind, id)).select('id clubId assignedHeadEmail requesterEmail workflow').lean();
      if (!row?.workflow) return next();
      const actor = await actorFor(req, res);
      if (!P.mayView(actor, row)) return res.status(404).json({ message: 'Request not found.' });
      res.status(409).json({ message: 'Open the workflow request to review or edit only the authorized fields.', workflowUrl: `/pages/workflow.html?kind=${kind}&id=${id}` });
    } catch { res.status(503).json({ message: 'Request access could not be verified.' }); }
  });
}
module.exports = { registerWorkflowRoutes };
