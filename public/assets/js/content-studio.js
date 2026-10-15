// Shared logic for the dedicated content module forms (Event, Feed, Sponsor, Booth).
// Each module page assigns its own content type automatically — the user never picks a type.
const ContentStudio = (() => {
  const reviewerNames = { pr: 'PR Department', english: 'English Department', security: 'Security Office', dean: 'Dean' };
  const typeLabels = { event: 'Event', feed: 'Feed', sponsor: 'Sponsor', booth: 'Booth', entry_permit: 'Entry Permit' };

  function escapeHtml(value) { return window.MiuUI.escapeHtml(value); }

  function getActiveReviewComment(item) {
    if (item.status !== 'changes_requested') return null;
    const role = item.editRequestedBy || 'english';
    const history = Array.isArray(item.commentHistory) ? item.commentHistory.filter((entry) => entry.role === role) : [];
    if (history.length) {
      const latest = [...history].reverse().find((entry) => !entry.deletedAt);
      return latest?.text ? { role, text: latest.text } : null;
    }
    if (item.hiddenCommentRoles?.includes(role)) return null;
    const text = String(item.comments?.[role] || '').split('\n').filter(Boolean).at(-1) || '';
    return text ? { role, text } : null;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function contentMeta(item) {
    if (item.type === 'sponsor') {
      return [item.sponsorCompany, item.sponsorType, item.sponsorAmount].filter(Boolean).join(' · ');
    }
    if (item.type === 'booth') {
      return [item.boothLocation, item.boothSize, item.boothOpenDate].filter(Boolean).join(' · ');
    }
    if (item.type === 'feed') {
      return [item.date, window.formatSiteTime(item.time)].filter(Boolean).join(' · ');
    }
    return [item.date, window.formatSiteTime(item.time), item.location].filter(Boolean).join(' · ');
  }

  function contentImage(item) {
    if (item.type === 'sponsor') return item.sponsorLogo || '';
    return item.image || '';
  }

  function renderPermitItems(item) {
    if (item.type !== 'entry_permit' || !Array.isArray(item.permitItems) || !item.permitItems.length) return '';
    return `<div class="entry-permit-table-wrap content-card-permit-items"><table class="entry-permit-table"><thead><tr><th>Qty</th><th>Number / ID</th><th>Details</th></tr></thead><tbody>${item.permitItems.map((row) => `<tr><td data-label="Quantity">${escapeHtml(row.quantity)}</td><td data-label="Number / ID">${escapeHtml(row.number)}</td><td data-label="Details">${escapeHtml(row.details)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  let accountRole = '';
  let committeeHeads = [];

  function renderCard(item) {
    const activeComment = getActiveReviewComment(item);
    const image = contentImage(item);
    const label = typeLabels[item.type] || item.type;
    return `
    <article class="content-card">
      ${image
        ? window.FeedMedia.render(image, item.title, 'content-card-media')
        : `<div class="content-card-type" aria-hidden="true">${escapeHtml(label)}</div>`}
      <div class="content-card-body">
        <strong>${escapeHtml(item.title)}</strong>
        <div class="meta"><span class="type-badge type-${escapeHtml(item.type)}">${escapeHtml(label)}</span>${escapeHtml(contentMeta(item)) || 'no details'}</div>
        ${renderPermitItems(item)}
        <div><span class="status-badge status-${escapeHtml(item.status)}" title="Request status">${escapeHtml(item.status.replaceAll('_', ' '))}</span></div>
        ${item.clubNotice ? `<div class="content-review-update" role="status"><strong>Review update:</strong> ${escapeHtml(item.clubNotice)}</div>` : ''}
        ${activeComment ? `<section class="review-comments" style="margin-top:10px"><strong>Active comment</strong><p class="meta" style="margin:5px 0;white-space:pre-wrap"><strong>${reviewerNames[activeComment.role]}:</strong> ${escapeHtml(activeComment.text)}</p></section>` : ''}
        <div class="content-task-actions">
          ${accountRole === 'head'
            ? `<a class="mini-btn" href="/pages/${escapeHtml(item.type.replace('_', '-'))}-form.html?edit=${Number(item.id)}">Open assigned task</a>`
            : `${['draft', 'changes_requested', 'rejected'].includes(item.status) ? `<button class="mini-btn" data-edit="${item.id}">Edit</button><button class="mini-btn" data-submit="${item.id}">Submit</button>` : ''}
              ${item.status !== 'deleted' ? `<button class="mini-btn" data-delete="${item.id}">Delete</button>` : ''}
              ${item.type !== 'entry_permit' ? `<label class="content-task-assignment">Assigned head <select data-assign-content="${Number(item.id)}" data-saved-value="${escapeHtml(item.assignedHeadEmail || '')}" ${['draft', 'changes_requested', 'rejected'].includes(item.status) ? '' : 'disabled'}><option value="">Not assigned</option>${committeeHeads.map((head) => `<option value="${escapeHtml(head.email)}" ${head.email === item.assignedHeadEmail ? 'selected' : ''}>${escapeHtml(head.committee)} · ${escapeHtml(head.email)}</option>`).join('')}</select></label>` : ''}`}
        </div>
      </div>
    </article>`;
  }

  function init(config) {
    const {
      type = null,
      pageTitle = 'Content Studio',
      formTitle = 'New content',
      collect = null,
      fill = null,
      resetExtras = null,
      onSave = null
    } = config;

    document.querySelectorAll('[data-history-back]').forEach((link) => {
      link.addEventListener('click', (event) => {
        let sameSiteReferrer = false;
        try { sameSiteReferrer = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin; } catch (_) { /* Keep the safe home-page fallback. */ }
        if (sameSiteReferrer && window.history.length > 1) {
          event.preventDefault();
          window.history.back();
        }
      });
    });

    const sessionMessage = document.getElementById('sessionMessage');
    const contentLayout = document.getElementById('contentLayout');
    const contentList = document.getElementById('contentList');
    const formFeedback = document.getElementById('formFeedback');
    const contentForm = document.getElementById('contentForm');
    const contentFormPanel = contentForm?.closest('.panel');
    let editingId = null;
    let assignedHeadSelect = null;

    function renderHeadAssignment(item = null) {
      if (!contentForm || accountRole !== 'president' || type === 'entry_permit') return;
      if (assignedHeadSelect) {
        if (item) assignedHeadSelect.value = item.assignedHeadEmail || '';
        return;
      }
      const actions = contentForm.querySelector('#submitReviewBtn')?.parentElement;
      if (!actions) return;
      const field = document.createElement('label');
      field.className = 'content-form-assignment';
      field.htmlFor = 'assignedHeadInput';
      field.textContent = 'Assigned committee head (optional)';
      assignedHeadSelect = document.createElement('select');
      assignedHeadSelect.id = 'assignedHeadInput';
      assignedHeadSelect.innerHTML = `<option value="">No committee head selected</option>${committeeHeads.map((head) => `<option value="${escapeHtml(head.email)}">${escapeHtml(head.committee)} · ${escapeHtml(head.email)}</option>`).join('')}`;
      field.append(assignedHeadSelect);
      field.title = committeeHeads.length ? '' : 'Add a committee head to your club before assigning a request.';
      actions.before(field);
      if (item) assignedHeadSelect.value = item.assignedHeadEmail || '';
    }

    if (new URLSearchParams(window.location.search).get('embed') === '1') document.body.classList.add('embed');

    async function ensureSession() {
      try {
        const res = await fetch('/api/club-auth/session');
        const data = await res.json();
        if (!data.authenticated || !data.club) {
          sessionMessage.textContent = 'Please log in as a club president or head to manage content.';
          return false;
        }
        if (!['president', 'head'].includes(data.club.role)) {
          sessionMessage.textContent = 'This account is for a committee dashboard. Open the right dashboard instead.';
          return false;
        }
        if (type === 'entry_permit' && data.club.role !== 'president') {
          sessionMessage.textContent = 'Only the club president can create or manage Entry Permits.';
          return false;
        }
        if (data.club.role === 'head' && data.club.hasAssignedContent !== true) {
          sessionMessage.textContent = 'There are no content tasks assigned to you.';
          return false;
        }
        document.getElementById('studioTitle').textContent = `${data.club.name} — ${pageTitle}`;
        accountRole = data.club.role;
        if (accountRole === 'head') {
          document.querySelector('.module-cards')?.closest('.panel')?.classList.add('hidden');
          document.querySelector('.module-nav')?.classList.add('hidden');
          if (contentFormPanel) contentFormPanel.classList.add('hidden');
          document.getElementById('studioTitle').textContent = `${data.club.name} · Assigned content`;
          if (type === null) {
            const assignedHeading = contentList?.closest('.panel')?.querySelector('h2');
            if (assignedHeading) assignedHeading.textContent = 'Assigned tasks';
          }
        } else {
          const headsResponse = await fetch('/api/club/heads');
          if (headsResponse.ok) committeeHeads = await headsResponse.json();
          renderHeadAssignment();
        }
        contentLayout.hidden = false;
        return true;
      } catch {
        sessionMessage.textContent = 'Could not check your session.';
        return false;
      }
    }

    async function loadContent() {
      try {
        const res = await fetch('/api/club/content');
        const items = await res.json();
        if (!res.ok) throw new Error(items.message || 'Could not load');
        const visible = type ? items.filter((item) => item.type === type) : items;
        contentList.innerHTML = visible.map(renderCard).join('') || `<p>${accountRole === 'head' ? 'No content tasks have been assigned to you.' : 'No content yet.'}</p>`;
        contentList.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => startEdit(Number(btn.dataset.edit))));
        contentList.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', () => deleteContent(Number(btn.dataset.delete))));
        contentList.querySelectorAll('[data-submit]').forEach((btn) => btn.addEventListener('click', () => submitExisting(Number(btn.dataset.submit))));
        contentList.querySelectorAll('[data-assign-content]').forEach((select) => select.addEventListener('change', () => assignContent(Number(select.dataset.assignContent), select)));
      } catch (error) {
        contentList.textContent = error.message;
      }
    }

    async function startEdit(id) {
      try {
        const res = await fetch('/api/club/content');
        const items = await res.json();
        if (!res.ok) throw new Error(items.message || 'Could not load this content.');
        const item = items.find((entry) => entry.id === id);
        if (!item || (type && item.type !== type)) throw new Error('This content could not be found.');
        editingId = id;
        renderHeadAssignment(item);
        if (accountRole === 'head' && contentFormPanel) contentFormPanel.classList.remove('hidden');
        document.getElementById('formTitle').textContent = `Edit ${typeLabels[item.type] || 'content'}`;
        if (fill) fill(item);
        if (contentForm) contentForm.querySelectorAll('[data-image-reset]').forEach((input) => { input.value = ''; });
        formFeedback.textContent = '';
      } catch (error) {
        formFeedback.textContent = error.message;
      }
    }

    async function assignContent(id, select) {
      select.disabled = true;
      try {
        const response = await fetch(`/api/club/content/${id}/assignment`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: select.value })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Could not assign this task.');
        select.dataset.savedValue = select.value;
      } catch (error) {
        window.alert(error.message);
        select.value = select.dataset.savedValue || '';
      } finally {
        select.disabled = false;
      }
    }

    async function deleteContent(id) {
      if (!confirm('Delete this content?')) return;
      formFeedback.textContent = '';
      try {
        const response = await fetch(`/api/club/content/${id}`, { method: 'DELETE' });
        const result = response.status === 204 ? {} : await response.json();
        if (!response.ok) throw new Error(result.message || 'Could not delete this content.');
        formFeedback.textContent = 'Deleted successfully.';
        await loadContent();
      } catch (error) {
        formFeedback.textContent = error.message;
      }
    }

    async function submitExisting(id) {
      formFeedback.textContent = '';
      try {
        const res = await fetch('/api/club/content');
        const items = await res.json();
        if (!res.ok) throw new Error(items.message || 'Could not load this content.');
        const item = items.find((entry) => entry.id === id);
        if (!item) throw new Error('This content could not be found.');
        const response = await fetch(`/api/club/content/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...item, submit: true })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Could not submit for review.');
        formFeedback.textContent = 'Submitted for review.';
        await loadContent();
      } catch (error) {
        formFeedback.textContent = error.message;
      }
    }

    function resetForm() {
      editingId = null;
      document.getElementById('formTitle').textContent = formTitle;
      if (contentForm) contentForm.reset();
      if (assignedHeadSelect) assignedHeadSelect.value = '';
      if (resetExtras) resetExtras();
      if (accountRole === 'head' && contentFormPanel) contentFormPanel.classList.add('hidden');
      formFeedback.textContent = '';
    }

    let saving = false;
    async function saveContent(submit) {
      if (saving) return;
      saving = true;
      const controls = [...contentForm.querySelectorAll('button')];
      controls.forEach(button => { button.disabled = true; });
      try { await performSaveContent(submit); }
      finally { saving = false; controls.forEach(button => { button.disabled = false; }); }
    }
    async function performSaveContent(submit) {
      formFeedback.textContent = '';
      if (window.validateDataEntryForm && !window.validateDataEntryForm(contentForm)) return;
      let payload;
      try { payload = { ...(collect ? await collect() : {}), submit }; }
      catch (error) { formFeedback.textContent = error.message || 'Could not upload this media. Try again.'; return; }
      if (assignedHeadSelect) payload.assignedHeadEmail = assignedHeadSelect.value;
      if (submit && type === 'event' && !['members', 'all_students'].includes(payload.attendanceAudience)) {
        formFeedback.textContent = 'Choose whether this event is for club members or all university students.';
        document.getElementById('eventAudienceInput')?.focus();
        return;
      }
      if (submit && (type === 'event' || type === 'feed') && !String(payload.image || '').trim()) {
        formFeedback.textContent = type === 'feed' ? 'Add an image or video before submitting this post for review.' : 'Add an image before submitting this content for review.';
        document.getElementById('imageInput')?.focus();
        return;
      }
      if (submit && type === 'sponsor' && !String(payload.sponsorLogo || '').trim()) {
        formFeedback.textContent = 'Add the company logo before submitting this sponsor for review.';
        document.getElementById('sponsorLogoInput')?.focus();
        return;
      }
      const url = editingId ? `/api/club/content/${editingId}` : `/api/club/content/${type}`;
      const method = editingId ? 'PUT' : 'POST';
      try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || 'Save failed');
        formFeedback.textContent = !submit
          ? 'Saved as draft.'
          : result.status === 'pending_supervisor'
            ? 'Submitted to your club supervisor for approval.'
          : result.status === 'pending_english'
            ? 'Resubmitted to English Department.'
            : result.status === 'pending_security'
              ? 'Resubmitted to Security Office.'
              : result.status === 'pending_dean'
                ? 'Resubmitted to the Dean.'
            : result.status === 'pending_pr'
              ? 'Submitted to PR Department.'
              : 'Submitted for review.';
        resetForm();
        if (accountRole === 'head' && submit) {
          window.location.assign('/pages/club-content.html');
          return;
        }
        await loadContent();
        if (onSave) onSave(result);
      } catch (error) {
        formFeedback.textContent = error.message;
      }
    }

    if (contentForm) {
      contentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await saveContent(false);
      });
    }
    const submitReviewBtn = document.getElementById('submitReviewBtn');
    if (submitReviewBtn) submitReviewBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await saveContent(true);
    });
    const resetFormBtn = document.getElementById('resetFormBtn');
    if (resetFormBtn) resetFormBtn.addEventListener('click', resetForm);
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      await fetch('/api/club-auth/logout', { method: 'POST' });
      window.location.href = '/';
    });

    (async () => {
      if (!await ensureSession()) return;
      await loadContent();
      const requestedEditId = Number(new URLSearchParams(window.location.search).get('edit'));
      if (accountRole === 'head' && requestedEditId > 0) await startEdit(requestedEditId);
    })();

    return {
      loadContent,
      resetForm,
      get editingId() { return editingId; }
    };
  }

  return { init, escapeHtml, fileToDataUrl, typeLabels };
})();
