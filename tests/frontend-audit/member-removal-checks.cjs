const assert = require('node:assert/strict');
module.exports = async ({ cdp, until, screenshot }) => {
  await cdp.evaluate(`window.memberRemovalFixture = { originalFetch: window.fetch, originalRole: state.clubAccount.role, deletes: 0, fail: true,
    members: [{ id: 'manual', name: 'Manual Member', committee: 'IT', position: 'Head', memberType: 'senior' },
      { id: 'application-10', name: 'Accepted Member', committee: 'IT', position: 'Member', source: 'accepted-application' }] };
    window.fetch = async (url, options = {}) => {
      const fixture = window.memberRemovalFixture;
      if (String(url).startsWith('/api/club/members')) {
        if (options.method === 'DELETE') {
          fixture.deletes++;
          if (fixture.fail) return new Response(JSON.stringify({ message: 'Fixture removal failed.' }), { status: 503 });
          fixture.members = fixture.members.filter(member => member.id !== decodeURIComponent(String(url).split('/').pop()));
          return new Response(JSON.stringify({ totalCount: fixture.members.length }));
        }
        return new Response(JSON.stringify({ members: fixture.members, committees: ['IT'], totalCount: fixture.members.length }));
      }
      return fixture.originalFetch(url, options);
    };
    state.clubAccount.role = 'president';
    document.getElementById('openMemberManagerBtn').click();
    loadClubMembers(true);`);
  await until("document.querySelectorAll('#clubMemberList .delete-btn').length===2");
  await screenshot('member-removal-desktop');
  await cdp.evaluate("document.querySelector('#clubMemberList .delete-btn').click()");
  assert.equal(await cdp.evaluate('memberRemovalFixture.deletes'), 0, 'Opening confirmation never removes membership');
  await cdp.evaluate("document.querySelector('.member-removal-confirmation .secondary-btn').click()");
  assert.equal(await cdp.evaluate('memberRemovalFixture.deletes'), 0, 'Cancel leaves membership intact');
  await cdp.evaluate("document.querySelector('#clubMemberList .delete-btn').click();document.querySelector('.member-removal-confirmation').requestSubmit()");
  await until("document.querySelector('.member-removal-confirmation [role=alert]').textContent==='Fixture removal failed.'");
  assert.equal(await cdp.evaluate('memberRemovalFixture.members.length'), 2);
  await cdp.evaluate("memberRemovalFixture.fail=false;document.querySelector('.member-removal-confirmation').requestSubmit()");
  await until("document.querySelectorAll('#clubMemberList .member-roster-card').length===1 && !document.querySelector('.member-removal-confirmation')");
  assert.equal(await cdp.evaluate("document.querySelector('#clubMemberList strong').textContent"), 'Accepted Member');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await screenshot('member-removal-mobile');
  assert.equal(await cdp.evaluate("document.querySelector('#clubMemberList').scrollWidth <= document.querySelector('#clubMemberList').clientWidth + 1"), true, 'Member actions fit on mobile');
  await cdp.evaluate("document.querySelector('#clubMemberList .delete-btn').click();document.querySelector('.member-removal-confirmation').requestSubmit()");
  await until("document.querySelectorAll('#clubMemberList .member-roster-card').length===0");
  await cdp.evaluate("memberRemovalFixture.members=[{ id: 'head-visible', name: 'Committee Member', committee: 'IT', position: 'Member' }];state.clubAccount.role='head';loadClubMembers(true)");
  await until("document.querySelector('#clubMemberList strong')?.textContent==='Committee Member'");
  assert.equal(await cdp.evaluate("document.querySelectorAll('#clubMemberList .delete-btn').length"), 0, 'Heads retain role editing without president removal controls');
  await cdp.evaluate("window.fetch=memberRemovalFixture.originalFetch;state.clubAccount.role=memberRemovalFixture.originalRole;delete window.memberRemovalFixture");
  console.log('PASS: club member removal confirmation/cancel, save failure/retry, manual and accepted member controls, refreshed list, president-only controls and mobile layout. Fixture writes only.');
};
