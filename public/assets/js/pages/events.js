// Events page logic (public/pages/events.html)
(function () {
  const listEl = document.getElementById('eventsList');
  const feedTimelineSection = document.getElementById('feedTimelineSection');
  const feedTimelineEl = document.getElementById('feedTimeline');

  if (listEl) listEl.addEventListener('click', (clickEvent) => {
    const item = clickEvent.target.closest('.event-timeline-item');
    if (!item || typeof window.openEventModal !== 'function') return;
    const params = new URL(item.href, window.location.origin).searchParams;
    const event = allEvents().find((entry) => Number(entry.clubId) === Number(params.get('club')) && entry.eventIndex === Number(params.get('event')));
    if (!event) return;
    clickEvent.preventDefault();
    window.openEventModal(event);
  });

  const parseDate = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const legacyParams = new URLSearchParams(window.location.search);
  if (legacyParams.has('club') && legacyParams.has('event')) {
    window.location.replace(`/pages/event.html?club=${encodeURIComponent(legacyParams.get('club'))}&event=${encodeURIComponent(legacyParams.get('event'))}`);
  }

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&', '<': '<', '>': '>', '"': '"', "'": '\'',
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

  const allFeeds = () => clubs.flatMap((club) =>
    (Array.isArray(club.posts) ? club.posts : []).map((post, postIndex) => ({
      ...post,
      clubId: club.id,
      clubName: club.name,
      clubImage: club.image,
      postIndex,
    })));

  const dayLabel = (value) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const day = new Date(value);
    day.setHours(0, 0, 0, 0);
    if (day.getTime() === today.getTime()) return 'Today';
    if (day.getTime() === tomorrow.getTime()) return 'Tomorrow';
    return '';
  };

  function formatDateForTimeline(dateStr) {
    const date = parseDate(dateStr);
    if (!date) return '';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function renderList() {
    const events = allEvents()
      .map((event) => ({ ...event, parsed: parseDate(event.date) }))
      .filter((event) => event.parsed)
      .sort((left, right) => {
        if (left.parsed.getTime() !== right.parsed.getTime()) return left.parsed - right.parsed;
        return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
      });
    if (!events.length) {
      listEl.innerHTML = '<p class="events-empty">No upcoming events right now.</p>';
      return;
    }
    listEl.innerHTML = events.map((event) => {
      const label = dayLabel(event.date);
      return `
      <a class="event-timeline-item" href="/pages/event.html?club=${encodeURIComponent(event.clubId)}&event=${encodeURIComponent(event.eventIndex)}">
        <span class="event-timeline-marker" aria-hidden="true"></span>
        <span class="event-timeline-content">
          <span class="event-timeline-header">
            <img src="${escapeHtml(event.clubImage)}" alt="" class="feed-timeline-avatar" />
            <span class="event-timeline-meta">
              <span class="event-tile-club">${escapeHtml(event.clubName || '')}</span>
              <span class="feed-timeline-date">${formatDateForTimeline(event.date)}${label ? ` · ${label}` : ''}</span>
            </span>
          </span>
          <span class="event-timeline-body">
            <strong class="feed-timeline-title">${escapeHtml(event.title || 'Event')}</strong>
            ${event.location ? `<span class="event-timeline-location">${escapeHtml(event.location)}</span>` : ''}
            ${event.description ? `<span class="feed-timeline-text">${escapeHtml(event.description)}</span>` : ''}
            <span class="event-timeline-link">View event details →</span>
          </span>
        </span>
      </a>`;
    }).join('');
  }

  function renderFeedTimeline() {
    const feeds = allFeeds()
      .map((feed) => ({ ...feed, parsed: parseDate(feed.date) }))
      .filter((feed) => feed.parsed)
      .sort((left, right) => right.parsed - left.parsed); // Newest first

    if (!feeds.length) {
      feedTimelineSection.hidden = true;
      return;
    }

    feedTimelineSection.hidden = false;
    feedTimelineEl.innerHTML = feeds.map((feed) => `
      <article class="feed-timeline-item">
        <div class="feed-timeline-marker"></div>
        <div class="feed-timeline-content">
          <div class="feed-timeline-header">
            <img src="${escapeHtml(feed.clubImage)}" alt="${escapeHtml(feed.clubName)}" class="feed-timeline-avatar" />
            <div class="feed-timeline-meta">
              <span class="feed-timeline-club">${escapeHtml(feed.clubName || '')}</span>
              <span class="feed-timeline-date">${formatDateForTimeline(feed.date)}</span>
            </div>
          </div>
          <div class="feed-timeline-body">
            <h3 class="feed-timeline-title">${escapeHtml(feed.title || 'Feed post')}</h3>
            <span class="content-type-badge feed">Latest Feed</span>
            <p class="feed-timeline-text">${escapeHtml(feed.text || feed.description || '')}</p>
            ${feed.image && feed.image !== feed.clubImage ? '<img src="' + escapeHtml(feed.image) + '" alt="' + escapeHtml(feed.title || 'Feed image') + '" class="feed-timeline-image" />' : ''}
          </div>
        </div>
      </article>
    `).join('');
  }

  fetch('/api/clubs')
    .then((response) => response.json())
    .then((data) => {
      clubs = Array.isArray(data) ? data : [];
      renderList();
      renderFeedTimeline();
    })
    .catch(() => {
      if (listEl) listEl.innerHTML = '<p class="events-empty">Could not load events right now.</p>';
    });
})();
