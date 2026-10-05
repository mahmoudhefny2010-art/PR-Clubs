(() => {
  const storageKey = 'miu-site-theme';
  const savedTheme = localStorage.getItem(storageKey);
  const theme = savedTheme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'site-theme-toggle';
  button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  button.title = theme === 'dark' ? 'Light mode' : 'Dark mode';
  button.innerHTML = '<svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg><svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 15.1A8.5 8.5 0 0 1 8.9 3.2 8.5 8.5 0 1 0 20.8 15.1Z"/></svg>';
  button.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(storageKey, nextTheme);
    button.setAttribute('aria-label', nextTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    button.title = nextTheme === 'dark' ? 'Light mode' : 'Dark mode';
  });
  document.addEventListener('DOMContentLoaded', () => document.body.append(button));
})();
