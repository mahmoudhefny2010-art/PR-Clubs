(() => {
  let currentMedia = '', videoPublicId = '', previewUrl = '';
  const input = document.getElementById('imageInput');
  const preview = document.getElementById('feedMediaPreview');
  const feedback = document.getElementById('formFeedback');
  function clearPreviewUrl() { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; }
  function showSaved() { preview.innerHTML = window.FeedMedia.render(currentMedia, 'Post media', 'feed-form-media'); }
  input.addEventListener('change', () => {
    clearPreviewUrl(); feedback.textContent = '';
    const file = input.files[0];
    if (!file) { showSaved(); return; }
    const video = ['video/mp4', 'video/webm'].includes(file.type);
    if ((!video && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) || file.size > (video ? 50 : 10) * 1024 * 1024 || !file.size) {
      input.value = ''; showSaved();
      feedback.textContent = 'Choose a PNG, JPG or WebP image up to 10 MB, or an MP4 / WebM video up to 50 MB.';
      return;
    }
    previewUrl = URL.createObjectURL(file);
    const media = document.createElement(video ? 'video' : 'img');
    media.className = 'feed-form-media'; media.src = previewUrl;
    if (video) { media.controls = true; media.playsInline = true; media.preload = 'metadata'; }
    else media.alt = 'Selected post image';
    preview.replaceChildren(media);
  });
  ContentStudio.init({
    type: 'feed', pageTitle: 'Feed Studio', formTitle: 'New feed post',
    collect: async () => {
      const payload = {
        title: document.getElementById('titleInput').value,
        date: document.getElementById('dateInput').value,
        time: document.getElementById('timeInput').value,
        description: document.getElementById('descInput').value
      };
      const file = input.files[0];
      if (file) {
        input.disabled = true; feedback.textContent = file.type.startsWith('video/') ? 'Uploading video…' : 'Uploading image…';
        try {
          const video = file.type.startsWith('video/');
          const uploaded = video ? await window.uploadFeedVideo(file) : await window.uploadImageToCloudinary(file, 'feed');
          currentMedia = uploaded.url; videoPublicId = video ? uploaded.publicId : '';
          input.value = ''; clearPreviewUrl(); showSaved();
        } finally { input.disabled = false; }
      }
      return { ...payload, image: currentMedia, videoPublicId };
    },
    fill: item => {
      clearPreviewUrl(); input.value = '';
      for (const [id, key] of [['titleInput', 'title'], ['dateInput', 'date'], ['timeInput', 'time'], ['descInput', 'description']]) document.getElementById(id).value = item[key] || '';
      currentMedia = item.image || ''; videoPublicId = ''; showSaved();
    },
    resetExtras: () => { clearPreviewUrl(); currentMedia = ''; videoPublicId = ''; input.value = ''; preview.replaceChildren(); }
  });
  window.addEventListener('pagehide', clearPreviewUrl);
})();
