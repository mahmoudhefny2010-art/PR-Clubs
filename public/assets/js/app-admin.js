async function openAdminAccess() {
  try {
    const response = await fetch('/api/admin/session');
    const session = await response.json();
    if (session.authenticated) {
      resetClubEditor();
      setAdminFeedback('');
      showView('admin');
      await Promise.all([loadClubs(), loadHomepageSettings(), loadArchivedClubs()]);
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
        <button class="delete-btn" type="button" data-action="archive-club" data-id="${Number(club.id)}">Archive</button>
      </div>
    </article>
  `).join('');

  adminClubList.querySelectorAll('[data-action="edit-club"]').forEach((button) => {
    button.addEventListener('click', () => editClub(Number(button.dataset.id)));
  });
  adminClubList.querySelectorAll('[data-action="move-club"]').forEach((button) => {
    button.addEventListener('click', () => moveClubOrder(Number(button.dataset.id), Number(button.dataset.direction)));
  });
  adminClubList.querySelectorAll('[data-action="archive-club"]').forEach((button) => {
    button.addEventListener('click', () => archiveClub(Number(button.dataset.id)));
  });
}

async function loadArchivedClubs() {
  const list = document.getElementById('archivedClubList');
  const count = document.getElementById('archivedClubCount');
  if (!list || !count) return;

  const response = await fetch('/api/admin/clubs/archived', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load archived clubs.');
  const archivedClubs = await response.json();
  count.textContent = `${archivedClubs.length} clubs`;
  list.innerHTML = archivedClubs.length ? archivedClubs.map((club) => `
    <article class="admin-club-row">
      <img src="${escapeHtml(club.image)}" alt="" />
      <div class="admin-club-info">
        <strong>${escapeHtml(club.name)}</strong>
        <span>${escapeHtml(club.category)} · Archived${club.archivedAt ? ` · ${escapeHtml(new Date(club.archivedAt).toLocaleDateString())}` : ''}</span>
      </div>
      <div class="admin-row-actions">
        <button class="secondary-btn" type="button" data-action="restore-club" data-id="${Number(club.id)}">Restore</button>
      </div>
    </article>
  `).join('') : '<p class="empty-state">No archived clubs.</p>';

  list.querySelectorAll('[data-action="restore-club"]').forEach((button) => {
    button.addEventListener('click', () => restoreClub(Number(button.dataset.id)));
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
  const credentialsFields = document.getElementById('clubLoginCredentialsFields');
  credentialsFields?.classList.remove('hidden');
  const clubLoginEmailInput = document.getElementById('clubLoginEmailInput');
  const clubInitialPasswordInput = document.getElementById('clubInitialPasswordInput');
  if (clubLoginEmailInput) clubLoginEmailInput.required = true;
  if (clubInitialPasswordInput) clubInitialPasswordInput.required = true;
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
  document.getElementById('clubLoginCredentialsFields')?.classList.add('hidden');
  document.getElementById('clubLoginEmailInput').required = false;
  document.getElementById('clubInitialPasswordInput').required = false;
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

async function archiveClub(clubId) {
  const club = state.clubs.find((item) => item.id === clubId);
  if (!club || !window.confirm(`Archive ${club.name}? It will be hidden from students, and its records will be kept.`)) return;

  const response = await fetch(`/api/admin/clubs/${clubId}/archive`, { method: 'POST' });
  if (!response.ok) {
    setAdminFeedback('Could not archive this club.', true);
    return;
  }

  if (Number(document.getElementById('clubEditorId').value) === clubId) resetClubEditor();
  await Promise.all([loadClubs(), loadArchivedClubs()]);
  setAdminFeedback(`${club.name} archived. Its applications and other records were kept.`);
}

async function restoreClub(clubId) {
  const archived = await fetch('/api/admin/clubs/archived', { cache: 'no-store' }).then((response) => response.ok ? response.json() : []);
  const club = archived.find((item) => item.id === clubId);
  if (!club) return;
  const response = await fetch(`/api/admin/clubs/${clubId}/restore`, { method: 'POST' });
  if (!response.ok) {
    setAdminFeedback('Could not restore this club.', true);
    return;
  }

  await Promise.all([loadClubs(), loadArchivedClubs()]);
  setAdminFeedback(`${club.name} restored to active clubs.`);
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('Could not read the selected image.')));
    reader.readAsDataURL(file);
  });
}

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
      const description = item.text || item.description || '';
      const imageBlock = image
        ? `<img class="club-image" src="${escapeHtml(image)}" alt="${escapeHtml(item.title || section.label)}" />`
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
              <button class="event-info-btn" type="button" data-info="${escapeHtml(section.key)}-${index}">Info</button>
            </div>
            <p class="event-tile-desc" id="${escapeHtml(section.key)}-desc-${index}" hidden>${escapeHtml(description)}</p>
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
  const club = state.clubs.find((item) => item.id === clubId);
  if (!club) return;
  fetch(`/api/clubs/${clubId}/view`, { method: 'POST', cache: 'no-store' }).catch(() => {});
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

    ${renderClubContentSections(club)}

    <div class="detail-actions">
      <button class="primary-btn" data-action="apply-club" data-id="${club.id}" ${canApply ? '' : 'disabled'}>${canApply ? 'Apply Now' : escapeHtml(getClubActionLabel(club.status))}</button>
      <button class="secondary-btn" data-action="go-home">Back</button>
    </div>
  `;

  clubDetail.querySelector('[data-action="apply-club"]').addEventListener('click', () => openApplicationForm(clubId));
  clubDetail.querySelector('[data-action="go-home"]').addEventListener('click', () => showView('home'));

  clubDetail.querySelectorAll('.event-info-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [kind, rawIndex] = btn.dataset.info.split('-');
      const target = clubDetail.querySelector(`#${kind}-desc-${rawIndex}`);
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


// Archived clubs pop-up
const openArchivedClubsBtn = document.getElementById('openArchivedClubsBtn');
const archivedClubsModal = document.getElementById('archivedClubsModal');
const archivedClubsModalClose = document.getElementById('archivedClubsModalClose');
if (openArchivedClubsBtn && archivedClubsModal) {
  openArchivedClubsBtn.addEventListener('click', async () => {
    archivedClubsModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    try { await loadArchivedClubs(); } catch { /* keep the last loaded list */ }
  });
}
if (archivedClubsModal && archivedClubsModalClose) {
  archivedClubsModalClose.addEventListener('click', () => {
    archivedClubsModal.classList.add('hidden');
    document.body.classList.remove('modal-open');
  });
  archivedClubsModal.addEventListener('click', (event) => {
    if (event.target === archivedClubsModal) {
      archivedClubsModal.classList.add('hidden');
      document.body.classList.remove('modal-open');
    }
  });
}
