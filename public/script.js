const state = {
  clubs: [],
  applications: [],
  selectedClub: null,
  selectedApplication: null,
  editingApplicationFields: [],
  presidentApplicationFields: [],
  interviewSections: [],
  pendingInterviewPhoto: '',
  clubAccount: null,
  myForms: [],
  editingMyForm: null,
};

const views = {
  home: document.getElementById('homeView'),
  myForms: document.getElementById('myFormsView'),
  adminLogin: document.getElementById('adminLoginView'),
  clubLogin: document.getElementById('clubLoginView'),
  admin: document.getElementById('adminView'),
  club: document.getElementById('clubView'),
  application: document.getElementById('applicationView'),
  head: document.getElementById('headDashboardView'),
};

const clubGrid = document.getElementById('clubGrid');
const clubDetail = document.getElementById('clubDetail');
const applicationForm = document.getElementById('applicationForm');
const myFormsList = document.getElementById('myFormsList');
const myFormsFeedback = document.getElementById('myFormsFeedback');
const myFormsStorageKey = 'miu-my-forms';
const applicationTitle = document.getElementById('applicationTitle');
const applicationsList = document.getElementById('applicationsList');
const clubDashboardName = document.getElementById('clubDashboardName');
const clubDashboardLogo = document.getElementById('clubDashboardLogo');
const applicationCommitteeInput = document.getElementById('applicationCommitteeInput');
const presidentHeadManager = document.getElementById('presidentHeadManager');
const presidentFormManager = document.getElementById('presidentFormManager');
const interviewFormManager = document.getElementById('interviewFormManager');
const toggleInterviewFormBtn = document.getElementById('toggleInterviewFormBtn');
const committeeHeadList = document.getElementById('committeeHeadList');
const committeeHeadFeedback = document.getElementById('committeeHeadFeedback');

const statTotal = document.getElementById('statTotal');
const statAccepted = document.getElementById('statAccepted');
const statRejected = document.getElementById('statRejected');
const totalClubsStat = document.getElementById('totalClubsStat');
const openClubsStat = document.getElementById('openClubsStat');
const fullClubsStat = document.getElementById('fullClubsStat');
const openingSoonClubsStat = document.getElementById('openingSoonClubsStat');
const totalApplicantsStat = document.getElementById('totalApplicantsStat');
const homePageTitle = document.getElementById('homePageTitle');
const homePageSubtitle = document.getElementById('homePageSubtitle');
const adminClubList = document.getElementById('adminClubList');
const adminClubCount = document.getElementById('adminClubCount');
const adminFeedback = document.getElementById('adminFeedback');
const clubEditorForm = document.getElementById('clubEditorForm');
const clubImageInput = document.getElementById('clubImageInput');
const clubImagePreview = document.getElementById('clubImagePreview');
const clubStatusInput = document.getElementById('clubStatusInput');
const clubPinnedInput = document.getElementById('clubPinnedInput');
const applicationFormIntro = document.getElementById('applicationFormIntro');
const applicationCustomFields = document.getElementById('applicationCustomFields');
const applicationFeedback = document.getElementById('applicationFeedback');
const applicationClubLogo = document.getElementById('applicationClubLogo');
const applicantPhotoInput = document.getElementById('applicantPhotoInput');
const applicantPhotoPreview = document.getElementById('applicantPhotoPreview');
const applicantPhotoPlaceholder = document.getElementById('applicantPhotoPlaceholder');
const applicationFieldEditorList = document.getElementById('applicationFieldEditorList');
const applicationFormIntroInput = document.getElementById('clubApplicationIntroInput');

const reviewModal = document.getElementById('reviewModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalName = document.getElementById('modalName');
const modalEmail = document.getElementById('modalEmail');
const modalAge = document.getElementById('modalAge');
const modalMotivation = document.getElementById('modalMotivation');
const modalNotes = document.getElementById('modalNotes');
const modalRating = document.getElementById('modalRating');
const photoName = document.getElementById('photoName');
const modalCustomAnswers = document.getElementById('modalCustomAnswers');
const modalApplicantPhoto = document.getElementById('modalApplicantPhoto');
const modalApplicantAvatar = document.getElementById('modalApplicantAvatar');

function getStoredMyForms() {
  try {
    const records = JSON.parse(localStorage.getItem(myFormsStorageKey) || '[]');
    return Array.isArray(records) ? records.filter((item) => Number.isFinite(Number(item.id)) && typeof item.token === 'string') : [];
  } catch {
    return [];
  }
}

function rememberMyForm(id, token) {
  const records = getStoredMyForms().filter((item) => Number(item.id) !== Number(id));
  records.push({ id: Number(id), token });
  localStorage.setItem(myFormsStorageKey, JSON.stringify(records));
}

function forgetMyForm(id) {
  const records = getStoredMyForms().filter((item) => Number(item.id) !== Number(id));
  localStorage.setItem(myFormsStorageKey, JSON.stringify(records));
}

async function loadMyForms() {
  const stored = getStoredMyForms();
  const results = await Promise.all(stored.map(async (entry) => {
    try {
      const response = await fetch(`/api/my-forms/${encodeURIComponent(entry.id)}`, {
        headers: { Authorization: `Bearer ${entry.token}` },
        cache: 'no-store'
      });
      if (!response.ok) return null;
      const result = await response.json();
      return { ...entry, ...result };
    } catch {
      return null;
    }
  }));
  state.myForms = results.filter(Boolean);
  renderMyForms();
}

function renderMyForms() {
  myFormsList.replaceChildren();
  if (!state.myForms.length) {
    const empty = document.createElement('div');
    empty.className = 'empty my-forms-empty';
    empty.textContent = 'Your applications will appear here after you submit them.';
    myFormsList.append(empty);
    return;
  }

  for (const item of state.myForms) {
    const app = item.application;
    const card = document.createElement('article');
    card.className = 'my-form-card';
    const summary = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = app.studentName || 'Application';
    const club = state.clubs.find((entry) => entry.id === app.clubId);
    const info = document.createElement('p');
    info.textContent = `${club?.name || 'Club'} · ${app.committee || 'Committee'}`;
    const statusKey = app.status === 'pending' && app.interviewed ? 'processing' : (app.status || 'pending');
    const statusLabels = { pending: 'Pending', processing: 'Processing', accepted: 'Accepted', rejected: 'Rejected' };
    const status = document.createElement('span');
    status.className = `badge ${statusKey}`;
    status.textContent = statusLabels[statusKey] || 'Pending';
    const meta = document.createElement('div');
    meta.className = 'my-form-meta';
    meta.append(info, status);
    summary.append(title, meta);
    const actions = document.createElement('div');
    actions.className = 'my-form-actions';
    if (item.canEdit) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'secondary-btn';
      edit.textContent = 'Edit form';
      edit.addEventListener('click', () => startEditingMyForm(item));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete-btn';
      remove.textContent = 'Remove form';
      remove.addEventListener('click', () => removeMyForm(item));
      actions.append(edit, remove);
    } else {
      const locked = document.createElement('span');
      locked.className = 'my-form-locked';
      locked.textContent = 'Editing is closed';
      actions.append(locked);
    }
    card.append(summary, actions);
    myFormsList.append(card);
  }
}

