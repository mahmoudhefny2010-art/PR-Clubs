(function () {
  const modal = document.getElementById('eventModal');
  if (!modal) return;

  const image = document.getElementById('eventModalImage');
  const club = document.getElementById('eventModalClub');
  const title = document.getElementById('eventModalTitle');
  const meta = document.getElementById('eventModalMeta');
  const description = document.getElementById('eventModalDescription');
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
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  let activeEvent = null;

  window.openEventModal = function (event) {
    if (!event) return;
    activeEvent = event;
    if (Number.isInteger(Number(event.clubId)) && Number.isInteger(Number(event.eventIndex))) {
      fetch(`/api/events/${encodeURIComponent(event.clubId)}/${encodeURIComponent(event.eventIndex)}/view`, { method: 'POST', cache: 'no-store' }).catch(() => {});
    }
    image.src = event.image || event.clubImage || '';
    image.alt = event.title || 'Event';
    club.textContent = event.clubName || '';
    title.textContent = event.title || 'Event';
    meta.textContent = [formatDate(event.date), window.formatSiteTime(event.time), event.location].filter(Boolean).join(' · ');
    description.textContent = event.description || '';
    feedback.textContent = '';
    form.reset();
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    closeButton.focus();
  };

  closeButton.addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('eventModalName').value.trim();
    const email = document.getElementById('eventModalEmail').value.trim();
    feedback.textContent = '';
    feedback.classList.remove('is-error');
    if (!activeEvent || !Number.isInteger(Number(activeEvent.clubId)) || !Number.isInteger(Number(activeEvent.eventIndex))) {
      feedback.textContent = 'This form was not saved. Please try again.';
      feedback.classList.add('is-error');
      return;
    }
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(activeEvent.clubId)}/${encodeURIComponent(activeEvent.eventIndex)}/registrations`, {
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
