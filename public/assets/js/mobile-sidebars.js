(() => {
  const mobile = window.matchMedia('(max-width: 760px)');
  const initialized = new WeakSet();
  const drawers = [];
  let active = null;
  const overlay = document.createElement('div'); overlay.className = 'dashboard-drawer-overlay'; overlay.hidden = true;
  document.body.append(overlay);
  function close() {
    if (!active) return;
    const previous = active; active = null;
    previous.sidebar.classList.remove('drawer-open');
    previous.sidebar.inert = mobile.matches;
    previous.button.setAttribute('aria-expanded', 'false');
    overlay.hidden = true; document.body.classList.remove('dashboard-drawer-open');
    if (previous.sidebar.contains(document.activeElement)) previous.button.focus();
  }
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { close(); return; }
    if (event.key !== 'Tab') return;
    const items = [...active.sidebar.querySelectorAll('a[href], button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
    if (!items.length) return;
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
  });
  function scan() {
    document.querySelectorAll('.committee-sidebar, .president-sidebar, .student-dashboard-sidebar, .report-admin-sidebar').forEach(sidebar => {
      if (initialized.has(sidebar)) return;
      initialized.add(sidebar);
      sidebar.classList.add('mobile-dashboard-drawer');
      sidebar.id ||= `dashboardDrawer${drawers.length + 1}`;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'dashboard-drawer-toggle secondary-btn';
      button.textContent = '☰ Dashboard menu'; button.setAttribute('aria-controls', sidebar.id); button.setAttribute('aria-expanded', 'false');
      sidebar.before(button);
      const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'dashboard-drawer-close'; dismiss.textContent = '×';
      dismiss.setAttribute('aria-label', 'Close dashboard menu');
      const heading = document.createElement('div'); heading.className = 'dashboard-drawer-heading';
      const title = document.createElement('strong'); title.textContent = 'Dashboard'; heading.append(title, dismiss);
      sidebar.prepend(heading);
      const entry = { sidebar, button }; drawers.push(entry); sidebar.inert = mobile.matches;
      let touchStartY = null;
      let suppressTapUntil = 0;
      sidebar.addEventListener('touchstart', event => {
        touchStartY = event.touches[0]?.clientY ?? null;
        suppressTapUntil = 0;
      }, { passive: true });
      sidebar.addEventListener('touchmove', event => {
        const currentY = event.touches[0]?.clientY;
        if (touchStartY !== null && currentY !== undefined && Math.abs(currentY - touchStartY) > 8) {
          suppressTapUntil = performance.now() + 450;
        }
      }, { passive: true });
      dismiss.addEventListener('click', close);
      button.addEventListener('click', () => {
        if (active === entry) { close(); return; }
        close(); active = entry; sidebar.inert = false;
        sidebar.classList.add('drawer-open'); overlay.hidden = false;
        document.body.classList.add('dashboard-drawer-open'); button.setAttribute('aria-expanded', 'true'); dismiss.focus();
      });
      sidebar.addEventListener('click', event => {
        if (mobile.matches && performance.now() < suppressTapUntil) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (mobile.matches && !event.target.closest('.dashboard-drawer-close') && event.target.closest('a, button')) {
          // Let existing dashboard selection handlers finish before closing.
          window.setTimeout(close, 0);
        }
      });
    });
  }
  mobile.addEventListener('change', () => { close(); drawers.forEach(({ sidebar }) => sidebar.inert = mobile.matches); });
  scan(); new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
