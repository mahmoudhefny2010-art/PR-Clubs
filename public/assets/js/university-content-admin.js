(() => {
  const panel = document.getElementById('universityPublisherPanel');
  const form = document.getElementById('universityPublisherForm');
  const type = document.getElementById('universityPostType');
  const registration = document.getElementById('universityRegistrationEnabled');
  const registrationField = document.getElementById('universityRegistrationField');
  const attendance = document.getElementById('universityAttendanceEnabled');
  const attendanceField = document.getElementById('universityAttendanceField');
  const status = document.getElementById('universityPublisherStatus');
  const list = document.getElementById('universityPublishedItems');
  const adminView = document.getElementById('adminView');
  if (!panel || !form || !adminView) return;

  const escapeHtml = window.MiuUI.escapeHtml;
  let loaded = false;
  let loading = false;

  function updateFields() {
    const isEvent = type.value === 'event';
    registrationField.hidden = !isEvent;
    attendanceField.hidden = !isEvent || registration.value !== 'true';
    if (attendanceField.hidden) attendance.value = 'false';
    for (const id of ['universityPostDate', 'universityPostTime', 'universityPostLocation']) {
      document.getElementById(id).closest('.field-group').hidden = !isEvent;
    }
  }

  function renderItems(items) {
    if (!items.length) {
      list.innerHTML = '<p class="admin-form-hint">No MIU events or announcements have been published yet.</p>';
      return;
    }
    list.innerHTML = `<div class="admin-section-heading"><h4>Published by MIU</h4><span class="admin-count">${items.length}</span></div>${items.map(item => {
      const registrationText = item.type === 'event' && item.registrationEnabled
        ? (item.attendanceEnabled === true ? 'Registration open · Attendance taken' : 'Registration open')
        : item.type === 'event' ? 'No registration' : 'Announcement';
      return `<article class="university-published-item"><strong>${escapeHtml(item.title || 'Untitled')}</strong><span>${escapeHtml(registrationText)}</span>${item.date ? `<small>${escapeHtml(item.date)}${item.location ? ` · ${escapeHtml(item.location)}` : ''}</small>` : ''}</article>`;
    }).join('')}`;
  }

  async function loadItems() {
    if (loading || !adminView.classList.contains('active')) return;
    loading = true;
    try {
      const response = await fetch('/api/admin/university-content', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json().catch(() => []);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          panel.hidden = true;
          return;
        }
        throw new Error(result.message || 'MIU content could not be loaded.');
      }
      panel.hidden = false;
      loaded = true;
      renderItems(Array.isArray(result) ? result : []);
    } catch (error) {
      panel.hidden = false;
      status.textContent = error.message || 'MIU content could not be loaded.';
    } finally {
      loading = false;
    }
  }

  type.addEventListener('change', updateFields);
  registration.addEventListener('change', updateFields);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.textContent = 'Publishing to the database…';
    try {
      const isEvent = type.value === 'event';
      const registrationEnabled = isEvent && registration.value === 'true';
      const response = await fetch('/api/admin/university-content', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type.value,
          title: document.getElementById('universityPostTitle').value.trim(),
          description: document.getElementById('universityPostDescription').value.trim(),
          date: isEvent ? document.getElementById('universityPostDate').value : '',
          time: isEvent ? document.getElementById('universityPostTime').value : '',
          location: isEvent ? document.getElementById('universityPostLocation').value.trim() : '',
          registrationEnabled,
          attendanceEnabled: registrationEnabled && attendance.value === 'true',
          imageChoice: 'default', interaction: 'none'
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'MIU content was not published.');
      form.reset();
      updateFields();
      status.textContent = 'Published and confirmed in the database.';
      await loadItems();
    } catch (error) {
      status.textContent = error.message || 'MIU content was not published.';
    } finally {
      submit.disabled = false;
    }
  });

  updateFields();
  const observer = new MutationObserver(() => {
    if (adminView.classList.contains('active') && !loaded) loadItems();
  });
  observer.observe(adminView, { attributes: true, attributeFilter: ['class'] });
  if (adminView.classList.contains('active')) loadItems();
})();
