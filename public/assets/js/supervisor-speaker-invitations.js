(() => {
  const invitePanel = document.getElementById('deanSpeakerInvitePanel');
  const inviteClub = document.getElementById('deanSpeakerInviteClub');
  const inviteMessage = document.getElementById('deanSpeakerInviteMessage');
  const inviteResult = document.getElementById('deanSpeakerInviteResult');
  const inviteUrl = document.getElementById('deanSpeakerInviteUrl');
  const inviteQr = document.getElementById('deanSpeakerInviteQr');
  const generateInviteButton = document.getElementById('deanGenerateSpeakerInvite');
  const rotateInviteButton = document.getElementById('deanRotateSpeakerInvite');
  async function api(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Request failed.');
    return data;
  }
  const text = (parent, tag, value, className = '') => {
    const element = document.createElement(tag); element.textContent = value || ''; if (className) element.className = className; parent.append(element); return element;
  };
  function inviteFeedback(value, error = false) { inviteMessage.textContent = value; inviteMessage.classList.toggle('is-error', error); inviteMessage.classList.toggle('is-success', !error && Boolean(value)); }
  async function loadInviteClubs() {
    const clubs = await api('/api/supervisor/speaker-invites/clubs');
    inviteClub.replaceChildren(new Option('Choose MIU or a club', ''));
    for (const club of clubs) inviteClub.add(new Option(club.name, String(club.id)));

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
      const invite = await api('/api/supervisor/speaker-invites', {
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
  loadInviteClubs().catch(error => inviteFeedback(error.message, true));
})();