async function startEditingMyForm(item) {
  const app = item.application;
  await openApplicationForm(app.clubId, true);
  state.editingMyForm = item;
  const nameParts = String(app.studentName || '').trim().split(/\s+/);
  applicationForm.elements.namedItem('firstName').value = nameParts.shift() || '';
  applicationForm.elements.namedItem('lastName').value = nameParts.join(' ');
  for (const [field, value] of Object.entries({
    universityId: app.universityId, major: app.major, email: app.email, phone: app.phone,
    committee: app.committee, slot: app.slot, age: app.age, motivation: app.motivation, notes: app.notes
  })) {
    const input = applicationForm.elements.namedItem(field);
    if (input) input.value = value || '';
  }
  const answers = new Map((Array.isArray(app.answers) ? app.answers : []).map((answer) => [answer.key, answer.value]));
  for (const field of state.selectedClub?.applicationFields || []) {
    const input = applicationForm.elements.namedItem(`club-answer-${field.key}`);
    if (input) input.value = answers.get(field.key) || '';
  }
  applicantPhotoInput.required = false;
  if (app.photo) {
    applicantPhotoPreview.src = app.photo;
    applicantPhotoPreview.classList.remove('hidden');
    applicantPhotoPlaceholder.classList.add('hidden');
  }
  applicationForm.querySelector('.applicant-photo-field small').textContent = 'Current photo is kept. Upload a new photo only if you want to replace it.';
  applicationForm.querySelector('[type="submit"]').textContent = 'Save changes';
}

async function removeMyForm(item) {
  if (!window.confirm(`Remove your application to ${state.clubs.find((club) => club.id === item.application.clubId)?.name || 'this club'}?`)) return;
  const response = await fetch(`/api/my-forms/${encodeURIComponent(item.id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${item.token}` }
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    myFormsFeedback.textContent = result.message || 'Could not remove this form.';
    myFormsFeedback.classList.add('is-error');
    return;
  }
  forgetMyForm(item.id);
  myFormsFeedback.textContent = 'Your form was removed.';
  myFormsFeedback.classList.remove('is-error');
  await loadMyForms();
}

async function loadClubs() {
  const response = await fetch('/api/clubs');
  state.clubs = await response.json();
  renderClubGrid();
  renderAdminClubList();
}

async function loadHomepageSettings() {
  const response = await fetch('/api/admin/homepage');
  if (!response.ok) return;

  const settings = await response.json();
  homePageTitle.textContent = settings.title;
  homePageSubtitle.textContent = settings.subtitle;
  document.getElementById('homeTitleInput').value = settings.title;
  document.getElementById('homeSubtitleInput').value = settings.subtitle;
}

async function loadApplications() {
  const response = await fetch('/api/club/applications');
  if (!response.ok) throw new Error('Club login required to view applications.');
  state.applications = await response.json();
  renderHeadDashboard();
}

async function openClubPortal() {
  try {
    const sessionResponse = await fetch('/api/club-auth/session');
    const session = await sessionResponse.json();
    if (!session.authenticated) {
      state.clubAccount = null;
      state.applications = [];
      showView('clubLogin');
      return;
    }

    const dashboardResponse = await fetch('/api/club/dashboard');
    const club = await dashboardResponse.json();
    if (!dashboardResponse.ok) throw new Error(club.message || 'Could not load club dashboard.');

    state.clubAccount = club;
    clubDashboardName.textContent = club.name;
    clubDashboardLogo.src = club.image;
    clubDashboardLogo.alt = `${club.name} logo`;
    document.getElementById('clubDashboardRoleLabel').textContent = club.role === 'president'
      ? 'PRESIDENT DASHBOARD - ALL COMMITTEES'
      : `${club.committee} - HEAD DASHBOARD`;
    presidentHeadManager.classList.toggle('hidden', club.role !== 'president');
    presidentFormManager.classList.toggle('hidden', club.role !== 'president');
    interviewFormManager.classList.add('hidden');
    toggleInterviewFormBtn.classList.remove('hidden');
    toggleInterviewFormBtn.setAttribute('aria-expanded', 'false');
    toggleInterviewFormBtn.textContent = 'Manage interview questions';
    document.getElementById('interviewFormHeading').textContent = club.role === 'president'
      ? 'Club interview questions'
      : `${club.committee} interview questions`;
    document.getElementById('interviewFormDescription').textContent = club.role === 'president'
      ? 'These questions are used when you review applicants in your club dashboard.'
      : 'These questions are used when you review applicants assigned to your committee.';
    await Promise.all([
      loadInterviewForm(),
      ...(club.role === 'president' ? [loadCommitteeHeads(), loadPresidentApplicationForm()] : [])
    ]);
    await loadApplications();
    showView('head');
  } catch (error) {
    const feedback = document.getElementById('clubLoginFeedback');
    feedback.textContent = error.message;
    feedback.classList.add('is-error');
    showView('clubLogin');
  }
}

