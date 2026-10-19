const assert = require('node:assert/strict');
const P = require('../../services/workflow-policy');
exports.install = app => {
  const config = P.defaults('event');
  const state = { saves: [], corrections: [], messages: [], blocked: [{ kind: 'content', id: '900', title: 'Waiting event', clubName: 'QA Club', type: 'event', stage: 'Supervisor review', blocked: { reason: 'insufficient_eligible_reviewers', missingRoles: ['supervisor'], assignedEmails: [] } }], config, revision: 2, status: 'changes_requested' };
  app.get('/api/workflow/context', (req, res) => res.json({ admin: false }));
  app.get('/api/admin/workflows', (req, res) => {
    const custom = state.customRoleState?.roles || [];
    res.json({ definitions: [{ type: 'event', version: 1, config: state.config }], roles: [...P.roles, ...custom.map(role => role.key)], roleLabels: Object.fromEntries(custom.map(role => [role.key, role.name])), rolePermissions: Object.fromEntries(custom.map(role => [role.key, role.permissions])), roleTypes: Object.fromEntries(custom.map(role => [role.key, role.requestTypes])), actions: P.actions, fields: { event: P.descriptors('event') } });
  });
  app.put('/api/admin/workflows/event', (req, res) => {
    try { state.config = P.validateDefinition(req.body.config, 'event', state.customRoleState?.roles || []); state.saves.push(req.body); res.json({ type: 'event', config: state.config, version: 2 }); }
    catch (error) { res.status(error.status || 500).json({ message: error.message }); }
  });
  app.get('/api/workflow/requests', (req, res) => res.json({ total: 0, page: 1, items: [], filters: { clubs: [{ id: '7', name: 'MUN' }], stages: [{ id: 'supervisor', name: 'Supervisor review' }] } }));
  app.get('/api/admin/workflows/blocked', (req, res) => {
    const items = state.blocked.map(item => ({ ...item, key: item.key || `${item.kind}:${item.id}:${item.stage}` }));
    const summary = { total: items.length, keys: items.map(item => item.key) };
    res.json(req.query.summary === '1' ? summary : { ...summary, page: 1, items });
  });
  app.get('/api/admin/workflows/message-recipients', (req, res) => res.json({ recipients: [{ email: 'reviewer@example.test', roles: ['pr'], canNotify: true }] }));
  app.post('/api/admin/workflows/messages', (req, res) => {
    if (req.body.channel !== 'email' && req.body.email !== 'reviewer@example.test') return res.status(422).json({ message: 'Choose Email for this address.' });
    state.messages.push(req.body);
    res.status(202).json({ id: '012345678901234567890123', channel: req.body.channel, emailStatus: req.body.channel === 'notification' ? null : 'pending' });
  });
  app.get(['/api/admin/workflows/notifications', '/api/workflow/notifications'], (req, res) => res.json(state.messages.map((item, index) => ({ _id: String(index).padStart(24, '0'), kind: 'message', recipientEmail: item.email, title: item.title, message: item.message, delivery: { channel: item.channel }, emailStatus: item.channel === 'notification' ? null : 'pending', createdAt: new Date().toISOString() }))));
  const values = { title: 'English revision test', description: 'Original description', date: '2030-10-20', time: '10:00', endTime: '12:00', location: 'Main hall' };
  const record = () => ({ ...values, type: 'event', workflow: { revisionFields: ['description'] } });
  const adminConfig = P.defaults('event');
  adminConfig.stages[2].roles = ['english', 'security'];
  adminConfig.stages[2].permissions.security = ['comment', 'history'];
  state.adminReviews = []; state.adminRevision = 1; state.adminStatus = 'review';
  app.get('/api/workflow/requests/content/901', (req, res) => res.json({ kind: 'content', id: '901', title: 'Administrator role review', clubName: 'QA Club', fields: P.descriptors('event'), values, actions: state.adminStatus === 'review' ? ['approve', 'reject', 'request_changes', 'comment'] : [], adminReviewRoles: state.adminStatus === 'review' ? [{ id: 'english', actions: ['approve', 'reject', 'request_changes', 'comment'] }, { id: 'security', actions: ['comment'] }] : [], canResubmit: false, eligibleReviewers: [], workflow: { state: state.adminStatus, definition: adminConfig, definitionVersion: 1, revision: state.adminRevision, stageId: 'english', approvals: [], revisionFields: [], fieldComments: {}, blocked: { reason: 'no_reviewers', missingRoles: ['english'], assignedEmails: [] }, history: state.adminReviews.map(item => ({ action: item.action, actorEmail: 'admin@example.test', actorRole: 'admin', onBehalfOfRole: item.reviewRole, at: new Date().toISOString(), stageId: 'english', comment: item.comment })) } }));
  app.post('/api/workflow/requests/content/901/decision', (req, res) => {
    if (req.body.revision !== state.adminRevision || !['english', 'security'].includes(req.body.reviewRole)) return res.status(409).json({ message: 'Refresh the request.' });
    if (req.body.reviewRole === 'security' && req.body.action !== 'comment') return res.status(403).json({ message: 'Action not enabled.' });
    state.adminReviews.push(req.body); state.adminRevision++;
    if (req.body.action === 'approve') state.adminStatus = 'approved';
    res.json({ saved: true });
  });
  app.get('/api/workflow/requests/content/900', (req, res) => res.json({ kind: 'content', id: '900', title: values.title, clubName: 'QA Club', fields: P.descriptors('event'), values, actions: [], canResubmit: state.status === 'changes_requested', workflow: { state: state.status, definition: config, definitionVersion: 1, revision: state.revision, stageId: 'english', revisionFields: ['description'], fieldComments: { description: 'Correct the English grammar.' }, history: [{ action: 'changes_requested', actorEmail: 'reviewer@example.test', at: new Date().toISOString(), comment: 'English only.', fields: ['description'] }] } }));
  app.post('/api/workflow/requests/content/900/resubmit', (req, res) => {
    try { assert.equal(req.body.revision, state.revision); const patch = P.revisionPatch(record(), req.body.changes); state.corrections.push(req.body); Object.assign(values, patch); state.revision++; state.status = 'review'; res.json({ ok: true }); }
    catch (error) { res.status(error.status || 409).json({ message: error.message }); }
  });
  return state;
};
exports.run = async ({ cdp, origin, until, screenshot, state, emitUpdate }) => {
  await cdp.send('Page.navigate', { url: origin + '/admin/workflows' });
  await until("document.querySelectorAll('[data-stage]').length===4");
  await until("document.querySelector('.v2-sidebar [data-blocked-badge]').dataset.badgeState==='new'");
  assert.equal(await cdp.evaluate("document.querySelector('.v2-sidebar [data-blocked-badge]').textContent"), '1');
  await until("document.querySelector('[data-workflow-board] select[name=clubId]').options.length===2");
  assert.equal(await cdp.evaluate("document.querySelector('[data-workflow-board] select[name=clubId]').options[1].textContent"), 'MUN');
  assert.equal(await cdp.evaluate("document.querySelector('[data-workflow-board] select[name=stage]').options[1].textContent"), 'Supervisor review');
  await cdp.evaluate("document.querySelector('[data-workflow-board] select[name=clubId]').value='7'; document.querySelector('[data-workflow-board] select[name=stage]').value='supervisor'; document.querySelector('[data-workflow-board] form').requestSubmit()");
  await until("document.querySelector('[data-workflow-board] [data-workflow-feedback]').textContent.includes('Page 1')");
  assert.equal(await cdp.evaluate("document.querySelector('[data-workflow-board] select[name=clubId]').value"), '7');
  assert.equal(await cdp.evaluate("document.querySelector('[data-workflow-board] select[name=stage]').value"), 'supervisor');
  assert.equal(await cdp.evaluate("document.querySelectorAll('[data-stage][open]').length"), 1, 'Only the first stage is expanded');
  assert.equal(await cdp.evaluate("document.querySelector('[data-advanced-settings]').open"), false, 'Advanced controls start collapsed');
  assert.equal(await cdp.evaluate("document.querySelector('[data-stage] [data-correction-settings]').open"), false, 'Correction fields start collapsed');
  const expected = structuredClone(state.config); expected.stages[0].name = 'Initial supervisor review';
  await cdp.evaluate("document.querySelector('[data-stage] input[name=roles][value=english]').click()");
  assert.equal(await cdp.evaluate("document.querySelector('[data-stage] [data-permission-role=english]').hidden"), false, 'Permissions appear for selected roles');
  await cdp.evaluate("document.querySelector('[data-stage] input[name=roles][value=english]').click()");
  await cdp.evaluate("document.querySelector('[data-stage] [name=name]').value='Initial supervisor review'; document.querySelector('[data-workflow-editor] form').requestSubmit()");
  await until("document.querySelector('[data-workflow-editor] [data-workflow-feedback]').textContent.includes('Workflow saved')");
  assert.equal(state.saves.length, 1); assert.equal(state.config.stages[0].name, 'Initial supervisor review');
  assert.deepEqual(state.config, expected, 'Saving retains every collapsed stage, permission, field and routing rule');
  await until("document.querySelector('#workflow-message-recipients option')");
  await cdp.evaluate("(()=>{const f=document.querySelector('[data-workflow-message]'); f.elements.email.value='external@example.test'; f.elements.title.value='Meeting reminder'; f.elements.message.value='Hello <b>team</b>\\nPlease join us.'; f.requestSubmit();})()");
  await until("document.querySelector('[data-workflow-message] [role=status]').textContent.includes('queued')");
  assert.equal(state.messages.length, 1); assert.equal(state.messages[0].channel, 'email');
  assert.match(state.messages[0].requestId, /^[a-f0-9-]{36}$/);
  assert.equal(await cdp.evaluate("document.querySelector('[data-workflow-notifications] .workflow-message-body').textContent"), 'Hello <b>team</b>\nPlease join us.');
  assert.equal(await cdp.evaluate("document.querySelector('[data-workflow-notifications] .workflow-message-body b')"), null, 'Message content is escaped');
  await cdp.evaluate("(()=>{const f=document.querySelector('[data-workflow-message]'); f.elements.email.value='external@example.test'; f.elements.channel.value='both'; f.elements.title.value='Another reminder'; f.elements.message.value='Private message'; f.requestSubmit();})()");
  await until("document.querySelector('[data-workflow-message] [role=status]').textContent.includes('Choose Email')");
  assert.equal(state.messages.length, 1, 'External recipients cannot receive site notifications');
  await cdp.evaluate("(()=>{const f=document.querySelector('[data-workflow-message]'); f.elements.email.value='reviewer@example.test'; f.requestSubmit();})()");
  await until("document.querySelector('[data-workflow-message] [role=status]').textContent.includes('available now')");
  assert.equal(state.messages.length, 2); assert.equal(state.messages[1].channel, 'both');
  assert.notEqual(state.messages[0].requestId, state.messages[1].requestId, 'A new message gets a new submission ID');
  await until("!document.documentElement.classList.contains('site-startup-pending')");
  for (const theme of ['light', 'dark']) for (const width of [1440, 375]) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 });
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `Stage editor fits ${width}px`);
    await cdp.evaluate("document.querySelector('[data-stage]').scrollIntoView({behavior:'instant',block:'start'})");
    await screenshot(`workflow-admin-${theme}-${width}`);
    await cdp.evaluate("document.querySelector('[data-workflow-message]').scrollIntoView({behavior:'instant',block:'center'})");
    assert.equal(await cdp.evaluate("(()=>{const f=document.querySelector('[data-workflow-message]');return [...f.querySelectorAll('input,select,textarea,button')].every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})})()"), true, `Message form fits ${width}px`);
    await screenshot(`workflow-message-${theme}-${width}`);
  }
  await cdp.send('Page.navigate', { url: origin + '/admin/blocked-requests' });
  await until("document.querySelector('[data-blocked-results] .workflow-row')");
  await until("document.querySelector('.v2-sidebar [data-blocked-badge]').dataset.badgeState==='pending'");
  assert.ok(await cdp.evaluate("!!document.querySelector('a[href=\"/admin/blocked-requests\"]')"), 'Blocked requests appear in admin navigation');
  assert.equal(await cdp.evaluate("document.querySelector('[data-blocked-results] .workflow-row strong').textContent"), 'Waiting event');
  for (const theme of ['light', 'dark']) for (const width of [1440, 375]) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 });
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `Blocked inbox fits ${width}px`);
    await screenshot(`workflow-blocked-${theme}-${width}`);
  }
  state.blocked.push({ ...state.blocked[0], id: '902', title: 'New blocked request' });
  emitUpdate(['blocked-requests']);
  await until("document.querySelector('.v2-sidebar [data-blocked-badge]').dataset.badgeState==='new' && document.querySelector('.v2-sidebar [data-blocked-badge]').textContent==='2'");
  await until("document.querySelectorAll('[data-blocked-results] .workflow-row').length===2");
  assert.equal(await cdp.evaluate("document.querySelector('.v2-sidebar [data-blocked-badge]').dataset.badgeState"), 'new', 'Automatic inbox refresh does not mark a new request as viewed');
  await cdp.evaluate("document.querySelector('[data-workflow-action=refresh-blocked]').click()");
  await until("document.querySelector('.v2-sidebar [data-blocked-badge]').dataset.badgeState==='pending'");
  await cdp.send('Page.navigate', { url: origin + '/admin/workflows' });
  await until("document.querySelector('.v2-sidebar [data-blocked-badge]')?.dataset.badgeState==='pending' && document.querySelector('.v2-sidebar [data-blocked-badge]').textContent==='2'");
  await cdp.send('Page.navigate', { url: origin + '/admin/blocked-requests' });
  await until("document.querySelector('[data-workflow-action=refresh-blocked]') && document.querySelector('.v2-sidebar [data-blocked-badge]')?.dataset.badgeState==='pending'");
  state.blocked = [];
  await cdp.evaluate("document.querySelector('[data-workflow-action=refresh-blocked]').click()");
  await until("document.querySelector('[data-blocked-results]').textContent.includes('No requests')");
  await until("document.querySelector('.v2-sidebar [data-blocked-badge]').hidden");
  assert.equal(await cdp.evaluate("document.querySelector('[data-workflow-action=blocked-next]').disabled"), true);
  await cdp.send('Page.navigate', { url: origin + '/pages/workflow.html?kind=content&id=901' });
  await until("document.querySelector('[name=reviewRole]')");
  assert.equal(await cdp.evaluate("document.querySelector('[data-field=description]').value"), 'Original description');
  await cdp.evaluate("document.querySelector('[name=reviewRole]').value='security'; document.querySelector('[name=reviewRole]').dispatchEvent(new Event('change'))");
  assert.equal(await cdp.evaluate("document.querySelector('[data-workflow-action=approve]').hidden"), true, 'Role permissions control the admin review buttons');
  await cdp.evaluate("document.querySelector('[name=comment]').value='Admin note'; document.querySelector('[data-workflow-action=comment]').click()");
  await until("document.querySelector('.workflow-history').textContent.includes('Administrator on behalf of Security')");
  assert.equal(state.adminReviews[0].reviewRole, 'security'); assert.equal(state.adminReviews[0].action, 'comment');
  for (const theme of ['light', 'dark']) for (const width of [1440, 375]) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 });
    await cdp.evaluate("document.querySelector('[data-workflow-decision]').scrollIntoView({behavior:'instant',block:'center'})");
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `Admin review fits ${width}px`);
    await screenshot(`workflow-admin-review-${theme}-${width}`);
  }
  await cdp.evaluate("document.querySelector('[name=reviewRole]').value='english'; document.querySelector('[name=reviewRole]').dispatchEvent(new Event('change')); document.querySelector('[name=comment]').value='Approved by administrator'; document.querySelector('[data-workflow-action=approve]').click()");
  await until("document.querySelector('.workflow-badge').textContent==='approved'");
  assert.equal(state.adminReviews[1].reviewRole, 'english'); assert.equal(state.adminReviews[1].action, 'approve');
  await cdp.send('Page.navigate', { url: origin + '/pages/workflow.html?kind=content&id=900' });
  await until("!!document.querySelector('[data-field=description]')");
  assert.equal(await cdp.evaluate("!document.querySelector('[data-field=description]').readOnly"), true);
  for (const field of ['date', 'time', 'location', 'title']) assert.equal(await cdp.evaluate(`document.querySelector('[data-field=${field}]').readOnly`), true, `${field} is locked`);
  assert.equal(await cdp.evaluate("document.querySelector('.workflow-instruction').textContent"), 'Correct the English grammar.');
  for (const theme of ['light', 'dark']) for (const width of [1440, 375]) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 });
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `Correction form fits ${width}px`);
    await screenshot(`workflow-revision-${theme}-${width}`);
  }
  await cdp.evaluate("document.querySelector('[data-field=description]').value='Corrected English description'; document.querySelector('[data-workflow-revision]').requestSubmit()");
  await until("document.querySelector('.workflow-badge').textContent==='review'");
  assert.deepEqual(state.corrections[0].changes, { description: 'Corrected English description' });
};
