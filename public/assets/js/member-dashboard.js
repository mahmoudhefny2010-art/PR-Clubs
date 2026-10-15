(() => {
  const list = document.getElementById('memberAssignmentsList');
  if (!list) return;

  let assignments = [];
  let savedQr = {};
  try { savedQr = JSON.parse(window.sessionStorage.getItem('memberAttendanceQr') || '{}') || {}; } catch {}
  let activeToken = String(savedQr.token || '');
  let activeAssignmentId = String(savedQr.assignmentId || '');
  let activeQrDate = String(savedQr.eventDate || '');
  let activeQrTimer = 0;
  let activeQrCountdown = 0;
  let assignmentLoadPromise = null;
  let assignmentsLoadedAt = 0;

  const todayInCairo = () => {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  };
  const apiJson = window.MiuUI.createJsonClient({
    defaults: {"cache":"no-store"},
    fallbackMessage: "Could not complete this request.", tolerateInvalidJson: true, includeStatus: false
  });

  const button = window.MiuUI.button;

  function render() {
    list.replaceChildren();
    const attendanceCount = String(assignments.length);
    const dashboardAttendanceCount = document.getElementById('studentDashboardAttendanceCount');
    const sidebarAttendanceCount = document.getElementById('studentSidebarAttendanceCount');
    if (dashboardAttendanceCount) dashboardAttendanceCount.textContent = attendanceCount;
    if (sidebarAttendanceCount) sidebarAttendanceCount.textContent = attendanceCount;
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
        committee.textContent = `Organizer · ${assignment.committee} · Assigned by ${assignment.assignedBy}`;
      content.append(title, meta, committee);
      const status = document.createElement('span');
      const isToday = String(assignment.eventDate || '').slice(0, 10) === todayInCairo();
      const isPast = String(assignment.eventDate || '').slice(0, 10) < todayInCairo();
      status.className = `member-assignment-status${assignment.status === 'assigned' ? ' is-new' : ''}`;
      status.textContent = assignment.attendanceRecorded ? 'Attendance recorded'
        : isPast ? 'Event date passed' : assignment.status === 'accepted' ? 'Accepted' : 'New request';
      const actions = document.createElement('div');
      actions.className = 'member-assignment-actions';

      if (assignment.status === 'assigned') {
        actions.append(button('Accept request', 'primary-btn', () => acceptAssignment(assignment.id)));
      } else if (!isPast && isToday) {
        if (!assignment.attendanceRecorded || assignment.attendanceRole !== 'organizer') {
          actions.append(button('Record my organizer attendance', 'primary-btn', () => checkInAssignment(assignment, card)));
        }
        actions.append(button('Open attendance QR', 'secondary-btn', () => openQr(assignment, card)));
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
      if (assignment.id === activeAssignmentId && activeToken) {
        qr.classList.remove('hidden');
        refreshQr(qr, activeToken, activeQrDate);
      }
    });
  }

  function loadAssignments(force = false) {
    if (assignmentLoadPromise) return assignmentLoadPromise;
    if (!force && assignmentsLoadedAt && Date.now() - assignmentsLoadedAt < 25_000) return Promise.resolve();
    const operation = (async () => {
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
      assignmentsLoadedAt = Date.now();
      if (activeQrDate && activeQrDate !== todayInCairo()) {
        activeToken = '';
        activeAssignmentId = '';
        activeQrDate = '';
        window.sessionStorage.removeItem('memberAttendanceQr');
      }
      render();
    } catch (error) {
      assignmentsLoadedAt = 0;
      list.replaceChildren();
      const message = document.createElement('p');
      message.className = 'member-assignment-empty is-error';
      message.textContent = error.message;
      list.append(message);
    }
    })();
    assignmentLoadPromise = operation;
    return operation.finally(() => {
      if (assignmentLoadPromise === operation) assignmentLoadPromise = null;
    });
  }

  async function acceptAssignment(id) {
    try {
      const result = await apiJson(`/api/member/attendance-assignments/${encodeURIComponent(id)}/accept`, { method: 'POST' });
      if (result.savedToDatabase !== true) throw new Error('Your response was not confirmed in the database.');
      await loadAssignments(true);
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function checkInAssignment(assignment, card) {
    const actionButtons = card.querySelectorAll('.member-assignment-actions button');
    actionButtons.forEach((button) => { button.disabled = true; });
    const message = document.createElement('p');
    message.className = 'member-assignment-meta';
    message.textContent = 'Recording your attendance from this account and device…';
    card.querySelector('.member-assignment-actions')?.append(message);
    try {
      const result = await apiJson(`/api/member/attendance-assignments/${encodeURIComponent(assignment.id)}/check-in`, { method: 'POST' });
      if (result.savedToDatabase !== true) throw new Error('Your attendance was not confirmed in the database.');
      await loadAssignments(true);
    } catch (error) {
      message.textContent = error.message;
      message.classList.add('is-error');
      actionButtons.forEach((button) => { button.disabled = false; });
    }
  }

  async function refreshQr(qr, token, eventDate) {
    if (activeToken !== token || !qr.isConnected) return;
    window.clearInterval(activeQrCountdown);
    if (String(eventDate || '').slice(0, 10) !== todayInCairo()) {
      activeToken = '';
      activeAssignmentId = '';
      activeQrDate = '';
      window.sessionStorage.removeItem('memberAttendanceQr');
      window.clearTimeout(activeQrTimer);
      qr.classList.add('hidden');
      await loadAssignments(true);
      return;
    }
    try {
      const challenge = await apiJson('/api/member/attendance-qr-challenge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
      });
      if (activeToken !== token || !qr.isConnected) return;
      window.clearInterval(activeQrCountdown);
      const scanUrl = new URL('/attendance', window.location.origin);
      scanUrl.searchParams.set('token', token);
      scanUrl.searchParams.set('code', challenge.code);
      qr.replaceChildren();
      new window.QRCode(qr, { text: scanUrl.toString(), width: 220, height: 220, colorDark: '#102a43', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
      const note = document.createElement('p');
      const updateCountdown = () => {
        const expiresAt = typeof challenge.expiresAt === 'number' ? challenge.expiresAt : Date.parse(challenge.expiresAt);
        const secondsRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
        note.textContent = `This check-in code refreshes in ${secondsRemaining} seconds. It is tied to your MIU account; keep this account signed in on this device.`;
      };
      qr.append(note);
      updateCountdown();
      activeQrCountdown = window.setInterval(updateCountdown, 250);
      window.clearTimeout(activeQrTimer);
      activeQrTimer = window.setTimeout(() => refreshQr(qr, token, eventDate), Math.max(500, challenge.expiresAt - Date.now() + 100));
    } catch (error) {
      if (String(eventDate || '').slice(0, 10) !== todayInCairo()) {
        activeToken = '';
        activeAssignmentId = '';
        activeQrDate = '';
        window.sessionStorage.removeItem('memberAttendanceQr');
        window.clearTimeout(activeQrTimer);
        qr.classList.add('hidden');
        await loadAssignments(true);
        return;
      }
      if (/attendance has ended|event day is over|no longer available/i.test(error.message)) {
        activeToken = '';
        activeAssignmentId = '';
        activeQrDate = '';
        window.clearTimeout(activeQrTimer);
        window.sessionStorage.removeItem('memberAttendanceQr');
        await loadAssignments(true);
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
    window.clearInterval(activeQrCountdown);
    activeToken = '';
    activeAssignmentId = assignment.id;
    try {
      await window.ensureQRCode();
      const result = await apiJson(`/api/member/attendance-assignments/${encodeURIComponent(assignment.id)}/session`, { method: 'POST' });
      if (!result.token) throw new Error('The database did not return a saved QR session.');
      activeToken = result.token;
      activeAssignmentId = assignment.id;
      activeQrDate = assignment.eventDate;
      window.sessionStorage.setItem('memberAttendanceQr', JSON.stringify({ token: activeToken, assignmentId: activeAssignmentId, eventDate: activeQrDate }));
      await refreshQr(qr, activeToken, activeQrDate);
    } catch (error) {
      qr.textContent = error.message;
    }
  }

  document.getElementById('refreshMemberAssignmentsBtn')?.addEventListener('click', () => loadAssignments(true));
  window.setInterval(() => {
    if (!activeToken && document.visibilityState === 'visible' && document.getElementById('myFormsView')?.classList.contains('active')) loadAssignments(true);
  }, 30000);
  window.loadMemberAttendanceAssignments = loadAssignments;
})();
