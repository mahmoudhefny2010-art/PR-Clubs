(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const names = { requests: 'Request inbox', notifications: 'Notifications', event: 'Events', feed: 'Feed posts', sponsor: 'Sponsors', booth: 'Booths', entry_permit: 'Entry permits', speaker: 'Club speakers', speaker_miu: 'MIU speakers', speaker_public: 'External speakers', approve: 'Approve', reject: 'Reject', request_changes: 'Request corrections', comment: 'Add comments', assign: 'Assign reviewers', forward: 'Escalate', history: 'View history', view_all: 'View all within scope' };
  async function api(url, options = {}) { const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json' } }); const value = await response.json(); if (!response.ok) throw Error(value.message || 'Changes could not be confirmed.'); return value; }
  const chips = (items, checked, name) => `<div class="workflow-checks">${items.map(id => `<label><input type="checkbox" name="${name}" value="${esc(id)}"${checked.includes(id) ? ' checked' : ''}>${esc(names[id] || id)}</label>`).join('')}</div>`;
  async function mount(host) {
    let data = await api('/api/admin/custom-roles'), current;
    const fresh = () => ({ name: '', description: '', enabled: true, scope: 'clubs', modules: ['requests', 'notifications'], requestTypes: ['event'], permissions: ['approve', 'reject', 'request_changes', 'comment', 'history', 'view_all'], members: [{ email: '', clubIds: [] }] });
    function render(role = fresh()) {
      current = structuredClone(role);
      host.innerHTML = `<section class="workflow-panel"><div class="workflow-section-heading"><div><h2>Roles & dashboards</h2><p class="workflow-note">Create a role, choose its tools, then assign staff emails. Staff sign in with MIU Google.</p></div><button class="secondary-btn" type="button" data-new-role>New role</button></div><div class="custom-role-list">${data.roles.map(item => `<button class="secondary-btn custom-role-choice" type="button" data-edit-role="${esc(item.key)}"><strong>${esc(item.name)}</strong><span>${item.members.length} staff · ${item.enabled ? 'Active' : 'Disabled'}</span></button>`).join('') || '<p class="workflow-note">No custom roles yet. Create the first one below.</p>'}</div></section>
        <section class="workflow-panel"><h2>${current.key ? 'Edit role' : 'Create role & dashboard'}</h2><form data-role-form><div class="workflow-grid"><label>Role / dashboard name<input name="name" maxlength="80" required value="${esc(current.name)}" placeholder="For example: Activities Review Team"></label><label>Club access<select name="scope"><option value="clubs"${current.scope === 'clubs' ? ' selected' : ''}>Assigned clubs only</option><option value="global"${current.scope === 'global' ? ' selected' : ''}>All clubs</option></select></label></div><label>Short description<input name="description" maxlength="300" value="${esc(current.description)}"></label><label class="workflow-toggle"><input name="enabled" type="checkbox"${current.enabled ? ' checked' : ''}> Role active</label><h3>What appears in the dashboard?</h3>${chips(data.modules, current.modules, 'modules')}
        <div data-review-settings><h3>Request types</h3>${chips(data.types, current.requestTypes, 'requestTypes')}<h3>What can this role do?</h3><p class="workflow-note">Review actions also require assignment to the matching workflow stage. This does not grant administrator access.</p>${chips(data.permissions, current.permissions, 'permissions')}</div>
        <div class="workflow-section-heading"><h3>Assigned staff</h3><button type="button" class="secondary-btn" data-add-member>Add staff email</button></div><p class="workflow-note">An existing account keeps its other roles and password. New staff use MIU Google.</p><div data-role-members></div>
        <div class="workflow-save-row"><a class="secondary-btn" href="/admin/workflows">Configure approval stages</a><button class="primary-btn" type="submit">${current.key ? 'Save role' : 'Create role & dashboard'}</button></div><p data-role-feedback role="status"></p></form></section>`;
      const form = host.querySelector('[data-role-form]'), memberHost = host.querySelector('[data-role-members]');
      const selected = (element, name) => [...element.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
      function addMember(member = { email: '', clubIds: [] }) {
        const row = document.createElement('section'); row.className = 'custom-role-member'; row.dataset.roleMember = '';
        row.innerHTML = `<div class="workflow-section-heading"><label>MIU staff email<input type="email" name="email" required maxlength="254" placeholder="staff@miuegypt.edu.eg" value="${esc(member.email)}"></label><button class="secondary-btn" type="button" data-remove-member>Remove</button></div><fieldset class="workflow-fieldset" data-member-clubs><legend>Assigned clubs</legend><div class="workflow-checks">${data.clubs.map(club => `<label><input type="checkbox" name="clubIds" value="${club.id}"${member.clubIds.includes(Number(club.id)) ? ' checked' : ''}>${esc(club.name)}</label>`).join('')}</div></fieldset>`;
        row.querySelector('[data-remove-member]').onclick = () => row.remove(); memberHost.append(row); sync();
      }
      function sync() {
        for (const section of memberHost.querySelectorAll('[data-member-clubs]')) section.hidden = form.elements.scope.value !== 'clubs';
        form.querySelector('[data-review-settings]').hidden = !selected(form, 'modules').includes('requests');
      }
      current.members.forEach(addMember); sync();
      form.addEventListener('change', sync);
      host.querySelector('[data-add-member]').onclick = () => addMember();
      host.querySelector('[data-new-role]').onclick = () => render();
      host.querySelectorAll('[data-edit-role]').forEach(button => { button.onclick = () => render(data.roles.find(role => role.key === button.dataset.editRole)); });
      form.onsubmit = async event => {
        event.preventDefault(); const feedback = form.querySelector('[data-role-feedback]'), submit = form.querySelector('[type=submit]'); submit.disabled = true; feedback.textContent = 'Saving role and staff assignments…';
        const modules = selected(form, 'modules');
        const payload = { version: current.version, name: form.elements.name.value, description: form.elements.description.value, scope: form.elements.scope.value, enabled: form.elements.enabled.checked, modules,
          requestTypes: modules.includes('requests') ? selected(form, 'requestTypes') : [], permissions: modules.includes('requests') ? selected(form, 'permissions') : [],
          members: [...memberHost.querySelectorAll('[data-role-member]')].map(row => ({ email: row.querySelector('[name=email]').value, clubIds: form.elements.scope.value === 'clubs' ? selected(row, 'clubIds').map(Number) : [] })) };
        try {
          const saved = await api('/api/admin/custom-roles' + (current.key ? '/' + current.key : ''), { method: current.key ? 'PUT' : 'POST', body: JSON.stringify(payload) });
          data = await api('/api/admin/custom-roles'); render(data.roles.find(role => role.key === saved.key));
          host.querySelector('[data-role-feedback]').textContent = 'Saved. The assigned staff will see this dashboard in My dashboards. Add the role to approval stages to begin reviewing.';
        } catch (error) { feedback.textContent = error.message; feedback.classList.add('workflow-error'); submit.disabled = false; }
      };
    }
    render();
  }
  window.MiuCustomRoles = { mount };
})();
