const state = {
  clubs: [],
  universityContent: [],
  applications: [],
  selectedClub: null,
  selectedApplication: null,
  presidentApplicationFields: [],
  interviewSections: [],
  pendingInterviewPhoto: '',
  clubAccount: null,
  myForms: [],
  editingMyForm: null,
  applicationReturnView: 'home',
  studentProfile: null,
  searchQuery: '',
  activeCategory: 'All',
};
let clubsLoaded = false;
let clubsLoadPromise = null;
let clubsLoadedAt = 0;
let homepageSettingsLoadPromise = null;
let homepageSettingsLoadedAt = 0;
let publicContentRefreshStarted = false;
let universityContentRefreshId = 0;
let universityContentLoaded = false;
let universityContentLoadPromise = null;
let universityContentPrefetchScheduled = false;
let memberAttendancePrefetchScheduled = false;
const publicDataCacheKeys = {
  clubs: 'miu-public-clubs-v1',
  universityContent: 'miu-public-university-content-v1',
};

function readPublicDataCache(key) {
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    return cached && Array.isArray(cached.data) ? cached.data : null;
  } catch {
    return null;
  }
}

function writePublicDataCache(key, data) {
  try {
    const snapshot = JSON.stringify({ savedAt: Date.now(), data });
    if (snapshot.length <= 3 * 1024 * 1024) localStorage.setItem(key, snapshot);
  } catch {
    // The public pages still work when storage is disabled or full.
  }
}

