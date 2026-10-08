(() => {
  const openButton = document.getElementById('openCommitteeAttendanceBtn');
  const dialog = document.getElementById('committeeAttendanceDialog');
  const closeButton = document.querySelector('[data-close-committee-attendance]');
  const clubFilter = document.getElementById('committeeAttendanceClubFilter');
  const activityFilter = document.getElementById('committeeAttendanceActivityFilter');
  const feedback = document.getElementById('committeeAttendanceFeedback');
  const recordsList = document.getElementById('committeeAttendanceRecords');
  if (!openButton || !dialog || !clubFilter || !activityFilter || !recordsList) return;

  let clubs = [];
  let activities = [];
  let pollTimer = 0;
  let recordsRequestPending = false;
  let pollInFlight = false;

  const activityKey = (item) => `${item.clubId}:${item.itemType}:${item.eventRequestId}`;
  const apiJson = async (url) => {
    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Could not load attendance records.');
    return payload;
  };
  const formatDateTime = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short', hour12: true });
  };

  function fillActivityFilter() {
    const previous = activityFilter.value;
    const selectedClub = clubFilter.value;
    const available = activities.filter((item) => selectedClub === 'all' || String(item.clubId) === selectedClub);
    activityFilter.replaceChildren(new Option('All events and booths', 'all'));
    available.forEach((item) => {
      const text = [item.itemType === 'booth' ? 'Booth' : 'Event', selectedClub === 'all' ? item.clubName : '', item.title, item.date, window.formatSiteTime(item.time)]
        .filter(Boolean).join(' · ');
      const option = new Option(text, activityKey(item));
      option.dataset.clubId = String(item.clubId);
      option.dataset.itemType = item.itemType;
      option.dataset.eventRequestId = String(item.eventRequestId);
      activityFilter.add(option);
    });
    activityFilter.value = [...activityFilter.options].some((option) => option.value === previous) ? previous : 'all';
  }

  async function loadFilters() {
    const data = await apiJson('/api/committee/attendance-overview');
    clubs = Array.isArray(data.clubs) ? data.clubs : [];
    activities = Array.isArray(data.activities) ? data.activities : [];
    const previousClub = clubFilter.value || 'all';
    clubFilter.replaceChildren(new Option('All clubs', 'all'));
    clubs.forEach((club) => clubFilter.add(new Option(club.name, String(club.id))));
    clubFilter.value = [...clubFilter.options].some((option) => option.value === previousClub) ? previousClub : 'all';
    fillActivityFilter();
  }

  function renderRecords(records) {
    const scrollTop = recordsList.scrollTop;
    const scrollLeft = recordsList.scrollLeft;
    recordsList.replaceChildren();
    if (!records.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No attendance records match these filters.';
      recordsList.append(empty);
      recordsList.scrollTop = scrollTop;
      recordsList.scrollLeft = scrollLeft;
      return;
    }
    const table = document.createElement('table');
    table.className = 'committee-attendance-table';
    const heading = table.createTHead().insertRow();
    ['Name', 'Email', 'Club', 'Activity', 'Activity date', 'Activity time', 'Checked in', 'Note'].forEach((label) => {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      heading.append(cell);
    });
    const body = table.createTBody();
    records.forEach((record) => {
      const row = body.insertRow();
      [record.name, record.email, record.clubName, `${record.itemType === 'booth' ? 'Booth' : 'Event'}: ${record.eventTitle || ''}`,
        record.eventDate, window.formatSiteTime(record.eventTime), formatDateTime(record.attendedAt), record.note].forEach((value) => {
        row.insertCell().textContent = value || '—';
      });
    });
    recordsList.append(table);
    recordsList.scrollTop = scrollTop;
    recordsList.scrollLeft = scrollLeft;
  }

  async function loadRecords(showLoading = false) {
    if (recordsRequestPending) return;
    recordsRequestPending = true;
    if (showLoading) feedback.textContent = 'Loading attendance records…';
    const query = new URLSearchParams({ clubId: clubFilter.value || 'all' });
    const selected = activityFilter.selectedOptions[0];
    if (selected?.value && selected.value !== 'all') {
      query.set('clubId', selected.dataset.clubId);
      query.set('itemType', selected.dataset.itemType);
      query.set('eventRequestId', selected.dataset.eventRequestId);
    }
    try {
      const records = await apiJson(`/api/committee/attendance-records?${query}`);
      if ((clubFilter.value || 'all') === 'all' && (!activityFilter.value || activityFilter.value === 'all')) {
        window.dashboardUnread?.update('eventAttendance', records.map((record) => `${record.clubId}:${record.itemType}:${record.eventRequestId}:${record.email}:${record.attendedAt}`));
      }
      renderRecords(Array.isArray(records) ? records : []);
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

  async function pollRecords() {
    if (!dialog.open || pollInFlight) return;
    pollInFlight = true;
    try {
      if (document.visibilityState === 'visible') await loadRecords();
    } finally {
      pollInFlight = false;
      if (dialog.open) pollTimer = window.setTimeout(pollRecords, 3000);
    }
  }

  async function openAttendance() {
    window.dashboardPanels?.show('committeeAttendanceDialog');
    feedback.textContent = 'Loading clubs and activities…';
    feedback.classList.remove('is-error');
    try {
      await loadFilters();
      await loadRecords();
      pollTimer = window.setTimeout(pollRecords, 3000);
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
  dialog.addEventListener('close', () => {
    window.clearTimeout(pollTimer);
    pollTimer = 0;
  });
  clubFilter.addEventListener('change', () => {
    fillActivityFilter();
    loadRecords(true);
  });
  activityFilter.addEventListener('change', () => loadRecords(true));
  document.addEventListener('visibilitychange', () => {
    if (dialog.open && document.visibilityState === 'visible') {
      if (!pollInFlight) {
        window.clearTimeout(pollTimer);
        pollRecords();
      }
    }
  });
  refreshAttendanceBadge();
  window.addEventListener('dashboard:refresh', refreshAttendanceBadge);
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && !dialog.open) refreshAttendanceBadge();
  }, 10000);
})();