function renderClubGrid() {
  if (!clubGrid) return;

  const openCount = state.clubs.filter((club) => club.status === 'open').length;
  const fullCount = state.clubs.filter((club) => club.status === 'full').length;
  const openingSoonCount = state.clubs.filter((club) => club.status === 'opening-soon').length;
  const applicantTotal = state.clubs.reduce((sum, club) => sum + (club.applicants || 0), 0);

  if (totalClubsStat) totalClubsStat.textContent = state.clubs.length;
  if (openClubsStat) openClubsStat.textContent = openCount;
  if (fullClubsStat) fullClubsStat.textContent = fullCount;
  if (openingSoonClubsStat) openingSoonClubsStat.textContent = openingSoonCount;
  if (totalApplicantsStat) totalApplicantsStat.textContent = applicantTotal;

  clubGrid.innerHTML = getOrderedClubs(state.clubs)
    .map(
      (club) => `
        <article class="club-card${club.pinned ? ' is-pinned' : ''}">
          <div class="club-image-wrap">
            <img class="club-image${club.imageFit === 'contain' ? ' club-image-contain' : ''}" src="${escapeHtml(club.image)}" alt="${escapeHtml(club.name)} activities" loading="lazy" />
            ${club.pinned ? '<span class="club-pin-badge">PINNED</span>' : ''}
          </div>

          <div class="club-card-content">
            <div class="club-card-header">
              <div class="club-name">${escapeHtml(club.name)}${club.pinned ? ' <span class="club-pin-label">Pinned</span>' : ''}</div>
              <span class="status-pill status-${escapeHtml(club.status)}">${escapeHtml(getClubStatusLabel(club.status))}</span>
            </div>
            <div class="club-tagline">${escapeHtml(club.tagline || club.category)}</div>

            <div class="club-metrics">
              <div><strong>${Number(club.members) || 0}</strong> Members</div>
              <div><strong>${Number(club.applicants) || 0}</strong> Applicants</div>
            </div>

            <div class="club-actions">
              <button class="primary-btn" data-action="view-club" data-id="${club.id}">View</button>
              <button class="secondary-btn" data-action="apply-club" data-id="${club.id}" ${club.status === 'open' ? '' : 'disabled'}>${club.status === 'open' ? 'Apply' : escapeHtml(getClubActionLabel(club.status))}</button>
            </div>
          </div>
        </article>
      `
    )
    .join('');

  clubGrid.querySelectorAll('.club-image').forEach((image) => {
    image.addEventListener('error', () => image.remove());
  });

  clubGrid.querySelectorAll('[data-action="view-club"]').forEach((btn) => {
    btn.addEventListener('click', () => openClubDetail(Number(btn.dataset.id)));
  });

  clubGrid.querySelectorAll('[data-action="apply-club"]').forEach((btn) => {
    btn.addEventListener('click', () => openApplicationForm(Number(btn.dataset.id)));
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function getClubStatusLabel(status) {
  return status === 'opening-soon' ? 'Opening Soon' : status.charAt(0).toUpperCase() + status.slice(1);
}

function getClubActionLabel(status) {
  if (status === 'opening-soon') return 'Opening Soon';
  if (status === 'full') return 'Applications Full';
  return 'Applications Closed';
}

function getClubStatusPriority(status) {
  return { open: 0, 'opening-soon': 1, full: 2, closed: 3 }[status] ?? 4;
}

function getOrderedClubs(clubs) {
  return [...clubs].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
    const statusDifference = getClubStatusPriority(left.status) - getClubStatusPriority(right.status);
    if (statusDifference) return statusDifference;
    return (Number(left.sortOrder) || Number(left.id)) - (Number(right.sortOrder) || Number(right.id));
  });
}

function clubsShareOrderGroup(left, right) {
  return getClubStatusPriority(left.status) === getClubStatusPriority(right.status)
    && Boolean(left.pinned) === Boolean(right.pinned);
}

function setAdminFeedback(message, isError = false) {
  adminFeedback.textContent = message;
  adminFeedback.classList.toggle('is-error', isError);
}

function setAdminLoginFeedback(message, isError = false) {
  const feedback = document.getElementById('adminLoginFeedback');
  feedback.textContent = message;
  feedback.classList.toggle('is-error', isError);
}

async function openAdminAccess() {
  try {
    const response = await fetch('/api/admin/session');
    const session = await response.json();
    if (session.authenticated) {
      await Promise.all([loadClubs(), loadHomepageSettings()]);
      resetClubEditor();
      setAdminFeedback('');
      showView('admin');
      return;
    }

    const setupRequired = !session.configured;
    const confirmRow = document.getElementById('adminConfirmRow');
    const passwordInput = document.getElementById('adminPasswordInput');
    document.getElementById('adminLoginTitle').textContent = setupRequired ? 'Create your admin account' : 'Admin access';
    document.getElementById('adminLoginMessage').textContent = setupRequired
      ? 'Create a private email and password of at least 12 characters. First-time setup is limited to this computer.'
      : 'Enter your email and password to manage the homepage.';
    document.getElementById('adminLoginSubmit').textContent = setupRequired ? 'Set password and continue' : 'Unlock dashboard';
    confirmRow.classList.toggle('hidden', !setupRequired);
    document.getElementById('adminConfirmInput').required = setupRequired;
    passwordInput.autocomplete = setupRequired ? 'new-password' : 'current-password';
    document.getElementById('adminLoginForm').dataset.setup = String(setupRequired);
    document.getElementById('adminLoginForm').reset();
    setAdminLoginFeedback('');
    showView('adminLogin');
    passwordInput.focus();
  } catch (error) {
    setAdminLoginFeedback('Could not check admin access. Is the server running?', true);
    showView('adminLogin');
  }
}

function renderAdminClubList() {
  if (!adminClubList) return;

  adminClubCount.textContent = `${state.clubs.length} clubs`;
  const orderedClubs = getOrderedClubs(state.clubs);
  adminClubList.innerHTML = orderedClubs.map((club, index) => `
    <article class="admin-club-row">
      <img src="${escapeHtml(club.image)}" alt="" />
      <div class="admin-club-info">
        <strong>${escapeHtml(club.name)}</strong>
        <span>${escapeHtml(club.category)} · ${escapeHtml(getClubStatusLabel(club.status))}${club.pinned ? ' · Pinned' : ''}</span>
      </div>
      <div class="admin-row-actions">
          <button class="order-btn" type="button" data-action="move-club" data-id="${Number(club.id)}" data-direction="-1" aria-label="Move ${escapeHtml(club.name)} up" title="Move up" ${index === 0 || !clubsShareOrderGroup(club, orderedClubs[index - 1]) ? 'disabled' : ''}>&#8593;</button>
          <button class="order-btn" type="button" data-action="move-club" data-id="${Number(club.id)}" data-direction="1" aria-label="Move ${escapeHtml(club.name)} down" title="Move down" ${index === orderedClubs.length - 1 || !clubsShareOrderGroup(club, orderedClubs[index + 1]) ? 'disabled' : ''}>&#8595;</button>
        <button class="secondary-btn" type="button" data-action="edit-club" data-id="${Number(club.id)}">Edit</button>
        <button class="delete-btn" type="button" data-action="delete-club" data-id="${Number(club.id)}">Delete</button>
      </div>
    </article>
  `).join('');

  adminClubList.querySelectorAll('[data-action="edit-club"]').forEach((button) => {
    button.addEventListener('click', () => editClub(Number(button.dataset.id)));
  });
  adminClubList.querySelectorAll('[data-action="move-club"]').forEach((button) => {
    button.addEventListener('click', () => moveClubOrder(Number(button.dataset.id), Number(button.dataset.direction)));
  });
  adminClubList.querySelectorAll('[data-action="delete-club"]').forEach((button) => {
    button.addEventListener('click', () => deleteClub(Number(button.dataset.id)));
  });
}

async function moveClubOrder(clubId, direction) {
  const orderedClubs = getOrderedClubs(state.clubs);
  const clubIndex = orderedClubs.findIndex((club) => club.id === clubId);
  const targetIndex = clubIndex + direction;
  if (clubIndex < 0 || targetIndex < 0 || targetIndex >= orderedClubs.length
    || !clubsShareOrderGroup(orderedClubs[clubIndex], orderedClubs[targetIndex])) return;

  const movedClubName = orderedClubs[clubIndex].name;
  const orderedIds = orderedClubs.map((club) => club.id);
  [orderedIds[clubIndex], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[clubIndex]];

  const response = await fetch('/api/admin/clubs/order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: orderedIds }),
  });
  if (!response.ok) {
    setAdminFeedback('Could not save the card order.', true);
    return;
  }

  await loadClubs();
  setAdminFeedback(`Moved ${movedClubName} ${direction < 0 ? 'up' : 'down'}.`);
}

