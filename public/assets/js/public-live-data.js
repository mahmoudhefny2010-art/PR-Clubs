(() => {
  const keys = { clubs: 'miu-public-clubs-v1', universityContent: 'miu-public-university-content-v1' };
  const urls = { '/api/clubs?media=links': 'clubs', '/api/university-content': 'universityContent' };
  const tokenKey = 'miu:public-live-token';
  const dirtyKey = name => 'miu:public-dirty:' + name;
  const pending = new Map(), watchers = new Set();
  const nativeFetch = window.fetch.bind(window);
  let source, notification;
  const get = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const set = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ } };
  const memoryDirty = new Map();
  const dirty = name => memoryDirty.get(name) || get(dirtyKey(name)) || '';
  const snapshot = name => { try { return JSON.parse(get(keys[name]) || 'null')?.data; } catch { return null; } };
  const notify = () => {
    clearTimeout(notification);
    notification = setTimeout(() => watchers.forEach(run => void run()), 100);
  };
  const invalidate = (names = Object.keys(keys)) => {
    for (const name of names) {
      if (!keys[name]) continue;
      const version = Date.now() + ':' + Math.random();
      memoryDirty.set(name, version);
      set(dirtyKey(name), version);
    }
    notify();
  };
  window.fetch = async (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    const method = options.method || (input instanceof Request ? input.method : 'GET');
    const name = url.origin === location.origin && method === 'GET' ? urls[url.pathname + url.search] : null;
    if (!name) return nativeFetch(input, options);
    const saved = snapshot(name);
    if (!dirty(name) && Array.isArray(saved)) return new Response(JSON.stringify(saved), { headers: { 'Content-Type': 'application/json' } });
    if (pending.has(name)) return (await pending.get(name)).clone();
    const generation = dirty(name);
    const request = (async () => {
      const response = await nativeFetch(input, { ...options, cache: 'no-store' });
      if (response.ok) {
        const data = await response.clone().json();
        if (Array.isArray(data)) {
          set(keys[name], JSON.stringify({ savedAt: Date.now(), data }));
          if (dirty(name) === generation) {
            memoryDirty.delete(name);
            set(dirtyKey(name), '');
          } else notify();
        }
      }
      return response;
    })();
    pending.set(name, request);
    try { return (await request).clone(); } finally { pending.delete(name); }
  };
  const watch = task => {
    let busy = false, again = false;
    const run = async () => {
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
      if (busy) { again = true; return; }
      busy = true;
      try { do { again = false; await task(); } while (again); }
      catch { /* Retry when the stream reconnects or the page becomes visible. */ }
      finally { busy = false; }
    };
    watchers.add(run);
    if (Object.keys(keys).some(name => dirty(name))) notify();
  };
  const connect = () => {
    if (document.visibilityState !== 'visible' || navigator.onLine === false) { source?.close(); source = null; return; }
    if (!source && typeof EventSource !== 'undefined') {
      source = new EventSource('/api/site/public-data-stream?since=' + encodeURIComponent(get(tokenKey) || ''));
      source.addEventListener('invalidate', event => {
        try { invalidate(JSON.parse(event.data).keys); } catch { invalidate(); }
        if (event.lastEventId) set(tokenKey, event.lastEventId);
      });
      source.addEventListener('ready', event => {
        if (event.lastEventId) set(tokenKey, event.lastEventId);
        // A failed fetch remains dirty and is retried on the next connection.
        if (Object.keys(keys).some(name => dirty(name))) notify();
      });
    }
    notify();
  };
  window.miuLiveData = { watch, invalidate };
  document.addEventListener('visibilitychange', connect);
  window.addEventListener('online', connect);
  window.addEventListener('offline', connect);
  window.addEventListener('pagehide', () => { source?.close(); source = null; });
  window.addEventListener('pageshow', connect);
  window.addEventListener('storage', event => {
    if (Object.values(keys).includes(event.key) || event.key?.startsWith('miu:public-dirty:')) {
      // Another tab can provide a fresh snapshot without a second download.
      for (const name of Object.keys(keys)) memoryDirty.delete(name);
      notify();
    }
  });
  connect();
})();
