const assert = require('node:assert/strict');
module.exports = async ({ cdp, origin, requests, homepage, fixtures, setFailSave, emitUpdate, until, screenshot }) => {
  await require('./admin-tool-groups-checks.cjs')({ cdp, origin, until, screenshot });
  const destinations = require('../../public/assets/js/admin-dashboard-tools').map(tool => '/admin/' + tool.id);
  for (const destination of destinations) {
    const response = await fetch(origin + destination, { headers: { cookie: 'fixture_admin=1' } });
    assert.equal(response.status, 200, destination);
    const html = await response.text();
    assert.ok(html.includes('id="adminWorkspaceHeader"') && html.includes('id="site-footer"'), destination);
    assert.equal(html.includes('<dialog'), false, 'Tool pages do not use dialogs');
  }
  await until("!!document.querySelector('#adminWorkspaceHeader .topbar-container') && !!document.querySelector('#site-footer footer')");
  await screenshot('desktop');
  async function openTool(id) {
    await cdp.send('Page.navigate', { url: origin + '/admin/' + id });
    await until(`document.body?.dataset.tool==='${id.split('?')[0]}' && !!document.getElementById('toolContent') && !document.getElementById('toolContent').textContent.includes('Loading…')`);
  }
  await cdp.evaluate("document.getElementById('toolSearch').value='homepage'; document.getElementById('toolSearch').dispatchEvent(new Event('input'))");
  assert.equal(await cdp.evaluate("document.querySelectorAll('.v2-widget').length"), 1);
  await cdp.evaluate("document.querySelector('[data-tool=homepage]').click()");
  await until("!!document.getElementById('homepageForm')");
  assert.equal(await cdp.evaluate('location.pathname'), '/admin/homepage');
  await cdp.evaluate("document.querySelector('#homepageForm [name=title]').value='Updated welcome'; document.getElementById('homepageForm').requestSubmit()");
  await until("document.getElementById('toolFeedback').textContent==='Homepage saved.'");
  setFailSave(true);
  await cdp.evaluate("document.getElementById('homepageForm').requestSubmit()");
  await until("document.getElementById('toolFeedback').textContent==='Fixture write failed.'");
  setFailSave(false);
  await cdp.send('Page.reload'); await until("!!document.getElementById('homepageForm')");
  assert.equal(await cdp.evaluate('location.pathname'), '/admin/homepage', 'Reload keeps the tool');
  const loaded = requests.filter(req => req.path === '/api/admin/homepage' && req.method === 'GET').length;
  await cdp.send('Page.reload'); await until("!!document.getElementById('homepageForm')");
  assert.equal(requests.filter(req => req.path === '/api/admin/homepage' && req.method === 'GET').length, loaded, 'Reload reuses unchanged saved data');
  homepage().title = 'External update'; emitUpdate(['homepage']);
  await until("document.querySelector('#homepageForm [name=title]')?.value==='External update'");
  await cdp.evaluate("const input=document.querySelector('#homepageForm [name=title]');input.value='Unsaved draft';input.dispatchEvent(new Event('input',{bubbles:true}))");
  homepage().title = 'Another update'; emitUpdate(['homepage']);
  await until("!document.getElementById('pendingUpdates').hidden");
  assert.equal(await cdp.evaluate("document.querySelector('#homepageForm [name=title]').value"), 'Unsaved draft', 'Live updates preserve edits');
  await cdp.evaluate("document.getElementById('applyUpdates').click()");
  await until("!document.getElementById('inlineConfirmation').hidden");
  await cdp.evaluate("document.querySelector('[data-decision=yes]').click()");
  await until("document.querySelector('#homepageForm [name=title]')?.value==='Another update'");
  await cdp.evaluate("document.getElementById('toolBack').click()");
  await until("location.pathname==='/admin' && document.querySelectorAll('.v2-widget').length>0");
  await openTool('applications'); await until("!!document.querySelector('[data-status=accepted]')");
  assert.equal(await cdp.evaluate("document.querySelector('#toolContent strong').textContent"), '<Student>');
  await cdp.evaluate("document.querySelector('[data-status=accepted]').click()");
  await until("!document.getElementById('inlineConfirmation').hidden");
  await cdp.evaluate("document.querySelector('[data-decision=yes]').click()");
  await until("document.getElementById('toolFeedback').textContent==='Application updated.'");
  assert.equal(fixtures['/api/admin/applications'][0].status, 'accepted');
  await openTool('archives'); await until("!!document.querySelector('[data-restore]')");
  await cdp.evaluate("document.querySelector('[data-restore]').click()");
  await until("!document.getElementById('inlineConfirmation').hidden");
  await cdp.evaluate("document.querySelector('[data-decision=yes]').click()");
  await until("document.getElementById('toolFeedback').textContent==='Club restored.'");
  for (const [id, expected] of [['members', 'Test Member'], ['heads', 'head@example.test'], ['analytics', 'Unique visitors'], ['data', 'Database'], ['recovery', 'Account email']]) {
    await openTool(id); await until(`document.getElementById('toolContent').textContent.includes(${JSON.stringify(expected)})`);
  }
  await cdp.evaluate("document.querySelector('#recoveryForm [name=email]').value='member@example.test'; document.getElementById('recoveryForm').requestSubmit()");
  await until("document.getElementById('toolFeedback').textContent==='Fixture reset link sent.'");
  fixtures['/api/clubs'][1].status = 'open'; emitUpdate(['clubs']);
  await openTool('clubs'); await until("document.querySelectorAll('[data-move-club]').length===4");
  assert.equal(await cdp.evaluate("document.querySelector('[data-move-club=\"1\"][data-direction=\"-1\"]').disabled"), true);
  setFailSave(true);
  await cdp.evaluate("document.querySelector('[data-move-club=\"1\"][data-direction=\"1\"]').click()");
  await until("document.getElementById('toolFeedback').textContent==='Fixture write failed.'");
  assert.equal(await cdp.evaluate("document.querySelector('#clubManagementList strong').textContent"), 'Science Club', 'Failed saves retain the previous order');
  setFailSave(false);
  await cdp.evaluate("document.querySelector('[data-move-club=\"1\"][data-direction=\"1\"]').click()");
  await until("document.getElementById('toolFeedback').textContent==='Home page order saved.'");
  assert.equal(await cdp.evaluate("document.querySelector('#clubManagementList strong')?.textContent"), 'Art Club', 'Live updates during saving must not replace the reordered list');
  assert.deepEqual(requests.filter(req => req.path === '/api/admin/clubs/order').at(-1).body.ids, [2, 1]);
  await cdp.send('Page.reload'); await until("document.querySelectorAll('[data-move-club]').length===4");
  assert.equal(await cdp.evaluate("document.querySelector('#clubManagementList strong').textContent"), 'Art Club', 'Saved order survives reload');
  await until("!document.documentElement.classList.contains('site-startup-pending')");
  await screenshot('club-management');
  await openTool('clubs?club=1'); await until("!!document.getElementById('clubEditorForm')");
  assert.equal(await cdp.evaluate("document.querySelector('#clubEditorForm [name=name]').value"), 'Science Club');
  assert.equal(await cdp.evaluate("!document.querySelector('#clubEditorForm [name=applicants], #clubEditorForm [name=members], #clubEditorForm [name=seats]')"), true, 'Applicant, member and seat totals are not manually editable');
  assert.equal(await cdp.evaluate("document.querySelector('#clubEditorForm').textContent.includes('Applicant and member totals update automatically')"), true, 'The editor explains how totals are calculated');
  await cdp.evaluate("document.querySelector('#clubEditorForm [name=description]').value='Updated science community'; document.getElementById('clubEditorForm').requestSubmit()");
  await until("document.getElementById('toolFeedback').textContent==='Club saved.'");
  assert.equal(fixtures['/api/clubs'][0].description, 'Updated science community');
  await cdp.send('Page.reload'); await until("!!document.getElementById('clubEditorForm')");
  assert.equal(await cdp.evaluate('location.search'), '?club=1');
  await openTool('heads?email=head%40example.test'); await until("!!document.getElementById('headEditorForm')");
  await cdp.evaluate("document.querySelector('#headEditorForm [name=committee]').value='Organizing'; document.getElementById('headEditorForm').requestSubmit()");
  await until("document.getElementById('toolFeedback').textContent==='Head account saved.'");
  assert.equal(fixtures['/api/admin/club-heads'][0].committee, 'Organizing');
  for (const [id, text] of [
    ['committees', 'Science Club'], ['committees?club=1', 'Organizing'], ['club-order', 'Save club order'],
    ['application-forms?club=1', 'Save application questions'], ['club-feedback', 'Science Club'],
    ['club-feedback?target=1', 'Helpful sessions'], ['university-feedback?target=1', 'Robotics'],
    ['club-analytics', 'Most viewed clubs'], ['event-analytics', 'Science fair'],
    ['account-passwords', 'Set club or dashboard password'], ['admin-settings', 'admin@example.test'],
    ['website-content', 'MIU science fair'], ['profile', 'Account photo']
  ]) {
    await openTool(id); await until(`document.getElementById('toolContent').textContent.includes(${JSON.stringify(text)})`);
    assert.equal(await cdp.evaluate("document.querySelectorAll('dialog[open]').length"), 0);
  }
  await openTool('committees?club=1'); await until("!!document.getElementById('committeeSettings')");
  await cdp.evaluate("document.querySelector('#committeeSettings select').value='closed'; document.getElementById('committeeSettings').requestSubmit()");
  await until("document.getElementById('toolFeedback').textContent==='Committee availability saved.'");
  await openTool('application-forms?club=1'); await until("!!document.getElementById('applicationQuestionsForm')");
  await cdp.evaluate("document.querySelector('#questionRows [name=label]').value='Updated interest question'; document.getElementById('applicationQuestionsForm').requestSubmit()");
  await until("document.getElementById('toolFeedback').textContent==='Application questions saved.'");
  assert.equal(fixtures['/api/clubs'][0].applicationFields[0].label, 'Updated interest question');
  await openTool('club-order'); await until("!!document.getElementById('clubOrderForm')");
  await cdp.evaluate("document.getElementById('clubOrderForm').requestSubmit()");
  await until("document.getElementById('toolFeedback').textContent==='Club order saved.'");
  await openTool('applications?application=1'); await until("!!document.getElementById('applicationReviewForm')");
  await cdp.evaluate("document.querySelector('#applicationReviewForm [name=notes]').value='Interview complete'; document.querySelector('#applicationReviewForm [name=rating]').value='4'; document.getElementById('applicationReviewForm').requestSubmit()");
  await until("document.getElementById('toolFeedback').textContent==='Application review saved.'");
  await openTool('account-passwords?email=president%40example.test'); await until("!!document.getElementById('directPasswordForm')");
  await cdp.evaluate("document.querySelector('#directPasswordForm [name=password]').value='Fixture-password-123'; document.querySelector('#directPasswordForm [name=confirmPassword]').value='Fixture-password-123'; document.getElementById('directPasswordForm').requestSubmit()");
  await until("document.getElementById('toolFeedback').textContent==='Fixture password saved.'");
  for (const id of ['application-forms?club=1', 'club-analytics', 'club-feedback?target=1', 'staff', 'publishing']) {
    await openTool(id);
    await until("document.getElementById('toolContent').children.length>0 && !document.getElementById('toolContent').innerText.includes('Loading…')");
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `Tool stays within mobile width: ${id}`);
    assert.equal(await cdp.evaluate("document.getElementById('toolTitle').getClientRects().length>0"), true);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  }
  for (const id of ['staff', 'supervisors', 'publishing', 'miu-attendance', 'reports', 'attendance', 'open-attendance']) {
    await openTool(id); await until("document.getElementById('toolContent').querySelectorAll('form').length>0");
    await until("!!document.querySelector('#site-footer footer')");
    assert.equal(await cdp.evaluate("document.querySelectorAll('#toolContent a[href=\"/admin\"], #toolContent a[href=\"/admin/global\"]').length"), 0);
    assert.equal(await cdp.evaluate("document.querySelectorAll('dialog[open]').length"), 0);
    if (id === 'reports') {
      await until("!document.documentElement.classList.contains('site-startup-pending')");
      await screenshot('event-reports');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
      await screenshot('event-reports-mobile');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    }
  }
  await cdp.send('Page.navigate', { url: origin + '/admin' });
  await until("document.querySelectorAll('[data-tool-group]').length===10");
  await cdp.evaluate("document.querySelector('#categoryFilters [data-category=attendance]').click()");
  assert.equal(await cdp.evaluate("document.querySelectorAll('.v2-widget').length"), 1);
  await cdp.send('Page.reload'); await until("document.querySelectorAll('[data-tool-group]').length===1");
  await cdp.evaluate("document.querySelector('#categoryFilters [data-category=all]').click()");
  for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 600], [1024, 440], [820, 1180], [375, 812]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 760 });
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `No horizontal overflow at ${width}x${height}`);
    if (width >= 760) assert.equal(await cdp.evaluate("document.querySelector('.v2-sidebar').scrollHeight<=document.querySelector('.v2-sidebar').clientHeight+1"), true, `Sidebar fits at ${width}x${height}`);
  }
  await screenshot('mobile');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await until("!document.getElementById('arrangeCards').disabled");
  await cdp.evaluate("document.getElementById('arrangeCards').click(); document.querySelector('.v2-widget').scrollIntoView({block:'center',behavior:'instant'})");
  const touchPositions = await cdp.evaluate("[...document.querySelectorAll('.v2-widget')].slice(0,2).map(card=>{const r=card.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})");
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...touchPositions[0], id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...touchPositions[1], id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await cdp.evaluate("document.querySelector('.v2-widget').dataset.tool"), 'group-account-security', 'Touch drag rearranges group cards on mobile');
  await cdp.evaluate("document.getElementById('resetCardOrder').click(); document.getElementById('arrangeCards').click(); scrollTo(0,0)");
  await cdp.evaluate("document.querySelector('.site-theme-toggle').click()");
  await screenshot('mobile-dark');
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await until("document.body.innerText.includes('You are offline.')");
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await until("!document.body.innerText.includes('You are offline.')");
  await cdp.send('Page.navigate', { url: origin + '/admin' });
  await until("document.querySelectorAll('[data-tool-group]').length===10");
};
