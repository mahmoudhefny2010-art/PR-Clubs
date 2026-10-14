(() => {
  const mount = (root = document) => {
  const $ = id => root.querySelector('#' + id);
  const form = $('miuAttendanceForm'), eventSelect = $('miuAttendanceEvent'), feedback = $('miuAttendanceFeedback');
  const assignmentList = $('miuAttendanceAssignments'), panel = $('miuAttendanceQr');
  if (!form || !eventSelect || !assignmentList || form.dataset.initialized === 'true') return;
  form.dataset.initialized = 'true';
  let eventId = 0;
  const todayCairo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const api = window.MiuUI.createJsonClient({
    defaults: {"credentials":"same-origin","cache":"no-store","siteStartupNonBlocking":true},
    fallbackMessage: "The request could not be completed.", tolerateInvalidJson: true, includeStatus: false
  });
  function refreshAssignments() {
    const rows = [...assignmentList.querySelectorAll('.miu-assignment-row')];
    rows.forEach((row, index) => {
      row.querySelector('legend').textContent = `Team ${index + 1}`;
      const remove = row.querySelector('.miu-remove-assignment');
      remove.hidden = rows.length === 1;
      remove.setAttribute('aria-label', `Remove team ${index + 1}`);
    });
    $('miuAttendanceAdd').disabled = rows.length >= 20;
    $('miuAttendanceAdd').setAttribute('aria-disabled', String(rows.length >= 20));
  }
  function addAssignment() {
    const rows = assignmentList.querySelectorAll('.miu-assignment-row');
    if (rows.length >= 20) return;
    const row = rows[0].cloneNode(true);
    row.querySelectorAll('input').forEach(input => { input.value = ''; input.setCustomValidity(''); });
    assignmentList.append(row);
    refreshAssignments();
    row.querySelector('input')?.focus();
  }
  $('miuAttendanceAdd').addEventListener('click', addAssignment);
  assignmentList.addEventListener('click', event => {
    const remove = event.target.closest('.miu-remove-assignment');
    if (!remove) return;
    remove.closest('.miu-assignment-row')?.remove();
    refreshAssignments();
  });
  async function load() {
    try {
      const data = await api('/api/report-downloads/events?clubId=0&period=all&audience=all_students');
      const events = data.events.filter(event => event.attendanceEnabled === true && event.date === todayCairo());
      eventSelect.replaceChildren(new Option(events.length ? 'Choose an MIU event' : 'No eligible events today', ''));
      for (const event of events) {
        const title = String(event.title || 'MIU event');
        const shortTitle = title.length > 48 ? `${title.slice(0, 45)}…` : title;
        const option = new Option(`${shortTitle} · ${event.date}`, String(event.attendanceId));
        option.title = title;
        option.dataset.title = title;
        option.dataset.audience = event.attendanceAudience === 'members' ? 'MIU club members' : 'All university students';
        option.dataset.location = event.location || 'MIU';
        eventSelect.add(option);
      }
      const details = $('miuAttendanceEventDetails');
      const updateEventDetails = () => {
        const selected = eventSelect.selectedOptions[0];
        details.hidden = !selected?.value;
        details.textContent = selected?.value ? `${selected.dataset.audience} · ${selected.dataset.location}` : '';
      };
      eventSelect.addEventListener('change', updateEventDetails);
      updateEventDetails();
      $('miuAttendanceStart').disabled = !events.length;
      feedback.textContent = events.length ? 'Choose the event and add one or more attendance teams.' : data.message || 'No MIU events are configured for attendance today.';
    } catch (error) { feedback.textContent = error.message; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const selected = eventSelect.selectedOptions[0];
    if (!selected?.value) return;
    const assignments = [...assignmentList.querySelectorAll('.miu-assignment-row')].map(row => ({
      supervisorEmail: row.querySelector('[data-supervisor-email]').value.trim(),
      attendanceTakerEmail: row.querySelector('[data-usher-email]').value.trim()
    }));
    const start = $('miuAttendanceStart'); start.disabled = true; feedback.textContent = 'Validating accounts and assigning attendance teams';
    try {
      const result = await api('/api/club/attendance-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId: 0, itemType: 'event', eventRequestId: Number(selected.value), assignments }) });
      eventId = Number(selected.value); $('miuAttendanceTitle').textContent = selected.dataset.title || 'MIU event';
      const results = $('miuAttendanceAssignedList'); results.replaceChildren();
      result.sessions.forEach((session, index) => {
        const item = document.createElement('li');
        item.textContent = `Team ${index + 1}: usher ${session.assignedMemberEmail} · Supervisor ${session.assignedSupervisorEmail} · usher must accept the task from their account before opening their QR.`;
        results.append(item);
      });
      $('miuAttendanceAssignmentsResult').textContent = `${result.assignmentsCreated} attendance team${result.assignmentsCreated === 1 ? '' : 's'} assigned. Each usher gets a separate QR session; duplicate student check-ins are still prevented.`;
      panel.classList.remove('hidden'); feedback.textContent = 'Attendance teams are assigned. Each usher can now accept the task from their account.';
    } catch (error) { feedback.textContent = error.message; }
    finally { start.disabled = false; }
  });
  $('miuAttendanceEnd').addEventListener('click', async () => {
    if (!eventId || !confirm('End check-in for this MIU event and close all assigned usher QR sessions?')) return;
    $('miuAttendanceEnd').disabled = true;
    try {
      await api(`/api/miu/attendance-events/${encodeURIComponent(eventId)}/end`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      panel.classList.add('hidden'); feedback.textContent = 'Attendance ended and sent to the assigned Supervisors for review.'; eventId = 0; await load();
    } catch (error) { feedback.textContent = error.message; }
    finally { $('miuAttendanceEnd').disabled = false; }
  });
  refreshAssignments();
  return load();
  };
  window.mountMiuAttendance = mount;
  mount();
})();
