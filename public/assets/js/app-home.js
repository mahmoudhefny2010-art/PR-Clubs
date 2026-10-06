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
  searchQuery: '',
  activeCategory: 'All',
};

const views = {
  home: document.getElementById('homeView'),
  signIn: document.getElementById('signInView'),
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
const presidentOverviewPanel = document.getElementById('presidentOverviewPanel');
const presidentApplicantsPanel = document.getElementById('presidentApplicantsPanel');
const interviewFormManager = document.getElementById('interviewFormManager');
const presidentSidebar = document.getElementById('presidentSidebar');
const presidentDashboardLayout = document.getElementById('presidentDashboardLayout');
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

function createApprovalRequestCheckpoint(request) {
  const labels = ['Submitted', 'PR review', 'English review', 'Dean review', 'Published'];
  const stageByRole = { club: 0, pr: 1, english: 2, dean: 3 };
  const statusIndex = { draft: -1, pending_pr: 1, pending_english: 2, pending_dean: 3, published: 4 };
  const status = String(request.status || 'draft');
  const history = Array.isArray(request.workflowHistory) ? request.workflowHistory : [];
  const lastEvent = history[history.length - 1];
  let currentIndex = statusIndex[status] ?? (status === 'changes_requested' ? stageByRole[request.editRequestedBy] || 1 : 4);
  const terminalClass = ['rejected', 'deleted'].includes(status) ? 'is-failed' : '';
  if (terminalClass) currentIndex = stageByRole[lastEvent?.role] ?? 4;

  const card = document.createElement('article');
  card.className = 'approval-request-checkpoint';
  const heading = document.createElement('div');
  heading.className = 'approval-request-heading';
  const title = document.createElement('strong');
  title.textContent = request.title || 'Untitled request';
  const state = document.createElement('span');
  state.className = `approval-request-state${terminalClass ? ' is-failed' : ''}`;
  state.textContent = status === 'changes_requested'
    ? `Changes requested · ${request.editRequestedBy || 'review team'}`
    : status.replaceAll('_', ' ');
  heading.append(title, state);

  const requestTrack = document.createElement('div');
  requestTrack.className = 'approval-request-track';
  requestTrack.style.setProperty('--request-progress', `${currentIndex < 0 ? 0 : currentIndex / (labels.length - 1) * 100}%`);
  labels.forEach((label, index) => {
    const step = document.createElement('div');
    step.className = 'approval-request-step';
    if (index < currentIndex) step.classList.add('is-complete');
    if (index === currentIndex) {
      step.classList.add('is-current');
      if (terminalClass) step.classList.add(terminalClass);
    }
    const marker = document.createElement('span');
    marker.className = 'approval-request-marker';
    marker.setAttribute('aria-hidden', 'true');
    const stepTitle = document.createElement('span');
    stepTitle.textContent = label;
    step.append(marker, stepTitle);
    requestTrack.append(step);
  });
  card.append(heading, requestTrack);
  return card;
}

function renderApprovalCheckpoints(items) {
  const track = document.getElementById('approvalCheckpointTrack');
  const requestLabel = document.getElementById('approvalCheckpointRequest');
  const statusLabel = document.getElementById('approvalCheckpointStatus');
  const moreButton = document.getElementById('approvalCheckpointMoreBtn');
  const moreList = document.getElementById('approvalCheckpointMoreList');
  if (!track || !requestLabel || !statusLabel || !moreButton || !moreList) return;

  const latestActivity = (item) => {
    const history = Array.isArray(item.workflowHistory) ? item.workflowHistory : [];
    return new Date(history[history.length - 1]?.createdAt || item.updatedAt || item.createdAt || 0).getTime();
  };
  const requests = [...items].sort((a, b) => latestActivity(b) - latestActivity(a));
  requestLabel.textContent = requests.length
    ? `Latest request${requests.length > 1 ? ` · ${requests.length} total` : ''}`
    : 'Latest club request';
  statusLabel.textContent = `Live · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  statusLabel.classList.add('is-live');
  track.replaceChildren();
  moreList.replaceChildren();
  moreButton.classList.toggle('hidden', requests.length < 2);
  moreButton.textContent = `More · ${Math.max(0, requests.length - 1)}`;
  if (!requests.length) {
    const empty = document.createElement('p');
    empty.className = 'approval-checkpoint-empty';
    empty.textContent = 'Club requests will appear here as soon as they are created.';
    track.append(empty);
    return;
  }

  track.append(createApprovalRequestCheckpoint(requests[0]));
  requests.slice(1).forEach((request) => {
    moreList.append(createApprovalRequestCheckpoint(request));
  });
}

document.getElementById('approvalCheckpointMoreBtn')?.addEventListener('click', () => {
  document.getElementById('approvalCheckpointMoreDialog')?.showModal();
});
document.getElementById('closeApprovalCheckpointMoreBtn')?.addEventListener('click', () => {
  document.getElementById('approvalCheckpointMoreDialog')?.close();
});

let approvalCheckpointRefreshTimer = null;
let approvalCheckpointRefreshInProgress = false;

async function loadClubReviewNotifications(showPopup = true) {
  const dialog = document.getElementById('clubReviewNotifications');
  const list = document.getElementById('clubReviewNotificationList');
  const dismissBtn = document.getElementById('dismissNotificationBtn');
  if (!dialog || !list) return;
  if (approvalCheckpointRefreshInProgress) return;
  approvalCheckpointRefreshInProgress = true;
  try {
    const response = await fetch('/api/club/content', { cache: 'no-store' });
    const items = await response.json();
    if (!response.ok) throw new Error('Could not load approval checkpoints.');
    renderApprovalCheckpoints(items);
    const updates = items.filter((item) => typeof item.clubNotice === 'string' && item.clubNotice.trim());
    if (!updates.length) {
      dialog.close();
      return;
    }
    updates.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const latest = updates[0];
    
    list.replaceChildren();
    const message = document.createElement('p');
    message.className = 'club-review-notice-message';
    message.textContent = `${latest.title}: ${latest.clubNotice} Current status: ${String(latest.status || '').replaceAll('_', ' ')}.`;
    list.append(message);
    if (showPopup && !dialog.open) dialog.showModal();
    if (dismissBtn) dismissBtn.onclick = () => dialog.close();
  } catch {
    dialog.close();
    const status = document.getElementById('approvalCheckpointStatus');
    if (status) {
      status.textContent = 'Reconnecting…';
      status.classList.remove('is-live');
    }
  } finally {
    approvalCheckpointRefreshInProgress = false;
  }
}

function startApprovalCheckpointLiveUpdates() {
  if (approvalCheckpointRefreshTimer) clearInterval(approvalCheckpointRefreshTimer);
  approvalCheckpointRefreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && state.clubAccount?.role === 'president') {
      loadClubReviewNotifications(false);
    }
  }, 10000);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.clubAccount?.role === 'president') {
    loadClubReviewNotifications(false);
  }
});

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

    if (session.club && ['pr', 'english', 'dean'].includes(session.club.role)) {
      const routes = { pr: '/dashboards/pr-dashboard.html', english: '/dashboards/english-dashboard.html', dean: '/dashboards/dean-dashboard.html' };
      window.location.assign(routes[session.club.role]);
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
    presidentSidebar.classList.toggle('hidden', club.role !== 'president');
    presidentDashboardLayout.classList.toggle('is-president', club.role === 'president');
    document.getElementById('approvalCheckpointPanel')?.classList.toggle('hidden', club.role !== 'president');
    document.getElementById('openMemberManagerBtn')?.classList.toggle('hidden', club.role !== 'president');
    interviewFormManager.classList.add('hidden');
    toggleInterviewFormBtn.classList.remove('hidden');
    toggleInterviewFormBtn.setAttribute('aria-expanded', 'false');
    toggleInterviewFormBtn.textContent = 'Manage interview questions';
    if (club.role === 'president') {
      setPresidentDashboardSection('presidentOverviewPanel');
    } else {
      presidentOverviewPanel.classList.remove('hidden');
      presidentApplicantsPanel.classList.remove('hidden');
    }
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
    if (club.role === 'president') {
      await loadClubReviewNotifications();
      startApprovalCheckpointLiveUpdates();
    }
  } catch (error) {
    const feedback = document.getElementById('clubLoginFeedback');
    feedback.textContent = error.message;
    feedback.classList.add('is-error');
    showView('clubLogin');
  }
}

function setPresidentDashboardSection(sectionId) {
  const sectionIds = ['presidentOverviewPanel', 'presidentHeadManager', 'presidentFormManager', 'interviewFormManager', 'presidentApplicantsPanel'];
  sectionIds.forEach((id) => document.getElementById(id)?.classList.toggle('hidden', id !== sectionId));
  toggleInterviewFormBtn.classList.add('hidden');
  presidentSidebar?.querySelectorAll('[data-dashboard-section]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.dashboardSection === sectionId);
  });
}

presidentSidebar?.querySelectorAll('[data-dashboard-section]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    setPresidentDashboardSection(link.dataset.dashboardSection);
  });
});

function renderCategoryChips() {
  const container = document.getElementById('categoryChips');
  if (!container) return;
  const categories = ['All', ...new Set(state.clubs.map((c) => c.category).filter(Boolean))];
  container.innerHTML = categories
    .map(
      (cat) => `<button type="button" class="category-chip${state.activeCategory === cat ? ' active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
    )
    .join('');

  container.querySelectorAll('.category-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.activeCategory = chip.dataset.cat;
      renderClubGrid();
    });
  });
}