function syncPinnedControl() {
  const canPin = clubStatusInput.value === 'open';
  clubPinnedInput.disabled = !canPin;
  if (!canPin) clubPinnedInput.checked = false;
}

function resetClubEditor() {
  if (clubImagePreview.dataset.objectUrl) {
    URL.revokeObjectURL(clubImagePreview.dataset.objectUrl);
    delete clubImagePreview.dataset.objectUrl;
  }

  clubEditorForm.reset();
  document.getElementById('clubEditorId').value = '';
  document.getElementById('clubStatusInput').value = 'open';
  clubPinnedInput.checked = false;
  syncPinnedControl();
  applicationFormIntroInput.value = '';
  state.editingApplicationFields = [];
  renderApplicationFieldEditor();
  document.getElementById('applicationFieldsClubName').textContent = 'Questions for the new club';
  document.getElementById('addApplicationFieldBtn').disabled = false;
  document.getElementById('clubImageFitInput').value = 'contain';
  applicationFormIntroInput.value = '';
  state.editingApplicationFields = [];
  renderApplicationFieldEditor();
  document.getElementById('applicationFieldsClubName').textContent = 'Questions for the new club';
  document.getElementById('addApplicationFieldBtn').disabled = false;
  ['clubSeatsInput', 'clubMembersInput', 'clubApplicantsInput'].forEach((id) => {
    document.getElementById(id).value = '0';
  });
  clubImageInput.value = '';
  clubImagePreview.removeAttribute('src');
  clubImagePreview.classList.add('hidden');
  document.getElementById('clubEditorHeading').textContent = 'Add a club card';
  document.getElementById('saveClubBtn').textContent = 'Add club card';
  document.getElementById('cancelClubEditBtn').classList.add('hidden');
}

function editClub(clubId) {
  const club = state.clubs.find((item) => item.id === clubId);
  if (!club) return;

  document.getElementById('clubEditorId').value = club.id;
  document.getElementById('clubNameInput').value = club.name;
  document.getElementById('clubCommitteeInput').value = club.committee;
  document.getElementById('clubCategoryInput').value = club.category;
  document.getElementById('clubStatusInput').value = club.status;
  clubPinnedInput.checked = Boolean(club.pinned);
  syncPinnedControl();
  document.getElementById('clubTaglineInput').value = club.tagline || '';
  document.getElementById('clubDescriptionInput').value = club.description;
  document.getElementById('clubRequirementsInput').value = club.requirements;
  document.getElementById('clubSeatsInput').value = club.seats;
  document.getElementById('clubMembersInput').value = club.members;
  document.getElementById('clubApplicantsInput').value = club.applicants;
  document.getElementById('clubImageFitInput').value = club.imageFit || 'contain';
  applicationFormIntroInput.value = club.applicationIntro || '';
  state.editingApplicationFields = (club.applicationFields || []).map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type || 'text',
    required: field.required === true,
    options: Array.isArray(field.options) ? [...field.options] : [],
  }));
  renderApplicationFieldEditor();
  document.getElementById('applicationFieldsClubName').textContent = `Questions for ${club.name}`;
  document.getElementById('addApplicationFieldBtn').disabled = false;
  applicationFormIntroInput.value = club.applicationIntro || '';
  state.editingApplicationFields = (club.applicationFields || []).map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type || 'text',
    required: field.required === true,
    options: Array.isArray(field.options) ? [...field.options] : [],
  }));
  renderApplicationFieldEditor();
  document.getElementById('applicationFieldsClubName').textContent = `Questions for ${club.name}`;
  document.getElementById('addApplicationFieldBtn').disabled = false;
  clubImageInput.value = '';
  clubImagePreview.src = club.image;
  clubImagePreview.classList.remove('hidden');
  document.getElementById('clubEditorHeading').textContent = `Edit ${club.name}`;
  document.getElementById('saveClubBtn').textContent = 'Save club changes';
  document.getElementById('cancelClubEditBtn').classList.remove('hidden');
  setAdminFeedback('');
  document.getElementById('clubEditorHeading').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderApplicationFieldEditor() {
  if (!applicationFieldEditorList) return;
  if (!state.editingApplicationFields.length) {
    applicationFieldEditorList.innerHTML = '<p class="admin-form-empty">No extra questions for this club yet.</p>';
    return;
  }

  applicationFieldEditorList.innerHTML = state.editingApplicationFields.map((field, index) => `
    <article class="application-question-editor" data-index="${index}">
      <div class="application-question-controls">
        <div class="field-group">
          <label>Question label</label>
          <input type="text" data-question-property="label" value="${escapeHtml(field.label)}" maxlength="100" required />
        </div>
        <div class="field-group">
          <label>Answer type</label>
          <select data-question-property="type">
            <option value="text" ${field.type === 'text' ? 'selected' : ''}>Short text</option>
            <option value="textarea" ${field.type === 'textarea' ? 'selected' : ''}>Long text</option>
            <option value="select" ${field.type === 'select' ? 'selected' : ''}>Choose from options</option>
          </select>
        </div>
        <label class="admin-checkbox-field application-question-required">
          <input type="checkbox" data-question-property="required" ${field.required ? 'checked' : ''} />
          <span>Required</span>
        </label>
        <button class="delete-btn application-question-remove" type="button" data-action="remove-question" data-index="${index}">Remove</button>
      </div>
      <div class="field-group application-question-options ${field.type === 'select' ? '' : 'hidden'}">
        <label>Options, one per line</label>
        <textarea data-question-property="options" rows="3">${escapeHtml(field.options.join('\n'))}</textarea>
      </div>
    </article>
  `).join('');

  applicationFieldEditorList.querySelectorAll('[data-question-property]').forEach((input) => {
    input.addEventListener('input', updateApplicationFieldFromEditor);
    input.addEventListener('change', updateApplicationFieldFromEditor);
  });
  applicationFieldEditorList.querySelectorAll('[data-action="remove-question"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editingApplicationFields.splice(Number(button.dataset.index), 1);
      renderApplicationFieldEditor();
    });
  });
}

