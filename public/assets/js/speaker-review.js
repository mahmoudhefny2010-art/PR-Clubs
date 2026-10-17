(() => {
  const message = document.getElementById('speakerReviewMessage');
  const list = document.getElementById('speakerReviewList');
  const tools = document.getElementById('speakerReviewTools');
  const search = document.getElementById('speakerReviewSearch');
  const statusFilter = document.getElementById('speakerReviewFilter');
  const exportButton = document.getElementById('speakerReviewExport');
  const invitePanel = document.getElementById('deanSpeakerInvitePanel');
  const inviteClub = document.getElementById('deanSpeakerInviteClub');
  const inviteMessage = document.getElementById('deanSpeakerInviteMessage');
  const inviteResult = document.getElementById('deanSpeakerInviteResult');
  const inviteUrl = document.getElementById('deanSpeakerInviteUrl');
  const inviteQr = document.getElementById('deanSpeakerInviteQr');
  const generateInviteButton = document.getElementById('deanGenerateSpeakerInvite');
  const rotateInviteButton = document.getElementById('deanRotateSpeakerInvite');
  let recordsCache = [];
  let speakerRequestsLoaded = false;
  let inviteClubsLoaded = false;
  async function api(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Request failed.');
    return data;
  }
  const text = (parent, tag, value, className = '') => {
    const element = document.createElement(tag); element.textContent = value || ''; if (className) element.className = className; parent.append(element); return element;
  };
  function feedback(value, error = false) { message.textContent = value; message.classList.toggle('is-error', error); }
  function inviteFeedback(value, error = false) { inviteMessage.textContent = value; inviteMessage.classList.toggle('is-error', error); inviteMessage.classList.toggle('is-success', !error && Boolean(value)); }
  function requestAttachments(item) {
    if (Array.isArray(item.attachments) && item.attachments.length) return item.attachments;
    return item.cvAvailable ? [{ index: 0, name: item.cvName || 'Speaker material' }] : [];
  }
  async function loadInviteClubs() {
    const clubs = await api('/api/dean/speaker-invites/clubs');
    inviteClub.replaceChildren(new Option('Choose MIU or a club', ''));
    for (const club of clubs) inviteClub.add(new Option(club.name, String(club.id)));
    invitePanel.hidden = false;
  }
  async function createInvite(rotate = false) {
    const clubId = Number(inviteClub.value);
    if (inviteClub.value === '' || !Number.isSafeInteger(clubId) || clubId < 0) {
      inviteFeedback('Choose MIU or a hosting club first.', true);
      inviteClub.focus();
      return;
    }
    const button = rotate ? rotateInviteButton : generateInviteButton;
    button.disabled = true;
    inviteFeedback(rotate ? 'Creating a new permanent link…' : 'Preparing the permanent link…');
    try {
      const invite = await api('/api/dean/speaker-invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId, rotate })
      });
      const fullUrl = new URL(invite.url, location.origin).href;
      inviteUrl.value = fullUrl;
      inviteQr.replaceChildren();
      try {
        await window.ensureQRCode();
        new window.QRCode(inviteQr, { text: fullUrl, width: 180, height: 180, correctLevel: window.QRCode.CorrectLevel.M });
      } catch {
        text(inviteQr, 'p', 'QR generation is unavailable in this browser. Copy and share the link above.', 'speaker-help');
      }
      inviteResult.hidden = false;
      inviteFeedback(invite.reused ? 'The existing permanent link is ready.' : 'Permanent link created. It stays the same unless you revoke it.', false);
    } catch (error) { inviteFeedback(error.message, true); }
    finally { button.disabled = false; }
  }
  if (invitePanel) {
    inviteClub.addEventListener('change', () => { inviteResult.hidden = true; inviteFeedback(''); });
    generateInviteButton.addEventListener('click', () => createInvite(false));
    rotateInviteButton.addEventListener('click', () => createInvite(true));
    document.getElementById('deanCopySpeakerInvite').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(inviteUrl.value); inviteFeedback('Permanent link copied.', false); }
      catch { inviteUrl.focus(); inviteUrl.select(); inviteFeedback('Select and copy the link above.', true); }
    });
    document.getElementById('deanDownloadSpeakerInviteQr').addEventListener('click', () => {
      const canvas = inviteQr.querySelector('canvas');
      const image = inviteQr.querySelector('img');
      const dataUrl = canvas?.toDataURL('image/png') || image?.src;
      if (!dataUrl || !dataUrl.startsWith('data:image/')) return inviteFeedback('Generate the QR code before downloading it.', true);
      const link = document.createElement('a'); link.href = dataUrl; link.download = 'miu-speaker-invitation-qr.png'; link.click();
    });
  }
  function visibleRecords() {
    const query = search.value.trim().toLowerCase();
    const status = statusFilter.value;
    return recordsCache.filter((item) => (status === 'all' || item.status === status)
      && (!query || [item.speakerName, item.speakerEmail, item.jobTitleCompany, item.linkedinProfile, item.proposedTopic, item.speakerSelectionReason, item.expectedStudentBenefit, item.shortBio, item.sessionFormat, item.availability, item.specialRequirements, item.clubName].some((value) => String(value || '').toLowerCase().includes(query))));
  }
  function filterCards() {
    const visible = new Set(visibleRecords().map((item) => item.id));
    list.querySelectorAll('[data-speaker-request-id]').forEach((card) => { card.hidden = !visible.has(card.dataset.speakerRequestId); });
  }
  function csvCell(value) {
    let text = String(value ?? '').replace(/[\r\n]+/g, ' ');
    if (/^[=+@\-\t]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
  function exportCsv() {
    const columns = [
      ['Name', 'speakerName'], ['Current position and company', 'jobTitleCompany'], ['LinkedIn', 'linkedinProfile'],
      ['Topic', 'proposedTopic'], ['Why this speaker was chosen', 'speakerSelectionReason'], ['Expected benefit to students', 'expectedStudentBenefit'], ['Email', 'speakerEmail'], ['Short bio', 'shortBio'],
      ['Session format', 'sessionFormat'], ['Availability', 'availability'], ['Special requirements', 'specialRequirements'],
      ['Hosting club', 'clubName'], ['Status', 'status'], ['Submitted at', 'submittedAt'], ['Attachments', 'attachmentNames']
    ];
    const rows = [columns.map(([label]) => label), ...visibleRecords().map(item => columns.map(([, key]) => key === 'attachmentNames' ? requestAttachments(item).map(attachment => attachment.name).join('; ') : item[key]))];
    window.downloadFormattedExcel(rows, 'university-speaker-requests.xlsx').catch(error => window.alert(error.message));
  }
  search.addEventListener('input', filterCards);
  statusFilter.addEventListener('change', filterCards);
  exportButton.addEventListener('click', exportCsv);
  async function load() {
    feedback('Loading speaker requests…'); list.replaceChildren();
    try {
      const session = await api('/api/club-auth/session');
      if (session.club?.role !== 'dean') throw new Error('Sign in with the Dean committee account to review these requests.');
      const records = await api('/api/dean/speaker-requests');
      recordsCache = records;
      tools.hidden = false;
      exportButton.disabled = !records.length;
      feedback(records.length ? `${records.filter((record) => record.status === 'pending_dean').length} waiting for Dean review · ${records.length} total` : 'No speaker requests are waiting for Dean review.');
      if (!records.length) return;
      for (const item of records) {
        const card = document.createElement('article'); card.className = 'speaker-request-card'; card.dataset.speakerRequestId = item.id;
        text(card, 'h2', item.speakerName);
        text(card, 'p', `${item.clubName} · Requested by ${item.requesterType === 'student' ? 'student' : item.requesterType === 'speaker' ? 'external speaker' : 'club representative'} · ${item.requesterEmail}`, 'speaker-request-meta');
        text(card, 'span', item.status.replaceAll('_', ' '), `speaker-status ${item.status}`);
        if (item.clubReviewedAt) text(card, 'p', `Accepted by the club ${new Date(item.clubReviewedAt).toLocaleString()}${item.clubReviewerEmail ? ` · ${item.clubReviewerEmail}` : ''}${item.clubReviewerComment ? ` · Note: ${item.clubReviewerComment}` : ''}`, 'speaker-request-meta');
        text(card, 'p', `Current position & company: ${item.jobTitleCompany || item.professionalDetails}`);
        if (item.speakerSelectionReason) text(card, 'p', `Why this speaker was chosen: ${item.speakerSelectionReason}`);
        if (item.expectedStudentBenefit) text(card, 'p', `Expected benefit to students: ${item.expectedStudentBenefit}`);
        if (item.shortBio) text(card, 'p', `Short bio: ${item.shortBio}`);
        if (item.linkedinProfile) text(card, 'p', `LinkedIn profile: ${item.linkedinProfile}`);
        if (item.speakerEmail) text(card, 'p', `Speaker email: ${item.speakerEmail}`);
        text(card, 'p', `Proposed topic: ${item.proposedTopic}`);
        if (item.eventPurpose) text(card, 'p', `Event purpose: ${item.eventPurpose}`);
        if (item.sessionFormat) text(card, 'p', `Preferred session format: ${item.sessionFormat}`);
        if (item.availability) text(card, 'p', `Availability: ${item.availability}`);
        if (item.specialRequirements) text(card, 'p', `Special requirements: ${item.specialRequirements}`);
        if (item.proposedDate) text(card, 'p', `Proposed date: ${new Date(item.proposedDate).toLocaleDateString()}`);
        text(card, 'p', `Submitted ${new Date(item.submittedAt).toLocaleString()}${item.decidedAt ? ` · Last decision ${new Date(item.decidedAt).toLocaleString()}` : ''}`, 'speaker-request-meta');
        if (item.reviewerComment) text(card, 'p', `Previous Dean feedback: ${item.reviewerComment}`);
        const actions = document.createElement('div'); actions.className = 'speaker-form-actions';
        for (const attachment of requestAttachments(item)) {
          const cv = document.createElement('button'); cv.type = 'button'; cv.className = 'secondary-btn'; cv.textContent = `Download ${attachment.name || 'private attachment'}`;
          cv.addEventListener('click', async () => {
            cv.disabled = true;
            try {
              const query = new URLSearchParams({ attachmentIndex: String(attachment.index) });
              const result = await api(`/api/speaker-requests/${encodeURIComponent(item.id)}/cv?${query}`);
              window.location.assign(result.url);
            } catch (error) { feedback(error.message, true); }
            finally { cv.disabled = false; }
          });
          actions.append(cv);
        }
        if (item.status === 'pending_dean') {
          const comment = document.createElement('textarea'); comment.maxLength = 2000; comment.rows = 2; comment.placeholder = 'Reviewer comment (required when requesting changes)'; comment.setAttribute('aria-label', `Reviewer comment for ${item.speakerName}`); actions.append(comment);
          for (const [action, label, className] of [['approve', 'Approve', 'primary-btn'], ['reject', 'Reject', 'secondary-btn'], ['request_changes', 'Request changes', 'secondary-btn']]) {
            const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label;
            button.addEventListener('click', async () => {
              button.disabled = true;
              try { await api(`/api/dean/speaker-requests/${encodeURIComponent(item.id)}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, comment: comment.value }) }); await load(); }
              catch (error) { feedback(error.message, true); button.disabled = false; }
            }); actions.append(button);
          }
        }
        const attachmentNames = requestAttachments(item).map((attachment) => attachment.name).filter(Boolean);
        if (attachmentNames.length) text(card, 'p', `Attached material: ${attachmentNames.join(', ')}`, 'speaker-request-meta');
        card.append(actions); list.append(card);
      }
      filterCards();
    } catch (error) {
      speakerRequestsLoaded = false;
      feedback(error.message, true);
    }
  }
  document.getElementById('speakerReviewLogout')?.addEventListener('click', async () => { try { await fetch('/api/club-auth/logout', { method: 'POST' }); } finally { window.location.href = '/'; } });
  if (!document.getElementById('speakerReviewPanel')) {
    speakerRequestsLoaded = true;
    load();
  } else {
    const preloadSpeakerRequests = () => {
      if (speakerRequestsLoaded) return;
      speakerRequestsLoaded = true;
      return load();
    };
    if (window.siteStartup?.afterStartup) window.siteStartup.afterStartup(preloadSpeakerRequests);
    else preloadSpeakerRequests();
  }
  if (invitePanel) {
    const preloadSpeakerInviteClubs = async () => {
      if (inviteClubsLoaded) return;
      inviteClubsLoaded = true;
      try { await loadInviteClubs(); }
      catch (error) { inviteClubsLoaded = false; inviteFeedback(error.message, true); }
    };
    if (window.siteStartup?.afterStartup) window.siteStartup.afterStartup(preloadSpeakerInviteClubs);
    else preloadSpeakerInviteClubs();
  }
  window.addEventListener('dashboard:panel-change', (event) => {
    const panelId = event.detail?.panelId;
    if (panelId === 'speakerReviewPanel' && !speakerRequestsLoaded) {
      speakerRequestsLoaded = true;
      load();
    }
    if (panelId === 'deanSpeakerInviteSection' && invitePanel && !inviteClubsLoaded) {
      inviteClubsLoaded = true;
      loadInviteClubs().catch((error) => {
        inviteClubsLoaded = false;
        inviteFeedback(error.message, true);
      });
    }
  });
})();
