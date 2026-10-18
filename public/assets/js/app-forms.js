document.getElementById('reloadApplicationQuestionsBtn').addEventListener('click', () => loadPresidentApplicationForm().catch(() => {}));
document.getElementById('reloadInterviewQuestionsBtn').addEventListener('click', () => loadInterviewForm().catch(() => {}));
function questionEditorScope(kind) {
  return document.getElementById(kind === 'application' ? 'applicationQuestionScope' : 'interviewQuestionScope');
}
function updateQuestionScope(kind, result) {
  const select = questionEditorScope(kind);
  select.replaceChildren();
  if (state.clubAccount?.role !== 'head') select.add(new Option(kind === 'application' ? 'Whole club' : 'Club interviews', ''));
  for (const committee of result.committees || []) select.add(new Option(committee, committee));
  select.value = result.committee || '';
  select.disabled = state.clubAccount?.role === 'head';
  if (kind === 'application') document.getElementById('presidentApplicationIntro').closest('.field-group').classList.toggle('hidden', Boolean(result.committee));
}
for (const kind of ['application', 'interview']) {
  questionEditorScope(kind)?.addEventListener('change', () => {
    const load = kind === 'application' ? loadPresidentApplicationForm : loadInterviewForm;
    load().catch(() => {});
  });
}
function validateQuestionEditor(questions) {
  const keys = new Set();
  for (const question of questions) {
    if (!question.label?.trim() || question.label.trim().length > 100) return 'Each question needs text up to 100 characters.';
    if (!['text', 'textarea', 'select'].includes(question.type) || typeof question.required !== 'boolean') return 'Check the question type and required setting.';
    if (keys.has(question.key)) return 'Each question must have a unique identifier.';
    keys.add(question.key);
    if (question.type === 'select' && (question.options.length < 2 || question.options.length > 20 || new Set(question.options).size !== question.options.length || question.options.some(o => !o.trim() || o.length > 100))) return 'Choice questions need 2-20 unique options, up to 100 characters each.';
  }
  return '';
}
async function loadPresidentApplicationForm() {
  const feedback = document.getElementById('presidentFormFeedback');
  const button = document.getElementById('savePresidentApplicationFormBtn');
  button.disabled = true;
  feedback.textContent = 'Loading questions...';
  try {
  const scope = state.clubAccount?.role === 'head' ? state.clubAccount.committee : questionEditorScope('application').value;
  const response = await fetch('/api/club/application-form?committee=' + encodeURIComponent(scope || ''), { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Could not load your application form.');
  updateQuestionScope('application', result);
  state.applicationQuestionVersion = result.version;
  document.getElementById('presidentApplicationIntro').value = result.applicationIntro || '';
  state.presidentApplicationFields = (result.applicationFields || []).map((field) => ({
    ...field,
    options: Array.isArray(field.options) ? [...field.options] : []
  }));
  renderPresidentApplicationFields();
  feedback.textContent = '';
  feedback.classList.remove('is-error');
  button.disabled = false;
  } catch (error) { feedback.textContent = error.message; feedback.classList.add('is-error'); throw error; }
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
  const button = document.getElementById('saveInterviewFormBtn');
  button.disabled = true;
  setInterviewFeedback('Loading questions...');
  try {
  const scope = state.clubAccount?.role === 'head' ? state.clubAccount.committee : questionEditorScope('interview').value;
  const response = await fetch('/api/club/interview-form?committee=' + encodeURIComponent(scope || ''), { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Could not load interview questions.');
  updateQuestionScope('interview', result);
  state.interviewQuestionVersion = result.version;
  state.interviewSections = (result.sections || []).map((section) => ({
    ...section,
    questions: (section.questions || []).map((question) => ({
      ...question,
      options: Array.isArray(question.options) ? [...question.options] : []
    }))
  }));
  renderInterviewSections();
  setInterviewFeedback('');
  button.disabled = false;
  } catch (error) { setInterviewFeedback(error.message, true); throw error; }
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
        section.questions.push({ key: `q_${crypto.randomUUID().replaceAll('-', '')}`, label: 'New question', type: 'text', required: false, options: [] });
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
  state.interviewSections.push({ key: `s_${crypto.randomUUID().replaceAll('-', '')}`, title: 'New section', questions: [] });
  renderInterviewSections();
});

document.getElementById('saveInterviewFormBtn').addEventListener('click', async () => {
  if (document.getElementById('saveInterviewFormBtn').disabled) return;
  const validation = validateQuestionEditor(state.interviewSections.flatMap(s => s.questions));
  if (validation) return setInterviewFeedback(validation, true);
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
      body: JSON.stringify({ sections: state.interviewSections, committee: questionEditorScope('interview').value, version: state.interviewQuestionVersion })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not save interview questions.');
    state.interviewQuestionVersion = result.version;
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
  state.presidentApplicationFields.push({ key: `q_${crypto.randomUUID().replaceAll('-', '')}`, label: 'New question', type: 'text', required: false, options: [] });
  renderPresidentApplicationFields();
  document.querySelector('#presidentApplicationFieldList article:last-child [data-president-property="label"]')?.focus();
});

document.getElementById('presidentFormEditor').addEventListener('submit', async (event) => {
  event.preventDefault();
  const feedback = document.getElementById('presidentFormFeedback');
  const button = document.getElementById('savePresidentApplicationFormBtn');
  if (button.disabled) return;
  const validation = validateQuestionEditor(state.presidentApplicationFields);
  if (validation) { feedback.textContent = validation; feedback.classList.add('is-error'); return; }
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
        committee: questionEditorScope('application').value, version: state.applicationQuestionVersion,
        applicationFields: state.presidentApplicationFields
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not save your application form.');
    state.applicationQuestionVersion = result.version;
    state.presidentApplicationFields = result.applicationFields;
    const club = state.clubs.find((item) => item.id === state.clubAccount.id);
    if (club) {
      club.applicationIntro = result.applicationIntro;
      club.applicationFields = [...(club.applicationFields || []).filter(f => (f.committee || '') !== (result.committee || '')), ...result.applicationFields];
    }
    feedback.textContent = 'Application form saved. New applicants will see these changes.';
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.add('is-error');
  } finally {
    button.disabled = false;
  }
});


// Shared club application, interview and student forms.
function parseClubContentDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compareClubUpcoming(left, right) {
  const leftDate = parseClubContentDate(left.date);
  const rightDate = parseClubContentDate(right.date);
  if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) return leftDate - rightDate;
  if (leftDate && !rightDate) return -1;
  if (!leftDate && rightDate) return 1;
  const leftCreated = new Date(left.createdAt || 0).getTime();
  const rightCreated = new Date(right.createdAt || 0).getTime();
  if (leftCreated !== rightCreated) return rightCreated - leftCreated;
  return (Number(right.requestId) || 0) - (Number(left.requestId) || 0);
}

function compareClubNewest(left, right) {
  const leftCreated = new Date(left.createdAt || 0).getTime();
  const rightCreated = new Date(right.createdAt || 0).getTime();
  if (leftCreated !== rightCreated) return rightCreated - leftCreated;
  return (Number(right.requestId) || 0) - (Number(left.requestId) || 0);
}

const CLUB_CONTENT_SECTIONS = [
  { key: 'events', label: 'Event', type: 'event', order: 'upcoming' },
  { key: 'posts', label: 'Feed', type: 'feed', order: 'newest' },
  { key: 'sponsors', label: 'Sponsor', type: 'sponsor', order: 'newest' },
  { key: 'booths', label: 'Booth', type: 'booth', order: 'upcoming' }
];

function clubContentMeta(item, type) {
  if (type === 'sponsor') {
    return [item.sponsorCompany, item.sponsorType, item.sponsorAmount].filter(Boolean).join(' · ');
  }
  if (type === 'booth') {
    return [item.boothLocation, item.boothSize, item.boothOpenDate].filter(Boolean).join(' · ');
  }
  if (type === 'feed') {
    return [item.date, window.formatSiteTime(item.time)].filter(Boolean).join(' · ');
  }
  return [item.date, window.formatSiteTime(item.time), item.location].filter(Boolean).join(' · ');
}

function clubContentImage(item, type, club) {
  if (type === 'sponsor') return item.sponsorLogo || '';
  if (type === 'booth') return '';
  return item.image || club.image;
}

function renderClubContentSections(club) {
  return CLUB_CONTENT_SECTIONS.map((section) => {
    const items = Array.isArray(club[section.key]) ? [...club[section.key]] : [];
    if (!items.length) return '';
    const sorted = section.order === 'upcoming'
      ? items.sort(compareClubUpcoming)
      : items.sort(compareClubNewest);
    const cards = sorted.map((item, index) => {
      const image = clubContentImage(item, section.type, club);
      const meta = clubContentMeta(item, section.type);
      const imageBlock = image
        ? window.FeedMedia.render(image, item.title || section.label, 'club-image')
        : `<div class="club-image club-image-placeholder" aria-hidden="true">${escapeHtml(section.label)}</div>`;
      return `
        <article class="club-card feed-card">
          <div class="club-image-wrap">
            ${imageBlock}
          </div>
          <div class="club-card-content">
            <div class="club-card-header">
              <div class="club-name">${escapeHtml(item.title || section.label)} <span class="content-type-badge ${escapeHtml(section.type)}">${escapeHtml(section.label)}</span></div>
            </div>
            <div class="club-tagline">${escapeHtml(meta)}</div>
            <div class="club-actions">
              <button class="event-info-btn" type="button" data-info="${escapeHtml(section.key)}-${index}" data-content-section="${escapeHtml(section.key)}" data-content-index="${club[section.key].indexOf(item)}" aria-haspopup="dialog"${section.type === 'event' ? ` data-event-index="${club.events.indexOf(item)}"` : ''}>Info</button>
            </div>
          </div>
        </article>`;
    }).join('');
    return `
    <section class="detail-section">
      <h3>${escapeHtml(section.label)}</h3>
      <div class="detail-cards-grid detail-club-cards">
        ${cards}
      </div>
    </section>`;
  }).join('');
}

function openClubDetail(clubId) {
  const normalizedClubId = Number(clubId);
  const club = state.clubs.find((item) => Number(item.id) === normalizedClubId);
  if (!club) return;
  fetch(`/api/clubs/${encodeURIComponent(normalizedClubId)}/view`, { method: 'POST', cache: 'no-store' }).catch(() => {});
  const canApply = club.status === 'open';

  state.selectedClub = club;
  clubDetail.innerHTML = `
    <button class="club-detail-close" data-action="go-home" type="button" aria-label="Close club details" title="Close">&times;</button>
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
        <div class="club-detail-actions">
          <button class="primary-btn club-detail-apply" data-action="apply-club" data-id="${club.id}" ${canApply ? '' : 'disabled'}>${canApply ? 'Apply Now' : escapeHtml(getClubActionLabel(club.status))}</button>
          <button class="secondary-btn club-rate-button" data-action="rate-club" type="button" aria-haspopup="dialog"><span aria-hidden="true">&#9734;</span> Rate this club</button>
        </div>
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
        <strong>Unlimited</strong>
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

    <dialog class="club-rating-dialog" aria-label="Rate ${escapeHtml(club.name)}">
      <button class="club-detail-close" data-action="close-rating" type="button" aria-label="Close club rating">&times;</button>
      ${window.studentFeedbackForm('club', club.id)}
    </dialog>
    ${renderClubContentSections(club)}

  `;

  clubDetail.querySelector('[data-action="apply-club"]').addEventListener('click', () => openApplicationForm(normalizedClubId));
  clubDetail.querySelector('[data-action="go-home"]').addEventListener('click', () => showView('home'));
  const ratingDialog = clubDetail.querySelector('.club-rating-dialog');
  clubDetail.querySelector('[data-action="rate-club"]').addEventListener('click', () => ratingDialog.showModal());
  clubDetail.querySelector('[data-action="close-rating"]').addEventListener('click', () => ratingDialog.close());
  ratingDialog.addEventListener('click', (event) => {
    if (event.target !== ratingDialog) return;
    const bounds = ratingDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) ratingDialog.close();
  });

  clubDetail.querySelectorAll('.detail-club-cards .club-card').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', event => {
      if (event.target.closest('button, a, input, select, textarea, video')) return;
      card.querySelector('.event-info-btn')?.click();
    });
  });
  clubDetail.querySelectorAll('.event-info-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = CLUB_CONTENT_SECTIONS.find(section => section.key === btn.dataset.contentSection);
      const item = section && club[section.key]?.[Number(btn.dataset.contentIndex)];
      if (item) window.openClubContentInfoPopup(item, section.type, club, btn);
    });
  });

  showView('club');
}

