function renderHeadDashboard() {
  const clubApplications = state.applications;

  const total = clubApplications.length;
  const accepted = clubApplications.filter((app) => app.status === 'accepted').length;
  const rejected = clubApplications.filter((app) => app.status === 'rejected').length;
  const needsReview = clubApplications.filter((app) => app.status === 'pending' && !app.interviewed).length;

  statTotal.textContent = total;
  statAccepted.textContent = accepted;
  statRejected.textContent = rejected;
  const needsReviewStat = document.getElementById('statNeedsReview');
  if (needsReviewStat) needsReviewStat.textContent = needsReview;

  const recentSection = document.getElementById('presidentRecentApplicants');
  const recentList = document.getElementById('presidentRecentApplicantsList');
  if (recentSection && recentList) {
    const recent = [...clubApplications]
      .sort((left, right) => (new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0)) || Number(right.id) - Number(left.id))
      .slice(0, 3);
    recentList.innerHTML = recent.length ? recent.map((app) => {
      const status = app.status === 'pending' && app.interviewed ? 'Interviewed · pending' : app.status;
      return `<article class="president-recent-applicant"><div><strong>${escapeHtml(app.studentName || 'Applicant')}</strong><span>${escapeHtml([app.committee || state.clubAccount?.committee || 'Unassigned committee', app.major].filter(Boolean).join(' · '))}</span></div><span class="badge ${escapeHtml(app.status)}${app.interviewed && app.status === 'pending' ? ' processing' : ''}">${escapeHtml(status)}</span><button class="secondary-btn" type="button" data-overview-review="${Number(app.id)}">Review</button></article>`;
    }).join('') : '<p class="president-recent-empty">No applicants yet. New submissions will appear here.</p>';
    recentList.querySelectorAll('[data-overview-review]').forEach((button) => {
      button.addEventListener('click', () => openReviewModal(Number(button.dataset.overviewReview)));
    });
  }

  clubDashboardName.textContent = state.clubAccount?.name || 'Club dashboard';

  const search = String(document.getElementById('applicantSearchFilter')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('applicantStatusFilter')?.value || 'all';
  const committeeFilter = document.getElementById('applicantCommitteeFilter');
  if (committeeFilter) {
    const selectedCommittee = committeeFilter.value || 'all';
    const committees = [...new Set(clubApplications.map((app) => String(app.committee || '').trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    committeeFilter.replaceChildren(new Option('All committees', 'all'));
    committees.forEach((committee) => committeeFilter.add(new Option(committee, committee)));
    if (committees.includes(selectedCommittee)) committeeFilter.value = selectedCommittee;
  }
  const selectedCommittee = committeeFilter?.value || 'all';
  const visibleApplications = clubApplications.filter((app) => {
    const searchable = [app.studentName, app.email, app.universityId, app.major, app.phone].join(' ').toLowerCase();
    const matchesSearch = !search || searchable.includes(search);
    const matchesCommittee = selectedCommittee === 'all' || app.committee === selectedCommittee;
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'pending' && app.status === 'pending' && !app.interviewed)
      || (statusFilter === 'processing' && app.status === 'pending' && app.interviewed)
      || (['accepted', 'rejected', 'removed'].includes(statusFilter) && app.status === statusFilter);
    return matchesSearch && matchesCommittee && matchesStatus;
  });
  const resultsCount = document.getElementById('applicantResultsCount');
  if (resultsCount) resultsCount.textContent = `${visibleApplications.length} of ${clubApplications.length} applicants`;

  applicationsList.innerHTML = visibleApplications.length ? visibleApplications
    .map(
      (app) => `
        <article class="application-card head-applicant-card">
          <header class="head-applicant-header">
            <div class="head-applicant-identity">
              <h4>${escapeHtml(app.studentName || 'Applicant')}</h4>
              <p>${escapeHtml([app.committee || state.clubAccount?.committee, app.major].filter(Boolean).join(' · ') || 'Club applicant')}</p>
            </div>
            <span class="badge ${escapeHtml(app.status)}${app.status === 'pending' && app.interviewed ? ' processing' : ''}">${app.status === 'pending' && app.interviewed ? 'Interviewed · pending' : escapeHtml(app.status)}</span>
          </header>
          <div class="head-applicant-details">
            <div><span>Student ID</span><strong>${escapeHtml(app.universityId || 'Not provided')}</strong></div>
            <div><span>Email</span><strong>${escapeHtml(app.email || 'Not provided')}</strong></div>
            <div><span>Phone</span><strong>${escapeHtml(app.phone || 'Not provided')}</strong></div>
            <div><span>Interview slot</span><strong>${escapeHtml(app.slot || 'Not selected')}</strong></div>
          </div>
          <div class="card-actions head-applicant-actions">
            <button class="preview-btn${app.interviewed ? ' is-preview' : ' is-interview'}" data-action="preview" data-id="${Number(app.id)}">${app.interviewed ? 'Preview' : 'Interview Now'}</button>
            <button class="delete-btn" data-action="delete" data-id="${Number(app.id)}">Delete</button>
          </div>
        </article>
      `
    )
    .join('')
    : '<p class="application-filter-empty">No applicants match these filters.</p>';

  applicationsList.querySelectorAll('[data-action="preview"]').forEach((button) => {
    button.addEventListener('click', () => openReviewModal(Number(button.dataset.id)));
  });

  applicationsList.querySelectorAll('[data-action="delete"]').forEach((button) => {
    button.addEventListener('click', () => deleteApplication(Number(button.dataset.id)));
  });
}

document.getElementById('applicantSearchFilter')?.addEventListener('input', renderHeadDashboard);
document.getElementById('applicantStatusFilter')?.addEventListener('change', renderHeadDashboard);
document.getElementById('applicantCommitteeFilter')?.addEventListener('change', renderHeadDashboard);

async function deleteApplication(appId) {
  const response = await fetch(`/api/applications/${appId}`, { method: 'DELETE' });
  if (!response.ok) {
    window.alert('Could not delete this application.');
    return;
  }

  await loadApplications();
}

async function openReviewModal(appId) {
  const app = state.applications.find((item) => item.id === appId);
  if (!app) return;

  state.selectedApplication = app;
  reviewModal.dataset.reviewMode = app.interviewed ? 'preview' : 'interview';
  reviewModal.querySelector('.modal-header h3').textContent = app.interviewed ? 'Interview Preview' : 'Applicant Interview';
  if (state.pendingInterviewPhotoPreview) URL.revokeObjectURL(state.pendingInterviewPhotoPreview);
  state.pendingInterviewPhotoPreview = '';
  state.pendingInterviewPhoto = '';
  document.getElementById('modalPhoto').value = '';
  modalName.textContent = app.studentName;
  modalEmail.textContent = app.email;
  modalAge.value = app.age || '';
  modalMotivation.value = app.motivation || '';
  modalNotes.value = app.notes || '';
  modalRating.value = String(app.rating || 4);
  document.getElementById('modalInterviewFeedback').textContent = '';
  photoName.textContent = app.photo ? 'Uploaded' : 'No file chosen';
  modalApplicantPhoto.classList.toggle('hidden', !app.photo);
  modalApplicantAvatar.classList.toggle('hidden', Boolean(app.photo));
  if (app.photo) modalApplicantPhoto.src = app.photo;
  const answers = Array.isArray(app.answers) ? app.answers.filter((answer) => answer.value) : [];
  modalCustomAnswers.innerHTML = answers.map((answer) => `
    <div class="review-answer">
      <strong>${escapeHtml(answer.label)}</strong>
      <p>${escapeHtml(answer.value)}</p>
    </div>
  `).join('');
  modalCustomAnswers.classList.toggle('hidden', answers.length === 0);

  const reviewButton = document.getElementById('saveReviewBtn');
  reviewButton.disabled = true;
  state.reviewInterviewSections = [];
  document.getElementById('modalInterviewQuestions').replaceChildren();
  document.getElementById('modalInterviewFeedback').textContent = 'Loading interview questions...';
  reviewModal.classList.remove('hidden');
  try {
    const response = await fetch('/api/club/interview-form', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not load interview questions.');
    if (state.selectedApplication?.id !== appId) return;
    state.reviewInterviewSections = result.sections || [];
    renderInterviewReviewQuestions(app);
    document.getElementById('modalInterviewFeedback').textContent = '';
    reviewButton.disabled = false;
  } catch (error) {
    document.getElementById('modalInterviewFeedback').textContent = error.message + ' Close and reopen this interview to retry.';
    return;
  }

  reviewModal.querySelector('.modal-card').scrollTop = 0;
  reviewModal.classList.remove('hidden');
}

function getInterviewScope() {
  return state.clubAccount?.role === 'head' ? state.clubAccount.committee : '__president__';
}

function renderInterviewReviewQuestions(app) {
  const container = document.getElementById('modalInterviewQuestions');
  const evaluation = (app.interviewEvaluations || []).find((item) => item.scope === getInterviewScope());
  const previousAnswers = new Map((evaluation?.answers || []).map((answer) => [answer.key, answer.value]));

  container.innerHTML = (state.reviewInterviewSections || []).map((section) => `
    <section class="modal-interview-section">
      <h4>${escapeHtml(section.title)}</h4>
      <div class="form-row modal-interview-question-grid">
      ${section.questions.map((question) => {
        const value = previousAnswers.get(question.key) || '';
        const required = question.required ? 'required' : '';
        let control;
        if (question.type === 'select') {
          control = `<select data-interview-answer="${escapeHtml(question.key)}" ${required}>
            <option value="">Choose an answer</option>
            ${question.options.map((option) => `<option value="${escapeHtml(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
          </select>`;
        } else if (question.type === 'textarea') {
          control = `<textarea data-interview-answer="${escapeHtml(question.key)}" rows="3" ${required}>${escapeHtml(value)}</textarea>`;
        } else {
          control = `<input type="text" data-interview-answer="${escapeHtml(question.key)}" value="${escapeHtml(value)}" ${required} />`;
        }
        return `<div class="modal-field"><label>${escapeHtml(question.label)}${question.required ? ' *' : ''}</label>${control}</div>`;
      }).join('')}
      </div>
    </section>
  `).join('');
  const saved = evaluation?.answers || [];
  const history = evaluation?.history || [];
  if (saved.length || history.length) {
    const answersHtml = answers => answers.map(answer => '<div class="review-answer"><strong>' + escapeHtml(answer.label) + '</strong><p>' + escapeHtml(answer.value || 'No answer') + '</p></div>').join('');
    container.innerHTML += '<details class="modal-interview-section"><summary>Previously saved interview answers</summary>' + answersHtml(saved)
      + history.map((entry, index) => '<details><summary>Earlier save ' + (index + 1) + '</summary>' + answersHtml(entry.answers || []) + '</details>').join('') + '</details>';
  }
  container.classList.toggle('hidden', !container.innerHTML.trim());
}

function collectInterviewReviewAnswers() {
  const answers = [];
  for (const section of (state.reviewInterviewSections || [])) {
    for (const question of section.questions) {
      const input = document.querySelector(`#modalInterviewQuestions [data-interview-answer="${CSS.escape(question.key)}"]`);
      const value = input?.value.trim() || '';
      if (question.required && !value) {
        document.getElementById('modalInterviewFeedback').textContent = `Answer “${question.label}” before saving.`;
        input?.focus();
        return null;
      }
      answers.push({ key: question.key, label: question.label, value });
    }
  }
  document.getElementById('modalInterviewFeedback').textContent = '';
  return answers;
}

