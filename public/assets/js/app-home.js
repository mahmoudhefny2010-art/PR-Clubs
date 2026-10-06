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

async function loadClubReviewNotifications() {
  const banner = document.getElementById('clubReviewNotifications');
  const list = document.getElementById('clubReviewNotificationList');
  if (!banner || !list) return;
  try {
    const response = await fetch('/api/club/content', { cache: 'no-store' });
    const items = await response.json();
    if (!response.ok) return;
    const updates = items.filter((item) => typeof item.clubNotice === 'string' && item.clubNotice.trim());
    list.replaceChildren();
    banner.hidden = updates.length === 0;
    for (const item of updates) {
      const message = document.createElement('p');
      message.style.margin = '6px 0 0';
      message.textContent = `${item.title}: ${item.clubNotice} Current status: ${String(item.status || '').replaceAll('_', ' ')}.`;
      list.append(message);
    }
  } catch {
    banner.hidden = true;
  }
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
    await loadClubReviewNotifications();
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

  renderEventsSlideshow();
  renderTodayEvents();
}

function getAllEvents() {
  return (state.clubs || []).flatMap((club) =>
    (Array.isArray(club.events) ? club.events : []).map((event, eventIndex) => ({ ...event, clubId: club.id, clubName: club.name, clubImage: club.image, eventIndex }))
  );
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
      <a class="today-event-chip" href="/pages/events.html?club=${event.clubId}&event=${event.eventIndex}">
        <span class="today-event-badge">${isToday ? 'Today' : 'Tomorrow'}</span>
        <img src="${escapeHtml(event.image || event.clubImage)}" alt="" />
        <span class="today-event-title">${escapeHtml(event.title || 'Event')}</span>
      </a>`;
  }).join('')}`;
  strip.classList.remove('hidden');
}

let slideIndex = 0;
let slideTimer = null;

function renderEventsSlideshow() {
  const track = document.getElementById('eventsSlideshowTrack');
  const dots = document.getElementById('eventsSlideshowDots');
  if (!track || !dots) return;
  const events = getAllEvents()
    .map((event) => ({ ...event, parsed: new Date(event.date) }))
    .filter((event) => !Number.isNaN(event.parsed.getTime()))
    .sort((left, right) => left.parsed - right.parsed);
  if (!events.length) {
    track.innerHTML = '<p class="events-empty">No upcoming events right now.</p>';
    dots.innerHTML = '';
    return;
  }
  if (slideIndex >= events.length) slideIndex = 0;
  track.innerHTML = events.map((event, i) => `
    <div class="event-slide${i === slideIndex ? ' active' : ''}" data-club="${event.clubId}" data-idx="${event.eventIndex}">
      <img src="${escapeHtml(event.image || event.clubImage)}" alt="${escapeHtml(event.title || 'event')}" />
      <div class="event-slide-copy">
        <span class="event-slide-club">${escapeHtml(event.clubName || '')}</span>
        <h3>${escapeHtml(event.title || 'Event')}</h3>
        <p class="event-slide-meta">${escapeHtml(event.date || '')}${event.location ? ' · ' + escapeHtml(event.location) : ''}</p>
        <p>${escapeHtml(event.description || '')}</p>
        <span class="event-slide-cta">View details →</span>
      </div>
    </div>
  `).join('');
  track.querySelectorAll('.event-slide').forEach((slide) => {
    slide.addEventListener('click', () => {
      window.location.href = `/pages/events.html?club=${slide.dataset.club}&event=${slide.dataset.idx}`;
    });
  });
  dots.innerHTML = events.map((_, i) => `<button type="button" class="${i === slideIndex ? 'active' : ''}" data-slide="${i}" aria-label="slide ${i + 1}"></button>`).join('');
  dots.querySelectorAll('button').forEach((dot) => dot.addEventListener('click', () => { slideIndex = Number(dot.dataset.slide); renderEventsSlideshow(); }));
  const prev = document.getElementById('slidePrev');
  const next = document.getElementById('slideNext');
  if (prev) prev.onclick = () => { slideIndex = (slideIndex - 1 + events.length) % events.length; renderEventsSlideshow(); };
  if (next) next.onclick = () => { slideIndex = (slideIndex + 1) % events.length; renderEventsSlideshow(); };
  if (slideTimer) clearInterval(slideTimer);
  slideTimer = setInterval(() => { slideIndex = (slideIndex + 1) % events.length; renderEventsSlideshow(); }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  const calendarButton = document.getElementById('calendarButton');
  const calendarModal = document.getElementById('calendarModal');
  const calendarClose = document.getElementById('calendarClose');
  const calendarGrid = document.getElementById('calendarGrid');

  const parseDate = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  function renderCalendar() {
    const events = getAllEvents().map((e) => ({ ...e, parsed: parseDate(e.date) })).filter((e) => e.parsed);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    let html = `<div class="calendar-month">${now.toLocaleString('en', { month: 'long', year: 'numeric' })}</div><div class="calendar-week">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => `<span>${d}</span>`).join('')}</div><div class="calendar-days">`;
    for (let i = 0; i < firstDay; i++) html += '<span></span>';
    for (let day = 1; day <= daysInMonth; day++) {
      const dayEvents = events.filter((e) => e.parsed.getFullYear() === year && e.parsed.getMonth() === month && e.parsed.getDate() === day);
      html += `<div class="calendar-day" data-day="${day}"><strong>${day}</strong>${dayEvents.map((e, i) => `<button type="button" class="calendar-event${i >= 2 ? ' extra' : ''}" data-idx="${events.indexOf(e)}" title="${escapeHtml(e.title || '')}"><img src="${escapeHtml(e.image || e.clubImage)}" alt="" />${escapeHtml(e.title || '')}</button>`).join('')}${dayEvents.length > 2 ? `<button type="button" class="calendar-more">+${dayEvents.length - 2} more</button>` : ''}</div>`;
    }
    html += '</div>';
    if (calendarGrid) calendarGrid.innerHTML = html;
    if (calendarGrid) {
      calendarGrid.querySelectorAll('.calendar-event').forEach((btn) => {
        btn.addEventListener('click', () => {
          const event = events[Number(btn.dataset.idx)];
          if (event) window.location.href = `/pages/events.html?club=${event.clubId}&event=${event.eventIndex}`;
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

  if (calendarButton) calendarButton.addEventListener('click', () => {
    calendarModal.classList.remove('hidden');
    renderCalendar();
  });
  if (calendarClose) calendarClose.addEventListener('click', () => calendarModal.classList.add('hidden'));
  if (calendarModal) calendarModal.addEventListener('click', (event) => { if (event.target === calendarModal) calendarModal.classList.add('hidden'); });
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

