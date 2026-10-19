// Dependency-free Chrome DevTools comparison, entirely isolated from the backend.
// node tests/frontend-audit/browser.cjs baseline|styles|final [--quick]
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { respond, reset: resetFixtures } = require('./fixtures.cjs');
const root = path.resolve(__dirname, '../..');
const stage = process.argv[2] || 'final';
const quick = process.argv.includes('--quick');
const settled = process.argv.includes('--settled');
const artifacts = path.join(root, '.frontend-audit');
const sourceIndex = process.argv.indexOf('--source');
const source = sourceIndex >= 0 ? path.resolve(root, process.argv[sourceIndex + 1])
  : stage === 'baseline' || process.argv.includes('--original') ? path.join(artifacts, 'baseline') : root;
const output = path.join(artifacts, stage === 'baseline' ? 'browser-baseline' : `browser-${stage}`);
const baseline = require('../../docs/frontend-audit/baseline.json');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const browserPath = process.env.FRONTEND_AUDIT_BROWSER || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((file) => fs.existsSync(file));
assert.ok(browserPath, 'Set FRONTEND_AUDIT_BROWSER to an installed Chrome/Chromium executable.');
fs.mkdirSync(output, { recursive: true });

const { fingerprint: pixels, compare: comparePng } = require('./png.cjs');

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url); this.nextId = 0; this.pending = new Map(); this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve); this.socket.addEventListener('error', reject); });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const item = this.pending.get(message.id);
        if (!item) return;
        clearTimeout(item.timer); this.pending.delete(message.id);
        message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
      } else for (const fn of this.listeners.get(message.method) || []) fn(message.params);
    });
  }
  on(name, callback) { this.listeners.set(name, [...(this.listeners.get(name) || []), callback]); }
  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

