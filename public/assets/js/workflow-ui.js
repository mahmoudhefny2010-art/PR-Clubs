(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value]));
  const $ = (host, selector) => host.querySelector(selector);
  const request = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'The operation could not be confirmed. Refresh and try again.');
    return data;
  };
  const button = (text, action, secondary = true) => `<button type="button" class="${secondary ? 'secondary-btn' : 'primary-btn'}" data-workflow-action="${action}">${escape(text)}</button>`;
  const options = (items, selected) => items.map(item => `<option value="${escape(item.id ?? item)}"${(item.id ?? item) === selected ? ' selected' : ''}>${escape(item.name ?? item)}</option>`).join('');
  const checks = (items, selected, name) => `<div class="workflow-checks">${items.map(item => `<label><input type="checkbox" name="${escape(name)}" value="${escape(item.id ?? item)}"${selected.includes(item.id ?? item) ? ' checked' : ''}>${escape(item.label ?? item)}</label>`).join('')}</div>`;
  const selected = (host, name) => [...host.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
  const roleLabels = { admin: 'Admin', software_development: 'Developer', president: 'President', vice_president: 'Vice president', head: 'Committee head', supervisor: 'Supervisor', pr: 'PR', english: 'English', security: 'Security', sso: 'SSO', dean: 'Dean', miu_events: 'MIU Events' };
  const actionLabels = { approve: 'Approve', reject: 'Reject', request_changes: 'Request corrections', comment: 'Add comments', forward: 'Escalate', assign: 'Assign reviewers', history: 'View history', view_all: 'View all in scope' };
  const notify = (host, message, error = false) => { const box = $(host, '[data-workflow-feedback]'); if (box) { box.textContent = message; box.classList.toggle('workflow-error', error); } };
  const blockedReason = blocked => blocked.reason === 'no_reviewers' ? 'No eligible reviewers are available. An administrator can review on behalf of this role, or assign staff.' : blocked.assignedEmails?.length ? 'The assigned reviewers cannot complete this stage. An administrator can review on behalf of the role, or reassign reviewers.' : 'Not enough eligible reviewers for this request. An administrator can review on behalf of the required role, or repair staff assignments.';
  async function blockedRequests(host) {
    host.innerHTML = `<section class="workflow-panel"><div class="workflow-section-heading"><h2>Blocked approval requests</h2>${button('Refresh', 'refresh-blocked')}</div><p class="workflow-note">Requests stay at their current stage when reviewers are unavailable. Open a request to review on behalf of its role using the same review form, or manage staff assignments.</p><div class="workflow-actions"><a class="secondary-btn" href="/admin/staff">Manage staff</a><a class="secondary-btn" href="/admin/custom-roles">Manage roles</a></div><p data-workflow-feedback role="status" aria-live="polite"></p><div data-blocked-results></div><div class="workflow-actions">${button('Previous page', 'blocked-previous')}${button('Next page', 'blocked-next')}</div></section>`;
    let page = 1, busy = false;
    const previous = $(host, '[data-workflow-action=blocked-previous]'), next = $(host, '[data-workflow-action=blocked-next]'), refresh = $(host, '[data-workflow-action=refresh-blocked]');
    const load = async (markSeen = false) => {
      if (busy) return; busy = true;
      previous.disabled = next.disabled = refresh.disabled = true;
      notify(host, 'Checking reviewer availability…');
      try {
        let data = await request('/api/admin/workflows/blocked?page=' + page);
        if (!data.items.length && page > 1) { page = Math.max(1, Math.ceil(data.total / 50)); data = await request('/api/admin/workflows/blocked?page=' + page); }
        $(host, '[data-blocked-results]').innerHTML = data.items.map(item => `<article class="workflow-row"><div><strong>${escape(item.title)}</strong><p>${escape(item.clubName || 'MIU')} · ${escape(item.type)} · ${escape(item.stage)}</p><span class="workflow-badge">Waiting for reviewers</span><p>${escape(blockedReason(item.blocked))}</p>${item.blocked.missingRoles?.length ? `<p class="workflow-note">Roles: ${escape(item.blocked.missingRoles.map(role => roleLabels[role] || role).join(', '))}</p>` : ''}${item.blocked.assignedEmails?.length ? `<p class="workflow-note">Assigned: ${escape(item.blocked.assignedEmails.join(', '))}</p>` : ''}</div><a class="primary-btn" href="/pages/workflow.html?kind=${escape(item.kind)}&id=${escape(item.id)}">Open request</a></article>`).join('') || '<p>No requests are waiting for reviewers.</p>';
        notify(host, `${data.total} blocked requests · Page ${page}`);
        document.dispatchEvent(new CustomEvent('miu:blocked-inbox-loaded', { detail: { keys: data.keys || data.items.map(item => item.key), total: data.total, markSeen } }));
        previous.disabled = page <= 1; next.disabled = page * 50 >= data.total;
      } catch (error) { notify(host, error.message, true); }
      finally { busy = false; refresh.disabled = false; }
    };
    previous.onclick = () => { if (!busy && page > 1) { page--; void load(true); } };
    next.onclick = () => { if (!busy) { page++; void load(true); } };
    refresh.onclick = () => void load(true);
    await load();
  }
  async function messageComposer(host, refresh) {
    host.innerHTML = `<div class="workflow-section-heading"><h2>Send a message</h2><span class="workflow-badge">Direct message</span></div><p class="workflow-note">Email any address, or notify a registered staff member inside the site.</p><form data-workflow-message><div class="workflow-grid"><label>Recipient email<input name="email" type="email" required maxlength="254" list="workflow-message-recipients" placeholder="name@example.com" autocomplete="off"><datalist id="workflow-message-recipients"></datalist></label><label>Send via<select name="channel"><option value="email">Email</option><option value="notification">In-app notification</option><option value="both">Email and in-app notification</option></select></label></div><p class="workflow-note" data-message-channel-hint>Emails can be sent to any valid address.</p><label>Subject<input name="title" required maxlength="160" placeholder="Message subject"></label><label>Message<textarea name="message" required maxlength="5000" rows="5" placeholder="Write your message"></textarea></label><div class="workflow-actions"><button class="primary-btn" type="submit">Send message</button><span class="workflow-note">One recipient per message.</span></div><p data-workflow-feedback role="status" aria-live="polite"></p></form>`;
    const form = $(host, 'form'), channel = $(form, '[name=channel]');
    let recipients = [], requestId = crypto.randomUUID();
    channel.onchange = () => { $(form, '[data-message-channel-hint]').textContent = channel.value === 'email' ? 'Emails can be sent to any valid address.' : 'In-app notifications require a registered staff account with notification access.'; };
    try {
      const data = await request('/api/admin/workflows/message-recipients'); recipients = data.recipients;
      $(form, 'datalist').innerHTML = recipients.map(item => `<option value="${escape(item.email)}">${escape(item.roles.map(role => roleLabels[role] || role).join(', '))}</option>`).join('');
    } catch { /* Email entry remains available when suggestions cannot load. */ }
    form.onsubmit = async event => {
      event.preventDefault();
      const submit = $(form, '[type=submit]'); if (submit.disabled) return;
      const payload = Object.fromEntries(new FormData(form)); payload.requestId = requestId;
      if (payload.channel !== 'email' && recipients.length && !recipients.some(item => item.email === payload.email.trim().toLowerCase() && item.canNotify)) { notify(form, 'Choose Email for this address. In-app notifications require a registered staff account with notification access.', true); return; }
      submit.disabled = true; notify(form, 'Submitting message…');
      try {
        const result = await request('/api/admin/workflows/messages', { method: 'POST', body: JSON.stringify(payload) });
        form.reset(); requestId = crypto.randomUUID(); channel.onchange();
        notify(form, result.channel === 'notification' ? 'In-app notification saved for the recipient.' : result.emailStatus === 'unconfigured' ? `Message saved. Email delivery is waiting for email configuration.${result.channel === 'both' ? ' The in-app notification is available now.' : ''}` : `Email queued for delivery.${result.channel === 'both' ? ' The in-app notification is available now.' : ''}`);
        try { await refresh(); } catch { /* Preserve the successful send result if refreshing the delivery list fails. */ }
      } catch (error) { notify(form, error.message, true); }
      finally { submit.disabled = false; }
    };
  }
  async function notifications(host, admin = false) {
    const items = await request(admin ? '/api/admin/workflows/notifications' : '/api/workflow/notifications');
    host.innerHTML = `<h2>Notifications and delivery</h2>${items.length ? items.map(item => `<article class="workflow-row"><div><strong>${escape(item.title)}</strong><p class="workflow-message-body">${escape(item.message)}</p><small>${escape(admin ? item.recipientEmail + ' · ' : '')}${escape(item.delivery?.channel === 'notification' ? 'In-app notification' : 'Email: ' + item.emailStatus)}${item.delivery?.channel === 'both' ? ' · In-app notification available' : ''} · ${escape(new Date(item.createdAt).toLocaleString())}</small></div><div class="workflow-actions">${item.kind === 'message' ? '' : `<a class="secondary-btn" href="${escape(item.link)}">Open request</a>`}${item.readAt || admin ? '' : button('Mark read', 'read-' + item._id)}${item.delivery?.channel !== 'notification' && ['failed', 'unconfigured'].includes(item.emailStatus) ? button('Retry email', 'retry-' + item._id) : ''}</div></article>`).join('') : '<p>No notifications yet.</p>'}`;
    host.onclick = async event => {
      const target = event.target.closest('[data-workflow-action]'); if (!target) return;
      const [action, id] = target.dataset.workflowAction.split('-'); target.disabled = true;
      try { await request(`/api/workflow/notifications/${id}/${action}`, { method: 'POST', body: '{}' }); await notifications(host, admin); }
      catch (error) { target.textContent = error.message; target.disabled = false; }
    };
  }
  async function board(host, context = {}) {
    host.innerHTML = `<section class="workflow-panel"><h2>Approval requests</h2><form class="workflow-toolbar"><label>Status<select name="state">${options([{id:'',name:'All statuses'},{id:'new',name:'New requests'},{id:'review',name:'Awaiting review'},{id:'changes_requested',name:'Awaiting corrections'},{id:'resubmitted',name:'Resubmitted'},{id:'approved',name:'Approved'},{id:'rejected',name:'Rejected'}], '')}</select></label><label>Type<select name="type">${options([{id:'',name:'All types'},{id:'event',name:'Events'},{id:'feed',name:'Feed posts'},{id:'sponsor',name:'Sponsors'},{id:'booth',name:'Booths'},{id:'entry_permit',name:'Entry permits'},{id:'speaker',name:'Club speakers'},{id:'speaker_miu',name:'MIU speakers'},{id:'speaker_public',name:'External speakers'}], '')}</select></label><label>Club<select name="clubId"><option value="">All clubs</option></select></label><label>Review stage<select name="stage"><option value="">All stages</option></select></label><label>Assigned reviewer<input name="reviewer" type="email"></label><button class="secondary-btn">Apply filters</button></form><p data-workflow-feedback role="status"></p><div data-workflow-results></div><div class="workflow-actions">${button('Previous page', 'previous')}${button('Next page', 'next')}</div></section><section class="workflow-panel" data-workflow-notifications></section>`;
    let page = 1;
    if (Array.isArray(context.types)) for (const option of [...$(host, 'select[name=type]').options]) if (option.value && !context.types.includes(option.value)) option.remove();
    const load = async () => {
      notify(host, 'Loading requests…');
      try {
        const params = new URLSearchParams(new FormData($(host, 'form'))); params.set('page', page);
        const data = await request('/api/workflow/requests?' + params);
        for (const [name, items, label] of [['clubId', data.filters?.clubs, 'All clubs'], ['stage', data.filters?.stages, 'All stages']]) {
          if (!Array.isArray(items)) continue;
          const select = $(host, `select[name="${name}"]`), value = select.value;
          select.innerHTML = options([{ id: '', name: label }, ...items], value);
        }
        $(host, '[data-workflow-results]').innerHTML = data.items.map(item => `<article class="workflow-row"><div><strong>${escape(item.title)}</strong><p>${escape(item.clubName)} · ${escape(item.type)} · ${escape(item.stage)}</p><span class="workflow-badge">${escape(item.state.replaceAll('_', ' '))}${item.resubmitted ? ' · Resubmitted' : ''}</span><p class="workflow-note">${escape(item.roles.join(', '))}${item.assignedEmails.length ? ' · ' + escape(item.assignedEmails.join(', ')) : ''}</p></div><a class="primary-btn" href="/pages/workflow.html?kind=${item.kind}&id=${escape(item.id)}">Open request</a></article>`).join('') || '<p>No requests match these filters.</p>';
        notify(host, `${data.total} requests · Page ${page}`);
        $(host, '[data-workflow-action=previous]').disabled = page <= 1;
        $(host, '[data-workflow-action=next]').disabled = page * 50 >= data.total;
      } catch (error) { notify(host, error.message, true); }
    };
    $(host, 'form').onsubmit = event => { event.preventDefault(); page = 1; void load(); };
    $(host, '[data-workflow-action=previous]').onclick = () => { page--; void load(); };
    $(host, '[data-workflow-action=next]').onclick = () => { page++; void load(); };
    const notificationHost = $(host, '[data-workflow-notifications]');
    let composer;
    if (context.admin) { composer = document.createElement('section'); composer.className = 'workflow-panel workflow-message-composer'; notificationHost.before(composer); }
    const showNotifications = context.embedNotifications !== false && (!context.modules || context.modules.includes('notifications'));
    if (!showNotifications) notificationHost.remove();
    await Promise.all([load(), ...(showNotifications ? [notifications(notificationHost, !!context.admin)] : []), ...(composer ? [messageComposer(composer, () => showNotifications ? notifications(notificationHost, true) : Promise.resolve())] : [])]);
  }
  async function mountAdmin(host) {
    const data = await request('/api/admin/workflows');
    Object.assign(roleLabels, data.roleLabels || {});
    host.innerHTML = `<section class="workflow-panel"><h2>Workflow configuration</h2><p class="workflow-note">Saved changes apply to new requests.</p><label>Request type<select data-workflow-type>${options(data.definitions.map(row => ({ id: row.type, name: row.config.name })), data.definitions[0].type)}</select></label><div data-workflow-editor></div></section><div data-workflow-board></div>`;
    const editor = $(host, '[data-workflow-editor]');
    let row;
    function render(revealId) {
      const config = row.config;
      const existing = editor.querySelector('[data-stage]');
      const expanded = new Set(existing ? [...editor.querySelectorAll('[data-stage][open]')].map(section => section.dataset.stage) : [config.stages[0]?.id]);
      if (revealId) expanded.add(revealId);
      const roles = data.roles.filter(id => !data.roleTypes?.[id] || data.roleTypes[id].includes(row.type)).map(id => ({ id, label: roleLabels[id] || id }));
      const permissions = data.actions.map(id => ({ id, label: actionLabels[id] || id }));
      editor.innerHTML = `<form>
        <div class="workflow-grid"><label>Workflow name<input name="workflowName" required maxlength="120" value="${escape(config.name)}"></label><label>First stage<select name="start">${options(config.stages, config.start)}</select></label></div>
        <label class="workflow-toggle"><input name="workflowEnabled" type="checkbox"${config.enabled ? ' checked' : ''}> Accept new requests</label>
        <div class="workflow-section-heading"><h3>Review stages</h3><span class="workflow-note">Open a stage to edit it.</span></div>
        <div data-workflow-stages>${config.stages.map((stage, index) => `<details class="workflow-stage" data-stage="${escape(stage.id)}"${expanded.has(stage.id) ? ' open' : ''}>
          <summary class="workflow-stage-summary"><span class="workflow-step">${index + 1}</span><span class="workflow-stage-copy"><strong data-stage-title>${escape(stage.name)}</strong><small data-stage-route>${escape(stage.roles.map(role => roleLabels[role] || role).join(', '))} &rarr; ${escape(config.stages.find(item => item.id === stage.next)?.name || 'Final approval')}</small></span><span class="workflow-badge" data-stage-state>${stage.enabled ? 'Active' : 'Disabled'}</span></summary>
          <div class="workflow-stage-body">
            <div class="workflow-stage-tools"><label class="workflow-toggle"><input name="enabled" type="checkbox"${stage.enabled ? ' checked' : ''}> Stage enabled</label><div class="workflow-stage-order">${button('Move up', 'up-' + index)}${button('Move down', 'down-' + index)}${button('Remove', 'remove-' + index)}</div></div>
            <div class="workflow-grid"><label>Stage name<input name="name" required maxlength="100" value="${escape(stage.name)}"></label><label>After approval<select name="next"><option value="">Final approval</option>${options(config.stages.filter(item => item.id !== stage.id), stage.next)}</select></label><label>After corrections<select name="resubmit">${options(config.stages, stage.resubmit)}</select></label><label>Approvals needed<select name="approvalRule">${options([{ id: 'any', name: 'One reviewer' }, { id: 'all_roles', name: 'One reviewer from each role' }], stage.approvalRule)}</select></label></div>
            <details class="workflow-settings" data-reviewer-settings><summary>Reviewers <span data-reviewer-summary>${escape(stage.roles.map(role => roleLabels[role] || role).join(', '))}</span></summary><p class="workflow-note">Choose existing roles below. <a href="/admin/custom-roles">Create roles & assign staff</a>.</p>${checks(roles, stage.roles, 'roles')}</details>
            <details class="workflow-settings" data-correction-settings><summary>Fields allowed for corrections <span data-correction-count>${stage.editableFields.length} selected</span></summary><p class="workflow-note">Reviewers can request changes to these fields. All other fields stay locked.</p>${checks(data.fields[row.type], stage.editableFields, 'editableFields')}</details>
            <details class="workflow-settings" data-advanced-settings><summary>Advanced settings</summary>
              <div class="workflow-advanced-options"><label class="workflow-toggle"><input name="commentOnApprove" type="checkbox"${stage.commentOnApprove ? ' checked' : ''}> Require an approval comment</label><label class="workflow-toggle"><input name="automatic" type="checkbox"${stage.automatic ? ' checked' : ''}> Forward automatically</label><label class="workflow-toggle"><input name="requireAllRevisions" type="checkbox"${stage.requireAllRevisions !== false ? ' checked' : ''}> Require every requested correction</label></div>
              <h4>Role permissions</h4><p class="workflow-note">Configure the selected reviewers.</p>
              <div data-role-permissions>${data.roles.map(role => `<details class="workflow-role-permissions" data-permission-role="${escape(role)}"${stage.roles.includes(role) ? '' : ' hidden'}><summary>${escape(roleLabels[role] || role)}</summary>${checks(permissions.filter(item => !data.rolePermissions?.[role] || data.rolePermissions[role].includes(item.id)), stage.permissions[role] || [], 'permissions-' + role)}</details>`).join('')}</div>
              <fieldset class="workflow-fieldset"><legend>Visible fields</legend>${checks(data.fields[row.type], stage.reviewFields || data.fields[row.type].map(field => field.id), 'reviewFields')}</fieldset>
              <fieldset class="workflow-fieldset"><legend>Escalation destinations</legend>${config.stages.length > 1 ? checks(config.stages.filter(item => item.id !== stage.id).map(item => ({ id: item.id, label: item.name })), stage.escalationTargets || [], 'escalationTargets') : '<p class="workflow-note">Add another stage to allow escalation.</p>'}</fieldset>
              <small class="workflow-note">Stage reference: ${escape(stage.id)}</small>
            </details>
          </div>
        </details>`).join('')}</div>
        <div class="workflow-save-row">${button('Add stage', 'add')}<button type="submit" class="primary-btn">Save workflow</button></div><p data-workflow-feedback role="status"></p>
      </form>`;
      const form = $(editor, 'form');
      const sections = [...editor.querySelectorAll('[data-stage]')];
      sections.forEach((section, index) => {
        $(section, `[data-workflow-action="up-${index}"]`).disabled = index === 0;
        $(section, `[data-workflow-action="down-${index}"]`).disabled = index === sections.length - 1;
        $(section, `[data-workflow-action="remove-${index}"]`).disabled = sections.length === 1;
      });
      const updateSummary = section => {
        $(section, '[data-stage-title]').textContent = $(section, '[name=name]').value || 'Untitled stage';
        const next = $(section, '[name=next]');
        $(section, '[data-stage-route]').textContent = selected(section, 'roles').map(role => roleLabels[role] || role).join(', ') + ' → ' + next.options[next.selectedIndex].textContent;
        $(section, '[data-stage-state]').textContent = $(section, '[name=enabled]').checked ? 'Active' : 'Disabled';
        $(section, '[data-reviewer-summary]').textContent = selected(section, 'roles').map(role => roleLabels[role] || role).join(', ') || 'Choose reviewers';
        $(section, '[data-correction-count]').textContent = selected(section, 'editableFields').length + ' selected';
        for (const permission of section.querySelectorAll('[data-permission-role]')) permission.hidden = !selected(section, 'roles').includes(permission.dataset.permissionRole);
      };
      form.addEventListener('input', event => { const section = event.target.closest('[data-stage]'); if (section) updateSummary(section); });
      form.addEventListener('change', event => {
        const section = event.target.closest('[data-stage]');
        if (!section) return;
        if (event.target.name === 'roles' && event.target.checked && data.rolePermissions?.[event.target.value]
          && !config.stages.find(stage => stage.id === section.dataset.stage).roles.includes(event.target.value)) {
          for (const input of section.querySelectorAll(`input[name="permissions-${event.target.value}"]`)) input.checked = data.rolePermissions[event.target.value].includes(input.value);
        }
        updateSummary(section);
      });

      form.onsubmit = async event => {
        event.preventDefault(); collect(); const submit = $(form, '[type=submit]'); submit.disabled = true; notify(editor, 'Saving…');
        try { row = await request('/api/admin/workflows/' + row.type, { method: 'PUT', body: JSON.stringify({ version: row.version, config: row.config }) }); const position = data.definitions.findIndex(item => item.type === row.type); data.definitions[position] = row; render(); notify(editor, 'Workflow saved. Existing requests retain their current workflow version.'); }
        catch (error) { notify(editor, error.message, true); submit.disabled = false; }
      };
      form.onclick = event => {
        const target = event.target.closest('[data-workflow-action]'); if (!target) return;
        collect(); const [action, value] = target.dataset.workflowAction.split('-'), index = Number(value), stages = row.config.stages;
        let revealId;
        if (action === 'add') {
          const id = 'stage_' + Date.now().toString(36); const last = stages[stages.length - 1]; if (last && !last.next) last.next = id;
          stages.push({ id, name: 'New review stage', roles: ['pr'], enabled: true, next: '', resubmit: id, approvalRule: 'any', permissions: { pr: ['approve', 'reject', 'request_changes', 'comment', 'history', 'view_all'] }, editableFields: data.fields[row.type].map(field => field.id), escalationTargets: [] });
          revealId = id;
        } else if (action === 'remove') { const removed = stages.splice(index, 1)[0]; stages.forEach(stage => { if (stage.resubmit === removed.id) stage.resubmit = stage.id; stage.escalationTargets = stage.escalationTargets.filter(id => id !== removed.id); }); }
        else if (action === 'up' && index > 0) [stages[index - 1], stages[index]] = [stages[index], stages[index - 1]];
        else if (action === 'down' && index < stages.length - 1) [stages[index + 1], stages[index]] = [stages[index], stages[index + 1]];
        if (['up', 'down', 'remove'].includes(action)) { stages.forEach((stage, index) => { stage.next = stages[index + 1]?.id || ''; }); row.config.start = stages[0]?.id || ''; }
        render(revealId);
      };
    }
    function collect() {
      row.config.name = $(editor, '[name=workflowName]').value; row.config.start = $(editor, '[name=start]').value; row.config.enabled = $(editor, '[name=workflowEnabled]').checked;
      row.config.stages = [...editor.querySelectorAll('[data-stage]')].map(section => ({
        id: section.dataset.stage, name: $(section, '[name=name]').value, enabled: $(section, '[name=enabled]').checked,
        next: $(section, '[name=next]').value, resubmit: $(section, '[name=resubmit]').value, approvalRule: $(section, '[name=approvalRule]').value,
        commentOnApprove: $(section, '[name=commentOnApprove]').checked, automatic: $(section, '[name=automatic]').checked,
        requireAllRevisions: $(section, '[name=requireAllRevisions]').checked,
        roles: selected(section, 'roles'), permissions: Object.fromEntries(data.roles.map(role => [role, selected(section, 'permissions-' + role)])),
        editableFields: selected(section, 'editableFields'), escalationTargets: selected(section, 'escalationTargets')
        , reviewFields: selected(section, 'reviewFields')
      }));
    }
    $(host, '[data-workflow-type]').onchange = event => { row = structuredClone(data.definitions.find(item => item.type === event.target.value)); render(); };
    row = structuredClone(data.definitions[0]); render(); await board($(host, '[data-workflow-board]'), { admin: true });
  }
  function fieldControl(field, value, editable) {
    const attributes = `data-field="${escape(field.id)}"${editable ? field.required ? ' required' : '' : ' readonly aria-readonly="true"'}${field.maxLength ? ` maxlength="${field.maxLength}"` : ''}`;
    if (field.kind === 'boolean') return `<input type="checkbox" data-field="${field.id}"${value ? ' checked' : ''}${editable ? '' : ' disabled'}>`;
    if (field.kind === 'audience') return `<select data-field="${field.id}"${editable ? '' : ' disabled'}>${options([{ id: 'members', name: 'Club members' }, { id: 'all_students', name: 'All students' }], value)}</select>`;
    if (['image', 'file', 'speaker_files'].includes(field.kind)) {
      const preview = field.kind === 'image' && typeof value === 'string' && /^(data:image\/(png|jpeg|jpg|webp|gif|avif);base64,|https:\/\/|\/(api\/public-club-media|assets)\/)/.test(value)
        ? `<img class="workflow-image" src="${escape(value)}" alt="${escape(field.label)}">` : '';
      const documents = field.kind === 'speaker_files' && Array.isArray(value) ? value.map((item, index) => `<button type="button" class="secondary-btn" data-workflow-download="${index}">${escape(item.name || 'Download attachment')}</button>`).join('')
        : field.kind === 'file' && typeof value === 'string' && /^data:application\//.test(value) ? `<a class="secondary-btn" href="${escape(value)}" download="supporting-document">Download supporting document</a>` : '';
      return `${preview}${documents}${editable ? `<input type="file" data-field="${field.id}"${field.kind === 'speaker_files' ? ' multiple' : ''} accept="${field.kind === 'image' ? 'image/png,image/jpeg,image/webp' : '.pdf,.doc,.docx,.ppt,.pptx'}">` : ''}<p class="workflow-note">${Array.isArray(value) ? escape(value.map(item => item.name).join(', ')) : value ? 'An attachment is saved with this request.' : 'No attachment.'}</p>`;
    }
    if (field.kind === 'permit') return `<div class="workflow-permit" data-field="${field.id}">${(Array.isArray(value) ? value : []).map(row => permitRow(row, editable)).join('')}${editable ? '<button class="secondary-btn" type="button" data-permit-add>Add item</button>' : ''}</div>`;
    if (field.kind === 'textarea') return `<textarea ${attributes}>${escape(value)}</textarea>`;
    return `<input ${attributes} type="${['date', 'time'].includes(field.kind) ? field.kind : 'text'}" value="${escape(value)}">`;
  }
  function permitRow(row = {}, editable = true) {
    return `<div class="workflow-permit-row"><input type="number" min="1" data-permit-quantity aria-label="Quantity" value="${escape(row.quantity || 1)}"${editable ? ' required' : ' readonly'}><input data-permit-number aria-label="Number or ID" maxlength="80" value="${escape(row.number || '')}"${editable ? ' required' : ' readonly'}><input data-permit-details aria-label="Item details" maxlength="1000" value="${escape(row.details || '')}"${editable ? ' required' : ' readonly'}>${editable ? '<button type="button" class="secondary-btn" data-permit-remove>Remove</button>' : ''}</div>`;
  }
  const fileData = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read the attachment.')); reader.readAsDataURL(file); });
  async function detail(host, kind, id) {
    const data = await request(`/api/workflow/requests/${kind}/${encodeURIComponent(id)}`), flow = data.workflow;
    const stage = flow.definition.stages.find(item => item.id === flow.stageId);
    const editable = data.canResubmit ? flow.revisionFields : [];
    host.innerHTML = `<section class="workflow-panel"><h2>${escape(data.title)}</h2><p>${escape(data.clubName)} · <span class="workflow-badge">${escape(flow.state.replaceAll('_', ' '))}</span> · ${escape(stage?.name || 'Completed')}</p><p class="workflow-note">Workflow version ${flow.definitionVersion} · Request revision ${flow.revision}</p><form data-workflow-revision><div class="workflow-grid">${data.fields.map(field => `<label class="${editable.includes(field.id) ? 'workflow-editable' : ''}">${escape(field.label)} <span class="workflow-locked">${editable.includes(field.id) ? 'Correction requested' : 'Read-only'}</span>${flow.fieldComments?.[field.id] ? `<span class="workflow-instruction">${escape(flow.fieldComments[field.id])}</span>` : ''}${fieldControl(field, data.values[field.id], editable.includes(field.id))}</label>`).join('')}</div>${data.canResubmit ? '<button class="primary-btn" type="submit">Resubmit corrections</button>' : ''}<p data-workflow-feedback role="status"></p></form></section>${data.actions.some(action => ['approve', 'reject', 'request_changes', 'comment', 'forward', 'assign'].includes(action)) ? `<section class="workflow-panel" data-workflow-decision><h2>Review decision</h2><label>Comment and instructions<textarea name="comment" maxlength="2000"></textarea></label>${data.actions.includes('request_changes') ? `<h3>Select fields to correct</h3>${checks(data.fields.filter(field => stage.editableFields.includes(field.id)), [], 'revisionFields')}<div>${data.fields.filter(field => stage.editableFields.includes(field.id)).map(field => `<label>${escape(field.label)} instructions<input data-field-comment="${field.id}" maxlength="2000"></label>`).join('')}</div>` : ''}${data.actions.includes('forward') ? `<label>Forward to<select name="target">${options(flow.definition.stages.filter(item => stage.escalationTargets.includes(item.id)), '')}</select></label>` : ''}${data.actions.includes('assign') ? `<h3>Assign reviewers</h3>${checks(data.eligibleReviewers, flow.assignedEmails || [], 'reviewerEmails')}` : ''}<div class="workflow-actions">${[['approve', 'Approve'], ['request_changes', 'Request changes'], ['reject', 'Reject'], ['comment', 'Add comment'], ['forward', 'Forward'], ['assign', 'Assign reviewers']].filter(([action]) => data.actions.includes(action)).map(([action, label]) => button(label, action, action !== 'approve')).join('')}</div><p data-workflow-feedback role="status"></p></section>` : ''}<section class="workflow-panel"><h2>Approval and revision history</h2><ol class="workflow-history">${flow.history.map(event => `<li><strong>${escape(event.action.replaceAll('_', ' '))}</strong> · ${escape(event.actorEmail)}<p>${escape(event.comment || '')}</p><small>${escape(event.stageId || '')} · ${escape(new Date(event.at).toLocaleString())}</small>${event.fields ? `<p>Fields: ${escape(event.fields.join(', '))}</p>` : ''}${event.before || event.values ? `<details><summary>Previous submitted values</summary><pre>${escape(historyValues(event.before || event.values))}</pre></details>` : ''}${event.after ? `<details><summary>Updated values</summary><pre>${escape(historyValues(event.after))}</pre></details>` : ''}</li>`).join('')}</ol></section>`;
    const form = $(host, '[data-workflow-revision]');
    if (flow.blocked) { const note = document.createElement('p'); note.className = 'workflow-instruction'; note.setAttribute('role', 'status'); note.textContent = blockedReason(flow.blocked); form.before(note); }
    for (const download of form.querySelectorAll('[data-workflow-download]')) download.onclick = async () => {
      download.disabled = true;
      try { const result = await request(`/api/workflow/requests/${kind}/${id}/attachments/${download.dataset.workflowDownload}`); window.location.assign(result.url); }
      catch (error) { notify(form, error.message, true); }
      finally { download.disabled = false; }
    };
    form.addEventListener('click', event => {
      if (event.target.closest('[data-permit-remove]')) event.target.closest('.workflow-permit-row').remove();
      const add = event.target.closest('[data-permit-add]'); if (add) add.insertAdjacentHTML('beforebegin', permitRow());
    });
    form.onsubmit = async event => {
      event.preventDefault(); const submit = $(form, '[type=submit]'); submit.disabled = true; notify(form, 'Saving corrections…');
      try {
        const changes = {};
        for (const field of data.fields.filter(field => editable.includes(field.id))) {
          const control = $(form, `[data-field="${field.id}"]`); let value;
          if (['image', 'file', 'speaker_files'].includes(field.kind)) {
            if (!control.files.length) continue;
            if (field.kind === 'speaker_files') {
              value = [];
              for (const file of control.files) { const upload = await request(`/api/workflow/requests/${kind}/${id}/upload`, { method: 'POST', body: JSON.stringify({ fileData: await fileData(file) }) }); value.push({ uploadId: upload.uploadId, name: file.name }); }
            } else value = await fileData(control.files[0]);
          } else value = field.kind === 'boolean' ? control.checked : field.kind === 'permit'
            ? [...control.querySelectorAll('.workflow-permit-row')].map(row => ({ quantity: Number($(row, '[data-permit-quantity]').value), number: $(row, '[data-permit-number]').value, details: $(row, '[data-permit-details]').value })) : control.value;
          if (JSON.stringify(value) !== JSON.stringify(data.values[field.id])) changes[field.id] = value;
        }
        await request(`/api/workflow/requests/${kind}/${id}/resubmit`, { method: 'POST', body: JSON.stringify({ revision: flow.revision, changes }) });
        await detail(host, kind, id);
      } catch (error) { notify(form, error.message, true); submit.disabled = false; }
    };
    const decision = $(host, '[data-workflow-decision]');
    if (decision && data.adminReviewRoles?.length) {
      const label = document.createElement('label'); label.textContent = 'Review on behalf of role';
      const select = document.createElement('select'); select.name = 'reviewRole';
      const pendingRole = data.adminReviewRoles.find(role => !flow.approvals?.some(approval => approval.role === role.id))?.id || data.adminReviewRoles[0].id;
      select.innerHTML = options(data.adminReviewRoles.map(role => ({ id: role.id, name: roleLabels[role.id] || role.id })), pendingRole); label.append(select);
      decision.querySelector('h2').after(label);
      const note = document.createElement('p'); note.className = 'workflow-note'; note.textContent = 'Your decision is recorded as Administrator, on behalf of the selected role.'; label.after(note);
      select.onchange = () => { const role = data.adminReviewRoles.find(role => role.id === select.value); for (const control of decision.querySelectorAll('[data-workflow-action]')) control.hidden = !role.actions.includes(control.dataset.workflowAction); };
      select.onchange();
    }
    for (const [index, item] of [...host.querySelectorAll('.workflow-history > li')].entries()) {
      const role = flow.history[index].onBehalfOfRole;
      if (role) { const note = document.createElement('p'); note.className = 'workflow-note'; note.textContent = 'Administrator on behalf of ' + (roleLabels[role] || role); item.append(note); }
    }
    if (decision) decision.onclick = async event => {
      const target = event.target.closest('[data-workflow-action]'); if (!target) return;
      if (target.dataset.workflowAction === 'request_changes' && !selected(decision, 'revisionFields').length) {
        notify(decision, 'Select at least one field to correct before requesting changes.', true);
        decision.querySelector('input[name="revisionFields"]')?.focus();
        return;
      }
      const buttons = [...decision.querySelectorAll('button')]; buttons.forEach(button => { button.disabled = true; });
      try {
        const payload = { revision: flow.revision, action: target.dataset.workflowAction, reviewRole: $(decision, '[name=reviewRole]')?.value, comment: $(decision, '[name=comment]').value,
          fields: selected(decision, 'revisionFields'), fieldComments: Object.fromEntries([...decision.querySelectorAll('[data-field-comment]')].map(input => [input.dataset.fieldComment, input.value])),
          emails: selected(decision, 'reviewerEmails'), target: $(decision, '[name=target]')?.value };
        await request(`/api/workflow/requests/${kind}/${id}/decision`, { method: 'POST', body: JSON.stringify(payload) }); await detail(host, kind, id);
      } catch (error) { notify(decision, error.message, true); buttons.forEach(button => { button.disabled = false; }); }
    };
  }
  function historyValues(values) { return JSON.stringify(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === 'string' && value.startsWith('data:') ? '[Saved attachment]' : value])), null, 2); }
  window.MiuWorkflow = { mountAdmin, board, detail, notifications, blockedRequests };
  const workspace = document.getElementById('workflowWorkspace');
  if (workspace) (async () => { try { const context = await request('/api/workflow/context'); if (context.dashboardUrl) { const back = document.querySelector('[data-history-back]'); if (back) back.href = context.dashboardUrl; } const params = new URLSearchParams(location.search); if (params.has('kind') && params.has('id')) await detail(workspace, params.get('kind'), params.get('id')); else await board(workspace, context); } catch (error) { workspace.textContent = error.message; } })();
})();
