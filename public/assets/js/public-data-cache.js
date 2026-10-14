(() => {
  const keys = {
    clubs: 'miu-public-clubs-v1',
    universityContent: 'miu-public-university-content-v1'
  };
  function read(name) {
    try {
      const value = JSON.parse(localStorage.getItem(keys[name]) || 'null');
      return Array.isArray(value?.data) ? value.data : null;
    } catch { return null; }
  }
  function write(name, data) {
    if (!keys[name] || !Array.isArray(data)) return;
    try {
      const snapshot = JSON.stringify({ savedAt: Date.now(), data });
      if (snapshot.length <= 3 * 1024 * 1024) localStorage.setItem(keys[name], snapshot);
    } catch { /* Public pages still work when browser storage is unavailable. */ }
  }
  function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
  window.miuPublicDataCache = { read, write, same };
})();
