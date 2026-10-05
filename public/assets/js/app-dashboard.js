function renderHeadDashboard() {
  const clubApplications = state.applications;

  const total = clubApplications.length;
  const accepted = clubApplications.filter((app) => app.status === 'accepted').length;
  const rejected = clubApplications.filter((app) => app.status === 'rejected').length;

  statTotal.textContent = total;
  statAccepted.textContent = accepted;
  statRejected.textContent = rejected;

  clubDashboardName.textContent = state.clubAccount?.name || 'Club dashboard';

  applicationsList.innerHTML = clubApplications
    .map(
      (app) => `
        <article class="application-card">
          <div class="application-row">
            <div>
              <div class="applicant-head">${app.studentName}</div>
              <div class="applicant-meta">
                <span>ID: ${app.universityId || 'N/A'}</span>
                <span>Major: ${app.major || 'N/A'}</span>
              </div>
              <div class="applicant-meta">
                <span>${app.email}</span>
                <span>Phone: ${app.phone || 'N/A'}</span>
              </div>
              <div class="applicant-meta">
                <span>Slot: ${app.slot || 'N/A'}</span>
              </div>
            </div>
            <span class="badge ${app.status}${app.status === 'pending' && app.interviewed ? ' processing' : ''}">${app.status === 'pending' && app.interviewed ? 'Processing' : app.status}</span>
          </div>

          <div class="card-actions">
            <button class="preview-btn" data-action="preview" data-id="${app.id}">${app.interviewed ? 'Preview' : 'Interview Now'}</button>
            <button class="delete-btn" data-action="delete" data-id="${app.id}">Delete</button>
          </div>
        </article>
      `
    )
    .join('');

  applicationsList.querySelectorAll('[data-action="preview"]').forEach((button) => {
    button.addEventListener('click', () => openReviewModal(Number(button.dataset.id)));
  });

  applicationsList.querySelectorAll('[data-action="delete"]').forEach((button) => {
    button.addEventListener('click', () => deleteApplication(Number(button.dataset.id)));
  });
}

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
      input.placeholder = 'Leave blank to keep current password';
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
    const response = await fetch(`/api/clubs/${clubId}/committees`);
    const committees = await response.json();
    if (!response.ok) throw new Error(committees.message || 'Could not load this club’s committees.');
    applicationCommitteeInput.replaceChildren(new Option('Choose a committee', ''));
    for (const committee of committees) {
      applicationCommitteeInput.add(new Option(committee, committee));
    }
    applicationCommitteeInput.disabled = committees.length === 0;
    applicationForm.querySelector('[type="submit"]').disabled = committees.length === 0;
    if (!committees.length) {
      applicationFeedback.textContent = 'This club has not added committee heads yet, so applications are not open.';
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

document.getElementById('myFormsButton').addEventListener('click', () => {});
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

    await Promise.all([loadClubs(), loadHomepageSettings()]);
    resetClubEditor();
    setAdminFeedback('');
    showView('admin');
  } catch (error) {
    setAdminLoginFeedback(error.message, true);
  }
});

document.getElementById('clubLoginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const feedback = document.getElementById('clubLoginFeedback');
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
    await openClubPortal();
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.add('is-error');
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

function showView(viewName) {
  Object.entries(views).forEach(([key, view]) => {
    view.classList.toggle('active', key === viewName);
  });
}

async function init() {
  await Promise.all([loadClubs(), loadHomepageSettings()]);
  if (window.location.pathname === '/admin') {
    await openAdminAccess();
  } else if (window.location.pathname === '/club-login' || window.location.pathname === '/club-dashboard') {
    await openClubPortal();
  } else {
    const query = new URLSearchParams(window.location.search);
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
    showView('home');
  }
}

init();
