(function () {
  const statusEl = document.getElementById('eventPageStatus');
  const backLink = document.getElementById('eventBackLink');
  const contentEl = document.getElementById('eventPageContent');
  const imageEl = document.getElementById('eventPageImage');
  const clubEl = document.getElementById('eventPageClub');
  const titleEl = document.getElementById('eventPageTitle');
  const metaEl = document.getElementById('eventPageMeta');
  const attendanceEl = document.getElementById('eventPageAttendance');
  const descriptionEl = document.getElementById('eventPageDescription');
  const registrationForm = document.getElementById('regForm');
  const feedbackEl = document.getElementById('regFeedback');

  fetch('/api/student-auth/profile', { cache: 'no-store' })
    .then((response) => response.ok ? response.json() : null)
    .then((profile) => {
      if (!profile) return;
      const nameInput = document.getElementById('regName');
      const emailInput = document.getElementById('regEmail');
      if (nameInput && !nameInput.value) nameInput.value = profile.name || '';
      if (emailInput && !emailInput.value) emailInput.value = profile.email || '';
    })
    .catch(() => {});

  const params = new URLSearchParams(window.location.search);
  const clubId = Number(params.get('club'));
  const eventIndex = Number(params.get('event'));
  const universityContentId = Number(params.get('university'));
  if (params.get('from') === 'calendar') {
    const year = Number(params.get('year'));
    const month = Number(params.get('month'));
    const day = Number(params.get('day'));
    if (Number.isInteger(year) && Number.isInteger(month) && month >= 0 && month < 12 && Number.isInteger(day) && day >= 1 && day <= 31) {
      backLink.href = `/?calendarYear=${year}&calendarMonth=${month}&calendarDay=${day}`;
      backLink.querySelector('span').textContent = 'Back to calendar';
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value || '')
      : date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function showAttendanceStatus(event) {
    attendanceEl.hidden = event.attendanceEnabled !== true;
    attendanceEl.textContent = 'Attendance taken';
  }

  registrationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!(universityContentId > 0)) return;
    if (registrationForm.dataset.studentManaged === 'true') return;
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    feedbackEl.textContent = '';
    feedbackEl.classList.remove('is-error');
    const endpoint = Number.isInteger(universityContentId) && universityContentId > 0
      ? `/api/university-content/${encodeURIComponent(universityContentId)}/registrations`
      : `/api/events/${encodeURIComponent(clubId)}/${encodeURIComponent(eventIndex)}/registrations`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'This form was not saved. Please try again.');
      feedbackEl.textContent = result.message || 'You are registered for this event.';
      const qrLink = document.createElement('a'); qrLink.href = '/pages/attendance-qr.html?source=miu&clubId=0&eventIndex=' + encodeURIComponent(universityContentId); qrLink.textContent = ' Show my attendance QR'; feedbackEl.append(qrLink);
      registrationForm.reset();
    } catch (error) {
      feedbackEl.textContent = error.message || 'This form was not saved. Please try again.';
      feedbackEl.classList.add('is-error');
    }
  });

  if (Number.isInteger(universityContentId) && universityContentId > 0) {
    let pending, lastSignature, generation = 0;
    const audience = document.createElement('p');
    audience.className = 'event-timeline-location'; audience.hidden = true;
    descriptionEl.before(audience);
    const interaction = document.createElement('div');
    contentEl.append(interaction);
    function renderUniversityEvent(event) {
      imageEl.src = event.image || event.organization?.image || '/assets/img/pics/logo.svg.png';
      imageEl.alt = event.title || 'University event';
      imageEl.classList.toggle('university-brand-image', !event.image || event.image === '/assets/img/pics/logo.svg.png');
      clubEl.textContent = event.organization?.name || 'Misr International University';
      titleEl.textContent = event.title || 'University event';
      metaEl.textContent = [event.date ? formatDate(event.date) : 'Date to be announced', window.formatSiteTime ? window.formatSiteTime(event.time) : event.time, event.location].filter(Boolean).join(' ? ');
      descriptionEl.textContent = event.description || '';
      showAttendanceStatus(event);
      audience.hidden = event.registrationEnabled !== true;
      audience.textContent = event.attendanceAudience === 'members' ? 'Registration and QR check-in are limited to current members of any MIU club.' : 'Open to all university students, including non-members.';
      interaction.innerHTML = window.studentFeedbackForm('university', event.id, event.interaction, event.question, event.options);
      window.unmountStudentEventRegistration?.(registrationForm);
      registrationForm.hidden = event.registrationEnabled !== true;
      registrationForm.dataset.studentManaged = event.attendanceAudience === 'members' ? 'true' : 'false';
      const ticket = ++generation;
      if (event.registrationEnabled === true && event.attendanceAudience === 'members') {
        import('/assets/js/student-event-registration.js?v=20261019reverseQR1').then(() => {
          if (ticket === generation) window.mountStudentEventRegistration(registrationForm, feedbackEl, '/api/university-content/' + event.id + '/registrations');
        }).catch(() => { feedbackEl.textContent = 'Registration controls could not load. Please reload.'; });
      }
      if (event.registrationEnabled === true && event.attendanceAudience !== 'members') import('/assets/js/student-event-registration.js?v=20261019reverseQR1').then(() => {
        if (ticket === generation) window.mountPublicEventCapacity(registrationForm, '/api/university-content/' + event.id + '/registrations');
      }).catch(() => { feedbackEl.textContent = 'Registration availability could not load. Please reload.'; });
      document.title = (event.title || 'University Event') + ' - MIU';
    }
    function refreshUniversityEvent() {
      if (pending) return pending;
      pending = (async () => {
        try {
          const response = await fetch('/api/university-content/' + universityContentId, { cache: 'no-store' });
          if (!response.ok) {
            if (response.status === 404) {
              generation++; lastSignature = null;
              window.unmountStudentEventRegistration?.(registrationForm);
              contentEl.hidden = true;
            }
            throw new Error(response.status === 404 ? 'This university event is no longer available.' : 'University event details are temporarily unavailable.');
          }
          const event = await response.json();
          const next = JSON.stringify(event);
          if (lastSignature !== next) { renderUniversityEvent(event); lastSignature = next; }
          statusEl.hidden = true; contentEl.hidden = false;
        } catch (error) {
          statusEl.hidden = false; statusEl.textContent = error.message || 'Could not load this event right now.';
        } finally { pending = null; }
      })();
      return pending;
    }
    void refreshUniversityEvent();
    window.siteStartup.watch(refreshUniversityEvent);
    return;
  }

  if (!Number.isInteger(clubId) || !Number.isInteger(eventIndex) || clubId < 1 || eventIndex < 0) {
    statusEl.textContent = 'This event could not be found.';
    return;
  }

  fetch('/api/clubs?media=links')
    .then((response) => response.json())
    .then((clubs) => {
      const club = Array.isArray(clubs) ? clubs.find((item) => Number(item.id) === clubId) : null;
      const event = Array.isArray(club?.events) ? club.events[eventIndex] : null;
      if (!event) {
        statusEl.textContent = 'This event could not be found.';
        return;
      }
      fetch(`/api/events/${encodeURIComponent(clubId)}/${encodeURIComponent(eventIndex)}/view`, { method: 'POST', cache: 'no-store' }).catch(() => {});
      imageEl.src = event.image || club.image || '';
      imageEl.alt = event.title || 'Event';
      clubEl.textContent = club.name || '';
      titleEl.textContent = event.title || 'Event';
      metaEl.textContent = [formatDate(event.date), window.formatSiteTime ? window.formatSiteTime(event.time) : event.time, event.location].filter(Boolean).join(' · ');
      descriptionEl.textContent = event.description || '';
      showAttendanceStatus(event);
      if (event.registrationEnabled !== false) {
        const audience = document.createElement('p');
        audience.className = 'event-timeline-location';
        audience.textContent = event.attendanceAudience === 'members' ? 'Registration and QR check-in are limited to current club members.' : 'Open to all university students, including non-members.';
        descriptionEl.before(audience);
      }
      registrationForm.hidden = event.registrationEnabled === false;
      registrationForm.dataset.studentManaged = 'false';
          import('/assets/js/student-event-registration.js?v=20261019reverseQR1').then(() => window.mountStudentEventRegistration(registrationForm, feedbackEl, `/api/events/${clubId}/${eventIndex}/registrations${event.requestId > 0 ? '?eventRequestId=' + event.requestId : ''}`))
        .catch(() => { feedbackEl.textContent = 'Registration controls could not load. Please reload.'; });
      statusEl.hidden = true;
      contentEl.hidden = false;
      document.title = `${event.title || 'Event'} - MIU Clubs`;
    })
    .catch(() => {
      statusEl.textContent = 'Could not load this event right now.';
    });

})();