let applicationSubmissionPending = false;
let applicationFormVersion = 0;
let applicationAutoCloseTimer;
document.getElementById('applicationBackHomeBtn').addEventListener('click', () => clearTimeout(applicationAutoCloseTimer));

async function openApplicationForm(clubId, allowClosedClub = false) {
  const club = state.clubs.find((item) => item.id === clubId);
  if (!club || (!allowClosedClub && club.status !== 'open')) return;
  applicationFormVersion++;
  clearTimeout(applicationAutoCloseTimer);

  const activeView = Object.keys(views).find((name) => views[name]?.classList.contains('active'));
  if (activeView && activeView !== 'application') state.applicationReturnView = activeView;

  state.selectedClub = club;
  state.editingMyForm = null;
  state.defaultApplicantPhoto = null;
  applicationForm.reset();
  clearApplicantPhotoPreview();
  applicantPhotoInput.required = true;
  applicationForm.querySelector('.applicant-photo-field small').textContent = 'PNG, JPG, or WebP. Maximum size: 10 MB.';
  applicationForm.querySelector('[type="submit"]').textContent = 'Submit Application';
  applicationForm.querySelector('[type="submit"]').disabled = applicationSubmissionPending;
  applicationFeedback.textContent = '';
  applicationFeedback.classList.remove('is-error');
  applicationTitle.textContent = `Join ${club.name}`;
  applicationClubLogo.src = club.image;
  applicationClubLogo.alt = `${club.name} logo`;
  applicationClubLogo.classList.toggle('application-club-logo-contain', club.imageFit === 'contain');
  applicationFormIntro.textContent = club.applicationIntro || `Complete your details and answer ${club.name}'s questions.`;
  state.applicationQuestionsReady = false;
  renderApplicationFields({ applicationFields: [] });
  showView('application');
  const [profile, , accountPhoto] = await Promise.all([
    loadStudentProfile(), loadApplicationCommittees(clubId).then(() => loadPublicApplicationQuestions(clubId)),
    window.loadAccountPhoto?.().catch(() => null)
  ]);
  if (state.selectedClub?.id !== clubId || state.editingMyForm) return;
  if (accountPhoto?.url && !applicantPhotoInput.files[0]) {
    state.defaultApplicantPhoto = accountPhoto;
    applicantPhotoInput.required = false;
    applicantPhotoPreview.src = accountPhoto.url;
    applicantPhotoPreview.classList.remove('hidden');
    applicantPhotoPlaceholder.classList.add('hidden');
    applicationForm.querySelector('.applicant-photo-field small').textContent = 'Your account photo is selected. Choose a file to use a different photo.';
  }
  state.studentProfile = profile;
  if (profile) {
    const emailLocalPart = String(profile.email || '').split('@')[0];
    const miuEmailMatch = /@miuegypt\.edu\.eg$/i.test(String(profile.email || ''))
      ? emailLocalPart.match(/^([a-z]+)(\d{5,})$/i)
      : null;
    const nameParts = String(profile.name || '').trim().split(/\s+/).filter(Boolean);
    const defaults = {
      firstName: nameParts.shift() || miuEmailMatch?.[1] || '', lastName: nameParts.join(' '),
      universityId: profile.universityId || miuEmailMatch?.[2] || '',
      major: profile.major, email: profile.email, phone: profile.phone, age: profile.age
    };
    for (const [field, value] of Object.entries(defaults)) {
      const input = applicationForm.elements.namedItem(field);
      if (input && !input.value) input.value = value || '';
    }
  }
}

