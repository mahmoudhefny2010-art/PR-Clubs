(() => {
  'use strict';
  const grid = document.getElementById('widgetGrid');
  const toggle = document.getElementById('arrangeCards');
  const reset = document.getElementById('resetCardOrder');
  const status = document.getElementById('cardOrderStatus');
  const defaults = [...(window.adminDashboardTools.groups || []).map(group => group.id), ...window.adminDashboardTools.map(tool => tool.id)];
  let order = [...defaults], storageKey, arranging = false, drag, scrollFrame;
  const cards = () => [...grid.querySelectorAll('.v2-widget')];
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(order)); status.textContent = 'Your card order is saved on this browser.'; }
    catch { status.textContent = 'Order updated. Browser storage is unavailable, so it cannot be kept after reload.'; }
  }
  function remember() {
    // Replace only visible positions so filters never drop or reset hidden tools.
    const visible = cards().map(card => card.dataset.tool), selected = new Set(visible);
    let index = 0;
    order = order.map(id => selected.has(id) ? visible[index++] : id);
    persist();
  }
  function move(card, target) {
    const visible = cards(), from = visible.indexOf(card), to = visible.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    visible.splice(from, 1); visible.splice(to, 0, card);
    visible.forEach(item => grid.append(item));
  }
  function finish(cancel = false) {
    if (!drag) return;
    cancelAnimationFrame(scrollFrame);
    const previous = drag;
    drag = null;
    previous.card.classList.remove('is-dragging');
    if (grid.hasPointerCapture(previous.pointer)) grid.releasePointerCapture(previous.pointer);
    if (cancel) previous.before.forEach(card => { if (card.isConnected) grid.append(card); });
    else if (previous.moved && previous.card.isConnected) remember();
  }
  window.adminDashboardLayout = {
    sortTools(tools) { finish(true); const rank = new Map(order.map((id, index) => [id, index])); return [...tools].sort((a, b) => rank.get(a.id) - rank.get(b.id)); }
  };
  window.adminDashboardData.ready.then(state => {
    storageKey = `miu:admin-card-order:v1:${state.cacheKey}`;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(saved)) order = [...new Set(saved.filter(id => defaults.includes(id))), ...defaults.filter(id => !saved.includes(id))];
    } catch { /* Keep the default priorities when storage is unavailable. */ }
    toggle.disabled = false;
    document.dispatchEvent(new Event('miu:admin-layout-ready'));
  }).catch(() => { status.textContent = 'Reconnect and refresh to arrange your cards.'; });
  toggle.addEventListener('click', () => {
    finish(true); arranging = !arranging;
    grid.classList.toggle('is-arranging', arranging);
    toggle.setAttribute('aria-pressed', String(arranging));
    toggle.textContent = arranging ? 'Done arranging' : 'Arrange cards';
    reset.hidden = !arranging;
    status.hidden = !arranging;
    status.textContent = arranging ? 'Drag a card to move it, or focus it and use the arrow keys. Changes save automatically.' : '';
  });
  reset.addEventListener('click', () => {
    finish(true); order = [...defaults]; persist();
    document.dispatchEvent(new Event('miu:admin-layout-ready'));
    status.textContent = 'Default priorities restored.';
  });
  grid.addEventListener('click', event => { if (arranging) event.preventDefault(); });
  grid.addEventListener('dragstart', event => { if (arranging) event.preventDefault(); });
  grid.addEventListener('keydown', event => {
    if (!arranging || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const card = event.target.closest('.v2-widget');
    if (!card) return;
    event.preventDefault();
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
    const visible = cards(), target = visible[visible.indexOf(card) + step];
    if (target) { move(card, target); remember(); card.focus({ preventScroll: true }); }
  });
  grid.addEventListener('pointerdown', event => {
    if (!arranging || !event.isPrimary || event.button !== 0) return;
    const card = event.target.closest('.v2-widget');
    if (!card) return;
    drag = { card, pointer: event.pointerId, x: event.clientX, y: event.clientY, lastY: event.clientY, before: cards(), moved: false };
    grid.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  function atPoint(x, y) {
    const target = document.elementFromPoint(x, y)?.closest('.v2-widget');
    if (target && grid.contains(target)) move(drag.card, target);
  }
  function autoScroll() {
    if (!drag?.moved) return;
    const edge = 70, y = drag.lastY;
    const amount = y < edge ? -12 : y > innerHeight - edge ? 12 : 0;
    if (amount) { window.scrollBy(0, amount); atPoint(drag.lastX, y); }
    scrollFrame = requestAnimationFrame(autoScroll);
  }
  grid.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag.lastX = event.clientX; drag.lastY = event.clientY;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
    if (!drag.moved) { drag.moved = true; drag.card.classList.add('is-dragging'); autoScroll(); }
    atPoint(event.clientX, event.clientY);
  });
  grid.addEventListener('pointerup', () => finish());
  grid.addEventListener('pointercancel', () => finish(true));
  grid.addEventListener('lostpointercapture', () => finish(true));
})();
