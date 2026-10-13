(() => {
  const form = document.getElementById('supervisorAdminForm');
  const feedback = document.getElementById('supervisorAdminFeedback');
  const accounts = document.getElementById('supervisorAccounts');
  const email = document.getElementById('supervisorEmail');
  const password = document.getElementById('supervisorPassword');
  const confirmPassword = document.getElementById('supervisorConfirmPassword');
  const assignments = document.getElementById('supervisorAssignments');
  let data;
  function updatePasswordField() {
    const value = email.value.trim().toLowerCase();
    const existing = data?.accounts.some(account => account.email === value);
    password.disabled = false;
    password.required = !existing && !/^[^\s@]+@miuegypt\.edu\.eg$/i.test(value);
    password.placeholder = existing ? 'Enter a new password to replace the old one' : 'At least 12 characters, or leave empty for MIU Google';
    confirmPassword.required = Boolean(password.value);
  }
  async function api(options) {
    const response = await fetch('/api/admin/supervisors', { credentials: 'same-origin', cache: 'no-store', ...options });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Supervisor management is unavailable.');
    return result;
  }
  function choose(account) {
    email.value = account.email; password.value = ''; confirmPassword.value = ''; password.required = false;
    updatePasswordField();
    assignments.querySelectorAll('input').forEach(input => { input.checked = account.assignedClubIds.includes(Number(input.value)); });
    form.scrollIntoView({ block: 'start', behavior: 'auto' });
    email.focus({ preventScroll: true });
  }
  async function load() {
    try {
      data = await api();
      assignments.querySelectorAll('label').forEach(label => label.remove());
      data.clubs.forEach(club => {
        const label = document.createElement('label'); label.className = 'supervisor-assignment';
        const input = document.createElement('input'); input.type = 'checkbox'; input.value = club.id;
        label.append(input, document.createTextNode(club.name)); assignments.append(label);
      });
      accounts.replaceChildren();
      const clubAssignments = document.getElementById('supervisorClubAssignments');
      clubAssignments.replaceChildren();
      data.clubs.forEach(club => {
        const owners = data.accounts.filter(account => account.assignedClubIds.includes(club.id));
        const card = document.createElement('article'); card.className = 'supervisor-record';
        const title = document.createElement('h3'); title.textContent = club.name;
        const status = document.createElement('p'); status.textContent = owners.length
          ? owners.map(account => account.email).join(', ') : 'No supervisor assigned — new requests will wait for assignment.';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-btn';
        button.textContent = owners.length ? 'Edit supervisor' : 'Add club supervisor';
        button.onclick = () => {
          if (owners.length) choose(owners[0]);
          else {
            form.reset(); updatePasswordField();
            assignments.querySelectorAll('input').forEach(input => { input.checked = Number(input.value) === club.id; });
            form.scrollIntoView({ block: 'start', behavior: 'auto' });
            email.focus({ preventScroll: true });
          }
        };
        card.append(title, status, button); clubAssignments.append(card);
      });
      data.accounts.forEach(account => {
        const card = document.createElement('article'); card.className = 'supervisor-record';
        const title = document.createElement('h3'); title.textContent = account.email;
        const description = document.createElement('p'); description.textContent = account.assignedClubIds.map(id => data.clubs.find(club => club.id === id)?.name || `Club #${id}`).join(', ') || 'No assigned clubs';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-btn'; button.textContent = 'Edit assignments'; button.onclick = () => choose(account);
        const actions = document.createElement('div'); actions.className = 'supervisor-account-actions';
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-btn'; remove.textContent = 'Delete';
        remove.onclick = async () => {
          if (!window.confirm(`Delete supervisor account ${account.email}? This removes its dashboard access. Previous review history will be kept.`)) return;
          remove.disabled = true; button.disabled = true; feedback.textContent = 'Deleting supervisor account…';
          try {
            const result = await api({ method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email }) });
            if (result.savedToDatabase !== true || result.deleted !== true) throw new Error('The database did not confirm removing this supervisor role.');
            if (email.value.trim().toLowerCase() === account.email) { form.reset(); updatePasswordField(); }
            feedback.textContent = result.accountDeleted
              ? 'Supervisor account deleted from the database. Previous review history has been kept.'
              : 'Supervisor access was removed from this account. Its other dashboard roles remain active.';
            if (!await load()) feedback.textContent += ' The change is saved, but the list could not refresh. Reload to see it.';
          } catch (error) { feedback.textContent = error.message; }
          finally { remove.disabled = false; button.disabled = false; }
        };
        actions.append(button, remove); card.append(title, description, actions); accounts.append(card);
      });
      if (!data.accounts.length) accounts.textContent = 'No supervisors have been created.';
      form.hidden = false; feedback.textContent = '';
      return true;
    } catch (error) { feedback.textContent = error.message; return false; }
  }
  email.addEventListener('input', updatePasswordField);
  password.addEventListener('input', updatePasswordField);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (password.value !== confirmPassword.value) {
      feedback.textContent = 'The passwords do not match.'; confirmPassword.focus(); return;
    }
    const selectedClubIds = [...assignments.querySelectorAll('input:checked')].map(input => Number(input.value));
    if (!selectedClubIds.length) {
      feedback.textContent = 'Select at least one club for this supervisor.';
      assignments.querySelector('input')?.focus();
      return;
    }
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    feedback.textContent = 'Saving supervisor…';
    try {
      const result = await api({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        email: email.value, password: password.value, confirmPassword: confirmPassword.value,
        assignedClubIds: selectedClubIds
      }) });
      if (result.savedToDatabase !== true) throw new Error('The database did not confirm this save. Your changes were not reported as saved.');
      form.reset(); updatePasswordField(); feedback.textContent = result.message || 'Supervisor assignments were saved and verified in the database.';
      if (!await load()) feedback.textContent = 'Assignments were saved and verified in the database, but the account list could not refresh. Reload to see the latest list.';
      else feedback.textContent = result.message || 'Supervisor assignments were saved and verified in the database.';
    } catch (error) { feedback.textContent = error.message; }
    finally { password.value = ''; confirmPassword.value = ''; updatePasswordField(); button.disabled = false; }
  });
  window.siteStartup?.track(load());
})();
