(() => {
  const select = document.getElementById('supervisorClub');
  const content = document.getElementById('supervisorContent');
  const feedback = document.getElementById('supervisorFeedback');
  const refresh = document.getElementById('supervisorRefresh');
  let data = null;
  let miuReviews = [];
  let panel = 'overview';
  let revision = 0;
  let clubLoadedAt = 0;
  let miuReviewsLoadedAt = 0;
  const DATA_FRESH_MS = 25_000;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const text = value => escape(String(value || '').replace(/_/g, ' '));
  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not load supervisor data.');
    return result;
  }
  const empty = message => `<p class="supervisor-muted">${escape(message)}</p>`;
  function renderMiuAttendance() {
    content.innerHTML = '<h2>MIU event attendance</h2>' + (miuReviews.map(review => `<article class="supervisor-record"><h3>${escape(review.eventTitle)}</h3><p>${escape(review.eventDate)} · ${review.records.length} verified check-ins</p><div>${review.records.map(person => `<p><strong>${escape(person.name)}</strong> · ${escape(person.email)} · ${person.membershipStatus === 'member' ? `Member · ${escape((person.memberClubNames || []).join(', '))}` : 'Non-member'}</p>`).join('')}</div><form data-miu-attendance-id="${review.eventRequestId}"><label>Review note<textarea name="comment" maxlength="500" placeholder="Required if rejecting"></textarea></label><div class="supervisor-decision-actions"><button class="primary-btn" name="action" value="approve">Approve and send to PR</button><button class="secondary-btn" name="action" value="reject">Reject</button></div><span role="status" aria-live="polite"></span></form></article>`).join('') || empty('No MIU event attendance is waiting for your review.'));
  }
  async function loadMiuAttendance(force = false) {
    if (!force && miuReviewsLoadedAt && Date.now() - miuReviewsLoadedAt < DATA_FRESH_MS) {
      renderMiuAttendance();
      content.setAttribute('aria-busy', 'false'); feedback.textContent = '';
      return;
    }
    const hadData = miuReviewsLoadedAt > 0;
    content.setAttribute('aria-busy', 'true'); feedback.textContent = hadData ? 'Refreshing attendance in the background...' : 'Loading MIU event attendance...';
    try {
      const result = await api('/api/supervisor/miu-attendance'); miuReviews = result.reviews || []; miuReviewsLoadedAt = Date.now();
      renderMiuAttendance();
      feedback.textContent = '';
    } catch (error) { feedback.textContent = hadData ? `Showing the last loaded attendance. ${error.message}` : error.message; }
    finally { content.setAttribute('aria-busy', 'false'); }
  }
  function reviewForm(type, id) {
    const previous = data.reviews.find(item => item.targetType === type && item.targetId === String(id));
    return `<form data-review-type="${type}" data-review-id="${escape(id)}"><label>My supervision note
      <textarea required maxlength="2000" name="note">${escape(previous?.note || '')}</textarea></label>
      <button class="primary-btn" type="submit">Save supervision note</button><span role="status" aria-live="polite"></span></form>`;
  }
  function decisionForm(type, id, status) {
    if (status !== 'pending_supervisor') return '';
    return `<form data-decision-type="${type}" data-decision-id="${escape(id)}"><label>Review feedback<textarea name="comment" maxlength="2000" placeholder="Required for rejection or requested changes"></textarea></label><div class="supervisor-decision-actions"><button class="primary-btn" name="action" value="approve">Approve and forward</button><button class="secondary-btn" name="action" value="request_edit">Request changes</button><button class="secondary-btn" name="action" value="reject">Reject</button></div><span role="status" aria-live="polite"></span></form>`;
  }
  function render() {
    if (!data) return;
    const { club, requests, speakers, attendance } = data;
    document.getElementById('supervisorTitle').textContent = `${club.name} · Supervisor dashboard`;
    if (panel === 'overview') {
      content.innerHTML = `<h2>Club overview</h2><p>${escape(club.description)}</p><p class="supervisor-status">${text(club.status)}</p>
        <div class="supervisor-summary"><div>Events<strong>${club.events.length}</strong></div><div>Club requests<strong>${requests.length}</strong></div><div>Speaker requests<strong>${speakers.length}</strong></div><div>Check-ins<strong>${attendance.reduce((sum, item) => sum + item.count, 0)}</strong></div></div>
        <p class="supervisor-muted">Review assigned club activity and keep your supervision notes here. Approve new requests before they continue to the responsible committees.</p>`;
    } else if (panel === 'events') {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const groups = { Upcoming: [], Past: [], 'Date not confirmed': [] };
      club.events.forEach(event => {
        const date = event.date ? new Date(event.date) : new Date(NaN);
        groups[Number.isNaN(date.getTime()) ? 'Date not confirmed' : date >= today ? 'Upcoming' : 'Past'].push(event);
      });
      content.innerHTML = Object.entries(groups).map(([title, events]) => `<h2>${title} events</h2>${events.map(event => `<article class="supervisor-record"><h3>${escape(event.title)}</h3><small>${escape(event.date)} ${escape(event.time)} · ${escape(event.location)}</small><p>${escape(event.description)}</p><a class="secondary-btn" href="/pages/event.html?club=${club.id}&amp;event=${event.index}">View event</a></article>`).join('') || empty('No events in this category.')}`).join('');
    } else if (panel === 'requests') {
      content.innerHTML = '<h2>Club requests · Supervisor review</h2>' + (requests.map(item => `<article class="supervisor-record"><h3>${escape(item.title)}</h3><span class="supervisor-status">${text(item.status)}</span><p>${text(item.type)} · #${item.id}</p><p>${escape(item.description)}</p>${item.clubNotice ? `<div class="content-review-update" role="status"><strong>Review update:</strong> ${escape(item.clubNotice)}</div>` : ''}${decisionForm('content', item.id, item.status)}${reviewForm('content', item.id)}</article>`).join('') || empty('No club requests have been submitted.'));
    } else if (panel === 'speakers') {
      content.innerHTML = '<h2>External speaker requests</h2>' + (speakers.map(item => `<article class="supervisor-record"><h3>${escape(item.speakerName)}</h3><span class="supervisor-status">${text(item.status)}</span><p>${escape(item.jobTitleCompany || item.professionalDetails)}</p><p><strong>Talk topic:</strong> ${escape(item.proposedTopic)}</p><p><strong>Selection reason:</strong> ${escape(item.speakerSelectionReason || item.eventPurpose)}</p><p><strong>Student benefit:</strong> ${escape(item.expectedStudentBenefit)}</p><p><strong>Email:</strong> ${escape(item.speakerEmail)}</p><p><strong>LinkedIn:</strong> ${escape(item.linkedinProfile)}</p><p><strong>Session format:</strong> ${escape(item.sessionFormat)}</p><p><strong>Availability:</strong> ${escape(item.availability)}</p><p><strong>Short bio:</strong> ${escape(item.shortBio)}</p><p><strong>Special requirements:</strong> ${escape(item.specialRequirements)}</p><p><strong>Club feedback:</strong> ${escape(item.clubReviewerComment)}</p><p><strong>Reviewer feedback:</strong> ${escape(item.reviewerComment)}</p>${(item.attachments || []).map((file, index) => `<button class="secondary-btn" type="button" data-attachment="${escape(item.id)}" data-index="${index}">Download ${escape(file.name)}</button>`).join('')}${decisionForm('speaker', item.id, item.status)}${reviewForm('speaker', item.id)}</article>`).join('') || empty('No speaker requests have been submitted.'));
    } else {
      content.innerHTML = '<h2>Activity reports</h2><p class="supervisor-muted">Attendance summaries from the existing event records. Open-event check-ins show club membership captured at scan time.</p>' + (attendance.map(item => `<article class="supervisor-record"><h3>${escape(item.title)}</h3><span class="supervisor-status">${text(item._id.approvalStatus)}</span><p>${escape(item.date)} · ${text(item._id.itemType)} · ${item._id.attendanceAudience === 'all_students' ? 'Open student attendance' : 'Club member attendance'} · ${item.count} check-ins</p><details><summary>Review attendee sheet</summary>${(item.people || []).map(person => `<p>${escape(person.name)} · ${escape(person.email)} · ${person.membershipStatus === 'member' ? `Member · ${escape((person.memberClubNames || []).join(', '))}` : person.membershipStatus === 'non_member' ? 'Non-member' : 'Club member'}</p>`).join('')}</details>${item._id.approvalStatus === 'pending_supervisor' ? `<form data-attendance-type="${escape(item._id.itemType)}" data-attendance-id="${item._id.eventRequestId}" data-attendance-audience="${item._id.attendanceAudience === 'all_students' ? 'all_students' : 'members'}"><label>Review feedback<textarea name="comment" maxlength="500"></textarea></label><div class="supervisor-decision-actions"><button class="primary-btn" name="action" value="approve">Approve and send to PR</button><button class="secondary-btn" name="action" value="reject">Reject</button></div><span role="status" aria-live="polite"></span></form>` : ''}</article>`).join('') || empty('No attendance reports are available.'));
    }
  }
  async function loadClub(force = true) {
    const sameClub = data && String(data.club.id) === String(select.value);
    if (!force && sameClub && clubLoadedAt && Date.now() - clubLoadedAt < DATA_FRESH_MS) { render(); return; }
    const current = ++revision;
    const hadData = Boolean(sameClub);
    if (!hadData) { data = null; clubLoadedAt = 0; content.replaceChildren(); }
    content.setAttribute('aria-busy', 'true');
    feedback.textContent = hadData ? 'Refreshing club information in the background...' : 'Loading club information...'; refresh.disabled = true;
    try {
      const result = await api(`/api/supervisor/clubs/${encodeURIComponent(select.value)}`);
      if (current !== revision) return;
      data = result; clubLoadedAt = Date.now(); render(); feedback.textContent = '';
    } catch (error) { if (current === revision) feedback.textContent = hadData ? `Showing the last loaded club information. ${error.message}` : error.message; }
    finally { if (current === revision) { content.setAttribute('aria-busy', 'false'); refresh.disabled = false; } }
  }
  async function initialize() {
    refresh.disabled = true;
    try {
      const result = await api('/api/supervisor/clubs');
      select.replaceChildren(...result.clubs.map(club => new Option(club.name, String(club.id))));
      if (!result.clubs.length) {
        select.add(new Option('No assigned clubs', '')); feedback.textContent = 'No clubs are assigned to your account. Contact the platform administrator.';
        content.setAttribute('aria-busy', 'false'); return;
      }
      select.disabled = false; await loadClub();
    } catch (error) { feedback.textContent = error.message; content.setAttribute('aria-busy', 'false'); }
    finally { refresh.disabled = false; }
  }
  document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => {
    panel = button.dataset.panel;
    document.querySelectorAll('[data-panel]').forEach(item => {
      item.classList.toggle('is-active', item === button);
      if (item === button) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
    if (panel === 'miuAttendance') void loadMiuAttendance();
    else if (Date.now() - clubLoadedAt >= DATA_FRESH_MS) void loadClub(false);
    else render();
  }));
  select.addEventListener('change', loadClub);
  refresh.addEventListener('click', () => panel === 'miuAttendance' ? loadMiuAttendance(true) : select.disabled ? initialize() : loadClub(true));
  content.addEventListener('submit', async event => {
    const miuDecision = event.target.closest('form[data-miu-attendance-id]');
    if (miuDecision) {
      event.preventDefault(); const action = event.submitter?.value, comment = miuDecision.elements.comment.value.trim();
      const status = miuDecision.querySelector('[role="status"]');
      if (action === 'reject' && !comment) { status.textContent = 'Add a reason before rejecting.'; miuDecision.elements.comment.focus(); return; }
      const buttons = [...miuDecision.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
      try { await api(`/api/supervisor/miu-attendance/${encodeURIComponent(miuDecision.dataset.miuAttendanceId)}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, comment }) }); miuReviewsLoadedAt = 0; await loadMiuAttendance(true); }
      catch (error) { status.textContent = error.message; buttons.forEach(button => button.disabled = false); }
      return;
    }
    const decision = event.target.closest('form[data-decision-type], form[data-attendance-type]');
    if (decision) {
      event.preventDefault();
      const action = event.submitter?.value;
      const status = decision.querySelector('[role="status"]');
      const comment = decision.elements.comment.value.trim();
      if (action !== 'approve' && !comment) { status.textContent = 'Provide feedback before rejecting or requesting changes.'; decision.elements.comment.focus(); return; }
      const buttons = [...decision.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
      const clubId = data.club.id;
      const path = decision.dataset.decisionType
        ? `/api/supervisor/clubs/${clubId}/decisions/${decision.dataset.decisionType}/${decision.dataset.decisionId}`
        : `/api/supervisor/clubs/${clubId}/attendance/${decision.dataset.attendanceType}/${decision.dataset.attendanceId}/decision?audience=${encodeURIComponent(decision.dataset.attendanceAudience || 'members')}`;
      try {
        await api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, comment }) });
        if (data?.club.id === clubId) await loadClub();
      } catch (error) { status.textContent = error.message; }
      finally { buttons.forEach(button => button.disabled = false); }
      return;
    }

    const form = event.target.closest('form[data-review-type]'); if (!form) return;
    event.preventDefault();
    const clubId = data.club.id;
    const status = form.querySelector('[role="status"]'); const button = form.querySelector('button');
    button.disabled = true; status.textContent = 'Saving…';
    try {
      const saved = await api(`/api/supervisor/clubs/${clubId}/reviews/${form.dataset.reviewType}/${form.dataset.reviewId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: form.elements.note.value })
      });
      if (data?.club.id === clubId) { data.reviews = data.reviews.filter(item => !(item.targetType === saved.targetType && item.targetId === saved.targetId)); data.reviews.push(saved); }
      status.textContent = 'Supervision note saved.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  content.addEventListener('click', async event => {
    const button = event.target.closest('[data-attachment]'); if (!button) return;
    button.disabled = true;
    try {
      const result = await api(`/api/speaker-requests/${button.dataset.attachment}/cv?attachmentIndex=${button.dataset.index}`);
      const url = new URL(result.url); if (url.protocol !== 'https:') throw new Error('Invalid attachment URL.');
      window.location.assign(url.href);
    } catch (error) { feedback.textContent = error.message; }
    finally { button.disabled = false; }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (panel === 'miuAttendance') void loadMiuAttendance();
    else void loadClub(false);
  });
  const startup = initialize(); window.siteStartup?.track(startup);
})();
