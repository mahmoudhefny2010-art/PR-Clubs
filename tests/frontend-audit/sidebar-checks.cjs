// Exercise the real shared drawer scripts and page navigation, not a replacement
// sidebar. API fixtures are supplied by the existing browser audit harness.
async function sidebarChecks() {
  let assertions = 0;
  const check = (value, message) => { assertions++; if (!value) throw new Error(message); };
  const pause = () => new Promise(resolve => setTimeout(resolve, 40));
  const wait = async (condition, message) => {
    const started = performance.now();
    while (!condition()) { if (performance.now() - started > 4000) throw new Error(message); await pause(); }
  };
  const sidebar = document.querySelector('.committee-sidebar');
  await wait(() => document.querySelector('.dashboard-drawer-toggle'), 'Shared drawer bootstrap did not run');
  const toggle = document.querySelector('.dashboard-drawer-toggle');
  const close = sidebar.querySelector('.dashboard-drawer-close');
  const overlay = document.querySelector('.dashboard-drawer-overlay');
  const isMiu = location.pathname.includes('miu-events');
  const panel = isMiu ? 'miuEventsPanel' : 'pendingRequestsSection';
  const nav = sidebar.querySelector(`[data-dashboard-panel="${panel}"]`);
  const r = element => element.getBoundingClientRect();
  const visible = element => getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden';
  const fits = () => document.documentElement.scrollWidth <= innerWidth;
  const hit = element => { const box = r(element); return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); };
  check(sidebar.classList.contains('mobile-dashboard-drawer'), 'Page must use the shared drawer');
  check(toggle.getAttribute('aria-controls') === sidebar.id, 'Trigger must control this sidebar');
  check(fits(), 'Closed page must not overflow horizontally');
  if (isMiu) check(sidebar.querySelector('a[href="/pages/miu-attendance.html"]'), 'Attendance destination must remain intact');
  const links = [...sidebar.querySelectorAll('a[href]')].map(link => [link.textContent.trim(), link.getAttribute('href')]);
  if (matchMedia('(max-width: 760px)').matches) {
    check(visible(toggle) && r(toggle).height >= 44, 'Mobile trigger must be visible with a usable tap target');
    check(sidebar.inert && !visible(sidebar) && overlay.hidden, 'Closed drawer must not block the page');
    toggle.scrollIntoView({ block: 'center', behavior: 'instant' });
    check(hit(toggle), 'Trigger must be reachable by pointer');
    const open = async () => {
      toggle.click(); await wait(() => visible(sidebar) && sidebar.classList.contains('drawer-open'), 'Drawer did not open');
      check(toggle.getAttribute('aria-expanded') === 'true' && !sidebar.inert, 'Open state and accessibility must agree');
      check(!overlay.hidden && visible(overlay), 'Open drawer needs its shared overlay');
      check(getComputedStyle(document.body).overflow === 'hidden', 'Open drawer must lock page scrolling');
    };
    const closed = async () => {
      await wait(() => !sidebar.classList.contains('drawer-open'), 'Drawer did not close');
      check(toggle.getAttribute('aria-expanded') === 'false' && sidebar.inert && overlay.hidden, 'Closing must reset all state');
      check(!document.body.classList.contains('dashboard-drawer-open'), 'Closing must restore page scrolling');
    };
    await open();
    check(r(sidebar).left === 0 && Math.abs(r(sidebar).width - Math.min(300, innerWidth - 48)) < 1, 'Drawer must match the shared width and opening direction');
    check(Math.abs(r(sidebar).height - innerHeight) <= 1, 'Drawer must fit the viewport height');
    check(hit(close) && r(close).width >= 40 && r(close).height >= 40, 'Close control must be visible above the overlay');
    const headingBox = r(sidebar.querySelector('.dashboard-drawer-heading')), closeBox = r(close);
    check(Math.abs(headingBox.y + headingBox.height / 2 - closeBox.y - closeBox.height / 2) < 24, 'Close control and drawer heading must share the established header alignment');
    check(document.activeElement === close, 'Opening must focus the close control');
    const items = [...sidebar.querySelectorAll('a[href],button:not(:disabled)')].filter(item => item.getClientRects().length);
    items.at(-1).focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    check(document.activeElement === items[0], 'Keyboard focus must wrap inside the open drawer');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    check(document.activeElement === items.at(-1), 'Reverse keyboard focus must wrap inside the drawer');
    const canScroll = sidebar.scrollHeight > sidebar.clientHeight;
    if (canScroll) {
      sidebar.scrollTop = sidebar.scrollHeight; await pause();
      check(sidebar.scrollTop > 0, 'Long navigation must scroll inside the drawer');
      check(r(sidebar).width <= innerWidth, 'Scrolling navigation must remain within the viewport');
      sidebar.scrollTop = 0;
    }
    if (innerHeight <= 320) check(canScroll, 'Short landscape must exercise the overflowing navigation');
    close.click(); await closed();
    check(document.activeElement === toggle, 'Closing must restore focus to the trigger');
    await open(); overlay.click(); await closed();
    await open(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await closed();
    for (let i = 0; i < 2; i++) { await open(); close.click(); await closed(); }
    await open(); nav.click(); await closed();
    check(nav.classList.contains('is-active') && !document.getElementById(panel).hidden, 'Navigation must activate the requested panel');
    check(sidebar.querySelectorAll('.committee-sidebar-link.is-active').length === 1, 'Only the selected navigation item is active');
    if (isMiu) {
      check(document.getElementById('miuEventsOverview').hidden, 'Previous MIU panel must close');
      window.scrollTo({ top: 180, behavior: 'instant' });
      check(window.scrollY > 0, 'Long main content must scroll after navigation closes the drawer');
      toggle.scrollIntoView({ block: 'center', behavior: 'instant' });
      await open();
      sidebar.querySelector('[data-dashboard-panel="miuEventRegistrationsPanel"]').click(); await closed();
      check(!document.getElementById('miuEventRegistrationsPanel').hidden, 'Registrations navigation must remain functional');
    }
    toggle.scrollIntoView({ block: 'center', behavior: 'instant' }); await open();
    window.__sidebarCheck = { mobile: true, assertions, canScroll, links, width: r(sidebar).width };
  } else {
    check(!visible(toggle), 'Tablet/desktop must retain the existing non-drawer layout');
    check(!sidebar.inert && visible(sidebar) && overlay.hidden, 'Desktop navigation must remain available without an overlay');
    nav.click();
    check(nav.classList.contains('is-active') && !document.getElementById(panel).hidden, 'Desktop panel navigation must remain functional');
    check(!document.body.classList.contains('dashboard-drawer-open'), 'Desktop navigation must not lock scrolling');
    check(fits(), 'Desktop/tablet content must fit the viewport');
    window.__sidebarCheck = { mobile: false, assertions, links, width: r(sidebar).width, position: getComputedStyle(sidebar).position };
  }
  check(fits(), 'Open drawer must not cause page overflow');
  window.__sidebarCheck.assertions = assertions;
  window.__sidebarTestPassed = true;
}
module.exports = { action: `(${sidebarChecks.toString()})()` };
