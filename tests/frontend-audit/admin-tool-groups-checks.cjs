const assert = require('node:assert/strict');
const tools = require('../../public/assets/js/admin-dashboard-tools');

module.exports = async ({ cdp, origin, until, screenshot }) => {
  const ids = tools.groups.flatMap(group => group.toolIds);
  assert.equal(new Set(ids).size, tools.length);
  assert.deepEqual([...ids].sort(), tools.map(tool => tool.id).sort(), 'Every existing tool belongs to exactly one group');
  await cdp.send('Page.navigate', { url: origin + '/admin' });
  await until("document.querySelectorAll('[data-tool-group]').length===10 && !document.getElementById('arrangeCards').disabled");
  await until("!document.documentElement.classList.contains('site-startup-pending')");
  assert.equal(await cdp.evaluate("document.getElementById('toolsCount').textContent.includes('34 tools')"), true);
  assert.equal(await cdp.evaluate("getComputedStyle(document.getElementById('dashboardSummary')).display!=='none'"), true, 'Overview retains its statistics');
  for (const theme of ['light', 'dark']) for (const width of [1440, 375, 320]) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 760 });
    await cdp.evaluate("document.getElementById('managementTools').scrollIntoView({behavior:'instant',block:'start'})");
    await cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `Tool groups fit ${width}px`);
    await screenshot(`admin-tool-groups-${theme}-${width}`);
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.evaluate("document.getElementById('arrangeCards').click(); document.querySelector('.v2-widget').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  assert.equal(await cdp.evaluate("document.querySelector('.v2-widget').dataset.tool"), 'group-account-security', 'Group cards can be arranged');
  await cdp.send('Page.reload');
  await until("document.querySelector('.v2-widget')?.dataset.tool==='group-account-security' && !document.getElementById('arrangeCards').disabled");
  await cdp.evaluate("document.getElementById('arrangeCards').click(); document.getElementById('resetCardOrder').click(); document.getElementById('arrangeCards').click()");
  await cdp.evaluate("document.querySelector('[data-tool-group=staff-roles]').click()");
  await until("document.getElementById('toolsHeading')?.textContent==='Staff & roles' && document.querySelectorAll('.v2-widget').length===4 && !document.getElementById('arrangeCards').disabled");
  assert.deepEqual(await cdp.evaluate("[...document.querySelectorAll('.v2-widget')].map(card=>card.getAttribute('href')).sort()"), ['/admin/custom-roles', '/admin/heads', '/admin/staff', '/admin/supervisors']);
  assert.equal(await cdp.evaluate("[...document.querySelectorAll('[data-overview-only]')].every(el=>getComputedStyle(el).display==='none')"), true, 'Groups do not repeat the overview heading or statistics');
  await cdp.evaluate("document.getElementById('arrangeCards').click(); document.querySelector('.v2-widget').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  assert.equal(await cdp.evaluate("document.querySelector('.v2-widget').dataset.tool"), 'heads', 'Tools inside groups can still be arranged');
  await cdp.send('Page.reload');
  await until("document.querySelector('.v2-widget')?.dataset.tool==='heads' && !document.getElementById('arrangeCards').disabled");
  await cdp.evaluate("document.getElementById('arrangeCards').click(); document.getElementById('resetCardOrder').click(); document.getElementById('arrangeCards').click()");
  await cdp.evaluate("document.getElementById('toolSearch').value='homepage'; document.getElementById('toolSearch').dispatchEvent(new Event('input'))");
  assert.equal(await cdp.evaluate("document.querySelectorAll('.v2-widget').length"), 1);
  assert.equal(await cdp.evaluate("document.querySelector('.v2-widget').getAttribute('href')"), '/admin/homepage', 'Search reaches tools directly across groups');
  await cdp.evaluate("document.getElementById('toolGroupBack').click()");
  await until("document.querySelectorAll('[data-tool-group]').length===10");
  await cdp.evaluate("document.querySelector('#categoryFilters [data-category=attendance]').click()");
  assert.equal(await cdp.evaluate("document.querySelectorAll('.v2-widget').length"), 1);
  await cdp.evaluate("document.querySelector('[data-tool-group=attendance-reports]').click()");
  await until("document.querySelectorAll('.v2-widget').length===4 && document.getElementById('toolsHeading')?.textContent==='Attendance & reports'");
  assert.deepEqual(await cdp.evaluate("[...document.querySelectorAll('.v2-widget')].map(card=>card.dataset.tool).sort()"), ['attendance', 'miu-attendance', 'open-attendance', 'reports']);
  await cdp.send('Page.navigate', { url: origin + '/admin?group=approvals' });
  await until("document.querySelector('.v2-widget[data-tool=blocked-requests] [data-blocked-badge]')");
  await until("!document.documentElement.classList.contains('site-startup-pending')");
  for (const theme of ['light', 'dark']) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 1000, deviceScaleFactor: 1, mobile: true });
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await cdp.evaluate("document.getElementById('managementTools').scrollIntoView({behavior:'instant',block:'start'})");
    await screenshot(`admin-tool-group-inside-${theme}-375`);
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.evaluate("document.documentElement.dataset.theme='light'");
  await cdp.send('Page.navigate', { url: origin + '/admin' });
  await until("document.querySelectorAll('[data-tool-group]').length===10");
};