async function loadCommitteeHeads() {
  const [response] = await Promise.all([
    fetch('/api/club/heads'),
    loadCommitteeAvailability()
  ]);
  if (!response.ok) throw new Error('Could not load committee heads.');
  const heads = await response.json();
  window.dashboardUnread?.update('committeeHeads', heads.map((head) => `${head.committee}:${head.email}`));
  document.getElementById('committeeHeadCount').textContent = `${heads.length} ${heads.length === 1 ? 'head' : 'heads'}`;
  committeeHeadList.replaceChildren();
  if (!heads.length) {
    const empty = document.createElement('p');
    empty.className = 'committee-head-empty';
    empty.textContent = 'No committee heads have been added yet.';
    committeeHeadList.append(empty);
    return;
  }
  for (const head of heads) {
    const row = document.createElement('div');
    row.className = 'committee-head-row';
    const details = document.createElement('div');
    details.className = 'committee-head-details';
    const committee = document.createElement('strong');
    committee.textContent = `${head.committee} Head`;
    const email = document.createElement('span');
    email.textContent = head.email;
    details.append(committee, email);
    const actions = document.createElement('div');
    actions.className = 'committee-head-actions';
    const editButton = document.createElement('button');
    editButton.className = 'secondary-btn';
    editButton.type = 'button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => editCommitteeHead(head, row));
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-btn';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteCommitteeHead(head));
    actions.append(editButton, deleteButton);
    row.append(details, actions);
    committeeHeadList.append(row);
  }
}

