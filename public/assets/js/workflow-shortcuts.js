(() => {
  // Admin already has its workflow card. Forms and login screens need no
  // dashboard shortcut, and sidebar layouts must keep their two direct columns.
  if (!/^(?:\/club-dashboard\/?|\/dashboards\/[^/]+-dashboard\.html)$/.test(location.pathname)) return;
  async function mount() {
    try {
      const response = await fetch('/api/workflow/context', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok || document.getElementById('workflowDashboardShortcut')) return;
      const sidebar = document.querySelector('.committee-sidebar');
      const host = sidebar || document.querySelector('#headDashboardView .top-actions');
      if (!host || host.querySelector('a[href="/pages/workflow.html"]')) return;
      const link = document.createElement('a');
      link.id = 'workflowDashboardShortcut';
      link.className = sidebar ? 'committee-sidebar-link' : 'secondary-btn';
      link.href = '/pages/workflow.html';
      link.textContent = 'Approval requests';
      host.append(link);
    } catch { /* Existing dashboards remain usable during a workflow outage. */ }
  }
  if (window.siteStartup?.afterStartup) window.siteStartup.afterStartup(mount); else void mount();
})();