const serverRequests = [];
let activeScenario = '';
const missing = new Set();
const routes = { '/': 'public/index.html', '/admin': 'private/admin-dashboard-v2.html', '/admin/login': 'public/pages/admin-login.html', '/club-login': 'public/index.html', '/club-dashboard': 'public/index.html', '/__audit/club-entry-permit': 'public/index.html', '/__audit/dean-entry-permit': 'public/dashboards/dean-dashboard.html', '/attendance': 'public/attendance.html' };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (url.pathname === '/api/site/public-data-stream') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' }); res.write('event: ready\\ndata: {}\\n\\n'); return; }
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString(); let body;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    serverRequests.push({ method: req.method, url: url.pathname + url.search, body });
    if (activeScenario === 'my-forms-initial-loading' && url.pathname === '/api/clubs') await sleep(650);
    if (activeScenario === 'club-dashboard-initial-loading' && url.pathname === '/api/club-auth/session') await sleep(650);
    const [status, data] = respond(url, req.method, req.headers.referer || '', body, activeScenario);
    if (status === 404) missing.add(`${req.method} ${url.pathname}`);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data)); return;
  }
  const relative = routes[url.pathname] || `public${decodeURIComponent(url.pathname)}`;
  const full = path.resolve(source, relative);
  if (!full.startsWith(source + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    missing.add(url.pathname); res.writeHead(404); res.end('Audit fixture not found'); return;
  }
  res.writeHead(200, { 'Content-Type': `${types[path.extname(full)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(full));
});

const pages = baseline.files.filter((f) => f.path.endsWith('.html') && !f.path.includes('/components/') && !f.path.startsWith('private/') && fs.existsSync(path.join(source,f.path))).map((f) => ({
  name: path.basename(f.path, '.html'),
  url: f.path === 'public/index.html' ? '/' : f.path.slice(6),
}));
if (process.argv.includes('--all-pages')) {
  const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
  for (const file of walk(path.join(source, 'public')).filter(file => file.endsWith('.html') && !file.includes(`${path.sep}components${path.sep}`))) {
    const url = '/' + path.relative(path.join(source, 'public'), file).replace(/\\/g, '/');
    const target = url === '/index.html' ? '/' : url;
    if (!pages.some(page => page.url === target)) pages.push({ name: path.basename(file, '.html'), url: target });
  }
}
const extras = [
  { name: 'account-menu-custom-role', url: '/', action: "document.getElementById('headerStudentProfileTrigger').click()", expect: "!document.getElementById('headerStudentProfileMenu').hidden && document.getElementById('headerAccountDashboardLink').hidden && document.querySelector('#headerDashboardChoiceList button').textContent==='Activities Review Team' && document.getElementById('headerStudentProfileLink').getAttribute('href')==='/dashboards/custom-role.html?role=custom_review'" },
  { name: 'account-menu-multi-student', url: '/', action: "document.getElementById('headerStudentProfileTrigger').click()", expect: "document.getElementById('headerAccountDashboardLink').hidden && !document.getElementById('headerDashboardChoices').hidden && document.querySelectorAll('#headerDashboardChoiceList button').length===12 && [...document.querySelectorAll('#headerDashboardChoiceList button')].filter(button=>button.textContent==='My Dashboard').length===1" },
  { name: 'account-menu-visible', url: '/', action: "document.getElementById('headerStudentProfileTrigger').click()", expect: "(() => { const menu=document.getElementById('headerStudentProfileDropdown'), email=document.getElementById('headerStudentName'), options=document.querySelectorAll('#headerDashboardChoiceList button'), logout=document.getElementById('headerStudentSignoutBtn'); const r=menu.getBoundingClientRect(); if(menu.hidden || r.left<0 || r.right>innerWidth || r.bottom>innerHeight || options.length!==11 || getComputedStyle(email).whiteSpace==='nowrap' || email.scrollWidth>email.clientWidth+1)return false; menu.scrollTop=menu.scrollHeight; const end=logout.getBoundingClientRect(); const accessible=end.bottom<=r.bottom && end.top>=r.top; menu.scrollTop=0; return accessible; })()" },
  { name: 'account-menu-student-dashboard', url: '/', action: "document.getElementById('headerStudentProfileTrigger').click(); document.getElementById('headerStudentProfileLink').click()", expect: "location.pathname==='/' && new URLSearchParams(location.search).get('myForms')==='1' && !document.getElementById('myFormsView').classList.contains('hidden')" },
  ...Object.entries({ admin: '/admin', software_development: '/admin', president: '/club-dashboard', vice_president: '/club-dashboard', head: '/club-dashboard', supervisor: '/dashboards/supervisor-dashboard.html', pr: '/dashboards/pr-dashboard.html', english: '/dashboards/english-dashboard.html', security: '/dashboards/security-dashboard.html', sso: '/dashboards/sso-dashboard.html', dean: '/dashboards/dean-dashboard.html', miu_events: '/dashboards/miu-events-dashboard.html' }).map(([role, href]) => ({
    name: `account-menu-role-${role}`, url: '/', action: "document.getElementById('headerStudentProfileTrigger').click()",
    expect: `document.getElementById('headerStudentProfileLink').getAttribute('href')===${JSON.stringify(href)}`
  })),
  { name: 'account-menu-president-back-forward', url: '/', action: "document.getElementById('headerStudentProfileTrigger').click(); document.getElementById('headerStudentProfileLink').click()", expect: "location.pathname==='/club-dashboard'", backForward: true },
  { name: 'account-menu-role-expired', url: '/', action: "document.getElementById('headerStudentProfileTrigger').click()", expect: "document.getElementById('headerStudentProfileMenu').hidden && document.getElementById('headerAuthBtn').getAttribute('href')==='/pages/applicant-login.html'" },
  { name: 'my-forms-initial-loading', url: '/?myForms=1', expect: "document.documentElement.classList.contains('auth-route-pending') && getComputedStyle(document.getElementById('homeView')).display==='none' && getComputedStyle(document.getElementById('authLoadingView')).display==='grid'" },
  { name: 'club-dashboard-initial-loading', url: '/club-dashboard', expect: "document.documentElement.classList.contains('auth-route-pending') && getComputedStyle(document.getElementById('homeView')).display==='none' && getComputedStyle(document.getElementById('authLoadingView')).display==='grid'" },
  { name: 'club-dashboard-expired-session', url: '/club-dashboard', action: "new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{if(location.pathname==='/pages/applicant-login.html'){clearInterval(timer);resolve()}else if(Date.now()-started>3000){clearInterval(timer);reject(Error('Expired session did not reach sign-in'))}},25)})", expect: "location.pathname==='/pages/applicant-login.html'" },
  { name: 'club-dashboard', url: '/club-dashboard' },
  { name: 'club-attendance-approval-status', url: '/club-dashboard', action: "new Promise(resolve=>setTimeout(()=>{document.getElementById('openAttendanceManagerBtn').click();setTimeout(()=>{document.querySelector('.attendance-records-details summary').click();setTimeout(resolve,350)},250)},250))", expect: "document.getElementById('attendanceRecordsList').innerText.includes('SSO approved · Waiting for Dean') && document.getElementById('attendanceRecordsList').innerText.includes('Test Student')" },
  { name: 'club-entry-permit-dashboard', url: '/club-dashboard?auditEntryPermit=1', action: 'new Promise(resolve=>setTimeout(resolve,700))', expect: "document.getElementById('approvalCheckpointTrack').innerText.includes('Campus Access Request') && document.getElementById('approvalCheckpointTrack').innerText.includes('PR final review') && document.getElementById('approvalCheckpointTrack').innerText.includes('Dean view')" },
  { name: 'club-entry-permit-dashboard-form', url: '/club-dashboard', action: "new Promise(resolve=>setTimeout(()=>{document.getElementById('openEntryPermitDialogBtn').click();const form=document.getElementById('dashboardEntryPermitForm');form.elements.title.value='Equipment access';form.elements.date.value='2026-10-10';form.elements.location.value='Main gate';document.querySelector('#dashboardPermitItemsBody [name=number]').value='MIU-42';document.querySelector('#dashboardPermitItemsBody [name=details]').value='Camera equipment';document.getElementById('addPermitItemRowBtn').click();const second=document.querySelectorAll('#dashboardPermitItemsBody tr')[1];second.querySelector('[name=quantity]').value='3';second.querySelector('[name=number]').value='ST-22';second.querySelector('[name=details]').value='Student crew';form.requestSubmit();setTimeout(resolve,450)},450))", expect: "document.getElementById('dashboardEntryPermitFeedback').textContent.includes('submitted to PR') && document.querySelectorAll('#dashboardPermitItemsBody tr').length===1" },
  { name: 'club-studio-embedded', url: '/pages/club-content.html?embed=1' },
  { name: 'reset-valid-link', url: '/pages/reset-password.html?token=audit-token' },
  { name: 'attendance-valid-link', url: `/attendance?token=${'a'.repeat(44)}` },
  { name: 'calendar-open', url: '/', action: "window.openCalendarAt(2026,9,9); if(document.querySelector('.calendar-modal').classList.contains('hidden')) throw Error('Calendar not open')" },
  { name: 'club-details', url: '/', action: "document.querySelector('[data-action=\"view-club\"]').click()" },
            { name: 'university-feed', url: '/pages/feed.html', expect: "document.getElementById('communityFeedList').innerText.includes('MIU community update') && document.getElementById('communityFeedList').innerText.includes('University welcome event')" },
  { name: 'university-event-details', url: '/pages/event.html?university=702', expect: "document.getElementById('eventPageTitle').textContent==='University welcome event' && document.getElementById('regForm').hidden" },
  { name: 'university-event-calendar', url: '/', action: "window.openCalendarAt(2026,9,20)", expect: "document.getElementById('calendarGrid').innerText.includes('University welcome event')" },
  ...['pr', 'english', 'dean'].map((role) => ({ name: `${role}-request-details`, url: `/dashboards/${role}-dashboard.html`, action: "document.querySelector('#requestsList .view-details').click()", expect: "document.getElementById('requestDialog').open" })),
  { name: 'security-entry-permit-details', url: '/dashboards/security-dashboard.html', action: "document.querySelector('#requestsList .view-details').click()", expect: "document.getElementById('requestDialog').open && document.getElementById('requestDetails').innerText.includes('Entry Permit')" },
  { name: 'security-entry-permit-approve', url: '/dashboards/security-dashboard.html', action: "document.querySelector('#requestsList .approve').click()", expect: "document.getElementById('requestsList').innerText.includes('No pending requests for your stage.')" },
  { name: 'dean-entry-permit-details', url: '/dashboards/dean-dashboard.html', action: "new Promise(resolve=>setTimeout(()=>{document.getElementById('openStatusOverviewBtn').click();setTimeout(()=>{document.querySelector('#statusOverviewList .view-details').click();setTimeout(resolve,200)},200)},250))", expect: "document.getElementById('requestDialog').open && document.getElementById('dialogApproveBtn').hidden && document.getElementById('dialogRejectBtn').hidden && document.getElementById('requestDetails').innerText.includes('Security Office')" },
  { name: 'forgot-submit', url: '/pages/forgot-password.html', action: "document.getElementById('recoveryEmail').value='student@example.test'; document.getElementById('forgotPasswordForm').requestSubmit()", expect: "document.getElementById('forgotPasswordFeedback').textContent.includes('reset link')" },
  { name: 'reset-mismatch', url: '/pages/reset-password.html?token=audit-token', action: "document.getElementById('newPassword').value='Audit-password-123';document.getElementById('confirmNewPassword').value='different-password-456';document.getElementById('resetPasswordForm').requestSubmit()", expect: "document.getElementById('resetPasswordFeedback').textContent==='Passwords do not match.'" },
  { name: 'reset-submit', url: '/pages/reset-password.html?token=audit-token', action: "document.getElementById('newPassword').value='Audit-password-123';document.getElementById('confirmNewPassword').value='Audit-password-123';document.getElementById('resetPasswordForm').requestSubmit()", expect: "document.getElementById('resetPasswordForm').hidden && !document.getElementById('resetBackToLogin').classList.contains('hidden')" },
  { name: 'login-rejected', url: '/pages/applicant-login.html', action: "document.getElementById('uniId').value='student@example.test';document.getElementById('uniPassword').value='Audit-password-123';document.getElementById('studentLoginForm').requestSubmit()", expect: "document.getElementById('loginFeedback').textContent==='Fixture login rejected.'" },
  ...['event', 'feed', 'sponsor', 'booth'].map((type) => ({ name: `${type}-edit`, url: `/pages/${type}-form.html`, action: "document.querySelector('[data-edit]').click()", expect: "document.getElementById('formTitle').textContent.startsWith('Edit ')" })),
  { name: 'entry-permit-draft', url: '/pages/entry-permit-form.html', expect: "document.getElementById('titleInput') instanceof HTMLInputElement && document.getElementById('dateInput').type==='date' && document.getElementById('timeInput').type==='time' && document.getElementById('locationInput') instanceof HTMLInputElement && document.querySelector('#entryPermitItemsBody [name=quantity]').type==='number' && document.querySelector('#entryPermitItemsBody [name=number]') && document.querySelector('#entryPermitItemsBody [name=details]') && document.body.innerText.includes('Approved permits stay in your club dashboard.')" },
  { name: 'event-draft-submit', url: '/pages/event-form.html', action: "document.getElementById('titleInput').value='New audit event';document.getElementById('contentForm').requestSubmit()", expect: "document.getElementById('titleInput').value===''" },
  { name: 'event-required-validation', url: '/pages/event-form.html', action: "document.getElementById('contentForm').requestSubmit()", expect: "!document.getElementById('titleInput').checkValidity()", dismissNativeValidation: true },
  { name: 'theme-toggle', url: '/pages/event-form.html', action: "document.querySelector('.site-theme-toggle').click()", expect: "localStorage.getItem('miu-site-theme')===document.documentElement.dataset.theme" },
];
const viewports = process.argv.includes('--sidebar-viewports') ? [
  { name: 'small-mobile', width: 320, height: 568 }, { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 }, { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 768 }, { name: 'short-mobile', width: 568, height: 320 }
] : process.argv.includes('--narrow') ? [{ name: 'narrow', width: 320, height: 720 }]
  : quick ? [{ name: 'desktop', width: 1366, height: 900 }] : [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844 }];
for (const section of ['feed', 'events', 'sponsors', 'booths']) {
  const id = { feed: 'communityFeedList', events: 'eventsList', sponsors: 'sponsorsList', booths: 'boothsList' }[section];
  extras.push({ name: `pagination-${section}-page-two`, url: `/pages/${section}.html`,
    action: `new Promise((resolve,reject)=>{document.querySelector('.content-pagination button:last-child').click();const start=Date.now();const timer=setInterval(()=>{if(document.querySelector('.content-pagination [aria-current="page"]')?.textContent==='2'){clearInterval(timer);resolve()}else if(Date.now()-start>4000){clearInterval(timer);reject(Error('Page two did not load'))}},25)})`,
    expect: `document.getElementById('${id}').innerText.includes('Pagination item ${section === 'events' || section === 'sponsors' ? 9 : 11}') && document.querySelector('.content-pagination [aria-current="page"]').textContent==='2' && document.querySelector('.content-pagination').getBoundingClientRect().right <= innerWidth && document.documentElement.scrollWidth <= innerWidth ${section === 'events' ? "&& !document.getElementById('feedTimelineSection') && document.querySelectorAll('.content-pagination').length===1 && !document.body.innerText.includes('Latest Club Updates')" : ''}`
  });
}
extras.push({ name: 'pagination-feed-filter-reset', url: '/pages/feed.html?feedPage=2',
  action: `new Promise((resolve,reject)=>{document.querySelector('[data-filter="announcements"]').click();const timer=setInterval(()=>{if(document.querySelector('.content-pagination').hidden){clearInterval(timer);resolve()}},25);setTimeout(()=>{clearInterval(timer);reject(Error('Filter did not reset pagination'))},4000)})`,
  expect: `document.querySelector('.content-pagination').hidden && document.getElementById('communityFeedList').children.length===3 && !location.search.includes('feedPage=2')`
});
extras.push({ name: 'pagination-feed-empty', url: '/pages/feed.html', expect: `document.querySelector('.content-pagination').hidden && document.getElementById('communityFeedList').children.length===0 && !document.getElementById('communityFeedStatus').hidden` });
extras.push({ name: 'pagination-feed-single', url: '/pages/feed.html', expect: `document.querySelector('.content-pagination').hidden && document.getElementById('communityFeedList').children.length===3` });
const changeUniversity = `await fetch('/api/miu-events/content/702',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Updated MIU event',description:'Updated university details',date:'2026-10-09',time:'16:15',location:'Hall B'})});window.miuLiveData.invalidate(['universityContent']);`;
for (const [name, url] of [['miu-sidebar-layout', '/dashboards/miu-events-dashboard.html'], ['pr-sidebar-layout', '/dashboards/pr-dashboard.html']]) extras.push({ name, url,
  action: `window.__sidebarMetrics=(()=>{const s=document.querySelector('.committee-sidebar'),c=getComputedStyle(s),r=s.getBoundingClientRect();return {width:r.width,height:r.height,position:c.position,display:c.display,font:c.fontFamily,fontSize:c.fontSize,color:c.color,background:c.backgroundColor,padding:c.padding,borderRadius:c.borderRadius,links:[...s.querySelectorAll('a')].map(a=>[a.textContent.trim(),a.getAttribute('href')]),drawer:!!document.querySelector('.dashboard-drawer-toggle')}})()`
});
for (const [name, url] of [['miu-sidebar-contract', '/dashboards/miu-events-dashboard.html'], ['pr-sidebar-contract', '/dashboards/pr-dashboard.html']]) extras.push({ name, url,
  action: require('./sidebar-checks.cjs').action, expect: 'window.__sidebarTestPassed===true'
});
const waitUniversity = condition => `const started=performance.now();while(!(${condition})){if(performance.now()-started>4000)throw Error('University view did not refresh: '+(document.getElementById('universityPostMessage')?.textContent||''));await new Promise(resolve=>setTimeout(resolve,30));}`;
extras.push({ name: 'miu-sync-home', url: '/',
  action: `(async()=>{${changeUniversity}${waitUniversity("document.querySelector('#todayEvents a[href=\"/pages/event.html?university=702\"]')")}document.querySelector('#todayEvents a[href="/pages/event.html?university=702"]').click()})()`,
  expect: `!document.getElementById('eventModal').classList.contains('hidden') && document.getElementById('eventModalTitle').textContent==='Updated MIU event' && document.getElementById('eventModalClub').textContent==='Misr International University' && document.getElementById('eventModalDescription').textContent.includes('Updated university details')`
});
extras.push({ name: 'miu-sync-detail', url: '/pages/event.html?university=702',
  action: `(async()=>{${changeUniversity}${waitUniversity("document.getElementById('eventPageDescription').textContent==='Updated university details'")}})()`,
  expect: `document.getElementById('eventPageTitle').textContent==='Updated MIU event' && document.getElementById('eventPageClub').textContent==='Misr International University' && document.getElementById('eventPageMeta').textContent.includes('Hall B') && !document.getElementById('eventPageContent').hidden`
});
for (const section of ['feed', 'events']) {
  const list = section === 'feed' ? 'communityFeedList' : 'eventsList';
  extras.push({ name: `miu-sync-${section}`, url: `/pages/${section}.html`,
    action: `(async()=>{${changeUniversity}${waitUniversity(`document.getElementById('${list}').innerText.includes('Updated MIU event')`)}})()`,
    expect: `document.getElementById('${list}').textContent.includes('Misr International University') && document.getElementById('${list}').innerText.includes('Campus workshop') && document.getElementById('${list}').innerText.split('Updated MIU event').length===2`
  });
}
extras.push({ name: 'miu-sync-dashboard-edit', url: '/dashboards/miu-events-dashboard.html#miuEventsPanel',
  action: `(async()=>{document.querySelector('[data-dashboard-panel="miuEventsPanel"]').click();document.querySelector('[data-edit-university-post="702"]').click();document.getElementById('universityPostDescription').value='Edited through MIU dashboard';document.getElementById('universityPostTime').value='16:15';document.getElementById('universityPostForm').requestSubmit();${waitUniversity("document.getElementById('universityPostRecords').innerText.includes('Edited through MIU dashboard')")}})()`,
  expect: `document.getElementById('miuEventsCount').textContent==='2' && !document.getElementById('universityPostType').disabled && document.getElementById('universityPostRecords').innerText.includes('Misr International University')`
});
extras.push({ name: 'miu-sync-dashboard-create', url: '/dashboards/miu-events-dashboard.html#miuEventsPanel',
  action: `(async()=>{document.querySelector('[data-dashboard-panel="miuEventsPanel"]').click();document.getElementById('universityPostTitle').value='New MIU event';document.getElementById('universityPostDescription').value='New university event details';document.getElementById('universityPostAudience').value='all_students';document.getElementById('universityPostDate').value='2030-10-20';document.getElementById('universityPostForm').requestSubmit();${waitUniversity("document.getElementById('universityPostRecords').innerText.includes('New MIU event')")}})()`,
  expect: `document.getElementById('miuEventsCount').textContent==='3' && document.getElementById('universityPostRecords').innerText.split('New MIU event').length===2`
});
for (const section of ['feed', 'events', 'sponsors', 'booths']) {
  const modal = section === 'sponsors' ? 'sponsorDetail' : section === 'booths' ? 'boothDetail' : 'eventModal';
  const trigger = section === 'feed' ? '[data-feed-event]' : section === 'events' ? '[data-event-open]' : `.${section === 'sponsors' ? 'sponsor' : 'booth'}-timeline-item`;
  const title = section === 'events' || section === 'sponsors' ? 9 : 11;
  extras.push({ name: `pagination-${section}-details`, url: `/pages/${section}.html?${section}Page=2`,
    action: `new Promise((resolve,reject)=>{document.querySelector('${trigger}').click();const start=Date.now();const timer=setInterval(()=>{if(!document.getElementById('${modal}').classList.contains('hidden')){clearInterval(timer);resolve()}else if(Date.now()-start>4000){clearInterval(timer);reject(Error('Details did not open'))}},25)})`,
    expect: `!document.getElementById('${modal}').classList.contains('hidden') && document.getElementById('${modal}').innerText.includes('Pagination item ${title}')`
  });
  extras.push({ name: `pagination-${section}-last-page`, url: `/pages/${section}.html?${section}Page=999`,
    action: `document.querySelector('.content-pagination').scrollIntoView({block:'end',behavior:'instant'})`,
    expect: `document.querySelector('.content-pagination button:last-child').disabled && document.querySelector('.content-pagination [aria-current="page"]') && document.querySelector('.content-pagination').getBoundingClientRect().right<=innerWidth && document.documentElement.scrollWidth<=innerWidth`
  });
}

async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = path.join(artifacts, `chrome-profile-${stage}-${Date.now()}`);
  const browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--disk-cache-dir=${path.join(profile, 'cache')}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { windowsHide: true, env: { ...process.env, TEMP: artifacts, TMP: artifacts }, stdio: ['ignore', 'ignore', 'pipe'] });
  let client;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Chrome did not start within 20 seconds.')), 20000);
      browser.once('error', (error) => { clearTimeout(timeout); reject(error); });
      browser.stderr.on('data', (chunk) => { const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    });
    const debug = new URL(endpoint);
    const target = await fetch(`http://${debug.host}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
    client = new CDP(target.webSocketDebuggerUrl);
    await client.send('Page.enable'); await client.send('Runtime.enable'); await client.send('Network.enable');
    await client.send('Emulation.setTimezoneOverride', { timezoneId: 'Africa/Cairo' });
    await client.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    const external = new Set();
    client.on('Fetch.requestPaused', ({ requestId, request, resourceType }) => {
      const local = request.url.startsWith(origin) || /^(data:|about:)/.test(request.url);
      if (!local) external.add(new URL(request.url).hostname);
      const command = local ? client.send('Fetch.continueRequest', { requestId }) : client.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: resourceType === 'Stylesheet' ? 'text/css' : 'application/javascript' }], body: '' });
      command.catch(() => {});
    });
    let exceptions = [], consoleIssues = [], expectedConsoleIssues = [];
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => exceptions.push((exceptionDetails.exception?.description || exceptionDetails.text).split('\n')[0]));
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (['error', 'warning'].includes(type)) consoleIssues.push(`${type}: ${args.map(arg => arg.value ?? arg.description ?? '').join(' ')}`);
    });
    await client.send('Log.enable');
    client.on('Log.entryAdded', ({ entry }) => {
      if (!['error', 'warning'].includes(entry.level)) return;
      const issue = `${entry.level}: ${entry.text}${entry.url ? ` (${entry.url})` : ''}`;
      // The existing isolated fixtures explicitly reject workflow context without
      // a workflow session. Keep that exact network diagnostic in the report;
      // all other console errors (including other 401s) remain failures.
      const expectedWorkflowDenial = entry.source === 'network'
        && entry.url === `${origin}/api/workflow/context`
        && entry.text === 'Failed to load resource: the server responded with a status of 401 (Unauthorized)'
        && respond(new URL(entry.url), 'GET', '', null, activeScenario)?.[0] === 401;
      (expectedWorkflowDenial ? expectedConsoleIssues : consoleIssues).push(issue);
    });
    const merge = process.argv.includes('--merge');
    const previousResultsFile = path.join(output, 'results.json');
    const previousRun = merge && fs.existsSync(previousResultsFile) ? JSON.parse(fs.readFileSync(previousResultsFile, 'utf8')) : null;
    const results = previousRun?.results || [];
    for (const hostname of previousRun?.externalHostsStubbed || []) external.add(hostname);
    for (const fixture of previousRun?.missingFixtures || []) missing.add(fixture);
    const capturedInRun = [];
    let injection;
    const expectedFile = path.join(artifacts, 'browser-baseline/results.json');
    const expected = stage === 'baseline' ? null : JSON.parse(fs.readFileSync(expectedFile, 'utf8'));
    const filterIndex = process.argv.indexOf('--match');
    const filter = filterIndex >= 0 ? new RegExp(process.argv[filterIndex + 1]) : null;
    for (const viewport of viewports) for (const theme of ['light', 'dark']) for (const scenario of [...pages, ...extras].filter((s) => !filter || filter.test(s.name))) {
      if (settled) {
        if (injection) { await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection }); injection = null; }
        await client.send('Page.navigate', { url: 'about:blank' }); await sleep(100);
      }
      activeScenario = scenario.name;
      resetFixtures();
      const key = `${scenario.name}-${viewport.name}-${theme}`;
      exceptions = []; consoleIssues = []; expectedConsoleIssues = []; serverRequests.length = 0;
      await client.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
      if (injection) await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection });
      ({ identifier: injection } = await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear(); ${settled ? 'sessionStorage.clear();' : ''} localStorage.setItem('miu-site-theme',${JSON.stringify(theme)}); const AuditDate=Date; window.Date=class extends AuditDate{constructor(...args){super(...(args.length?args:['2026-10-09T08:00:00.000Z']))}static now(){return 1791532800000}}; document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';document.head.append(s)});` }));
      await client.send('Page.navigate', { url: origin + scenario.url });
      for (let i = 0; i < 80; i++) {
        await sleep(35);
        if (await client.evaluate("document.readyState==='complete'").catch(() => false)) break;
      }
      await sleep(220);
      if (settled) await sleep(3000); // Let startup jobs and the existing typewriter finish.
      if (scenario.action) { await client.evaluate(scenario.action); await sleep(250); }
      if (settled) {
        await sleep(600);
        await client.evaluate("Promise.all([...document.images].filter(image=>image.complete).map(image=>image.decode().catch(()=>{})))");
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
      }
      if (scenario.expect) {
        const passed = await client.evaluate(scenario.expect);
        if (!passed && scenario.name.startsWith('miu-sync-')) console.log(await client.evaluate("document.querySelector('main').innerText.slice(0,2500)"));
        assert.equal(passed, true, `Interaction failed: ${key}`);
      }
      if (scenario.backForward) {
        await client.evaluate('history.back()');
        for (let i = 0; i < 40 && await client.evaluate("location.pathname!=='/'").catch(() => true); i++) await sleep(50);
        assert.equal(await client.evaluate('location.pathname'), '/', 'Back returns from the account dashboard to the prior page');
        await client.evaluate('history.forward()');
        for (let i = 0; i < 40 && await client.evaluate("location.pathname!=='/club-dashboard'").catch(() => true); i++) await sleep(50);
        assert.equal(await client.evaluate('location.pathname'), '/club-dashboard', 'Forward restores the selected account dashboard');
      }
      // Browser-owned validation bubbles animate outside the DOM/CSS snapshot.
      // Assert validity first, then dismiss the bubble on both original and current pages.
      if (scenario.dismissNativeValidation) {
        await client.evaluate('document.activeElement?.blur()');
        await sleep(350);
      }
      // Committee navigation scrolls smoothly. Wait for scroll positions to stop
      // changing before reading geometry and taking its paired screenshot.
      await client.evaluate(`new Promise((resolve,reject)=>{let last='',stable=0;const start=performance.now();function frame(){const positions=JSON.stringify([window.scrollX,window.scrollY,...[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight||e.scrollWidth>e.clientWidth).map(e=>[e.scrollLeft,e.scrollTop])]);stable=positions===last?stable+1:0;last=positions;if(stable>=8)return resolve();if(performance.now()-start>3000)return reject(new Error('Scroll positions did not settle'));requestAnimationFrame(frame)}requestAnimationFrame(frame)})`);
      const state = await client.evaluate(`(() => {
        const props=['display','color','backgroundColor','fontFamily','fontSize','fontWeight','lineHeight','borderRadius','borderColor','padding','margin','gap','gridTemplateColumns','textAlign','opacity','visibility'];
        return {title:document.title,theme:document.documentElement.dataset.theme,text:document.body.innerText,sidebarCheck:window.__sidebarCheck,sidebarMetrics:window.__sidebarMetrics,elements:[...document.body.querySelectorAll('*')].filter(el=>!['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el=>{const r=el.getBoundingClientRect();if(!r.width&&!r.height)return null;const s=getComputedStyle(el);return [el.tagName,el.id,el.getAttribute('class'),[r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100),props.map(p=>s[p]),el instanceof HTMLInputElement?{value:el.value,checked:el.checked,disabled:el.disabled}:null]}).filter(Boolean)};
      })()`);
      const image = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
      const png = Buffer.from(image.data, 'base64');
      fs.writeFileSync(path.join(output, key + '.png'), png);
      const record = { key, pixel: pixels(png), stateHash: sha(JSON.stringify(state)), exceptions: [...new Set(exceptions)].sort(), consoleIssues: scenario.name.includes('sidebar') ? [...new Set(consoleIssues)].sort() : undefined, expectedConsoleIssues: scenario.name.includes('sidebar') ? [...new Set(expectedConsoleIssues)].sort() : undefined, api: [...serverRequests].map((r) => JSON.stringify(r)).sort() };
      fs.writeFileSync(path.join(output, key + '.json'), JSON.stringify(state));
      if (expected && !process.argv.includes('--no-baseline')) {
        const before = expected.results.find((r) => r.key === key);
        if (before) {
          record.pixelDelta = comparePng(fs.readFileSync(path.join(artifacts, 'browser-baseline', key + '.png')), png);
          record.matches = { pixels: record.pixelDelta.pass, state: record.stateHash === before.stateHash, exceptions: JSON.stringify(record.exceptions) === JSON.stringify(before.exceptions), api: JSON.stringify(record.api) === JSON.stringify(before.api) };
        } else {
          record.newScenario = true;
        }
      }
      record.captureProcedure = 'settled-scroll-and-validation';
      const oldIndex = results.findIndex((r) => r.key === key);
      if (oldIndex >= 0) results[oldIndex] = record; else results.push(record);
      capturedInRun.push(key);
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ stage, scenarios: results.length, capturedInLastRun: capturedInRun, merged: merge, externalHostsStubbed: [...external], missingFixtures: [...missing], results }, null, 2));
      if (capturedInRun.length % 10 === 0) console.log(`${stage}: ${capturedInRun.length} browser scenarios captured`);
    }
    const failures = results.filter((r) => r.matches && Object.values(r.matches).some((v) => !v));
    console.log(JSON.stringify({ stage, scenarios: results.length, capturedInRun: capturedInRun.length, merged: merge, missingFixtures: [...missing], exceptions: results.filter((r) => r.exceptions.length).map((r) => ({ key: r.key, exceptions: r.exceptions })), consoleIssues: results.filter(r => r.consoleIssues?.length).map(r => ({ key: r.key, issues: r.consoleIssues })), expectedConsoleIssues: results.reduce((total, r) => total + (r.expectedConsoleIssues?.length || 0), 0), mismatches: failures.map((r) => ({ key: r.key, matches: r.matches })) }, null, 2));
    if (failures.length || missing.size || results.some(r => r.consoleIssues?.length)) process.exitCode = 1;
  } finally {
    client?.close(); browser.kill(); server.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; server.close(); });
