(() => {
  const form = document.getElementById('staffForm');
  const email = document.getElementById('staffEmail');
  const emailRoleStatus = document.getElementById('staffEmailRoleStatus');
  const rowsHost = document.getElementById('staffRoleAssignments');
  const addRoleButton = document.getElementById('staffAddRoleBtn');
  const feedback = document.getElementById('staffFeedback');
  const accounts = document.getElementById('staffAccounts');
  const search = document.getElementById('staffSearch');
  const searchStatus = document.getElementById('staffSearchStatus');
  const roleFilter = document.getElementById('staffRoleFilter');
  let data;
  const adminLoginForm = document.getElementById('changeAdminLoginForm');
  const adminLoginStatus = document.getElementById('adminLoginSettingsStatus');
  async function loadAdminLoginSettings() {
    try {
      const response = await fetch('/api/admin/login-settings', { credentials: 'same-origin', cache: 'no-store' });
      const settings = await response.json();
      if (!response.ok) throw new Error(settings.message || 'Could not load administrator settings.');
      adminLoginStatus.textContent = `Current global administrator: ${settings.email}. ` + (settings.editable
        ? 'You can replace this login below.' : settings.environmentManaged
          ? 'Change ADMIN_EMAIL and ADMIN_PASSWORD in the server environment settings, then restart or redeploy.'
          : 'Open this page on localhost to change the administrator login.');
      adminLoginForm.hidden = !settings.editable;
      adminLoginForm.elements.email.value = settings.email;
    } catch (error) { adminLoginStatus.textContent = error.message; }
  }
  adminLoginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(adminLoginForm));
    if (payload.password !== payload.confirmPassword) { adminLoginStatus.textContent = 'The passwords do not match.'; return; }
    const button = adminLoginForm.querySelector('button'); button.disabled = true;
    adminLoginStatus.textContent = 'Saving administrator login…';
    try {
      const response = await fetch('/api/admin/setup', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || result.savedToDatabase !== true) throw new Error(result.message || 'Administrator save was not confirmed.');
      adminLoginForm.reset();
      await load();
      await loadAdminLoginSettings();
      adminLoginStatus.textContent = `Administrator login changed to ${result.email}. Previous sessions have been signed out. You can now manage the old email as a separate staff account.`;
    } catch (error) { adminLoginStatus.textContent = error.message; }
    finally { button.disabled = false; }
  });
  if (adminLoginForm) void loadAdminLoginSettings();
  // Show the page's accessible inline validation instead of the browser's
  // floating "Please fill out this field" tooltip.
  form.noValidate = true;

  async function api(options = {}, query = '') {
    const response = await fetch(`/api/admin/staff-accounts${query}`, { credentials: 'same-origin', cache: 'no-store', ...options });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Staff account management is unavailable.');
    return result;
  }

  function makeAssignmentRow(assignment = {}) {
    const row = document.createElement('section');
    row.className = 'staff-role-assignment';
    const header = document.createElement('div');
    header.className = 'staff-role-assignment-heading';
    const title = document.createElement('h3');
    title.textContent = 'Dashboard assignment';
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Remove';
    remove.addEventListener('click', () => { row.remove(); refreshRows(); });
    header.append(title, remove);

    const fields = document.createElement('div');
    fields.className = 'supervisor-account-fields';
    const roleLabel = document.createElement('label');
    roleLabel.append(document.createTextNode('Dashboard role'));
    const role = document.createElement('select');
    role.required = true;
    role.append(new Option('Choose a role', ''));
    for (const [value, label] of Object.entries(data.roles)) role.append(new Option(label, value));
    role.value = assignment.role || '';
    roleLabel.append(role);
    fields.append(roleLabel);

    const clubs = document.createElement('fieldset');
    clubs.className = 'staff-role-clubs';
    const legend = document.createElement('legend'); legend.textContent = 'Assigned clubs'; clubs.append(legend);
    const initialClubIds = assignment.role === 'supervisor'
      ? assignment.assignedClubIds || []
      : ['president', 'head'].includes(assignment.role) && assignment.clubId ? [assignment.clubId] : [];
    for (const club of data.clubs) {
      const label = document.createElement('label'); label.className = 'supervisor-assignment';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = club.id;
      checkbox.checked = initialClubIds.includes(Number(club.id));
      checkbox.addEventListener('change', () => {
        if (['president', 'head'].includes(role.value) && checkbox.checked) {
          clubs.querySelectorAll('input').forEach(item => { if (item !== checkbox) item.checked = false; });
        }
      });
      label.append(checkbox, document.createTextNode(club.name)); clubs.append(label);
    }

    const committeeLabel = document.createElement('label');
    committeeLabel.className = 'staff-role-committee'; committeeLabel.append(document.createTextNode('Committee name'));
    const committee = document.createElement('input'); committee.maxLength = 100; committee.placeholder = 'For example: IT';
    committee.value = assignment.committee || ''; committeeLabel.append(committee);
    row.append(header, fields, clubs, committeeLabel);
    role.addEventListener('change', refreshRows);
    rowsHost.append(row);
    return row;
  }

  function refreshRows() {
    const rows = [...rowsHost.querySelectorAll('.staff-role-assignment')];
    rows.forEach((row, index) => {
      const role = row.querySelector('select');
      const currentRole = role.value;
      const occupied = new Set(rows.filter(other => other !== row).map(other => other.querySelector('select').value).filter(Boolean));
      role.replaceChildren(new Option('Choose a role', ''));
      Object.entries(data.roles).forEach(([value, label]) => {
        if (!occupied.has(value) || value === currentRole) role.append(new Option(label, value));
      });
      role.value = currentRole;
      const scoped = ['president', 'head', 'supervisor'].includes(currentRole);
      row.querySelector('.staff-role-clubs').hidden = !scoped;
      const committeeLabel = row.querySelector('.staff-role-committee');
      committeeLabel.hidden = currentRole !== 'head';
      committeeLabel.querySelector('input').required = currentRole === 'head';
      row.querySelector('.staff-role-assignment-heading h3').textContent = `Dashboard ${index + 1}`;
      const remove = row.querySelector('button'); remove.disabled = rows.length === 1;
    });
    addRoleButton.hidden = rows.length >= Object.keys(data.roles).length;
  }

  function currentAssignments(account) {
    if (Array.isArray(account.assignments) && account.assignments.length) return account.assignments;
    return [{ role: account.role, clubId: account.clubId, assignedClubIds: account.assignedClubIds || [], committee: account.committee || '' }];
  }

  function edit(account) {
    email.value = account.email;
    updateEmailRoleStatus();
    rowsHost.replaceChildren();
    currentAssignments(account).forEach(makeAssignmentRow);
    refreshRows();
    form.scrollIntoView({ block: 'start', behavior: 'auto' }); email.focus({ preventScroll: true });
    feedback.textContent = `Editing ${account.email}`;
  }

  function assignmentSummary(item) {
    const ids = item.role === 'supervisor' ? item.assignedClubIds || []
      : ['president', 'head'].includes(item.role) && item.clubId ? [item.clubId] : [];
    const clubNames = ids.map(id => data.clubs.find(club => club.id === Number(id))?.name || `Club #${id}`);
    return [data.roles[item.role] || item.role, item.committee, ...clubNames].filter(Boolean).join(' · ');
  }

  function updateEmailRoleStatus() {
    const term = email.value.trim().toLowerCase();
    if (!data || !term) {
      emailRoleStatus.textContent = '';
      emailRoleStatus.hidden = true;
      return;
    }
    const exact = data.accounts.find(account => account.email.toLowerCase() === term);
    if (exact) {
      const assignments = currentAssignments(exact);
      emailRoleStatus.textContent = `Saved dashboard role${assignments.length === 1 ? '' : 's'}: ${assignments.map(assignmentSummary).join(' · ')}`;
      emailRoleStatus.hidden = false;
      return;
    }
    const matches = data.accounts.filter(account => account.email.toLowerCase().includes(term)).slice(0, 3);
    emailRoleStatus.textContent = matches.length
      ? `Matching staff: ${matches.map(account => `${account.email} — ${currentAssignments(account).map(assignmentSummary).join(', ')}`).join(' | ')}`
      : 'No saved staff role matches this email yet.';
    emailRoleStatus.hidden = false;
  }

  let emailLookupRevision = 0;
  let emailLookupTimer;
  function refreshEmailRoleStatus() {
    const term = email.value.trim().toLowerCase();
    const revision = ++emailLookupRevision;
    if (!/^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/i.test(term)) return;
    // An exact email lookup is authoritative across roles; do not let a
    // previous dashboard filter hide the account being checked.
    roleFilter.value = '';
    emailRoleStatus.textContent = 'Checking saved staff roles…';
    emailRoleStatus.hidden = false;
    clearTimeout(emailLookupTimer);
    emailLookupTimer = setTimeout(async () => {
      try {
        const result = await api({}, `?email=${encodeURIComponent(term)}`);
        if (revision !== emailLookupRevision || email.value.trim().toLowerCase() !== term) return;
        const found = result.account;
        data.accounts = data.accounts.filter(account => account.email.toLowerCase() !== term);
        if (found) data.accounts.push(found);
        render();
        updateEmailRoleStatus();
      } catch {
        if (revision === emailLookupRevision) {
          emailRoleStatus.textContent = 'Could not check saved staff roles. Try again in a moment.';
          emailRoleStatus.hidden = false;
        }
      }
    }, 300);
  }

  function formatLastUpdated(value) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
      : 'Not available';
  }

  function render() {
    accounts.replaceChildren(); const term = search.value.trim().toLowerCase();
    const matchingAccounts = data.accounts.filter(account => [account.email, ...currentAssignments(account).map(assignmentSummary)].join(' ').toLowerCase().includes(term)
      && (!roleFilter.value || currentAssignments(account).some(assignment => assignment.role === roleFilter.value)));
    matchingAccounts.sort((left, right) => (Date.parse(right.updatedAt || '') || 0) - (Date.parse(left.updatedAt || '') || 0)
      || left.email.localeCompare(right.email));
    matchingAccounts.forEach(account => {
      const card = document.createElement('article'); card.className = 'supervisor-record';
      const title = document.createElement('h3'); title.textContent = account.email;
      const badges = document.createElement('div'); badges.className = 'staff-role-badges';
      currentAssignments(account).forEach(item => {
        const badge = document.createElement('span'); badge.className = 'supervisor-status'; badge.textContent = data.roles[item.role] || item.role; badges.append(badge);
      });
      const scope = document.createElement('p'); scope.textContent = currentAssignments(account).map(assignmentSummary).join(' | ');
      const updated = document.createElement('p'); updated.className = 'staff-account-updated';
      updated.textContent = `Last updated: ${formatLastUpdated(account.updatedAt)}`;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-btn'; button.textContent = 'Edit dashboards'; button.onclick = () => edit(account);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button staff-delete-account'; remove.textContent = 'Delete account';
      remove.setAttribute('aria-label', `Delete staff roles for ${account.email}`);
      remove.onclick = async () => {
        if (!await (window.miuConfirmAction || window.confirm)(`Delete all dashboard roles for ${account.email}? This removes this account's staff dashboard access.`)) return;
        remove.disabled = true;
        try {
          const result = await api({ method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email }) });
          if (result.deletedFromDatabase !== true) throw new Error('The database did not confirm the deletion.');
          data.accounts = data.accounts.filter(item => item.email.toLowerCase() !== account.email.toLowerCase());
          if (email.value.trim().toLowerCase() === account.email.toLowerCase()) {
            form.reset(); rowsHost.replaceChildren(); makeAssignmentRow(); refreshRows();
          }
          render(); updateEmailRoleStatus();
          feedback.classList.remove('is-error'); feedback.textContent = result.message;
        } catch (error) {
          feedback.textContent = error.message; feedback.classList.add('is-error'); remove.disabled = false;
        }
      };
      const actions = document.createElement('div'); actions.className = 'staff-account-actions'; actions.append(button);
      if (account.isGlobalAdmin) {
        const protectedNote = document.createElement('small');
        protectedNote.textContent = 'Administrator access comes from the Software Development role.';
        actions.append(protectedNote);
      } else actions.append(remove);
      card.append(title, badges, scope, updated, actions); accounts.append(card);
    });
    if (!accounts.children.length) {
      const empty = document.createElement('p');
      empty.textContent = roleFilter.value
        ? `No accounts match “${roleFilter.options[roleFilter.selectedIndex]?.text || 'this role'}” and the current search.`
        : 'No matching staff accounts.';
      accounts.append(empty);
      if (roleFilter.value) {
        const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'secondary-btn';
        clear.textContent = 'Clear role filter'; clear.addEventListener('click', () => { roleFilter.value = ''; render(); });
        accounts.append(clear);
      }
    }
  }

  async function load() {
    data = await api();
    roleFilter.replaceChildren(new Option('All dashboard roles', ''));
    Object.entries(data.roles).forEach(([value, label]) => roleFilter.add(new Option(label, value)));
    rowsHost.replaceChildren(); makeAssignmentRow(); refreshRows();
    form.hidden = false;
    document.getElementById('staffSaveMessages')?.append(feedback);
    render();
  }

  addRoleButton.addEventListener('click', () => { makeAssignmentRow(); refreshRows(); rowsHost.lastElementChild.querySelector('select').focus(); });
  email.addEventListener('input', () => { updateEmailRoleStatus(); refreshEmailRoleStatus(); });
  let directoryLookupRevision = 0;
  let directoryLookupTimer;
  search.addEventListener('input', () => {
    const term = search.value.trim().toLowerCase();
    const revision = ++directoryLookupRevision;
    clearTimeout(directoryLookupTimer);
    searchStatus.textContent = '';
    if (data && /^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/i.test(term)) {
      roleFilter.value = '';
      searchStatus.textContent = 'Checking this email in the database…';
      directoryLookupTimer = setTimeout(async () => {
        try {
          const result = await api({}, `?email=${encodeURIComponent(term)}`);
          if (revision !== directoryLookupRevision || search.value.trim().toLowerCase() !== term) return;
          data.accounts = data.accounts.filter(account => account.email.toLowerCase() !== term);
          if (result.account) data.accounts.push(result.account);
          render();
          searchStatus.textContent = result.account
            ? 'Dashboard roles loaded from the database.'
            : 'No saved dashboard roles were found for this email in the database.';
        } catch (error) {
          if (revision === directoryLookupRevision) searchStatus.textContent = error.message || 'Could not check this email in the database.';
        }
      }, 250);
    }
    if (data) render();
  });
  roleFilter.addEventListener('change', () => { if (data) render(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    feedback.classList.remove('is-error');
    feedback.textContent = '';
    const invalidField = form.querySelector(':invalid');
    if (invalidField) {
      const message = invalidField === email ? 'Enter a valid MIU Google email.'
        : invalidField.matches('select') ? 'Choose a dashboard role for every assignment.'
              : 'Complete the highlighted field.';
      feedback.textContent = message;
      feedback.classList.add('is-error');
      invalidField.focus();
      return;
    }
    const assignments = [...rowsHost.querySelectorAll('.staff-role-assignment')].map(row => {
      const role = row.querySelector('select').value;
      const assignedClubIds = [...row.querySelectorAll('.staff-role-clubs input:checked')].map(input => Number(input.value));
      return { role, assignedClubIds, committee: row.querySelector('.staff-role-committee input').value.trim() };
    });
    for (const item of assignments) {
      if (!item.role) { feedback.textContent = 'Choose a dashboard role for every assignment.'; feedback.classList.add('is-error'); rowsHost.querySelector('select:invalid')?.focus(); return; }
      if (['president', 'head', 'supervisor'].includes(item.role) && !item.assignedClubIds.length) {
        feedback.textContent = `Select at least one club for ${data.roles[item.role]}.`; feedback.classList.add('is-error'); rowsHost.querySelectorAll('.staff-role-assignment')[assignments.indexOf(item)]?.querySelector('.staff-role-clubs input')?.focus(); return;
      }
      if (['president', 'head'].includes(item.role) && item.assignedClubIds.length !== 1) {
        feedback.textContent = `Select exactly one club for ${data.roles[item.role]}.`; feedback.classList.add('is-error'); return;
      }
      if (item.role === 'head' && !item.committee) { feedback.textContent = 'Enter the committee for the committee head role.'; feedback.classList.add('is-error'); rowsHost.querySelectorAll('.staff-role-assignment')[assignments.indexOf(item)]?.querySelector('.staff-role-committee input')?.focus(); return; }
    }
    const button = form.querySelector('button[type="submit"]'); button.disabled = true; feedback.textContent = 'Saving dashboard roles…';
    // Discard any pre-save lookup response so it cannot overwrite fresh data.
    emailLookupRevision++;
    clearTimeout(emailLookupTimer);
    directoryLookupRevision++;
    clearTimeout(directoryLookupTimer);
    roleFilter.value = '';
    let savedResult;
    try {
      savedResult = await api({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.value, assignments }) });
      if (savedResult.savedToDatabase !== true) throw new Error('The database did not confirm this save. Your changes were not reported as saved.');
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add('is-error');
      button.disabled = false;
      return;
    }
    const savedAccount = { ...savedResult, email: savedResult.email || email.value.trim().toLowerCase() };
    form.dataset.miuDirty = 'false';
    data.accounts = data.accounts.filter(account => account.email.toLowerCase() !== savedAccount.email.toLowerCase());
    data.accounts.push(savedAccount);
    data.accounts.sort((left, right) => left.email.localeCompare(right.email));
    search.value = savedAccount.email;
    roleFilter.value = '';
    searchStatus.textContent = `Saved roles confirmed in the database for ${savedAccount.email}.`;
    email.value = savedAccount.email;
    render();
    accounts.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    updateEmailRoleStatus();
    feedback.textContent = savedResult.message || 'Dashboard roles were saved and verified in the database.';
    button.disabled = false;
    try {
      const latest = await api();
      let confirmed = latest.accounts.find(account => account.email.toLowerCase() === savedAccount.email.toLowerCase());
      if (!confirmed) {
        const exact = await api({}, `?email=${encodeURIComponent(savedAccount.email)}`);
        confirmed = exact.account;
        if (confirmed) latest.accounts.push(confirmed);
      }
      if (!confirmed) throw new Error('The role was verified during save, but the refreshed account list did not return it.');
      latest.accounts.sort((left, right) => left.email.localeCompare(right.email));
      data = latest;
      render(); updateEmailRoleStatus();
      searchStatus.textContent = `Saved roles confirmed in the database for ${savedAccount.email}.`;
      feedback.textContent = savedResult.message || 'Dashboard roles were saved and verified in the database.';
    } catch {
      feedback.textContent = 'Dashboard roles were saved and verified in the database. The account list could not refresh; the saved roles are still shown above.';
    }
  });

  const startup = load().then(() => { feedback.textContent = ''; }).catch(error => { feedback.textContent = error.message; });
  window.siteStartup?.track(startup);
})();
