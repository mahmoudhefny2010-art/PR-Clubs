(function () {
  const list = document.getElementById('communityFeedList');
  const status = document.getElementById('communityFeedStatus');
  const filters = [...document.querySelectorAll('.feed-filter')];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let entries = [];
  let activeFilter = 'all';
  const requestedPost = Number(new URLSearchParams(window.location.search).get('post'));
  let requestedPostFocused = false;

  const escapeHtml = window.MiuUI.escapeHtml;
  const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const formatDate = (date) => date ? date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }) : '';
  function render() {
    const visible = entries;
    if (!visible.length) {
      list.innerHTML = '';
      status.textContent = entries.length ? 'No updates match this filter right now.' : 'No club updates have been published yet.';
      status.hidden = false;
      return;
    }
    status.hidden = true;
    list.innerHTML = visible.map((entry, visibleIndex) => {
      const { club, item } = entry;
      const interaction = entry.university ? window.studentFeedbackForm('university', item.id, item.interaction, item.question, item.options) : '';
      const title = String(item.title || '').trim();
      const message = String(item.text || item.description || '').trim();
      const image = item.image && item.image !== club.image
        ? window.FeedMedia.render(item.image, title || 'Club post image', 'feed-timeline-image') : '';
      const avatar = club.image ? `<img src="${escapeHtml(club.image)}" alt="" class="feed-timeline-avatar${entry.university ? ' university-brand-avatar' : ''}" loading="lazy" decoding="async" />` : '';
      const dateText = entry.publishedAt ? `<span class="feed-timeline-date">${escapeHtml(formatDate(entry.publishedAt))}</span>` : '';
      if (entry.kind === 'event') {
        const eventDate = formatDate(entry.eventDate);
        const meta = [eventDate, item.time && window.formatSiteTime ? window.formatSiteTime(item.time) : item.time, item.location].filter(Boolean).join(' · ');
        return `<article class="feed-post-card"${entry.university ? ` data-university-content-id="${escapeHtml(item.id)}"` : ''}>
          <header class="feed-timeline-header">${avatar}<span class="feed-timeline-meta"><span class="feed-timeline-club">${escapeHtml(club.name || '')}</span>${dateText}</span><span class="feed-post-type type-event">${escapeHtml(entry.label)}</span></header>
          <div class="feed-timeline-body"><h2 class="feed-timeline-title">${escapeHtml(title)}</h2>${meta ? `<p class="feed-timeline-date feed-event-meta">${escapeHtml(meta)}</p>` : ''}${item.attendanceEnabled === true ? '<p class="event-attendance-status">Attendance taken</p>' : ''}${image}
            <div class="feed-event-footer">${message ? `<p class="feed-timeline-text">${escapeHtml(message)}</p>` : '<span></span>'}<button class="primary-btn feed-post-action" type="button" data-feed-event="${visibleIndex}" aria-haspopup="dialog">View event details</button></div>
          ${interaction}</div></article>`;
      }
        return `<article class="feed-post-card"${entry.university ? ` data-university-content-id="${escapeHtml(item.id)}"` : ''}>
        <header class="feed-timeline-header">${avatar}<span class="feed-timeline-meta"><span class="feed-timeline-club">${escapeHtml(club.name || '')}</span>${dateText}</span><span class="feed-post-type type-feed">${escapeHtml(entry.label)}</span></header>
        <div class="feed-timeline-body">${title ? `<h2 class="feed-timeline-title">${escapeHtml(title)}</h2>` : ''}${message ? `<p class="feed-timeline-text">${escapeHtml(message)}</p>` : ''}${image}${interaction}</div>
      </article>`;
    }).join('');
    list.querySelectorAll('[data-feed-event]').forEach(button => button.addEventListener('click', async () => {
      const entry = visible[Number(button.dataset.feedEvent)], item = entry.item, club = entry.club;
      button.disabled = true;
      try {
        await window.openEventModal({ ...item, clubId: club.id, clubName: club.name, clubImage: club.image,
          eventIndex: entry.index, university: entry.university === true, universityContentId: item.id });
        button.textContent = 'View event details';
      } catch (error) { button.textContent = error.message; }
      finally { button.disabled = false; }
    }));
    if (!requestedPostFocused && Number.isSafeInteger(requestedPost) && requestedPost > 0) {
      const requestedCard = list.querySelector(`[data-university-content-id="${requestedPost}"]`);
      if (requestedCard) {
        requestedPostFocused = true;
        requestedCard.tabIndex = -1;
        requestedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        requestedCard.focus({ preventScroll: true });
      }
    }
  }

  filters.forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    filters.forEach((filter) => {
      const selected = filter === button;
      filter.classList.toggle('is-active', selected);
      filter.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    void pager.setFilter(activeFilter);
  }));

  const pager = window.MiuPagination.create({ section: 'feed', list, post: requestedPost,
    render(rows) {
      entries = rows.map(row => {
        const item = row.item, eventDate = row.collection === 'events' ? parseDate(item.date) : null;
        const isEvent = row.collection === 'events';
        const announcement = row.university || /announcement|notice/.test(String(item.type || item.category || item.kind || '').toLowerCase());
        return { ...row, kind: isEvent ? 'event' : 'post', eventDate,
          publishedAt: parseDate(item.publishedAt || item.createdAt || item.submittedAt || item.date),
          label: isEvent ? (eventDate && eventDate < today ? 'Past Event' : 'Upcoming Event')
            : row.university ? 'University Announcement' : announcement ? 'Announcement' : (item.type || item.category || 'Club Update') };
      });
      render();
    },
    onError(error) { status.hidden = false; status.textContent = error.message; }
  });
  activeFilter = pager.filter;
  filters.forEach(button => {
    const selected = button.dataset.filter === activeFilter;
    button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  void pager.load();
  window.siteStartup.watch(() => pager.load());
})();
