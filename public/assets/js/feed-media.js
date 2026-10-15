(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function isVideo(source) {
    try { const url = new URL(source); return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && /^\/[^/]+\/video\/upload\//.test(url.pathname); }
    catch { return false; }
  }
  function poster(source) {
    if (!isVideo(source)) return source;
    const url = new URL(source);
    url.pathname = url.pathname.replace('/video/upload/', '/video/upload/so_0,f_jpg/').replace(/\.(mp4|webm)$/i, '.jpg');
    return url.href;
  }
  function render(source, title = '', className = '') {
    if (!source) return '';
    if (!isVideo(source)) return `<img class="${escape(className)}" src="${escape(source)}" alt="${escape(title)}" loading="lazy" decoding="async">`;
    return `<button type="button" class="feed-video-preview ${escape(className)}" data-feed-video="${escape(source)}" aria-label="Play video: ${escape(title || 'Feed post')}"><img src="${escape(poster(source))}" alt="" loading="lazy" decoding="async"><span class="feed-video-play" aria-hidden="true">▶</span><span class="feed-video-caption">Play video</span></button>`;
  }
  const api = { isVideo, poster, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  root.FeedMedia = api;
  let activeViewer;
  function closeViewer() {
    if (!activeViewer) return;
    const { dialog, video, trigger, overflow } = activeViewer;
    activeViewer = null;
    video.pause(); video.removeAttribute('src'); video.load();
    if (dialog.open) dialog.close();
    dialog.remove(); document.body.style.overflow = overflow;
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
  }
  root.addEventListener('pagehide', closeViewer);
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-feed-video]');
    if (!button || !isVideo(button.dataset.feedVideo)) return;
    event.preventDefault(); event.stopPropagation();
    closeViewer();
    const dialog = document.createElement('dialog');
    dialog.className = 'feed-video-dialog';
    dialog.setAttribute('aria-label', 'Video player');
    const heading = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = button.getAttribute('aria-label').replace(/^Play video: /, '') || 'Feed video';
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'feed-video-close';
    close.setAttribute('aria-label', 'Close video'); close.textContent = '×';
    heading.append(title, close);
    const video = document.createElement('video');
    video.className = 'feed-video-dialog-player';
    video.controls = true; video.playsInline = true; video.preload = 'none';
    video.poster = poster(button.dataset.feedVideo); video.src = button.dataset.feedVideo;
    video.setAttribute('aria-label', button.getAttribute('aria-label').replace(/^Play video: /, 'Video: '));
    dialog.append(heading, video); document.body.append(dialog);
    activeViewer = { dialog, video, trigger: button, overflow: document.body.style.overflow };
    document.body.style.overflow = 'hidden';
    close.addEventListener('click', closeViewer);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
    dialog.addEventListener('close', () => { if (activeViewer?.dialog === dialog) closeViewer(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeViewer();
    });
    dialog.showModal();
    video.play().catch(() => { /* Native controls remain available if playback needs another gesture. */ });
    close.focus({ preventScroll: true });
  });
})(typeof window === 'undefined' ? globalThis : window);