function samePublicData(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const views = {
  authLoading: document.getElementById('authLoadingView'),
  home: document.getElementById('homeView'),
  signIn: document.getElementById('signInView'),
  myForms: document.getElementById('myFormsView'),
  clubLogin: document.getElementById('clubLoginView'),
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
const homePageTitle = document.getElementById('homePageTitle');
const homePageSubtitle = document.getElementById('homePageSubtitle');
const applicationFormIntro = document.getElementById('applicationFormIntro');
const applicationCustomFields = document.getElementById('applicationCustomFields');
const applicationFeedback = document.getElementById('applicationFeedback');
const applicationClubLogo = document.getElementById('applicationClubLogo');
const applicantPhotoInput = document.getElementById('applicantPhotoInput');
const applicantPhotoPreview = document.getElementById('applicantPhotoPreview');
const applicantPhotoPlaceholder = document.getElementById('applicantPhotoPlaceholder');

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
  } catch (error) {
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
  const storedResults = await Promise.all(stored.map(async (entry) => {
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
  const formsById = new Map(storedResults.filter(Boolean).map((item) => [Number(item.id), item]));
  try {
    const response = await fetch('/api/student/my-forms', { cache: 'no-store' });
    if (response.ok) {
      const result = await response.json();
      for (const item of Array.isArray(result.forms) ? result.forms : []) {
        const existing = formsById.get(Number(item.id));
        formsById.set(Number(item.id), {
          ...(existing || {}),
          ...item,
          token: existing?.token || '',
          studentOwned: true
        });
      }
    }
  } catch {
    // Keep device-local code-based forms visible if the account lookup is unavailable.
  }
  state.myForms = [...formsById.values()];
  renderMyForms();
  if (window.loadMemberAttendanceAssignments && !memberAttendancePrefetchScheduled) {
    memberAttendancePrefetchScheduled = true;
    if (window.siteStartup?.afterStartup) window.siteStartup.afterStartup(() => window.loadMemberAttendanceAssignments());
    else void window.loadMemberAttendanceAssignments();
  }
}

function renderMyForms() {
  myFormsList.replaceChildren();
  const applicationCount = String(state.myForms.length);
  const dashboardApplicationCount = document.getElementById('studentDashboardApplicationCount');
  const sidebarApplicationCount = document.getElementById('studentSidebarApplicationCount');
  if (dashboardApplicationCount) dashboardApplicationCount.textContent = applicationCount;
  if (sidebarApplicationCount) sidebarApplicationCount.textContent = applicationCount;
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
  // The form can also be restored after a reload; in either case its X returns
  // to the student's forms dashboard, where editing started.
  state.applicationReturnView = 'myForms';
  state.editingMyForm = item;
  persistCurrentViewState();
  const currentCommitteeOption = [...applicationCommitteeInput.options]
    .find((option) => option.value === app.committee);
  if (currentCommitteeOption) {
    currentCommitteeOption.disabled = false;
    applicationCommitteeInput.disabled = false;
    applicationForm.querySelector('[type="submit"]').disabled = false;
  }
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
    headers: item.token ? { Authorization: `Bearer ${item.token}` } : {}
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

async function loadClubs(force = false) {
  if (!force && clubsLoaded && Date.now() - clubsLoadedAt < 30_000) {
    renderClubGrid();
    return;
  }
  if (!clubsLoaded) {
    const cachedClubs = readPublicDataCache(publicDataCacheKeys.clubs);
    if (cachedClubs) {
      state.clubs = cachedClubs;
      clubsLoaded = true;
      renderClubGrid();
    }
  }
  if (!clubsLoadPromise) {
    clubsLoadPromise = (async () => {
      const response = await fetch('/api/clubs?media=links', { cache: 'no-cache' });
      if (!response.ok) throw new Error('Could not load club events.');
      const records = await response.json();
      const nextClubs = Array.isArray(records) ? records : [];
      const changed = !samePublicData(nextClubs, state.clubs);
      state.clubs = nextClubs;
      writePublicDataCache(publicDataCacheKeys.clubs, nextClubs);
      clubsLoaded = true;
      clubsLoadedAt = Date.now();
      if (changed) {
        renderClubGrid();
        renderEventsSlideshow();
        renderTodayEvents();
      }
    })();
  }
  try {
    await clubsLoadPromise;
  } finally {
    clubsLoadPromise = null;
  }
  if (!universityContentPrefetchScheduled && window.siteStartup?.afterStartup) {
    universityContentPrefetchScheduled = true;
    window.siteStartup.afterStartup(loadUniversityContentInBackground);
  } else if (!window.siteStartup?.afterStartup) {
    void loadUniversityContentInBackground();
  }
}

async function loadUniversityContentInBackground() {
  if (universityContentLoaded) return;
  if (!universityContentLoaded) {
    const cachedContent = readPublicDataCache(publicDataCacheKeys.universityContent);
    if (cachedContent) {
      state.universityContent = cachedContent;
      universityContentLoaded = true;
      renderEventsSlideshow();
      renderTodayEvents();
    }
  }
  if (!universityContentLoadPromise) {
    universityContentLoadPromise = refreshUniversityContentFromDatabase()
      .then(() => { universityContentLoaded = true; })
      .catch(() => {})
      .finally(() => { universityContentLoadPromise = null; });
  }
  await universityContentLoadPromise;
  if (!publicContentRefreshStarted) {
    publicContentRefreshStarted = true;
    window.siteStartup.watch(async () => {
      await loadClubs(true);
      await refreshUniversityContentFromDatabase();
    });
  }
}

async function loadHomepageSettings(force = false) {
  if (!force && homepageSettingsLoadedAt && Date.now() - homepageSettingsLoadedAt < 30_000) return;
  if (!homepageSettingsLoadPromise) {
    homepageSettingsLoadPromise = (async () => {
      const response = await fetch('/api/admin/homepage');
      if (!response.ok) return;
      const settings = await response.json();
      homePageTitle.textContent = settings.title;
      homePageSubtitle.textContent = settings.subtitle;
      homepageSettingsLoadedAt = Date.now();
    })();
  }
  try { await homepageSettingsLoadPromise; }
  finally { homepageSettingsLoadPromise = null; }
}

async function loadApplications() {
  const response = await fetch('/api/club/applications');
  if (!response.ok) throw new Error('Club login required to view applications.');
  state.applications = await response.json();
  window.dashboardUnread?.update('applicants', state.applications.filter((item) => item.status === 'pending').map((item) => `${item.id}:${item.updatedAt || item.status || ''}`));
  renderHeadDashboard();
}

function createApprovalRequestCheckpoint(request) {
  const isEntryPermit = request.type === 'entry_permit';
  const labels = isEntryPermit
    ? ['Submitted', 'Supervisor review', 'PR review', 'Security review', 'PR final approval', 'Dean view only']
    : ['Submitted', 'Supervisor review', 'PR review', 'English review', 'Dean review', 'Published'];
  const compactLabels = isEntryPermit
    ? ['Submit', 'Supv.', 'PR', 'Sec.', 'PR final', 'Dean']
    : ['Submit', 'Supv.', 'PR', 'Eng.', 'Dean', 'Live'];
  const stageByRole = { club: 0, supervisor: 1, pr: 2, english: 3, security: 3, dean: 4 };
  const statusIndex = isEntryPermit
    ? { draft: -1, pending_supervisor: 1, pending_security: 3, pending_dean: 4, approved: 5 }
    : { draft: -1, pending_supervisor: 1, pending_pr: 2, pending_english: 3, pending_dean: 4, published: 5 };
  const status = String(request.status || 'draft');
  const history = Array.isArray(request.workflowHistory) ? request.workflowHistory : [];
  const lastEvent = history[history.length - 1];
  const latestSecurityReview = [...history].reverse().find((event) => event.role === 'security'
    && ['approve', 'request_edit', 'reject', 'restarted_review'].includes(event.action));
  const entryPermitFinalReview = isEntryPermit && latestSecurityReview?.action === 'approve';
  let currentIndex = status === 'pending_pr' && isEntryPermit
    ? (entryPermitFinalReview ? 4 : 2)
    : statusIndex[status] ?? (status === 'changes_requested' ? stageByRole[request.editRequestedBy] || 1 : 4);
  const terminalClass = ['rejected', 'deleted'].includes(status) ? 'is-failed' : '';
  if (terminalClass) currentIndex = stageByRole[lastEvent?.role] ?? 4;

  const card = document.createElement('article');
  card.className = `approval-request-checkpoint${isEntryPermit ? ' is-entry-permit' : ''}${status === 'approved' || status === 'published' ? ' is-approved' : ''}${terminalClass ? ` ${terminalClass}` : ''}`;
  const heading = document.createElement('div');
  heading.className = 'approval-request-heading';
  const identity = document.createElement('div');
  identity.className = 'approval-request-identity';
  const title = document.createElement('strong');
  title.textContent = request.title || 'Untitled request';
  identity.append(title);
  if (isEntryPermit) {
    const type = document.createElement('span');
    type.className = 'approval-request-type';
    type.textContent = 'Entry Permit';
    identity.append(type);
  }
  const state = document.createElement('span');
  const roleLabels = { supervisor: 'Club supervisor', pr: 'PR', english: 'English Department', security: 'Security Office', dean: 'Dean' };
  state.className = `approval-request-state${terminalClass ? ' is-failed' : status === 'approved' || status === 'published' ? ' is-approved' : status.startsWith('pending_') || status === 'changes_requested' ? ' is-pending' : ''}`;
  state.textContent = isEntryPermit
    ? status === 'approved' ? 'Approved by PR · Internal · Dean view only'
      : status === 'pending_pr' ? entryPermitFinalReview ? 'Waiting for PR final approval' : 'Waiting for PR review'
        : status === 'pending_security' ? 'Waiting for Security Office'
          : status === 'rejected' ? `Rejected by ${roleLabels[lastEvent?.role] || 'review team'}`
            : status === 'changes_requested' ? `Changes requested by ${roleLabels[request.editRequestedBy] || 'review team'}`
              : status.replaceAll('_', ' ')
    : status === 'changes_requested'
      ? `Changes requested · ${roleLabels[request.editRequestedBy] || 'review team'}`
      : status === 'rejected' ? `Rejected by ${roleLabels[lastEvent?.role] || 'review team'}`
        : status === 'approved' ? 'Approved · Internal only' : status.replaceAll('_', ' ');
  heading.append(identity, state);

  const requestTrack = document.createElement('div');
  requestTrack.className = `approval-request-track${labels.length === 6 ? ' is-six-stage' : ''}`;
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
    stepTitle.textContent = compactLabels[index] || label;
    stepTitle.title = label;
    step.setAttribute('aria-label', label);
    step.append(marker, stepTitle);
    requestTrack.append(step);
  });
  card.append(heading, requestTrack);
  return card;
}

function workflowDateHasPassed(value) {
  const dateKey = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return dateKey < todayKey;
}

function clubRequestActivityEndDate(request) {
  if (request.type === 'booth') return request.boothCloseDate || request.boothOpenDate || request.date;
  if (['event', 'entry_permit'].includes(request.type)) return request.date;
  return '';
}

function isCompletedClubRequest(request) {
  const status = String(request.status || '').toLowerCase();
  if (['rejected', 'deleted'].includes(status)) return true;
  if (!['approved', 'published'].includes(status)) return false;
  const endDate = clubRequestActivityEndDate(request);
  return !endDate || workflowDateHasPassed(endDate);
}

function groupAttendanceApprovalRecords(records) {
  const groups = new Map();
  records.forEach((record) => {
    const key = `${record.itemType || 'event'}:${record.eventRequestId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        itemType: record.itemType === 'booth' ? 'Booth' : 'Event',
        title: record.eventTitle || 'Untitled activity',
        eventDate: record.eventDate || '',
        eventTime: record.eventTime || '',
        records: [],
        updatedAt: 0
      });
    }
    const group = groups.get(key);
    group.records.push(record);
    const approvalTime = (record.approvalHistory || []).reduce((latest, event) => Math.max(latest, new Date(event.createdAt || 0).getTime() || 0), 0);
    group.updatedAt = Math.max(group.updatedAt, approvalTime, new Date(record.attendedAt || 0).getTime() || 0);
  });

  const stageOrder = ['pending_supervisor', 'pending_pr', 'pending_sso', 'pending_dean', 'approved'];
  return [...groups.values()].map((group) => {
    group.stageCounts = group.records.reduce((counts, record) => {
      const status = stageOrder.includes(record.approvalStatus) ? record.approvalStatus : 'pending_pr';
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});
    group.status = stageOrder.find((status) => group.stageCounts[status]) || 'pending_pr';
    return group;
  });
}

function createAttendanceApprovalCheckpoint(review) {
  const labels = ['Club check-ins', 'Supervisor review', 'PR review', 'SSO review', 'Dean approval', 'Approved'];
  const roles = { pending_supervisor: 'Club supervisor', pending_pr: 'PR', pending_sso: 'SSO', pending_dean: 'Dean' };
  const index = { pending_supervisor: 1, pending_pr: 2, pending_sso: 3, pending_dean: 4, approved: 5 }[review.status] ?? 1;
  const isApproved = review.status === 'approved';
  const card = document.createElement('article');
  card.className = `approval-request-checkpoint is-attendance${isApproved ? ' is-approved' : ''}`;

  const heading = document.createElement('div');
  heading.className = 'approval-request-heading';
  const identity = document.createElement('div');
  identity.className = 'approval-request-identity';
  const title = document.createElement('strong');
  title.textContent = `${review.title} attendance`;
  const type = document.createElement('span');
  type.className = 'approval-request-type';
  type.textContent = 'Attendance';
  identity.append(title, type);

  const state = document.createElement('span');
  state.className = `approval-request-state${isApproved ? ' is-approved' : ' is-pending'}`;
  const waitingCount = review.stageCounts[review.status] || 0;
  state.textContent = isApproved
    ? 'Approved by Dean'
    : `Waiting for ${roles[review.status]} · ${waitingCount} check-in${waitingCount === 1 ? '' : 's'}`;
  heading.append(identity, state);

  const meta = document.createElement('p');
  meta.className = 'approval-request-meta';
  const date = review.eventDate ? new Date(`${review.eventDate}T00:00:00`) : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date)
    : review.eventDate;
  const stageNames = { pending_supervisor: 'Supervisor', pending_pr: 'PR', pending_sso: 'SSO', pending_dean: 'Dean', approved: 'approved' };
  const stageSummary = ['pending_supervisor', 'pending_pr', 'pending_sso', 'pending_dean', 'approved']
    .filter((status) => review.stageCounts[status])
    .map((status) => `${review.stageCounts[status]} ${stageNames[status]}`)
    .join(' · ');
  meta.textContent = [review.itemType, dateLabel, window.formatSiteTime(review.eventTime), `${review.records.length} check-in${review.records.length === 1 ? '' : 's'}`, stageSummary]
    .filter(Boolean).join(' · ');

  const requestTrack = document.createElement('div');
  requestTrack.className = 'approval-request-track is-attendance';
  requestTrack.style.gridTemplateColumns = `repeat(${labels.length}, minmax(0, 1fr))`;
  requestTrack.style.setProperty('--request-progress', `${index / (labels.length - 1) * 100}%`);
  labels.forEach((label, stepIndex) => {
    const step = document.createElement('div');
    step.className = 'approval-request-step';
    if (stepIndex < index) step.classList.add('is-complete');
    if (stepIndex === index) step.classList.add('is-current');
    const marker = document.createElement('span');
    marker.className = 'approval-request-marker';
    marker.setAttribute('aria-hidden', 'true');
    const stepTitle = document.createElement('span');
    stepTitle.textContent = label;
    step.append(marker, stepTitle);
    requestTrack.append(step);
  });
  card.append(heading, meta, requestTrack);
  return card;
}

function renderApprovalCheckpoints(items, attendanceRecords = []) {
  const track = document.getElementById('approvalCheckpointTrack');
  const requestLabel = document.getElementById('approvalCheckpointRequest');
  const statusLabel = document.getElementById('approvalCheckpointStatus');
  const moreButton = document.getElementById('approvalCheckpointMoreBtn');
  const moreList = document.getElementById('approvalCheckpointMoreList');
  if (!track || !statusLabel || !moreButton || !moreList) return;

  const latestActivity = (item) => {
    const history = Array.isArray(item.workflowHistory) ? item.workflowHistory : [];
    return new Date(item.updatedAt || history[history.length - 1]?.createdAt || item.createdAt || 0).getTime();
  };
  const requests = [
    ...items.filter((item) => !isCompletedClubRequest(item))
      .map((data) => ({ kind: 'content', data, activity: latestActivity(data) })),
    ...groupAttendanceApprovalRecords(attendanceRecords)
      .filter((review) => review.status !== 'approved' || !workflowDateHasPassed(review.eventDate))
      .map((data) => ({ kind: 'attendance', data, activity: data.updatedAt }))
  ].sort((a, b) => b.activity - a.activity);
  const allRequests = [
    ...items.map((data) => ({ kind: 'content', data, activity: latestActivity(data) })),
    ...groupAttendanceApprovalRecords(attendanceRecords).map((data) => ({ kind: 'attendance', data, activity: data.updatedAt }))
  ].sort((a, b) => b.activity - a.activity);
  if (requestLabel) {
    requestLabel.textContent = requests.length
      ? `Current workflows · ${requests.length} active · ${allRequests.length} total`
      : allRequests.length ? 'No active workflows · history is available' : 'Club workflows';
  }
  statusLabel.textContent = `Live · ${window.formatSiteTime(new Date())}`;
  statusLabel.removeAttribute('title');
  statusLabel.classList.add('is-live');
  track.replaceChildren();
  moreList.replaceChildren();
  moreButton.classList.toggle('hidden', allRequests.length === 0);
  moreButton.textContent = `All requests · ${allRequests.length}`;
  const renderRequest = (request) => request.kind === 'attendance'
    ? createAttendanceApprovalCheckpoint(request.data)
    : createApprovalRequestCheckpoint(request.data);
  if (!requests.length) {
    const empty = document.createElement('p');
    empty.className = 'approval-checkpoint-empty';
    empty.textContent = allRequests.length
      ? 'No active requests. Open All requests to view the full history.'
      : 'Club request and attendance workflows will appear here as soon as they are created.';
    track.append(empty);
  } else {
    track.append(renderRequest(requests[0]));
  }

  const historyRequests = allRequests.filter((request) => request.kind === 'attendance'
    ? request.data.status === 'approved' && workflowDateHasPassed(request.data.eventDate)
    : isCompletedClubRequest(request.data));
  const appendRequestGroup = (title, group) => {
    if (!group.length) return;
    const heading = document.createElement('h3');
    heading.className = 'approval-checkpoint-history-heading';
    heading.textContent = `${title} · ${group.length}`;
    moreList.append(heading);
    group.forEach((request) => moreList.append(renderRequest(request)));
  };
  appendRequestGroup('In progress', requests);
  appendRequestGroup('History', historyRequests);
}

document.getElementById('approvalCheckpointMoreBtn')?.addEventListener('click', () => {
  document.getElementById('approvalCheckpointMoreDialog')?.showModal();
});
document.getElementById('closeApprovalCheckpointMoreBtn')?.addEventListener('click', () => {
  document.getElementById('approvalCheckpointMoreDialog')?.close();
});

let approvalCheckpointRefreshTimer = null;
let approvalCheckpointRefreshInProgress = false;

async function refreshPresidentSidebarUnread({ onlyMembers = false } = {}) {
  if (state.clubAccount?.role !== 'president') return;
  try {
    const endpoints = onlyMembers
      ? [['memberData', '/api/club/members']]
      : [['applications', '/api/club/applications'], ['heads', '/api/club/heads'], ['memberData', '/api/club/members'], ['attendance', '/api/club/attendance-records']];
    const results = await Promise.all(endpoints.map(async ([key, url]) => {
      const response = await fetch(url, { cache: 'no-store' });
      return [key, response.ok ? await response.json() : null];
    }));
    const data = Object.fromEntries(results);
    const { applications, heads, memberData, attendance } = data;
    if (Array.isArray(applications)) window.dashboardUnread?.update('applicants', applications.filter((item) => item.status === 'pending').map((item) => `${item.id}:${item.updatedAt || item.status || ''}`));
    if (Array.isArray(heads)) window.dashboardUnread?.update('committeeHeads', heads.map((head) => `${head.committee}:${head.email}`));
    if (memberData && Array.isArray(memberData.members)) window.dashboardUnread?.update('clubMembers', memberData.members.map((member) => `${member.createdAt || `${member.name}:${member.committee}:${member.position}`}`));
    if (Array.isArray(attendance)) window.dashboardUnread?.update('eventAttendance', attendance.map((record) => `${record.itemType}:${record.eventRequestId}:${record.email}:${record.attendedAt}`));
  } catch { /* Keep the last known section counts until the database reconnects. */ }
}

async function loadClubReviewNotifications(showNotifications = true) {
  const dialog = document.getElementById('clubReviewNotifications');
  const list = document.getElementById('clubReviewNotificationList');
  const dismissBtn = document.getElementById('dismissNotificationBtn');
  if (!dialog || !list) return;
  if (approvalCheckpointRefreshInProgress) return;
  approvalCheckpointRefreshInProgress = true;
  try {
    const [contentResponse, attendanceResponse] = await Promise.all([
      fetch('/api/club/content', { cache: 'no-store' }),
      fetch('/api/club/attendance-records', { cache: 'no-store' })
    ]);
    const [items, attendanceRecords] = await Promise.all([contentResponse.json(), attendanceResponse.json()]);
    if (!contentResponse.ok) throw new Error(items.message || 'Could not load club request statuses.');
    if (!attendanceResponse.ok) throw new Error(attendanceRecords.message || 'Could not load attendance request statuses.');
    if (!Array.isArray(items) || !Array.isArray(attendanceRecords)) throw new Error('The database returned an unexpected workflow response.');
    renderApprovalCheckpoints(items, attendanceRecords);
    window.dashboardUnread?.update('eventAttendance', attendanceRecords.map((record) => `${record.itemType}:${record.eventRequestId}:${record.email}:${record.attendedAt}`));
    if (!showNotifications) return;
    const actionableUpdates = items.flatMap((item) => (Array.isArray(item.workflowHistory) ? item.workflowHistory : [])
      .filter((event) => ['request_edit', 'reject', 'comment', 'returned_to_pr', 'returned_to_english', 'returned_to_security'].includes(event.action)
        && ['pr', 'english', 'security', 'dean'].includes(event.role))
      .map((event) => ({
        item,
        event,
        key: `${item.id}:${event._id || event.id || `${event.action}:${new Date(event.createdAt || 0).getTime()}`}`
      })))
      .sort((left, right) => new Date(right.event.createdAt || 0) - new Date(left.event.createdAt || 0));
    const storageKey = `miu-club-notifications-seen:${state.clubAccount?.id || 'unknown'}`;
    let seenThrough = 0;
    let seenKeys = [];
    try {
      const savedState = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(savedState)) {
        seenKeys = savedState;
      } else if (savedState && typeof savedState === 'object') {
        seenThrough = Number(savedState.seenThrough) || 0;
        seenKeys = Array.isArray(savedState.keys) ? savedState.keys : [];
      }
    } catch {
      seenKeys = [];
    }
    const seenSet = new Set(seenKeys);
    const latestUpdate = actionableUpdates[0];
    if (!latestUpdate) return;
    const dismissedKey = `${storageKey}:dismissed:${encodeURIComponent(latestUpdate.key)}`;
    let wasDismissed = false;
    try { wasDismissed = localStorage.getItem(dismissedKey) === '1'; } catch { /* Use the seen list if storage reads are unavailable. */ }
    if (wasDismissed || seenSet.has(latestUpdate.key) || new Date(latestUpdate.event.createdAt || 0).getTime() <= seenThrough) return;

    const roleLabels = { supervisor: 'Club supervisor', pr: 'PR', english: 'English Department', security: 'Security Office', dean: 'Dean' };
    const actionLabels = {
      request_edit: 'requested changes',
      reject: 'rejected the request',
      comment: 'left a comment',
      returned_to_pr: 'returned the request to PR for another review',
      returned_to_english: 'returned the request to English for another review',
      returned_to_security: 'returned the permit to the Security Office for another review'
    };
    list.replaceChildren();
    const { item, event } = latestUpdate;
    const message = document.createElement('p');
    message.className = 'club-review-notice-message';
    const role = roleLabels[event.role] || 'Approval team';
    const note = String(event.comment || '').trim();
    message.textContent = `${item.title || 'Club request'}: ${role} ${actionLabels[event.action] || 'updated the request'}${note ? `. Comment: ${note}` : '.'}`;
    list.append(message);
    dialog.dataset.pendingNotificationKeys = JSON.stringify([latestUpdate.key]);
    dialog.dataset.pendingNotificationTimestamp = String(new Date(event.createdAt || 0).getTime());
    if (!dialog.open) dialog.showModal();
    const markPendingNotificationsSeen = () => {
      try {
        const pendingKeys = JSON.parse(dialog.dataset.pendingNotificationKeys || '[]');
        const savedState = JSON.parse(localStorage.getItem(storageKey) || 'null');
        const savedKeys = Array.isArray(savedState) ? savedState : (Array.isArray(savedState?.keys) ? savedState.keys : []);
        const nextSeenThrough = Math.max(
          Number(savedState?.seenThrough) || 0,
          Number(dialog.dataset.pendingNotificationTimestamp) || 0
        );
        const nextSeenKeys = [...new Set([...savedKeys, ...pendingKeys])].slice(-100);
        localStorage.setItem(storageKey, JSON.stringify({ seenThrough: nextSeenThrough, keys: nextSeenKeys }));
        for (const key of pendingKeys) localStorage.setItem(`${storageKey}:dismissed:${encodeURIComponent(key)}`, '1');
      } catch { /* Keep the dialog usable if browser storage is unavailable. */ }
      dialog.close();
    };
    if (dismissBtn) dismissBtn.onclick = markPendingNotificationsSeen;
    dialog.oncancel = (event) => {
      event.preventDefault();
      markPendingNotificationsSeen();
    };
  } catch (error) {
    const track = document.getElementById('approvalCheckpointTrack');
    const moreList = document.getElementById('approvalCheckpointMoreList');
    const moreButton = document.getElementById('approvalCheckpointMoreBtn');
    track?.replaceChildren();
    if (moreList) {
      moreList.replaceChildren();
      if (document.getElementById('approvalCheckpointMoreDialog')?.open) {
        const message = document.createElement('p');
        message.className = 'approval-checkpoint-empty';
        message.textContent = 'Could not sync request history from the database. Check your connection and reopen All requests to try again.';
        moreList.append(message);
      }
    }
    moreButton?.classList.add('hidden');
    dialog.close();
    const status = document.getElementById('approvalCheckpointStatus');
    if (status) {
      status.textContent = 'Database sync failed · retrying';
      status.title = error?.message || 'Could not load the latest request statuses.';
      status.classList.remove('is-live');
    }
  } finally {
    approvalCheckpointRefreshInProgress = false;
  }
}

window.addEventListener('club:entry-permit-submitted', () => {
  if (state.clubAccount?.role === 'president') loadClubReviewNotifications();
});

document.getElementById('openClubRequestHistoryBtn')?.addEventListener('click', async () => {
  const dialog = document.getElementById('approvalCheckpointMoreDialog');
  const list = document.getElementById('approvalCheckpointMoreList');
  if (!dialog || !list) return;
  const syncing = document.createElement('p');
  syncing.className = 'approval-checkpoint-empty';
  syncing.textContent = 'Syncing all requests from the database…';
  list.replaceChildren(syncing);
  dialog.showModal();
  await loadClubReviewNotifications(false);
});

function startApprovalCheckpointLiveUpdates() {
  if (approvalCheckpointRefreshTimer) clearInterval(approvalCheckpointRefreshTimer);
  approvalCheckpointRefreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && state.clubAccount?.role === 'president') {
      loadClubReviewNotifications(false);
      refreshPresidentSidebarUnread({ onlyMembers: true });
    }
  }, 20000);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.clubAccount?.role === 'president') {
    loadClubReviewNotifications(false);
    refreshPresidentSidebarUnread({ onlyMembers: true });
  }
});

async function openClubPortal(initialSession = null) {
  try {
    let session = initialSession;
    if (!session) {
      const sessionResponse = await fetch('/api/club-auth/session');
      session = await sessionResponse.json();
    }
    if (!session.authenticated) {
      document.documentElement.classList.remove('auth-route-pending');
      state.clubAccount = null;
      state.applications = [];
      showView('clubLogin');
      return;
    }

    if (session.club && ['pr', 'english', 'security', 'sso', 'dean', 'supervisor', 'software_development'].includes(session.club.role)) {
      const routes = { software_development: '/admin', supervisor: '/dashboards/supervisor-dashboard.html', pr: '/dashboards/pr-dashboard.html', english: '/dashboards/english-dashboard.html', security: '/dashboards/security-dashboard.html', sso: '/dashboards/sso-dashboard.html', dean: '/dashboards/dean-dashboard.html' };
      window.location.assign(routes[session.club.role]);
      return;
    }

    const club = session.club;
    if (!club) throw new Error('Could not load club dashboard.');

    state.clubAccount = club;
    if (!window.speakerDashboardScriptLoaded) {
      window.speakerDashboardScriptLoaded = true;
      const speakerScript = document.createElement('script');
      speakerScript.src = '/assets/js/speaker-request.js?v=20261013supervisorgate1';
      speakerScript.defer = true;
      speakerScript.onerror = () => { window.speakerDashboardScriptLoaded = false; };
      document.body.append(speakerScript);
    }
    clubDashboardName.textContent = club.name;
    clubDashboardLogo.src = club.image;
    clubDashboardLogo.alt = `${club.name} logo`;
    document.getElementById('clubDashboardRoleLabel').textContent = club.role === 'president'
      ? 'PRESIDENT DASHBOARD - ALL COMMITTEES'
      : `${club.committee} - HEAD DASHBOARD`;
    const isPresident = club.role === 'president';
    document.getElementById('presidentClubStatusPanel')?.classList.toggle('hidden', !isPresident);
    const presidentStatusSelect = document.getElementById('presidentClubStatusSelect');
    if (presidentStatusSelect) presidentStatusSelect.value = ['open', 'opening-soon', 'full', 'closed'].includes(club.status) ? club.status : 'open';
    const presidentStatusFeedback = document.getElementById('presidentClubStatusFeedback');
    if (presidentStatusFeedback) presidentStatusFeedback.textContent = '';
    const contentStudioButton = document.getElementById('openContentStudioBtn');
    if (contentStudioButton) {
      const hasAssignedContent = isPresident || club.hasAssignedContent === true;
      contentStudioButton.classList.toggle('hidden', !hasAssignedContent);
      contentStudioButton.textContent = isPresident ? 'Open Content Studio' : 'Assigned content task';
    }
    const attendanceCommittee = String(club.committee || '').trim().toLowerCase();
    const isItCommitteeHead = club.role === 'head'
      && (/(^|[^a-z])it([^a-z]|$)/.test(attendanceCommittee) || attendanceCommittee.includes('information technology'));
    const canManageAttendanceTools = isPresident || isItCommitteeHead;
    const canViewAttendanceHistory = isPresident || club.role === 'head';
    presidentHeadManager.classList.toggle('hidden', club.role !== 'president');
    presidentFormManager.classList.toggle('hidden', club.role !== 'president');
    const canViewClubOperations = ['president', 'head'].includes(club.role);
    presidentSidebar.classList.toggle('hidden', !canViewClubOperations);
    presidentDashboardLayout.classList.toggle('is-president', canViewClubOperations);
    presidentSidebar.querySelectorAll('[data-president-only]').forEach((item) => item.classList.toggle('hidden', !isPresident));
    document.getElementById('approvalCheckpointPanel')?.classList.toggle('hidden', club.role !== 'president');
    document.getElementById('openMemberManagerBtn')?.classList.toggle('hidden', !['president', 'head'].includes(club.role));
    const attendanceButton = document.getElementById('openAttendanceManagerBtn');
    attendanceButton?.classList.toggle('hidden', !canViewAttendanceHistory);
    attendanceButton?.setAttribute('aria-label', canManageAttendanceTools ? 'Event attendance and history' : 'Attendance history');
    if (attendanceButton?.firstChild?.nodeType === Node.TEXT_NODE) {
      attendanceButton.firstChild.textContent = canManageAttendanceTools ? 'Event attendance ' : 'Attendance history ';
    }
    const attendanceDialog = document.getElementById('attendanceQrDialog');
    if (attendanceDialog) {
      attendanceDialog.dataset.historyOnly = String(!canManageAttendanceTools);
      attendanceDialog.dataset.selfCheckin = String(canViewAttendanceHistory);
      attendanceDialog.dataset.clubId = String(club.id);
      const attendanceDescription = document.getElementById('attendanceDialogDescription');
      if (attendanceDescription) attendanceDescription.textContent = canManageAttendanceTools
        ? 'QR codes refresh every 20 seconds. You can also record your own attendance.'
        : 'Record your own attendance and browse your club’s attendance history.';
    }
    document.getElementById('attendanceDelegationPanel')?.classList.toggle('hidden', !canManageAttendanceTools);
    // Entry permits are owned by the club president; committee heads cannot create them.
    document.getElementById('openEntryPermitDialogBtn')?.classList.toggle('hidden', !isPresident);
    interviewFormManager.classList.add('hidden');
    toggleInterviewFormBtn.classList.remove('hidden');
    toggleInterviewFormBtn.setAttribute('aria-expanded', 'false');
    toggleInterviewFormBtn.textContent = 'Manage interview questions';
    if (club.role === 'president') {
      const allowedSections = new Set(['presidentOverviewPanel', 'presidentClubStatusPanel', 'presidentHeadManager', 'presidentFormManager', 'interviewFormManager', 'presidentApplicantsPanel', 'speakerRequestDashboardPanel', 'speakerInviteDashboardPanel']);
      let savedSection = '';
      const navigationEntry = window.performance?.getEntriesByType?.('navigation')?.[0];
      const isReloadNavigation = navigationEntry?.type === 'reload' || (!navigationEntry && window.performance?.navigation?.type === 1);
      if (isReloadNavigation) {
        try { savedSection = localStorage.getItem(`miu-club-dashboard-section:${club.id}`) || ''; } catch { /* Start at Overview when storage is unavailable. */ }
      }
      setPresidentDashboardSection(allowedSections.has(savedSection) ? savedSection : 'presidentOverviewPanel');
    } else {
      setPresidentDashboardSection('presidentOverviewPanel');
    }
    document.getElementById('interviewFormHeading').textContent = club.role === 'president'
      ? 'Club interview questions'
      : `${club.committee} interview questions`;
    document.getElementById('interviewFormDescription').textContent = club.role === 'president'
      ? 'These questions are used when you review applicants in your club dashboard.'
      : 'These questions are used when you review applicants assigned to your committee.';
    showView('head');
    document.documentElement.classList.remove('auth-route-pending');
    const dashboardLoads = club.role === 'president'
      ? [loadApplications()]
      : [loadApplications(), loadInterviewForm()];
    if (club.role === 'president') {
      // Paint the overview first; prepare its nested management sections in
      // ordered background stages so they are ready before the user opens them.
      window.siteStartup?.afterStartup?.(async () => {
        const results = await Promise.allSettled([loadInterviewForm(), loadCommitteeHeads()]);
        if (results[0].status === 'rejected') {
          const feedback = document.getElementById('interviewFormFeedback');
          if (feedback) { feedback.textContent = results[0].reason?.message || 'Interview questions could not be loaded.'; feedback.classList.add('is-error'); }
        }
        if (results[1].status === 'rejected') {
          const feedback = document.getElementById('committeeHeadFeedback');
          if (feedback) { feedback.textContent = results[1].reason?.message || 'Committee heads could not be loaded.'; feedback.classList.add('is-error'); }
        }
      });
      window.siteStartup?.afterStartup?.(async () => {
        const results = await Promise.allSettled([
          loadPresidentApplicationForm(),
          loadClubReviewNotifications(),
          loadClubMembers()
        ]);
        if (results[0].status === 'rejected') {
          const feedback = document.getElementById('presidentFormFeedback');
          if (feedback) { feedback.textContent = results[0].reason?.message || 'The application form could not be loaded.'; feedback.classList.add('is-error'); }
        }
      });
    } else {
      window.siteStartup?.afterStartup?.(() => loadClubMembers());
    }
    await Promise.all(dashboardLoads);
    if (club.role === 'president') startApprovalCheckpointLiveUpdates();
  } catch (error) {
    document.documentElement.classList.remove('auth-route-pending');
    const feedback = document.getElementById('clubLoginFeedback');
    feedback.textContent = error.message;
    feedback.classList.add('is-error');
    showView('clubLogin');
  }
}

function setPresidentDashboardSection(sectionId) {
  const sectionIds = ['presidentOverviewPanel', 'presidentClubStatusPanel', 'presidentHeadManager', 'presidentFormManager', 'interviewFormManager', 'presidentApplicantsPanel', 'speakerRequestDashboardPanel', 'speakerInviteDashboardPanel', 'reportInlinePanel'];
  if (state.clubAccount?.role === 'president' && sectionIds.includes(sectionId)) {
    try { localStorage.setItem(`miu-club-dashboard-section:${state.clubAccount.id}`, sectionId); } catch { /* The section still changes for this visit. */ }
  }
  sectionIds.forEach((id) => document.getElementById(id)?.classList.toggle('hidden', id !== sectionId));
  toggleInterviewFormBtn.classList.add('hidden');
  presidentSidebar?.querySelectorAll('[data-dashboard-section]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.dashboardSection === sectionId);
  });
  const unreadSection = ({ presidentHeadManager: 'committeeHeads', presidentApplicantsPanel: 'applicants' })[sectionId];
  window.dashboardUnread?.activate(unreadSection || '');
}

document.getElementById('presidentOverviewApplicantsBtn')?.addEventListener('click', () => {
  if (['president', 'head'].includes(state.clubAccount?.role)) setPresidentDashboardSection('presidentApplicantsPanel');
  else document.getElementById('applicationsList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

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
  if (totalClubsStat) totalClubsStat.textContent = state.clubs.length;
  if (openClubsStat) openClubsStat.textContent = openCount;
  if (fullClubsStat) fullClubsStat.textContent = fullCount;
  if (openingSoonClubsStat) openingSoonClubsStat.textContent = openingSoonCount;

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
            <img class="club-image${club.imageFit === 'contain' ? ' club-image-contain' : ''}" src="${escapeHtml(club.image)}" alt="${escapeHtml(club.name)} activities" loading="lazy" decoding="async" />
            ${club.pinned ? '<span class="club-pin-badge">PINNED</span>' : ''}
          </div>

          <div class="club-card-content">
            <div class="club-card-header">
              <div class="club-name">${escapeHtml(club.name)}${club.pinned ? ' <span class="club-pin-label">Pinned</span>' : ''}</div>
              <span class="status-pill status-${escapeHtml(club.status)}">${escapeHtml(getClubStatusLabel(club.status))}</span>
            </div>
            <div class="club-tagline">${escapeHtml(club.tagline || club.category)}</div>

            <div class="club-metrics">
              <div class="club-rating-summary" role="img" aria-label="Average rating ${Number(club.ratingAverage || 0).toFixed(1)} out of 5 from ${Number(club.ratingCount) || 0} student ratings" title="${Number(club.ratingCount) ? `${Number(club.ratingAverage).toFixed(1)} out of 5 · ${Number(club.ratingCount)} ratings` : 'No student ratings yet'}">
                <span class="club-rating-stars" aria-hidden="true">${[1, 2, 3, 4, 5].map((star) => `<span class="club-rating-star${Number(club.ratingAverage || 0) >= star ? ' is-filled' : Number(club.ratingAverage || 0) >= star - 0.5 ? ' is-half' : ''}">★</span>`).join('')}</span>
              </div>
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
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const clubId = Number(btn.dataset.id);
      if (Number.isSafeInteger(clubId) && typeof openClubDetail === 'function') openClubDetail(clubId);
    });
  });

  clubGrid.querySelectorAll('[data-action="apply-club"]').forEach((btn) => {
    btn.addEventListener('click', () => openApplicationForm(Number(btn.dataset.id)));
  });

  renderEventsSlideshow();
  renderTodayEvents();
}

function getAllEvents() {
  const clubEvents = (state.clubs || []).flatMap((club) =>
    (Array.isArray(club.events) ? club.events : []).map((event, eventIndex) => ({ ...event, clubId: club.id, clubName: club.name, clubImage: club.image, eventIndex }))
  );
  const universityEvents = (state.universityContent || []).filter((item) => item.type === 'event').map((event, index) => ({
    ...event, clubId: 0, clubName: 'Misr International University',
    clubImage: '/assets/img/pics/logo.svg.png', eventIndex: index, university: true,
    universityContentId: event.id
  }));
  return [...clubEvents, ...universityEvents];
}

async function refreshUniversityContentFromDatabase() {
  const refreshId = ++universityContentRefreshId;
  try {
    const response = await fetch('/api/university-content', { cache: 'no-cache' });
    if (!response.ok) throw new Error('University updates are unavailable.');
    const latest = await response.json();
    if (refreshId !== universityContentRefreshId) return;
    const nextItems = Array.isArray(latest) ? latest : [];
    if (samePublicData(nextItems, state.universityContent)) return;
    state.universityContent = nextItems;
    writePublicDataCache(publicDataCacheKeys.universityContent, nextItems);
  } catch {
    // Keep the last public snapshot visible when the database is temporarily unavailable.
    return;
  }
  renderEventsSlideshow();
  renderTodayEvents();
}

function parseEventDate(value) {
  const text = String(value || '').trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00`) : new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalDay(value) {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
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
  const universityEvents = (state.universityContent || []).filter((item) => item.type === 'event').map((item, index) => ({
    ...item, contentType: 'event', clubId: 0, clubName: 'Misr International University',
    clubImage: '/assets/img/pics/logo.svg.png', index, eventIndex: index, university: true
  }));
  return [...collectClubContent('events'), ...universityEvents, ...collectClubContent('sponsors'), ...collectClubContent('booths')];
}

function getAllFeeds() {
  return collectClubContent('posts');
}

function renderTodayEvents() {
  const strip = document.getElementById('todayEvents');
  if (!strip) return;
  const previousScroll = strip.querySelector('.today-events-viewport')?.scrollLeft || 0;
  strip.todayEventsCleanup?.();
  strip.todayEventsObserver?.disconnect();
  const start = startOfLocalDay(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const events = getAllEvents()
    .map((event) => ({ ...event, parsed: parseEventDate(event.date) }))
    .filter((event) => event.parsed && event.parsed >= start && event.parsed < end)
    .sort((left, right) => left.parsed - right.parsed);
  if (!events.length) {
    strip.innerHTML = '';
    strip.classList.add('hidden');
    return;
  }
  strip.innerHTML = `<span class="today-events-label" id="todayEventsLabel">Happening today</span><div class="today-events-viewport" tabindex="0" role="region" aria-labelledby="todayEventsLabel" aria-roledescription="carousel">${events.map((event) => {
    return `
      <a class="today-event-chip" href="/pages/event.html?club=${event.clubId}&event=${event.eventIndex}" data-club="${event.clubId}" data-idx="${event.eventIndex}">
        <span class="today-event-badge">Today · New</span>
        <img class="${event.university && (event.image || '/assets/img/pics/logo.svg.png') === '/assets/img/pics/logo.svg.png' ? 'university-brand-image' : ''}" src="${escapeHtml(event.image || event.clubImage)}" alt="" loading="lazy" decoding="async" />
        <span class="today-event-title">${escapeHtml(event.title || 'Event')}</span>
      </a>`;
  }).join('')}</div><div class="today-events-controls"><button class="today-events-arrow" type="button" data-today-direction="-1" aria-label="Previous events" aria-controls="todayEventsTrack"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button><button class="today-events-arrow" type="button" data-today-direction="1" aria-label="Next events" aria-controls="todayEventsTrack"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button></div>`;
  strip.classList.remove('hidden');
  const viewport = strip.querySelector('.today-events-viewport');
  viewport.id = 'todayEventsTrack';
  viewport.scrollLeft = previousScroll;
  const arrows = strip.querySelectorAll('[data-today-direction]');
  const chips = [...viewport.querySelectorAll('.today-event-chip')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const controller = new AbortController();
  let autoplayPaused = strip.dataset.autoplayPaused === 'true', interacting = false;
  const pause = document.createElement('button');
  pause.type = 'button';
  pause.className = 'today-events-arrow today-events-pause';
  pause.setAttribute('aria-controls', viewport.id);
  strip.querySelector('.today-events-controls').prepend(pause);
  const syncPause = () => {
    pause.setAttribute('aria-label', autoplayPaused ? 'Play event timeline' : 'Pause event timeline');
    pause.setAttribute('aria-pressed', String(autoplayPaused));
    pause.innerHTML = autoplayPaused ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m9 5 11 7-11 7z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>';
    pause.hidden = chips.length < 2 || reducedMotion.matches;
  };
  const stops = () => {
    const end = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const left = viewport.getBoundingClientRect().left;
    return [...new Set([0, ...chips.map(chip => Math.round(Math.min(end, Math.max(0, chip.getBoundingClientRect().left - left + viewport.scrollLeft - 2)))), end])].sort((a, b) => a - b);
  };
  const syncArrows = () => {
    const end = viewport.scrollWidth - viewport.clientWidth;
    arrows[0].disabled = viewport.scrollLeft <= 2;
    arrows[1].disabled = viewport.scrollLeft >= end - 2;
    const left = viewport.getBoundingClientRect().left;
    const current = chips.find(chip => chip.getBoundingClientRect().left >= left - 3) || chips[chips.length - 1];
    chips.forEach(chip => chip.classList.toggle('is-current', chip === current));
  };
  const move = (direction, loop = false) => {
    const positions = stops();
    const next = direction > 0 ? positions.find(left => left > viewport.scrollLeft + 3) : positions.findLast(left => left < viewport.scrollLeft - 3);
    viewport.scrollTo({ left: next ?? (loop ? 0 : viewport.scrollLeft), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  };
  pause.addEventListener('click', () => {
    autoplayPaused = !autoplayPaused;
    strip.dataset.autoplayPaused = String(autoplayPaused);
    syncPause();
  });
  strip.addEventListener('pointerenter', () => { interacting = true; }, { signal: controller.signal });
  strip.addEventListener('pointerleave', () => { interacting = false; }, { signal: controller.signal });
  strip.addEventListener('pointerdown', () => { interacting = true; }, { signal: controller.signal });
  strip.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') interacting = false; }, { signal: controller.signal });
  strip.addEventListener('pointercancel', () => { interacting = false; }, { signal: controller.signal });
  const timer = setInterval(() => {
    if (!document.hidden && !autoplayPaused && !interacting && !reducedMotion.matches && !strip.contains(document.activeElement) && viewport.scrollWidth > viewport.clientWidth + 2) move(1, true);
  }, 2000);
  strip.todayEventsCleanup = () => { clearInterval(timer); controller.abort(); };
  reducedMotion.addEventListener('change', syncPause, { signal: controller.signal });
  syncPause();
  arrows.forEach(button => button.addEventListener('click', () => move(Number(button.dataset.todayDirection))));
  viewport.addEventListener('scroll', syncArrows, { passive: true });
  viewport.addEventListener('keydown', event => {
    if (event.target !== viewport || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') viewport.scrollTo({ left: event.key === 'Home' ? 0 : viewport.scrollWidth, behavior: 'instant' });
    else move(event.key === 'ArrowLeft' ? -1 : 1);
  });
  let drag = null, suppressClickUntil = 0;
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, left: viewport.scrollLeft, active: false };
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const delta = event.clientX - drag.x;
    if (!drag.active && Math.abs(delta) < 8) return;
    drag.active = true;
    viewport.classList.add('is-dragging');
    if (!viewport.hasPointerCapture(event.pointerId)) viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
    viewport.scrollLeft = drag.left - delta;
  });
  const stopDrag = () => {
    if (drag?.active) suppressClickUntil = Date.now() + 400;
    drag = null;
    viewport.classList.remove('is-dragging');
  };
  viewport.addEventListener('pointerup', stopDrag);
  viewport.addEventListener('pointercancel', stopDrag);
  viewport.addEventListener('lostpointercapture', stopDrag);
  viewport.addEventListener('pointerleave', () => { if (!drag?.active) drag = null; });
  viewport.addEventListener('dragstart', event => event.preventDefault());
  viewport.addEventListener('click', event => {
    if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  if (typeof ResizeObserver === 'function') {
    strip.todayEventsObserver = new ResizeObserver(syncArrows);
    strip.todayEventsObserver.observe(viewport);
  }
  syncArrows();
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
let slideItemCount = 0;
let suppressSlideClickUntil = 0;

function syncSlideTimer() {
  if (slideTimer) clearInterval(slideTimer);
  slideTimer = null;
  if (slideItemCount > 1 && document.visibilityState === 'visible') {
    slideTimer = setInterval(() => {
      slideIndex = (slideIndex + 1) % slideItemCount;
      renderEventsSlideshow();
    }, 2500);
  }
}

document.addEventListener('visibilitychange', syncSlideTimer);

function renderEventsSlideshow() {
  const track = document.getElementById('eventsSlideshowTrack');
  const dots = document.getElementById('eventsSlideshowDots');
  if (!track || !dots) return;
  if (!track.dataset.swipeReady) {
    track.dataset.swipeReady = 'true';
    let swipeStart = null;
    track.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      swipeStart = { x: event.clientX, y: event.clientY };
    }, { passive: true });
    track.addEventListener('pointerup', (event) => {
      if (!swipeStart) return;
      const deltaX = event.clientX - swipeStart.x;
      const deltaY = event.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
      suppressSlideClickUntil = Date.now() + 500;
      const slideCount = track.querySelectorAll('.event-slide').length;
      if (slideCount < 2) return;
      slideIndex = (slideIndex + (deltaX < 0 ? 1 : -1) + slideCount) % slideCount;
      renderEventsSlideshow();
    }, { passive: true });
    track.addEventListener('pointercancel', () => { swipeStart = null; }, { passive: true });
    track.addEventListener('click', (event) => {
      if (Date.now() >= suppressSlideClickUntil) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }
  const todayStart = startOfLocalDay(new Date());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const universityItems = (state.universityContent || []).map((item) => ({
    ...item, contentType: item.type === 'event' ? 'event' : 'feed',
    clubId: 0, clubName: 'Misr International University',
    clubImage: '/assets/img/pics/logo.svg.png', university: true,
    universityContentId: item.id, index: item.id,
    parsedDate: parseEventDate(item.createdAt || item.date) || todayStart
  }));
  const items = getAllEvents().filter((event) => !event.university)
    .map((event) => ({ ...event, contentType: 'event', index: event.eventIndex, parsedDate: parseEventDate(event.date) }))
    .filter((event) => event.parsedDate && event.parsedDate < tomorrowStart)
    .concat(universityItems)
    .sort((left, right) => {
      const leftDay = startOfLocalDay(left.parsedDate);
      const rightDay = startOfLocalDay(right.parsedDate);
      if (leftDay.getTime() !== rightDay.getTime()) return rightDay - leftDay;
      return left.parsedDate - right.parsedDate;
    });
  if (!items.length) {
    slideItemCount = 0;
    track.innerHTML = '<p class="events-empty">No events or MIU updates yet.</p>';
    dots.innerHTML = '';
    dots.hidden = true;
    document.getElementById('slidePrev')?.setAttribute('hidden', '');
    document.getElementById('slideNext')?.setAttribute('hidden', '');
    if (slideTimer) clearInterval(slideTimer);
    slideTimer = null;
    return;
  }
  slideItemCount = items.length;
  if (slideIndex >= items.length) slideIndex = 0;
  track.innerHTML = items.map((item, i) => {
    const isToday = startOfLocalDay(item.parsedDate).getTime() === todayStart.getTime();
    const badge = item.university
      ? ({ poll: 'MIU POLL', evaluation: 'MIU EVALUATION' }[item.interaction] || (item.type === 'event' ? 'MIU EVENT' : 'MIU ANNOUNCEMENT'))
      : (isToday ? 'TODAY ? NEW' : 'PAST EVENT');
    const metaLine = item.contentType === 'sponsor'
      ? [item.sponsorType, item.sponsorAmount].filter(Boolean).join(' · ')
      : `${item.date || ''}${item.location ? ' · ' + escapeHtml(item.location) : ''}`;
    return `
    <div class="event-slide${i === slideIndex ? ' active' : ''}" data-club="${item.clubId}" data-idx="${item.index}" data-type="${item.contentType}">
      <img class="${item.university && item.image === '/assets/img/pics/logo.svg.png' ? 'university-brand-image' : ''}" src="${escapeHtml(item.image || item.clubImage)}" alt="${escapeHtml(item.title || 'event')}" loading="${i === slideIndex ? 'eager' : 'lazy'}" decoding="async" />
      <div class="event-slide-copy${item.contentType === 'event' && item.attendanceEnabled === true ? ' has-attendance' : ''}">
        <span class="event-slide-club">${escapeHtml(item.clubName || '')}</span>
        <h3>${escapeHtml(item.title || 'Event')}</h3>
        <span class="content-type-badge ${escapeHtml(item.contentType)}">${badge}</span>
        <p class="event-slide-meta">${escapeHtml(metaLine)}</p>
        ${item.contentType === 'event' && item.attendanceEnabled === true ? '<p class="event-attendance-status">Attendance taken</p>' : ''}
        <p>${escapeHtml(item.description || '')}</p>
        <span class="event-slide-cta">View details →</span>
      </div>
    </div>`;
  }).join('');
  track.querySelectorAll('.event-slide').forEach((slide) => {
    slide.addEventListener('click', () => {
      if (Date.now() < suppressSlideClickUntil) return;
      const contentType = slide.dataset.type;
      const universityItem = items.find((item) => item.university && Number(slide.dataset.club) === 0 && item.index === Number(slide.dataset.idx));
      if (universityItem) {
        window.location.href = universityItem.type === 'event'
          ? '/pages/event.html?university=' + universityItem.id
          : '/pages/feed.html?post=' + universityItem.id;
        return;
      }
      if (contentType === 'sponsor') { window.location.href = '/pages/sponsors.html'; return; }
      if (contentType === 'booth') { window.location.href = '/pages/booths.html'; return; }
      const event = items.find((item) => item.contentType === 'event' && Number(item.clubId) === Number(slide.dataset.club) && item.index === Number(slide.dataset.idx));
      if (event && typeof window.openEventModal === 'function') window.openEventModal({ ...event, eventIndex: event.index });
    });
  });
  dots.hidden = items.length < 2;
  dots.innerHTML = items.length > 1 ? items.map((_, i) => `<button type="button" class="${i === slideIndex ? 'active' : ''}" data-slide="${i}" aria-label="slide ${i + 1}"></button>`).join('') : '';
  dots.querySelectorAll('button').forEach((dot) => dot.addEventListener('click', () => { slideIndex = Number(dot.dataset.slide); renderEventsSlideshow(); }));
  const prev = document.getElementById('slidePrev');
  const next = document.getElementById('slideNext');
  if (prev) prev.hidden = items.length < 2;
  if (next) next.hidden = items.length < 2;
  if (prev) prev.onclick = () => { slideIndex = (slideIndex - 1 + items.length) % items.length; renderEventsSlideshow(); };
  if (next) next.onclick = () => { slideIndex = (slideIndex + 1) % items.length; renderEventsSlideshow(); };
  syncSlideTimer();
}

document.addEventListener('DOMContentLoaded', () => {
  const calendarButton = document.getElementById('calendarButton');
  const calendarModal = document.getElementById('calendarModal');
  const calendarClose = document.getElementById('calendarClose');
  const calendarTitle = document.getElementById('calendarTitle');
  const calendarGrid = document.getElementById('calendarGrid');
  const dayEventsModal = document.getElementById('calendarDayEventsModal');
  const dayEventsTitle = document.getElementById('calendarDayEventsTitle');
  const dayEventsList = document.getElementById('calendarDayEventsList');
  const dayEventsClose = document.getElementById('calendarDayEventsClose');
  let selectedCalendarDay = null;
  const openCalendar = async () => {
    window.MiuUI.modals.open(calendarModal);
    selectedCalendarDay = null;
    calendarGrid.innerHTML = '<p class="calendar-month-prompt">Loading events...</p>';
    try {
      if (clubsLoadPromise) await clubsLoadPromise;
      else if (!clubsLoaded) await loadClubs();
      await loadUniversityContentInBackground();
      const today = new Date();
      renderCalendar(today.getFullYear(), today.getMonth());
    } catch {
      calendarGrid.innerHTML = '<p class="calendar-month-prompt" role="status">Events could not be loaded. Close the calendar and try again.</p>';
    }
  };

  const parseDate = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  function closeDayEventsModal() {
    dayEventsModal?.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  function openDayEventsModal(dayEvents, year, month, day) {
    if (!dayEventsModal || !dayEventsTitle || !dayEventsList) return;
    const date = new Date(year, month, day);
    dayEventsTitle.textContent = date.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    dayEventsList.replaceChildren();

    dayEvents.forEach((event) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'calendar-day-event-option';

      const imagePath = event.image || event.clubImage;
      if (imagePath) {
        const image = document.createElement('img');
        image.src = imagePath;
        image.alt = '';
        image.addEventListener('error', () => image.remove(), { once: true });
        option.append(image);
      }

      const copy = document.createElement('span');
      copy.className = 'calendar-day-event-copy';
      const title = document.createElement('strong');
      title.textContent = event.title || 'Event';
      const meta = document.createElement('span');
      meta.textContent = [event.clubName, window.formatSiteTime(event.time), event.location].filter(Boolean).join(' · ');
      copy.append(title, meta);
      option.append(copy);
      option.addEventListener('click', () => {
        closeDayEventsModal();
        if (typeof window.openEventModal === 'function') window.openEventModal(event);
      });
      dayEventsList.append(option);
    });

    dayEventsModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    dayEventsClose?.focus();
  }

  function renderCalendar(year = new Date().getFullYear(), month = new Date().getMonth()) {
    const events = getAllEvents().map((e) => ({ ...e, parsed: parseDate(e.date) })).filter((e) => e.parsed);
    const monthDate = new Date(year, month, 1);
    year = monthDate.getFullYear();
    month = monthDate.getMonth();
    const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (calendarTitle) calendarTitle.textContent = 'Events calendar';
    const monthNavigation = `<div class="calendar-month-filter"><button type="button" data-calendar-shift="-1" aria-label="Previous month">&lsaquo;</button><strong aria-live="polite">${monthLabel}</strong><button type="button" data-calendar-shift="1" aria-label="Next month">&rsaquo;</button></div>`;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    let html = `<div class="calendar-week">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => `<span>${d}</span>`).join('')}</div><div class="calendar-days">`;
    for (let i = 0; i < firstDay; i++) html += '<span></span>';
    for (let day = 1; day <= daysInMonth; day++) {
      const dayEvents = events.filter((e) => e.parsed.getFullYear() === year && e.parsed.getMonth() === month && e.parsed.getDate() === day);
      html += `<div class="calendar-day${selectedCalendarDay === day ? ' is-selected' : ''}" data-day="${day}"><strong>${day}</strong>${dayEvents.map((e, i) => `<button type="button" class="calendar-event${i >= 1 ? ' extra' : ''}" data-idx="${events.indexOf(e)}" data-day="${day}" title="${escapeHtml(e.title || '')}"><img class="${e.university && e.image === '/assets/img/pics/logo.svg.png' ? 'university-brand-image' : ''}" src="${escapeHtml(e.image || e.clubImage)}" alt="" loading="lazy" decoding="async" />${escapeHtml(e.title || '')}</button>`).join('')}${dayEvents.length > 1 ? `<button type="button" class="calendar-more" aria-expanded="false">See ${dayEvents.length - 1} more</button>` : ''}</div>`;
    }
    html += '</div>';
    if (calendarGrid) calendarGrid.innerHTML = `${monthNavigation}${html}`;
    if (calendarGrid) {
      calendarGrid.querySelectorAll('[data-calendar-shift]').forEach((button) => {
        button.addEventListener('click', () => {
          selectedCalendarDay = null;
          const nextMonth = new Date(year, month + Number(button.dataset.calendarShift), 1);
          renderCalendar(nextMonth.getFullYear(), nextMonth.getMonth());
        });
      });
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
          const day = Number(cell.dataset.day);
          const dayEvents = events.filter((event) => event.parsed.getFullYear() === year
            && event.parsed.getMonth() === month
            && event.parsed.getDate() === day);
          openDayEventsModal(dayEvents, year, month, day);
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
  if (calendarClose) calendarClose.addEventListener('click', () => window.MiuUI.modals.close(calendarModal));
  if (calendarModal) calendarModal.addEventListener('click', (event) => { if (event.target === calendarModal) window.MiuUI.modals.close(calendarModal); });
  if (dayEventsClose) dayEventsClose.addEventListener('click', closeDayEventsModal);
  if (dayEventsModal) {
    dayEventsModal.addEventListener('click', (event) => {
      if (event.target === dayEventsModal) closeDayEventsModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !dayEventsModal.classList.contains('hidden')) closeDayEventsModal();
    });
  }

  window.openCalendarAt = (year, month, day) => {
    window.MiuUI.modals.open(calendarModal);
    selectedCalendarDay = Number.isInteger(day) ? day : null;
    renderCalendar(year, month);
    if (selectedCalendarDay) calendarGrid.querySelector(`[data-day="${selectedCalendarDay}"]`)?.scrollIntoView({ block: 'nearest' });
  };
});

function escapeHtml(value) { return window.MiuUI.escapeHtml(value); }

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
