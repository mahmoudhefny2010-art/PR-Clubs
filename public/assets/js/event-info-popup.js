// Read-only event information using the site's existing modal primitives/styles.
(() => {
  let active = null;
  const text = value => ['string', 'number'].includes(typeof value) ? String(value).trim() : '';
  function dateLabel(value) {
    if (!text(value)) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  window.openEventInfoPopup = (event, trigger = document.activeElement) => {
    if (!event) return;
    active?.close(false);
    const controller = new AbortController();
    const { signal } = controller;
    const modal = document.createElement('div');
    modal.id = 'eventCardInfoModal';
    modal.className = 'event-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'eventCardInfoTitle');
    const panel = document.createElement('article');
    panel.className = 'event-modal-panel';
    panel.tabIndex = -1;
    const closeButton = window.MiuUI.button('\u00d7', 'calendar-close-btn event-modal-close', () => close());
    closeButton.setAttribute('aria-label', 'Close event information');
    const copy = document.createElement('div');
    copy.className = 'event-modal-copy';
    const append = (tag, className, content) => {
      if (!text(content)) return null;
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = content;
      copy.append(element);
      return element;
    };
    append('span', 'event-modal-club', text(event.clubName));
    const heading = append('h2', '', text(event.title) || 'Event');
    heading.id = 'eventCardInfoTitle';
    const formatTime = value => text(value) ? window.formatSiteTime ? window.formatSiteTime(value) : text(value) : '';
    const time = [formatTime(event.time), formatTime(event.endTime)].filter(Boolean).join(' – ');
    append('p', 'event-modal-meta', [dateLabel(event.date), time, text(event.location)].filter(Boolean).join(' · '));
    const description = append('p', 'event-modal-description', text(event.text) || text(event.description));
    if (description) {
      description.id = 'eventCardInfoDescription';
      description.style.overflowWrap = 'anywhere';
      modal.setAttribute('aria-describedby', description.id);
    }
    if (text(event.budget)) append('p', 'event-modal-meta', 'Budget: ' + text(event.budget));
    if (typeof event.registrationEnabled === 'boolean') append('p', 'event-modal-meta', 'Student registration: ' + (event.registrationEnabled ? 'Enabled' : 'Not enabled'));
    if ((event.registrationEnabled || event.attendanceEnabled) && ['members', 'all_students'].includes(event.attendanceAudience)) append('p', 'event-modal-meta', event.attendanceAudience === 'members' ? 'Club members only' : 'Open to all university students');
    if (event.attendanceEnabled === true) append('p', 'event-attendance-status', 'Attendance taken');
    const closeRail = document.createElement('div');
    closeRail.className = 'modal-close-rail';
    closeRail.style.gridColumn = '1 / -1';
    closeRail.append(closeButton);
    panel.append(closeRail);
    const source = text(event.image) || text(event.clubImage);
    let imageUrl;
    try {
      const url = new URL(source, location.origin);
      if (source && (['http:', 'https:'].includes(url.protocol) || /^data:image\//i.test(source))) imageUrl = url.href;
    } catch { /* Missing or invalid optional media is omitted. */ }
    const omitImage = () => {
      panel.querySelector('.event-modal-image')?.remove();
      panel.style.gridTemplateColumns = 'minmax(0, 1fr)';
    };
    if (imageUrl) {
      const image = document.createElement('img');
      image.className = 'event-modal-image';
      image.alt = text(event.title) || 'Event image';
      image.addEventListener('error', omitImage, { signal });
      image.src = imageUrl;
      panel.append(image);
    } else omitImage();
    panel.append(copy); modal.append(panel);
    const hadScrollLock = document.body.classList.contains('modal-open');
    const previousOverflow = document.body.style.overflow;
    const background = [...document.body.children].map(element => [element, element.inert]);
    document.body.append(modal);
    background.forEach(([element]) => { element.inert = true; });
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    let closed = false;
    function close(restoreFocus = true) {
      if (closed) return;
      closed = true;
      controller.abort();
      window.MiuUI.modals.close(modal);
      modal.remove();
      background.forEach(([element, wasInert]) => { if (element.isConnected) element.inert = wasInert; });
      document.body.style.overflow = previousOverflow;
      if (!hadScrollLock) document.body.classList.remove('modal-open');
      if (active?.modal === modal) active = null;
      if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
    }
    active = { modal, close };
    modal.addEventListener('click', click => { if (click.target === modal) close(); }, { signal });
    document.addEventListener('keydown', key => {
      if (key.key === 'Escape') { key.preventDefault(); key.stopPropagation(); close(); return; }
      if (key.key !== 'Tab') return;
      const focusable = [...panel.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length);
      const first = focusable[0] || panel, last = focusable.at(-1) || panel;
      if (key.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { key.preventDefault(); last.focus(); }
      else if (!key.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { key.preventDefault(); first.focus(); }
    }, { capture: true, signal });
    window.addEventListener('pagehide', () => close(false), { once: true, signal });
    window.MiuUI.modals.open(modal);
    closeButton.focus({ preventScroll: true });
  };
})();
