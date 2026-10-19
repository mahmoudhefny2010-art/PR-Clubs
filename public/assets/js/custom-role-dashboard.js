(() => {
  'use strict';
  const feedback = document.getElementById('customRoleFeedback');
  if (!feedback) return;
  const key = new URLSearchParams(location.search).get('role');
  async function api(url) { const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw Error(data.message || 'Dashboard access could not be confirmed.'); return data; }
  (async () => {
    const data = await api('/api/custom-dashboard/' + encodeURIComponent(key));
    document.getElementById('customRoleTitle').textContent = data.name;
    document.getElementById('customRoleDescription').textContent = data.description;
    document.title = data.name + ' · MIU Clubs';
    document.getElementById('customRoleScope').textContent = data.scope === 'global' ? 'Review tools for all clubs, within this role’s permissions.' : 'Review tools for your assigned clubs.';
    const panels = { overview: 'customOverviewPanel', requests: 'customRequestsPanel', notifications: 'customNotificationsPanel' }, loaded = new Set();
    async function show(name) {
      if (name !== 'overview' && !data.modules.includes(name)) return;
      for (const [id, panel] of Object.entries(panels)) document.getElementById(panel).hidden = id !== name;
      for (const button of document.querySelectorAll('[data-role-panel]')) { button.classList.toggle('is-active', button.dataset.rolePanel === name); if (button.dataset.rolePanel === name) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }
      feedback.textContent = '';
      if (loaded.has(name)) return;
      try {
        if (name === 'requests') await window.MiuWorkflow.board(document.getElementById(panels.requests), { modules: data.modules, types: data.types, embedNotifications: false });
        if (name === 'notifications') await window.MiuWorkflow.notifications(document.getElementById(panels.notifications));
        loaded.add(name);
      } catch (error) { feedback.textContent = error.message; }
    }
    for (const module of data.modules) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'committee-sidebar-link'; button.dataset.rolePanel = module;
      button.textContent = module === 'requests' ? 'Approval requests' : 'Notifications'; document.getElementById('customRoleNavigation').append(button);
    }
    document.querySelector('main').addEventListener('click', event => { const button = event.target.closest('[data-role-panel]'); if (button) void show(button.dataset.rolePanel); });
    if (data.modules.includes('requests')) {
      const listing = await api('/api/workflow/requests');
      const stats = document.getElementById('customRoleStats');
      const total = document.createElement('article'); total.className = 'overview-stat-card';
      const label = document.createElement('span'); label.textContent = 'Accessible requests'; const count = document.createElement('strong'); count.textContent = listing.total;
      const help = document.createElement('small'); help.textContent = 'Open Approval requests to filter and review.'; total.append(label, count, help); stats.append(total);
    }
    for (const module of data.modules) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'overview-stat-card'; button.dataset.rolePanel = module;
      const label = document.createElement('span'); label.textContent = module === 'requests' ? 'Approval requests' : 'Notifications';
      const help = document.createElement('small'); help.textContent = module === 'requests' ? 'Review requests and requested corrections' : 'Open your workflow updates'; button.append(label, help); document.getElementById('customRoleStats').append(button);
    }
    document.getElementById('customRoleRefresh').onclick = () => location.reload(); feedback.textContent = '';
  })().catch(error => { feedback.textContent = error.message; });
})();
