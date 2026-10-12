(() => {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;

  let notice;
  const showOfflineNotice = (message = 'You are offline. Changes cannot be saved; reconnect before submitting forms.') => {
    if (!notice) {
      notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      Object.assign(notice.style, {
        position: 'fixed', inset: '12px 12px auto', zIndex: '2147483647', margin: '0 auto',
        width: 'max-content', maxWidth: 'min(560px, calc(100vw - 24px))', padding: '12px 16px',
        borderRadius: '12px', background: '#172033', color: '#fff', boxShadow: '0 8px 28px #0003',
        font: '600 14px/1.45 system-ui, sans-serif', textAlign: 'center'
      });
      document.body.appendChild(notice);
    }
    notice.textContent = message;
    notice.hidden = false;
  };

  const hideOfflineNotice = () => { if (notice) notice.hidden = true; };
  window.addEventListener('offline', () => showOfflineNotice());
  window.addEventListener('online', hideOfflineNotice);
  if (!navigator.onLine) showOfflineNotice();

  // Prevent forms from appearing to submit while no server connection exists.
  document.addEventListener('submit', (event) => {
    if (navigator.onLine) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showOfflineNotice('Not sent: you are offline. Reconnect, then submit the form again.');
  }, true);

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('PWA service worker registration failed:', error);
    });
  }, { once: true });
})();
