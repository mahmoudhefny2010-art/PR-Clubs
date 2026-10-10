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
      || (['accepted', 'rejected'].includes(statusFilter) && app.status === statusFilter);
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

function openReviewModal(appId) {
  const app = state.applications.find((item) => item.id === appId);
  if (!app) return;

  state.selectedApplication = app;
  reviewModal.dataset.reviewMode = app.interviewed ? 'preview' : 'interview';
  reviewModal.querySelector('.modal-header h3').textContent = app.interviewed ? 'Interview Preview' : 'Applicant Interview';
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

  renderInterviewReviewQuestions(app);

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
  if (!state.interviewSections.length) {
    container.replaceChildren();
    container.classList.add('hidden');
    return;
  }
  container.innerHTML = state.interviewSections.map((section) => `
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
  container.classList.remove('hidden');
}

function collectInterviewReviewAnswers() {
  const answers = [];
  for (const section of state.interviewSections) {
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
  const response = await fetch('/api/club/heads');
  if (!response.ok) throw new Error('Could not load committee heads.');
  const heads = await response.json();
  window.dashboardUnread?.update('committeeHeads', heads.map((head) => `${head.committee}:${head.email}`));
  await loadCommitteeAvailability();
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

async function loadClubMembers() {
  const list = document.getElementById('clubMemberList');
  const count = document.getElementById('memberRosterCount');
  const committeeSelect = document.getElementById('clubMemberCommittee');
  if (!list || !count || !committeeSelect) return;
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
      card.append(details, type);
      list.append(card);
    });
    const note = document.getElementById('clubMemberCountNote');
      if (note) note.textContent = state.clubAccount?.role === 'head'
        ? `${members.length} members in ${data.committee || state.clubAccount.committee}`
        : `${Number(data.totalCount) || 0} club members · ${members.length} named profiles`;
  } catch (error) {
    count.textContent = 'Members could not be loaded';
    const message = document.createElement('p');
    message.className = 'member-roster-empty';
    message.textContent = error.message;
    list.append(message);
  }
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
    await loadClubMembers();
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
document.getElementById('myFormsBackHomeBtn').addEventListener('click', () => showView('home'));
document.getElementById('applicationBackHomeBtn').addEventListener('click', () => {
  state.editingMyForm = null;
  showView('home');
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
      state.pendingInterviewPhoto = await readImageFile(modalPhotoInput.files[0]);
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
      ...(state.pendingInterviewPhoto ? { photo: state.pendingInterviewPhoto } : {})
    })
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    document.getElementById('modalInterviewFeedback').textContent = result.message || 'Could not save this interview.';
    return;
  }
  if (state.pendingInterviewPhoto) state.selectedApplication.photo = state.pendingInterviewPhoto;
  state.pendingInterviewPhoto = '';
  reviewModal.classList.add('hidden');
  await loadApplications();
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/club-auth/logout', { method: 'POST' });
  await window.refreshHeaderAccountState?.();
  state.clubAccount = null;
  state.applications = [];
  showView('clubLogin');
});

document.getElementById('backHomeBtn').addEventListener('click', () => {
  showView('home');
});

document.getElementById('adminLoginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const setupRequired = event.currentTarget.dataset.setup === 'true';
  const email = document.getElementById('adminEmailInput').value.trim();
  const password = document.getElementById('adminPasswordInput').value;
  const payload = { email, password };
  if (setupRequired) payload.confirmPassword = document.getElementById('adminConfirmInput').value;

  try {
    const response = await fetch(setupRequired ? '/api/admin/setup' : '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Admin login failed.');
    if (setupRequired && result.savedToDatabase !== true) {
      throw new Error('The database did not confirm the new admin account. It was not accepted as saved.');
    }

    resetClubEditor();
    setAdminFeedback('');
    showView('admin');
    await Promise.all([loadClubs(), loadHomepageSettings(), loadArchivedClubs()]);
  } catch (error) {
    setAdminLoginFeedback(error.message, true);
  }
});

document.getElementById('clubLoginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const feedback = document.getElementById('clubLoginFeedback');
  const submitButton = document.getElementById('clubLoginSubmit');
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = 'Signing in…';
  feedback.textContent = '';
  feedback.classList.remove('is-error');

  try {
    const response = await fetch('/api/club-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('clubLoginEmail').value.trim(),
        password: document.getElementById('clubLoginPassword').value,
      }),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('The login API was not reached. Open the portal through the app server at http://localhost:1111/club-login, not a static preview or Live Server link.');
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Club login failed.');
    if (!result.authenticated || !result.club) throw new Error('Login succeeded, but the dashboard account could not be loaded.');
    await openClubPortal(result);
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.add('is-error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
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

document.getElementById('adminBackBtn').addEventListener('click', () => {
  showView('home');
});

document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  await window.refreshHeaderAccountState?.();
  showView('home');
});

document.getElementById('adminLoginBackBtn').addEventListener('click', () => {
  showView('home');
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    openAdminAccess();
  }
});

document.getElementById('homepageSettingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    title: document.getElementById('homeTitleInput').value.trim(),
    subtitle: document.getElementById('homeSubtitleInput').value.trim(),
  };

  try {
    const response = await fetch('/api/admin/homepage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not save homepage text.');

    homePageTitle.textContent = result.title;
    homePageSubtitle.textContent = result.subtitle;
    setAdminFeedback('Homepage text saved.');
  } catch (error) {
    setAdminFeedback(error.message, true);
  }
});

clubEditorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const clubId = Number(document.getElementById('clubEditorId').value);
  const currentClub = state.clubs.find((club) => club.id === clubId);
  const imageFile = clubImageInput.files[0];
  const payload = {
    name: document.getElementById('clubNameInput').value.trim(),
    committee: document.getElementById('clubCommitteeInput').value.trim(),
    category: document.getElementById('clubCategoryInput').value.trim(),
    status: document.getElementById('clubStatusInput').value,
    tagline: document.getElementById('clubTaglineInput').value.trim(),
    description: document.getElementById('clubDescriptionInput').value.trim(),
    requirements: document.getElementById('clubRequirementsInput').value.trim(),
    applicationIntro: applicationFormIntroInput.value.trim(),
    applicationFields: state.editingApplicationFields,
    seats: Number(document.getElementById('clubSeatsInput').value),
    members: Number(document.getElementById('clubMembersInput').value),
    applicants: Number(document.getElementById('clubApplicantsInput').value),
    imageFit: document.getElementById('clubImageFitInput').value,
    pinned: clubPinnedInput.checked,
  };
  if (!clubId) {
    payload.clubLoginEmail = document.getElementById('clubLoginEmailInput').value.trim();
    payload.clubInitialPassword = document.getElementById('clubInitialPasswordInput').value;
  }

  const invalidQuestion = state.editingApplicationFields.find((field) => (
    !field.label.trim() || (field.type === 'select' && field.options.length < 2)
  ));
  if (invalidQuestion) {
    setAdminFeedback('Every question needs a label; choice questions need at least two options.', true);
    return;
  }

  try {
    if (imageFile) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(imageFile.type) || imageFile.size > 5 * 1024 * 1024) {
        throw new Error('Choose a PNG, JPG, or WebP image up to 5 MB.');
      }
      payload.imageData = await readImageFile(imageFile);
    } else if (!currentClub?.image) {
      throw new Error('Choose a photo or logo for this club card.');
    }

    const endpoint = clubId ? `/api/admin/clubs/${clubId}` : '/api/admin/clubs';
    const response = await fetch(endpoint, {
      method: clubId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(result?.message || 'Could not save this club card.');

    resetClubEditor();
    await loadClubs();
    setAdminFeedback(clubId ? 'Club card updated.' : 'Club card added.');
  } catch (error) {
    setAdminFeedback(error.message, true);
  }
});

document.getElementById('cancelClubEditBtn').addEventListener('click', resetClubEditor);

clubImageInput.addEventListener('change', () => {
  const file = clubImageInput.files[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    clubImageInput.value = '';
    setAdminFeedback('Choose a PNG, JPG, or WebP image up to 5 MB.', true);
    return;
  }

  if (clubImagePreview.dataset.objectUrl) URL.revokeObjectURL(clubImagePreview.dataset.objectUrl);
  const imageUrl = URL.createObjectURL(file);
  clubImagePreview.dataset.objectUrl = imageUrl;
  clubImagePreview.src = imageUrl;
  clubImagePreview.classList.remove('hidden');
  setAdminFeedback('');
});

document.getElementById('modalPhoto').addEventListener('change', (event) => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    input.value = '';
    document.getElementById('modalInterviewFeedback').textContent = 'Choose a PNG, JPG, or WebP photo up to 5 MB.';
    return;
  }
  readImageFile(file).then((photo) => {
    state.pendingInterviewPhoto = photo;
    modalApplicantPhoto.src = photo;
    modalApplicantPhoto.classList.remove('hidden');
    modalApplicantAvatar.classList.add('hidden');
    photoName.textContent = file.name;
    document.getElementById('modalInterviewFeedback').textContent = 'New photo selected. Save the interview to update the application photo.';
  }).catch((error) => {
    document.getElementById('modalInterviewFeedback').textContent = error.message;
  });
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

function showView(viewName) {
  Object.entries(views).forEach(([key, view]) => {
    view.classList.toggle('active', key === viewName);
  });
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
  if (['admin', 'adminLogin'].includes(savedView.viewName)) {
    await openAdminAccess();
    return true;
  }
  if (['clubLogin', 'head'].includes(savedView.viewName)) {
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
  if (pathname === '/admin') {
    showView('authLoading');
    await openAdminAccess();
    return;
  }
  if (pathname === '/club-login' || pathname === '/club-dashboard') {
    showView('authLoading');
    await openClubPortal();
    return;
  }

  await Promise.all([loadClubs(), loadHomepageSettings()]);
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
      return;
    }
    if (await restoreLastAppView()) return;
    showView('home');
  }
}

init();