async function loadStudentProfile() {
  try {
    const response = await fetch('/api/student-auth/profile', { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

let studentProfileSaveTimer = null;
let studentProfileSaveQueue = Promise.resolve();
function getStudentProfileFormData() {
  const value = (name) => String(applicationForm.elements.namedItem(name)?.value || '').trim();
  return {
    name: `${value('firstName')} ${value('lastName')}`.trim(),
    universityId: value('universityId'), major: value('major'), phone: value('phone'), age: value('age')
  };
}

async function saveStudentProfileFromForm() {
  if (!state.studentProfile) return;
  const profile = getStudentProfileFormData();
  const save = studentProfileSaveQueue.then(async () => {
    const response = await fetch('/api/student-auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(profile)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Your profile was not saved. Please try again.');
    state.studentProfile = result;
    return result;
  });
  studentProfileSaveQueue = save.catch(() => {});
  const result = await save;
  return result;
}

for (const fieldName of ['firstName', 'lastName', 'universityId', 'major', 'phone', 'age']) {
  const input = applicationForm.elements.namedItem(fieldName);
  input?.addEventListener('input', () => {
    if (!state.studentProfile || state.editingMyForm) return;
    clearTimeout(studentProfileSaveTimer);
    studentProfileSaveTimer = setTimeout(() => {
      saveStudentProfileFromForm().catch((error) => {
        applicationFeedback.textContent = error.message;
        applicationFeedback.classList.add('is-error');
      });
    }, 700);
  });
  input?.addEventListener('change', () => {
    if (!state.studentProfile || state.editingMyForm) return;
    clearTimeout(studentProfileSaveTimer);
    saveStudentProfileFromForm().catch((error) => {
      applicationFeedback.textContent = error.message;
      applicationFeedback.classList.add('is-error');
    });
  });
}

function clearApplicantPhotoPreview() {
  if (applicantPhotoPreview.dataset.objectUrl) {
    URL.revokeObjectURL(applicantPhotoPreview.dataset.objectUrl);
    delete applicantPhotoPreview.dataset.objectUrl;
  }
  applicantPhotoPreview.removeAttribute('src');
  applicantPhotoPreview.classList.add('hidden');
  applicantPhotoPlaceholder.classList.remove('hidden');
  if (!state.editingMyForm && state.defaultApplicantPhoto?.url) {
    applicantPhotoPreview.src = state.defaultApplicantPhoto.url;
    applicantPhotoPreview.classList.remove('hidden');
    applicantPhotoPlaceholder.classList.add('hidden');
  }
}

applicantPhotoInput.addEventListener('change', () => {
  const file = applicantPhotoInput.files[0];
  if (!file) {
    clearApplicantPhotoPreview();
    return;
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    applicantPhotoInput.value = '';
    clearApplicantPhotoPreview();
    applicationFeedback.textContent = 'Choose a PNG, JPG, or WebP photo up to 10 MB.';
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

let publicQuestionRequest = 0;
async function loadPublicApplicationQuestions(clubId) {
  const request = ++publicQuestionRequest, version = applicationFormVersion;
  const values = new Map([...applicationCustomFields.querySelectorAll('input, textarea, select')].map(input => [input.name, input.value]));
  const button = applicationForm.querySelector('[type="submit"]');
  button.disabled = true;
  state.applicationQuestionsReady = false;
  applicationFeedback.textContent = 'Loading application questions...';
  try {
    const response = await fetch('/api/clubs/' + clubId + '/application-form', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not load application questions.');
    if (request !== publicQuestionRequest || version !== applicationFormVersion || state.selectedClub?.id !== clubId) return;
    Object.assign(state.selectedClub, result);
    applicationFormIntro.textContent = result.applicationIntro || 'Complete your details and answer the questions below.';
    renderApplicationFields(state.selectedClub);
    for (const [name, value] of values) {
      const input = applicationForm.elements.namedItem(name);
      if (input) input.value = value;
    }
    state.applicationQuestionsReady = true;
    button.disabled = applicationSubmissionPending || applicationCommitteeInput.disabled || ![...applicationCommitteeInput.options].some(option => option.value && !option.disabled);
    applicationFeedback.textContent = '';
    applicationFeedback.classList.remove('is-error');
  } catch (error) {
    if (request !== publicQuestionRequest || version !== applicationFormVersion) return;
    applicationFeedback.textContent = error.message + ' ';
    applicationFeedback.classList.add('is-error');
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'secondary-btn'; retry.textContent = 'Retry loading questions';
    retry.addEventListener('click', () => loadPublicApplicationQuestions(clubId));
    applicationFeedback.append(retry);
  }
}
applicationCommitteeInput.addEventListener('change', () => {
  if (state.selectedClub) loadPublicApplicationQuestions(state.selectedClub.id);
});

function renderApplicationFields(club) {
  const fields = (club.applicationFields || []).filter(field => !field.committee || field.committee.toLowerCase() === String(applicationCommitteeInput.value || '').toLowerCase());
  state.activeApplicationFields = fields;
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
      ? `<textarea id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" rows="4" maxlength="2000" ${required}></textarea>`
      : `<input id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" type="text" maxlength="2000" ${required} />`;
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
  const submitButton = applicationForm.querySelector('[type="submit"]');
  if (applicationSubmissionPending || submitButton?.disabled || state.applicationQuestionsReady === false) return;
  const formVersion = applicationFormVersion;
  const editing = state.editingMyForm;
  const clubName = state.selectedClub.name;
  let closingAfterSuccess = false;

  const formData = new FormData(applicationForm);
  const applicantPhoto = applicantPhotoInput.files[0];
  if (!applicantPhoto && !state.editingMyForm && !state.defaultApplicantPhoto) {
    applicationFeedback.textContent = 'Upload your photo before submitting.';
    applicationFeedback.classList.add('is-error');
    return;
  }
  if (applicantPhoto && (!['image/png', 'image/jpeg', 'image/webp'].includes(applicantPhoto.type) || applicantPhoto.size > 10 * 1024 * 1024)) {
    applicationFeedback.textContent = 'Choose a PNG, JPG, or WebP photo up to 10 MB.';
    applicationFeedback.classList.add('is-error');
    return;
  }

  applicationSubmissionPending = true;
  const submitButtonText = submitButton?.textContent || '';
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = state.editingMyForm ? 'Saving...' : 'Submitting...';
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
    answers: (state.activeApplicationFields || state.selectedClub?.applicationFields || []).map((field) => ({
      key: field.key,
      value: formData.get(`club-answer-${field.key}`) || '',
    })),
    rating: 4,
  };

  try {
    if (!state.editingMyForm && state.studentProfile) {
      clearTimeout(studentProfileSaveTimer);
      await saveStudentProfileFromForm();
    }
    if (applicantPhoto) {
      const uploadedPhoto = await window.uploadImageToCloudinary(applicantPhoto, 'applicant');
      payload.photo = uploadedPhoto.url;
      payload.photoPublicId = uploadedPhoto.publicId;
      payload.photoUploadSignature = uploadedPhoto.signature;
      payload.photoVersion = uploadedPhoto.version;
    } else if (!state.editingMyForm && state.defaultApplicantPhoto) {
      payload.photo = state.defaultApplicantPhoto.url;
      payload.photoPublicId = state.defaultApplicantPhoto.publicId;
    }
    if (!state.editingMyForm && !payload.photo) throw new Error('Upload your photo before submitting.');
    const response = await fetch(editing ? `/api/my-forms/${encodeURIComponent(editing.id)}` : '/api/applications', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(editing?.token ? { Authorization: `Bearer ${editing.token}` } : {}) },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || (editing ? 'Could not save your changes.' : 'Could not submit the application.'));

    if (!editing && (response.status !== 201 || !result.application?.id || Number(result.application.clubId) !== Number(payload.clubId)
      || typeof result.managementToken !== 'string' || !result.managementToken.trim())) {
      throw new Error('The server accepted the form but could not link it to My Forms. Check with the club before submitting again to avoid a duplicate application.');
    }

    if (!editing) rememberMyForm(result.application.id, result.managementToken);
    if (formVersion !== applicationFormVersion || !views.application.classList.contains('active')) return;
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
      applicationFeedback.textContent = `Your application to ${clubName} was submitted.`;
      closingAfterSuccess = true;
      applicationAutoCloseTimer = setTimeout(() => {
        if (formVersion === applicationFormVersion && views.application.classList.contains('active')) {
          document.getElementById('applicationBackHomeBtn').click();
        }
      }, 1200);
    }
    applicationFeedback.classList.remove('is-error');
  } catch (error) {
    if (formVersion === applicationFormVersion) {
      applicationFeedback.textContent = error.message;
      applicationFeedback.classList.add('is-error');
    }
  } finally {
    applicationSubmissionPending = false;
    if (submitButton) {
      submitButton.disabled = closingAfterSuccess && formVersion === applicationFormVersion;
      if (formVersion === applicationFormVersion) submitButton.textContent = submitButtonText;
    }
  }
});


