const assert = require('node:assert/strict');
const P = require('../../services/workflow-policy');
const { validateRole } = require('../../services/custom-staff-roles');
exports.install = app => {
  const state = { roles: [], writes: [] };
  app.get('/api/admin/custom-roles', (req, res) => res.json({ roles: state.roles, clubs: [{ id: 1, name: 'MUN' }], types: P.types, permissions: P.actions, modules: ['requests', 'notifications'] }));
  function save(req, res) {
    try { const { value, members } = validateRole(req.body); const role = { ...value, members, key: 'custom_fixture', version: state.roles.length ? state.roles[0].version + 1 : 1 }; state.roles = [role]; state.writes.push(req.body); res.json(role); }
    catch (error) { res.status(error.status || 500).json({ message: error.message }); }
  }
  app.post('/api/admin/custom-roles', save); app.put('/api/admin/custom-roles/:key', save);
  app.get('/api/custom-dashboard/custom_fixture', (req, res) => res.json({ ...state.roles[0], types: state.roles[0].requestTypes, email: 'reviewer@miuegypt.edu.eg' }));
  return state;
};
exports.run = async ({ cdp, origin, until, screenshot, state }) => {
  await cdp.send('Page.navigate', { url: origin + '/admin/custom-roles' });
  await until("!!document.querySelector('[data-role-form]') && !document.documentElement.classList.contains('site-startup-pending')");
  await cdp.evaluate("document.querySelector('[data-role-form] [name=name]').value='Activities Review Team'; document.querySelector('[data-role-member] [name=email]').value='reviewer@miuegypt.edu.eg'; document.querySelector('[data-role-member] [name=clubIds]').checked=true; document.querySelector('[name=modules][value=notifications]').click(); document.querySelector('[data-role-form]').requestSubmit()");
  await until("document.querySelector('[data-role-feedback]').textContent.startsWith('Saved.')");
  assert.equal(state.writes.length, 1); assert.deepEqual(state.writes[0].members, [{ email: 'reviewer@miuegypt.edu.eg', clubIds: [1] }]); assert.deepEqual(state.roles[0].modules, ['requests']);
  await cdp.evaluate("document.querySelector('[name=permissions][value=reject]').click(); document.querySelector('[data-role-form]').requestSubmit()");
  await until("document.querySelector('[data-role-feedback]').textContent.startsWith('Saved.')");
  assert.equal(state.writes.length, 2); assert.ok(!state.roles[0].permissions.includes('reject'));
  for (const theme of ['light', 'dark']) for (const width of [1440, 375]) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 });
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `Role builder fits ${width}px`); await screenshot(`custom-roles-${theme}-${width}`);
  }
  await cdp.send('Page.navigate', { url: origin + '/admin/workflows' });
  await until("!!document.querySelector('[data-stage] [name=roles][value=custom_fixture]')");
  await cdp.evaluate("document.querySelector('[data-stage] [name=roles][value=custom_fixture]').click(); document.querySelector('[data-stage] [name=roles][value=supervisor]').click()");
  assert.equal(await cdp.evaluate("document.querySelector('[data-stage] input[name=permissions-custom_fixture][value=approve]').checked"), true, 'Newly selected custom role inherits its allowed permissions');
  assert.equal(await cdp.evaluate("!!document.querySelector('[data-stage] input[name=permissions-custom_fixture][value=reject]')"), false, 'Disallowed actions are unavailable');
  await cdp.evaluate("document.querySelector('[data-workflow-editor] form').requestSubmit()");
  await until("document.querySelector('[data-workflow-editor] [data-workflow-feedback]')?.textContent.includes('Workflow saved')");
  await cdp.send('Page.navigate', { url: origin + '/dashboards/custom-role.html?role=custom_fixture' });
  await until("document.getElementById('customRoleTitle')?.textContent==='Activities Review Team'");
  await until("!document.documentElement.classList.contains('site-startup-pending')");
  assert.equal(await cdp.evaluate("!!document.querySelector('#customRoleNavigation [data-role-panel=requests]')"), true);
  assert.equal(await cdp.evaluate("!!document.querySelector('#customRoleNavigation [data-role-panel=notifications]')"), false, 'Unselected tools do not appear');
  await cdp.evaluate("document.querySelector('#customRoleNavigation [data-role-panel=requests]').click()");
  await until("!!document.querySelector('#customRequestsPanel select[name=clubId]')");
  assert.deepEqual(await cdp.evaluate("[...document.querySelector('#customRequestsPanel select[name=type]').options].map(option=>option.value)"), ['', 'event'], 'Only configured request types appear');
  for (const theme of ['light', 'dark']) for (const width of [1440, 375]) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 });
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `Generated dashboard fits ${width}px`); await screenshot(`custom-dashboard-${theme}-${width}`);
  }
};
