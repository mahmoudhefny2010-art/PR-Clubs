(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = () => new URLSearchParams(location.search);
  const link = (tool, query = '') => `/admin/${tool}${query ? '?' + query : ''}`;
  const words = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
  const valueText = value => value == null || value === '' ? '—' : Array.isArray(value) ? value.map(valueText).join(', ') : typeof value === 'object' ? Object.entries(value).map(([key, item]) => `${words(key)}: ${valueText(item)}`).join(' · ') : String(value);
  const safeUrl = value => /^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|webp);base64,)/i.test(String(value || '')) ? value : '';
  const safeDocumentUrl = value => /^(?:https:\/\/|\/(?!\/)|data:application\/(?:pdf|msword|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|presentationml\.presentation));base64,)/i.test(String(value || '')) ? value : '';
  window.renderAdminDashboardFeature = async ({ id, data, request, read, escape, list, record, saveForm }) => {
    const host = $('toolContent');
    const panel = (title, content) => `<section class="v2-feature-card"><h2>${escape(title)}</h2>${content}</section>`;
    const details = pairs => `<dl class="v2-details">${pairs.map(([key, value]) => `<div><dt>${escape(words(key))}</dt><dd>${escape(valueText(value))}</dd></div>`).join('')}</dl>`;
    const input = (name, label, value = '', type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
    const filters = (extra = '') => `<form method="get" class="v2-filter-form">${input('q', 'Search', params().get('q') || '', 'search')}${extra}<button type="submit" class="v2-action secondary">Apply filters</button></form>`;
    const matches = (...values) => values.join(' ').toLowerCase().includes((params().get('q') || '').toLowerCase());
    const chooseClub = async (tool = id) => {
      const clubs = await read('/api/clubs?media=links');
      const selected = clubs.find(club => String(club.id) === params().get('club'));
      if (!selected) host.innerHTML = filters() + list(clubs.filter(club => matches(club.name, club.category)).map(club => record(club.name, club.category || 'Club', `<a href="${link(tool, 'club=' + encodeURIComponent(club.id))}">Manage</a>`)));
      return { clubs, selected };
    };
    const action = async (button, message, fn) => {
      if (!await window.miuConfirmAction(message)) return;
      button.disabled = true;
      try { await fn(); }
      catch (error) { $('toolFeedback').textContent = error.message; $('toolFeedback').classList.add('is-error'); }
      finally { button.disabled = false; }
    };
    if (id === 'applications') {
      const clubs = await read('/api/clubs?media=links');
      const clubName = clubId => clubs.find(club => Number(club.id) === Number(clubId))?.name || `Club ${clubId}`;
      const selected = data.find(item => String(item.id) === params().get('application'));
      if (params().has('application') && !selected) throw new Error('Application not found. Return to Applications to select another record.');
      if (!selected) {
        const status = params().get('status') || '';
        const clubId = params().get('club') || '';
        const choices = `<label>Status<select name="status"><option value="">All statuses</option>${['pending', 'accepted', 'rejected'].map(value => `<option ${value === status ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Club<select name="club"><option value="">All clubs</option>${clubs.map(club => `<option value="${escape(club.id)}" ${String(club.id) === clubId ? 'selected' : ''}>${escape(club.name)}</option>`).join('')}</select></label>`;
        const shown = data.filter(item => (!status || item.status === status) && (!clubId || String(item.clubId) === clubId) && matches(item.studentName, item.email, item.universityId, item.committee));
        host.innerHTML = filters(choices) + `<p class="v2-panel-note">${shown.length} of ${data.length} applications</p>` + list(shown.map(item => record(item.studentName || item.email,
          `${item.email || ''} · ${clubName(item.clubId)} · ${item.committee || 'General'} · ${item.status}`,
          `<a href="${link(id, 'application=' + encodeURIComponent(item.id))}">Full application</a>` + ['pending', 'accepted', 'rejected'].filter(status => status !== item.status).map(status => `<button type="button" data-application="${escape(item.id)}" data-status="${status}">${{ pending: 'Set pending', accepted: 'Accept', rejected: 'Reject' }[status]}</button>`).join(''))));
        return;
      }
      const photo = safeUrl(selected.photo);
      const answers = Array.isArray(selected.answers) ? selected.answers.map(answer => [answer.label || answer.key || 'Question', answer.value ?? answer.answer]) : Object.entries(selected.answers || {});
      const profileKeys = ['studentName', 'email', 'universityId', 'major', 'phone', 'age', 'committee', 'slot', 'motivation', 'memberPosition', 'memberType', 'createdAt', 'updatedAt', 'interviewed'];
      host.innerHTML = panel('Applicant profile', `${photo ? `<img class="v2-profile-photo" src="${escape(photo)}" alt="Applicant photo">` : ''}${details([['Club', clubName(selected.clubId)], ...profileKeys.map(key => [key, selected[key]])])}`)
        + panel('Application answers', answers.length ? details(answers) : '<p class="v2-panel-note">No additional answers.</p>')
        + (selected.interviewEvaluations?.length ? panel('Interview evaluations', details(selected.interviewEvaluations.map((evaluation, index) => [`Evaluation ${index + 1}`, evaluation]))) : '')
        + panel('Interview & decision', `<form id="applicationReviewForm" class="v2-form"><label>Status<select name="status">${['pending', 'accepted', 'rejected'].map(status => `<option ${status === selected.status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><label>Interview notes<textarea name="notes" maxlength="2000">${escape(selected.notes)}</textarea></label>${input('rating', 'Rating (0–5)', selected.rating || 0, 'number', 'min="0" max="5" step="1" required')}<button class="v2-action" type="submit">Save review</button></form>`)
        + panel('Remove application', '<p class="v2-panel-note">Deleting removes this application and its managed applicant photo through the existing workflow.</p><button class="v2-action v2-danger" id="deleteApplication" type="button">Delete application</button>');
      $('applicationReviewForm').addEventListener('submit', event => saveForm(event, async form => {
        const body = { ...Object.fromEntries(new FormData(form)), rating: Number(form.elements.rating.value) };
        await request(`/api/admin/applications/${encodeURIComponent(selected.id)}/status`, { method: 'PATCH', body: JSON.stringify(body) });
        return 'Application review saved.';
      }));
      $('deleteApplication').onclick = event => action(event.currentTarget, 'Permanently delete this application and its photo?', async () => {
        await request(`/api/admin/applications/${encodeURIComponent(selected.id)}`, { method: 'DELETE' }); location.replace(link(id));
      });
    } else if (id === 'committees') {
      const { selected } = await chooseClub(); if (!selected) return;
      const committees = await read(`/api/admin/clubs/${encodeURIComponent(selected.id)}/committee-availability`);
      host.innerHTML = panel(selected.name, committees.length ? `<form class="v2-form" id="committeeSettings">${committees.map((item, index) => `<label>${escape(item.committee)}<select name="committee${index}">${['open', 'full', 'closed'].map(status => `<option ${item.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label>`).join('')}<button class="v2-action" type="submit">Save committee availability</button></form>` : '<p class="v2-panel-note">Add a committee head before setting committee availability.</p><a class="v2-action secondary" href="/admin/heads">Manage committee heads</a>');
      $('committeeSettings')?.addEventListener('submit', event => saveForm(event, async form => {
        await request(`/api/admin/clubs/${encodeURIComponent(selected.id)}/committee-availability`, { method: 'PUT', body: JSON.stringify({ committees: committees.map((item, index) => ({ committee: item.committee, status: form.elements[`committee${index}`].value })) }) });
        return 'Committee availability saved.';
      }));
    } else if (id === 'club-order') {
      const clubs = [...await read('/api/clubs?media=links')];
      const rank = club => ({ open: 0, 'opening-soon': 1, full: 2, closed: 3 }[club.status] ?? 4);
      const group = club => `${rank(club)}:${club.status === 'open' && club.pinned === true ? 0 : 1}`;
      clubs.sort((a, b) => rank(a) - rank(b) || Number(b.status === 'open' && b.pinned) - Number(a.status === 'open' && a.pinned) || (a.sortOrder || a.id) - (b.sortOrder || b.id));
      host.innerHTML = '<p class="v2-panel-note">Clubs keep their current registration and pin groups. Move cards within each group, then save the complete order.</p><form class="v2-form" id="clubOrderForm"><div id="clubOrderList"></div><button type="submit" class="v2-action">Save club order</button></form>';
      const render = () => { $('clubOrderList').innerHTML = list(clubs.map((club, index) => record(`${index + 1}. ${club.name}`, `${club.status}${club.pinned ? ' · Pinned' : ''}`, `<button type="button" data-move="${index}" data-direction="-1" ${!index || group(clubs[index - 1]) !== group(club) ? 'disabled' : ''}>Move up</button><button type="button" data-move="${index}" data-direction="1" ${index === clubs.length - 1 || group(clubs[index + 1]) !== group(club) ? 'disabled' : ''}>Move down</button>`))); };
      render();
      $('clubOrderList').onclick = event => { const button = event.target.closest('[data-move]'); if (!button || button.disabled) return; const index = Number(button.dataset.move), next = index + Number(button.dataset.direction); [clubs[index], clubs[next]] = [clubs[next], clubs[index]]; $('clubOrderForm').dataset.miuDirty = 'true'; render(); };
      $('clubOrderForm').addEventListener('submit', event => saveForm(event, async () => { await request('/api/admin/clubs/order', { method: 'PUT', body: JSON.stringify({ ids: clubs.map(club => club.id) }) }); return 'Club order saved.'; }));
    } else if (id === 'application-forms') {
      const { selected } = await chooseClub(); if (!selected) return;
      const current = await read(`/api/admin/dashboard-clubs/${selected.id}`);
      host.innerHTML = panel(selected.name, `<form id="applicationQuestionsForm" class="v2-form">${input('applicationIntro', 'Introduction', current.applicationIntro, 'text', 'maxlength="240"')}<div id="questionRows" class="v2-record-list"></div><button type="button" id="addQuestion" class="v2-action secondary">Add question</button><button type="submit" class="v2-action">Save application questions</button></form>`);
      const add = (question = {}) => {
        const row = document.createElement('fieldset'); row.className = 'v2-question-row v2-form';
        row.innerHTML = `<legend>Application question</legend>${input('label', 'Question label', question.label, 'text', 'maxlength="100" required')}${input('key', 'Question identifier', question.key, 'text', 'maxlength="40" required')}<label>Answer type<select name="type">${['text', 'textarea', 'select'].map(type => `<option ${type === question.type ? 'selected' : ''}>${type}</option>`).join('')}</select></label><label class="v2-checkbox"><input type="checkbox" name="required" ${question.required ? 'checked' : ''}>Required answer</label><label class="v2-options-label">Options, one per line<textarea name="options">${escape((question.options || []).join('\n'))}</textarea><small>Dropdown questions require at least two different options.</small></label><div class="v2-record-actions"><button type="button" data-question-up>Move up</button><button type="button" data-question-down>Move down</button><button type="button" data-question-remove>Remove question</button></div>`;
        const updateType = () => { row.querySelector('.v2-options-label').hidden = row.querySelector('[name=type]').value !== 'select'; };
        row.querySelector('[name=type]').addEventListener('change', updateType); updateType();
        $('questionRows').append(row); $('addQuestion').disabled = $('questionRows').children.length >= 12;
      };
      (current.applicationFields || []).forEach(add);
      $('addQuestion').onclick = () => { if ($('questionRows').children.length >= 12) return; add({ key: `question_${Date.now()}` }); $('applicationQuestionsForm').dataset.miuDirty = 'true'; };
      $('questionRows').onclick = event => {
        const row = event.target.closest('.v2-question-row'); if (!row) return;
        if (event.target.closest('[data-question-remove]')) row.remove();
        else if (event.target.closest('[data-question-up]') && row.previousElementSibling) row.previousElementSibling.before(row);
        else if (event.target.closest('[data-question-down]') && row.nextElementSibling) row.nextElementSibling.after(row);
        else return;
        $('applicationQuestionsForm').dataset.miuDirty = 'true'; $('addQuestion').disabled = $('questionRows').children.length >= 12;
      };
      $('applicationQuestionsForm').addEventListener('submit', event => saveForm(event, async form => {
        const seen = new Set();
        const applicationFields = [...$('questionRows').children].map(row => {
          const get = name => row.querySelector(`[name=${name}]`);
          const field = { key: get('key').value.trim(), label: get('label').value.trim(), type: get('type').value, required: get('required').checked,
            options: get('type').value === 'select' ? [...new Set(get('options').value.split('\n').map(value => value.trim()).filter(Boolean))] : [] };
          if (!/^[a-z0-9_-]{1,40}$/.test(field.key) || !field.label) throw new Error('Each question needs a label and a valid identifier using letters, digits, underscores or hyphens.');
          if (seen.has(field.key)) throw new Error('Each question needs a different identifier.'); seen.add(field.key);
          if (field.type === 'select' && (field.options.length < 2 || field.options.length > 20 || field.options.some(option => option.length > 100))) throw new Error('Dropdown questions need 2–20 different options of up to 100 characters each.');
          return field;
        });
        const payload = { ...current, applicationIntro: form.elements.applicationIntro.value, applicationFields };
        delete payload.imagePublicId; delete payload.imageUrl;
        await request(`/api/admin/clubs/${current.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        return 'Application questions saved.';
      }));
    } else if (['club-feedback', 'university-feedback'].includes(id)) {
      const rows = await read(`/api/feedback/results/${id === 'club-feedback' ? 'club' : 'university'}`);
      const selected = rows.find(row => String(row.id) === params().get('target'));
      if (selected) {
        host.innerHTML = panel(selected.title, details([['Question', selected.question], ['Responses', selected.count], ['Average', selected.average == null ? 'Not rated' : `${Number(selected.average).toFixed(2)} / 5`]])
          + (selected.interaction === 'poll' ? list((selected.counts || []).map(option => record(option.option, `${option.count} votes`))) : list((selected.responses || []).map(response => record(response.email || 'Anonymous student evaluation', `${response.value} / 5 · ${response.comment || 'No comment'}${response.updatedAt ? ' · ' + new Date(response.updatedAt).toLocaleString() : ''}`)))));
      } else {
        const rated = params().get('rated') || '';
        host.innerHTML = filters(`<label>Responses<select name="rated"><option value="">All items</option><option value="yes" ${rated === 'yes' ? 'selected' : ''}>Has responses</option><option value="no" ${rated === 'no' ? 'selected' : ''}>No responses yet</option></select></label>`)
          + list(rows.filter(row => matches(row.title, row.question) && (!rated || (row.count > 0) === (rated === 'yes'))).map(row => record(row.title, `${row.count} responses${row.average == null ? '' : ` · ${Number(row.average).toFixed(2)} / 5`}${row.question ? ` · ${row.question}` : ''}`, `<a href="${link(id, 'target=' + encodeURIComponent(row.id))}">View responses</a>`)));
      }
    } else if (id === 'club-analytics') {
      const [clubs, archived, applications, views] = await Promise.all(['/api/clubs?media=links', '/api/admin/clubs/archived', '/api/admin/applications', '/api/admin/club-views'].map(read));
      const stats = [...clubs, ...archived].map(club => {
        const submitted = applications.filter(item => Number(item.clubId) === Number(club.id));
        const accepted = submitted.filter(item => item.status === 'accepted').length;
        return { ...club, applied: submitted.length, accepted, rate: submitted.length ? Math.round(accepted / submitted.length * 100) : 0, views: views.find(item => Number(item.clubId) === Number(club.id))?.views || 0 };
      });
      const accepted = applications.filter(item => item.status === 'accepted').length;
      host.innerHTML = panel('All-club overview', details([['Applications', applications.length], ['Acceptance', applications.length ? `${Math.round(accepted / applications.length * 100)}%` : '0%'], ['Full clubs', stats.filter(club => Number(club.seats) > 0 && Number(club.members) >= Number(club.seats)).length], ['Archived clubs', archived.length]]))
        + panel('Most viewed clubs', list([...stats].sort((a, b) => b.views - a.views).map(club => record(club.name, `${club.views} views`))))
        + panel('Capacity, demand & acceptance', filters() + `<div class="v2-feature-grid">${stats.filter(club => matches(club.name)).map(club => panel(club.name, details([['Status', club.archivedAt ? 'Archived' : club.status], ['Applications', club.applied], ['Members', club.members || 0], ['Seats', club.seats || 0], ['Accepted', `${club.accepted} / ${club.applied}`], ['Acceptance', `${club.rate}%`]]) + `<meter min="0" max="100" value="${club.rate}" aria-label="Acceptance rate for ${escape(club.name)}"></meter>`)).join('')}</div>`)
        + panel('Top clubs by applicants', list([...stats].sort((a, b) => b.applied - a.applied).filter(club => club.applied > 0).slice(0, 5).map(club => record(club.name, `${club.applied} applications`))));
    } else if (id === 'event-analytics') {
      const result = await read('/api/admin/event-analytics');
      host.innerHTML = panel('Event totals', details(Object.entries(result.totals || {}))) + filters()
        + `<div class="v2-feature-grid">${(result.events || []).filter(event => matches(event.title, event.clubName, event.date)).map(event => panel(event.title, details([['Club', event.clubName], ['Date', event.date], ['Views', event.views], ['Registrations', event.registrations], ['Student interest', event.studentInterest], ['Student registrations', event.studentRegistrations], ['Verified check-ins', event.checkIns]]))).join('') || '<p class="v2-panel-note">No matching events.</p>'}</div>`;
    } else if (id === 'account-passwords') {
      host.innerHTML = panel('Set club or dashboard password', '<p class="v2-panel-note">Saving uses the existing verified password workflow and signs out the account’s current sessions. Student Google accounts follow their existing access policy.</p>'
        + `<form id="directPasswordForm" class="v2-form">${input('email', 'Account email', params().get('email') || '', 'email', 'required maxlength="254"')}${input('password', 'New password', '', 'password', 'required minlength="12" maxlength="200" autocomplete="new-password"')}${input('confirmPassword', 'Confirm password', '', 'password', 'required minlength="12" maxlength="200" autocomplete="new-password"')}<button class="v2-action" type="submit">Save new password</button></form>`);
      $('directPasswordForm').addEventListener('submit', event => saveForm(event, async form => {
        if (form.elements.password.value !== form.elements.confirmPassword.value) throw new Error('The passwords do not match.');
        const result = await request('/api/admin/accounts/password', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        form.elements.password.value = ''; form.elements.confirmPassword.value = '';
        return result.message;
      }));
    } else if (id === 'admin-settings') {
      const settings = await request('/api/admin/login-settings');
      host.innerHTML = panel('Administrator identity', details([['Current administrator', settings.email], ['Settings', settings.editable ? 'Login changes are permitted on this local server.' : settings.environmentManaged ? 'This login is managed by the server environment.' : 'Login changes are available only from localhost.']]))
        + (settings.editable ? panel('Change administrator login', `<form id="administratorLoginForm" class="v2-form">${input('email', 'New administrator email', settings.email, 'email', 'required maxlength="254"')}${input('password', 'New password', '', 'password', 'required minlength="12" maxlength="200" autocomplete="new-password"')}${input('confirmPassword', 'Confirm password', '', 'password', 'required minlength="12" maxlength="200" autocomplete="new-password"')}<button class="v2-action" type="submit">Save administrator login</button></form>`) : '');
      $('administratorLoginForm')?.addEventListener('submit', event => saveForm(event, async form => {
        if (form.elements.password.value !== form.elements.confirmPassword.value) throw new Error('The passwords do not match.');
        const result = await request('/api/admin/setup', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        if (result.savedToDatabase !== true) throw new Error(result.message || 'Administrator login was not confirmed as saved.');
        form.elements.password.value = ''; form.elements.confirmPassword.value = '';
        return `Administrator login saved for ${result.email}. Previous sessions have been signed out.`;
      }));
    } else if (id === 'website-content') {
      const [clubs, university] = await Promise.all(['/api/admin/dashboard-content-clubs', '/api/admin/university-content'].map(read));
      const type = params().get('type') || '';
      const rows = clubs.flatMap(club => ['events', 'posts', 'booths', 'sponsors'].flatMap(kind => (club[kind] || []).map(item => ({ ...item, clubName: club.name, kind }))));
      rows.push(...university.map(item => ({ ...item, clubName: 'MIU', kind: 'university' })));
      host.innerHTML = filters(`<label>Content type<select name="type"><option value="">All content</option>${['events', 'posts', 'booths', 'sponsors', 'university'].map(kind => `<option ${type === kind ? 'selected' : ''}>${kind}</option>`).join('')}</select></label>`)
        + `<div class="v2-feature-grid">${rows.filter(item => (!type || item.kind === type) && matches(item.title, item.sponsorCompany, item.boothName, item.clubName, item.description)).map(item => panel(item.title || item.sponsorCompany || item.boothName || 'Published item',
          `${safeUrl(item.image || item.sponsorLogo) ? window.FeedMedia.render(item.image || item.sponsorLogo, item.title, 'v2-content-image') : ''}`
          + details([['Club', item.clubName], ['Type', item.kind], ['Status', item.status || 'Published'], ['Date', item.date || item.boothOpenDate], ['Time', item.time], ['Location', item.location || item.boothLocation], ['Description', item.description || item.boothDescription || item.sponsorDescription],
            ...['registrationEnabled', 'attendanceEnabled', 'attendanceAudience', 'budget', 'sponsorCompany', 'sponsorContact', 'sponsorEmail', 'sponsorPhone', 'sponsorType', 'sponsorAmount', 'sponsorBenefits', 'sponsorNotes', 'boothPurpose', 'boothSize', 'boothEquipment', 'boothSetupDate', 'boothCloseDate', 'boothContact', 'boothNotes'].filter(key => item[key] != null && item[key] !== '').map(key => [key, item[key]])])
          + (safeDocumentUrl(item.sponsorAttachment) ? `<a class="v2-action secondary" href="${escape(item.sponsorAttachment)}" target="_blank" rel="noopener noreferrer">View sponsor attachment</a>` : ''))).join('') || '<p class="v2-panel-note">No matching published content.</p>'}</div>`;
    } else if (id === 'profile') {
      const [account, photo] = await Promise.all(['/api/site/account-session', '/api/site/account-photo'].map(read));
      host.innerHTML = panel('Administrator account', details([['Name', account.name || 'Administrator'], ['Email', account.email], ['Role', account.role || 'admin']]))
        + panel('Account photo', `<div class="v2-profile-preview">${safeUrl(photo?.url) ? `<img class="v2-profile-photo" src="${escape(photo.url)}" alt="Your account photo">` : `<span class="v2-avatar">${escape((account.name || account.email || 'A').slice(0, 1).toUpperCase())}</span>`}</div><form class="v2-form" id="accountPhotoForm"><label>New account photo<input name="photo" type="file" accept="image/png,image/jpeg,image/webp" required></label><button class="v2-action" type="submit">Add / change photo</button></form>${photo?.url ? '<button id="deleteAccountPhoto" type="button" class="v2-action secondary">Delete photo</button>' : ''}`);
      $('accountPhotoForm').addEventListener('submit', event => saveForm(event, async form => {
        const image = await window.uploadImageToCloudinary(form.elements.photo.files[0], 'applicant');
        await request('/api/site/account-photo', { method: 'PUT', body: JSON.stringify({ url: image.url, publicId: image.publicId }) });
        form.reset(); window.dispatchEvent(new Event('miu:account-session-changed'));
        await window.renderAdminDashboardFeature({ id, request, read, escape, list, record, saveForm });
        return 'Account photo saved.';
      }));
      $('deleteAccountPhoto')?.addEventListener('click', event => action(event.currentTarget, 'Delete your account photo and return to your initial?', async () => {
        await request('/api/site/account-photo', { method: 'DELETE' });
        window.dispatchEvent(new Event('miu:account-session-changed'));
        await window.renderAdminDashboardFeature({ id, request, read, escape, list, record, saveForm });
      }));
    }
  };
})();
