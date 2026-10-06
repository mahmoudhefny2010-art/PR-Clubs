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

  const params = new URLSearchParams(window.location.search);
  const clubId = Number(params.get('club'));
  const eventIndex = Number(params.get('event'));
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
      imageEl.src = event.image || club.image || '';
      imageEl.alt = event.title || 'Event';
      clubEl.textContent = club.name || '';
      titleEl.textContent = event.title || 'Event';
      metaEl.textContent = [formatDate(event.date), event.time, event.location].filter(Boolean).join(' · ');
      descriptionEl.textContent = event.description || '';
      statusEl.hidden = true;
      contentEl.hidden = false;
      document.title = `${event.title || 'Event'} - MIU Clubs`;
    })
    .catch(() => {
      statusEl.textContent = 'Could not load this event right now.';
    });

  registrationForm.addEventListener('submit', (event) => {
    event.preventDefault();
    feedbackEl.textContent = 'Thanks! You are registered for this event.';
    feedbackEl.classList.remove('is-error');
    registrationForm.reset();
  });
})();
