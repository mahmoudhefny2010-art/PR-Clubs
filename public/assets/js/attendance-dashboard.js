(() => {
  const openButton = document.getElementById('openAttendanceManagerBtn');
  const dialog = document.getElementById('attendanceQrDialog');
  const eventSelect = document.getElementById('attendanceEventSelect');
  const activityList = document.getElementById('attendanceActivityList');
  const selfCheckinForm = document.getElementById('attendanceSelfCheckinForm');
  const selfCheckinEvent = document.getElementById('attendanceSelfCheckinEvent');
  const selfCheckinFeedback = document.getElementById('attendanceSelfCheckinFeedback');
  const feedback = document.getElementById('attendanceManagerFeedback');
  const qrResult = document.getElementById('attendanceQrResult');
  const qrCanvas = document.getElementById('attendanceQrCanvas');
  const qrRefreshStatus = document.getElementById('attendanceQrRefreshStatus');
  const recordsList = document.getElementById('attendanceRecordsList');
  const recordsActivityFilter = document.getElementById('attendanceRecordsActivityFilter');
  const delegationPanel = document.getElementById('attendanceDelegationPanel');
  const delegationForm = document.getElementById('attendanceDelegationForm');
  const delegationMember = document.getElementById('attendanceDelegationMember');
  const delegationEvent = document.getElementById('attendanceDelegationEvent');
  const delegationFeedback = document.getElementById('attendanceDelegationFeedback');
  let attendanceRecords = [];
  let attendanceEvents = [];
  let delegationOptionsLoaded = false;
  let delegationOptionsDate = '';
  let attendanceDataDate = '';
  let qrCodeLoadPromise = null;
  let activeQrToken = '';
  let activeQrActivityKey = '';
  let qrRefreshTimeout = 0;
  let qrCountdownInterval = 0;
  let recordsPollTimeout = 0;
  let recordsPollingInFlight = false;
  if (!openButton || !dialog) return;

  function loadQrCodeLibrary() {
    if (typeof window.QRCode === 'function') return Promise.resolve();
    if (qrCodeLoadPromise) return qrCodeLoadPromise;

    qrCodeLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
      script.async = true;
      script.onload = () => typeof window.QRCode === 'function'
        ? resolve()
        : reject(new Error('QR generator did not load. Please try again.'));
      script.onerror = () => reject(new Error('QR generator could not be reached. Check your connection and try again.'));
      document.head.append(script);
    }).catch((error) => {
      qrCodeLoadPromise = null;
      throw error;
    });

    return qrCodeLoadPromise;
  }

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
    approved: 'Dean approved · Internal',
    rejected: 'Rejected'
  })[status] || 'Waiting for PR';
  const attendanceActivityKey = (activity) => `${activity.clubId}:${activity.itemType || 'event'}:${activity.eventRequestId}`;
  const apiJson = async (url, options) => {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'The request failed.');
    return payload;
  };
  function cairoTodayKey() {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function fillRecordsActivityFilter() {
    const previous = recordsActivityFilter.value || 'all';
    const activities = new Map();
    attendanceEvents.forEach((activity) => {
      activities.set(`${activity.clubId}:${activity.itemType}:${activity.eventRequestId}`, activity);
    });
    attendanceRecords.forEach((record) => {
      const key = `${record.clubId}:${record.itemType || 'event'}:${record.eventRequestId}`;
      if (!activities.has(key)) activities.set(key, {
        clubId: record.clubId, clubName: record.clubName || '', itemType: record.itemType || 'event',
        eventRequestId: record.eventRequestId, title: record.eventTitle || 'Archived activity',
        date: record.eventDate || '', time: record.eventTime || ''
      });
    });
    recordsActivityFilter.replaceChildren(new Option('All event and booth history', 'all'));
    [...activities.values()]
      .sort((left, right) => String(right.date).localeCompare(String(left.date)) || left.title.localeCompare(right.title))
      .forEach((activity) => {
        const text = [activity.itemType === 'booth' ? 'Booth' : 'Event', activity.clubName, activity.title, activity.date, window.formatSiteTime(activity.time)]
          .filter(Boolean).join(' · ');
        recordsActivityFilter.add(new Option(text, `${activity.clubId}:${activity.itemType}:${activity.eventRequestId}`));
      });
    recordsActivityFilter.value = [...recordsActivityFilter.options].some((option) => option.value === previous) ? previous : 'all';
  }

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
      if (/event day is over|has expired/i.test(error.message)) {
        stopQrRotation();
        qrRefreshStatus.textContent = 'This attendance QR expired when the event day ended.';
        feedback.textContent = 'Attendance is closed for this event.';
        return;
      }
      qrRefreshStatus.textContent = `${error.message} Retrying shortly…`;
      qrRefreshTimeout = window.setTimeout(() => refreshRotatingQr(token), 2500);
    }
  }

  async function loadEvents() {
    eventSelect.replaceChildren(new Option('Loading today’s events…', ''));
    if (selfCheckinEvent) selfCheckinEvent.replaceChildren(new Option('Loading today’s events…', ''));
    const events = await apiJson('/api/club/attendance-events');
    attendanceEvents = events;
    renderManagedActivities();
    const openEvents = events.filter((event) => !event.attendanceEnded);
    eventSelect.replaceChildren(new Option(openEvents.length ? 'Choose an event or booth happening today' : 'No open events or booths today', ''));
    openEvents.forEach((event) => {
      const details = [event.itemType === 'booth' ? 'Booth' : 'Event', event.clubName, event.title, event.date, window.formatSiteTime(event.time)].filter(Boolean).join(' · ');
      const option = new Option(details, `${event.clubId}:${event.itemType}:${event.eventRequestId}`);
      option.dataset.clubId = String(event.clubId);
      option.dataset.clubName = event.clubName || '';
      option.dataset.itemType = event.itemType || 'event';
      option.dataset.eventRequestId = String(event.eventRequestId);
      option.dataset.title = event.title;
      eventSelect.add(option);
    });
    if (selfCheckinEvent) {
      const ownClubEvents = openEvents.filter((event) => String(event.clubId) === String(dialog.dataset.clubId));
      selfCheckinEvent.replaceChildren(new Option(ownClubEvents.length ? 'Choose your club’s event or booth' : 'No open events or booths for your club today', ''));
      ownClubEvents.forEach((activity) => {
        const kind = activity.itemType === 'booth' ? 'Booth' : 'Event';
        const option = new Option(`${kind} · ${activity.title} · ${activity.date} · ${window.formatSiteTime(activity.time)}`, `${activity.clubId}:${activity.itemType}:${activity.eventRequestId}`);
        option.dataset.clubId = String(activity.clubId);
        option.dataset.itemType = activity.itemType;
        option.dataset.eventRequestId = String(activity.eventRequestId);
        option.dataset.title = activity.title;
        selfCheckinEvent.add(option);
      });
      selfCheckinEvent.disabled = ownClubEvents.length === 0;
      document.getElementById('attendanceSelfCheckinBtn').disabled = ownClubEvents.length === 0;
    }
    fillRecordsActivityFilter();
    eventSelect.disabled = openEvents.length === 0;
    document.getElementById('createAttendanceQrBtn').disabled = openEvents.length === 0;
  }

  function renderManagedActivities() {
    if (!activityList) return;
    activityList.replaceChildren();
    const managedActivities = attendanceEvents.filter((activity) => String(activity.clubId) === String(dialog.dataset.clubId));
    if (!managedActivities.length) {
      const empty = document.createElement('p');
      empty.className = 'committee-head-empty';
      empty.textContent = 'No events or booths are scheduled for today.';
      activityList.append(empty);
      return;
    }
    managedActivities.forEach((activity) => {
      const card = document.createElement('article');
      card.className = 'attendance-activity-card';
      const content = document.createElement('div');
      content.className = 'attendance-activity-content';
      const title = document.createElement('h3');
      title.textContent = activity.title;
      const meta = document.createElement('p');
      meta.className = 'attendance-activity-meta';
      meta.textContent = [activity.clubName, activity.itemType === 'booth' ? 'Booth' : 'Event', activity.date, window.formatSiteTime(activity.time)].filter(Boolean).join(' · ');
      const status = document.createElement('span');
      status.className = `attendance-activity-status${activity.attendanceEnded ? ' is-processing' : ' is-pending'}`;
      status.textContent = activity.attendanceEnded ? 'Processing · PR review' : 'Attendance open';
      content.append(title, meta, status);
      card.append(content);
      if (!activity.attendanceEnded) {
        const endButton = document.createElement('button');
        endButton.type = 'button';
        endButton.className = 'attendance-activity-end';
        endButton.textContent = 'End attendance';
        endButton.addEventListener('click', () => endActivityAttendance(activity, endButton));
        card.append(endButton);
      }
      activityList.append(card);
    });
  }

  async function endActivityAttendance(activity, button) {
    if (!window.confirm(`End attendance for “${activity.title}”? New check-ins will stop and the full list will go to PR.`)) return;
    button.disabled = true;
    feedback.textContent = 'Ending attendance and sending the list to PR…';
    feedback.classList.remove('is-error');
    try {
      await apiJson(`/api/club/attendance-events/${encodeURIComponent(activity.clubId)}/${encodeURIComponent(activity.itemType)}/${encodeURIComponent(activity.eventRequestId)}/end`, { method: 'POST' });
      if (activeQrActivityKey === attendanceActivityKey(activity)) {
        stopQrRotation();
        activeQrActivityKey = '';
        qrCanvas.replaceChildren();
        qrResult.classList.add('hidden');
      }
      feedback.textContent = `${activity.title}: attendance ended. The list is processing with PR.`;
      await Promise.all([loadEvents(), loadRecords()]);
    } catch (error) {
      button.disabled = false;
      feedback.textContent = error.message;
      feedback.classList.add('is-error');
    }
  }

  async function loadDelegationOptions() {
    if (!delegationPanel || delegationPanel.classList.contains('hidden') || !delegationPanel.open) return;
    delegationOptionsLoaded = false;
    delegationMember.replaceChildren(new Option('Loading members…', ''));
    delegationEvent.replaceChildren(new Option('Loading today’s activities…', ''));
    try {
      const options = await apiJson('/api/club/attendance-assignment-options');
      delegationMember.replaceChildren(new Option(options.members.length ? 'Choose a member' : 'No eligible members', ''));
      options.members.forEach((member) => delegationMember.add(new Option(member.name, member.email)));
      delegationEvent.replaceChildren(new Option(options.events.length ? 'Choose today’s event or booth' : 'No events or booths today', ''));
      options.events.forEach((activity) => {
        const kind = activity.itemType === 'booth' ? 'Booth' : 'Event';
        const option = new Option(`${activity.date} · ${kind} · ${activity.title} · ${activity.clubName}`, `${activity.clubId}:${activity.itemType}:${activity.eventRequestId}`);
        option.dataset.clubId = String(activity.clubId);
        option.dataset.itemType = activity.itemType;
        option.dataset.eventRequestId = String(activity.eventRequestId);
        delegationEvent.add(option);
      });
      delegationOptionsLoaded = true;
      delegationOptionsDate = cairoTodayKey();
    } catch (error) {
      delegationMember.replaceChildren(new Option('Could not load members', ''));
      delegationEvent.replaceChildren(new Option('Could not load activities', ''));
      delegationFeedback.textContent = error.message;
      delegationFeedback.classList.add('is-error');
    }
  }

  async function loadRecords() {
    attendanceRecords = await apiJson('/api/club/attendance-records');
    fillRecordsActivityFilter();
    window.dashboardUnread?.update('eventAttendance', attendanceRecords.map((record) => `${record.itemType}:${record.eventRequestId}:${record.email}:${record.attendedAt}`));
    renderRecords();
  }

  async function pollAttendanceRecords() {
    if (!dialog.open) return;
    if (!recordsPollingInFlight && document.visibilityState === 'visible') {
      recordsPollingInFlight = true;
      try {
        if (attendanceDataDate && attendanceDataDate !== cairoTodayKey()) {
          await refreshDashboard();
          if (delegationPanel?.open) await loadDelegationOptions();
        } else {
          await loadRecords();
        }
      } catch { /* Keep the last confirmed records and retry on the next poll. */ }
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
      statusBadge.textContent = record.approvalStatus === 'pending_pr' && record.attendanceEnded
        ? 'Processing · PR review'
        : attendanceApprovalLabel(record.approvalStatus);
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
      const historyOnly = dialog.dataset.historyOnly === 'true';
      const hasSelfCheckin = dialog.dataset.selfCheckin === 'true';
      await Promise.all([...(historyOnly && !hasSelfCheckin ? [] : [loadEvents()]), loadRecords()]);
      attendanceDataDate = cairoTodayKey();
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
    const historyOnly = dialog.dataset.historyOnly === 'true';
    document.getElementById('attendanceQrForm').hidden = historyOnly;
    selfCheckinForm?.classList.toggle('hidden', dialog.dataset.selfCheckin !== 'true');
    if (selfCheckinFeedback) {
      selfCheckinFeedback.textContent = '';
      selfCheckinFeedback.classList.remove('is-error');
    }
    delegationPanel?.classList.toggle('hidden', historyOnly || delegationPanel.classList.contains('hidden'));
    const recordsDetails = document.getElementById('attendanceRecordsDetails');
    if (recordsDetails) recordsDetails.open = historyOnly;
    dialog.showModal();
    if (delegationPanel?.open && (!delegationOptionsLoaded || delegationOptionsDate !== cairoTodayKey())) loadDelegationOptions();
    if (!historyOnly) loadQrCodeLibrary().catch((error) => {
      if (dialog.open) {
        feedback.textContent = error.message;
        feedback.classList.add('is-error');
      }
    });
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

  selfCheckinForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const option = selfCheckinEvent.selectedOptions[0];
    const name = document.getElementById('attendanceSelfCheckinName').value.trim();
    if (!name || !option?.dataset.clubId || String(option.dataset.clubId) !== String(dialog.dataset.clubId)) return;
    const button = document.getElementById('attendanceSelfCheckinBtn');
    button.disabled = true;
    selfCheckinFeedback.textContent = 'Recording your attendance…';
    selfCheckinFeedback.classList.remove('is-error');
    try {
      const result = await apiJson('/api/attendance/admin-self-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          clubId: Number(option.dataset.clubId),
          itemType: option.dataset.itemType,
          eventRequestId: Number(option.dataset.eventRequestId)
        })
      });
      if (result.savedToDatabase !== true) throw new Error('The database did not confirm your attendance.');
      selfCheckinFeedback.textContent = result.message || 'Your attendance was recorded.';
      selfCheckinForm.reset();
      await loadRecords();
    } catch (error) {
      selfCheckinFeedback.textContent = error.message;
      selfCheckinFeedback.classList.add('is-error');
    } finally {
      button.disabled = selfCheckinEvent.disabled;
    }
  });
  delegationPanel?.addEventListener('toggle', () => {
    if (delegationPanel.open && (!delegationOptionsLoaded || delegationOptionsDate !== cairoTodayKey())) loadDelegationOptions();
  });

  delegationForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const memberEmail = delegationMember.value;
    const activity = delegationEvent.selectedOptions[0];
    if (!memberEmail || !activity?.dataset.clubId) return;
    const button = document.getElementById('sendAttendanceDelegationBtn');
    button.disabled = true;
    delegationFeedback.textContent = 'Saving request to the database…';
    delegationFeedback.classList.remove('is-error');
    try {
      const result = await apiJson('/api/club/attendance-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberEmail,
          clubId: Number(activity.dataset.clubId),
          itemType: activity.dataset.itemType,
          eventRequestId: Number(activity.dataset.eventRequestId)
        })
      });
      if (result.savedToDatabase !== true) throw new Error('The database did not confirm this request.');
      delegationFeedback.textContent = `Request sent to ${result.assignment.memberName} for ${result.assignment.eventTitle}.`;
      delegationForm.reset();
      delegationOptionsLoaded = false;
      await loadDelegationOptions();
    } catch (error) {
      delegationFeedback.textContent = error.message;
      delegationFeedback.classList.add('is-error');
    } finally {
      button.disabled = false;
    }
  });

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
      await loadQrCodeLibrary();
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
      activeQrActivityKey = attendanceActivityKey({ clubId: option.dataset.clubId, itemType: option.dataset.itemType, eventRequestId: option.dataset.eventRequestId });
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
