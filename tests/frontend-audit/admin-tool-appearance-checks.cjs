const assert = require('node:assert/strict');
module.exports = async ({ cdp, origin, toolIds, until, screenshot }) => {
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  const pages = [...toolIds, 'clubs?club=1', 'heads?club=1&email=head%40example.test', 'application-forms?club=1', 'applications?application=1'];
  const findings = [];
  for (const id of pages) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: origin + '/admin/' + id });
    await until(`document.body?.dataset.tool===${JSON.stringify(id.split('?')[0])} && document.getElementById('toolTitle')?.textContent && document.getElementById('toolContent')?.children.length && !document.documentElement.classList.contains('site-startup-pending')`);
    await until("!document.getElementById('toolContent').innerText.includes('Loading…')");
    if (id === 'staff') await until("document.getElementById('staffForm')?.hidden===false && document.querySelector('#staffAccounts article')");
    if (id === 'supervisors') await until("document.querySelector('#supervisorAccounts article')");
    const name = id.replace(/[^a-z0-9-]+/gi, '-');
    for (const width of [1440, 820, 375]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: width === 375 ? 812 : 1100, deviceScaleFactor: 1, mobile: width < 760 });
      const issues = await cdp.evaluate(`(() => {
        const issues = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('horizontal page overflow');
        const host = document.getElementById('toolContent');
        if (document.getElementById('toolFeedback').classList.contains('is-error')) issues.push(document.getElementById('toolFeedback').textContent);
        for (const field of host.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]),select,textarea')) {
          if (!field.getClientRects().length) continue;
          const style = getComputedStyle(field), rect = field.getBoundingClientRect();
          if (style.backgroundColor === 'rgba(0, 0, 0, 0)') issues.push('unstyled control '+(field.id || field.name));
          if (rect.width > innerWidth || rect.right > innerWidth + 1) issues.push('overflowing control '+(field.id || field.name));
          if (rect.height < 40) issues.push('small control '+(field.id || field.name));
        }
        if (getComputedStyle(document.documentElement).colorScheme !== 'light') issues.push('native controls use the OS dark theme');
        return issues;
      })()`);
      if (issues.length) {
        const overflowing = await cdp.evaluate("[...document.querySelectorAll('#toolContent *')].filter(el=>el.getClientRects().length && el.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(el=>({tag:el.tagName,id:el.id,class:el.className,width:el.getBoundingClientRect().width}))");
        findings.push({ page: id, width, issues, overflowing });
      }
      await screenshot(`tool-${name}-${width}`);
    }
    if (id === 'staff') {
      await cdp.evaluate("document.querySelector('#staffAccounts .secondary-btn').click()");
      await until("document.querySelectorAll('.staff-role-assignment').length===2");
      assert.equal(await cdp.evaluate("document.getElementById('staffEmail').value"), 'staff.member@miuegypt.edu.eg');
      await screenshot('tool-staff-edit-mobile');
      await cdp.evaluate("document.querySelector('.site-theme-toggle').click()");
      assert.equal(await cdp.evaluate("getComputedStyle(document.documentElement).colorScheme"), 'dark');
      await screenshot('tool-staff-dark-mobile');
      await cdp.evaluate("document.querySelector('.site-theme-toggle').click()");
    }
    console.log(`Checked ${id}: desktop, tablet and mobile.`);
  }
  assert.deepEqual(findings, [], 'All tool layouts stay within the viewport with styled controls');
  console.log(`PASS: ${toolIds.length} admin tools and 4 editor pages; native light controls under dark OS settings, responsive layouts, populated staff/supervisor forms and staff role editing. Read-only fixture checks.`);
};
