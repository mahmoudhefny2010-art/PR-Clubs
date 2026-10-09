(() => {
  const dialog = document.getElementById('adminDataStatusDialog');
  const openButton = document.getElementById('openAdminDataStatusBtn');
  const closeButton = document.getElementById('closeAdminDataStatusBtn');
  const refreshButton = document.getElementById('refreshAdminDataStatusBtn');
  const message = document.getElementById('adminDataStatusMessage');
  const database = document.getElementById('adminDataStatusDatabase');
  const sections = document.getElementById('adminDataStatusSections');
  if (!dialog || !openButton || !closeButton || !refreshButton || !message || !database || !sections) return;

  function setMessage(text, state = '') {
    message.textContent = text;
    message.dataset.state = state;
  }

  function makeSectionCard(section) {
    const card = document.createElement('article');
    card.className = 'admin-data-status-card';
    const heading = document.createElement('div');
    heading.className = 'admin-data-status-card-heading';
    const title = document.createElement('h3');
    title.textContent = section.title;
    const count = document.createElement('strong');
    count.textContent = Number(section.count || 0).toLocaleString();
    heading.append(title, count);
    const detail = document.createElement('p');
    detail.textContent = section.detail || '';
    const methods = document.createElement('small');
    methods.textContent = `Data methods: ${section.methods || 'Database records'}`;
    card.append(heading, detail, methods);
    return card;
  }

  async function refreshReport() {
    refreshButton.disabled = true;
    database.hidden = true;
    sections.replaceChildren();
    setMessage('Checking live database records…', 'loading');
    try {
      const response = await fetch('/api/admin/system/data-status', { cache: 'no-store', credentials: 'same-origin' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `Data check failed (${response.status}).`);

      const checkedAt = new Date(result.checkedAt);
      database.textContent = `MongoDB connected · checked ${checkedAt.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short', hour12: true })}`;
      database.hidden = false;
      (Array.isArray(result.sections) ? result.sections : []).forEach((section) => sections.append(makeSectionCard(section)));
      setMessage('All listed totals were read from the live database.', 'success');
    } catch (error) {
      setMessage(error.message || 'Could not check the site data.', 'error');
      const failure = document.createElement('p');
      failure.className = 'admin-data-status-failure';
      failure.textContent = 'The database report is unavailable. Refresh after the connection or administrator session is restored.';
      sections.append(failure);
    } finally {
      refreshButton.disabled = false;
    }
  }

  openButton.addEventListener('click', () => {
    dialog.showModal();
    refreshReport();
  });
  closeButton.addEventListener('click', () => dialog.close());
  refreshButton.addEventListener('click', refreshReport);
})();
