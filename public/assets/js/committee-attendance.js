(() => {
  const openButton = document.getElementById('openCommitteeAttendanceBtn');
  const dialog = document.getElementById('committeeAttendanceDialog');
  const closeButton = document.querySelector('[data-close-committee-attendance]');
  const feedback = document.getElementById('committeeAttendanceFeedback');
  const recordsList = document.getElementById('committeeAttendanceRecords');
  const searchInput = document.getElementById('committeeAttendanceSearch');
  if (!openButton || !dialog || !recordsList) return;

  let attendanceRecords = [];
  let currentRole = '';
  let pollTimer = 0;
  let recordsRequestPending = false;
  let pollInFlight = false;

  const approvalStatusLabels = {
    pending_pr: 'Waiting for PR', pending_sso: 'Waiting for SSO',
    pending_dean: 'Waiting for Dean', approved: 'Dean approved', rejected: 'Rejected'
  };
  const approvalStages = { pr: 'pending_pr', sso: 'pending_sso', dean: 'pending_dean' };
  const apiJson = async (url, options = {}) => {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Could not load attendance records.');
    return payload;
  };
  const formatDateTime = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short', hour12: true });
  };
  const cairoTodayKey = () => {
    const values = Object.fromEntries(new Intl.DateTimeFormat('en', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  };
  const activityEnded = (value) => {
    const dateText = String(value || '').trim();
    if (!dateText) return true;
    const isoDate = dateText.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDate) return isoDate[1] < cairoTodayKey();
    const parsed = new Date(dateText);
    if (Number.isNaN(parsed.getTime())) return false;
    const eventDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(parsed);
    return eventDay < cairoTodayKey();
  };
  const groupKey = (record) => `${record.clubId}:${record.itemType || 'event'}:${record.eventRequestId}`;

  function makeGroups(records) {
    const groups = new Map();
    records.forEach((record) => {
      const key = groupKey(record);
      if (!groups.has(key)) groups.set(key, {
        key, clubId: record.clubId, clubName: record.clubName || `Club ${record.clubId}`,
        clubImage: record.clubImage || '', itemType: record.itemType === 'booth' ? 'booth' : 'event',
        eventRequestId: record.eventRequestId, eventTitle: record.eventTitle || 'Untitled activity',
        eventDate: record.eventDate || '', eventTime: record.eventTime || '', attendanceEnded: false, records: [], notes: []
      });
      const group = groups.get(key);
      group.attendanceEnded ||= record.attendanceEnded === true;
      group.records.push(record);
      (record.approvalHistory || []).filter((entry) => entry.note).forEach((entry) => {
        const note = {
          role: entry.role, action: entry.action, text: entry.note,
          email: entry.email || '', createdAt: entry.createdAt || record.attendedAt
        };
        const identity = `${note.role}:${note.action}:${note.email}:${new Date(note.createdAt).getTime()}:${note.text}`;
        if (!group.notes.some((saved) => `${saved.role}:${saved.action}:${saved.email}:${new Date(saved.createdAt).getTime()}:${saved.text}` === identity)) group.notes.push(note);
      });
    });
    return [...groups.values()].sort((left, right) =>
      String(right.eventDate).localeCompare(String(left.eventDate)) || left.clubName.localeCompare(right.clubName) || left.eventTitle.localeCompare(right.eventTitle));
  }

  function statusFor(group) {
    const statuses = [...new Set(group.records.map((record) => record.approvalStatus || 'pending_pr'))];
    return statuses.length === 1 ? statuses[0] : 'mixed';
  }

  function renderRecords() {
    const query = String(searchInput?.value || '').trim().toLowerCase();
    const groups = makeGroups(attendanceRecords).filter((group) => !query || [
      group.clubName, group.eventTitle, group.itemType,
      ...group.records.flatMap((record) => [record.name, record.email])
    ].some((value) => String(value || '').toLowerCase().includes(query)));
    recordsList.replaceChildren();
    if (!groups.length) {
      const empty = document.createElement('p');
      empty.className = 'committee-attendance-empty';
      empty.textContent = attendanceRecords.length ? 'No event or booth matches your search.' : 'No attendance has been recorded for an event or booth yet.';
      recordsList.append(empty);
      return;
    }

    const cardList = document.createElement('div');
    cardList.className = 'attendance-activity-list';
    groups.forEach((group) => {
      const card = document.createElement('article');
      card.className = 'attendance-activity-card';
      const avatar = document.createElement('div');
      avatar.className = 'attendance-activity-avatar';
      if (group.clubImage) {
        const image = document.createElement('img');
        image.src = group.clubImage;
        image.alt = `${group.clubName} logo`;
        image.addEventListener('error', () => { avatar.textContent = group.clubName.trim().charAt(0).toUpperCase(); }, { once: true });
        avatar.append(image);
      } else avatar.textContent = group.clubName.trim().charAt(0).toUpperCase();

      const content = document.createElement('div');
      content.className = 'attendance-activity-content';
      const title = document.createElement('h3');
      title.textContent = group.eventTitle;
      const meta = document.createElement('p');
      meta.className = 'attendance-activity-meta';
      meta.textContent = [group.clubName, group.itemType === 'booth' ? 'Booth' : 'Event', group.eventDate,
        window.formatSiteTime(group.eventTime), `${group.records.length} check-in${group.records.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
      const badge = document.createElement('span');
      const status = statusFor(group);
      badge.className = `attendance-activity-status${status === 'approved' ? ' is-approved' : status === 'rejected' ? ' is-rejected' : ' is-pending'}`;
      badge.textContent = status === 'pending_pr' && group.attendanceEnded
        ? 'Processing · PR review'
        : status === 'mixed' ? 'Mixed review stages' : approvalStatusLabels[status] || 'Waiting for PR';
      content.append(title, meta, badge);
      card.append(avatar, content);

      if (group.notes.length) {
        const notes = document.createElement('div');
        notes.className = 'attendance-activity-notes';
        group.notes.forEach((entry) => {
          const note = document.createElement('p');
          const role = String(entry.role || 'reviewer').toUpperCase();
          note.textContent = `${role} note: ${entry.text}`;
          notes.append(note);
        });
        card.append(notes);
      }

      const sheet = document.createElement('details');
      sheet.className = 'attendance-activity-sheet';
      const sheetSummary = document.createElement('summary');
      sheetSummary.textContent = `View all attendance sheet · ${group.records.length} attendee${group.records.length === 1 ? '' : 's'}`;
      const people = document.createElement('div');
      people.className = 'attendance-activity-people';
      group.records.forEach((record) => {
        const person = document.createElement('div');
        person.className = 'attendance-activity-person';
        const name = document.createElement('strong');
        name.textContent = record.name || 'Student';
        const email = document.createElement('small');
        email.textContent = record.email || 'No email';
        const checkin = document.createElement('small');
        checkin.textContent = `Checked in ${formatDateTime(record.attendedAt)}`;
        person.append(name, email, checkin);
        people.append(person);
      });
      sheet.append(sheetSummary, people);
      card.append(sheet);

      const currentStage = approvalStages[currentRole];
      const awaitingCurrentRole = currentStage && group.records.some((record) => (record.approvalStatus || 'pending_pr') === currentStage);
      if (awaitingCurrentRole) {
        const actions = document.createElement('div');
        actions.className = 'attendance-activity-actions';
        if (!group.attendanceEnded && !activityEnded(group.eventDate)) {
          const waiting = document.createElement('span');
          waiting.className = 'attendance-activity-waiting';
          waiting.textContent = 'Waiting for the club to end attendance.';
          actions.append(waiting);
        } else {
          const noteField = document.createElement('textarea');
          noteField.className = 'attendance-activity-note-input';
          noteField.rows = 2;
          noteField.maxLength = 500;
          noteField.placeholder = 'Optional note or rejection reason';
          noteField.setAttribute('aria-label', `Note for ${group.eventTitle}`);
          actions.append(noteField);
          const approve = document.createElement('button');
          approve.type = 'button';
          approve.className = 'attendance-activity-approve';
          approve.textContent = 'Approve all';
          const reject = document.createElement('button');
          reject.type = 'button';
          reject.className = 'attendance-activity-reject';
          reject.textContent = 'Reject';
          const saveNote = document.createElement('button');
          saveNote.type = 'button';
          saveNote.className = 'attendance-activity-note';
          saveNote.textContent = 'Save note';
          const buttons = [approve, reject, saveNote];
          approve.addEventListener('click', () => decide(group, 'approve', buttons, noteField));
          reject.addEventListener('click', () => decide(group, 'reject', buttons, noteField));
          saveNote.addEventListener('click', () => decide(group, 'note', buttons, noteField));
          actions.append(...buttons);
        }
        card.append(actions);
      }
      card.dataset.search = [group.clubName, group.eventTitle, group.itemType, ...group.records.flatMap((record) => [record.name, record.email])].join(' ').toLowerCase();
      cardList.append(card);
    });
    recordsList.append(cardList);
  }

  async function decide(group, action, buttons, noteField) {
    const note = noteField.value.trim();
    if ((action === 'note' || action === 'reject') && !note) {
      feedback.textContent = action === 'reject' ? 'Add a short reason before rejecting this attendance list.' : 'Write a note before saving it.';
      feedback.classList.add('is-error');
      noteField.focus();
      return;
    }
    buttons.forEach((button) => { button.disabled = true; });
    feedback.textContent = action === 'approve' ? 'Approving all check-ins…' : action === 'reject' ? 'Rejecting this attendance list…' : 'Saving note…';
    feedback.classList.remove('is-error');
    const url = `/api/committee/attendance-reviews/${encodeURIComponent(group.clubId)}/${encodeURIComponent(group.itemType)}/${encodeURIComponent(group.eventRequestId)}/approve`;
    try {
      const result = await apiJson(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(note ? { note } : {}) })
      });
      await loadRecords();
      feedback.textContent = action === 'approve'
        ? `Approved ${result.recordsUpdated} check-in${result.recordsUpdated === 1 ? '' : 's'}; forwarded to ${result.nextStage.toUpperCase()}.`
        : action === 'reject' ? `Rejected ${result.recordsUpdated} check-in${result.recordsUpdated === 1 ? '' : 's'}.`
          : `Note saved for ${result.recordsUpdated} check-in${result.recordsUpdated === 1 ? '' : 's'}.`;
    } catch (error) {
      buttons.forEach((button) => { button.disabled = false; });
      feedback.textContent = error.message;
      feedback.classList.add('is-error');
    }
  }

  async function loadRecords(showLoading = false) {
    if (recordsRequestPending) return;
    recordsRequestPending = true;
    if (showLoading) feedback.textContent = 'Loading event attendance…';
    try {
      attendanceRecords = await apiJson('/api/committee/attendance-records?clubId=all');
      window.dashboardUnread?.update('eventAttendance', attendanceRecords.map((record) => `${record.clubId}:${record.itemType}:${record.eventRequestId}:${record.email}:${record.attendedAt}`));
      renderRecords();
      feedback.textContent = '';
      feedback.classList.remove('is-error');
    } catch (error) {
      if (showLoading || !recordsList.childElementCount) {
        feedback.textContent = error.message;
        feedback.classList.add('is-error');
      }
    } finally {
      recordsRequestPending = false;
    }
  }

  async function loadRole() {
    const session = await apiJson('/api/club-auth/session');
    if (!session.authenticated || !session.club) throw new Error('Sign in with an authorized committee account to view attendance.');
    currentRole = session.club.role;
  }

  async function pollRecords() {
    if (!dialog.open || pollInFlight) return;
    pollInFlight = true;
    try {
      if (document.visibilityState === 'visible') await loadRecords();
    } finally {
      pollInFlight = false;
      if (dialog.open) pollTimer = window.setTimeout(pollRecords, 5000);
    }
  }

  async function openAttendance() {
    window.dashboardPanels?.show('committeeAttendanceDialog');
    feedback.textContent = 'Loading event attendance…';
    feedback.classList.remove('is-error');
    try {
      await loadRole();
      await loadRecords(true);
      pollTimer = window.setTimeout(pollRecords, 5000);
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add('is-error');
    }
  }

  async function refreshAttendanceBadge() {
    window.dashboardSync?.report('eventAttendance', 'loading');
    try {
      const records = await apiJson('/api/committee/attendance-records?clubId=all');
      window.dashboardUnread?.update('eventAttendance', records.map((record) => `${record.clubId}:${record.itemType}:${record.eventRequestId}:${record.email}:${record.attendedAt}`));
      window.dashboardSync?.report('eventAttendance', 'success');
    } catch (error) {
      window.dashboardSync?.report('eventAttendance', 'error', error.message);
    }
  }

  openButton.addEventListener('click', openAttendance);
  document.getElementById('overviewAttendanceBtn')?.addEventListener('click', openAttendance);
  closeButton?.addEventListener('click', () => window.dashboardPanels?.showOverview());
  searchInput?.addEventListener('input', renderRecords);
  dialog.addEventListener('close', () => {
    window.clearTimeout(pollTimer);
    pollTimer = 0;
  });
  document.addEventListener('visibilitychange', () => {
    if (dialog.open && document.visibilityState === 'visible' && !pollInFlight) {
      window.clearTimeout(pollTimer);
      pollRecords();
    }
  });
  refreshAttendanceBadge();
  window.addEventListener('dashboard:refresh', refreshAttendanceBadge);
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && !dialog.open) refreshAttendanceBadge();
  }, 10000);
})();
