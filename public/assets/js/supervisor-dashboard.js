(() => {
  const select = document.getElementById('supervisorClub');
  const content = document.getElementById('supervisorContent');
  const feedback = document.getElementById('supervisorFeedback');
  const refresh = document.getElementById('supervisorRefresh');
  const requestDialog = document.getElementById('supervisorRequestDialog');
  const requestDetailTitle = document.getElementById('supervisorRequestDetailTitle');
  const requestDetailImage = document.getElementById('supervisorRequestDetailImage');
  const requestDetails = document.getElementById('supervisorRequestDetails');
  const requestDialogActions = document.getElementById('supervisorRequestDialogActions');
  let data = null;
  let miuReviews = [];
  let registrationLoadFor = null;
  let registrationRevision = 0;
  let panel = 'overview';
  let revision = 0;
  let clubLoadedAt = 0;
  let miuReviewsLoadedAt = 0;
  const DATA_FRESH_MS = 25_000;
  const escape = window.MiuUI.escapeHtml;
  const text = value => escape(String(value || '').replace(/_/g, ' '));
  const api = window.MiuUI.createJsonClient({
    defaults: {"credentials":"same-origin","cache":"no-store"},
    fallbackMessage: "Could not load supervisor data.", tolerateInvalidJson: false, includeStatus: false
  });
  const empty = message => `<p class="supervisor-muted">${escape(message)}</p>`;
  function renderMiuAttendance() {
    content.innerHTML = '<h2>MIU event attendance</h2>' + (miuReviews.map(review => `<article class="supervisor-record"><h3>${escape(review.eventTitle)}</h3><p>${escape(review.eventDate)} · ${review.records.length} verified check-ins</p><div>${review.records.map(person => `<p><strong>${escape(person.name)}</strong> · ${escape(person.email)} &middot; ${escape(window.MiuUI.attendanceEventRoleLabel(person))} · ${person.membershipStatus === 'member' ? `Member · ${escape((person.memberClubNames || []).join(', '))}` : 'Non-member'}</p>`).join('')}</div><form data-miu-attendance-id="${review.eventRequestId}" data-miu-attendance-audience="${review.attendanceAudience === 'members' ? 'members' : 'all_students'}"><label>Review note<textarea name="comment" maxlength="500" placeholder="Required if rejecting"></textarea></label><div class="supervisor-decision-actions"><button class="primary-btn" name="action" value="approve">Approve and send to PR</button><button class="secondary-btn" name="action" value="reject">Reject</button></div><span role="status" aria-live="polite"></span></form></article>`).join('') || empty('No MIU event attendance is waiting for your review.'));
  }
  async function loadMiuAttendance(force = false, quiet = false) {
    if (!force && miuReviewsLoadedAt && Date.now() - miuReviewsLoadedAt < DATA_FRESH_MS) {
      if (panel === 'miuAttendance') renderMiuAttendance();
      if (!quiet) { content.setAttribute('aria-busy', 'false'); feedback.textContent = ''; }
      return;
    }
    const hadData = miuReviewsLoadedAt > 0;
    if (!quiet) { content.setAttribute('aria-busy', 'true'); feedback.textContent = hadData ? 'Refreshing attendance in the background...' : 'Loading MIU event attendance...'; }
    try {
      const result = await api('/api/supervisor/miu-attendance'); miuReviews = result.reviews || []; miuReviewsLoadedAt = Date.now();
      window.dashboardUnread?.update('miuAttendance', miuReviews.map(item => `${item.eventRequestId}:${item.attendanceAudience}:${item.eventDate}`));
      if (panel === 'miuAttendance') renderMiuAttendance();
      if (!quiet) feedback.textContent = '';
    } catch (error) { if (!quiet) feedback.textContent = hadData ? `Showing the last loaded attendance. ${error.message}` : error.message; }
    finally { if (!quiet) content.setAttribute('aria-busy', 'false'); }
  }
  function reviewForm(type, id) {
    const previous = data.reviews.find(item => item.targetType === type && item.targetId === String(id));
    return `<form data-review-type="${type}" data-review-id="${escape(id)}"><label>My supervision note
      <textarea required maxlength="2000" name="note">${escape(previous?.note || '')}</textarea></label>
      <button class="primary-btn" type="submit">Save supervision note</button><span role="status" aria-live="polite"></span></form>`;
  }
  function workflowFieldOptions(workflow) {
    if (!workflow?.revision || !workflow.actions?.includes('request_changes') || !workflow.editableFields?.length) return '';
    return `<fieldset class="supervisor-workflow-fields"><legend>Fields to correct</legend>${workflow.editableFields.map(field => `<label><input type="checkbox" name="fields" value="${escape(field.id)}"> ${escape(field.label)}</label>`).join('')}</fieldset>`;
  }
  function decisionButtons(workflow = null) {
    const actions = workflow?.revision ? workflow.actions : ['approve', 'request_edit', 'reject'];
    return actions.map(action => {
      const value = action === 'request_changes' ? 'request_edit' : action;
      const label = action === 'approve' ? 'Approve and forward' : action === 'reject' ? 'Reject' : 'Request changes';
      const className = action === 'approve' ? 'approve' : action === 'reject' ? 'reject' : 'changes';
      return `<button class="${className}" name="action" value="${value}">${label}</button>`;
    }).join('');
  }
  function decisionForm(type, id, status, workflow = null) {
    const controls = `<button class="view-details" type="button" data-request-details="${escape(id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><span>View Details</span></button>`;
    if (status !== 'pending_supervisor') return `<div class="req-actions supervisor-request-actions">${controls}</div>`;
    return `<form class="req-actions supervisor-request-actions" data-decision-type="${type}" data-decision-id="${escape(id)}"${workflow?.revision ? ` data-workflow-revision="${escape(workflow.revision)}"` : ''}><input type="text" name="comment" maxlength="2000" aria-label="Review feedback" placeholder="Comment for changes or rejection">${type === 'speaker' ? workflowFieldOptions(workflow) : ''}${decisionButtons(workflow)}${controls}<span role="status" aria-live="polite"></span></form>`;
  }
  function requestHistory(item) {
    let events = Array.isArray(item.workflowHistory) ? [...item.workflowHistory] : [];
    if (!events.length && item.submittedAt) {
      events.push({ role: 'club', action: 'submitted', fromStatus: 'draft', toStatus: item.status, createdAt: item.submittedAt });
      for (const comment of item.commentHistory || []) events.push({ role: comment.role, action: 'comment', comment: comment.text, createdAt: comment.createdAt });
      if (item.updatedAt && item.updatedAt !== item.submittedAt) events.push({ role: 'system', action: `Current status: ${item.status}`, toStatus: item.status, createdAt: item.updatedAt });
    }
    events.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    if (!events.length) return '<p class="supervisor-history-empty">No review history is recorded for this request yet.</p>';
    const roles = { club: 'Club', supervisor: 'Club supervisor', pr: 'PR Committee', english: 'English Committee', security: 'Security Office', dean: 'Dean', system: 'Workflow' };
    const actionLabels = { submitted: 'Submitted', resubmitted: 'Resubmitted', approve: 'Approved', reject: 'Rejected', request_edit: 'Requested changes', comment: 'Comment', deleted: 'Deleted', returned_to_pr: 'Returned to PR', returned_to_english: 'Returned to English', returned_to_security: 'Returned to Security' };
    return `<div class="supervisor-history-timeline">${events.map(entry => {
      const role = roles[entry.role] || entry.role || 'Workflow';
      const action = actionLabels[entry.action] || String(entry.action || 'Workflow').replace(/_/g, ' ');
      const moment = entry.createdAt ? new Date(entry.createdAt) : null;
      const date = moment && !Number.isNaN(moment.getTime()) ? moment.toLocaleDateString('en-GB') : 'Not recorded';
      const time = moment && !Number.isNaN(moment.getTime()) ? (window.formatSiteTime?.(moment) || moment.toLocaleTimeString()) : 'Not recorded';
      const status = entry.fromStatus || entry.toStatus ? `<p><strong>Status:</strong> ${escape(entry.fromStatus ? String(entry.fromStatus).replace(/_/g, ' ') : '—')} → ${escape(entry.toStatus ? String(entry.toStatus).replace(/_/g, ' ') : '—')}</p>` : '';
      const actor = entry.actorEmail || (entry.role === 'club' ? 'Club account (legacy record)' : `${role} (legacy record)`);
      return `<article class="supervisor-history-entry"><h4>${escape(role)} · ${escape(action)}</h4>${status}${entry.comment ? `<p><strong>Comment:</strong> ${escape(entry.comment)}</p>` : ''}<p><strong>User:</strong> ${escape(actor)}</p><p><strong>Date:</strong> ${escape(date)} · <strong>Time:</strong> ${escape(time)}</p></article>`;
    }).join('')}</div>`;
  }
  function renderClubRequest(item) {
    const type = ({ event: 'Event', booth: 'Booth', feed: 'Feed post', entry_permit: 'Entry permit' })[item.type] || text(item.type);
    const meta = [item.clubName, type, item.date].filter(Boolean).map(escape).join(' · ');
    const image = item.clubImage || '/assets/img/pics/logo.svg.png';
    return `<article class="supervisor-record req-card supervisor-request-card"><img src="${escape(image)}" alt="${escape(item.clubName || 'Club')} logo" loading="lazy"><div class="req-summary supervisor-request-heading"><strong>${escape(item.title || 'Untitled request')}</strong><div class="req-meta">${meta}</div><span class="badge-status">${text(item.status)}</span></div>${item.clubNotice ? `<details class="supervisor-request-notice"><summary title="Open the full review update">Review update</summary><p>${escape(item.clubNotice)}</p></details>` : ''}${decisionForm('content', item.id, item.status, item.workflowRevision ? { revision: item.workflowRevision, actions: item.workflowActions, editableFields: item.workflowEditableFields } : null)}</article>`;
  }
  function appendRequestDetail(label, value, wide = false) {
    const section = document.createElement('section');
    section.className = `detail-item supervisor-request-detail-item${wide ? ' detail-wide' : ''}`;
    const heading = document.createElement('h3'); heading.textContent = label;
    const content = document.createElement('p'); content.textContent = value || 'Not provided';
    section.append(heading, content); requestDetails.append(section);
  }
  function openRequestDetails(item) {
    if (!item || !requestDialog || !requestDetailTitle || !requestDetailImage || !requestDetails || !requestDialogActions) return;
    requestDetailTitle.textContent = item.title || 'Untitled request';
    requestDetailImage.src = item.clubImage || '/assets/img/pics/logo.svg.png';
    requestDetailImage.alt = `${item.clubName || 'Club'} logo`;
    requestDetails.replaceChildren();
    appendRequestDetail('Club', item.clubName);
    appendRequestDetail('Type', ({ event: 'Event', booth: 'Booth', feed: 'Feed post', entry_permit: 'Entry permit' })[item.type] || item.type);
    appendRequestDetail('Status', text(item.status));
    if (item.type === 'booth') {
      appendRequestDetail('Booth name', item.boothName || item.title);
      appendRequestDetail('Purpose', item.boothPurpose, true);
      appendRequestDetail('Description', item.boothDescription || item.description, true);
      appendRequestDetail('Preferred location', item.boothLocation || item.location);
      appendRequestDetail('Size', item.boothSize);
      appendRequestDetail('Required equipment', item.boothEquipment, true);
      appendRequestDetail('Setup date', item.boothSetupDate);
      appendRequestDetail('Opening date', item.boothOpenDate || item.date);
      appendRequestDetail('Closing date', item.boothCloseDate);
      appendRequestDetail('Contact person', item.boothContact);
      appendRequestDetail('Additional notes', item.boothNotes, true);
    } else if (item.type === 'sponsor') {
      appendRequestDetail('Sponsor name', item.sponsorName || item.title);
      appendRequestDetail('Company', item.sponsorCompany);
      appendRequestDetail('Contact person', item.sponsorContact);
      appendRequestDetail('Email', item.sponsorEmail);
      appendRequestDetail('Phone', item.sponsorPhone);
      appendRequestDetail('Sponsorship type', item.sponsorType);
      appendRequestDetail('Amount / value', item.sponsorAmount);
      appendRequestDetail('Benefits', item.sponsorBenefits, true);
      appendRequestDetail('Description', item.sponsorDescription || item.description, true);
      appendRequestDetail('Additional notes', item.sponsorNotes, true);
    } else {
      appendRequestDetail('Date', item.date);
      appendRequestDetail('Time', window.formatSiteTime?.(item.time) || item.time);
      appendRequestDetail('Location', item.location);
      appendRequestDetail('Budget', item.budget);
      appendRequestDetail('Description', item.description, true);
      if (item.type === 'entry_permit' && Array.isArray(item.permitItems) && item.permitItems.length) {
        const section = document.createElement('section'); section.className = 'detail-item detail-wide supervisor-request-detail-item';
        const heading = document.createElement('h3'); heading.textContent = 'People and items requested'; section.append(heading);
        const list = document.createElement('ul');
        item.permitItems.forEach(permitItem => {
          const entry = document.createElement('li');
          entry.textContent = `${permitItem.quantity || ''} · ${permitItem.number || ''} · ${permitItem.details || ''}`;
          list.append(entry);
        });
        section.append(list); requestDetails.append(section);
      }
      if (item.type === 'event') {
        appendRequestDetail('Student registration', item.registrationEnabled === true ? 'Open' : item.registrationEnabled === false ? 'Not enabled' : 'Not specified');
        appendRequestDetail('Attendance tracking', item.attendanceEnabled === true ? 'Enabled' : 'Not enabled');
        if (item.registrationEnabled || item.attendanceEnabled) appendRequestDetail('Attendance audience', item.attendanceAudience === 'members' ? 'Club members only' : item.attendanceAudience === 'all_students' ? 'All university students' : 'Not specified');
      }
      if (item.type === 'feed') appendRequestDetail('Post title', item.title);
    }
    if (item.clubNotice) appendRequestDetail('Latest club update', item.clubNotice, true);
    if (item.type === 'feed' && item.image) {
      const section = document.createElement('section'); section.className = 'detail-item detail-wide supervisor-request-detail-item';
      const heading = document.createElement('h3'); heading.textContent = 'Attachment'; section.append(heading);
      section.insertAdjacentHTML('beforeend', window.FeedMedia.render(item.image, item.title, 'feed-review-media'));
      requestDetails.append(section);
    }
    requestDialogActions.innerHTML = `<section class="supervisor-details-review"><button class="secondary-btn" type="button" data-toggle-review-history aria-expanded="false">Review All Edits</button><div class="detail-grid supervisor-history-panel" data-review-history-panel hidden><section class="detail-item detail-wide"><h3>Review history</h3>${requestHistory(item)}</section><section class="detail-item detail-wide"><h3>My supervision note</h3>${reviewForm('content', item.id)}</section></div></section>${item.status === 'pending_supervisor'
      ? `<form class="supervisor-dialog-review" data-modal-decision-id="${escape(item.id)}"${item.workflowRevision ? ` data-workflow-revision="${escape(item.workflowRevision)}"` : ''}><section class="detail-item detail-wide"><h3>Review comment</h3><textarea name="comment" maxlength="2000" placeholder="Optional for approval; required for requesting changes or rejection"></textarea></section>${workflowFieldOptions(item.workflowRevision ? { revision: item.workflowRevision, actions: item.workflowActions, editableFields: item.workflowEditableFields } : null)}<div class="dialog-actions">${decisionButtons(item.workflowRevision ? { revision: item.workflowRevision, actions: item.workflowActions } : null)}</div><span role="status" aria-live="polite"></span></form>`
      : ''}`;
    requestDialog.showModal();
  }
  async function saveReviewForm(form) {
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
  }
  function refreshSupervisorBadges() {
    if (!data) return;
    const waitingRequests = data.requests.filter(item => item.status === 'pending_supervisor');
    const waitingSpeakers = data.speakers.filter(item => item.status === 'pending_supervisor');
    window.dashboardUnread?.update('requests', waitingRequests.map(item => `${data.club.id}:${item.id}:${item.updatedAt || item.status}`));
    window.dashboardUnread?.update('speakerRequests', waitingSpeakers.map(item => `${data.club.id}:${item.id}:${item.updatedAt || item.status}`));
  }
  function render() {
    const invitations = document.getElementById('deanSpeakerInvitePanel');
    if (invitations) invitations.hidden = panel !== 'speakerInvite';
    content.hidden = panel === 'speakerInvite';
    if (panel === 'speakerInvite') { feedback.textContent = ''; return; }
    if (!data) return;
    const { club, requests, speakers, attendance } = data;
    refreshSupervisorBadges();
    document.getElementById('supervisorTitle').textContent = `${club.name} · Supervisor dashboard`;
    if (panel === 'overview') {
      content.innerHTML = `<h2>Club overview</h2><p>${escape(club.description)}</p><p class="supervisor-status">${text(club.status)}</p>
        <div class="supervisor-summary"><button class="overview-stat-card" type="button" data-panel="events"><span>Events</span><strong>${club.events.length}</strong><small>Open club events</small></button><button class="overview-stat-card" type="button" data-panel="requests"><span>Pending club requests</span><strong>${requests.filter(item => item.status === 'pending_supervisor').length}</strong><small>Review club submissions</small></button><button class="overview-stat-card" type="button" data-panel="speakers"><span>Speaker requests</span><strong>${speakers.filter(item => item.status === 'pending_supervisor').length}</strong><small>Review speaker proposals</small></button><button class="overview-stat-card" type="button" data-panel="reports"><span>Check-ins</span><strong>${attendance.reduce((sum, item) => sum + item.count, 0)}</strong><small>Open activity reports</small></button></div>
        <p class="supervisor-muted">Review assigned club activity and keep your supervision notes here. Approve new requests before they continue to the responsible committees.</p>`;
    } else if (panel === 'events') {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const groups = { Upcoming: [], Past: [], 'Date not confirmed': [] };
      club.events.forEach(event => {
        const date = event.date ? new Date(event.date) : new Date(NaN);
        groups[Number.isNaN(date.getTime()) ? 'Date not confirmed' : date >= today ? 'Upcoming' : 'Past'].push(event);
      });
      content.innerHTML = Object.entries(groups).map(([title, events]) => `<h2>${title} events</h2>${events.map(event => `<article class="supervisor-record"><h3>${escape(event.title)}</h3><small>${escape(event.date)} ${escape(event.time)} · ${escape(event.location)}</small><p>${escape(event.description)}</p><a class="secondary-btn" href="/pages/event.html?club=${club.id}&amp;event=${event.index}">View event</a></article>`).join('') || empty('No events in this category.')}`).join('');
    } else if (panel === 'registrations') {
      content.innerHTML = `<h2>Event registrations</h2><p class="supervisor-muted">Students registered for ${escape(club.name)} events.</p><p class="supervisor-muted" data-registration-message role="status" aria-live="polite">Loading registrations…</p><div class="club-registrations-list" data-registration-list></div>`;
      if (registrationLoadFor !== String(club.id)) void loadRegistrations(club.id);
    } else if (panel === 'requests') {
      const pendingRequests = requests.filter(item => item.status === 'pending_supervisor');
      content.innerHTML = `<h2>Club requests awaiting review (${pendingRequests.length})</h2>`
        + (pendingRequests.map(renderClubRequest).join('') || empty('No requests are currently awaiting your review.'));
    } else if (panel === 'speakers') {
      content.innerHTML = '<h2>External speaker requests</h2>' + (speakers.map(item => `<article class="supervisor-record"><h3>${escape(item.speakerName)}</h3><span class="supervisor-status">${text(item.status)}</span><p>${escape(item.jobTitleCompany || item.professionalDetails)}</p><p><strong>Talk topic:</strong> ${escape(item.proposedTopic)}</p><p><strong>Selection reason:</strong> ${escape(item.speakerSelectionReason || item.eventPurpose)}</p><p><strong>Student benefit:</strong> ${escape(item.expectedStudentBenefit)}</p>${item.speakerEmail ? `<p><strong>Email:</strong> ${escape(item.speakerEmail)}</p>` : ''}<p><strong>LinkedIn:</strong> ${escape(item.linkedinProfile)}</p><p><strong>Session format:</strong> ${escape(item.sessionFormat)}</p><p><strong>Availability:</strong> ${escape(item.availability)}</p><p><strong>Short bio:</strong> ${escape(item.shortBio)}</p><p><strong>Special requirements:</strong> ${escape(item.specialRequirements)}</p><p><strong>Club feedback:</strong> ${escape(item.clubReviewerComment)}</p><p><strong>Reviewer feedback:</strong> ${escape(item.reviewerComment)}</p>${(item.attachments || []).map((file, index) => `<button class="secondary-btn" type="button" data-attachment="${escape(item.id)}" data-index="${index}">Download ${escape(file.name)}</button>`).join('')}${decisionForm('speaker', item.id, item.status, item.workflowRevision ? { revision: item.workflowRevision, actions: item.workflowActions, editableFields: item.workflowEditableFields } : null)}${reviewForm('speaker', item.id)}</article>`).join('') || empty('No speaker requests have been submitted.'));
    } else {
      content.innerHTML = '<h2>Activity reports</h2><p class="supervisor-muted">Attendance summaries from the existing event records. Open-event check-ins show club membership captured at scan time.</p>' + (attendance.map(item => `<article class="supervisor-record"><h3>${escape(item.title)}</h3><span class="supervisor-status">${text(item._id.approvalStatus)}</span><p>${escape(item.date)} · ${text(item._id.itemType)} · ${item._id.attendanceAudience === 'all_students' ? 'Open student attendance' : 'Club member attendance'} · ${item.count} check-ins</p><details><summary>Review attendee sheet</summary>${(item.people || []).map(person => `<p>${escape(person.name)} · ${escape(person.email)} &middot; ${escape(window.MiuUI.attendanceEventRoleLabel(person))} · ${person.membershipStatus === 'member' ? `Member · ${escape((person.memberClubNames || []).join(', '))}` : person.membershipStatus === 'non_member' ? 'Non-member' : 'Club member'}</p>`).join('')}</details>${item._id.approvalStatus === 'pending_supervisor' ? `<form data-attendance-type="${escape(item._id.itemType)}" data-attendance-id="${item._id.eventRequestId}" data-attendance-audience="${item._id.attendanceAudience === 'all_students' ? 'all_students' : 'members'}"><label>Review feedback<textarea name="comment" maxlength="500"></textarea></label><div class="supervisor-decision-actions"><button class="primary-btn" name="action" value="approve">Approve and send to PR</button><button class="secondary-btn" name="action" value="reject">Reject</button></div><span role="status" aria-live="polite"></span></form>` : ''}</article>`).join('') || empty('No attendance reports are available.'));
    }
  }
  async function loadRegistrations(clubId) {
    const key = String(clubId);
    registrationLoadFor = key;
    const version = ++registrationRevision;
    try {
      const result = await api(`/api/supervisor/clubs/${encodeURIComponent(key)}/registrations`);
      if (version !== registrationRevision || panel !== 'registrations' || String(data?.club.id) !== key) return;
      const list = content.querySelector('[data-registration-list]');
      const message = content.querySelector('[data-registration-message]');
      const events = Array.isArray(result.events) ? result.events : [];
      const total = events.reduce((sum, event) => sum + (event.registrations?.length || 0), 0);
      if (message) message.textContent = `${events.length} event${events.length === 1 ? '' : 's'} · ${total} registration${total === 1 ? '' : 's'}.`;
      if (list) list.innerHTML = events.map(event => `<article class="club-registration-event"><header><div><h4>${escape(event.title)}</h4><p>${[event.date, event.time ? (window.formatSiteTime?.(event.time) || event.time) : '', event.location].filter(Boolean).map(escape).join(' · ') || 'Date and location not set'}</p></div><strong>${event.registrations?.length || 0}</strong></header>${event.registrations?.length ? `<ul>${event.registrations.map(person => `<li><div><strong>${escape(person.name)}</strong><a href="mailto:${escape(person.email)}">${escape(person.email)}</a></div><time>${person.registeredAt ? escape(window.formatSiteTime?.(person.registeredAt) || new Date(person.registeredAt).toLocaleString()) : ''}</time></li>`).join('')}</ul>` : '<p class="club-registration-empty">No one has registered yet.</p>'}</article>`).join('') || empty('No club events are available yet.');
      feedback.textContent = '';
    } catch (error) {
      if (version !== registrationRevision || panel !== 'registrations' || String(data?.club.id) !== key) return;
      const message = content.querySelector('[data-registration-message]');
      if (message) { message.textContent = error.message || 'Could not load event registrations.'; message.classList.add('is-error'); }
    } finally {
      if (version === registrationRevision) registrationLoadFor = null;
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
      select.disabled = false; await loadClub(); void loadMiuAttendance(false, true);
    } catch (error) { feedback.textContent = error.message; content.setAttribute('aria-busy', 'false'); }
    finally { refresh.disabled = false; }
  }
  function selectPanel(nextPanel, button) {
    panel = nextPanel;
    document.getElementById('deanSpeakerInvitePanel').hidden = panel !== 'speakerInvite';
    content.hidden = panel === 'speakerInvite';
    document.querySelectorAll('[data-panel]').forEach(item => {
      const active = item.dataset.panel === panel;
      item.classList.toggle('is-active', Boolean(active));
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
    const unreadSection = ({ requests: 'requests', speakers: 'speakerRequests', miuAttendance: 'miuAttendance' })[panel];
    if (unreadSection) window.dashboardUnread?.activate(unreadSection);
    if (panel === 'speakerInvite') render();
    else if (panel === 'miuAttendance') { document.getElementById('deanSpeakerInvitePanel').hidden = true; content.hidden = false; void loadMiuAttendance(); }
    else if (Date.now() - clubLoadedAt >= DATA_FRESH_MS) void loadClub(false);
    else render();
  }
  document.querySelectorAll('.committee-sidebar [data-panel]').forEach(button => button.addEventListener('click', () => selectPanel(button.dataset.panel, button)));
  requestDialog?.querySelector('[data-close-supervisor-request]')?.addEventListener('click', () => requestDialog.close());
  requestDialog?.addEventListener('click', event => {
    const historyToggle = event.target.closest('[data-toggle-review-history]');
    if (!historyToggle) return;
    const historyPanel = requestDialog.querySelector('[data-review-history-panel]');
    if (!historyPanel) return;
    historyPanel.hidden = !historyPanel.hidden;
    historyToggle.setAttribute('aria-expanded', String(!historyPanel.hidden));
    historyToggle.textContent = historyPanel.hidden ? 'Review All Edits' : 'Hide Review History';
  });
  requestDialog?.addEventListener('submit', async event => {
    const reviewFormElement = event.target.closest('form[data-review-type]');
    if (reviewFormElement) { event.preventDefault(); await saveReviewForm(reviewFormElement); return; }
    const form = event.target.closest('form[data-modal-decision-id]');
    if (!form) return;
    event.preventDefault();
    const action = event.submitter?.value;
    const comment = form.elements.comment.value.trim();
    const fields = [...form.querySelectorAll('input[name="fields"]:checked')].map(input => input.value);
    const status = form.querySelector('[role="status"]');
    if (action !== 'approve' && !comment) { status.textContent = 'Provide feedback before rejecting or requesting changes.'; form.elements.comment.focus(); return; }
    if (action === 'request_edit' && form.dataset.workflowRevision && !fields.length) { status.textContent = 'Select at least one field to correct.'; return; }
    const buttons = [...form.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
    const clubId = data.club.id;
    const managed = Boolean(form.dataset.workflowRevision);
    try {
      await api(managed
        ? `/api/workflow/requests/content/${encodeURIComponent(form.dataset.modalDecisionId)}/decision`
        : `/api/supervisor/clubs/${clubId}/decisions/content/${encodeURIComponent(form.dataset.modalDecisionId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: managed && action === 'request_edit' ? 'request_changes' : action, comment,
          ...(managed ? { revision: Number(form.dataset.workflowRevision), fields } : {}) })
      });
      requestDialog.close();
      if (data?.club.id === clubId) await loadClub();
    } catch (error) { status.textContent = error.message; buttons.forEach(button => button.disabled = false); }
  });
  select.addEventListener('change', loadClub);
  refresh.addEventListener('click', () => {
    if (panel === 'miuAttendance') return loadMiuAttendance(true);
    if (panel === 'registrations' && data) { registrationLoadFor = null; render(); return; }
    return select.disabled ? initialize() : loadClub(true);
  });
  content.addEventListener('submit', async event => {
    const miuDecision = event.target.closest('form[data-miu-attendance-id]');
    if (miuDecision) {
      event.preventDefault(); const action = event.submitter?.value, comment = miuDecision.elements.comment.value.trim();
      const status = miuDecision.querySelector('[role="status"]');
      if (action === 'reject' && !comment) { status.textContent = 'Add a reason before rejecting.'; miuDecision.elements.comment.focus(); return; }
      const buttons = [...miuDecision.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
      try { await api(`/api/supervisor/miu-attendance/${encodeURIComponent(miuDecision.dataset.miuAttendanceId)}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, comment, attendanceAudience: miuDecision.dataset.miuAttendanceAudience }) }); miuReviewsLoadedAt = 0; await loadMiuAttendance(true); }
      catch (error) { status.textContent = error.message; buttons.forEach(button => button.disabled = false); }
      return;
    }
    const decision = event.target.closest('form[data-decision-type], form[data-attendance-type]');
    if (decision) {
      event.preventDefault();
      const action = event.submitter?.value;
      const status = decision.querySelector('[role="status"]');
      const comment = decision.elements.comment.value.trim();
      if (action === 'request_edit' && decision.dataset.workflowRevision && decision.dataset.decisionType) {
        if (!comment) { status.textContent = 'Provide feedback before requesting changes.'; decision.elements.comment.focus(); return; }
        const item = data?.requests.find(request => String(request.id) === decision.dataset.decisionId);
        if (!item) { status.textContent = 'This request is no longer available. Refresh and try again.'; return; }
        openRequestDetails(item);
        const detailForm = requestDialog.querySelector('form[data-modal-decision-id]');
        if (detailForm) {
          detailForm.elements.comment.value = comment;
          detailForm.querySelector('input[name="fields"]')?.focus();
        }
        return;
      }
      const fields = [...decision.querySelectorAll('input[name="fields"]:checked')].map(input => input.value);
      if (action !== 'approve' && !comment) { status.textContent = 'Provide feedback before rejecting or requesting changes.'; decision.elements.comment.focus(); return; }
      if (action === 'request_edit' && decision.dataset.workflowRevision && !fields.length) { status.textContent = 'Select at least one field to correct.'; return; }
      const buttons = [...decision.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
      const clubId = data.club.id;
      const managed = Boolean(decision.dataset.workflowRevision);
      const path = managed
        ? `/api/workflow/requests/${decision.dataset.decisionType}/${encodeURIComponent(decision.dataset.decisionId)}/decision`
        : decision.dataset.decisionType
          ? `/api/supervisor/clubs/${clubId}/decisions/${decision.dataset.decisionType}/${decision.dataset.decisionId}`
          : `/api/supervisor/clubs/${clubId}/attendance/${decision.dataset.attendanceType}/${decision.dataset.attendanceId}/decision?audience=${encodeURIComponent(decision.dataset.attendanceAudience || 'members')}`;
      try {
        await api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: managed && action === 'request_edit' ? 'request_changes' : action, comment,
          ...(managed ? { revision: Number(decision.dataset.workflowRevision), fields } : {}) }) });
        if (data?.club.id === clubId) await loadClub();
      } catch (error) { status.textContent = error.message; }
      finally { buttons.forEach(button => button.disabled = false); }
      return;
    }

    const form = event.target.closest('form[data-review-type]'); if (!form) return;
    event.preventDefault(); await saveReviewForm(form);
  });
  content.addEventListener('click', async event => {
    const overviewCard = event.target.closest('.overview-stat-card[data-panel]');
    if (overviewCard) {
      const nav = [...document.querySelectorAll('.committee-sidebar [data-panel]')].find(item => item.dataset.panel === overviewCard.dataset.panel);
      selectPanel(overviewCard.dataset.panel, nav || overviewCard);
      if (overviewCard.dataset.panel === 'requests') void loadClub(true);
      return;
    }
    const detailButton = event.target.closest('[data-request-details]');
    if (detailButton) {
      const item = data?.requests.find(request => String(request.id) === detailButton.dataset.requestDetails);
      openRequestDetails(item);
      return;
    }
    const toggle = event.target.closest('[data-toggle-request]');
    if (toggle) {
      const section = document.getElementById(toggle.dataset.toggleRequest);
      if (section) { section.hidden = !section.hidden; toggle.setAttribute('aria-expanded', String(!section.hidden)); toggle.textContent = section.hidden ? (toggle.dataset.toggleRequest.startsWith('history-') ? 'Review All Edits' : 'View Details') : (toggle.dataset.toggleRequest.startsWith('history-') ? 'Hide Review History' : 'Hide Details'); }
      return;
    }
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
