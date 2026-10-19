// Events page logic (public/pages/events.html)
(function () {
  const listEl = document.getElementById('eventsList');

  const parseDate = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const escapeHtml = window.MiuUI.escapeHtml;

  let eventItems = [];
  const flatten = row => ({ ...row.item, clubId: row.club.id, clubName: row.club.name, clubImage: row.club.image,
    eventIndex: row.index, university: row.university, universityContentId: row.university ? row.item.id : undefined });
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
    const events = eventItems;
    if (!events.length) {
      listEl.innerHTML = '<p class="events-empty">No upcoming events right now.</p>';
      return;
    }
    listEl.innerHTML = events.map((event, index) => {
      const label = dayLabel(event.date);
      return `
      <button type="button" class="event-timeline-item sponsor-timeline-item" data-event-open="${index}" aria-haspopup="dialog">
        <span class="event-timeline-marker" aria-hidden="true"></span>
        <span class="event-timeline-content">
          <span class="event-timeline-header">
            <img src="${escapeHtml(event.clubImage)}" alt="" class="feed-timeline-avatar${event.university ? ' university-brand-avatar' : ''}" loading="lazy" decoding="async" />
            <span class="event-timeline-meta">
              <span class="event-tile-club">${escapeHtml(event.clubName || '')}</span>
              <span class="feed-timeline-date">${event.date ? `${formatDateForTimeline(event.date)}${label ? ` · ${label}` : ''}` : 'Date to be announced'}</span>
            </span>
          </span>
          <span class="event-timeline-body">
            <strong class="feed-timeline-title">${escapeHtml(event.title || 'Event')}</strong>
            ${!event.university && event.registrationEnabled !== false && event.date >= new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date()) ? '<span class="event-timeline-location">Student registration · Open event to check availability</span>' : ''}
            ${event.registrationEnabled !== false ? `<span class="event-timeline-location">${event.attendanceAudience === 'members' ? event.university ? 'MIU club members only' : 'Club members only' : 'Open to all university students'}</span>` : ''}
            ${event.attendanceEnabled === true ? '<span class="event-attendance-status">Attendance taken</span>' : ''}
            ${event.location ? `<span class="event-timeline-location">${escapeHtml(event.location)}</span>` : ''}
            ${event.description ? `<span class="feed-timeline-text">${escapeHtml(event.description)}</span>` : ''}
            ${event.image && event.image !== event.clubImage ? `<img src="${escapeHtml(event.image)}" alt="${escapeHtml(event.title || 'Event image')}" class="feed-timeline-image" loading="lazy" decoding="async" />` : ''}
            <span class="event-timeline-link">View event details →</span>
          </span>
        </span>
      </button>`;
    }).join('');
    listEl.querySelectorAll('[data-event-open]').forEach(button => button.addEventListener('click', () => {
      window.openEventModal(events[Number(button.dataset.eventOpen)]);
    }));
  }

  const pager = window.MiuPagination.create({ section: 'events', list: listEl,
    render(rows) { eventItems = rows.map(flatten); renderList(); },
    onError(error) { if (!eventItems.length) listEl.textContent = error.message; }
  });
  void pager.load();
  window.siteStartup.watch(() => pager.load());
})();
