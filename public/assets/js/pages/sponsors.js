// Sponsors page logic (public/pages/sponsors.html)
(function () {
  const listEl = document.getElementById('sponsorsList');
  const detailEl = document.getElementById('sponsorDetail');
  const backBtn = document.getElementById('sponsorBack');
  const detailImg = document.getElementById('detailImg');
  const detailClub = document.getElementById('detailClub');
  const detailTitle = document.getElementById('detailTitle');
  const detailDesc = document.getElementById('detailDesc');

  const escapeHtml = window.MiuUI.escapeHtml;

  let items = [];

  function renderList() {
    const sponsors = items;
    if (!sponsors.length) {
      listEl.innerHTML = '<p class="events-empty">No approved sponsors right now.</p>';
      return;
    }
    listEl.innerHTML = sponsors.map((sponsor) => `
      <button type="button" class="event-timeline-item sponsor-timeline-item" data-club="${sponsor.clubId}" data-idx="${sponsor.index}" aria-haspopup="dialog">
        <span class="event-timeline-marker" aria-hidden="true"></span>
        <span class="event-timeline-content">
          <span class="event-timeline-header">
            <img src="${escapeHtml(sponsor.clubImage || '')}" alt="" class="feed-timeline-avatar" loading="lazy" decoding="async" />
            <span class="event-timeline-meta">
              <span class="event-tile-club">${escapeHtml(sponsor.clubName || '')}</span>
              <span class="feed-timeline-date">Upcoming Sponsor</span>
            </span>
          </span>
          <span class="event-timeline-body">
            <strong class="feed-timeline-title">${escapeHtml(sponsor.title || sponsor.sponsorName || 'Sponsor')}</strong>
            ${sponsor.sponsorCompany ? `<span class="event-timeline-location">${escapeHtml(sponsor.sponsorCompany)}</span>` : ''}
            ${sponsor.sponsorType ? `<span class="event-timeline-location">${escapeHtml(sponsor.sponsorType)}</span>` : ''}
            ${sponsor.sponsorDescription || sponsor.description ? `<span class="feed-timeline-text">${escapeHtml(sponsor.sponsorDescription || sponsor.description)}</span>` : ''}
            ${sponsor.sponsorLogo ? `<img src="${escapeHtml(sponsor.sponsorLogo)}" alt="${escapeHtml(sponsor.sponsorName || sponsor.sponsorCompany || sponsor.title || 'Sponsor logo')}" class="feed-timeline-image" loading="lazy" decoding="async" />` : ''}
            <span class="event-timeline-link">View sponsor details →</span>
          </span>
        </span>
      </button>`).join('');
    listEl.querySelectorAll('.sponsor-timeline-item').forEach((tile) => {
      tile.addEventListener('click', () => openDetail(Number(tile.dataset.club), Number(tile.dataset.idx)));
    });
  }

  function openDetail(clubId, idx) {
    const sponsor = items.find(item => Number(item.clubId) === Number(clubId) && Number(item.index) === Number(idx));
    const club = sponsor ? { name: sponsor.clubName, image: sponsor.clubImage } : null;
    if (!sponsor) return;
    detailImg.src = sponsor.sponsorLogo || club.image || '';
    detailClub.textContent = club.name || '';
    detailTitle.textContent = sponsor.title || sponsor.sponsorName || 'Sponsor';
    detailDesc.textContent = sponsor.sponsorDescription || sponsor.description || '';
    detailEl.classList.remove('hidden');
    detailEl.querySelector('.event-modal-panel').scrollTop = 0;
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

  const pager = window.MiuPagination.create({ section: 'sponsors', list: listEl,
    render(rows) { items = rows.map(row => ({ ...row.item, clubId: row.club.id, clubName: row.club.name, clubImage: row.club.image, index: row.index })); renderList(); },
    onError(error) { if (!items.length) listEl.textContent = error.message; }
  });
  void pager.load();
  window.siteStartup.watch(() => pager.load());
})();