async function loadCommitteeAvailability() {
  const list = document.getElementById('presidentCommitteeAvailability');
  const feedback = document.getElementById('committeeAvailabilityFeedback');
  if (!list || !feedback) return;
  list.replaceChildren();
  feedback.textContent = 'Loading committee availability…';
  feedback.classList.remove('is-error');
  try {
    const response = await fetch('/api/club/committee-availability', { cache: 'no-store' });
    const committees = await response.json();
    if (!response.ok) throw new Error(committees.message || 'Could not load committee availability.');
    if (!committees.length) {
      const empty = document.createElement('p');
      empty.className = 'committee-head-empty';
      empty.textContent = 'Create a committee head to add a committee to the application form.';
      list.append(empty);
    }
    committees.forEach(({ committee, status }) => {
      const row = document.createElement('label');
      row.className = 'committee-availability-row';
      const name = document.createElement('strong');
      name.textContent = committee;
      const select = document.createElement('select');
      select.dataset.committee = committee;
      [['open', 'Open'], ['full', 'Full'], ['closed', 'Closed']].forEach(([value, label]) => {
        select.add(new Option(label, value, false, value === status));
      });
      row.append(name, select);
      list.append(row);
    });
    feedback.textContent = '';
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.add('is-error');
  }
}

document.getElementById('saveCommitteeAvailabilityBtn')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const feedback = document.getElementById('committeeAvailabilityFeedback');
  button.disabled = true;
  feedback.textContent = '';
  feedback.classList.remove('is-error');
  try {
    const committees = [...document.querySelectorAll('#presidentCommitteeAvailability select[data-committee]')]
      .map((select) => ({ committee: select.dataset.committee, status: select.value }));
    const response = await fetch('/api/club/committee-availability', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ committees })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not save committee availability.');
    feedback.textContent = 'Committee availability saved.';
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.add('is-error');
  } finally {
    button.disabled = false;
  }
});

