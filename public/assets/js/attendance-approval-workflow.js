(() => {
  const list = document.querySelector('[data-attendance-review-list]');
  const message = document.querySelector('[data-attendance-review-message]');
  const refreshButton = document.querySelector('[data-refresh-attendance-reviews]');
  const dialog = document.getElementById('attendanceReviewDialog');
  const openButton = document.getElementById('openAttendanceReviewBtn');
  const closeButton = document.querySelector('[data-close-attendance-reviews]');
  if (!list || !message || !dialog || !openButton) return;

  let refreshTimer = 0;
  let loading = false;
  let authorized = false;
  const htmlDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', hour12: true });
  };
  const escapePathPart = (value) => encodeURIComponent(String(value));
  const reviewKeys = (data) => (Array.isArray(data.reviews) ? data.reviews : []).map((review) => {
    const latest = review.records?.reduce((value, person) => Math.max(value, new Date(person.attendedAt || 0).getTime() || 0), 0) || 0;
    return `${data.stage}:${review.clubId}:${review.itemType}:${review.eventRequestId}:${latest}`;
  });

  async function request(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Could not load attendance reviews.');
    return data;
  }

  function renderReviews(reviews, stage) {
    list.replaceChildren();
    if (!reviews.length) {
      const empty = document.createElement('p');
      empty.className = 'attendance-review-message';
      empty.textContent = 'There are no attendance activities waiting for your approval.';
      list.append(empty);
      return;
    }

    reviews.forEach((review) => {
      const card = document.createElement('article');
      card.className = 'attendance-review-card';
      const title = document.createElement('h3');
      title.textContent = `${review.itemType === 'booth' ? 'Booth' : 'Event'} · ${review.eventTitle || 'Untitled activity'}`;
      const meta = document.createElement('p');
      meta.className = 'attendance-review-meta';
      meta.textContent = [review.clubName, review.eventDate, window.formatSiteTime(review.eventTime), `${review.records.length} attendee${review.records.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
      const heading = document.createElement('div');
      heading.className = 'attendance-review-heading';
      const avatar = document.createElement('div');
      avatar.className = 'attendance-review-club-avatar';
      if (review.clubImage) {
        const image = document.createElement('img');
        image.src = review.clubImage;
        image.alt = `${review.clubName || 'Club'} logo`;
        image.addEventListener('error', () => { avatar.textContent = (review.clubName || 'C').trim().charAt(0).toUpperCase(); }, { once: true });
        avatar.append(image);
      } else {
        avatar.textContent = (review.clubName || 'C').trim().charAt(0).toUpperCase();
      }
      const headingCopy = document.createElement('div');
      headingCopy.className = 'attendance-review-heading-copy';
      headingCopy.append(title, meta);
      if (stage === 'pending_pr') {
        const processing = document.createElement('span');
        processing.className = 'attendance-review-processing';
        processing.textContent = 'Processing · PR review';
        headingCopy.append(processing);
      }
      heading.append(avatar, headingCopy);
      const notes = document.createElement('div');
      notes.className = 'attendance-review-notes';
      (review.notes || []).forEach((entry) => {
        const note = document.createElement('p');
        const actionLabel = entry.action === 'rejected' ? 'rejected with note' : entry.action === 'approved' ? 'approval note' : 'note';
        note.textContent = `${String(entry.role || 'Reviewer').toUpperCase()} ${actionLabel}: ${entry.text}`;
        notes.append(note);
      });
      const people = document.createElement('div');
      people.className = 'attendance-review-people';
      review.records.forEach((person) => {
        const row = document.createElement('div');
        row.className = 'attendance-review-person';
        const identity = document.createElement('strong');
        identity.textContent = person.name || 'Student';
        const email = document.createElement('small');
        email.textContent = person.email || 'No email';
        const note = document.createElement('small');
        note.textContent = person.note ? `Note: ${person.note}` : 'No note';
        const checkin = document.createElement('small');
        checkin.textContent = `Checked in: ${htmlDate(person.attendedAt)}`;
        row.append(identity, email, note, checkin);
        people.append(row);
      });
      const sheet = document.createElement('details');
      sheet.className = 'attendance-review-sheet';
      const sheetSummary = document.createElement('summary');
      sheetSummary.textContent = `View all attendance sheet · ${review.records.length} attendee${review.records.length === 1 ? '' : 's'}`;
      sheet.append(sheetSummary, people);
      const controls = document.createElement('div');
      controls.className = 'attendance-review-card-actions';
      const noteField = document.createElement('textarea');
      noteField.className = 'attendance-review-note-field';
      noteField.maxLength = 500;
      noteField.rows = 2;
      noteField.placeholder = 'Add a note, or explain why you are rejecting this list';
      noteField.setAttribute('aria-label', `Note for ${review.eventTitle || 'this activity'}`);
      const approve = document.createElement('button');
      approve.type = 'button';
      approve.className = 'attendance-review-approve';
      approve.textContent = 'Approve all and forward';
      const reject = document.createElement('button');
      reject.type = 'button';
      reject.className = 'attendance-review-reject';
      reject.textContent = 'Reject';
      const saveNote = document.createElement('button');
      saveNote.type = 'button';
      saveNote.className = 'attendance-review-note';
      saveNote.textContent = 'Save note';
      const buttons = [approve, reject, saveNote];
      approve.addEventListener('click', () => decideReview(review, 'approve', buttons, noteField));
      reject.addEventListener('click', () => decideReview(review, 'reject', buttons, noteField));
      saveNote.addEventListener('click', () => decideReview(review, 'note', buttons, noteField));
      controls.append(noteField, approve, reject, saveNote);
      card.append(heading, notes, sheet, controls);
      list.append(card);
    });
  }

  async function loadReviews() {
    if (!dialog.open || loading) return;
    window.clearTimeout(refreshTimer);
    refreshTimer = 0;
    loading = true;
    window.dashboardSync?.report('attendanceApprovals', 'loading');
    try {
      const data = await request('/api/committee/attendance-reviews');
      if (!Array.isArray(data.reviews)) throw new Error('Unexpected attendance reviews response.');
      renderReviews(data.reviews, data.stage);
      window.dashboardUnread?.update('attendanceApprovals', reviewKeys(data));
      window.dashboardSync?.report('attendanceApprovals', 'success');
      message.textContent = '';
      message.classList.remove('is-error');
    } catch (error) {
      window.dashboardSync?.report('attendanceApprovals', 'error', error.message);
      message.textContent = error.message;
      message.classList.add('is-error');
    } finally {
      loading = false;
      if (dialog.open && document.visibilityState === 'visible') refreshTimer = window.setTimeout(loadReviews, 3000);
    }
  }

  async function decideReview(review, action, buttons, noteField) {
    const note = noteField.value.trim();
    if (['note', 'reject'].includes(action) && !note) {
      message.textContent = action === 'reject' ? 'Add a short reason before rejecting this attendance list.' : 'Write a note before saving it.';
      message.classList.add('is-error');
      noteField.focus();
      return;
    }
    buttons.forEach((button) => { button.disabled = true; });
    message.textContent = action === 'approve' ? 'Approving the full attendance list…'
      : action === 'reject' ? 'Rejecting the full attendance list…' : 'Saving your note…';
    message.classList.remove('is-error');
    const url = `/api/committee/attendance-reviews/${escapePathPart(review.clubId)}/${escapePathPart(review.itemType)}/${escapePathPart(review.eventRequestId)}/approve`;
    try {
      const data = await request(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(note ? { note } : {}) })
      });
      const confirmation = action === 'note'
        ? `Note saved for all ${data.recordsUpdated} attendance record(s).`
        : action === 'reject'
          ? `Rejected ${data.recordsUpdated} attendance record(s) for this activity.`
          : data.nextStage === 'complete'
            ? `Final approval saved for ${data.recordsUpdated} attendance record(s).`
            : `Approved all ${data.recordsUpdated} attendance record(s). Sent to ${data.nextStage.toUpperCase()} for review.`;
      if (note) noteField.value = '';
      await loadReviews();
      message.textContent = confirmation;
    } catch (error) {
      buttons.forEach((button) => { button.disabled = false; });
      message.textContent = error.message;
      message.classList.add('is-error');
    }
  }

  async function refreshUnreadBadge() {
    if (!authorized) {
      window.dashboardSync?.report('attendanceApprovals', 'error', 'sign in required');
      return;
    }
    window.dashboardSync?.report('attendanceApprovals', 'loading');
    try {
      const data = await request('/api/committee/attendance-reviews');
      if (!Array.isArray(data.reviews)) throw new Error('Unexpected attendance reviews response.');
      window.dashboardUnread?.update('attendanceApprovals', reviewKeys(data));
      window.dashboardSync?.report('attendanceApprovals', 'success');
    } catch (error) {
      window.dashboardSync?.report('attendanceApprovals', 'error', error.message);
    }
  }

  refreshButton?.addEventListener('click', () => {
    window.clearTimeout(refreshTimer);
    loadReviews();
  });
  openButton.addEventListener('click', () => {
    window.dashboardUnread?.activate('attendanceApprovals');
    window.dashboardPanels?.show('attendanceReviewDialog');
    if (authorized) loadReviews();
    else {
      message.textContent = 'Sign in with an authorized PR, SSO, or Dean account to review attendance.';
      message.classList.add('is-error');
    }
  });
  document.getElementById('overviewReviewsBtn')?.addEventListener('click', () => openButton.click());
  closeButton?.addEventListener('click', () => window.dashboardPanels?.showOverview());
  dialog.addEventListener('close', () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = 0;
  });
  document.addEventListener('visibilitychange', () => {
    if (dialog.open && document.visibilityState === 'visible') {
      window.clearTimeout(refreshTimer);
      loadReviews();
    }
  });
  document.getElementById('ssoLogoutBtn')?.addEventListener('click', async () => {
    await fetch('/api/club-auth/logout', { method: 'POST' });
    window.location.assign('/');
  });

  request('/api/club-auth/session').then((session) => {
    authorized = Boolean(session.authenticated && ['pr', 'sso', 'dean'].includes(session.club?.role));
    refreshUnreadBadge();
    window.setInterval(() => {
      if (document.visibilityState === 'visible' && !dialog.open) refreshUnreadBadge();
    }, 10000);
  }).catch((error) => {
    window.dashboardSync?.report('attendanceApprovals', 'error', error.message);
    message.textContent = error.message;
    message.classList.add('is-error');
  });
  window.addEventListener('dashboard:refresh', refreshUnreadBadge);
})();
