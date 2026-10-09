(() => {
  const openButton = document.getElementById('openAttendanceManagerBtn');
  const dialog = document.getElementById('attendanceQrDialog');
  const eventSelect = document.getElementById('attendanceEventSelect');
  const feedback = document.getElementById('attendanceManagerFeedback');
  const qrResult = document.getElementById('attendanceQrResult');
  const qrCanvas = document.getElementById('attendanceQrCanvas');
  const qrRefreshStatus = document.getElementById('attendanceQrRefreshStatus');
  const recordsList = document.getElementById('attendanceRecordsList');
  const recordsActivityFilter = document.getElementById('attendanceRecordsActivityFilter');
  let attendanceRecords = [];
  let activeQrToken = '';
  let qrRefreshTimeout = 0;
  let qrCountdownInterval = 0;
  let recordsPollTimeout = 0;
  let recordsPollingInFlight = false;
  if (!openButton || !dialog) return;

  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  };
  const formatTime = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : window.formatSiteTime(date);
  };
  const attendanceApprovalLabel = (status) => ({
    pending_pr: 'Waiting for PR',
    pending_sso: 'Waiting for SSO',
    pending_dean: 'SSO approved · Waiting for Dean',
    approved: 'Dean approved · Internal'
  })[status] || 'Waiting for PR';
  const apiJson = async (url, options) => {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'The request failed.');
    return payload;
  };

  function stopQrRotation() {
    window.clearTimeout(qrRefreshTimeout);
    window.clearInterval(qrCountdownInterval);
    qrRefreshTimeout = 0;
    qrCountdownInterval = 0;
    activeQrToken = '';
  }

  async function refreshRotatingQr(token) {
    try {
      const challenge = await apiJson('/api/club/attendance-qr-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if (!dialog.open || activeQrToken !== token) return;
      const scanUrl = new URL('/attendance', window.location.origin);
      scanUrl.searchParams.set('token', token);
      scanUrl.searchParams.set('code', challenge.code);
      qrCanvas.replaceChildren();
      new window.QRCode(qrCanvas, {
        text: scanUrl.toString(),
        width: 230,
        height: 230,
        colorDark: '#102a43',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
      window.clearInterval(qrCountdownInterval);
      const updateCountdown = () => {
        const secondsRemaining = Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 1000));
        qrRefreshStatus.textContent = `A new QR code will appear automatically in ${secondsRemaining} seconds. Attendees need a verified MIU account.`;
      };
      updateCountdown();
      qrCountdownInterval = window.setInterval(updateCountdown, 250);
      qrRefreshTimeout = window.setTimeout(() => refreshRotatingQr(token), Math.max(250, challenge.expiresAt - Date.now() + 100));
    } catch (error) {
      if (activeQrToken !== token) return;
      window.clearInterval(qrCountdownInterval);
      qrCanvas.replaceChildren();
      qrRefreshStatus.textContent = `${error.message} Retrying shortly…`;
      qrRefreshTimeout = window.setTimeout(() => refreshRotatingQr(token), 2500);
    }
  }

  async function loadEvents() {
    eventSelect.replaceChildren(new Option('Loading today’s events…', ''));
    const events = await apiJson('/api/club/attendance-events');
    eventSelect.replaceChildren(new Option(events.length ? 'Choose an event or booth happening today' : 'No events or booths scheduled for today', ''));
    const selectedFilter = recordsActivityFilter.value;
    recordsActivityFilter.replaceChildren(new Option('All events and booths', 'all'));
    events.forEach((event) => {
      const details = [event.itemType === 'booth' ? 'Booth' : 'Event', event.clubName, event.title, event.date, window.formatSiteTime(event.time)].filter(Boolean).join(' · ');
      const option = new Option(details, `${event.clubId}:${event.itemType}:${event.eventRequestId}`);
      option.dataset.clubId = String(event.clubId);
      option.dataset.clubName = event.clubName || '';
      option.dataset.itemType = event.itemType || 'event';
      option.dataset.eventRequestId = String(event.eventRequestId);
      option.dataset.title = event.title;
      eventSelect.add(option);
      recordsActivityFilter.add(new Option(details, `${event.clubId}:${event.itemType}:${event.eventRequestId}`));
    });
    recordsActivityFilter.value = [...recordsActivityFilter.options].some((option) => option.value === selectedFilter) ? selectedFilter : 'all';
    eventSelect.disabled = events.length === 0;
    document.getElementById('createAttendanceQrBtn').disabled = events.length === 0;
  }

  async function loadRecords() {
    attendanceRecords = await apiJson('/api/club/attendance-records');
    window.dashboardUnread?.update('eventAttendance', attendanceRecords.map((record) => `${record.itemType}:${record.eventRequestId}:${record.email}:${record.attendedAt}`));
    renderRecords();
  }

  async function pollAttendanceRecords() {
    if (!dialog.open) return;
    if (!recordsPollingInFlight && document.visibilityState === 'visible') {
      recordsPollingInFlight = true;
      try { await loadRecords(); } catch { /* Keep the last confirmed records and retry on the next poll. */ }
      recordsPollingInFlight = false;
    }
    if (dialog.open) recordsPollTimeout = window.setTimeout(pollAttendanceRecords, 2000);
  }

  function renderRecords() {
    const previousScrollTop = recordsList.scrollTop;
    const previousScrollLeft = recordsList.scrollLeft;
    recordsList.replaceChildren();
    const selectedFilter = recordsActivityFilter.value;
    const records = attendanceRecords.filter((record) => selectedFilter === 'all'
      || `${record.clubId}:${record.itemType || 'event'}:${record.eventRequestId}` === selectedFilter);
    if (!records.length) {
      const empty = document.createElement('p');
      empty.className = 'committee-head-empty';
      empty.textContent = selectedFilter === 'all' ? 'No one has checked in yet.' : 'No attendance has been recorded for this activity yet.';
      recordsList.append(empty);
      recordsList.scrollTop = previousScrollTop;
      recordsList.scrollLeft = previousScrollLeft;
      return;
    }
    const table = document.createElement('table');
    table.className = 'attendance-records-table';
    const head = table.createTHead().insertRow();
    ['Name', 'Email', 'Activity', 'Activity date', 'Activity time', 'Club', 'Check-in date', 'Check-in time', 'Approval status', 'Note'].forEach((label) => {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      head.append(cell);
    });
    const body = table.createTBody();
    records.forEach((record) => {
      const row = body.insertRow();
      const values = [record.name, record.email, `${record.itemType === 'booth' ? 'Booth' : 'Event'}: ${record.eventTitle || ''}`, record.eventDate, window.formatSiteTime(record.eventTime), record.clubName, formatDate(record.attendedAt), formatTime(record.attendedAt)];
      values.forEach((value) => { row.insertCell().textContent = value || '—'; });
      const statusCell = row.insertCell();
      const statusBadge = document.createElement('span');
      statusBadge.className = 'attendance-approval-status';
      statusBadge.textContent = attendanceApprovalLabel(record.approvalStatus);
      statusCell.append(statusBadge);
      row.insertCell().textContent = record.note || '—';
    });
    recordsList.append(table);
    recordsList.scrollTop = previousScrollTop;
    recordsList.scrollLeft = previousScrollLeft;
  }

  async function refreshDashboard() {
    feedback.textContent = 'Loading attendance data…';
    feedback.classList.remove('is-error');
    try {
      await Promise.all([loadEvents(), loadRecords()]);
      feedback.textContent = '';
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add('is-error');
    }
  }

    openButton.addEventListener('click', () => {
    stopQrRotation();
    qrResult.classList.add('hidden');
    qrCanvas.replaceChildren();
    dialog.showModal();
    refreshDashboard().finally(() => {
      if (dialog.open) recordsPollTimeout = window.setTimeout(pollAttendanceRecords, 2000);
    });
  });
  document.getElementById('closeAttendanceQrBtn')?.addEventListener('click', () => { stopQrRotation(); dialog.close(); });
  dialog.addEventListener('close', () => {
    stopQrRotation();
    window.clearTimeout(recordsPollTimeout);
    recordsPollTimeout = 0;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && dialog.open) {
      if (activeQrToken) {
        window.clearTimeout(qrRefreshTimeout);
        refreshRotatingQr(activeQrToken);
      }
      if (!recordsPollingInFlight) {
        window.clearTimeout(recordsPollTimeout);
        pollAttendanceRecords();
      }
    }
  });
  document.getElementById('refreshAttendanceBtn')?.addEventListener('click', refreshDashboard);
  recordsActivityFilter?.addEventListener('change', renderRecords);

  document.getElementById('attendanceQrForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const option = eventSelect.selectedOptions[0];
    if (!option?.dataset.clubId) return;
    const button = document.getElementById('createAttendanceQrBtn');
    stopQrRotation();
    button.disabled = true;
    feedback.textContent = 'Creating QR code…';
    feedback.classList.remove('is-error');
    qrCanvas.replaceChildren();
    try {
      if (typeof window.QRCode !== 'function') throw new Error('QR generator did not load. Refresh the page and try again.');
      const result = await apiJson('/api/club/attendance-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubId: Number(option.dataset.clubId),
          itemType: option.dataset.itemType,
          eventRequestId: Number(option.dataset.eventRequestId)
        })
      });
      activeQrToken = result.token;
      const itemLabel = option.dataset.itemType === 'booth' ? 'Booth' : 'Event';
      document.getElementById('attendanceQrEventTitle').textContent = `${itemLabel}: ${option.dataset.title}${option.dataset.clubName ? ` — ${option.dataset.clubName}` : ''}`;
      qrResult.classList.remove('hidden');
      feedback.textContent = 'Attendance session saved. Starting the rotating QR code…';
      qrResult.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      await refreshRotatingQr(activeQrToken);
      await loadRecords();
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add('is-error');
    } finally {
      button.disabled = eventSelect.disabled;
    }
  });
})();