let clubMembersLoadedAt = 0;
let clubMembersRequestPending = false;
async function loadClubMembers(force = false) {
  if (clubMembersRequestPending) return;
  if (!force && clubMembersLoadedAt && Date.now() - clubMembersLoadedAt < 25_000) return;
  clubMembersRequestPending = true;
  const list = document.getElementById('clubMemberList');
  const count = document.getElementById('memberRosterCount');
  const committeeSelect = document.getElementById('clubMemberCommittee');
  if (!list || !count || !committeeSelect) { clubMembersRequestPending = false; return; }
  list.replaceChildren();
  count.textContent = 'Loading members…';
  try {
    const response = await fetch('/api/club/members');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load club members.');
    const members = Array.isArray(data.members) ? data.members : [];
    window.dashboardUnread?.update('clubMembers', members.map((member) => `${member.createdAt || `${member.name}:${member.committee}:${member.position}`}`));
    const committees = Array.isArray(data.committees) ? data.committees : [];
    count.textContent = state.clubAccount?.role === 'head'
      ? `${members.length} members in ${data.committee || state.clubAccount.committee}`
      : `${members.length} listed · ${Number(data.totalCount) || 0} total club members`;
    const selectedCommittee = committeeSelect.value;
    committeeSelect.replaceChildren(new Option('Choose a committee', ''));
    committees.forEach((committee) => committeeSelect.add(new Option(committee, committee)));
    if (committees.includes(selectedCommittee)) committeeSelect.value = selectedCommittee;
    document.getElementById('showMemberFormBtn').disabled = committees.length === 0;
    if (!committees.length && state.clubAccount?.role !== 'head') {
      const noCommittees = document.createElement('p');
      noCommittees.className = 'member-roster-empty';
      noCommittees.textContent = 'Add a committee head before assigning members to committees.';
      list.append(noCommittees);
    } else if (!members.length) {
      const empty = document.createElement('p');
      empty.className = 'member-roster-empty';
      empty.textContent = state.clubAccount?.role === 'head'
        ? `No accepted applicants or listed members are available for ${data.committee || state.clubAccount.committee} yet.`
        : `The club profile tracks ${Number(data.totalCount) || 0} members, but does not have individual names yet. Add a member to start the named roster.`;
      list.append(empty);
    }
    members.forEach((member) => {
      const card = document.createElement('article');
      card.className = 'member-roster-card';
      const details = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = member.name;
      const meta = document.createElement('p');
      meta.textContent = `${member.committee} · ${member.position}`;
      const type = document.createElement('span');
      type.className = 'member-type-pill';
      type.textContent = member.source === 'accepted-application'
        ? 'Accepted applicant'
        : member.memberType === 'senior' ? 'Senior member' : 'New member';
      details.append(name, meta);
      const actions = document.createElement('div');
      actions.className = 'member-roster-actions';
      actions.append(type);
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'secondary-btn member-role-edit-btn';
      editButton.textContent = 'Edit role';
      editButton.addEventListener('click', () => showMemberRoleEditor(card, member));
      actions.append(editButton);
      if (state.clubAccount?.role === 'president') {
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'delete-btn member-role-edit-btn';
        removeButton.textContent = 'Remove member';
        removeButton.setAttribute('aria-label', `Remove ${member.name} from this club`);
        removeButton.addEventListener('click', () => showMemberRemovalConfirmation(card, member));
        actions.append(removeButton);
      }
      card.append(details, actions);
      list.append(card);
    });
    clubMembersLoadedAt = Date.now();
    const note = document.getElementById('clubMemberCountNote');
      if (note) note.textContent = state.clubAccount?.role === 'head'
        ? `${members.length} members in ${data.committee || state.clubAccount.committee}`
        : `${Number(data.totalCount) || 0} club members · ${members.length} named profiles`;
  } catch (error) {
    clubMembersLoadedAt = 0;
    count.textContent = 'Members could not be loaded';
    const message = document.createElement('p');
    message.className = 'member-roster-empty';
    message.textContent = error.message;
    list.append(message);
  }
  clubMembersRequestPending = false;
}

function showMemberRemovalConfirmation(card, member) {
  const form = document.createElement('form');
  form.className = 'member-removal-confirmation';
  const message = document.createElement('p');
  message.textContent = `Remove ${member.name} from this club? Their account and history will be kept. Their membership will be marked removed.`;
  const actions = document.createElement('div');
  actions.className = 'member-role-edit-actions';
  const confirm = document.createElement('button');
  confirm.type = 'submit';
  confirm.className = 'delete-btn';
  confirm.textContent = 'Confirm removal';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary-btn';
  cancel.textContent = 'Cancel';
  const original = [...card.childNodes];
  cancel.addEventListener('click', () => {
    card.replaceChildren(...original);
    card.querySelector('.delete-btn')?.focus();
  });
  const feedback = document.createElement('p');
  feedback.className = 'member-role-edit-error';
  feedback.setAttribute('role', 'alert');
  actions.append(confirm, cancel);
  form.append(message, actions, feedback);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (confirm.disabled) return;
    confirm.disabled = cancel.disabled = true;
    feedback.textContent = '';
    confirm.textContent = 'Removing…';
    try {
      const response = await fetch(`/api/club/members/${encodeURIComponent(member.id)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not remove this member.');
      clubMembersLoadedAt = 0;
      await loadClubMembers(true);
    } catch (error) {
      feedback.textContent = error.message;
      confirm.textContent = 'Confirm removal';
      confirm.disabled = cancel.disabled = false;
    }
  });
  card.replaceChildren(form);
  cancel.focus();
}

function showMemberRoleEditor(card, member) {
  const form = document.createElement('form');
  form.className = 'member-role-edit-form';
  const positionLabel = document.createElement('label');
  positionLabel.textContent = 'Role in committee';
  const positionInput = document.createElement('input');
  positionInput.name = 'position';
  positionInput.maxLength = 100;
  positionInput.required = true;
  positionInput.value = member.position || 'Member';
  positionLabel.append(positionInput);
  const levelLabel = document.createElement('label');
  levelLabel.textContent = 'Member level';
  const levelSelect = document.createElement('select');
  levelSelect.name = 'memberType';
  levelSelect.add(new Option('New member', 'new'));
  levelSelect.add(new Option('Senior member', 'senior'));
  levelSelect.value = member.memberType === 'senior' ? 'senior' : 'new';
  levelLabel.append(levelSelect);
  const actions = document.createElement('div');
  actions.className = 'member-role-edit-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'primary-btn';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary-btn';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => loadClubMembers(true));
  actions.append(save, cancel);
  form.append(positionLabel, levelLabel, actions);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      const response = await fetch(`/api/club/members/${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: positionInput.value, memberType: levelSelect.value })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not update this member.');
      await loadClubMembers(true);
    } catch (error) {
      let feedback = card.querySelector('.member-role-edit-error');
      if (!feedback) {
        feedback = document.createElement('p');
        feedback.className = 'member-role-edit-error';
        form.append(feedback);
      }
      feedback.textContent = error.message;
      save.disabled = false;
    }
  });
  card.replaceChildren(form);
  positionInput.focus();
}

