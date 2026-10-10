(function () {
  const statusEl = document.getElementById('eventPageStatus');
  const backLink = document.getElementById('eventBackLink');
  const contentEl = document.getElementById('eventPageContent');
  const imageEl = document.getElementById('eventPageImage');
  const clubEl = document.getElementById('eventPageClub');
  const titleEl = document.getElementById('eventPageTitle');
  const metaEl = document.getElementById('eventPageMeta');
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

  registrationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
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
      registrationForm.reset();
    } catch (error) {
      feedbackEl.textContent = error.message || 'This form was not saved. Please try again.';
      feedbackEl.classList.add('is-error');
    }
  });

  if (Number.isInteger(universityContentId) && universityContentId > 0) {
    fetch('/api/university-content', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('This event could not be found.');
        return response.json();
      })
      .then((items) => {
        const event = Array.isArray(items) ? items.find((item) => Number(item.id) === universityContentId && item.type === 'event') : null;
        if (!event) {
          statusEl.textContent = 'This university event could not be found.';
          return;
        }
        imageEl.src = event.image || '/assets/img/pics/logo.svg.png';
        imageEl.alt = event.title || 'University event';
        imageEl.classList.toggle('university-brand-image', !event.image || event.image === '/assets/img/pics/logo.svg.png');
        clubEl.textContent = 'Misr International University';
        titleEl.textContent = event.title || 'University event';
        metaEl.textContent = [event.date ? formatDate(event.date) : 'Date to be announced', window.formatSiteTime ? window.formatSiteTime(event.time) : event.time, event.location].filter(Boolean).join(' · ');
        descriptionEl.textContent = event.description || '';
        registrationForm.hidden = event.registrationEnabled !== true;
        statusEl.hidden = true;
        contentEl.hidden = false;
        document.title = `${event.title || 'University Event'} - MIU`;
      })
      .catch(() => { statusEl.textContent = 'Could not load this event right now.'; });
    window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/university-content', { cache: 'no-store' });
        if (!response.ok) throw new Error('University event details are temporarily unavailable.');
        const latest = await response.json();
        const exists = Array.isArray(latest) && latest.some((item) => Number(item.id) === universityContentId && item.type === 'event');
        if (!exists) throw new Error('This university event is no longer available.');
        statusEl.hidden = true;
        contentEl.hidden = false;
      } catch (error) {
        contentEl.hidden = true;
        statusEl.hidden = false;
        statusEl.textContent = error.message || 'University event details are temporarily unavailable.';
      }
    }, 60_000);
    return;
  }

  if (!Number.isInteger(clubId) || !Number.isInteger(eventIndex) || clubId < 1 || eventIndex < 0) {
    statusEl.textContent = 'This event could not be found.';
    return;
  }

  fetch('/api/clubs')
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
      registrationForm.hidden = event.registrationEnabled === false;
      statusEl.hidden = true;
      contentEl.hidden = false;
      document.title = `${event.title || 'Event'} - MIU Clubs`;
    })
    .catch(() => {
      statusEl.textContent = 'Could not load this event right now.';
    });

})();
