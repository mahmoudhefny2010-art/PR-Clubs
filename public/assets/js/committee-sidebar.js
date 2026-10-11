(() => {
  const sidebar = document.querySelector('.committee-sidebar, .president-sidebar');
  if (!sidebar) return;

  const scope = sidebar.dataset.unreadScope || location.pathname;
  const storageKey = `miu-dashboard-unread:${scope}`;
  const panelStorageKey = `miu-dashboard-panel:${scope}`;
  const seen = new Map();
  const current = new Map();
  const syncSucceeded = new Set();
  const actionableSections = new Set(['requests', 'attendanceApprovals', 'applicants']);
  if (['english', 'pr', 'security'].includes(scope)) actionableSections.add('allRequests');
  if (['pr', 'security'].includes(scope)) actionableSections.add('entryPermits');
  let activeSection = '';

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    Object.entries(saved).forEach(([section, keys]) => {
      if (Array.isArray(keys)) seen.set(section, new Set(keys));
    });
  } catch { /* Counts still work for this page view when storage is unavailable. */ }

  function paint(section) {
    const keys = current.get(section) || [];
    const sectionSeen = seen.get(section) || new Set();
    const unseenCount = keys.reduce((total, key) => total + (sectionSeen.has(key) ? 0 : 1), 0);
    const isActionable = actionableSections.has(section);
    const count = unseenCount || (isActionable ? keys.length : 0);

    document.querySelectorAll(`[data-unread-badge="${section}"]`).forEach((badge) => {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.dataset.badgeState = unseenCount ? 'new' : 'pending';
      badge.hidden = count === 0;
    });
    document.querySelectorAll(`[data-overview-count="${section}"]`).forEach((node) => {
      node.textContent = String(isActionable ? keys.length : unseenCount);
    });
  }

  function persist() {
    try {
      const value = Object.fromEntries([...seen.entries()].map(([section, keys]) => [section, [...keys].slice(-1000)]));
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch { /* Navigation and counts remain usable without local storage. */ }
  }

  function markSeen(section) {
    if (!section) return;
    const sectionSeen = seen.get(section) || new Set();
    (current.get(section) || []).forEach((key) => sectionSeen.add(key));
    seen.set(section, sectionSeen);
    persist();
    paint(section);
  }

  function showPanel(panelId) {
    const layout = sidebar.closest('.committee-dashboard-layout');
    layout?.classList.toggle('is-overview-panel', /(?:committee|sso)OverviewPanel$/.test(panelId));
    const panels = layout ? [...layout.querySelectorAll('.committee-overview-panel, .committee-requests-section, .sso-hero, .committee-inline-panel')] : [];
    const target = panels.find((panel) => panel.id === panelId);
    if (!target) return;
    try {
      if (!(target instanceof HTMLDialogElement)) localStorage.setItem(panelStorageKey, panelId);
    } catch { /* The selected panel still works when storage is unavailable. */ }
    panels.forEach((panel) => {
      const active = panel === target;
      panel.hidden = !active;
      panel.classList.toggle('is-active-panel', active);
      if (panel instanceof HTMLDialogElement && panel.classList.contains('committee-inline-panel')) {
        // Inline panels are dialogs in markup for accessibility, but are not
        // modal dialogs. The native show() method is only for modal dialogs.
        panel.toggleAttribute('open', active);
      } else if (panel instanceof HTMLDialogElement) {
        if (active && !panel.open) panel.show();
        else if (!active && panel.open) panel.close();
      }
      if (active) panel.removeAttribute('aria-hidden');
      else panel.setAttribute('aria-hidden', 'true');
    });
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const content = sidebar.closest('.committee-dashboard-layout')?.querySelector('#committee-overview, .sso-content');
  if (content) document.querySelectorAll('.status-overview-dialog, .attendance-review-dialog, .committee-attendance-dialog, .member-directory-dialog').forEach((panel) => {
    panel.classList.add('committee-inline-panel');
    panel.hidden = true;
    content.append(panel);
  });
  window.dashboardPanels = {
    show: showPanel,
    showOverview() {
      const overview = sidebar.querySelector('[data-dashboard-panel]');
      const homePanel = layoutPanelId(overview);
      if (homePanel) showPanel(homePanel);
    }
  };
  function layoutPanelId(link) { return link?.dataset.dashboardPanel || ''; }

  window.dashboardUnread = {
    update(section, keys) {
      current.set(section, [...new Set((keys || []).map(String))]);
      if (activeSection === section) markSeen(section);
      else paint(section);
    },
    markSeen,
    activate(section) {
      activeSection = section || '';
      markSeen(activeSection);
    },
    setOverview(section) { paint(section); }
  };

  window.dashboardSync = {
    report(section, state, detail) {
      const labels = { requests: 'Requests', allRequests: 'Review restarts', clubMembers: 'Members', eventAttendance: 'Attendance', attendanceApprovals: 'Reviews' };
      if (state === 'success') syncSucceeded.add(section);
      if ((state === 'loading' || state === 'error') && !syncSucceeded.has(section)) {
        document.querySelectorAll(`[data-overview-count="${section}"]`).forEach((node) => {
          node.textContent = state === 'loading' ? '…' : '!';
        });
      }
      document.querySelectorAll(`[data-sync-status="${section}"]`).forEach((node) => {
        node.dataset.syncState = state;
        const suffix = state === 'success' ? `synced ${window.formatSiteTime(new Date())}` : state === 'error' ? 'sync failed' : state === 'loading' ? 'syncing…' : 'waiting';
        node.textContent = `${labels[section] || section} · ${detail || suffix}`;
        if (!detail || state !== 'error') node.textContent = `${labels[section] || section} · ${suffix}`;
      });
    }
  };

  document.querySelectorAll('[data-dashboard-refresh]').forEach((button) => {
    button.addEventListener('click', () => {
      button.disabled = true;
      window.dispatchEvent(new CustomEvent('dashboard:refresh'));
      window.setTimeout(() => { button.disabled = false; }, 1200);
    });
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-return-dashboard-overview]')) {
      window.dashboardPanels.showOverview();
      return;
    }
    const card = event.target.closest('.overview-stat-card[data-dashboard-panel]');
    if (!card) return;
    event.preventDefault();
    const panelId = card.dataset.dashboardPanel;
    const navLink = sidebar.querySelector(`[data-dashboard-panel="${panelId}"]`);
    sidebar.querySelectorAll('.committee-sidebar-link').forEach((item) => item.classList.toggle('is-active', item === navLink));
    window.dashboardUnread.activate('requests');
    showPanel(panelId);
  });

  sidebar.addEventListener('click', (event) => {
    const link = event.target.closest('.committee-sidebar-link, .president-sidebar-action, [data-dashboard-section]');
    if (!link || link.hidden) return;
    sidebar.querySelectorAll('.committee-sidebar-link, .president-sidebar-action, [data-dashboard-section]').forEach((item) => {
      item.classList.toggle('is-active', item === link);
      if (item === link) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    const section = link.dataset.unreadSection || link.querySelector('[data-unread-badge]')?.dataset.unreadBadge;
    window.dashboardUnread.activate(section || '');
    const panelId = link.dataset.dashboardPanel;
    if (panelId) {
      event.preventDefault();
      showPanel(panelId);
    }
  });

  let savedPanel = '';
  try { savedPanel = localStorage.getItem(panelStorageKey) || ''; } catch { /* Use the page default. */ }
  const savedPanelLink = [...sidebar.querySelectorAll('[data-dashboard-panel]')]
    .find((link) => link.dataset.dashboardPanel === savedPanel);
  const savedPanelExists = savedPanelLink && document.getElementById(savedPanel);
  if (savedPanelExists) {
    sidebar.querySelectorAll('.committee-sidebar-link, .president-sidebar-action, [data-dashboard-section]')
      .forEach((item) => item.classList.toggle('is-active', item === savedPanelLink));
    savedPanelLink.setAttribute('aria-current', 'page');
  }
  const initialPanel = savedPanelExists
    ? savedPanel
    : sidebar.querySelector('[data-dashboard-panel].is-active')?.dataset.dashboardPanel;
  if (initialPanel) showPanel(initialPanel);
  const initialSection = sidebar.querySelector('.committee-sidebar-link.is-active[data-unread-section], .president-sidebar-action.is-active[data-unread-section], [data-dashboard-section].is-active[data-unread-section]')?.dataset.unreadSection
    || sidebar.querySelector('.committee-sidebar-link.is-active [data-unread-badge]')?.dataset.unreadBadge;
  if (initialSection) window.dashboardUnread.activate(initialSection);

  document.querySelectorAll('dialog').forEach((dialog) => {
    if (dialog.classList.contains('committee-inline-panel')) return;
    dialog.addEventListener('close', () => window.dashboardUnread.activate(''));
  });
})();
