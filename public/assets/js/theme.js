(() => {
  const storageKey = 'miu-site-theme';
  let savedTheme = null;
  try { savedTheme = localStorage.getItem(storageKey); } catch (_) { /* Continue with the light theme when storage is blocked. */ }
  const theme = savedTheme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.dataset.theme = theme;

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/assets/css/theme-toggle.css?v=20261009c';
  document.head.append(stylesheet);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'site-theme-toggle';

  const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
  const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 15.1A8.5 8.5 0 0 1 8.9 3.2 8.5 8.5 0 1 0 20.8 15.1Z"/></svg>';

  function updateButton(nextTheme) {
    button.setAttribute('aria-label', nextTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    button.setAttribute('aria-pressed', String(nextTheme === 'dark'));
    button.title = nextTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    button.innerHTML = nextTheme === 'dark' ? sunIcon : moonIcon;
  }

  updateButton(theme);
  button.addEventListener('click', () => {
    const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = nextTheme;
    try { localStorage.setItem(storageKey, nextTheme); } catch (_) { /* The current page still changes theme. */ }
    updateButton(nextTheme);
  });

  function mountButton() {
    const navActions = document.querySelector('.topbar-container .nav-right');
    if (!navActions) return false;
    button.classList.remove('is-floating');
    navActions.prepend(button);
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (mountButton()) return;
    button.classList.add('is-floating');
    document.body.append(button);
    if (!document.getElementById('site-header')) return;
    const observer = new MutationObserver(() => {
      if (mountButton()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
