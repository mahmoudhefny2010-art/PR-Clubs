(() => {
  const message = document.getElementById('speakerPageMessage');
  const content = document.getElementById('speakerContent');
  const form = document.getElementById('speakerRequestForm');
  const formMessage = document.getElementById('speakerFormMessage');
  const submitButton = document.getElementById('speakerSubmit');
  const cancelButton = document.getElementById('speakerCancelEdit');
  const list = document.getElementById('speakerRequestsList');
  const hostingHelp = document.getElementById('speakerHostingHelp');
  const fileInput = document.getElementById('speakerFiles');
  const invitePanel = document.getElementById('speakerInvitePanel');
  const inviteButton = document.getElementById('generateSpeakerInvite');
  const inviteResult = document.getElementById('speakerInviteResult');
  const inviteUrl = document.getElementById('speakerInviteUrl');
  const inviteQr = document.getElementById('speakerInviteQr');
  const inviteMessage = document.getElementById('speakerInviteMessage');
  let identity;
  let editingId = '';
  let requests = [];
  const accountQuery = '?as=club';

  // Keep the user's dashboard context when leaving this page. The href remains
  // a safe fallback for direct visits or when the browser has no same-site entry.
  document.querySelectorAll('[data-history-back]').forEach((link) => {
    link.addEventListener('click', (event) => {
      let sameSiteReferrer = false;
      try {
        sameSiteReferrer = Boolean(document.referrer)
          && new URL(document.referrer).origin === window.location.origin;
      } catch (_) { /* Use the link's safe fallback. */ }
      if (sameSiteReferrer && window.history.length > 1) {
        event.preventDefault();
        window.history.back();
      }
    });
  });

  async function requestJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Request failed. Please try again.');
    return data;
  }

  function showMessage(node, text, kind = '') {
    node.textContent = text;
    node.classList.toggle('is-error', kind === 'error');
    node.classList.toggle('is-success', kind === 'success');
  }

  async function generateSpeakerInvite(rotate = false) {
    inviteButton.disabled = true;
    showMessage(inviteMessage, rotate ? 'Creating a new permanent link…' : 'Preparing your permanent link…');
    try {
      const invite = await requestJson('/api/club/speaker-invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rotate }) });
      const url = new URL(invite.url, location.origin).href;
      inviteUrl.value = url;
      inviteQr.replaceChildren();
      try {
        await window.ensureQRCode();
        new window.QRCode(inviteQr, { text: url, width: 180, height: 180, correctLevel: window.QRCode.CorrectLevel.M });
      } catch {
        addText(inviteQr, 'p', 'QR preview is unavailable in this browser. Copy and share the link above.', 'speaker-help');
      }
      document.getElementById('speakerInviteExpiry').textContent = invite.permanent
        ? 'This link does not expire. Generating it again reuses the same link. Revoke it only if you need to replace it.'
        : `This link expires ${new Date(invite.expiresAt).toLocaleDateString()}.`;
      inviteResult.hidden = false;
      showMessage(inviteMessage, invite.reused ? 'Your existing permanent speaker link is ready.' : 'Permanent link created. Share it with the intended speaker.', 'success');
    } catch (error) { showMessage(inviteMessage, error.message, 'error'); }
    finally { inviteButton.disabled = false; }
  }

  inviteButton.addEventListener('click', () => generateSpeakerInvite(false));
  document.getElementById('revokeSpeakerInvite').addEventListener('click', () => generateSpeakerInvite(true));
  document.getElementById('copySpeakerInvite').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(inviteUrl.value); showMessage(inviteMessage, 'Speaker form link copied.', 'success'); }
    catch { inviteUrl.focus(); inviteUrl.select(); showMessage(inviteMessage, 'Select and copy the link above.', ''); }
  });
  document.getElementById('downloadSpeakerInviteQr').addEventListener('click', () => {
    const canvas = inviteQr.querySelector('canvas');
    const image = inviteQr.querySelector('img');
    const dataUrl = canvas?.toDataURL('image/png') || image?.src;
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return showMessage(inviteMessage, 'Generate the QR code before downloading it.', 'error');
    const link = document.createElement('a');
    link.href = dataUrl; link.download = 'miu-speaker-invitation-qr.png'; link.click();
  });

  function addText(parent, tag, text, className = '') {
    const node = document.createElement(tag);
    node.textContent = text || '';
    if (className) node.className = className;
    parent.append(node);
    return node;
  }

  function requestAttachments(item) {
    if (Array.isArray(item.attachments) && item.attachments.length) return item.attachments;
    return item.cvAvailable ? [{ index: 0, name: item.cvName || 'Speaker material' }] : [];
  }

  function renderRequests() {
    list.replaceChildren();
    if (!requests.length) return addText(list, 'p', identity?.type === 'club' ? 'There are no speaker requests for your club yet.' : 'You have not submitted a speaker request yet.', 'speaker-help');
    for (const item of requests) {
      const card = document.createElement('article');
      card.className = 'speaker-request-card';
      addText(card, 'h3', item.speakerName);
      addText(card, 'p', `${item.clubName} · ${item.proposedTopic}`, 'speaker-request-meta');
      if (item.speakerEmail) addText(card, 'p', `Speaker email: ${item.speakerEmail}`);
      if (item.jobTitleCompany || item.professionalDetails) addText(card, 'p', `Current position & company: ${item.jobTitleCompany || item.professionalDetails}`);
      if (item.shortBio) addText(card, 'p', `Short bio: ${item.shortBio}`);
      if (item.linkedinProfile) addText(card, 'p', `LinkedIn profile: ${item.linkedinProfile}`);
      if (item.speakerSelectionReason) addText(card, 'p', `Why this speaker was chosen: ${item.speakerSelectionReason}`);
      if (item.expectedStudentBenefit) addText(card, 'p', `Expected benefit to students: ${item.expectedStudentBenefit}`);
      if (item.sessionFormat) addText(card, 'p', `Preferred session format: ${item.sessionFormat}`);
      if (item.availability) addText(card, 'p', `Availability: ${item.availability}`);
      if (item.specialRequirements) addText(card, 'p', `Special requirements: ${item.specialRequirements}`);
      const statusLabel = item.status === 'pending' || item.status === 'pending_club' ? 'pending club review'
        : item.status === 'pending_dean' ? 'pending Dean review' : item.status.replaceAll('_', ' ');
      const status = addText(card, 'span', statusLabel, `speaker-status ${item.status}`);
      status.setAttribute('aria-label', `Request status: ${item.status.replaceAll('_', ' ')}`);
      if (item.clubReviewerComment) addText(card, 'p', `Club feedback: ${item.clubReviewerComment}`);
      if (item.reviewerComment) addText(card, 'p', `Dean’s feedback: ${item.reviewerComment}`);
      for (const attachment of requestAttachments(item)) {
        const cv = document.createElement('button');
        cv.className = 'secondary-btn'; cv.type = 'button'; cv.textContent = `Download ${attachment.name || 'attachment'}`;
        cv.addEventListener('click', async () => {
          cv.disabled = true;
          try {
            const params = new URLSearchParams(accountQuery.replace(/^\?/, ''));
            params.set('attachmentIndex', String(attachment.index));
            const result = await requestJson(`/api/speaker-requests/${encodeURIComponent(item.id)}/cv?${params}`);
            window.location.assign(result.url);
          } catch (error) { showMessage(formMessage, error.message, 'error'); }
          finally { cv.disabled = false; }
        });
        card.append(cv);
      }
      const isStudentOwner = identity?.type === 'student' && item.requesterType === 'student' && item.requesterId === identity.id;
      const isClubOwner = identity?.type === 'club' && Number(item.clubId) === Number(identity.clubId)
        && (identity.role === 'president' || item.requesterId === `club:${identity.clubId}:${identity.email}`
          || item.assignedHeadEmail && item.assignedHeadEmail.toLowerCase() === identity.email.toLowerCase());
      if (identity?.type === 'club' && ['pending_club', 'pending'].includes(item.status)) {
        const canReview = ['president', 'head'].includes(identity.role)
          && identity.email.toLowerCase() !== String(item.requesterEmail || '').toLowerCase()
          && (identity.role === 'president' || !item.assignedHeadEmail || item.assignedHeadEmail.toLowerCase() === identity.email.toLowerCase());
        if (canReview) {
          const comment = document.createElement('textarea');
          comment.maxLength = 2000; comment.rows = 2; comment.placeholder = 'Optional note for the supervisor; required if rejecting';
          comment.setAttribute('aria-label', `Club review note for ${item.speakerName}`); card.append(comment);
          const actions = document.createElement('div'); actions.className = 'speaker-form-actions';
          for (const [action, label, className] of [['accept', 'Accept and send to supervisor', 'primary-btn'], ['reject', 'Reject', 'secondary-btn']]) {
            const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label;
            button.addEventListener('click', async () => {
              button.disabled = true;
              try {
                const updated = await requestJson(`/api/club/speaker-requests/${encodeURIComponent(item.id)}/decision`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, comment: comment.value })
                });
                requests = requests.map((request) => request.id === updated.id ? updated : request);
                renderRequests();
                showMessage(formMessage, action === 'accept' ? 'Accepted by the club and forwarded to the club supervisor.' : 'The club rejected this speaker request.', 'success');
              } catch (error) { button.disabled = false; showMessage(formMessage, error.message, 'error'); }
            });
            actions.append(button);
          }
          card.append(actions);
        } else addText(card, 'p', 'Waiting for another authorized club representative to review this request.', 'speaker-request-meta');
      }
      if (item.status === 'changes_requested' && (isStudentOwner || isClubOwner)) {
        const edit = document.createElement('button');
        edit.className = 'primary-btn'; edit.type = 'button'; edit.textContent = 'Update and resubmit';
        edit.addEventListener('click', () => startEdit(item));
        card.append(edit);
      }
      list.append(card);
    }
  }

  function startEdit(item) {
    if (item.workflow) { window.location.assign(`/pages/workflow.html?kind=speaker&id=${encodeURIComponent(item.id)}`); return; }
    editingId = item.id;
    const clubSelect = form.elements.clubId;
    if (clubSelect) {
      clubSelect.value = item.hostingType === 'miu' ? 'miu' : String(item.clubId || '');
      clubSelect.disabled = true;
    }
    form.elements.speakerName.value = item.speakerName || '';
    form.elements.jobTitleCompany.value = item.jobTitleCompany || item.professionalDetails || '';
    form.elements.linkedinProfile.value = item.linkedinProfile || '';
    form.elements.proposedTopic.value = item.proposedTopic || '';
    form.elements.speakerSelectionReason.value = item.speakerSelectionReason || '';
    form.elements.expectedStudentBenefit.value = item.expectedStudentBenefit || '';
    fileInput.value = '';
    document.getElementById('speakerFormTitle').textContent = 'Update speaker request';
    submitButton.textContent = item.hostingType === 'miu' ? 'Resubmit to Dean' : item.clubReviewedAt ? 'Resubmit for supervisor review' : 'Resubmit for club review';
    if (hostingHelp) hostingHelp.textContent = 'The hosting organization stays the same when you resubmit a request.';
    cancelButton.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearEdit() {
    editingId = ''; form.reset();
    const clubSelect = form.elements.clubId;
    if (clubSelect) clubSelect.disabled = false;
    if (hostingHelp) hostingHelp.textContent = '';
    document.getElementById('speakerFormTitle').textContent = 'Propose a speaker';
    submitButton.textContent = 'Submit request'; cancelButton.hidden = true;
  }

  async function uploadAttachment(file) {
    const extension = file.name.toLowerCase().match(/\.(pdf|doc|docx|ppt|pptx)$/)?.[1];
    if (!extension) throw new Error('Choose a PDF, DOC, DOCX, PPT, or PPTX file.');
    if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('Each attachment must be no larger than 5 MB.');
    const mimeByExtension = {
      pdf: 'application/pdf', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    const fileData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;/, `data:${mimeByExtension[extension]};`));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}. Try again.`));
      reader.readAsDataURL(file);
    });
    const setup = await requestJson('/api/speaker-requests/cv-upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterType: identity.type, fileData })
    });
    return { uploadId: setup.uploadId, name: file.name };
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    showMessage(formMessage, '');
    try {
      const files = Array.from(fileInput.files || []);
      if (files.length > 5) throw new Error('Choose up to five supporting documents.');
      const attachmentUploads = [];
      for (let index = 0; index < files.length; index += 1) {
        showMessage(formMessage, `Uploading attachment ${index + 1} of ${files.length}…`);
        attachmentUploads.push(await uploadAttachment(files[index]));
      }
      const formData = new FormData(form);
      formData.delete('speakerFiles');
      const payload = Object.fromEntries(formData.entries());
      payload.requesterType = identity.type;
      payload.clubId = identity.type === 'club' ? identity.clubId : payload.clubId;
      payload.hostingType = identity.type === 'student' && payload.clubId === 'miu' ? 'miu' : 'club';
      payload.attachmentUploads = attachmentUploads;
      const endpoint = editingId ? `/api/speaker-requests/${encodeURIComponent(editingId)}/resubmit` : '/api/speaker-requests';
      const method = editingId ? 'PATCH' : 'POST';
      const saved = await requestJson(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      requests = editingId ? requests.map((item) => item.id === saved.id ? saved : item) : [saved, ...requests];
      clearEdit(); renderRequests();
      showMessage(formMessage, saved.hostingType === 'miu'
        ? 'Your official MIU university request was sent directly to the Dean for review.'
        : saved.status === 'pending_supervisor'
          ? 'Your request was sent to the club supervisor for approval.'
          : 'Your request was sent to the hosting club for review.', 'success');
    } catch (error) { showMessage(formMessage, error.message, 'error'); }
    finally { submitButton.disabled = false; }
  });
  cancelButton.addEventListener('click', clearEdit);

  (async () => {
    try {
      const context = await requestJson(`/api/speaker-requests/context${accountQuery}`);
      identity = context.identity;
      if (identity?.type !== 'club' || !['president', 'head'].includes(identity.role)) throw new Error('Speaker requests are available only to authorized club managers.');
      document.getElementById('speakerIdentity').textContent = identity.type === 'student' ? `${identity.name} (student)` : `${identity.name} (${identity.role})`;
      const clubSelect = form.elements.clubId;
      if (identity.type === 'club') {
        const club = context.club;
        document.getElementById('speakerClubField').replaceChildren(document.createTextNode(`Hosting club: ${club?.name || `Club ${identity.clubId}`}`));
        clubSelect.remove();
        if (['president', 'head'].includes(identity.role)) invitePanel.hidden = false;
        if (identity.role === 'president') {
          document.getElementById('speakerRequestsHeading').textContent = 'Club speaker requests';
          document.getElementById('speakerRequestsHelp').textContent = 'Requests submitted by your club representatives and their speaker invite links.';
        } else {
          document.getElementById('speakerRequestsHeading').textContent = 'Requests linked to your account';
          document.getElementById('speakerRequestsHelp').textContent = 'You can see requests you submitted or that were sent through your speaker link.';
        }
      } else {
        for (const club of context.clubs) clubSelect.add(new Option(club.name, club.id));
        clubSelect.add(new Option('MIU — Official University (all students)', 'miu'));
        clubSelect.addEventListener('change', () => {
          if (!hostingHelp) return;
          hostingHelp.textContent = clubSelect.value === 'miu'
            ? 'This is an official university event, open to all MIU students. Requests go directly to the Dean for review.'
            : '';
        });
      }
      requests = context.requests || [];
      renderRequests(); content.hidden = false; message.textContent = '';
    } catch (error) {
      showMessage(message, `${error.message} Use your assigned Club Dashboard account to access speaker requests.`, 'error');
    }
  })();
})();
