const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/assets/js/app-home.js'), 'utf8');
const extract = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(clubs) {
  const calls = [], watchers = [];
  let university = [{ id: 17, type: 'event', title: 'MIU event', date: '2030-10-20', organization: { id: 0, name: 'Misr International University', image: '/miu.png' } }];
  const state = { clubs: [], universityContent: [] };
  const context = { state, clubsLoaded: false, clubsLoadedAt: 0, clubsLoadPromise: null, universityContentPrefetchScheduled: false,
    universityContentLoaded: false, universityContentLoadPromise: null, publicContentRefreshStarted: false, universityContentRefreshId: 0,
    publicDataCacheKeys: { clubs: 'clubs', universityContent: 'university' },
    readPublicDataCache: () => null, writePublicDataCache() {}, samePublicData: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    renderClubGrid() {}, renderEventsSlideshow() {}, renderTodayEvents() {},
    window: { siteStartup: { watch: fn => watchers.push(fn) } },
    fetch: async url => { calls.push(url); if (url.includes('/api/clubs')) return clubs(); return { ok: true, json: async () => university }; } };
  vm.createContext(context);
  vm.runInContext(extract('async function loadClubs(', 'async function loadHomepageSettings('), context);
  vm.runInContext(extract('function getAllEvents()', 'function parseEventDate('), context);
  return { context, state, calls, watchers, setUniversity(value) { university = value; } };
}
test('university events load and live-refresh while club loading hangs', async () => {
  const f = fixture(() => new Promise(() => {}));
  void f.context.loadClubs(); await settle();
  assert.ok(f.calls.includes('/api/university-content')); assert.equal(f.state.universityContent[0].title, 'MIU event');
  assert.equal(f.watchers.length, 1);
  f.setUniversity([{ id: 17, type: 'event', title: 'Changed MIU event', description: 'Latest', date: '2030-11-01' }]);
  void f.watchers[0](); await settle();
  assert.equal(f.state.universityContent[0].title, 'Changed MIU event');
  assert.equal(f.state.universityContent[0].date, '2030-11-01');
});
test('club failures cannot block university event loading or leave deleted events visible', async () => {
  const f = fixture(async () => { throw new Error('Club source unavailable'); });
  await assert.rejects(f.context.loadClubs()); await settle();
  assert.equal(f.state.universityContent.length, 1);
  f.setUniversity([]); await f.watchers[0]();
  assert.equal(f.state.universityContent.length, 0);
});
test('calendar/timeline identity uses university source and stable event ID, not array position or a club display name', async () => {
  const f = fixture(async () => ({ ok: true, json: async () => [] }));
  await f.context.loadClubs(); await settle();
  f.state.clubs = [{ id: 5, name: 'Misr International University', events: [{ title: 'Unrelated club event' }] }];
  const events = f.context.getAllEvents();
  const university = events.find(event => event.university);
  assert.equal(university.universityContentId, 17); assert.equal(university.eventIndex, 17);
  assert.equal(university.clubId, 0); assert.equal(university.clubName, 'Misr International University');
  assert.equal(events[0].clubId, 5); assert.notEqual(events[0].university, true);
});