function initSearchAndFilterControls() {
  const searchInput = document.getElementById('clubSearchInput');
  const clearBtn = document.getElementById('clearFiltersBtn');

  if (searchInput && !searchInput.dataset.initialized) {
    searchInput.dataset.initialized = 'true';
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderClubGrid();
    });
  }

  if (clearBtn && !clearBtn.dataset.initialized) {
    clearBtn.dataset.initialized = 'true';
    clearBtn.addEventListener('click', () => {
      state.searchQuery = '';
      state.activeCategory = 'All';
      if (searchInput) searchInput.value = '';
      renderClubGrid();
    });
  }
}

function renderClubGrid() {
  if (!clubGrid) return;
  renderCategoryChips();
  initSearchAndFilterControls();

  const openCount = state.clubs.filter((club) => club.status === 'open').length;
  const fullCount = state.clubs.filter((club) => club.status === 'full').length;
  const openingSoonCount = state.clubs.filter((club) => club.status === 'opening-soon').length;
  const applicantTotal = state.clubs.reduce((sum, club) => sum + (club.applicants || 0), 0);

  if (totalClubsStat) totalClubsStat.textContent = state.clubs.length;
  if (openClubsStat) openClubsStat.textContent = openCount;
  if (fullClubsStat) fullClubsStat.textContent = fullCount;
  if (openingSoonClubsStat) openingSoonClubsStat.textContent = openingSoonCount;
  if (totalApplicantsStat) totalApplicantsStat.textContent = applicantTotal;

  const filteredClubs = state.clubs.filter((club) => {
    const matchesCat = state.activeCategory === 'All' || club.category === state.activeCategory;
    const q = state.searchQuery;
    const matchesSearch = !q || [
      club.name, club.tagline, club.category, club.committee, club.description
    ].some((field) => String(field || '').toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  const emptyState = document.getElementById('emptyClubsState');
  if (emptyState) {
    emptyState.classList.toggle('hidden', filteredClubs.length > 0);
  }

  clubGrid.innerHTML = getOrderedClubs(filteredClubs)
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

  renderEventsSlideshow();
  renderTodayEvents();
}

function getAllEvents() {
  return (state.clubs || []).flatMap((club) =>
    (Array.isArray(club.events) ? club.events : []).map((event, eventIndex) => ({ ...event, clubId: club.id, clubName: club.name, clubImage: club.image, eventIndex }))
  );
}

const CONTENT_TYPE_LABELS = { event: 'Event', feed: 'Feed', sponsor: 'Sponsor', booth: 'Booth' };
const CONTENT_HOME_LABELS = { event: 'Upcoming Event', feed: 'Latest Feed', sponsor: 'Upcoming Sponsor', booth: 'Booth Opening Soon' };

function parseContentDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Upcoming items sort by the nearest date first; equal dates show the most recently created item first.
function compareUpcoming(left, right) {
  const leftDate = parseContentDate(left.date);
  const rightDate = parseContentDate(right.date);
  if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) return leftDate - rightDate;
  if (leftDate && !rightDate) return -1;
  if (!leftDate && rightDate) return 1;
  const leftCreated = new Date(left.createdAt || 0).getTime();
  const rightCreated = new Date(right.createdAt || 0).getTime();
  if (leftCreated !== rightCreated) return rightCreated - leftCreated;
  return (Number(right.requestId) || 0) - (Number(left.requestId) || 0);
}

// Regular listings show the newest content first.
function compareNewest(left, right) {
  const leftCreated = new Date(left.createdAt || 0).getTime();
  const rightCreated = new Date(right.createdAt || 0).getTime();
  if (leftCreated !== rightCreated) return rightCreated - leftCreated;
  return (Number(right.requestId) || 0) - (Number(left.requestId) || 0);
}

function collectClubContent(kind) {
  const typeByKind = { events: 'event', posts: 'feed', sponsors: 'sponsor', booths: 'booth' };
  return (state.clubs || []).flatMap((club) =>
    (Array.isArray(club[kind]) ? club[kind] : []).map((item, index) => ({
      ...item,
      contentType: item.contentType || typeByKind[kind] || 'event',
      clubId: club.id,
      clubName: club.name,
      clubImage: club.image,
      index
    }))
  );
}

// The upcoming section shows events, sponsors and booths. Feeds stay in the feed section.
function getAllUpcomingContent() {
  return [...collectClubContent('events'), ...collectClubContent('sponsors'), ...collectClubContent('booths')];
}

function getAllFeeds() {
  return collectClubContent('posts');
}

function renderTodayEvents() {
  const strip = document.getElementById('todayEvents');
  if (!strip) return;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const events = getAllEvents()
    .map((event) => ({ ...event, parsed: new Date(event.date) }))
    .filter((event) => !Number.isNaN(event.parsed.getTime()) && event.parsed >= start && event.parsed <= end)
    .sort((left, right) => left.parsed - right.parsed);
  if (!events.length) {
    strip.innerHTML = '';
    strip.classList.add('hidden');
    return;
  }
  strip.innerHTML = `<span class="today-events-label">Happening today &amp; tomorrow</span>${events.map((event) => {
    const isToday = event.parsed.getTime() === start.getTime();
    return `
      <a class="today-event-chip" href="/pages/event.html?club=${event.clubId}&event=${event.eventIndex}" data-club="${event.clubId}" data-idx="${event.eventIndex}">
        <span class="today-event-badge">${isToday ? 'Today' : 'Tomorrow'}</span>
        <img src="${escapeHtml(event.image || event.clubImage)}" alt="" />
        <span class="today-event-title">${escapeHtml(event.title || 'Event')}</span>
      </a>`;
  }).join('')}`;
  strip.classList.remove('hidden');
  strip.querySelectorAll('.today-event-chip').forEach((chip) => chip.addEventListener('click', (clickEvent) => {
    const event = events.find((item) => Number(item.clubId) === Number(chip.dataset.club) && item.eventIndex === Number(chip.dataset.idx));
    if (event && typeof window.openEventModal === 'function') {
      clickEvent.preventDefault();
      window.openEventModal(event);
    }
  }));
}

let slideIndex = 0;
let slideTimer = null;

function renderEventsSlideshow() {
  const track = document.getElementById('eventsSlideshowTrack');
  const dots = document.getElementById('eventsSlideshowDots');
  if (!track || !dots) return;
  const items = getAllUpcomingContent().sort(compareUpcoming);
  if (!items.length) {
    track.innerHTML = '<p class="events-empty">No upcoming content right now.</p>';
    dots.innerHTML = '';
    return;
  }
  if (slideIndex >= items.length) slideIndex = 0;
  track.innerHTML = items.map((item, i) => {
    const metaLine = item.contentType === 'sponsor'
      ? [item.sponsorType, item.sponsorAmount].filter(Boolean).join(' · ')
      : `${item.date || ''}${item.location ? ' · ' + escapeHtml(item.location) : ''}`;
    return `
    <div class="event-slide${i === slideIndex ? ' active' : ''}" data-club="${item.clubId}" data-idx="${item.index}" data-type="${item.contentType}">
      <img src="${escapeHtml(item.image || item.clubImage)}" alt="${escapeHtml(item.title || 'event')}" />
      <div class="event-slide-copy">
        <span class="event-slide-club">${escapeHtml(item.clubName || '')}</span>
        <h3>${escapeHtml(item.title || 'Event')}</h3>
        <span class="content-type-badge ${escapeHtml(item.contentType)}">${escapeHtml(CONTENT_HOME_LABELS[item.contentType] || 'Upcoming')}</span>
        <p class="event-slide-meta">${escapeHtml(metaLine)}</p>
        <p>${escapeHtml(item.description || '')}</p>
        <span class="event-slide-cta">View details →</span>
      </div>
    </div>`;
  }).join('');
  track.querySelectorAll('.event-slide').forEach((slide) => {
    slide.addEventListener('click', () => {
      const contentType = slide.dataset.type;
      if (contentType === 'sponsor') { window.location.href = '/pages/sponsors.html'; return; }
      if (contentType === 'booth') { window.location.href = '/pages/booths.html'; return; }
      const event = items.find((item) => item.contentType === 'event' && Number(item.clubId) === Number(slide.dataset.club) && item.index === Number(slide.dataset.idx));
      if (event && typeof window.openEventModal === 'function') window.openEventModal({ ...event, eventIndex: event.index });
    });
  });
  dots.innerHTML = items.map((_, i) => `<button type="button" class="${i === slideIndex ? 'active' : ''}" data-slide="${i}" aria-label="slide ${i + 1}"></button>`).join('');
  dots.querySelectorAll('button').forEach((dot) => dot.addEventListener('click', () => { slideIndex = Number(dot.dataset.slide); renderEventsSlideshow(); }));
  const prev = document.getElementById('slidePrev');
  const next = document.getElementById('slideNext');
  if (prev) prev.onclick = () => { slideIndex = (slideIndex - 1 + items.length) % items.length; renderEventsSlideshow(); };
  if (next) next.onclick = () => { slideIndex = (slideIndex + 1) % items.length; renderEventsSlideshow(); };
  if (slideTimer) clearInterval(slideTimer);
  slideTimer = setInterval(() => { slideIndex = (slideIndex + 1) % items.length; renderEventsSlideshow(); }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  const calendarButton = document.getElementById('calendarButton');
  const calendarModal = document.getElementById('calendarModal');
  const calendarClose = document.getElementById('calendarClose');
  const calendarTitle = document.getElementById('calendarTitle');
  const calendarGrid = document.getElementById('calendarGrid');
  let selectedCalendarDay = null;
  const openCalendar = () => {
    calendarModal.classList.remove('hidden');
    selectedCalendarDay = null;
    renderCalendar(new Date().getFullYear(), 0);
  };

  const parseDate = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  function renderCalendar(year = new Date().getFullYear(), month = null) {
    const events = getAllEvents().map((e) => ({ ...e, parsed: parseDate(e.date) })).filter((e) => e.parsed);
    if (calendarTitle) calendarTitle.textContent = `Events calendar - ${year}`;
    const monthOptions = `<div class="calendar-month-filter"><label for="calendarMonthSelect">Choose a month</label><select id="calendarMonthSelect"><option value="">Select month</option>${Array.from({ length: 12 }, (_, index) => `<option value="${index}"${month === index ? ' selected' : ''}>${new Date(year, index, 1).toLocaleString('en', { month: 'long' })}</option>`).join('')}</select></div>`;
    const bindMonthFilter = () => calendarGrid.querySelector('#calendarMonthSelect')?.addEventListener('change', (event) => {
      selectedCalendarDay = null;
      renderCalendar(year, event.currentTarget.value === '' ? null : Number(event.currentTarget.value));
    });
    if (month === null) {
      calendarGrid.innerHTML = `${monthOptions}<p class="calendar-month-prompt">Choose a month to view its days and events.</p>`;
      bindMonthFilter();
      return;
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    let html = `<div class="calendar-week">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => `<span>${d}</span>`).join('')}</div><div class="calendar-days">`;
    for (let i = 0; i < firstDay; i++) html += '<span></span>';
    for (let day = 1; day <= daysInMonth; day++) {
      const dayEvents = events.filter((e) => e.parsed.getFullYear() === year && e.parsed.getMonth() === month && e.parsed.getDate() === day);
      html += `<div class="calendar-day${selectedCalendarDay === day ? ' is-selected' : ''}" data-day="${day}"><strong>${day}</strong>${dayEvents.map((e, i) => `<button type="button" class="calendar-event${i >= 2 ? ' extra' : ''}" data-idx="${events.indexOf(e)}" data-day="${day}" title="${escapeHtml(e.title || '')}"><img src="${escapeHtml(e.image || e.clubImage)}" alt="" />${escapeHtml(e.title || '')}</button>`).join('')}${dayEvents.length > 2 ? `<button type="button" class="calendar-more">+${dayEvents.length - 2} more</button>` : ''}</div>`;
    }
    html += '</div>';
    if (calendarGrid) calendarGrid.innerHTML = `${monthOptions}${html}`;
    if (calendarGrid) {
      bindMonthFilter();
      calendarGrid.querySelectorAll('.calendar-event').forEach((btn) => {
        btn.addEventListener('click', () => {
          const event = events[Number(btn.dataset.idx)];
          if (event) {
            selectedCalendarDay = Number(btn.dataset.day);
            renderCalendar(year, month);
            if (typeof window.openEventModal === 'function') window.openEventModal(event);
          }
        });
      });
      calendarGrid.querySelectorAll('.calendar-more').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cell = btn.closest('.calendar-day');
          if (!cell) return;
          cell.querySelectorAll('.calendar-event.extra').forEach((ev) => ev.classList.remove('extra'));
          btn.remove();
        });
      });
    }
  }

  if (calendarButton) calendarButton.addEventListener('click', openCalendar);
  document.addEventListener('click', (event) => {
    if (event.target.closest('#calendarNavLink') && (location.pathname === '/' || location.pathname === '/index.html')) {
      event.preventDefault();
      openCalendar();
    }
  });
  if (location.hash === '#calendar') {
    openCalendar();
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  if (calendarClose) calendarClose.addEventListener('click', () => calendarModal.classList.add('hidden'));
  if (calendarModal) calendarModal.addEventListener('click', (event) => { if (event.target === calendarModal) calendarModal.classList.add('hidden'); });

  window.openCalendarAt = (year, month, day) => {
    calendarModal.classList.remove('hidden');
    selectedCalendarDay = Number.isInteger(day) ? day : null;
    renderCalendar(year, month);
    if (selectedCalendarDay) calendarGrid.querySelector(`[data-day="${selectedCalendarDay}"]`)?.scrollIntoView({ block: 'nearest' });
  };
});

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

