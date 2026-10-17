// Real frontend + question routes, isolated in-memory storage. No .env or real accounts.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const express = require('express'), CDP = require('./question-cdp.cjs');
const { respond } = require('./fixtures.cjs');
const { registerClubQuestions } = require('../../services/club-questions');
const root = path.resolve(__dirname, '../..'), output = path.join(root, '.frontend-audit/club-questions');
fs.mkdirSync(output, { recursive: true });
const app = express(); app.use(express.json());
let role = 'president';
const club = { id: 1, name: 'Question Test Club', committee: 'IT', category: 'Test', description: 'Test', tagline: 'Test', requirements: 'Test', status: 'open', image: '/assets/img/pics/mun.jpg', updatedAt: new Date(1), applicationFields: [], interviewForms: [], events: [], posts: [], sponsors: [], booths: [] };
const chain = value => ({ select() { return this; }, lean: async () => structuredClone(value) });
registerClubQuestions(app, {
  Club: { findOne: filter => chain(filter.id === 1 ? club : null), findOneAndUpdate(filter, { $set }) {
    if (Number(filter.updatedAt) !== Number(club.updatedAt)) return chain(null);
    Object.assign(club, structuredClone($set), { updatedAt: new Date(Number(club.updatedAt) + 1) }); return chain(club);
  } },
  ClubAccount: { find: () => chain([{ clubId: 1, role: 'head', committee: 'IT' }, { clubId: 1, role: 'head', committee: 'PR' }]) },
  requireLiveDatabase: () => true, requireClubAuth(req, _res, next) { req.clubAccount = { clubId: 1, role, committee: 'IT' }; next(); }, clubs: [],
  getInterviewFormScope: () => '__president__', getInterviewFormSections: (forms, scope) => (forms.find(f => f.scope === scope) || forms.find(f => f.scope === '__president__'))?.sections || []
});
app.get('/api/club-auth/session', (_req, res) => res.json({ authenticated: true, club: { ...club, clubId: 1, role, committee: 'IT', email: 'fixture@example.test' } }));
app.get('/api/speaker-requests/context', (_req, res) => {
  if (!['president', 'head'].includes(role)) return res.status(403).json({ message: 'Club manager access required' });
  res.json({ identity: { type: 'club', role, clubId: 1, name: 'Fixture manager', email: 'fixture@example.test' }, club: { id: 1, name: club.name }, requests: [] });
});
app.get('/api/site/account-session', (_req, res) => res.json({ authenticated: true, type: 'club', role, name: 'Fixture', email: 'fixture@example.test', dashboards: [] }));
app.get('/api/clubs', (_req, res) => res.json([club]));
app.get('/api/clubs/:id/application-committees', (_req, res) => res.json(['IT', 'PR'].map(committee => ({ committee, label: committee, selectable: true }))));
app.get('/api/student-auth/profile', (_req, res) => res.status(401).json({}));
app.use('/api', (req, res) => {
  const result = respond(new URL(req.originalUrl, 'http://localhost'), req.method, req.headers.referer, req.body) || [200, {}];
  res.status(result[0]).json(result[1]);
});
app.get('/club-dashboard', (_req, res) => res.sendFile(path.join(root, 'public/index.html')));
app.use(express.static(path.join(root, 'public')));
const server = app.listen(0, '127.0.0.1');
let browser, cdp;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) { for (let i = 0; i < 100; i++) { try { if (await cdp.evaluate(expression)) return; } catch (error) { if (!/ReferenceError|Cannot read properties/.test(error.message)) throw error; } await delay(100); } throw Error('Condition not met: ' + expression); }
async function screenshot(name) { await until("!document.documentElement.classList.contains('site-startup-pending')"); await delay(350); const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data, 'base64')); }
(async () => {
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  browser = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${path.join(output, 'profile-' + Date.now())}`, '--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-gpu', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Browser startup timeout')), 15000);
    browser.on('error', reject); browser.stderr.on('data', data => { const match = String(data).match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  const pages = await (await fetch(new URL(endpoint).origin.replace('ws:', 'http:') + '/json/list')).json();
  cdp = new CDP(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: origin + '/club-dashboard' });
  await until("typeof loadPresidentApplicationForm === 'function' && state.clubAccount?.role === 'president'");
  await cdp.evaluate("await loadPresidentApplicationForm(); setPresidentDashboardSection('presidentFormManager'); document.getElementById('addPresidentApplicationFieldBtn').click(); const input = document.querySelector('[data-president-property=label]'); input.value='Whole club question'; input.dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('presidentFormEditor').requestSubmit()");
  await until("document.getElementById('presidentFormFeedback').textContent.includes('Application form saved')");
  assert.equal(club.applicationFields[0].label, 'Whole club question');
  await screenshot('president-application-questions');
  await cdp.send('Page.reload');
  await until("typeof loadPresidentApplicationForm === 'function' && state.clubAccount?.role === 'president'");
  await cdp.evaluate('await loadPresidentApplicationForm()');
  assert.equal(await cdp.evaluate('state.presidentApplicationFields[0].label'), 'Whole club question');
  role = 'head';
  await cdp.send('Page.reload');
  await until("state.clubAccount?.role === 'head' && !document.getElementById('savePresidentApplicationFormBtn').disabled");
  await until("!document.getElementById('speakerContent').hidden");
  assert.equal(await cdp.evaluate("[...document.querySelectorAll('[data-speaker-manager-only]')].every(element=>!element.classList.contains('hidden'))"), true);
  assert.equal(await cdp.evaluate("document.querySelectorAll('#myFormsView a[href*=\"speaker-request\"]').length"), 0, 'Student navigation has no Speaker Request entry');
  await cdp.evaluate("setPresidentDashboardSection('presidentFormManager'); document.getElementById('addPresidentApplicationFieldBtn').click(); const input=document.querySelector('[data-president-property=label]'); input.value='IT question'; input.dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('presidentFormEditor').requestSubmit()");
  await until("document.getElementById('presidentFormFeedback').textContent.includes('Application form saved')");
  assert.equal(club.applicationFields.find(q => q.committee === 'IT').label, 'IT question');
  assert.equal(await cdp.evaluate("document.getElementById('applicationQuestionScope').disabled"), true);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot('head-application-questions-mobile');
  await cdp.evaluate("await loadClubs(true); await openApplicationForm(1); applicationCommitteeInput.value='IT'; applicationCommitteeInput.dispatchEvent(new Event('change'))");
  await until('state.applicationQuestionsReady === true');
  assert.deepEqual(await cdp.evaluate('state.activeApplicationFields.map(q=>q.label)'), ['Whole club question', 'IT question']);
  await screenshot('public-it-questions-mobile');
  await cdp.evaluate("applicationCommitteeInput.value='PR'; applicationCommitteeInput.dispatchEvent(new Event('change'))");
  await until('state.applicationQuestionsReady === true');
  assert.deepEqual(await cdp.evaluate('state.activeApplicationFields.map(q=>q.label)'), ['Whole club question']);
  await cdp.evaluate("await loadPresidentApplicationForm(); showView('head'); setPresidentDashboardSection('presidentFormManager'); document.querySelector('[data-president-action=remove]').click(); document.getElementById('presidentFormEditor').requestSubmit()");
  await until("document.getElementById('presidentFormFeedback').textContent.includes('Application form saved')");
  assert.equal(club.applicationFields.length, 1);
  await cdp.evaluate("await loadInterviewForm(); setPresidentDashboardSection('interviewFormManager'); document.getElementById('addInterviewSectionBtn').click(); document.querySelector('[data-interview-action=add-question]').click(); document.getElementById('saveInterviewFormBtn').click()");
  await until("document.getElementById('interviewFormFeedback').textContent==='Interview form saved.'");
  assert.equal(club.interviewForms[0].sections[0].questions.length, 1);
  await cdp.evaluate("const input=document.querySelector('[data-interview-question-property=label]'); input.value='Edited interview question'; input.dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('saveInterviewFormBtn').click()");
  await until("document.getElementById('interviewFormFeedback').textContent==='Interview form saved.'");
  assert.equal(club.interviewForms[0].sections[0].questions[0].label, 'Edited interview question');
  await screenshot('head-interview-questions-mobile');
  await cdp.evaluate("document.querySelector('[data-interview-action=remove-question]').click(); document.getElementById('saveInterviewFormBtn').click()");
  await until("document.getElementById('interviewFormFeedback').textContent==='Interview form saved.'");
  assert.equal(club.interviewForms[0].sections[0].questions.length, 0);
  role = 'vice_president';
  await cdp.send('Page.reload');
  await until("state.clubAccount?.role === 'vice_president' && !document.getElementById('savePresidentApplicationFormBtn').disabled");
  await cdp.evaluate("setPresidentDashboardSection('presidentFormManager')");
  assert.equal(await cdp.evaluate("document.getElementById('applicationQuestionScope').disabled"), false);
  assert.equal(await cdp.evaluate("[...document.querySelectorAll('[data-speaker-manager-only]')].every(element=>element.classList.contains('hidden'))"), true, 'Vice President has no speaker tools without explicit permission');
  await cdp.evaluate("setPresidentDashboardSection('speakerRequestDashboardPanel')");
  assert.equal(await cdp.evaluate("document.getElementById('speakerRequestDashboardPanel').classList.contains('hidden')"), true, 'Manually selecting a forbidden section does not expose the form');
  assert.deepEqual(cdp.events.filter(e => e.method === 'Runtime.exceptionThrown'), []);
  console.log('PASS: browser application CRUD/reload, committee isolation, dynamic public questions, interview CRUD, Head/President/Vice President access, mobile screenshots, no JavaScript exceptions.');
})().catch(async error => { console.error(error); if (cdp) console.log(await cdp.evaluate('JSON.stringify({feedback: document.getElementById("applicationFeedback")?.textContent, ready: state.applicationQuestionsReady, selected: state.selectedClub?.id, clubIds: state.clubs.map(c=>c.id)})')); process.exitCode = 1; }).finally(() => { cdp?.socket.close(); browser?.kill(); server.close(); });
