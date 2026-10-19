const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture({ university, search = '', failRefresh = false }) {
  const calls = [];
  const target = { focus() { this.focused = true; }, scrollIntoView() {} };
  const list = { innerHTML: '', querySelectorAll: () => [], querySelector(selector) {
    return this.innerHTML.includes(selector.slice(1, -1)) ? target : null;
  } };
  const status = { textContent: '', hidden: false };
  let watch;
  const window = {
    location: { search }, MiuUI: { escapeHtml: value => String(value ?? '').replace(/</g, '&lt;') },
    FeedMedia: { render: () => '' }, studentFeedbackForm: () => '',
    siteStartup: { watch: callback => { watch = callback; }, afterStartup: () => {} }
  };
  window.MiuPagination = { create({ render, onError, post: targetPost }) {
    let loaded = false;
    return { filter: 'all', async load() {
      calls.push({ endpoint: '/api/public-content/feed', post: targetPost });
      if (loaded && failRefresh) { onError(new Error('Content unavailable')); return; }
      const items = await university();
      render(items.map(item => ({ club: { id: 0, name: 'Misr International University', image: '/assets/img/pics/logo.svg.png' }, item,
        index: item.id, collection: item.type === 'event' ? 'events' : 'posts', university: true })));
      loaded = true;
    } };
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/assets/js/pages/feed.js'), 'utf8'), {
    window, URLSearchParams, console,
    document: { getElementById: id => id === 'communityFeedList' ? list : status, querySelectorAll: () => [] }
  });
  return { list, status, calls, target, refresh: () => watch() };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const post = { id: 17, type: 'event', title: 'MIU Welcome Day', description: 'University event details', date: '2030-10-20', createdAt: '2026-10-18T10:00:00Z', publishedBy: 'private.staff@example.test' };

test('paginated university events load immediately and retain deep-link focus', async () => {
  const f = fixture({ university: async () => [post], search: '?post=17' });
  await settle();
  assert.equal(f.calls[0].post, 17);
  assert.ok(f.calls.every(call => call.endpoint === '/api/public-content/feed'));
  assert.match(f.list.innerHTML, /MIU Welcome Day/);
  assert.match(f.list.innerHTML, /Misr International University/);
  assert.doesNotMatch(f.list.innerHTML, /private.staff/);
  assert.match(f.list.innerHTML, /data-university-content-id="17"/);
  assert.equal(f.target.focused, true);
});
test('refresh outages cannot clear university events already shown in the feed', async () => {
  const f = fixture({ university: async () => [post], failRefresh: true });
  await settle();
  await f.refresh();
  assert.match(f.list.innerHTML, /MIU Welcome Day/);
  assert.match(f.list.innerHTML, /Misr International University/);
  assert.match(f.status.textContent, /unavailable/);
});
test('university announcements keep the official university name and escaped titles', async () => {
  const f = fixture({ university: async () => [{ ...post, type: 'announcement', title: '<MIU notice>' }] });
  await settle();
  assert.match(f.list.innerHTML, /&lt;MIU notice>/);
  assert.match(f.list.innerHTML, /Misr International University/);
  assert.match(f.list.innerHTML, /University Announcement/);
});