function updateApplicationFieldFromEditor(event) {
  const row = event.currentTarget.closest('.application-question-editor');
  const index = Number(row.dataset.index);
  const field = state.editingApplicationFields[index];
  const property = event.currentTarget.dataset.questionProperty;
  if (!field) return;

  if (property === 'required') field.required = event.currentTarget.checked;
  else if (property === 'options') field.options = event.currentTarget.value.split('\n').map((option) => option.trim()).filter(Boolean);
  else field[property] = event.currentTarget.value;

  if (property === 'type') {
    const options = row.querySelector('.application-question-options');
    options.classList.toggle('hidden', field.type !== 'select');
  }
}

toggleInterviewFormBtn.addEventListener('click', () => {
  const willOpen = interviewFormManager.classList.contains('hidden');
  interviewFormManager.classList.toggle('hidden', !willOpen);
  toggleInterviewFormBtn.setAttribute('aria-expanded', String(willOpen));
  toggleInterviewFormBtn.textContent = willOpen ? 'Hide interview questions' : 'Manage interview questions';
});

async function loadPresidentApplicationForm() {
  const response = await fetch('/api/club/application-form');
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Could not load your application form.');
  document.getElementById('presidentApplicationIntro').value = result.applicationIntro || '';
  state.presidentApplicationFields = (result.applicationFields || []).map((field) => ({
    ...field,
    options: Array.isArray(field.options) ? [...field.options] : []
  }));
  renderPresidentApplicationFields();
}

function renderPresidentApplicationFields() {
  const list = document.getElementById('presidentApplicationFieldList');
  if (!state.presidentApplicationFields.length) {
    list.innerHTML = '<p class="admin-form-empty">No extra questions. Add one if your club needs it.</p>';
    return;
  }
  list.innerHTML = state.presidentApplicationFields.map((field, index) => `
    <article class="application-question-editor" data-president-index="${index}">
      <div class="application-question-controls">
        <div class="field-group">
          <label>Question label</label>
          <input type="text" data-president-property="label" value="${escapeHtml(field.label)}" maxlength="100" required />
        </div>
        <div class="field-group">
          <label>Answer type</label>
          <select data-president-property="type">
            <option value="text" ${field.type === 'text' ? 'selected' : ''}>Short text</option>
            <option value="textarea" ${field.type === 'textarea' ? 'selected' : ''}>Long text</option>
            <option value="select" ${field.type === 'select' ? 'selected' : ''}>Choose from options</option>
          </select>
        </div>
        <label class="admin-checkbox-field application-question-required">
          <input type="checkbox" data-president-property="required" ${field.required ? 'checked' : ''} />
          <span>Required</span>
        </label>
        <button class="delete-btn application-question-remove" type="button" data-president-action="remove">Remove</button>
      </div>
      <div class="field-group application-question-options ${field.type === 'select' ? '' : 'hidden'}">
        <label>Options, one per line</label>
        <textarea data-president-property="options" rows="3">${escapeHtml(field.options.join('\n'))}</textarea>
      </div>
    </article>
  `).join('');
  list.querySelectorAll('[data-president-property]').forEach((input) => {
    input.addEventListener('input', updatePresidentApplicationField);
    input.addEventListener('change', updatePresidentApplicationField);
  });
  list.querySelectorAll('[data-president-action="remove"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.presidentApplicationFields.splice(Number(button.closest('[data-president-index]').dataset.presidentIndex), 1);
      renderPresidentApplicationFields();
    });
  });
}

function updatePresidentApplicationField(event) {
  const row = event.currentTarget.closest('[data-president-index]');
  const field = state.presidentApplicationFields[Number(row.dataset.presidentIndex)];
  const property = event.currentTarget.dataset.presidentProperty;
  if (property === 'required') field.required = event.currentTarget.checked;
  else if (property === 'options') field.options = event.currentTarget.value.split('\n').map((value) => value.trim()).filter(Boolean);
  else field[property] = event.currentTarget.value;
  if (property === 'type') row.querySelector('.application-question-options').classList.toggle('hidden', field.type !== 'select');
}

async function loadInterviewForm() {
  const response = await fetch('/api/club/interview-form');
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Could not load interview questions.');
  state.interviewSections = (result.sections || []).map((section) => ({
    ...section,
    questions: (section.questions || []).map((question) => ({
      ...question,
      options: Array.isArray(question.options) ? [...question.options] : []
    }))
  }));
  renderInterviewSections();
}

