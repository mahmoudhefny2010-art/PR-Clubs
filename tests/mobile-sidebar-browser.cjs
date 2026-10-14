// Isolated layout check: no accounts, API access or database connection.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  assert.ok(browser, 'Chrome or Edge is required');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'miu-sidebar-check-'));
  const admin = fs.readFileSync(path.join(root, 'private/global-admin.html'), 'utf8');
  const styles = admin.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
  const names = ['Overview', 'Club Heads', 'Clubs', 'Analysis', 'MIU Posts', 'Student feedback', 'MIU polls & evaluations', 'Applications', 'Event reports', 'Attendance sheets per event'];
  let fixture = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/css/base.css"><style>${styles}</style><link rel="stylesheet" href="/assets/css/pages/event-reports.css"><link rel="stylesheet" href="/assets/css/mobile-sidebars.css"><main class="app-container"><div class="report-admin-layout"><div id="adminTabs" class="tab-bar report-admin-sidebar">${names.map((n, i) => `<button class="tab-btn ${i ? '' : 'active'}">${n}</button>`).join('')}</div><section>Dashboard content</section></div></main><script src="/assets/js/mobile-sidebars.js"></script>`;
  if (process.argv.includes('--homepage')) fixture = fixture
    .replace('<div class="report-admin-layout"><div id=', '<div class="admin-panel"><header class="admin-header"><h2>Admin dashboard</h2><div id=')
    .replace('tab-bar report-admin-sidebar', 'admin-session-actions homepage-admin-sidebar')
    .replace('</div><section>Dashboard content', '</div></header><section>Dashboard content');
  if (process.argv.includes('--events')) fixture = fs.readFileSync(path.join(root, 'public/pages/report-downloads.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace('</body>', '<script>history.replaceState(null,"","?type=attendance")</script><script src="/assets/js/pages/report-downloads.js"></script></body>');
  if (process.argv.includes('--registration')) fixture = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/css/base.css"><form id="regForm"><div class="field-group"><input required></div><button type="submit">Register</button></form><p id="regFeedback"></p><script type="module">import "/assets/js/student-event-registration.js";window.mountStudentEventRegistration(document.getElementById("regForm"),document.getElementById("regFeedback"),"/api/events/1/0/registrations");</script>';
  if (process.argv.includes('--audience')) {
    const eventPage = fs.readFileSync(path.join(root, 'public/pages/event-form.html'), 'utf8');
    const eventForm = eventPage.match(/<form id="contentForm"[\s\S]*?<\/form>/)?.[0] || '';
    const globalAdmin = fs.readFileSync(path.join(root, 'private/global-admin.html'), 'utf8');
    const adminStyles = globalAdmin.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
    const universityPublisher = globalAdmin.match(/<div class="university-publisher">([\s\S]*?)<\/div>\s*<h3 class="analysis-title">/)?.[1] || '';
    const visiblePublisher = universityPublisher.replace('id="universityEventFields" hidden', 'id="universityEventFields"').replace('id="universityAudienceField" for=', 'id="universityAudienceField" for=');
    fixture = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/css/base.css"><link rel="stylesheet" href="/assets/css/pages/content-form.css"><style>${adminStyles}</style><main class="app-container"><section class="committee-card"><h2>Club event</h2><div class="content-layout"><div class="panel">${eventForm}</div></div></section><section class="committee-card"><h2>MIU event</h2><div class="university-publisher">${visiblePublisher}</div></section></main>`;
  }
  let registered = false;
  const server = http.createServer((req, res) => {
    if (req.url === '/api/events/1/0/registrations') {
      if (req.method === 'POST') registered = true;
      if (req.method === 'DELETE') registered = false;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ registered, eligible: true, cancellationAllowed: registered, message: registered ? 'Registration confirmed, not physical attendance.' : 'Registration open to non-members.' }));
    }
    if (req.url.startsWith('/api/report-downloads/')) {
      res.setHeader('Content-Type', 'application/json');
      if (req.url.endsWith('/clubs')) return res.end(JSON.stringify({ clubs: [{ id: 2, name: 'MUN' }, { id: 0, name: 'MIU events' }], attendance: true, reports: true }));
      return res.end(JSON.stringify({ events: (req.url.includes('clubId=2') || req.url.includes('clubId=all')) ? [{ clubId: 2, clubName: 'MUN', key: 'request:18', title: 'Welcome Meetup', date: '2026-10-15' }] : [], message: 'No published MIU events' }));
    }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(fixture); }
    const file = path.resolve(root, 'public', '.' + req.url);
    if (!file.startsWith(path.join(root, 'public') + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'application/javascript; charset=utf-8'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const marker = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(marker); i++) await sleep(100);
    assert.ok(fs.existsSync(marker), 'Browser did not start');
    const port = fs.readFileSync(marker, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let id = 0; const pending = new Map();
    socket.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value; };
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    if (process.argv.includes('--registration')) {
      for (let i = 0; i < 80 && !await evaluate('document.querySelector("#regFeedback")?.textContent.includes("non-members")'); i++) await sleep(100);
      assert.equal(await evaluate('document.querySelector("#regForm input").required'), false);
      await evaluate('document.querySelector("#regForm").requestSubmit()'); await sleep(250);
      assert.equal(await evaluate('document.querySelector("#regForm [type=submit]").textContent'), 'Already registered');
      assert.equal(await evaluate('document.querySelector("[data-student-cancel]").hidden'), false);
      await evaluate('window.confirm=()=>true;document.querySelector("[data-student-cancel]").click()'); await sleep(250);
      assert.equal(await evaluate('document.querySelector("#regForm [type=submit]").disabled'), false);
      console.log('PASS: mobile registration shows eligibility, submits without identity fields, persists status and cancels only when allowed.'); return;
    }
    if (process.argv.includes('--events')) {
      for (let i = 0; i < 80 && !await evaluate('!!document.querySelector("#downloadEvent") && !document.querySelector("#downloadEvent").disabled'); i++) await sleep(100);
      assert.equal(await evaluate('document.querySelector("#downloadEvent").selectedOptions[0].textContent.includes("Welcome Meetup")'), true);
      assert.equal(await evaluate('document.querySelector("#downloadEvents article").hidden'), false);
      await evaluate('document.querySelector("#downloadClub").value="0";document.querySelector("#downloadClub").dispatchEvent(new Event("change",{bubbles:true}))'); await sleep(300);
      await evaluate('document.querySelector("#downloadClub").value="2";document.querySelector("#downloadClub").dispatchEvent(new Event("change",{bubbles:true}))'); await sleep(300);
      assert.equal(await evaluate('document.querySelector("#downloadEvent").disabled'), false);
      console.log('PASS: MUN events load, selected event opens, and switching back from MIU restores club choices.'); return;
    }
    if (process.argv.includes('--audience')) {
      for (const width of [320, 390, 740, 1024]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 }); await sleep(80);
        const layout = await evaluate(`(() => { const selects=[...document.querySelectorAll('#eventAudienceInput,#universityPostAudience')]; return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,selects:selects.map(x=>({width:x.getBoundingClientRect().width,right:x.getBoundingClientRect().right,box:x.parentElement.getBoundingClientRect().width}))}; })()`);
        assert.equal(layout.selects.length, 2);
        assert.ok(layout.scrollWidth <= layout.width, `Horizontal overflow at ${width}px: ${JSON.stringify(layout)}`);
        assert.ok(layout.selects.every(item => item.width > 0 && item.right <= width + 1), `Audience control clipped at ${width}px: ${JSON.stringify(layout)}`);
      }
      console.log('PASS: Club and MIU audience controls fit 320px–1024px layouts without horizontal overflow.'); return;
    }
    for (let i = 0; i < 50 && !await evaluate('!!document.querySelector(".dashboard-drawer-toggle")'); i++) await sleep(100);
    await evaluate('document.querySelector(".dashboard-drawer-toggle").click()'); await sleep(300);
    const dimensions = await evaluate(`(() => { const d=document.getElementById('adminTabs'), b=d.querySelector('.dashboard-drawer-close'), r=d.getBoundingClientRect(); return {left:r.left,width:r.width,height:r.height,visible:getComputedStyle(d).visibility,close:b.textContent,closeWidth:b.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth}; })()`);
    assert.equal(dimensions.left, 0); assert.ok(dimensions.width <= 288); assert.equal(dimensions.visible, 'visible'); assert.equal(dimensions.close, '×'); assert.equal(dimensions.closeWidth, 40); assert.equal(dimensions.overflow, false);
    await evaluate('document.querySelector(".dashboard-drawer-overlay").click()');
    assert.equal(await evaluate('document.querySelector(".dashboard-drawer-toggle").getAttribute("aria-expanded")'), 'false');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); await sleep(100);
    assert.equal(await evaluate('document.getElementById("adminTabs").inert'), false);
    console.log('PASS: 390px drawer fits, opens, closes, has a 40px close control, and restores desktop navigation.');
  } finally { socket?.close(); child.kill(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
