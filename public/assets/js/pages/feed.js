(function () {
  const list = document.getElementById('communityFeedList');
  const status = document.getElementById('communityFeedStatus');
  const filters = [...document.querySelectorAll('.feed-filter')];
  let entries = [];
  let loadedClubs = [];
  let activeFilter = 'all';
  let universityRefreshId = 0;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const formatDate = (date) => date ? date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }) : '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function buildEntries(clubs, universityContent = []) {
    const clubEntries = clubs.flatMap((club) => {
      const events = (Array.isArray(club.events) ? club.events : []).map((event, index) => {
        const eventDate = parseDate(event.date);
        if (!eventDate || !String(event.title || '').trim()) return null;
        const publishedAt = parseDate(event.publishedAt || event.createdAt || event.submittedAt || event.date) || eventDate;
        return { kind: 'event', category: 'events', label: eventDate < today ? 'Past Event' : 'Upcoming Event', club, item: event, index, publishedAt, eventDate };
      }).filter(Boolean);
      const posts = (Array.isArray(club.posts) ? club.posts : []).map((post, index) => {
        const title = String(post.title || '').trim();
        const message = String(post.text || post.description || '').trim();
        if (!title && !message) return null;
        const publishedAt = parseDate(post.publishedAt || post.createdAt || post.date);
        const typeText = String(post.type || post.category || post.kind || '').toLowerCase();
        const isAnnouncement = /announcement|notice/.test(typeText);
        return { kind: 'post', category: isAnnouncement ? 'announcements' : 'activities', label: isAnnouncement ? 'Announcement' : (post.type || post.category || 'Club Update'), club, item: post, index, publishedAt };
      }).filter(Boolean);
      return [...events, ...posts];
    });
    const universityEntries = universityContent.map((item) => {
      const publishedAt = parseDate(item.createdAt) || parseDate(item.date);
      const club = { id: 0, name: 'Misr International University', image: '/assets/img/pics/logo.svg.png' };
      const isEvent = item.type === 'event';
      const eventDate = isEvent ? parseDate(item.date) : null;
      return {
        kind: isEvent ? 'event' : 'post', category: isEvent ? 'events' : 'announcements',
        label: isEvent ? (eventDate && eventDate < today ? 'Past Event' : 'Upcoming Event') : 'University Announcement',
        club, item: { ...item, text: item.description }, index: item.id, publishedAt, eventDate,
        university: true
      };
    });
    return [...clubEntries, ...universityEntries].sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0));
  }

  function render() {
    const visible = entries.filter((entry) => {
      if (activeFilter === 'events') return entry.kind === 'event'
        && (entry.eventDate ? entry.eventDate >= today : entry.university === true);
      return activeFilter === 'all' || entry.category === activeFilter;
    });
    if (!visible.length) {
      list.innerHTML = '';
      status.textContent = entries.length ? 'No updates match this filter right now.' : 'No club updates have been published yet.';
      status.hidden = false;
      return;
    }
    status.hidden = true;
    list.innerHTML = visible.map((entry) => {
      const { club, item } = entry;
      const title = String(item.title || '').trim();
      const message = String(item.text || item.description || '').trim();
      const image = item.image && item.image !== club.image
        ? `<img class="feed-timeline-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(title || 'Club post image')}" loading="lazy" />` : '';
      const avatar = club.image ? `<img src="${escapeHtml(club.image)}" alt="" class="feed-timeline-avatar${entry.university ? ' university-brand-avatar' : ''}" loading="lazy" />` : '';
      const dateText = entry.publishedAt ? `<span class="feed-timeline-date">${escapeHtml(formatDate(entry.publishedAt))}</span>` : '';
      if (entry.kind === 'event') {
        const eventDate = formatDate(entry.eventDate);
        const meta = [eventDate, item.time && window.formatSiteTime ? window.formatSiteTime(item.time) : item.time, item.location].filter(Boolean).join(' · ');
        return `<article class="feed-post-card">
          <header class="feed-timeline-header">${avatar}<span class="feed-timeline-meta"><span class="feed-timeline-club">${escapeHtml(club.name || '')}</span>${dateText}</span><span class="feed-post-type type-event">${escapeHtml(entry.label)}</span></header>
          <div class="feed-timeline-body"><h2 class="feed-timeline-title">${escapeHtml(title)}</h2>${meta ? `<p class="feed-timeline-date feed-event-meta">${escapeHtml(meta)}</p>` : ''}${image}
            <div class="feed-event-footer">${message ? `<p class="feed-timeline-text">${escapeHtml(message)}</p>` : '<span></span>'}<a class="primary-btn feed-post-action" href="${entry.university ? `/pages/event.html?university=${encodeURIComponent(item.id)}` : `/pages/event.html?club=${encodeURIComponent(club.id)}&event=${encodeURIComponent(entry.index)}`}">View event details</a></div>
          </div></article>`;
      }
      return `<article class="feed-post-card">
        <header class="feed-timeline-header">${avatar}<span class="feed-timeline-meta"><span class="feed-timeline-club">${escapeHtml(club.name || '')}</span>${dateText}</span><span class="feed-post-type type-feed">${escapeHtml(entry.label)}</span></header>
        <div class="feed-timeline-body">${title ? `<h2 class="feed-timeline-title">${escapeHtml(title)}</h2>` : ''}${message ? `<p class="feed-timeline-text">${escapeHtml(message)}</p>` : ''}${image}</div>
      </article>`;
    }).join('');
  }

  filters.forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    filters.forEach((filter) => {
      const selected = filter === button;
      filter.classList.toggle('is-active', selected);
      filter.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    render();
  }));

  Promise.all([
    fetch('/api/clubs', { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error('Could not load community updates.');
      return response.json();
    }),
    fetch('/api/university-content', { cache: 'no-store' }).then((response) => response.ok ? response.json() : []).catch(() => [])
  ])
    .then(([clubs, universityContent]) => {
      if (!Array.isArray(clubs)) throw new Error('Could not load community updates.');
      loadedClubs = clubs;
      entries = buildEntries(loadedClubs, Array.isArray(universityContent) ? universityContent : []);
      render();
    })
    .catch(() => {
      status.textContent = 'Community updates are unavailable right now. Please try again later.';
      status.hidden = false;
      list.innerHTML = '';
    });

  window.setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    const refreshId = ++universityRefreshId;
    try {
      const response = await fetch('/api/university-content', { cache: 'no-store' });
      if (!response.ok) throw new Error('University updates are unavailable.');
      const latest = await response.json();
      if (refreshId !== universityRefreshId) return;
      entries = buildEntries(loadedClubs, Array.isArray(latest) ? latest : []);
    } catch {
      if (refreshId !== universityRefreshId) return;
      entries = buildEntries(loadedClubs);
    }
    render();
  }, 60_000);
})();
