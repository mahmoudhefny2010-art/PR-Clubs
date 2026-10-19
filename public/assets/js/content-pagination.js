(function () {
  function numbers(page, total, compact = false) {
    const radius = compact ? 0 : 1;
    if (total <= (compact ? 4 : 7)) return Array.from({ length: total }, (_, i) => i + 1);
    const values = [...new Set([1, total, ...Array.from({ length: radius * 2 + 1 }, (_, i) => page + i - radius)])]
      .filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
    const result = [];
    values.forEach((n, i) => {
      const gap = n - values[i - 1];
      if (gap === 2 && !compact) result.push(n - 1);
      else if (gap > 1) result.push('…');
      result.push(n);
    });
    return result;
  }
  function create({ section, list, render, onError, filter = 'all', post = 0 }) {
    const param = `${section}Page`, filterParam = `${section}Filter`;
    const params = new URLSearchParams(location.search);
    let page = Number(params.get(param)) || 1;
    const validFilters = ['all', 'events', 'announcements', 'activities'];
    filter = validFilters.includes(params.get(filterParam)) ? params.get(filterParam) : filter;
    let meta = { page, totalPages: 0 }, busy = false, generation = 0, pending, pendingKey, controller, signature, clearPost = false;
    const nav = document.createElement('nav');
    nav.className = 'content-pagination';
    nav.setAttribute('aria-label', `${section === 'updates' ? 'Club updates' : section} pages`);
    nav.hidden = true;
    list.after(nav);
    const media = window.matchMedia('(max-width: 480px)');
    function draw() {
      const focusedPage = nav.children.length && nav.contains?.(document.activeElement) ? document.activeElement.dataset.page : null;
      nav.hidden = meta.totalPages <= 1;
      nav.replaceChildren();
      if (nav.hidden) return;
      const button = (label, target, disabled, active = false) => {
        const el = document.createElement('button');
        el.type = 'button'; el.textContent = label; el.disabled = disabled || busy;
        el.dataset.page = target;
        if (active) el.setAttribute('aria-current', 'page');
        if (typeof label === 'number') el.setAttribute('aria-label', `Page ${label}`);
        el.addEventListener('click', () => void load(target, true));
        nav.append(el);
      };
      button('Previous', meta.page - 1, meta.page === 1);
      numbers(meta.page, meta.totalPages, media.matches).forEach(n => {
        if (typeof n === 'number') button(n, n, false, n === meta.page);
        else { const el = document.createElement('span'); el.textContent = n; el.setAttribute('aria-hidden', 'true'); nav.append(el); }
      });
      button('Next', meta.page + 1, meta.page === meta.totalPages);
      if (focusedPage) nav.querySelector(`[data-page="${focusedPage}"]`)?.focus({ preventScroll: true });
    }
    function saveUrl() {
      const url = new URL(location.href);
      if (page > 1) url.searchParams.set(param, page); else url.searchParams.delete(param);
      if (filter !== 'all') url.searchParams.set(filterParam, filter); else url.searchParams.delete(filterParam);
      if (section === 'feed' && clearPost) url.searchParams.delete('post');
      history.replaceState(null, '', url);
    }
    function load(target = page, navigate = false) {
      if (navigate) clearPost = true;
      target = Number.isSafeInteger(Number(target)) && Number(target) > 0 ? Number(target) : 1;
      const query = new URLSearchParams({ page: target, filter });
      if (post) query.set('post', post);
      const key = query.toString();
      if (pending && pendingKey === key) return pending;
      controller?.abort(); controller = new AbortController();
      const ticket = ++generation;
      busy = true; pendingKey = key; draw(); list.setAttribute('aria-busy', 'true');
      pending = (async () => {
        try {
          const response = await fetch(`/api/public-content/${section}?${query}`, { cache: 'no-store', signal: controller.signal });
          if (!response.ok) throw new Error('Content is temporarily unavailable. Please try again.');
          const result = await response.json();
          if (ticket !== generation) return;
          if (!Array.isArray(result.items) || !result.pagination) throw new Error('Invalid content response.');
          meta = result.pagination; page = meta.page; post = 0;
          const next = JSON.stringify(result);
          if (signature !== next) { render(result.items, meta); signature = next; }
          saveUrl();
          if (navigate) list.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
        } catch (error) {
          if (ticket === generation && error.name !== 'AbortError') onError?.(error);
        } finally {
          if (ticket === generation) {
            busy = false; pending = null; list.setAttribute('aria-busy', 'false'); draw();
            if (navigate) nav.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
          }
        }
      })();
      return pending;
    }
    media.addEventListener('change', draw);
    return { load, get filter() { return filter; }, setFilter(value) { filter = validFilters.includes(value) ? value : 'all'; signature = null; post = 0; clearPost = true; return load(1); } };
  }
  window.MiuPagination = { create, numbers };
})();