const memberManagerDialog = document.getElementById('memberManagerDialog');
document.getElementById('openMemberManagerBtn')?.addEventListener('click', () => {
  const isHead = state.clubAccount?.role === 'head';
  const dialog = document.getElementById('memberManagerDialog');
  const heading = document.getElementById('memberManagerTitle');
  const eyebrow = dialog?.querySelector('.admin-eyebrow');
  const description = dialog?.querySelector('.member-dialog-header p');
  const addButton = document.getElementById('showMemberFormBtn');
  if (heading) heading.textContent = isHead ? `${state.clubAccount.committee} members` : 'Club members';
  if (eyebrow) eyebrow.textContent = isHead ? 'COMMITTEE DASHBOARD' : 'PRESIDENT DASHBOARD';
  if (description) description.textContent = isHead
    ? 'Accepted applicants and listed members in your committee.'
    : 'Add each member’s MIU email so they can receive committee tasks in their student dashboard.';
  addButton?.classList.toggle('hidden', isHead);
  document.getElementById('clubMemberForm')?.classList.add('hidden');
  document.getElementById('clubMemberFeedback')?.classList.toggle('hidden', isHead);
  document.querySelector('.member-dialog-toolbar')?.classList.toggle('head-member-toolbar', isHead);
  dialog?.showModal();
  loadClubMembers();
});
document.getElementById('closeMemberManagerBtn')?.addEventListener('click', () => memberManagerDialog?.close());
document.getElementById('showMemberFormBtn')?.addEventListener('click', () => {
  const form = document.getElementById('clubMemberForm');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) form.querySelector('[name="name"]')?.focus();
});
document.getElementById('cancelMemberFormBtn')?.addEventListener('click', () => {
  document.getElementById('clubMemberForm')?.classList.add('hidden');
});
document.getElementById('clubMemberCommittee')?.addEventListener('change', (event) => {
  const position = document.getElementById('clubMemberPosition');
  position.placeholder = event.currentTarget.value ? `Position in ${event.currentTarget.value}` : 'Enter their committee position';
});
document.getElementById('clubMemberForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = document.getElementById('clubMemberFeedback');
  feedback.textContent = '';
  feedback.classList.remove('is-error');
  const formData = new FormData(form);
  try {
    const response = await fetch('/api/club/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.get('name'),
        email: formData.get('email'),
        committee: formData.get('committee'),
        position: formData.get('position'),
        memberType: formData.get('memberType')
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not add this member.');
    form.reset();
    form.classList.add('hidden');
    document.getElementById('clubMemberPosition').placeholder = 'Enter their committee position';
    feedback.textContent = `${result.member.name} was added to ${result.member.committee}.`;
    await loadClubMembers(true);
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.add('is-error');
  }
});

