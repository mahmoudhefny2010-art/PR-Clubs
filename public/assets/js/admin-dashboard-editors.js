(() => {
  const root = () => document.getElementById('toolContent');
  const field = (escape, name, label, value = '', type = 'text', required = true, extra = '') => `<label>${label}<input name="${name}" type="${type}" value="${escape(value)}" ${required ? 'required' : ''} ${extra}></label>`;
  window.renderAdminClubEditor = async ({ data, request, read, escape, list, record, saveForm }) => {
    const selected = new URLSearchParams(location.search).get('club');
    if (!selected) {
      const rank = club => ({ open: 0, 'opening-soon': 1, full: 2, closed: 3 }[club.status] ?? 3);
      const pinned = club => club.status === 'open' && club.pinned === true;
      const sameGroup = (a, b) => b && rank(a) === rank(b) && pinned(a) === pinned(b);
      let ordered = [...data].sort((a, b) => rank(a) - rank(b) || Number(pinned(b)) - Number(pinned(a)) || (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
      let busy = false;
      const render = () => {
        root().innerHTML = '<a class="v2-action" href="/admin/clubs?club=new">Add club</a><p class="v2-panel-note">Use the arrows to change the home page order. Changes save automatically within each registration and pin group.</p><div id="clubManagementList">' + list(ordered.map((club, index) => record(club.name,
          `${club.category || 'Club'} · ${club.status || 'closed'}${pinned(club) ? ' · Pinned' : ''}`,
          [-1, 1].map(direction => `<button type="button" class="v2-club-order-button" data-move-club="${escape(club.id)}" data-direction="${direction}" aria-label="Move ${escape(club.name)} ${direction < 0 ? 'up' : 'down'}" title="Move ${direction < 0 ? 'up' : 'down'}" ${busy || !sameGroup(club, ordered[index + direction]) ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${direction < 0 ? 'M12 20V4m-7 7 7-7 7 7' : 'M12 4v16m-7-7 7 7 7-7'}"/></svg></button>`).join('') +
          `<a href="/admin/clubs?club=${encodeURIComponent(club.id)}">Edit club</a><button type="button" data-archive-club="${escape(club.id)}" ${busy ? 'disabled' : ''}>Archive</button>`))) + '</div>';
      };
      render();
      root().onclick = async event => {
        const button = event.target.closest('[data-move-club], [data-archive-club]');
        if (!button || busy || button.disabled) return;
        const feedback = document.getElementById('toolFeedback');
        if (button.hasAttribute('data-move-club')) {
          const index = ordered.findIndex(club => String(club.id) === button.dataset.moveClub);
          const target = index + Number(button.dataset.direction);
          if (index < 0 || !sameGroup(ordered[index], ordered[target])) return;
          const next = [...ordered];
          [next[index], next[target]] = [next[target], next[index]];
          busy = true; root().dataset.v2Saving = 'true'; render(); feedback.textContent = 'Saving home page order…';
          try {
            const saved = await request('/api/admin/clubs/order', { method: 'PUT', body: JSON.stringify({ ids: next.map(club => club.id) }) });
            const savedById = new Map((Array.isArray(saved) ? saved : []).map(club => [String(club.id), club]));
            ordered = next.map((club, position) => ({ ...club, ...savedById.get(String(club.id)), sortOrder: position + 1 }));
            feedback.classList.remove('is-error');
            feedback.textContent = 'Home page order saved.';
          } catch (error) { feedback.textContent = error.message; feedback.classList.add('is-error'); }
          finally {
            busy = false; delete root().dataset.v2Saving; render();
            [...root().querySelectorAll('[data-move-club]')].find(candidate => candidate.dataset.moveClub === button.dataset.moveClub && candidate.dataset.direction === button.dataset.direction && !candidate.disabled)?.focus();
          }
          return;
        }
        if (!await window.miuConfirmAction('Archive this club? It will leave the active website and can be restored from Archived clubs.')) return;
        busy = true; render();
        try {
          await request(`/api/admin/clubs/${encodeURIComponent(button.dataset.archiveClub)}/archive`, { method: 'POST', body: '{}' });
          ordered = ordered.filter(club => String(club.id) !== button.dataset.archiveClub);
          feedback.textContent = 'Club archived.';
        } catch (error) { feedback.textContent = error.message; }
        finally { busy = false; render(); }
      };
      return;
    }
    let current = data.find(club => String(club.id) === selected);
    if (selected !== 'new' && !current) throw new Error('Club not found. Return to the club list and choose an active club.');
    if (current) current = { ...current, ...await read(`/api/admin/dashboard-clubs/${encodeURIComponent(current.id)}`) };
    const club = current || {};
    root().innerHTML = `<form id="clubEditorForm" class="v2-form v2-editor-grid">
      ${field(escape, 'name', 'Club name', club.name, 'text', true, 'maxlength="80"')}
      ${field(escape, 'committee', 'Main committee', club.committee, 'text', true, 'maxlength="100"')}
      ${field(escape, 'category', 'Category', club.category, 'text', true, 'maxlength="80"')}
      ${field(escape, 'tagline', 'Tagline', club.tagline, 'text', true, 'maxlength="140"')}
      <label>Registration status<select name="status">${['open', 'opening-soon', 'full', 'closed'].map(status => `<option value="${status}" ${status === club.status ? 'selected' : ''}>${escape(status)}</option>`).join('')}</select></label>
      <label>Image display<select name="imageFit"><option value="contain">Fit full image</option><option value="cover" ${club.imageFit === 'cover' ? 'selected' : ''}>Fill image area</option></select></label>
      ${field(escape, 'seats', 'Available seats', club.seats || 0, 'number', true, 'min="0" step="1"')}
      ${field(escape, 'members', 'Member count', club.members || 0, 'number', true, 'min="0" step="1"')}
      ${field(escape, 'applicants', 'Applicant count', club.applicants || 0, 'number', true, 'min="0" step="1"')}
      <label class="v2-checkbox"><input type="checkbox" name="pinned" ${club.pinned ? 'checked' : ''}>Pin club when registration is open</label>
      <label class="v2-wide">Description<textarea name="description" required maxlength="1200">${escape(club.description)}</textarea></label>
      <label class="v2-wide">Requirements<textarea name="requirements" required maxlength="600">${escape(club.requirements)}</textarea></label>
      ${field(escape, 'applicationIntro', 'Application introduction', club.applicationIntro, 'text', false, 'maxlength="240"')}
      <label>Club image${club.image ? `<img class="v2-club-preview" src="${escape(club.image)}" alt="Current club image">` : ''}<input name="photo" type="file" accept="image/png,image/jpeg,image/webp" ${current ? '' : 'required'}><small>${current ? 'Leave empty to keep the current image.' : 'Upload the club image.'}</small></label>
      ${current ? '' : `<fieldset id="clubInitialAccount" class="v2-wide v2-editor-grid"><legend>Club login</legend>${field(escape, 'clubLoginEmail', 'Club login email', '', 'email')}${field(escape, 'clubInitialPassword', 'Initial password', '', 'password', true, 'minlength="12" maxlength="200" autocomplete="new-password"')}</fieldset>`}
      <button class="v2-action v2-wide" type="submit">Save club</button></form>`;
    document.getElementById('clubEditorForm').addEventListener('submit', event => saveForm(event, async form => {
      const payload = { ...current, ...Object.fromEntries(new FormData(form)), pinned: form.elements.pinned.checked };
      delete payload.photo;
      delete payload.imagePublicId; delete payload.imageUrl;
      const image = form.elements.photo.files[0];
      if (image) { const uploaded = await window.uploadImageToCloudinary(image, 'club'); payload.imageUrl = uploaded.url; payload.imagePublicId = uploaded.publicId; }
      const saved = await request(current ? `/api/admin/clubs/${current.id}` : '/api/admin/clubs', { method: current ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      current = saved.club || saved;
      const url = new URL(location.href); url.searchParams.set('club', current.id); history.replaceState(history.state, '', url);
      document.getElementById('clubInitialAccount')?.remove(); form.elements.photo.value = ''; form.elements.photo.required = false;
      return 'Club saved.';
    }));
  };
  window.renderAdminHeadEditor = async ({ data, request, read, escape, list, record, saveForm }) => {
    const selected = new URLSearchParams(location.search).get('email');
    const clubs = await read('/api/clubs?media=links');
    if (!selected) {
      root().innerHTML = '<a class="v2-action" href="/admin/heads?email=new">Add committee head</a>' + list(data.map(head => record(head.email, `${head.clubName} · ${head.committee}`,
        `<a href="/admin/heads?email=${encodeURIComponent(head.email)}">Edit account</a><button type="button" data-delete-head="${escape(head.email)}">Remove head</button>`)));
      root().querySelectorAll('[data-delete-head]').forEach(button => button.addEventListener('click', async () => {
        if (!await window.miuConfirmAction('Remove this committee head account and its dashboard access?')) return;
        button.disabled = true;
        try { await request('/api/admin/club-heads/' + encodeURIComponent(button.dataset.deleteHead), { method: 'DELETE' }); button.closest('.v2-record').remove(); }
        catch (error) { document.getElementById('toolFeedback').textContent = error.message; }
        finally { button.disabled = false; }
      }));
      return;
    }
    let current = data.find(head => head.email === selected);
    if (selected !== 'new' && !current) throw new Error('Committee head not found.');
    root().innerHTML = `<form id="headEditorForm" class="v2-form">
      <label>Club<select name="clubId" required ${current ? 'disabled' : ''}>${clubs.map(club => `<option value="${escape(club.id)}" ${club.id === current?.clubId ? 'selected' : ''}>${escape(club.name)}</option>`).join('')}</select></label>
      ${field(escape, 'email', 'Head email', current?.email, 'email', true, 'maxlength="254"')}
      ${field(escape, 'committee', 'Committee', current?.committee, 'text', true, 'maxlength="100"')}
      ${field(escape, 'password', current ? 'New password (leave empty to keep existing)' : 'Initial password', '', 'password', !current, 'minlength="12" maxlength="200" autocomplete="new-password"')}
      <button class="v2-action" type="submit">Save head account</button></form>`;
    document.getElementById('headEditorForm').addEventListener('submit', event => saveForm(event, async form => {
      const payload = Object.fromEntries(new FormData(form));
      await request(current ? '/api/admin/club-heads/' + encodeURIComponent(current.email) : '/api/admin/club-heads', { method: current ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      current = { email: payload.email, committee: payload.committee };
      const url = new URL(location.href); url.searchParams.set('email', payload.email); history.replaceState(history.state, '', url);
      form.elements.password.value = ''; form.elements.password.required = false;
      form.elements.clubId.disabled = true;
      return 'Head account saved.';
    }));
  };
})();
