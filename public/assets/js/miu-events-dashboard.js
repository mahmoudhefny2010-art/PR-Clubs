(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('universityPostForm');
  if (!form) return;
  const list = $('universityPostRecords'), listMessage = $('universityPostListMessage');
  const formMessage = $('universityPostMessage'), submit = $('publishUniversityPostBtn');
  const imageInput = $('universityPostImage'), preview = $('universityPostPreview');
  let previewUrl = '', loadVersion = 0;
  const escapeHtml = window.MiuUI.escapeHtml;
  function showMessage(node, message, error = false) { node.textContent = message; node.classList.toggle('error', error); }
  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    if (!response.ok) { let body = {}; try { body = await response.json(); } catch {} throw new Error(body.message || `Request failed (${response.status}).`); }
    return response.status === 204 ? null : response.json();
  }
  function updateFields() {
    const isEvent = $('universityPostType').value === 'event';
    $('universityEventFields').hidden = !isEvent;
    $('universityAudienceField').hidden = !isEvent;
    $('universityPostAudience').required = isEvent;
    const attendance = isEvent && $('universityPostRegistration').value === 'true';
    $('universityAttendanceField').hidden = !attendance;
    if (!attendance) $('universityPostAttendance').value = 'false';
    $('universityQuestionField').hidden = $('universityInteraction').value === 'none';
    $('universityQuestion').required = $('universityInteraction').value !== 'none';
    $('universityOptionsField').hidden = $('universityInteraction').value !== 'poll';
    $('universityOptions').required = $('universityInteraction').value === 'poll';
  }
  function render(posts) {
    $('miuEventsCount').textContent = String(posts.length);
    listMessage.textContent = posts.length ? `${posts.length} update${posts.length === 1 ? '' : 's'} published by MIU.` : 'No MIU posts published yet.';
    list.innerHTML = posts.map(post => `<article class="record"><div class="record-head"><div><h3 class="record-title">${escapeHtml(post.title)}</h3><p class="record-meta">${post.type === 'event' ? 'Event' : 'Announcement'}${post.date ? ` · ${escapeHtml(post.date)}` : ''}${post.time ? ` · ${escapeHtml(window.formatSiteTime?.(post.time) || post.time)}` : ''}${post.location ? ` · ${escapeHtml(post.location)}` : ''}</p>${post.type === 'event' ? `<p class="record-meta">${post.attendanceAudience === 'members' ? 'Current members of any MIU club' : 'All university students'}${post.registrationEnabled ? ` · ${post.attendanceEnabled ? 'Attendance will be recorded' : 'Attendance will not be recorded'}` : ''}</p>` : ''}</div><div class="record-actions"><button class="danger" type="button" data-delete-university-post="${Number(post.id)}">Delete</button></div></div><p>${escapeHtml(post.description)}</p></article>`).join('') || '<p class="empty">No university posts have been published.</p>';
    list.querySelectorAll('[data-delete-university-post]').forEach(button => button.addEventListener('click', async () => {
      if (!await (window.miuConfirmAction || window.confirm)('Remove this MIU post from the public website?')) return;
      button.disabled = true;
      try { await request(`/api/miu-events/content/${button.dataset.deleteUniversityPost}`, { method: 'DELETE' }); await loadPosts(); }
      catch (error) { showMessage(listMessage, error.message, true); button.disabled = false; }
    }));
  }
  async function loadPosts() {
    const version = ++loadVersion;
    showMessage(listMessage, 'Loading published posts…');
    try { const posts = await request('/api/miu-events/content', { cache: 'no-store', siteStartupNonBlocking: true }); if (version === loadVersion) render(Array.isArray(posts) ? posts : []); }
    catch (error) { if (version === loadVersion) { showMessage(listMessage, error.message, true); list.replaceChildren(); $('miuEventsCount').textContent = '—'; } }
  }
  let registrationLoadVersion = 0;
  async function loadRegistrations() {
    const message = $('miuRegistrationsMessage'), container = $('miuRegistrationsList');
    if (!message || !container) return;
    const version = ++registrationLoadVersion;
    showMessage(message, 'Loading event registrations…');
    try {
      const events = await request('/api/miu-events/registrations', { cache: 'no-store' });
      if (version !== registrationLoadVersion) return;
      const rows = Array.isArray(events) ? events : [];
      const total = rows.reduce((sum, event) => sum + (event.registrations?.length || 0), 0);
      showMessage(message, `${rows.length} event${rows.length === 1 ? '' : 's'} · ${total} registration${total === 1 ? '' : 's'}.`);
      container.innerHTML = rows.map(event => `<article class="record registration-event"><header class="record-head"><div><h3 class="record-title">${escapeHtml(event.title)}</h3><p class="record-meta">${[event.date, event.time ? (window.formatSiteTime?.(event.time) || event.time) : '', event.location].filter(Boolean).map(escapeHtml).join(' · ') || 'Date and location not set'}</p></div><strong>${event.registrations?.length || 0}</strong></header>${event.registrations?.length ? `<ul>${event.registrations.map(person => `<li><div><strong>${escapeHtml(person.name)}</strong><a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a></div><time>${person.registeredAt ? escapeHtml(window.formatSiteTime?.(person.registeredAt) || new Date(person.registeredAt).toLocaleString()) : ''}</time></li>`).join('')}</ul>` : '<p class="registration-empty">No one has registered yet.</p>'}</article>`).join('') || '<p class="empty">No MIU events currently allow registration.</p>';
    } catch (error) {
      if (version !== registrationLoadVersion) return;
      showMessage(message, error.message, true); container.replaceChildren();
    }
  }
  $('universityPostType').addEventListener('change', updateFields);
  $('universityPostRegistration').addEventListener('change', updateFields);
  $('universityInteraction').addEventListener('change', updateFields);
  $('refreshUniversityPostsBtn').addEventListener('click', loadPosts);
  $('refreshMiuRegistrationsBtn')?.addEventListener('click', loadRegistrations);
  document.addEventListener('dashboard:panel-change', event => { if (event.detail?.panelId === 'miuEventRegistrationsPanel') loadRegistrations(); });
  document.querySelectorAll('input[name="imageChoice"]').forEach(radio => radio.addEventListener('change', () => {
    const custom = form.elements.imageChoice.value === 'custom';
    $('universityImageField').hidden = !custom;
    if (!custom) { imageInput.value = ''; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; preview.src = '/assets/img/pics/logo.svg.png'; }
  }));
  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0]; if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { imageInput.value = ''; showMessage(formMessage, 'Choose a PNG, JPG, or WebP image up to 10 MB.', true); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(file); preview.src = previewUrl; showMessage(formMessage, '');
  });
  form.addEventListener('reset', () => setTimeout(() => { updateFields(); $('universityImageField').hidden = true; preview.src = '/assets/img/pics/logo.svg.png'; showMessage(formMessage, ''); }, 0));
  form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true; showMessage(formMessage, 'Publishing…');
    try {
      const isEvent = $('universityPostType').value === 'event', registrationEnabled = isEvent && $('universityPostRegistration').value === 'true';
      const imageChoice = form.elements.imageChoice.value, file = imageInput.files?.[0];
      if (imageChoice === 'custom' && !file) throw new Error('Choose an image to upload, or select the MIU logo.');
      const payload = { type: $('universityPostType').value, interaction: $('universityInteraction').value, question: $('universityQuestion').value.trim(), options: $('universityOptions').value.split('\n').map(x => x.trim()).filter(Boolean), title: $('universityPostTitle').value.trim(), description: $('universityPostDescription').value.trim(), date: $('universityPostDate').value, time: $('universityPostTime').value, location: $('universityPostLocation').value.trim(), registrationEnabled, attendanceEnabled: registrationEnabled && $('universityPostAttendance').value === 'true', attendanceAudience: $('universityPostAudience').value, imageChoice };
      if (imageChoice === 'custom') { if (typeof window.uploadImageToCloudinary !== 'function') throw new Error('Image upload is not available right now.'); const uploaded = await window.uploadImageToCloudinary(file, 'university'); payload.imageUrl = uploaded.url; payload.imagePublicId = uploaded.publicId; }
      await request('/api/miu-events/content', { method: 'POST', body: JSON.stringify(payload) });
      form.reset(); form.dataset.miuDirty = 'false'; updateFields(); $('universityImageField').hidden = true; preview.src = '/assets/img/pics/logo.svg.png'; showMessage(formMessage, 'Published. The update is now visible on the public website.'); await loadPosts();
    } catch (error) { showMessage(formMessage, error.message, true); }
    finally { submit.disabled = false; }
  });
  updateFields();
  if (window.siteStartup?.afterStartup) window.siteStartup.afterStartup(loadPosts);
  else window.setTimeout(loadPosts, 0);
})();
