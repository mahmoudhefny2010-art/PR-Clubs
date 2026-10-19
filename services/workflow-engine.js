const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const P = require('./workflow-policy');
const { staffRoleAssignments } = require('./staff-google-auth');
const { WorkflowDefinition, WorkflowNotification } = require('./workflow-models');
const pending = role => ({ supervisor: 'pending_supervisor', english: 'pending_english', security: 'pending_security', dean: 'pending_dean', president: 'pending_club', head: 'pending_club' }[role] || 'pending_pr');
function createWorkflowEngine({ database, ContentRequest, SpeakerRequest, ClubAccount, AuditLog, publish, validatePatch, transport, afterCommit = async () => {}, env = process.env,
  definitions = WorkflowDefinition, notifications = WorkflowNotification, customRoles = null, adminEmail = () => env.ADMIN_EMAIL || '' }) {
  const modelFor = kind => kind === 'content' ? ContentRequest : kind === 'speaker' ? SpeakerRequest : P.fail(404, 'Request not found.');
  const filterFor = (kind, id) => kind === 'content' ? { id: Number(id) } : { _id: id };
  async function transaction(fn) { const session = await database.startSession(); try { let result; await session.withTransaction(async () => { result = await fn(session); }); return result; } finally { await session.endSession(); } }
  async function definition(type, session) {
    let row = await definitions.findOne({ type }).session(session).lean();
    if (!row) {
      const config = P.defaults(type);
      const saved = await definitions.findOneAndUpdate({ type }, { $setOnInsert: { type, version: 1, config, updatedBy: 'system' } }, { upsert: true, new: true, runValidators: true }).session(session).lean();
      row = saved;
    }
    return row;
  }
  async function actors(session) {
    const accounts = await ClubAccount.find().select('email role clubId assignedClubIds roleAssignments').session(session).lean();
    const roleDefinitions = customRoles ? await customRoles.find({ enabled: true }).session(session).lean() : [];
    const result = accounts.map(account => ({ email: account.email.toLowerCase(), assignments: staffRoleAssignments(account), customRoles: roleDefinitions }));
    if (adminEmail()) result.push({ email: adminEmail().toLowerCase(), admin: true, assignments: [{ role: 'admin' }] });
    const merged = new Map();
    for (const actor of result) { const previous = merged.get(actor.email); merged.set(actor.email, previous ? { ...previous, admin: !!(previous.admin || actor.admin), assignments: [...previous.assignments, ...actor.assignments] } : actor); }
    return [...merged.values()];
  }
  async function eligible(record, stage, session) { return (await actors(session)).filter(actor => P.eligibleRoles(actor, record, stage).length); }
  async function messageRecipients(session) {
    const accounts = await actors(session);
    return [...new Map(accounts.filter(account => account.admin || account.assignments.length).map(account => [account.email, {
      email: account.email,
      roles: account.assignments.map(item => item.role),
      canNotify: !!account.admin || account.assignments.some(item => !item.role.startsWith('custom_') || account.customRoles.some(role => role.key === item.role && role.enabled && role.modules.includes('notifications')))
    }])).values()].sort((a, b) => a.email.localeCompare(b.email));
  }
  async function sendMessage(actor, payload = {}) {
    if (!actor.admin) P.fail(403, 'Administrator access is required.');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) P.fail(422, 'Enter a recipient, subject, message and delivery channel.');
    const { channel, requestId } = payload;
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!['email', 'notification', 'both'].includes(channel)) P.fail(422, 'Choose email, in-app notification, or both.');
    if (email.length > 254 || !/^[^\s@<>(),;:\\"]+@[^\s@<>(),;:\\"]+\.[^\s@<>(),;:\\"]+$/.test(email)) P.fail(422, 'Enter a valid recipient email.');
    if (!title || title.length > 160 || /[\r\n\u0000-\u001f\u007f]/.test(title)) P.fail(422, 'Enter a title of up to 160 characters on one line.');
    if (!message || message.length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) P.fail(422, 'Enter a message of up to 5,000 characters.');
    if (typeof requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) P.fail(422, 'Reload the page before sending.');
    const eventKey = crypto.createHash('sha256').update(`message:${actor.email}:${requestId}`).digest('hex');
    let result;
    await transaction(async session => {
      const existing = await notifications.findOne({ eventKey }).session(session).lean();
      if (existing) {
        if (existing.recipientEmail !== email || existing.title !== title || existing.message !== message || existing.delivery?.channel !== channel) P.fail(409, 'This message was already submitted. Start a new message.');
        result = existing; return;
      }
      if (channel !== 'email' && !(await messageRecipients(session)).some(account => account.email === email && account.canNotify)) P.fail(422, 'In-app notifications require a registered staff account with notification access. Choose email for this address.');
      const emailConfigured = transport() && env.EMAIL_FROM && (env.SITE_URL || env.ONESIGNAL_SITE_URL);
      [result] = await notifications.create([{ eventKey, recipientEmail: email, kind: 'message', requestRef: requestId,
        title, message, link: '/pages/workflow.html', delivery: { channel, senderEmail: actor.email },
        emailStatus: channel === 'notification' ? null : emailConfigured ? 'pending' : 'unconfigured' }], { session });
      await audit(actor, 'message_queued', 'notification', result, { recipient: email, channel }, session);
    });
    void deliver();
    return { id: String(result._id), channel, emailStatus: result.emailStatus };
  }
  function distinctReviewers(stage, available, record) {
    available = available.filter(actor => stage.roles.some(role => stage.permissions[role]?.includes('approve') && P.permitted(actor, role, 'approve') && (record ? P.eligibleRoles(actor, record, stage).includes(role) : actor.assignments.some(item => item.role === role) || actor.admin && role === 'admin')));
    if (stage.approvalRule !== 'all_roles') return available.length > 0;
    const approved = record?.workflow?.approvals || [], used = new Set(approved.map(item => item.email));
    function match(index) {
      if (index === stage.roles.length) return true;
      const role = stage.roles[index]; if (approved.some(item => item.role === role)) return match(index + 1);
      for (const actor of available) if (!used.has(actor.email) && P.permitted(actor, role, 'approve') && (record ? P.eligibleRoles(actor, record, stage).includes(role) : actor.assignments.some(item => item.role === role) || actor.admin && role === 'admin')) {
        used.add(actor.email); if (match(index + 1)) return true; used.delete(actor.email);
      }
      return false;
    }
    return match(0);
  }
  async function requireReviewers(record, stage, session) {
    const active = stage, available = await eligible(record, active, session);
    if (!active.roles.length || !distinctReviewers(active, available, record)) {
      record.workflow.blocked = { stageId: stage.id, reason: !available.length ? 'no_reviewers' : 'insufficient_eligible_reviewers',
        since: record.workflow.blocked?.stageId === stage.id && record.workflow.blocked.since ? record.workflow.blocked.since : new Date().toISOString(),
        missingRoles: !active.roles.length ? stage.roles : active.roles.filter(role => !record.workflow.approvals.some(item => item.role === role) && !available.some(actor => P.eligibleRoles(actor, record, active).includes(role) && P.permitted(actor, role, 'approve'))),
        assignedEmails: record.workflow.assignedEmails || [] };
    } else delete record.workflow.blocked;
  }
  async function audit(actor, action, kind, record, details, session) {
    await AuditLog.create([{ id: Date.now() * 1000 + crypto.randomInt(1000), actorEmail: actor.email, actorRole: actor.admin ? 'admin' : actor.assignments?.[0]?.role || actor.role || 'club',
      action: 'workflow_' + action, targetType: kind, targetId: String(record.id || record._id || record.type), targetName: record.title || record.name || record.type || '', details: JSON.stringify(details).slice(0, 12000) }], { session });
  }
  async function enqueue(record, kind, event, session) {
    const stage = record.workflow.definition.stages.find(item => item.id === record.workflow.stageId);
    const recipients = new Set([record.workflow.ownerEmail]);
    if (record.workflow.state === 'review' && stage) for (const actor of await eligible(record, stage, session)) recipients.add(actor.email);
    const ref = String(kind === 'content' ? record.id : record._id);
    const selected = record.workflow.revisionFields?.map(id => P.fields[record.type || 'speaker'][id]?.[0] || id).join(', ');
    for (const email of recipients) if (email) {
      const eventKey = crypto.createHash('sha256').update(`${kind}:${ref}:${record.workflow.revision}:${email}`).digest('hex');
      await notifications.create([{ eventKey, recipientEmail: email, kind, requestRef: ref,
        title: `${record.clubName || 'MIU'}: ${record.title || record.speakerName}`,
        message: `${event.action}. Status: ${record.workflow.state}. Stage: ${stage?.name || 'Completed'}.${selected ? ' Requested fields: ' + selected + '.' : ''}${event.comment ? '\n' + event.comment : ''}`,
        link: `/pages/workflow.html?kind=${kind}&id=${encodeURIComponent(ref)}`,
        emailStatus: transport() && env.EMAIL_FROM && (env.SITE_URL || env.ONESIGNAL_SITE_URL) ? 'pending' : 'unconfigured' }], { session });
    }
  }
  async function advance(record, start, session, preserve = false) {
    const flow = record.workflow; let stage = flow.definition.stages.find(item => item.id === start);
    const previousStage = flow.stageId;
    delete flow.skippedReviewerRoles;
    const visited = new Set();
    while (stage) {
      if (visited.has(stage.id)) P.fail(422, 'Invalid automatic workflow routing.');
      visited.add(stage.id);
      if (stage.enabled && !stage.automatic) break;
      flow.history.push({ action: 'automatic_forward', stageId: stage.id, at: new Date().toISOString(), actorEmail: 'system', comment: '' });
      stage = flow.definition.stages.find(item => item.id === stage.next);
    }
    flow.stageId = stage?.id || ''; flow.state = stage ? 'review' : 'approved';
    if (!preserve || previousStage !== flow.stageId) { flow.approvals = []; flow.assignedEmails = []; }
    if (!preserve || previousStage !== flow.stageId) delete flow.blocked;
    if (!stage) record.status = record.type === 'entry_permit' || !record.type ? 'approved' : 'published';
    else record.status = record.type ? (stage.roles[0] === 'president' || stage.roles[0] === 'head' ? 'pending_pr' : pending(stage.roles[0]))
      : ['president', 'vice_president', 'head'].includes(stage.roles[0]) ? 'pending_club' : stage.roles[0] === 'supervisor' ? 'pending_supervisor' : 'pending_dean';
    if (stage) await requireReviewers(record, stage, session);
    return stage;
  }
  async function initialize(record, actor, session) {
    const type = record.type || (record.hostingType === 'miu' ? 'speaker_miu' : record.requesterType === 'club' ? 'speaker' : 'speaker_public'), row = await definition(type, session);
    if (!row.config.enabled) P.fail(409, 'New submissions for this request type are temporarily paused by the administrator.');
    record.workflow = { definition: P.clone(row.config), definitionVersion: row.version, ownerEmail: actor.email.toLowerCase(), revision: 1,
      stageId: row.config.start, state: 'review', approvals: [], assignedEmails: [], revisionFields: [], fieldComments: {}, history: [] };
    const stage = await advance(record, row.config.start, session);
    if (!stage) P.fail(422, 'A workflow must contain an explicit review stage.');
    record.workflow.history.push({ action: 'submitted', at: new Date().toISOString(), actorEmail: actor.email, actorRole: actor.role || actor.assignments?.[0]?.role, stageId: stage.id, values: P.visibleFields(record) });
  }
  async function submitNew(record, actor) {
    const kind = record.type ? 'content' : 'speaker';
    await transaction(async session => {
      await initialize(record, actor, session);
      await record.save({ session });
      await audit(actor, 'submitted', kind, record, { stage: record.workflow.stageId, revision: 1 }, session);
      await enqueue(record, kind, { action: 'Submitted' }, session);
    });
    void deliver();
    return record;
  }
  async function createNew(kind, values, actor) {
    let record;
    await transaction(async session => {
      [record] = await modelFor(kind).create([values], { session });
      await initialize(record, actor, session);
      await record.save({ session });
      await audit(actor, 'submitted', kind, record, { stage: record.workflow.stageId, revision: 1 }, session);
      await enqueue(record, kind, { action: 'Submitted' }, session);
    });
    void deliver(); return record;
  }
  async function request(kind, id, actor, session) {
    if (customRoles && actor?.role?.startsWith('custom_')) {
      const currentAccount = await ClubAccount.findOne({ email: actor.email }).session(session).lean();
      actor.assignments = staffRoleAssignments(currentAccount).filter(item => item.role === actor.role);
      actor.customRoles = await customRoles.find({ key: actor.role, enabled: true }).session(session).lean();
      if (!actor.assignments.length || !actor.customRoles.length) P.fail(403, 'This role assignment is no longer active.');
    }
    const record = await modelFor(kind).findOne(filterFor(kind, id)).session(session).lean();
    if (!record || !P.mayView(actor, record)) P.fail(404, 'Request not found.');
    return record;
  }
  async function commit(kind, record, revision, actor, event, session, patch = {}) {
    record.workflow.revision = revision + 1;
    record.workflow.lastActivityAt = new Date().toISOString();
    record.workflow.history.push({ ...event, actorEmail: actor.email, at: record.workflow.lastActivityAt });
    const update = { ...patch, workflow: record.workflow, status: record.status };
    if (kind === 'content' && record.workflow.state === 'approved' && record.type !== 'entry_permit') update.publishedAt = new Date();
    if (kind === 'speaker' && ['approved', 'rejected'].includes(record.workflow.state)) Object.assign(update, { decidedAt: new Date(), reviewerEmail: actor.email, reviewerRole: event.actorRole || 'admin', reviewerComment: event.comment || '' });
    if (kind === 'speaker' && ['approved', 'rejected'].includes(record.workflow.state)) update.activeRequesterKey = undefined;
    const saved = await modelFor(kind).findOneAndUpdate({ ...filterFor(kind, kind === 'content' ? record.id : record._id), 'workflow.revision': revision },
      { $set: Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)),
        ...(kind === 'speaker' && ['approved', 'rejected'].includes(record.workflow.state) ? { $unset: { activeRequesterKey: 1 } } : {}) },
      { new: true, runValidators: true }).session(session).lean();
    if (!saved) P.fail(409, 'The request changed. Refresh before deciding or resubmitting.');
    if (record.workflow.state === 'approved' && kind === 'content') await publish(saved, session);
    await audit(actor, event.action, kind, record, { ...event, revision: revision + 1 }, session);
    await enqueue(record, kind, event, session);
    return saved;
  }
  async function decide(kind, id, actor, body) {
    const saved = await transaction(async session => {
      const record = await request(kind, id, actor, session), flow = record.workflow;
      if (!Number.isSafeInteger(body.revision) || body.revision !== flow.revision) P.fail(409, 'This request has changed. Refresh to see the latest version.');
      const action = body.action, comment = P.clean(body.comment);
      if (!['approve', 'reject', 'request_changes', 'comment', 'forward', 'assign'].includes(action)) P.fail(422, 'Choose a valid action.');
      let stage, role;
      if (actor.admin) {
        stage = flow.definition.stages.find(item => item.id === flow.stageId);
        if (flow.state !== 'review' || !stage) P.fail(409, 'This request is not awaiting a review decision.');
        role = body.reviewRole || (stage.roles.length === 1 ? stage.roles[0] : '');
        if (!stage.roles.includes(role)) P.fail(422, 'Choose a review role from the current stage.');
        if (!['assign', 'forward'].includes(action) && !stage.permissions[role]?.includes(action)) P.fail(403, 'This action is not enabled for the selected review role.');
      } else ({ stage, role } = P.authorize(actor, record, action));
      if (['reject', 'request_changes', 'forward', 'assign'].includes(action) && !comment || action === 'approve' && stage.commentOnApprove && !comment || action === 'comment' && !comment) P.fail(422, 'Provide instructions or a reason for this action.');
      const event = { action, comment, stageId: stage.id, actorRole: actor.admin ? 'admin' : role, ...(actor.admin ? { onBehalfOfRole: role } : {}), fromState: flow.state };
      if (action === 'request_changes') {
        if (!Array.isArray(body.fields) || !body.fields.length || body.fields.some(field => !stage.editableFields.includes(field))) P.fail(422, 'Select eligible fields for correction.');
        flow.revisionFields = [...new Set(body.fields)]; flow.fieldComments = {};
        for (const field of flow.revisionFields) flow.fieldComments[field] = P.clean(body.fieldComments?.[field]) || comment;
        flow.state = 'changes_requested'; record.status = 'changes_requested'; flow.approvals = [];
        event.fields = flow.revisionFields; event.fieldComments = flow.fieldComments; event.values = P.visibleFields(record);
      } else if (action === 'reject') { flow.state = 'rejected'; record.status = 'rejected'; flow.revisionFields = []; }
      else if (action === 'assign') {
        const available = await eligible({ ...record, workflow: { ...flow, assignedEmails: [] } }, stage, session);
        if (!Array.isArray(body.emails) || !body.emails.length || body.emails.some(email => !available.some(actor => actor.email === email))) P.fail(422, 'Choose reviewers eligible for the current stage and club.');
        flow.assignedEmails = [...new Set(body.emails)]; flow.approvals = []; event.assignedEmails = flow.assignedEmails;
      } else if (action === 'forward') {
        if (!stage.escalationTargets.includes(body.target)) P.fail(403, 'This stage cannot forward to that destination.');
        await advance(record, body.target, session); event.target = body.target;
      } else if (action === 'approve') {
        if (!actor.admin && flow.approvals.some(approval => approval.email === actor.email)) P.fail(409, 'You already approved this stage.');
        const required = stage;
        const approvingRole = actor.admin ? (flow.approvals.some(approval => approval.role === role) ? null : role) : stage.approvalRule === 'all_roles' ? P.eligibleRoles(actor, record, required).find(candidate => stage.permissions[candidate]?.includes('approve') && P.permitted(actor, candidate, 'approve') && !flow.approvals.some(approval => approval.role === candidate)) : role;
        if (!approvingRole) P.fail(409, 'This role already approved the stage.');
        flow.approvals.push({ email: actor.email, role: approvingRole, ...(actor.admin ? { administratorOverride: true } : {}), at: new Date().toISOString() });
        if (stage.approvalRule === 'any' || required.roles.every(required => flow.approvals.some(approval => approval.role === required))) await advance(record, stage.next, session);
      }
      if (flow.state === 'review') {
        const next = flow.definition.stages.find(item => item.id === flow.stageId);
        await requireReviewers(record, next, session);
      }
      event.toState = flow.state; event.nextStageId = flow.stageId;
      return commit(kind, record, body.revision, actor, event, session);
    });
    void deliver(); void afterCommit(saved).catch(error => console.error('Workflow post-approval notification failed:', error.name)); return saved;
  }
  async function resubmit(kind, id, actor, body) {
    const saved = await transaction(async session => {
      const record = await request(kind, id, actor, session), flow = record.workflow;
      if (!P.owner(actor, record) || actor.admin) P.fail(403, 'Only an authorized club requester can resubmit corrections.');
      if (flow.state !== 'changes_requested' || body.revision !== flow.revision) P.fail(409, 'This revision is no longer open. Refresh the request.');
      const stage = flow.definition.stages.find(item => item.id === flow.stageId);
      const patch = P.revisionPatch(record, body.changes);
      if (stage.requireAllRevisions !== false && flow.revisionFields.some(field => !Object.hasOwn(body.changes || {}, field) || JSON.stringify(body.changes[field]) === JSON.stringify(record[field]))) P.fail(422, 'Complete corrections to every requested field before resubmitting.');
      await validatePatch(record, patch, actor, session);
      const before = P.visibleFields(record);
      Object.assign(record, patch);
      await advance(record, stage.resubmit, session);
      const next = flow.definition.stages.find(item => item.id === flow.stageId);
      if (next) await requireReviewers(record, next, session);
      const event = { action: 'resubmitted', stageId: stage.id, fields: flow.revisionFields, fieldComments: flow.fieldComments,
        before, after: P.visibleFields(record), comment: P.clean(body.comment), nextStageId: flow.stageId };
      flow.revisionFields = []; flow.fieldComments = {};
      return commit(kind, record, body.revision, actor, event, session, patch);
    });
    void deliver(); return saved;
  }
  async function saveDefinition(type, actor, body) {
    if (!actor.admin) P.fail(403, 'Administrator workflow access is required.');
    const result = await transaction(async session => {
      const roleDefinitions = customRoles ? await customRoles.find({ enabled: true }).session(session).lean() : [];
      const config = P.validateDefinition(body.config, type, roleDefinitions);
      const previous = await definition(type, session);
      if (body.version !== previous.version) P.fail(409, 'Workflow configuration changed. Reload before saving.');
      const available = await actors(session);
      // Empty roles are handled when routing each request; shortages remain visible to administrators.
      const saved = await definitions.findOneAndUpdate({ type, version: body.version }, { $set: { config, updatedBy: actor.email }, $inc: { version: 1 },
        $push: { history: { version: previous.version, config: previous.config, updatedBy: previous.updatedBy, at: new Date() } } }, { new: true, runValidators: true }).session(session).lean();
      if (!saved) P.fail(409, 'Workflow configuration changed.');
      await audit(actor, 'configuration_changed', 'definition', { type }, { before: previous.config, after: config, version: saved.version }, session);
      const notified = new Set();
      for (const recipient of available) if (!notified.has(recipient.email) && config.stages.some(stage => stage.roles.some(role => recipient.assignments.some(item => item.role === role)))) {
        notified.add(recipient.email);
        await notifications.create([{ eventKey: crypto.createHash('sha256').update(`config:${type}:${saved.version}:${recipient.email}`).digest('hex'), recipientEmail: recipient.email, kind: 'configuration', requestRef: type,
          title: 'Workflow configuration updated', message: `${config.name} was updated. New submissions use version ${saved.version}; existing requests keep their assigned workflow.`, link: '/pages/workflow.html', emailStatus: 'unconfigured' }], { session });
      }
      return saved;
    });
    return result;
  }
  let reconciling;
  async function reconcile() {
    if (reconciling) return reconciling;
    reconciling = (async () => {
      let changed = 0;
      for (const kind of ['content', 'speaker']) {
        const rows = await modelFor(kind).find({ 'workflow.state': 'review' }).select('_id id').lean();
        for (const row of rows) {
          try {
            const saved = await transaction(async session => {
              const record = await modelFor(kind).findOne(filterFor(kind, kind === 'content' ? row.id : row._id)).session(session).lean();
              if (!record?.workflow || record.workflow.state !== 'review') return;
              const before = P.clone(record.workflow), revision = record.workflow.revision;
              await advance(record, record.workflow.stageId, session, true);
              if (isDeepStrictEqual(before, P.clone(record.workflow))) return;
              return commit(kind, record, revision, { email: 'system', role: 'workflow_router' }, { action: 'reviewer_availability_updated', actorRole: 'workflow_router', comment: record.workflow.blocked ? 'Waiting for eligible reviewers.' : 'Reviewer availability checked.', nextStageId: record.workflow.stageId }, session);
            });
            if (saved) { changed++; await afterCommit(saved); }
          } catch (error) { if (error.status !== 409) throw error; }
        }
      }
      if (changed) void deliver();
      return { changed };
    })();
    try { return await reconciling; } finally { reconciling = null; }
  }
  let delivering = false;
  async function deliver() {
    if (delivering) return;
    delivering = true;
    try {
      const sender = transport(), base = env.SITE_URL || env.ONESIGNAL_SITE_URL;
      if (!sender || !env.EMAIL_FROM || !base) return;
      const origin = new URL(base); if (!['http:', 'https:'].includes(origin.protocol)) return;
      const now = new Date();
      const jobs = await notifications.find({ 'delivery.channel': { $ne: 'notification' }, emailStatus: { $in: ['pending', 'failed', 'unconfigured', 'sending'] }, attempts: { $lt: 5 }, nextAttemptAt: { $lte: now }, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }] }).sort({ createdAt: 1 }).limit(10).lean();
      for (const job of jobs) {
        const leaseId = crypto.randomUUID();
        const claimed = await notifications.findOneAndUpdate({ _id: job._id, attempts: job.attempts, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }] }, { $set: { leaseId, leaseUntil: new Date(Date.now() + 120000), emailStatus: 'sending' }, $inc: { attempts: 1 } }, { new: true }).lean();
        if (!claimed) continue;
        const currentRecipients = (await actors()).filter(actor => actor.email === job.recipientEmail);
        let recipientAllowed;
        if (job.kind === 'message') {
          // Administrators explicitly address these messages, including external email recipients.
          recipientAllowed = true;
        } else if (job.kind === 'configuration') {
          const currentDefinition = await definitions.findOne({ type: job.requestRef }).lean();
          recipientAllowed = currentRecipients.some(actor => actor.admin || currentDefinition?.config.stages.some(stage => stage.roles.some(role => actor.assignments.some(item => item.role === role))));
        } else {
          const currentRequest = await modelFor(job.kind).findOne(filterFor(job.kind, job.requestRef)).lean();
          recipientAllowed = !!currentRequest && [...currentRecipients, { email: job.recipientEmail, assignments: [] }].some(actor => P.mayView(actor, currentRequest));
        }
        if (!recipientAllowed) {
          await transaction(async session => {
            await notifications.updateOne({ _id: job._id, leaseId }, { $set: { emailStatus: 'failed', leaseUntil: null, attempts: 5, errorCode: 'RECIPIENT_ACCESS_REVOKED' } }).session(session);
            await audit({ email: 'system', role: 'email_worker' }, 'email_cancelled', 'notification', job, { recipient: job.recipientEmail, reason: 'RECIPIENT_ACCESS_REVOKED' }, session);
          });
          continue;
        }
        try {
          const delivery = await sender.sendMail({ from: env.EMAIL_FROM, to: job.recipientEmail, subject: 'MIU Clubs: ' + job.title, text: job.message + (job.kind === 'message' && job.delivery?.channel === 'email' ? '' : '\n\n' + new URL(job.link, origin).toString()), messageId: `<workflow-${job.eventKey}@miu-clubs.local>` });
          if (delivery.rejected?.length || Array.isArray(delivery.accepted) && !delivery.accepted.length) throw new Error('EMAIL_REJECTED');
          await transaction(async session => {
            await notifications.updateOne({ _id: job._id, leaseId }, { $set: { emailStatus: 'sent', leaseUntil: null, errorCode: '', providerMessageId: delivery.messageId || '' } }).session(session);
            await audit({ email: 'system', role: 'email_worker' }, 'email_sent', 'notification', job, { recipient: job.recipientEmail, requestRef: job.requestRef, attempt: claimed.attempts }, session);
          });
        } catch {
          await transaction(async session => {
            await notifications.updateOne({ _id: job._id, leaseId }, { $set: { emailStatus: 'failed', leaseUntil: null, errorCode: 'EMAIL_DELIVERY_FAILED', nextAttemptAt: new Date(Date.now() + 60000 * 2 ** claimed.attempts) } }).session(session);
            await audit({ email: 'system', role: 'email_worker' }, 'email_failed', 'notification', job, { recipient: job.recipientEmail, requestRef: job.requestRef, attempt: claimed.attempts, errorCode: 'EMAIL_DELIVERY_FAILED' }, session);
          });
        }
      }
    } catch (error) { console.error('Workflow email queue unavailable:', error.name); }
    finally { delivering = false; }
  }
  return { modelFor, filterFor, definition, actors, eligible, request, transaction, submitNew, createNew, decide, resubmit, saveDefinition, deliver, notifications, definitions, customRoles, messageRecipients, sendMessage, reconcile };
}
module.exports = { createWorkflowEngine };
