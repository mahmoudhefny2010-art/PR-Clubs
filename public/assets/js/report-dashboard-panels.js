(() => {
  'use strict';
  const adminTabs = document.getElementById('adminTabs');
  const president = document.querySelector('.president-sidebar');
  const supervisor = document.getElementById('supervisorContent');
  const sidebar = document.querySelector('.committee-sidebar') || president || adminTabs;
  if (!sidebar) return;
  const scope = sidebar.dataset.unreadScope;
  const modes = scope === 'pr' || scope === 'sso' ? ['attendance', 'open_attendance'] : ['reports', 'attendance', 'open_attendance'];
  let host = document.querySelector('.president-dashboard-main') || document.querySelector('#committee-overview, .sso-content, .supervisor-main');
  if (adminTabs) {
    const layout = document.createElement('div'); layout.className = 'report-admin-layout';
    host = document.createElement('div'); host.className = 'report-admin-content';
    adminTabs.before(layout); layout.append(adminTabs, host);
    document.querySelectorAll('main > .tab-panel').forEach(panel => host.append(panel));
    adminTabs.classList.add('report-admin-sidebar');
  }
  if (!host) return;
  // All entry points share these two native panels; no iframe or navigation.
  const panel = document.createElement('section');
  panel.id = 'reportInlinePanel'; panel.className = 'committee-inline-panel event-reports'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Event reports and attendance sheets'); host.append(panel);
  const back = document.createElement('button');
  back.type = 'button'; back.className = 'secondary-btn report-panel-back'; back.textContent = '← Back to dashboard';
  panel.append(back);
  const links = {};
  const hasReportEditor = Boolean(president || supervisor);
  const canManageMiuAttendance = scope !== 'miu_events' || location.pathname === '/dashboards/miu-events-dashboard.html';
  sidebar.querySelectorAll('a[href="/pages/event-reports.html"]').forEach(link => link.remove());
  if (scope === 'miu_events') sidebar.querySelectorAll('a[data-report-mode]').forEach(link => link.remove());
  for (const mode of modes) {
    const href = mode === 'open_attendance' ? '/pages/report-downloads.html?type=attendance&audience=all_students' : `/pages/report-downloads.html?type=${mode}`;
    let link = scope === 'miu_events' ? null : sidebar.querySelector(`a[href="${href}"]`);
    if (!link) {
      link = document.createElement('a'); link.href = href;
      link.textContent = mode === 'reports' ? 'All event reports' : mode === 'open_attendance' ? 'Open event attendance' : 'Attendance sheets';
      link.className = president ? 'president-sidebar-action' : 'committee-sidebar-link';
      if (president) link.setAttribute('data-president-only', '');
      sidebar.append(link);
    }
    link.dataset.reportMode = mode;
    if (mode === 'reports') link.textContent = 'Event reports';
    if (mode === 'attendance') link.textContent = 'Attendance sheets';
    if (mode === 'open_attendance') link.textContent = 'Open event attendance';
    links[mode] = link;
  }
  let templatePromise, miuAttendancePromise, revision = 0, previousAdminTab = null, previousDashboardPanel = '', previousPresidentSection = '';
  let backgroundPreloadStarted = false;
  const preloadedDownloadPanels = new Map();
  async function ensureScript(globalName, src, marker) {
    if (window[globalName]) return;
    const existing = [...document.scripts].find(script => script.dataset[marker] === 'true');
    if (existing) {
      await new Promise((resolve, reject) => { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); });
      if (window[globalName]) return;
    }
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.dataset[marker] = 'true'; script.src = src; script.onload = resolve; script.onerror = reject; document.head.append(script);
    });
    if (!window[globalName]) throw new Error('The dashboard section could not be prepared.');
  }
  function preloadDownloadPanel(mode) {
    if (!preloadedDownloadPanels.has(mode)) {
      const promise = (async () => {
        const content = await template();
        await ensureScript('mountReportDownloads', '/assets/js/pages/report-downloads.js?v=20261014progressive1', 'preloadedReportDownloads');
        const root = document.createElement('div'); root.className = 'report-preloaded-controls'; root.hidden = true; root.innerHTML = content;
        const ready = window.mountReportDownloads(root, 'attendance', mode === 'open_attendance' ? 'all_students' : 'members');
        return { root, ready };
      })().catch(error => { preloadedDownloadPanels.delete(mode); throw error; });
      preloadedDownloadPanels.set(mode, promise);
    }
    return preloadedDownloadPanels.get(mode);
  }
  async function preloadMiuAttendancePanel() {
    if (!miuAttendancePromise) miuAttendancePromise = (async () => {
      const response = await fetch('/pages/miu-attendance.html', { cache: 'no-cache', siteStartupNonBlocking: true });
      if (!response.ok) throw new Error('Could not prepare MIU attendance.');
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      const section = html.querySelector('main > section');
      section?.querySelector('[data-history-back]')?.remove();
      if (!section) throw new Error('Could not prepare MIU attendance.');
      const root = document.createElement('div'); root.className = 'miu-attendance-preloaded'; root.hidden = true; root.append(section);
      await ensureScript('mountMiuAttendance', '/assets/js/pages/miu-attendance.js?v=20261014progressive1', 'inlineMiuAttendance');
      const ready = window.mountMiuAttendance(root);
      return { root, ready };
    })().catch(error => { miuAttendancePromise = null; throw error; });
    return miuAttendancePromise;
  }
  function startBackgroundPreload() {
    if (backgroundPreloadStarted || !sidebar.getClientRects().length || sidebar.closest('[hidden]')) return false;
    backgroundPreloadStarted = true;
    const tasks = modes.filter(mode => mode === 'attendance' || mode === 'open_attendance')
      .map(mode => async () => { const preloaded = await preloadDownloadPanel(mode); await preloaded.ready; });
    if (canManageMiuAttendance) tasks.push(async () => { const preloaded = await preloadMiuAttendancePanel(); await preloaded.ready; });
    // Keep requests bounded: load the common attendance list first, then the
    // open-student list and MIU usher form together in the background.
    const first = tasks.shift();
    void (async () => {
      if (first) {
        try { await first(); }
        catch (error) { console.warn('Attendance data preload failed.', error); }
      }
      if (tasks.length) {
        const results = await Promise.allSettled(tasks.map(task => task()));
        results.filter(result => result.status === 'rejected').forEach(result => console.warn('Dashboard data preload failed.', result.reason));
      }
    })();
    return true;
  }
  function scheduleBackgroundPreload() {
    const observer = new MutationObserver(() => {
      if (startBackgroundPreload()) observer.disconnect();
    });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'hidden', 'style'] });
    const schedule = window.siteStartup?.afterStartup || (task => window.setTimeout(task, 0));
    schedule(() => { if (startBackgroundPreload()) observer.disconnect(); });
  }
  async function template() {
    if (!templatePromise) templatePromise = fetch('/pages/report-downloads.html', { cache: 'no-cache', siteStartupNonBlocking: true })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load report controls.');
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        return html.querySelector('main > section').innerHTML;
      }).catch(error => { templatePromise = null; throw error; });
    return templatePromise;
  }
  function deactivate() {
    panel.hidden = true; panel.classList.add('hidden');
    if (supervisor) supervisor.hidden = false;
    if (adminTabs && previousAdminTab) {
      host.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      sidebar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      previousAdminTab.panel?.classList.add('active'); previousAdminTab.button?.classList.add('active');
      previousAdminTab = null;
    }
    if (president && previousPresidentSection) {
      window.setPresidentDashboardSection?.(previousPresidentSection);
      previousPresidentSection = '';
    }
    if (!president && !supervisor && !adminTabs && previousDashboardPanel) {
      window.dashboardPanels?.show(previousDashboardPanel);
      previousDashboardPanel = '';
    }
    Object.values(links).forEach(link => { link.classList.remove('is-active'); link.removeAttribute('aria-current'); });
  }
  back.addEventListener('click', () => {
    if (history.state?.miuDashboardInline) history.back();
    else deactivate();
  });
  window.addEventListener('popstate', event => { if (event.state?.miuDashboardInline || !panel.hidden) deactivate(); });
  document.addEventListener('click', async event => {
    const link = event.target.closest('a[href*="/pages/report-downloads.html"], a[href="/pages/miu-attendance.html"]');
    if (!link) {
      if (sidebar.contains(event.target) && event.target.closest('[data-panel], [data-tab], [data-dashboard-section], [data-dashboard-panel]')) deactivate();
      return;
    }
    const url = new URL(link.href, location.origin);
    const isMiuAttendance = url.pathname === '/pages/miu-attendance.html';
    if (isMiuAttendance && !canManageMiuAttendance) return;
    const mode = isMiuAttendance ? 'miu_attendance' : url.searchParams.get('audience') === 'all_students' ? 'open_attendance' : url.searchParams.get('type') || 'reports';
    if (!isMiuAttendance && !modes.includes(mode)) return;
    event.preventDefault();
    const current = ++revision;
    if (panel.hidden) {
      previousDashboardPanel = host.querySelector('.committee-overview-panel:not([hidden]), .committee-requests-section:not([hidden]), .committee-inline-panel:not([hidden])')?.id || '';
      previousPresidentSection = president?.querySelector('[data-dashboard-section].is-active')?.dataset.dashboardSection || '';
    }
    if (adminTabs && !previousAdminTab) previousAdminTab = { panel: host.querySelector('.tab-panel.active'), button: sidebar.querySelector('.tab-btn.active') };
    history.pushState({ miuDashboardInline: true }, '', `${location.pathname}${location.search}`);
    if (president) window.setPresidentDashboardSection?.('reportInlinePanel');
    else if (supervisor) supervisor.hidden = true;
    else if (adminTabs) {
      host.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      sidebar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    } else window.dashboardPanels?.show('reportInlinePanel');
    panel.hidden = false; panel.classList.remove('hidden');
    // Inline report panels should open from the top of the dashboard content,
    // regardless of how far down the previous section had been scrolled.
    const scrollTarget = document.querySelector('.committee-main, .president-dashboard-main, #supervisorContent, .report-admin-layout, main') || panel;
    const targetTop = scrollTarget.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top: Math.max(0, targetTop), left: 0, behavior: 'instant' });
    sidebar.querySelectorAll('.is-active').forEach(item => item.classList.remove('is-active'));
    Object.values(links).forEach(item => item.removeAttribute('aria-current'));
    (links[mode] || link).classList.add('is-active'); (links[mode] || link).setAttribute('aria-current', 'page');
    panel.replaceChildren(back, document.createTextNode('Loading…'));
    try {
      if (isMiuAttendance) {
        const preloaded = await preloadMiuAttendancePanel();
        if (current !== revision) return;
        preloaded.root.hidden = false; panel.replaceChildren(back, preloaded.root);
        return;
      }
      if (mode === 'attendance' || mode === 'open_attendance') {
        const preloaded = await preloadDownloadPanel(mode);
        if (current !== revision) return;
        preloaded.root.hidden = false; panel.replaceChildren(back, preloaded.root);
        return;
      }
      const html = await template();
      if (current !== revision) return;
      const controls = document.createElement('div'); controls.innerHTML = html;
      panel.replaceChildren(back, controls); window.mountReportDownloads(controls, mode === 'open_attendance' ? 'attendance' : mode, mode === 'open_attendance' ? 'all_students' : 'members');
      if (mode === 'reports' && hasReportEditor) {
        const editor = document.createElement('details');
        const heading = document.createElement('summary'); heading.textContent = 'Write, edit and review semester reports';
        editor.append(heading); controls.prepend(editor);
        let started = false;
        editor.addEventListener('toggle', async () => {
          if (!editor.open || started) return;
          started = true;
          editor.querySelector('div')?.remove();
          const body = document.createElement('div'); body.textContent = 'Loading report editor…'; editor.append(body);
          try {
            const response = await fetch('/pages/event-reports.html');
            if (!response.ok) throw new Error('Could not load report editor.');
            const html = new DOMParser().parseFromString(await response.text(), 'text/html');
            if (!window.mountEventReports) await new Promise((resolve, reject) => {
              const script = document.createElement('script'); script.src = '/assets/js/pages/event-reports.js?v=20261013combinedreports1';
              script.onload = resolve; script.onerror = reject; document.head.append(script);
            });
            body.innerHTML = html.querySelector('main > section').innerHTML;
            window.mountEventReports(body);
          } catch { body.textContent = 'Could not load report editor. Close and reopen to retry.'; started = false; }
        });
      }
    } catch (error) { if (current === revision) panel.replaceChildren(back, document.createTextNode(error.message)); }
  });
  scheduleBackgroundPreload();
})();
