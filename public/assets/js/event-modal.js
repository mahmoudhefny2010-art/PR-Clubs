(function () {
  const modal = document.getElementById('eventModal');
  if (!modal) return;

  const image = document.getElementById('eventModalImage');
  const club = document.getElementById('eventModalClub');
  const title = document.getElementById('eventModalTitle');
  const meta = document.getElementById('eventModalMeta');
  let attendance = document.getElementById('eventModalAttendance');
  const description = document.getElementById('eventModalDescription');
  if (!attendance) {
    attendance = document.createElement('p'); attendance.id = 'eventModalAttendance';
    attendance.className = 'event-attendance-status'; attendance.hidden = true;
    description.before(attendance);
  }
  const form = document.getElementById('eventModalForm');
  const feedback = document.getElementById('eventModalFeedback');
  const closeButton = document.getElementById('eventModalClose');

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value || '')
      : date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function close() {
    window.MiuUI.modals.close(modal);
    document.body.classList.remove('modal-open');
  }

  let activeEvent = null;

  function renderEventCopy(event) {
    image.src = event.image || event.clubImage || '';
    image.alt = event.title || 'Event';
    image.classList.toggle('university-brand-image', event.university === true && (event.image || '/assets/img/pics/logo.svg.png') === '/assets/img/pics/logo.svg.png');
    club.textContent = event.university ? (event.organization?.name || 'Misr International University') : event.clubName || '';
    title.textContent = event.title || 'Event';
    meta.textContent = [event.date ? formatDate(event.date) : 'Date to be announced', window.formatSiteTime ? window.formatSiteTime(event.time) : event.time, event.location].filter(Boolean).join(' · ');
    attendance.hidden = event.attendanceEnabled !== true;
    attendance.textContent = 'Attendance taken';
    description.textContent = event.description || '';
    if (event.registrationEnabled === true && event.attendanceAudience) {
      description.textContent += `\n\n${event.attendanceAudience === 'members'
        ? event.university ? 'MIU club members only.' : 'Club members only.'
        : 'Open to all university students, including non-members.'}`;
    }
  }

  window.openEventModal = function (event) {
    if (!event) return;
    window.unmountStudentEventRegistration?.(form);
    activeEvent = event;
    if (!event.university && Number.isInteger(Number(event.clubId)) && Number.isInteger(Number(event.eventIndex))) {
      fetch(`/api/events/${encodeURIComponent(event.clubId)}/${encodeURIComponent(event.eventIndex)}/view`, { method: 'POST', cache: 'no-store' }).catch(() => {});
    }
    renderEventCopy(event);
    feedback.textContent = '';
    form.reset();
    form.hidden = event.registrationEnabled === false;
    if (!event.university) import('/assets/js/student-event-registration.js?v=20261014registrationbuttons1').then(() => {
      if (activeEvent === event) window.mountStudentEventRegistration(form, feedback, `/api/events/${event.clubId}/${event.eventIndex}/registrations`);
    }).catch(() => { feedback.textContent = 'Registration controls could not load. Please reload.'; });
    else if (event.attendanceAudience === 'members' && event.registrationEnabled === true) import('/assets/js/student-event-registration.js?v=20261014registrationbuttons1').then(() => {
      if (activeEvent === event) window.mountStudentEventRegistration(form, feedback, `/api/university-content/${encodeURIComponent(event.universityContentId || event.id)}/registrations`);
    }).catch(() => { feedback.textContent = 'Registration controls could not load. Please reload.'; });
    window.MiuUI.modals.open(modal);
    document.body.classList.add('modal-open');
    closeButton.focus({ preventScroll: true });
    modal.querySelector('.event-modal-panel').scrollTop = 0;
  };

  let universityRefresh;
  window.siteStartup?.watch(() => {
    if (!activeEvent?.university || modal.classList.contains('hidden')) return;
    if (universityRefresh) return universityRefresh;
    const previous = activeEvent;
    universityRefresh = (async () => {
      try {
        const response = await fetch('/api/university-content/' + (previous.universityContentId || previous.id), { cache: 'no-store' });
        if (activeEvent !== previous || modal.classList.contains('hidden')) return;
        if (response.status === 404) { close(); activeEvent = null; return; }
        if (!response.ok) return;
        const event = await response.json();
        if (activeEvent !== previous || modal.classList.contains('hidden')) return;
        const next = { ...event, university: true, universityContentId: event.id, clubId: 0,
          clubName: event.organization?.name || 'Misr International University', clubImage: event.organization?.image || '/assets/img/pics/logo.svg.png' };
        const registrationChanged = event.registrationEnabled !== previous.registrationEnabled || event.attendanceAudience !== previous.attendanceAudience;
        if (registrationChanged) {
          const nameInput = document.getElementById('eventModalName'), emailInput = document.getElementById('eventModalEmail');
          const nameValue = nameInput.value, emailValue = emailInput.value;
          window.openEventModal(next); nameInput.value = nameValue; emailInput.value = emailValue;
        } else { activeEvent = next; renderEventCopy(next); }
      } catch { /* Keep the visible saved event while the connection recovers. */ }
      finally { universityRefresh = null; }
    })();
    return universityRefresh;
  });

  closeButton.addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeEvent?.university || activeEvent.attendanceAudience === 'members') return;
    const name = document.getElementById('eventModalName').value.trim();
    const email = document.getElementById('eventModalEmail').value.trim();
    feedback.textContent = '';
    feedback.classList.remove('is-error');
    if (!activeEvent || activeEvent.registrationEnabled === false) {
      feedback.textContent = 'This form was not saved. Please try again.';
      feedback.classList.add('is-error');
      return;
    }
    try {
      const endpoint = activeEvent.university === true
        ? `/api/university-content/${encodeURIComponent(activeEvent.universityContentId || activeEvent.id)}/registrations`
        : Number.isInteger(Number(activeEvent.clubId)) && Number.isInteger(Number(activeEvent.eventIndex))
          ? `/api/events/${encodeURIComponent(activeEvent.clubId)}/${encodeURIComponent(activeEvent.eventIndex)}/registrations`
          : '';
      if (!endpoint) throw new Error('This form was not saved. Please try again.');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'This form was not saved. Please try again.');
      feedback.textContent = result.message || 'You are registered for this event.';
      form.reset();
    } catch (error) {
      feedback.textContent = error.message || 'This form was not saved. Please try again.';
      feedback.classList.add('is-error');
    }
  });
})();
