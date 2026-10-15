(() => {
  'use strict';
  const nativeFetch = window.fetch.bind(window);
  const rules = [
    [/^\/api\/admin\/security\/audit$/, 'data'],
    [/^\/api\/admin\/dashboard-content-clubs$/, 'website-content'],
    [/^\/api\/clubs\?media=links$/, 'clubs'], [/^\/api\/admin\/homepage$/, 'homepage'],
    [/^\/api\/admin\/applications$/, 'applications'], [/^\/api\/admin\/club-heads$/, 'heads'],
    [/^\/api\/admin\/clubs\/archived$/, 'archives'], [/^\/api\/admin\/club-members$/, 'members'],
    [/^\/api\/admin\/visitor-analytics$/, 'analytics'], [/^\/api\/admin\/system\/data-status$/, 'data'],
    [/^\/api\/admin\/dashboard-clubs\/\d+$/, 'clubs'],
    [/^\/api\/admin\/clubs\/\d+\/committee-availability$/, 'committees'],
    [/^\/api\/admin\/club-views$/, 'club-analytics'], [/^\/api\/admin\/event-analytics$/, 'event-analytics'],
    [/^\/api\/admin\/university-content$/, 'website-content'],
    [/^\/api\/feedback\/results\/club$/, 'club-feedback'], [/^\/api\/feedback\/results\/university$/, 'university-feedback'],
    [/^\/api\/admin\/staff-accounts(?:\?.*)?$/, 'staff'], [/^\/api\/admin\/supervisors$/, 'supervisors'],
    [/^\/api\/miu-events\/content$/, 'publishing'], [/^\/api\/report-downloads\/(?:clubs|events)(?:\?.*)?$/, 'reports']
  ];
  const memory = new Map(), pending = new Map(), watchers = new Set();
  let state, storageKey, stream, token = '', version = 0;
  let ready;
  async function bootstrap() {
    const response = await nativeFetch('/api/admin/dashboard-state', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not verify dashboard data. Reconnect and try again.');
    state = await response.json(); storageKey = `miu:admin-dashboard:v3:${state.cacheKey}`;
    try {
      for (const key of Object.keys(sessionStorage)) if (key.startsWith('miu:admin-dashboard:v3:') && key !== storageKey) sessionStorage.removeItem(key);
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
      for (const [url, item] of saved) if (rules.some(([pattern, group]) => pattern.test(url) && item.revision === state.revisions[group])) memory.set(url, item);
    } catch { /* Storage is optional and never used before authorization. */ }
    token = btoa(JSON.stringify(state.revisions)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    return state;
  }
  function ensureReady() {
    if (state) return Promise.resolve(state);
    if (!ready) ready = bootstrap().catch(error => { ready = null; throw error; });
    return ready;
  }
  function persist() {
    if (!storageKey) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify([...memory].filter(([url]) => !url.startsWith('/api/admin/staff-accounts')))); }
    catch { /* Large rosters can remain in memory. */ }
  }
  function invalidate(keys = Object.keys(state?.revisions || {})) {
    version++;
    pending.clear();
    for (const [url, item] of memory) if (keys.includes(item.group)) memory.delete(url);
    persist();
  }
  function responseFor(item) { return new Response(JSON.stringify(item.data), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
  window.fetch = async (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    const method = (options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const key = url.pathname + url.search;
    const rule = method === 'GET' && url.origin === location.origin ? rules.find(([pattern]) => pattern.test(key)) : null;
    if (!rule) {
      const response = await nativeFetch(input, options);
      if (url.origin === location.origin && !['GET', 'HEAD'].includes(method) && response.ok && !key.includes('visitor-ping')) {
        invalidate();
        watchers.forEach(watch => watch({ local: true }));
      }
      return response;
    }
    await ensureReady();
    const group = rule[1], saved = memory.get(key);
    if (saved?.revision === state.revisions[group]) return responseFor(saved);
    if (pending.has(key)) { const item = await pending.get(key); return item.response ? item.response.clone() : responseFor(item); }
    const generation = version;
    const work = (async () => {
      const response = await nativeFetch(input, { ...options, cache: 'no-store' });
      if (!response.ok) return { response };
      const data = await response.json();
      const item = { data, group, revision: state.revisions[group] };
      if (generation === version) { memory.set(key, item); persist(); }
      return item;
    })();
    pending.set(key, work);
    try { const item = await work; return item.response ? item.response.clone() : responseFor(item); }
    finally { if (pending.get(key) === work) pending.delete(key); }
  };
  function connect() {
    if (document.visibilityState !== 'visible' || navigator.onLine === false) { stream?.close(); stream = null; return; }
    if (!state) { void ensureReady().then(connect).catch(() => {}); return; }
    if (stream || typeof EventSource === 'undefined') return;
    stream = new EventSource('/api/admin/dashboard-stream?since=' + encodeURIComponent(token));
    const update = event => {
      try {
        const data = JSON.parse(event.data);
        const changed = Object.keys(data.revisions).filter(key => state.revisions[key] !== data.revisions[key]);
        state.revisions = data.revisions; token = event.lastEventId || token;
        if (!changed.length) return;
        invalidate(changed); watchers.forEach(watch => watch({ keys: changed, local: false }));
      } catch { /* Keep the last successful data during a broken stream. */ }
    };
    stream.addEventListener('invalidate', update); stream.addEventListener('ready', update);
  }
  window.adminDashboardData = { get ready() { return ensureReady(); }, invalidate, watch: fn => { watchers.add(fn); return () => watchers.delete(fn); } };
  ensureReady().then(connect).catch(() => {});
  document.addEventListener('visibilitychange', connect);
  window.addEventListener('online', connect); window.addEventListener('offline', connect);
  window.addEventListener('pagehide', () => { stream?.close(); stream = null; });
  window.addEventListener('pageshow', connect);
})();