function editCommitteeHead(head, row) {
  const form = document.createElement('form');
  form.className = 'committee-head-edit-form';
  const fields = [
    { label: 'Committee', name: 'committee', type: 'text', value: head.committee },
    { label: 'Head email', name: 'email', type: 'email', value: head.email },
    { label: 'New password (optional)', name: 'password', type: 'password', value: '' }
  ];
  for (const field of fields) {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement('input');
    input.name = field.name;
    input.type = field.type;
    input.value = field.value;
    if (field.name === 'committee') input.maxLength = 100;
    if (field.name === 'password') {
      input.minLength = 12;
      input.autocomplete = 'new-password';
      input.placeholder = 'Leave blank to keep password';
    }
    if (field.name !== 'password') input.required = true;
    label.append(input);
    form.append(label);
  }
  const actions = document.createElement('div');
  actions.className = 'committee-head-edit-actions';
  const saveButton = document.createElement('button');
  saveButton.className = 'primary-btn';
  saveButton.type = 'submit';
  saveButton.textContent = 'Save changes';
  const cancelButton = document.createElement('button');
  cancelButton.className = 'secondary-btn';
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => loadCommitteeHeads());
  actions.append(saveButton, cancelButton);
  form.append(actions);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    try {
      const response = await fetch(`/api/club/heads/${encodeURIComponent(head.email)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          committee: formData.get('committee'),
          email: formData.get('email'),
          password: formData.get('password')
        })
      });
      const result = response.status === 204 ? {} : await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not update this head.');
      committeeHeadFeedback.textContent = formData.get('committee') !== head.committee
        ? 'Head account updated; existing applications moved to the new committee.'
        : 'Head account updated.';
      committeeHeadFeedback.classList.remove('is-error');
      await loadCommitteeHeads();
    } catch (error) {
      committeeHeadFeedback.textContent = error.message;
      committeeHeadFeedback.classList.add('is-error');
    }
  });
  row.replaceWith(form);
}

async function deleteCommitteeHead(head) {
  if (!window.confirm(`Delete the ${head.committee} head account (${head.email})?`)) return;
  try {
    const response = await fetch(`/api/club/heads/${encodeURIComponent(head.email)}`, { method: 'DELETE' });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.message || 'Could not delete this head.');
    }
    committeeHeadFeedback.textContent = 'Head account deleted. Existing applications remain with the club.';
    committeeHeadFeedback.classList.remove('is-error');
    await loadCommitteeHeads();
  } catch (error) {
    committeeHeadFeedback.textContent = error.message;
    committeeHeadFeedback.classList.add('is-error');
  }
}

async function loadApplicationCommittees(clubId) {
  applicationCommitteeInput.replaceChildren(new Option('Loading committees…', ''));
  applicationCommitteeInput.disabled = true;
  applicationForm.querySelector('[type="submit"]').disabled = true;
  try {
    const response = await fetch(`/api/clubs/${clubId}/application-committees`, { cache: 'no-store' });
    const committees = await response.json();
    if (!response.ok) throw new Error(committees.message || 'Could not load this club’s committees.');
    applicationCommitteeInput.replaceChildren(new Option('Choose a committee', ''));
    for (const committee of committees) {
      const option = new Option(committee.label || committee.committee, committee.committee);
      option.disabled = committee.selectable !== true;
      applicationCommitteeInput.add(option);
    }
    const hasOpenCommittees = committees.some((committee) => committee.selectable === true);
    applicationCommitteeInput.disabled = committees.length === 0;
    applicationForm.querySelector('[type="submit"]').disabled = !hasOpenCommittees;
    if (!committees.length) {
      applicationFeedback.textContent = 'This club has not added committee heads yet, so applications are not open.';
      applicationFeedback.classList.add('is-error');
    } else if (!hasOpenCommittees) {
      applicationFeedback.textContent = 'All committees are currently full or closed.';
      applicationFeedback.classList.add('is-error');
    }
  } catch (error) {
    applicationCommitteeInput.replaceChildren(new Option('Committees could not be loaded', ''));
    applicationFeedback.textContent = error.message;
    applicationFeedback.classList.add('is-error');
  }
}

closeModalBtn.addEventListener('click', () => {
  reviewModal.classList.add('hidden');
});

document.getElementById('saveReviewBtn').addEventListener('click', async () => {
  await saveInterviewReview();
});

document.getElementById('myFormsButton')?.addEventListener('click', () => {});
document.getElementById('myFormsBackHomeBtn').addEventListener('click', returnToPreviousAppView);
function setStudentDashboardSection(sectionName, { updateUrl = true } = {}) {
  const section = ['overview', 'applications', 'attendance'].includes(sectionName) ? sectionName : 'overview';
  document.querySelectorAll('[data-student-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.studentPanel !== section;
  });
  document.querySelectorAll('.student-dashboard-nav [data-student-section]').forEach((button) => {
    const active = button.dataset.studentSection === section;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (section === 'attendance') void window.loadMemberAttendanceAssignments?.();
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('myForms', '1');
    if (section === 'overview') url.searchParams.delete('section');
    else url.searchParams.set('section', section === 'applications' ? 'forms' : section);
    url.hash = '';
    window.history.replaceState({}, '', url);
  }
}
window.setStudentDashboardSection = setStudentDashboardSection;
document.querySelectorAll('[data-student-section]').forEach((button) => {
  button.addEventListener('click', () => setStudentDashboardSection(button.dataset.studentSection));
});
document.getElementById('applicationBackHomeBtn').addEventListener('click', () => {
  state.editingMyForm = null;
  const returnView = views[state.applicationReturnView] && state.applicationReturnView !== 'application'
    ? state.applicationReturnView
    : 'home';
  showView(returnView);
});
document.getElementById('acceptReviewBtn').addEventListener('click', async () => {
  await saveInterviewReview('accepted');
});

document.getElementById('rejectReviewBtn').addEventListener('click', async () => {

  clubStatusInput.addEventListener('change', syncPinnedControl);
  await saveInterviewReview('rejected');
});

async function saveInterviewReview(status) {
  if (!state.selectedApplication) return;
  const interviewAnswers = collectInterviewReviewAnswers();
  if (!interviewAnswers) return;
  const modalPhotoInput = document.getElementById('modalPhoto');
  if (modalPhotoInput.files[0] && !state.pendingInterviewPhoto) {
    try {
      const uploadedPhoto = await window.uploadImageToCloudinary(modalPhotoInput.files[0], 'applicant');
      state.pendingInterviewPhoto = uploadedPhoto;
    } catch (error) {
      document.getElementById('modalInterviewFeedback').textContent = error.message;
      return;
    }
  }
  const response = await fetch(`/api/applications/${state.selectedApplication.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(status ? { status } : {}),
      notes: modalNotes.value,
      rating: Number(modalRating.value),
      interviewAnswers,
      ...(state.pendingInterviewPhoto ? {
        photo: state.pendingInterviewPhoto.url,
        photoPublicId: state.pendingInterviewPhoto.publicId
      } : {})
    })
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    document.getElementById('modalInterviewFeedback').textContent = result.message || 'Could not save this interview.';
    return;
  }
  if (state.pendingInterviewPhoto) state.selectedApplication.photo = state.pendingInterviewPhoto.url;
  if (state.pendingInterviewPhotoPreview) URL.revokeObjectURL(state.pendingInterviewPhotoPreview);
  state.pendingInterviewPhotoPreview = '';
  state.pendingInterviewPhoto = '';
  reviewModal.classList.add('hidden');
  await loadApplications();
}

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await fetch('/api/club-auth/logout', { method: 'POST' });
  await window.refreshHeaderAccountState?.();
  state.clubAccount = null;
  state.applications = [];
  window.location.replace('/pages/applicant-login.html?redirect=%2Fclub-dashboard');
});

