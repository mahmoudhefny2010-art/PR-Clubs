(() => {
  const list = document.getElementById('memberAssignmentsList');
  if (!list) return;

  let assignments = [];
  let activeToken = '';
  let activeQrDate = '';
  let activeQrTimer = 0;

  const todayInCairo = () => {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  };
  const apiJson = async (url, options) => {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Could not complete this request.');
    return result;
  };

  function button(label, className, onClick) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.textContent = label;
    element.addEventListener('click', onClick);
    return element;
  }

  function render() {
    list.replaceChildren();
    if (!assignments.length) {
      const empty = document.createElement('p');
      empty.className = 'member-assignment-empty';
      empty.textContent = 'No attendance task is assigned to your account for today.';
      list.append(empty);
      return;
    }

    assignments.forEach((assignment) => {
      const card = document.createElement('article');
      card.className = 'member-assignment-card';
      const content = document.createElement('div');
      const title = document.createElement('h4');
      title.textContent = assignment.eventTitle || 'Event attendance';
      const meta = document.createElement('p');
      const kind = assignment.itemType === 'booth' ? 'Booth' : 'Event';
      meta.textContent = [assignment.clubName, kind, assignment.eventDate, assignment.eventTime].filter(Boolean).join(' · ');
      const committee = document.createElement('p');
      committee.className = 'member-assignment-meta';
      committee.textContent = `${assignment.committee} · Assigned by ${assignment.assignedBy}`;
      content.append(title, meta, committee);
      const status = document.createElement('span');
      const isToday = String(assignment.eventDate || '').slice(0, 10) === todayInCairo();
      const isPast = String(assignment.eventDate || '').slice(0, 10) < todayInCairo();
      status.className = `member-assignment-status${assignment.status === 'assigned' ? ' is-new' : ''}`;
      status.textContent = isPast ? 'Event date passed' : assignment.status === 'accepted' ? 'Accepted' : 'New request';
      const actions = document.createElement('div');
      actions.className = 'member-assignment-actions';

      if (assignment.status === 'assigned') {
        actions.append(button('Accept request', 'primary-btn', () => acceptAssignment(assignment.id)));
      } else if (!isPast && isToday) {
        actions.append(button('Open attendance QR', 'primary-btn', () => openQr(assignment, card)));
      } else if (!isPast) {
        const note = document.createElement('span');
        note.className = 'member-assignment-meta';
        note.textContent = 'The QR button becomes available on the event date.';
        actions.append(note);
      }
      card.append(content, status, actions);
      const qr = document.createElement('div');
      qr.className = 'member-assignment-qr hidden';
      qr.setAttribute('aria-live', 'polite');
      card.append(qr);
      list.append(card);
    });
  }

  async function loadAssignments() {
    list.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'member-assignment-empty';
    loading.textContent = 'Loading your attendance requests from the database…';
    list.append(loading);
    try {
      const response = await fetch('/api/member/attendance-assignments', { cache: 'no-store' });
      if (response.status === 401) throw new Error('Sign in with your MIU Google account to view member tasks.');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Could not load member attendance requests.');
      assignments = Array.isArray(payload) ? payload : [];
      render();
    } catch (error) {
      list.replaceChildren();
      const message = document.createElement('p');
      message.className = 'member-assignment-empty is-error';
      message.textContent = error.message;
      list.append(message);
    }
  }

  async function acceptAssignment(id) {
    try {
      const result = await apiJson(`/api/member/attendance-assignments/${encodeURIComponent(id)}/accept`, { method: 'POST' });
      if (result.savedToDatabase !== true) throw new Error('Your response was not confirmed in the database.');
      await loadAssignments();
    } catch (error) {
      window.alert(error.message);
    }
  }

  function loadQrLibrary() {
    if (typeof window.QRCode === 'function') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
      script.async = true;
      script.onload = () => typeof window.QRCode === 'function' ? resolve() : reject(new Error('QR generator did not load.'));
      script.onerror = () => reject(new Error('QR generator could not be reached. Check your connection and retry.'));
      document.head.append(script);
    });
  }

  async function refreshQr(qr, token, eventDate) {
    if (activeToken !== token || !qr.isConnected) return;
    if (String(eventDate || '').slice(0, 10) !== todayInCairo()) {
      activeToken = '';
      activeQrDate = '';
      window.clearTimeout(activeQrTimer);
      qr.classList.add('hidden');
      await loadAssignments();
      return;
    }
    try {
      const challenge = await apiJson('/api/member/attendance-qr-challenge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
      });
      if (activeToken !== token || !qr.isConnected) return;
      const scanUrl = new URL('/attendance', window.location.origin);
      scanUrl.searchParams.set('token', token);
      scanUrl.searchParams.set('code', challenge.code);
      qr.replaceChildren();
      new window.QRCode(qr, { text: scanUrl.toString(), width: 220, height: 220, colorDark: '#102a43', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
      const note = document.createElement('p');
      note.textContent = 'This check-in code refreshes every 20 seconds. Students scan it with their MIU account.';
      qr.append(note);
      window.clearTimeout(activeQrTimer);
      activeQrTimer = window.setTimeout(() => refreshQr(qr, token, eventDate), Math.max(500, challenge.expiresAt - Date.now() + 100));
    } catch (error) {
      if (String(eventDate || '').slice(0, 10) !== todayInCairo()) {
        activeToken = '';
        activeQrDate = '';
        window.clearTimeout(activeQrTimer);
        qr.classList.add('hidden');
        await loadAssignments();
        return;
      }
      qr.textContent = `${error.message} Retrying shortly…`;
      window.clearTimeout(activeQrTimer);
      activeQrTimer = window.setTimeout(() => refreshQr(qr, token, eventDate), 2500);
    }
  }

  async function openQr(assignment, card) {
    const qr = card.querySelector('.member-assignment-qr');
    qr.classList.remove('hidden');
    qr.textContent = 'Creating an attendance session…';
    window.clearTimeout(activeQrTimer);
    activeToken = '';
    try {
      await loadQrLibrary();
      const result = await apiJson(`/api/member/attendance-assignments/${encodeURIComponent(assignment.id)}/session`, { method: 'POST' });
      if (!result.token) throw new Error('The database did not return a saved QR session.');
      activeToken = result.token;
      activeQrDate = assignment.eventDate;
      await refreshQr(qr, activeToken, activeQrDate);
    } catch (error) {
      qr.textContent = error.message;
    }
  }

  document.getElementById('refreshMemberAssignmentsBtn')?.addEventListener('click', loadAssignments);
  window.setInterval(() => {
    if (!activeToken && document.visibilityState === 'visible' && document.getElementById('myFormsView')?.classList.contains('active')) loadAssignments();
  }, 30000);
  window.loadMemberAttendanceAssignments = loadAssignments;
})();
