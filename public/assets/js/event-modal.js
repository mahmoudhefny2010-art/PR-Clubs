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

  window.openEventModal = function (event) {
    if (!event) return;
    image.src = event.image || event.clubImage || '';
    image.alt = event.title || 'Event';
    club.textContent = event.clubName || '';
    title.textContent = event.title || 'Event';
    meta.textContent = [formatDate(event.date), event.time, event.location].filter(Boolean).join(' · ');
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
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    feedback.textContent = 'Thanks! You are registered for this event.';
    feedback.classList.remove('is-error');
    form.reset();
  });
})();
