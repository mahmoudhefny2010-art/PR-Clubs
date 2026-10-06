// Booths page logic (public/pages/booths.html)
(function () {
  const listEl = document.getElementById('boothsList');
  const detailEl = document.getElementById('boothDetail');
  const backBtn = document.getElementById('boothBack');
  const detailImg = document.getElementById('detailImg');
  const detailClub = document.getElementById('detailClub');
  const detailTitle = document.getElementById('detailTitle');
  const detailMeta = document.getElementById('detailMeta');
  const detailDesc = document.getElementById('detailDesc');

  const parseDate = (value) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));

  let clubs = [];
  const allBooths = () => clubs.flatMap((club) =>
    (Array.isArray(club.booths) ? club.booths : []).map((booth, index) => ({
      ...booth,
      contentType: booth.contentType || 'booth',
      clubId: club.id,
      clubName: club.name,
      clubImage: club.image,
      index,
    })));

  // Upcoming items sort by the nearest date first; equal dates show the most recently created item first.
  const compareUpcoming = (left, right) => {
    const leftDate = parseDate(left.boothOpenDate || left.date);
    const rightDate = parseDate(right.boothOpenDate || right.date);
    if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) return leftDate - rightDate;
    if (leftDate && !rightDate) return -1;
    if (!leftDate && rightDate) return 1;
    const leftCreated = new Date(left.createdAt || 0).getTime();
    const rightCreated = new Date(right.createdAt || 0).getTime();
    if (leftCreated !== rightCreated) return rightCreated - leftCreated;
    return (Number(right.requestId) || 0) - (Number(left.requestId) || 0);
  };

  function renderList() {
    const booths = allBooths().sort(compareUpcoming);
    if (!booths.length) {
      listEl.innerHTML = '<p class="events-empty">No approved booths right now.</p>';
      return;
    }
    listEl.innerHTML = booths.map((booth) => `
      <button type="button" class="event-timeline-item sponsor-timeline-item booth-timeline-item" data-club="${booth.clubId}" data-idx="${booth.index}">
        <span class="event-timeline-marker" aria-hidden="true"></span>
        <span class="event-timeline-content">
          <span class="event-timeline-header">
            <img src="${escapeHtml(booth.clubImage)}" alt="" class="feed-timeline-avatar" />
            <span class="event-timeline-meta">
              <span class="event-tile-club">${escapeHtml(booth.clubName || '')}</span>
              <span class="feed-timeline-date">Booth Opening Soon${booth.boothOpenDate || booth.date ? ` &middot; ${escapeHtml(booth.boothOpenDate || booth.date)}` : ''}</span>
            </span>
          </span>
          <span class="event-timeline-body">
            <strong class="feed-timeline-title">${escapeHtml(booth.title || booth.boothName || 'Booth')}</strong>
            ${booth.boothLocation ? `<span class="event-timeline-location">${escapeHtml(booth.boothLocation)}</span>` : ''}
            <span class="event-timeline-link">View booth details &rarr;</span>
          </span>
        </span>
      </button>`).join('');
    listEl.querySelectorAll('.booth-timeline-item').forEach((tile) => {
      tile.addEventListener('click', () => openDetail(Number(tile.dataset.club), Number(tile.dataset.idx)));
    });
  }

  function openDetail(clubId, idx) {
    const club = clubs.find((c) => Number(c.id) === Number(clubId));
    const booth = club && Array.isArray(club.booths) ? club.booths[idx] : null;
    if (!booth) return;
    detailImg.src = club.image || '';
    detailClub.textContent = club.name || '';
    detailTitle.textContent = booth.title || booth.boothName || 'Booth';
    detailMeta.textContent = booth.boothLocation || '';
    detailMeta.hidden = !booth.boothLocation;
    detailDesc.textContent = booth.boothDescription || booth.description || '';
    detailDesc.hidden = !detailDesc.textContent;
    detailEl.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  function showList() {
    detailEl.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  if (backBtn) backBtn.addEventListener('click', showList);
  if (detailEl) {
    detailEl.addEventListener('click', (event) => { if (event.target === detailEl) showList(); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !detailEl.classList.contains('hidden')) showList();
    });
  }

  fetch('/api/clubs')
    .then((response) => response.json())
    .then((data) => {
      clubs = Array.isArray(data) ? data : [];
      renderList();
    })
    .catch(() => {
      if (listEl) listEl.innerHTML = '<p class="events-empty">Could not load booths right now.</p>';
    });
})();
