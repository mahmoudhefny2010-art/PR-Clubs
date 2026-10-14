(() => {
  if (!['/', '/index.html'].includes(location.pathname)) return;
  const key = 'miu-install-welcome-seen';
  const standalone = window.matchMedia('(display-mode: standalone)');
  const installed = () => standalone.matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let promptEvent = null;
  let dialog = null;
  let shown = false;
  let timer;
  function seen() {
    try { return localStorage.getItem(key); }
    catch { try { return sessionStorage.getItem(key); } catch { return false; } }
  }
  function remember() {
    try { localStorage.setItem(key, 'seen'); }
    catch { try { sessionStorage.setItem(key, 'seen'); } catch { /* Session-only fallback. */ } }
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(show, 1500);
  }
  function show() {
    if (shown || seen() || installed() || (!promptEvent && !ios)) return;
    if (!document.body || document.visibilityState !== 'visible'
      || document.documentElement.classList.contains('site-startup-pending')
      || document.querySelector('dialog[open], .modal.show, .modal.is-open')) return;
    dialog = document.createElement('dialog');
    dialog.className = 'notification-welcome-dialog';
    dialog.setAttribute('aria-labelledby', 'installWelcomeTitle');
    dialog.innerHTML = `
      <div class="notification-welcome-icon" aria-hidden="true">⇩</div>
      <h2 id="installWelcomeTitle">Install MIU Clubs</h2>
      <p>Keep MIU Clubs on your home screen or desktop for quick access.</p>
      <p class="notification-welcome-feedback" role="status" aria-live="polite"></p>
      <div class="notification-welcome-actions">
        <button class="notification-welcome-enable" type="button">${promptEvent ? 'Install app' : ios && navigator.share ? 'Add to Home Screen' : 'How to install'}</button>
        <button class="notification-welcome-later" type="button">Maybe later</button>
      </div>`;
    const button = dialog.querySelector('.notification-welcome-enable');
    const feedback = dialog.querySelector('[role="status"]');
    dialog.querySelector('.notification-welcome-later').onclick = () => dialog.close();
    button.onclick = async () => {
      if (!promptEvent) {
        if (ios && typeof navigator.share === 'function') {
          button.disabled = true;
          try {
            await navigator.share({ title: 'MIU Clubs', url: location.href });
            dialog.close();
          } catch (error) {
            // Closing the share sheet is not an installation failure.
            if (error?.name !== 'AbortError') {
              feedback.textContent = 'Could not open the iOS install options. Use Safari Share, then Add to Home Screen.';
            }
          } finally { button.disabled = false; }
          return;
        }
        feedback.textContent = 'On iPhone or iPad, open this site in Safari, tap Share, then Add to Home Screen, and tap Add.';
        button.hidden = true;
        dialog.querySelector('.notification-welcome-later').textContent = 'Got it';
        return;
      }
      button.disabled = true;
      const currentPrompt = promptEvent;
      promptEvent = null;
      try {
        await currentPrompt.prompt();
        const choice = await currentPrompt.userChoice;
        if (choice?.outcome === 'accepted') feedback.textContent = 'MIU Clubs is being installed on your device.';
        dialog.close();
      } catch {
        feedback.textContent = 'Installation could not start. Try the install option in your browser menu.';
        button.hidden = true;
      }
    };
    document.body.append(dialog);
    shown = true;
    window.queueSitePrompt('install', dialog, { eligible: () => !seen() && !installed(), onOpen: remember });
    observer.disconnect();
  }
  // Observe loader and dialog changes instead of polling or stacking welcome dialogs.
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'class'] });
  window.addEventListener('beforeinstallprompt', event => {
    if (installed() || seen()) return;
    event.preventDefault();
    promptEvent = event;
    schedule();
  });
  window.addEventListener('appinstalled', () => {
    remember();
    promptEvent = null;
    dialog?.close();
    observer.disconnect();
    clearTimeout(timer);
  });
  document.addEventListener('visibilitychange', schedule);
  if (seen() || installed()) observer.disconnect();
  schedule();
})();