document.getElementById('backHomeBtn').addEventListener('click', returnToPreviousAppView);

document.getElementById('presidentClubStatusForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const select = document.getElementById('presidentClubStatusSelect');
  const feedback = document.getElementById('presidentClubStatusFeedback');
  const saveButton = form.querySelector('button[type="submit"]');
  if (state.clubAccount?.role !== 'president') {
    feedback.textContent = 'Only the club president can change club status.';
    return;
  }
  saveButton.disabled = true;
  feedback.textContent = 'Saving club status…';
  feedback.classList.remove('is-error');
  try {
    const response = await fetch('/api/club/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: select.value })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.savedToDatabase !== true) throw new Error(result.message || 'Could not save club status.');
    state.clubAccount.status = result.status;
    const club = state.clubs.find((item) => Number(item.id) === Number(result.clubId));
    if (club) {
      club.status = result.status;
      if (Number.isFinite(Number(result.applicants))) club.applicants = Number(result.applicants);
    }
    if (typeof renderClubGrid === 'function') renderClubGrid();
    const labels = { open: 'Open', 'opening-soon': 'Opening soon', full: 'Full', closed: 'Closed' };
    feedback.textContent = `Club status saved as ${labels[result.status] || result.status}.`;
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.add('is-error');
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById('createCommitteeHeadForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  committeeHeadFeedback.textContent = '';
  committeeHeadFeedback.classList.remove('is-error');
  const formData = new FormData(form);
  try {
    const response = await fetch('/api/club/heads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        committee: formData.get('committee'),
        email: formData.get('email'),
        password: formData.get('password')
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not create this committee head.');
    form.reset();
    committeeHeadFeedback.textContent = `Head account created for ${result.committee}. Share the email and password with the head.`;
    await loadCommitteeHeads();
  } catch (error) {
    committeeHeadFeedback.textContent = error.message;
    committeeHeadFeedback.classList.add('is-error');
  }
});

document.getElementById('modalPhoto').addEventListener('change', (event) => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    input.value = '';
    document.getElementById('modalInterviewFeedback').textContent = 'Choose a PNG, JPG, or WebP photo up to 10 MB.';
    return;
  }
  if (state.pendingInterviewPhotoPreview) URL.revokeObjectURL(state.pendingInterviewPhotoPreview);
  state.pendingInterviewPhoto = '';
  state.pendingInterviewPhotoPreview = URL.createObjectURL(file);
  modalApplicantPhoto.src = state.pendingInterviewPhotoPreview;
  modalApplicantPhoto.classList.remove('hidden');
  modalApplicantAvatar.classList.add('hidden');
  photoName.textContent = file.name;
  document.getElementById('modalInterviewFeedback').textContent = 'New photo selected. Save the interview to upload and apply it.';
});

const lastAppViewStorageKey = 'miu-last-app-view';

function persistCurrentViewState() {
  const viewName = Object.keys(views).find((key) => views[key]?.classList.contains('active'));
  if (!viewName || viewName === 'authLoading') return;
  const snapshot = {
    viewName,
    clubId: Number(state.selectedClub?.id) || null,
    editingFormId: Number(state.editingMyForm?.id) || null
  };
  try {
    sessionStorage.setItem(lastAppViewStorageKey, JSON.stringify(snapshot));
  } catch {}
}

function readLastAppView() {
  try {
    const snapshot = JSON.parse(sessionStorage.getItem(lastAppViewStorageKey) || 'null');
    return snapshot && typeof snapshot === 'object' ? snapshot : null;
  } catch {
    return null;
  }
}

const appViewBackStack = [];
let returningToAppView = false;
function returnToPreviousAppView() {
  const previous = appViewBackStack.pop();
  if (!previous) { window.miuGoBack?.('/'); return; }
  returningToAppView = true;
  showView(previous);
  returningToAppView = false;
}
function showView(viewName) {
  const current = Object.entries(views).find(([, view]) => view.classList.contains('active'))?.[0];
  if (!returningToAppView && current && current !== viewName && !['authLoading', 'signIn'].includes(current)) appViewBackStack.push(current);
  Object.entries(views).forEach(([key, view]) => {
    view.classList.toggle('active', key === viewName);
  });
  window.resetPageScroll();
  if (viewName !== 'authLoading') {
    document.documentElement.classList.remove('auth-route-pending');
    persistCurrentViewState();
  }
}

async function restoreLastAppView() {
  const savedView = readLastAppView();
  if (!savedView || !views[savedView.viewName]) return false;

  if (savedView.viewName === 'club' && state.clubs.some((club) => Number(club.id) === Number(savedView.clubId))) {
    openClubDetail(Number(savedView.clubId));
    return true;
  }
  if (savedView.viewName === 'application' && state.clubs.some((club) => Number(club.id) === Number(savedView.clubId))) {
    if (savedView.editingFormId) {
      await loadMyForms();
      const savedForm = state.myForms.find((item) => Number(item.id) === Number(savedView.editingFormId));
      if (savedForm) {
        await startEditingMyForm(savedForm);
        return true;
      }
    }
    await openApplicationForm(Number(savedView.clubId), true);
    return true;
  }
  if (savedView.viewName === 'myForms') {
    const studentSession = await fetch('/api/student-auth/session', { cache: 'no-store' }).catch(() => null);
    if (!studentSession?.ok) {
      try { sessionStorage.removeItem(lastAppViewStorageKey); } catch {}
      return false;
    }
    await loadMyForms();
    showView('myForms');
    return true;
  }
  if (savedView.viewName === 'head') {
    await openClubPortal();
    return true;
  }
  if (savedView.viewName === 'signIn') {
    showView('signIn');
    return true;
  }
  return false;
}

async function init() {
  const pathname = window.location.pathname;
  if (pathname === '/club-login' || pathname === '/club-dashboard') {
    showView('authLoading');
    await openClubPortal();
    return;
  }

  await loadClubs();
  if (window.siteStartup?.afterStartup) {
    window.siteStartup.afterStartup(async () => {
      try { await loadHomepageSettings(); }
      catch { /* Keep the default homepage copy if settings are temporarily unavailable. */ }
    });
  } else {
    await loadHomepageSettings().catch(() => {});
  }
  {
    const query = new URLSearchParams(window.location.search);
    if (query.has('calendarYear') && query.has('calendarMonth')) {
      const year = Number(query.get('calendarYear'));
      const month = Number(query.get('calendarMonth'));
      const day = Number(query.get('calendarDay'));
      showView('home');
      const reopenCalendar = () => window.openCalendarAt(year, month, Number.isInteger(day) ? day : null);
      if (typeof window.openCalendarAt === 'function') reopenCalendar();
      else document.addEventListener('DOMContentLoaded', reopenCalendar, { once: true });
      return;
    }
    const requestedApplicationClubId = Number(query.get('apply'));
    if (requestedApplicationClubId && state.clubs.some((club) => club.id === requestedApplicationClubId)) {
      await openApplicationForm(requestedApplicationClubId);
      return;
    }
    if (query.get('myForms') === '1') {
      await loadMyForms();
      showView('myForms');
      const requestedSection = query.get('section') === 'forms' ? 'applications' : query.get('section');
      setStudentDashboardSection(requestedSection, { updateUrl: false });
      return;
    }
    if (query.get('explore') === 'clubs') {
      showView('home');
      requestAnimationFrame(() => {
        const clubGrid = document.getElementById('clubGrid');
        if (!clubGrid) return;
        const stickyHeaderHeight = document.querySelector('.topbar-nav')?.getBoundingClientRect().height || 0;
        const targetTop = clubGrid.getBoundingClientRect().top + window.scrollY - stickyHeaderHeight - 16;
        window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      });
      return;
    }
    const navigationEntry = window.performance?.getEntriesByType?.('navigation')?.[0];
    const isReload = navigationEntry?.type === 'reload' || (!navigationEntry && window.performance?.navigation?.type === 1);
    if (isReload && await restoreLastAppView()) return;
    showView('home');
  }
}

const pageStartup = init().catch(() => {
  // A failed initial API must show an error, not an empty directory or an
  // indefinite loading screen. Reload retries the real data requests.
  const panel = document.createElement('section');
  panel.className = 'page-load-error';
  panel.setAttribute('role', 'alert');
  panel.setAttribute('aria-labelledby', 'pageLoadErrorTitle');
  const icon = document.createElement('div');
  icon.className = 'page-load-error-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 35h-3a9 9 0 0 1-1-18 12 12 0 0 1 23-3 10.5 10.5 0 0 1 2 20.8"/><circle cx="25" cy="32" r="9"/><path d="M25 27v5m0 4h.01"/></svg>';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'page-load-error-eyebrow';
  eyebrow.textContent = 'TEMPORARILY UNAVAILABLE';
  const title = document.createElement('h1');
  title.id = 'pageLoadErrorTitle';
  title.textContent = 'Let\u2019s try that again';
  const message = document.createElement('p');
  message.className = 'page-load-error-message';
  message.textContent = 'We couldn\u2019t load the page right now. Please try again in a moment.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'primary-btn';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => {
    retry.disabled = true;
    retry.textContent = 'Retrying...';
    window.location.reload();
  });
  panel.append(icon, eyebrow, title, message, retry);
  const wrapper = document.createElement('div');
  wrapper.className = 'page-load-error-wrap';
  wrapper.append(panel);
  document.querySelector('main').replaceChildren(wrapper);
  document.documentElement.classList.remove('auth-route-pending');
});
window.siteStartup?.track(pageStartup);

document.addEventListener("keydown", event => { if(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") { event.preventDefault(); location.assign("/admin"); } });