function renderInterviewSections() {
  const list = document.getElementById('interviewSectionList');
  if (!state.interviewSections.length) {
    list.innerHTML = '<p class="admin-form-empty">No interview sections yet. Add a section to set up your evaluation.</p>';
    return;
  }
  list.innerHTML = state.interviewSections.map((section, sectionIndex) => `
    <section class="interview-section-editor" data-section-index="${sectionIndex}">
      <div class="interview-section-heading">
        <div class="field-group">
          <label>Section name</label>
          <input data-interview-section-property="title" maxlength="80" value="${escapeHtml(section.title)}" required />
        </div>
        <button class="delete-btn" type="button" data-interview-action="remove-section">Delete section</button>
      </div>
      <div class="interview-question-list">
        ${section.questions.map((question, questionIndex) => `
          <article class="interview-question-editor" data-question-index="${questionIndex}">
            <div class="application-question-controls">
              <div class="field-group">
                <label>Question</label>
                <input data-interview-question-property="label" maxlength="100" value="${escapeHtml(question.label)}" required />
              </div>
              <div class="field-group">
                <label>Answer type</label>
                <select data-interview-question-property="type">
                  <option value="text" ${question.type === 'text' ? 'selected' : ''}>Short text</option>
                  <option value="textarea" ${question.type === 'textarea' ? 'selected' : ''}>Long text</option>
                  <option value="select" ${question.type === 'select' ? 'selected' : ''}>Choose from options</option>
                </select>
              </div>
              <label class="admin-checkbox-field application-question-required">
                <input type="checkbox" data-interview-question-property="required" ${question.required ? 'checked' : ''} />
                <span>Required</span>
              </label>
              <button class="delete-btn application-question-remove" type="button" data-interview-action="remove-question">Remove</button>
            </div>
            <div class="field-group application-question-options ${question.type === 'select' ? '' : 'hidden'}">
              <label>Options, one per line</label>
              <textarea data-interview-question-property="options" rows="2">${escapeHtml(question.options.join('\n'))}</textarea>
            </div>
          </article>
        `).join('')}
      </div>
      <button class="secondary-btn interview-add-question" type="button" data-interview-action="add-question">Add question</button>
    </section>
  `).join('');

  list.querySelectorAll('[data-interview-section-property], [data-interview-question-property]').forEach((input) => {
    input.addEventListener('input', updateInterviewSectionEditor);
    input.addEventListener('change', updateInterviewSectionEditor);
  });
  list.querySelectorAll('[data-interview-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const sectionElement = button.closest('[data-section-index]');
      const sectionIndex = Number(sectionElement?.dataset.sectionIndex);
      const section = state.interviewSections[sectionIndex];
      if (button.dataset.interviewAction === 'remove-section') {
        state.interviewSections.splice(sectionIndex, 1);
      } else if (button.dataset.interviewAction === 'add-question') {
        if (section.questions.length >= 12) return setInterviewFeedback('A section can have up to 12 questions.', true);
        section.questions.push({ key: `question_${Date.now()}`, label: 'New question', type: 'text', required: false, options: [] });
      } else if (button.dataset.interviewAction === 'remove-question') {
        section.questions.splice(Number(button.closest('[data-question-index]').dataset.questionIndex), 1);
      }
      renderInterviewSections();
    });
  });
}

function updateInterviewSectionEditor(event) {
  const sectionElement = event.currentTarget.closest('[data-section-index]');
  const section = state.interviewSections[Number(sectionElement.dataset.sectionIndex)];
  if (event.currentTarget.dataset.interviewSectionProperty) {
    section[event.currentTarget.dataset.interviewSectionProperty] = event.currentTarget.value;
    return;
  }
  const questionElement = event.currentTarget.closest('[data-question-index]');
  const question = section.questions[Number(questionElement.dataset.questionIndex)];
  const property = event.currentTarget.dataset.interviewQuestionProperty;
  if (property === 'required') question.required = event.currentTarget.checked;
  else if (property === 'options') question.options = event.currentTarget.value.split('\n').map((value) => value.trim()).filter(Boolean);
  else question[property] = event.currentTarget.value;
  if (property === 'type') questionElement.querySelector('.application-question-options').classList.toggle('hidden', question.type !== 'select');
}

function setInterviewFeedback(message, isError = false) {
  const feedback = document.getElementById('interviewFormFeedback');
  feedback.textContent = message;
  feedback.classList.toggle('is-error', isError);
}

document.getElementById('addInterviewSectionBtn').addEventListener('click', () => {
  if (state.interviewSections.length >= 10) return setInterviewFeedback('An interview form can have up to 10 sections.', true);
  state.interviewSections.push({ key: `section_${Date.now()}`, title: 'New section', questions: [] });
  renderInterviewSections();
});

document.getElementById('saveInterviewFormBtn').addEventListener('click', async () => {
  for (const section of state.interviewSections) {
    if (!section.title.trim()) return setInterviewFeedback('Every section needs a name.', true);
    for (const question of section.questions) {
      if (!question.label.trim()) return setInterviewFeedback('Every question needs text.', true);
      if (question.type === 'select' && new Set(question.options.map((option) => option.trim()).filter(Boolean)).size < 2) {
        return setInterviewFeedback(`Add at least two options to “${question.label}”.`, true);
      }
    }
  }
  const button = document.getElementById('saveInterviewFormBtn');
  button.disabled = true;
  setInterviewFeedback('Saving…');
  try {
    const response = await fetch('/api/club/interview-form', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: state.interviewSections })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not save interview questions.');
    state.interviewSections = result.sections;
    renderInterviewSections();
    setInterviewFeedback('Interview form saved.');
  } catch (error) {
    setInterviewFeedback(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('addPresidentApplicationFieldBtn').addEventListener('click', () => {
  if (state.presidentApplicationFields.length >= 12) {
    document.getElementById('presidentFormFeedback').textContent = 'A form can have up to 12 extra questions.';
    document.getElementById('presidentFormFeedback').classList.add('is-error');
    return;
  }
  state.presidentApplicationFields.push({ key: `question_${Date.now()}`, label: 'New question', type: 'text', required: false, options: [] });
  renderPresidentApplicationFields();
  document.querySelector('#presidentApplicationFieldList article:last-child [data-president-property="label"]')?.focus();
});

document.getElementById('presidentFormEditor').addEventListener('submit', async (event) => {
  event.preventDefault();
  const feedback = document.getElementById('presidentFormFeedback');
  const button = document.getElementById('savePresidentApplicationFormBtn');
  const invalidChoice = state.presidentApplicationFields.find((field) => field.type === 'select'
    && new Set(field.options.map((option) => option.trim()).filter(Boolean)).size < 2);
  if (invalidChoice) {
    feedback.textContent = `Add at least two options to “${invalidChoice.label}”.`;
    feedback.classList.add('is-error');
    return;
  }
  button.disabled = true;
  feedback.textContent = 'Saving…';
  feedback.classList.remove('is-error');
  try {
    const response = await fetch('/api/club/application-form', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationIntro: document.getElementById('presidentApplicationIntro').value,
        applicationFields: state.presidentApplicationFields
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not save your application form.');
    state.presidentApplicationFields = result.applicationFields;
    const club = state.clubs.find((item) => item.id === state.clubAccount.id);
    if (club) {
      club.applicationIntro = result.applicationIntro;
      club.applicationFields = result.applicationFields;
    }
    feedback.textContent = 'Application form saved. New applicants will see these changes.';
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.add('is-error');
  } finally {
    button.disabled = false;
  }
});

document.getElementById('addApplicationFieldBtn').addEventListener('click', () => {
  state.editingApplicationFields.push({
    key: `question_${Date.now()}`,
    label: 'New question',
    type: 'text',
    required: false,
    options: [],
  });
  renderApplicationFieldEditor();
  const lastQuestion = applicationFieldEditorList.lastElementChild;
  lastQuestion?.querySelector('[data-question-property="label"]')?.focus();
});

async function deleteClub(clubId) {
  const club = state.clubs.find((item) => item.id === clubId);
  if (!club || !window.confirm(`Delete the ${club.name} card?`)) return;

  const response = await fetch(`/api/admin/clubs/${clubId}`, { method: 'DELETE' });
  if (!response.ok) {
    setAdminFeedback('Could not delete this club card.', true);
    return;
  }

  if (Number(document.getElementById('clubEditorId').value) === clubId) resetClubEditor();
  await loadClubs();
  setAdminFeedback(`${club.name} card deleted.`);
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('Could not read the selected image.')));
    reader.readAsDataURL(file);
  });
}

