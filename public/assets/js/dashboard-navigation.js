(() => {
  // The new admin tools use actual pages and browser history, not hidden panels.
  if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) return;
  const key = 'miu:dashboard-navigation:' + location.pathname;
  let saved = { current: null, stack: [] };
  try { saved = JSON.parse(sessionStorage.getItem(key)) || saved; } catch {}
  if (!Array.isArray(saved.stack)) saved.stack = [];
  const sidebar = '.committee-sidebar, .president-sidebar, .student-dashboard-sidebar, .report-admin-sidebar';
  const attributes = ['data-report-mode', 'data-dashboard-panel', 'data-dashboard-section', 'data-panel', 'data-tab', 'data-student-section'];
  const descriptor = element => {
    if (!element || element.matches('.dashboard-drawer-close, .dashboard-drawer-toggle')) return null;
    for (const attribute of attributes) if (element.hasAttribute(attribute)) return { attribute, value: element.getAttribute(attribute) };
    if (element.matches('a[href*="/pages/report-downloads.html"]')) return { attribute: 'href', value: element.getAttribute('href') };
    if (element.tagName === 'BUTTON' && element.id) return { attribute: 'id', value: element.id };
    return null;
  };
  const equal = (a, b) => a && b && a.attribute === b.attribute && a.value === b.value;
  const find = item => item && [...document.querySelectorAll(sidebar)].flatMap(nav => [...nav.querySelectorAll('a, button')])
    .find(element => element.getAttribute(item.attribute) === item.value && element.getClientRects().length && !element.disabled);
  const persist = () => { try { sessionStorage.setItem(key, JSON.stringify(saved)); } catch {} };
  const reload = performance.getEntriesByType('navigation')[0]?.type === 'reload';
  let restoring = Boolean(reload && saved.current);
  let replaying = false;
  if (!reload) { saved = { current: null, stack: [] }; persist(); }
  document.addEventListener('click', event => {
    const target = event.target.closest('a, button');
    if (!target?.closest(sidebar) || replaying) return;
    if (restoring && !event.isTrusted) return;
    const next = descriptor(target); if (!next) return;
    // A real user selection takes precedence over pending restoration.
    if (event.isTrusted) restoring = false;
    if (!saved.current) saved.current = descriptor(target.closest(sidebar).querySelector('.is-active, .active, [aria-current="page"]'));
    if (!equal(next, saved.current)) {
      if (saved.current) saved.stack.push(saved.current);
      saved.stack = saved.stack.slice(-40); saved.current = next; persist();
    }
  }, true);
  window.miuDashboardGoBack = () => {
    while (saved.stack.length) {
      const previous = saved.stack.pop(), control = find(previous);
      if (!control) continue;
      restoring = false; replaying = true;
      try { control.click(); } finally { replaying = false; }
      saved.current = previous; persist(); return true;
    }
    return false;
  };
  if (restoring) {
    const started = Date.now();
    const timer = setInterval(() => {
      if (!restoring || Date.now() - started > 15000) { clearInterval(timer); return; }
      const control = find(saved.current);
      if (!control) return;
      // Wait for account-specific dashboard initialization to finish.
      const view = control.closest('.view');
      if (view && !view.classList.contains('active')) return;
      if (document.documentElement.classList.contains('auth-route-pending')) return;
      restoring = false; replaying = true;
      try { control.click(); } finally { replaying = false; clearInterval(timer); }
    }, 150);
  }
})();
