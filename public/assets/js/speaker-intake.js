(() => {
  const pageMessage = document.getElementById('speakerInvitePageMessage');
  const panel = document.getElementById('speakerInviteFormPanel');
  const form = document.getElementById('publicSpeakerForm');
  const formMessage = document.getElementById('publicSpeakerFormMessage');
  const submit = document.getElementById('publicSpeakerSubmit');
  const fileInput = document.getElementById('publicSpeakerCv');
  const token = new URLSearchParams(location.search).get('t') || '';
  let submitting = false;

  function showMessage(node, text, error = false) {
    node.textContent = text;
    node.classList.toggle('is-error', error);
    node.classList.toggle('is-success', !error && Boolean(text));
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Request failed. Please try again.');
    return data;
  }

  function readAttachment(file) {
    const extension = file.name.toLowerCase().match(/\.(pdf|doc|docx|ppt|pptx)$/)?.[1];
    const accepted = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx']);
    if (!extension || !accepted.has(extension)) throw new Error('Choose a PDF, DOC, DOCX, PPT, or PPTX file.');
    if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('The attachment must be no larger than 5 MB.');
    const allowedTypes = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/octet-stream']);
    if (file.type && !allowedTypes.has(file.type)) throw new Error('The selected file type does not match an accepted document format.');
    const mimeByExtension = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;/, `data:${mimeByExtension[extension]};`));
      reader.onerror = () => reject(new Error('Could not read this attachment. Try again.'));
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    submitting = true;
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    submit.textContent = 'Submitting…';
    showMessage(formMessage, 'Submitting your response…');
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      if (fileInput.files[0]) {
        payload.materialFileData = await readAttachment(fileInput.files[0]);
        payload.materialName = fileInput.files[0].name;
      }
      const result = await requestJson(`/api/public/speaker-invites/${encodeURIComponent(token)}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      form.reset();
      fileInput.disabled = true;
      submit.hidden = true;
      showMessage(formMessage, result.message || 'Thank you for your interest! Your response has been submitted successfully.', false);
    } catch (error) {
      showMessage(formMessage, error.message, true);
      submitting = false;
    } finally {
      form.removeAttribute('aria-busy');
      if (!submit.hidden) { submit.disabled = false; submit.textContent = 'Send proposal'; }
    }
  });

  (async () => {
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      showMessage(pageMessage, 'This speaker invitation link is invalid. Ask the club for a new link.', true);
      return;
    }
    try {
      const invite = await requestJson(`/api/public/speaker-invites/${encodeURIComponent(token)}`);
      document.getElementById('speakerInviteClubName').textContent = `Hosting club: ${invite.clubName}`;
      panel.hidden = false;
      pageMessage.hidden = true;
    } catch (error) { showMessage(pageMessage, error.message, true); }
  })();
})();