function openClubDetail(clubId) {
  const club = state.clubs.find((item) => item.id === clubId);
  if (!club) return;
  const canApply = club.status === 'open';

  state.selectedClub = club;
  clubDetail.innerHTML = `
    <div class="club-detail-hero">
      <div class="detail-logo-frame">
        <img class="detail-logo${club.imageFit === 'contain' ? ' detail-logo-contain' : ''}" src="${escapeHtml(club.image)}" alt="${escapeHtml(club.name)} logo" />
      </div>
      <div class="detail-hero-copy">
        <span class="club-tag">${escapeHtml(club.category)}</span>
        <h2 class="detail-title">${escapeHtml(club.name)}</h2>
        <p class="detail-tagline">${escapeHtml(club.tagline || club.category)}</p>
        <div class="detail-meta">${escapeHtml(club.committee)}</div>
        <span class="status-pill status-${escapeHtml(club.status)}">${escapeHtml(getClubStatusLabel(club.status))}</span>
        ${club.pinned ? '<span class="detail-pinned-label">Featured club</span>' : ''}
      </div>
    </div>
    <section class="detail-section">
      <h3>About the club</h3>
      <p class="detail-description">${escapeHtml(club.description)}</p>
    </section>

    <div class="detail-info">
      <div class="detail-box">
        <p>Members</p>
        <strong>${Number(club.members) || 0}</strong>
      </div>
      <div class="detail-box">
        <p>Available seats</p>
        <strong>${Math.max((Number(club.seats) || 0) - (Number(club.members) || 0), 0)}</strong>
      </div>
      <div class="detail-box">
        <p>Applicants</p>
        <strong>${Number(club.applicants) || 0}</strong>
      </div>
    </div>

    <section class="detail-requirements">
      <h3>Joining requirements</h3>
      <p>${escapeHtml(club.requirements)}</p>
    </section>

    ${Array.isArray(club.events) && club.events.length ? `
    <section class="detail-section">
      <h3>Upcoming events</h3>
      <div class="detail-cards-grid">
        ${club.events.map((event, index) => `
          <div class="event-tile">
            <img src="${escapeHtml(event.image || club.image)}" alt="${escapeHtml(event.title || 'event')}" />
            <div class="event-tile-body">
              <strong>${escapeHtml(event.title || 'Event')}</strong>
              <span class="event-tile-date">${escapeHtml(event.date || '')}${event.location ? ' · ' + escapeHtml(event.location) : ''}</span>
              <button class="event-info-btn" type="button" data-info="event-${index}">Info</button>
              <p class="event-tile-desc" id="event-desc-${index}" hidden>${escapeHtml(event.description || '')}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
    ` : ''}

    ${Array.isArray(club.posts) && club.posts.length ? `
    <section class="detail-section">
      <h3>Club feed</h3>
      <div class="detail-cards-grid">
        ${club.posts.map((post, index) => `
          <div class="event-tile post-card">
            <img src="${escapeHtml(post.image || club.image)}" alt="${escapeHtml(post.title || 'post')}" />
            <div class="event-tile-body">
              <strong>${escapeHtml(post.title || 'Post')}</strong>
              <span class="event-tile-date">${escapeHtml(post.date || '')}${post.location ? ' · ' + escapeHtml(post.location) : ''}</span>
              <button class="event-info-btn" type="button" data-info="post-${index}">Info</button>
              <p class="event-tile-desc" id="post-desc-${index}" hidden>${escapeHtml(post.text || post.description || '')}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
    ` : ''}

    <div class="detail-actions">
      <button class="primary-btn" data-action="apply-club" data-id="${club.id}" ${canApply ? '' : 'disabled'}>${canApply ? 'Apply Now' : escapeHtml(getClubActionLabel(club.status))}</button>
      <button class="secondary-btn" data-action="go-home">Back</button>
    </div>
  `;

  clubDetail.querySelector('[data-action="apply-club"]').addEventListener('click', () => openApplicationForm(clubId));
  clubDetail.querySelector('[data-action="go-home"]').addEventListener('click', () => showView('home'));

  clubDetail.querySelectorAll('.event-info-btn, .post-card .event-info-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [, kind, rawIndex] = btn.dataset.info.split('-');
      const target = clubDetail.querySelector(`#${kind === 'post' ? 'post' : 'event'}-desc-${rawIndex}`);
      if (target) target.hidden = !target.hidden;
    });
  });

  showView('club');
}

