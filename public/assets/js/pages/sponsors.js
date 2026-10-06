// Sponsors page logic (public/pages/sponsors.html)
(function () {
  const listEl = document.getElementById('sponsorsList');
  const detailEl = document.getElementById('sponsorDetail');
  const backBtn = document.getElementById('sponsorBack');
  const detailImg = document.getElementById('detailImg');
  const detailClub = document.getElementById('detailClub');
  const detailTitle = document.getElementById('detailTitle');
  const detailDesc = document.getElementById('detailDesc');

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));

  let clubs = [];
  const allSponsors = () => clubs.flatMap((club) =>
    (Array.isArray(club.sponsors) ? club.sponsors : []).map((sponsor, index) => ({
      ...sponsor,
      contentType: sponsor.contentType || 'sponsor',
      clubId: club.id,
      clubName: club.name,
      clubImage: club.image,
      index,
    })));

  // Newest content first; equal dates show the most recently created item first.
  const compareNewest = (left, right) => {
    const leftCreated = new Date(left.createdAt || 0).getTime();
    const rightCreated = new Date(right.createdAt || 0).getTime();
    if (leftCreated !== rightCreated) return rightCreated - leftCreated;
    return (Number(right.requestId) || 0) - (Number(left.requestId) || 0);
  };

  function renderList() {
    const sponsors = allSponsors().sort(compareNewest);
    if (!sponsors.length) {
      listEl.innerHTML = '<p class="events-empty">No approved sponsors right now.</p>';
      return;
    }
    listEl.innerHTML = sponsors.map((sponsor) => `
      <button type="button" class="event-timeline-item sponsor-timeline-item" data-club="${sponsor.clubId}" data-idx="${sponsor.index}">
        <span class="event-timeline-marker" aria-hidden="true"></span>
        <span class="event-timeline-content">
          <span class="event-timeline-header">
            <img src="${escapeHtml(sponsor.sponsorLogo || sponsor.clubImage)}" alt="" class="feed-timeline-avatar" />
            <span class="event-timeline-meta">
              <span class="event-tile-club">${escapeHtml(sponsor.clubName || '')}</span>
              <span class="feed-timeline-date">Upcoming Sponsor</span>
            </span>
          </span>
          <span class="event-timeline-body">
            <strong class="feed-timeline-title">${escapeHtml(sponsor.title || sponsor.sponsorName || 'Sponsor')}</strong>
            <span class="event-timeline-link">View sponsor details →</span>
          </span>
        </span>
      </button>`).join('');
    listEl.querySelectorAll('.sponsor-timeline-item').forEach((tile) => {
      tile.addEventListener('click', () => openDetail(Number(tile.dataset.club), Number(tile.dataset.idx)));
    });
  }

  function openDetail(clubId, idx) {
    const club = clubs.find((c) => Number(c.id) === Number(clubId));
    const sponsor = club && Array.isArray(club.sponsors) ? club.sponsors[idx] : null;
    if (!sponsor) return;
    detailImg.src = sponsor.sponsorLogo || club.image || '';
    detailClub.textContent = club.name || '';
    detailTitle.textContent = sponsor.title || sponsor.sponsorName || 'Sponsor';
    detailDesc.textContent = sponsor.sponsorDescription || sponsor.description || '';
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
      if (listEl) listEl.innerHTML = '<p class="events-empty">Could not load sponsors right now.</p>';
    });
})();
