document.addEventListener('DOMContentLoaded', () => {
  const inject = async (id, url) => {
    const el = document.getElementById(id);
    if (!el) return;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) el.innerHTML = await res.text();
    } catch (error) {
      // leave placeholder if component cannot be loaded
    }
  };
  inject('site-header', '/components/site-header.html');
  inject('site-footer', '/components/site-footer.html');
});