async function openApplicationForm(clubId, allowClosedClub = false) {
  const club = state.clubs.find((item) => item.id === clubId);
  if (!club || (!allowClosedClub && club.status !== 'open')) return;

  state.selectedClub = club;
  state.editingMyForm = null;
  applicationForm.reset();
  clearApplicantPhotoPreview();
  applicantPhotoInput.required = true;
  applicationForm.querySelector('.applicant-photo-field small').textContent = 'PNG, JPG, or WebP. Maximum size: 5 MB.';
  applicationForm.querySelector('[type="submit"]').textContent = 'Submit Application';
  applicationFeedback.textContent = '';
  applicationFeedback.classList.remove('is-error');
  applicationTitle.textContent = `Join ${club.name}`;
  applicationClubLogo.src = club.image;
  applicationClubLogo.alt = `${club.name} logo`;
  applicationClubLogo.classList.toggle('application-club-logo-contain', club.imageFit === 'contain');
  applicationFormIntro.textContent = club.applicationIntro || `Complete your details and answer ${club.name}'s questions.`;
  renderApplicationFields(club);
  showView('application');
  await loadApplicationCommittees(clubId);
}

function clearApplicantPhotoPreview() {
  if (applicantPhotoPreview.dataset.objectUrl) {
    URL.revokeObjectURL(applicantPhotoPreview.dataset.objectUrl);
    delete applicantPhotoPreview.dataset.objectUrl;
  }
  applicantPhotoPreview.removeAttribute('src');
  applicantPhotoPreview.classList.add('hidden');
  applicantPhotoPlaceholder.classList.remove('hidden');
}

applicantPhotoInput.addEventListener('change', () => {
  const file = applicantPhotoInput.files[0];
  if (!file) {
    clearApplicantPhotoPreview();
    return;
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    applicantPhotoInput.value = '';
    clearApplicantPhotoPreview();
    applicationFeedback.textContent = 'Choose a PNG, JPG, or WebP photo up to 5 MB.';
    applicationFeedback.classList.add('is-error');
    return;
  }

  if (applicantPhotoPreview.dataset.objectUrl) URL.revokeObjectURL(applicantPhotoPreview.dataset.objectUrl);
  const imageUrl = URL.createObjectURL(file);
  applicantPhotoPreview.dataset.objectUrl = imageUrl;
  applicantPhotoPreview.src = imageUrl;
  applicantPhotoPreview.classList.remove('hidden');
  applicantPhotoPlaceholder.classList.add('hidden');
  applicationFeedback.textContent = '';
  applicationFeedback.classList.remove('is-error');
});

function renderApplicationFields(club) {
  const fields = club.applicationFields || [];
  applicationCustomFields.classList.toggle('hidden', fields.length === 0);
  applicationCustomFields.innerHTML = fields.map((field) => {
    const fieldName = `club-answer-${field.key}`;
    const required = field.required ? 'required' : '';
    if (field.type === 'select') {
      return `
        <div class="field-group">
          <label for="${escapeHtml(fieldName)}">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>
          <select id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" ${required}>
            <option value="">Choose an option</option>
            ${(field.options || []).map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}
          </select>
        </div>
      `;
    }

    const input = field.type === 'textarea'
      ? `<textarea id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" rows="4" ${required}></textarea>`
      : `<input id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" type="text" ${required} />`;
    return `
      <div class="field-group">
        <label for="${escapeHtml(fieldName)}">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>
        ${input}
      </div>
    `;
  }).join('');
}

applicationForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(applicationForm);
  const applicantPhoto = applicantPhotoInput.files[0];
  if (!applicantPhoto && !state.editingMyForm) {
    applicationFeedback.textContent = 'Upload your photo before submitting.';
    applicationFeedback.classList.add('is-error');
    return;
  }
  if (applicantPhoto && (!['image/png', 'image/jpeg', 'image/webp'].includes(applicantPhoto.type) || applicantPhoto.size > 5 * 1024 * 1024)) {
    applicationFeedback.textContent = 'Choose a PNG, JPG, or WebP photo up to 5 MB.';
    applicationFeedback.classList.add('is-error');
    return;
  }

  const payload = {
    clubId: state.selectedClub?.id || 1,
    committee: formData.get('committee'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    studentName: `${formData.get('firstName')} ${formData.get('lastName')}`,
    universityId: formData.get('universityId'),
    major: formData.get('major'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    slot: formData.get('slot'),
    age: formData.get('age') || '20',
    motivation: formData.get('motivation') || 'Interested in joining this committee.',
    notes: formData.get('notes') || '',
    answers: (state.selectedClub?.applicationFields || []).map((field) => ({
      key: field.key,
      value: formData.get(`club-answer-${field.key}`) || '',
    })),
    rating: 4,
  };

  try {
    if (applicantPhoto) payload.photo = await readImageFile(applicantPhoto);
    if (!state.editingMyForm && !payload.photo) throw new Error('Upload your photo before submitting.');
    const editing = state.editingMyForm;
    const response = await fetch(editing ? `/api/my-forms/${encodeURIComponent(editing.id)}` : '/api/applications', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(editing ? { Authorization: `Bearer ${editing.token}` } : {}) },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || (editing ? 'Could not save your changes.' : 'Could not submit the application.'));

    if (!editing && (!result.application?.id || typeof result.managementToken !== 'string')) {
      throw new Error('The server accepted the form but could not link it to My Forms. Check with the club before submitting again to avoid a duplicate application.');
    }

    if (editing) {
      editing.application = result;
      state.myForms = state.myForms.map((item) => item.id === editing.id ? { ...item, application: result } : item);
      applicationFeedback.textContent = 'Your changes were saved.';
      if (applicantPhoto) {
        clearApplicantPhotoPreview();
        applicantPhotoPreview.src = result.photo;
        applicantPhotoPreview.classList.remove('hidden');
        applicantPhotoPlaceholder.classList.add('hidden');
        applicationForm.querySelector('.applicant-photo-field small').textContent = 'Current photo is kept. Upload a new photo only if you want to replace it.';
      }
      await loadMyForms();
    } else {
      applicationForm.reset();
      clearApplicantPhotoPreview();
      rememberMyForm(result.application.id, result.managementToken);
      applicationFeedback.textContent = `Your application to ${state.selectedClub.name} was submitted.`;
    }
    applicationFeedback.classList.remove('is-error');
  } catch (error) {
    applicationFeedback.textContent = error.message;
    applicationFeedback.classList.add('is-error');
  }
});

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

document.getElementById('myFormsButton').addEventListener('click', async () => {
  myFormsFeedback.textContent = '';
  myFormsFeedback.classList.remove('is-error');
  await loadMyForms();
  showView('myForms');
});
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
