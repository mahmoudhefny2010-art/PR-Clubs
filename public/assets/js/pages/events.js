// Events page logic (public/pages/events.html)
(function () {
  const listEl = document.getElementById('eventsList');
  const detailEl = document.getElementById('eventDetail');
  const backBtn = document.getElementById('eventBack');
  const detailImg = document.getElementById('detailImg');
  const detailClub = document.getElementById('detailClub');
  const detailTitle = document.getElementById('detailTitle');
  const detailMeta = document.getElementById('detailMeta');
  const detailDesc = document.getElementById('detailDesc');
  const regForm = document.getElementById('regForm');
  const regFeedback = document.getElementById('regFeedback');

  const parseDate = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));

  let clubs = [];
  const allEvents = () => clubs.flatMap((club) =>
    (Array.isArray(club.events) ? club.events : []).map((event, eventIndex) => ({
      ...event,
      clubId: club.id,
      clubName: club.name,
      clubImage: club.image,
      eventIndex,
    })));

  function renderList() {
    const events = allEvents()
      .map((event) => ({ ...event, parsed: parseDate(event.date) }))
      .filter((event) => event.parsed)
      .sort((left, right) => left.parsed - right.parsed);
    if (!events.length) {
      listEl.innerHTML = '<p class="events-empty">No upcoming events right now.</p>';
      return;
    }
    listEl.innerHTML = events.map((event) => `
      <button type="button" class="event-tile" data-club="${event.clubId}" data-idx="${event.eventIndex}">
        <img src="${escapeHtml(event.image || event.clubImage)}" alt="${escapeHtml(event.title || 'event')}" />
        <div class="event-tile-body">
          <span class="event-tile-club">${escapeHtml(event.clubName || '')}</span>
          <strong>${escapeHtml(event.title || 'Event')}</strong>
          <span class="event-tile-date">${escapeHtml(event.date || '')}${event.location ? ' • ' + escapeHtml(event.location) : ''}</span>
          <p class="event-tile-desc">${escapeHtml(event.description || '')}</p>
        </div>
      </button>`).join('');
    listEl.querySelectorAll('.event-tile').forEach((tile) => {
      tile.addEventListener('click', () => openDetail(Number(tile.dataset.club), Number(tile.dataset.idx)));
    });
  }

  function openDetail(clubId, idx) {
    const club = clubs.find((c) => Number(c.id) === Number(clubId));
    const event = club && Array.isArray(club.events) ? club.events[idx] : null;
    if (!event) return;
    detailImg.src = event.image || club.image || '';
    detailClub.textContent = club.name || '';
    detailTitle.textContent = event.title || 'Event';
    detailMeta.textContent = `${event.date || ''}${event.location ? ' • ' + event.location : ''}`;
    detailDesc.textContent = event.description || '';
    regFeedback.textContent = '';
    listEl.classList.add('hidden');
    detailEl.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showList() {
    detailEl.classList.add('hidden');
    listEl.classList.remove('hidden');
  }

  if (backBtn) backBtn.addEventListener('click', showList);
  if (regForm) regForm.addEventListener('submit', (event) => {
    event.preventDefault();
    regFeedback.textContent = 'Thanks! You are registered for this event.';
    regFeedback.classList.remove('is-error');
    regForm.reset();
  });

  fetch('/api/clubs')
    .then((response) => response.json())
    .then((data) => {
      clubs = Array.isArray(data) ? data : [];
      renderList();
      const params = new URLSearchParams(location.search);
      const clubParam = params.get('club');
      const eventParam = params.get('event');
      if (clubParam !== null && eventParam !== null) openDetail(Number(clubParam), Number(eventParam));
    })
    .catch(() => {
      if (listEl) listEl.innerHTML = '<p class="events-empty">Could not load events right now.</p>';
    });
})();
