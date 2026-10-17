const assert = require('node:assert/strict');
module.exports = async ({ cdp, origin, fixtures, requests, until, screenshot }) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  const club = fixtures['/api/clubs'][0];
  club.events = [
    { title: 'Later workshop', date: '2026-12-12', time: '14:00', endTime: '16:00', location: 'Library room 2', description: 'Details for the later workshop only.', image: '/assets/img/pics/mun.jpg', budget: '100 EGP', registrationEnabled: true, attendanceEnabled: true, attendanceAudience: 'members' },
    { title: 'Earlier workshop', date: '2026-11-01', description: 'Earlier details <img src=x onerror=alert(1)>', image: '/missing-event-image.png' },
    { title: 'Long description workshop', date: '2026-11-15', description: 'The complete event programme remains readable. '.repeat(700), image: '/assets/img/pics/pwa-icon-192.png' },
    { title: 'Optional details omitted' }
  ];
  await cdp.send('Page.navigate', { url: origin + '/' });
  await until("typeof openClubDetail==='function' && typeof loadClubs==='function' && typeof window.formatSiteTime==='function'");
  await cdp.evaluate("window.miuLiveData.invalidate(['clubs']);loadClubs(true)");
  await until("state.clubs.find(c=>c.id===1)?.events?.length===4");
  await cdp.evaluate('openClubDetail(1)');
  await until("document.querySelectorAll('#clubDetail [data-event-index]').length===4");
  assert.equal(await cdp.evaluate("document.querySelector('#clubDetail [data-event-index]').dataset.eventIndex"), '1', 'Sorted cards retain their original event identity');
  assert.equal(await cdp.evaluate("document.querySelectorAll('#clubDetail [id^=events-desc-]').length"), 0, 'Event descriptions are absent from inline markup');
  const requestCount = () => requests.filter(r => r.path === '/api/clubs' || /^\/api\/events\//.test(r.path)).length;
  const before = requestCount();
  await cdp.evaluate("document.querySelector('#clubDetail [data-event-index=\"1\"]').focus();document.querySelector('#clubDetail [data-event-index=\"1\"]').click()");
  await until("document.getElementById('eventCardInfoTitle')?.textContent==='Earlier workshop'");
  await until("!document.querySelector('#eventCardInfoModal .event-modal-image')");
  assert.equal(await cdp.evaluate("document.getElementById('eventCardInfoDescription').textContent"), club.events[1].description);
  assert.equal(await cdp.evaluate("document.querySelectorAll('#eventCardInfoDescription img').length"), 0, 'Description remains text');
  assert.equal(await cdp.evaluate("document.getElementById('clubView').classList.contains('active') && location.pathname==='/'"), true, 'Background page and route stay unchanged');
  assert.equal(await cdp.evaluate("document.body.style.overflow==='hidden' && document.querySelector('.page-shell').inert"), true);
  await cdp.evaluate("document.querySelector('#eventCardInfoModal h2').click()");
  assert.equal(await cdp.evaluate("Boolean(document.getElementById('eventCardInfoModal'))"), true, 'Content clicks do not dismiss');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
  assert.equal(await cdp.evaluate("document.activeElement.getAttribute('aria-label')"), 'Close event information', 'Tab stays in dialog');
  await cdp.evaluate("document.querySelector('#eventCardInfoModal button').click()");
  assert.equal(await cdp.evaluate("!document.getElementById('eventCardInfoModal') && !document.querySelector('.page-shell').inert && document.body.style.overflow!== 'hidden'"), true);
  assert.equal(await cdp.evaluate('document.activeElement.dataset.eventIndex'), '1', 'Focus returns to Info');
  await cdp.evaluate("document.querySelector('#clubDetail [data-event-index=\"0\"]').click()");
  assert.equal(await cdp.evaluate("document.getElementById('eventCardInfoTitle').textContent"), 'Later workshop');
  const details = await cdp.evaluate("document.getElementById('eventCardInfoModal').innerText");
  for (const text of ['Library room 2', '100 EGP', 'Club members only', 'Details for the later workshop only.']) assert.ok(details.includes(text), text);
  assert.ok(!details.includes('Earlier details'));
  assert.equal(requestCount(), before, 'Info opens reuse loaded data without detail/registration API requests');
  const sharedStyles = await cdp.evaluate("(()=>{const current=getComputedStyle(document.getElementById('eventCardInfoModal').querySelector('.event-modal-panel')),original=getComputedStyle(document.querySelector('#eventModal .event-modal-panel'));return ['backgroundColor','borderRadius','padding','boxShadow'].every(k=>current[k]===original[k])})()");
  assert.equal(sharedStyles, true, 'Original event popup styling is reused');
  await screenshot('event-info-desktop');
  const columns = await cdp.evaluate("(()=>{const m=document.getElementById('eventCardInfoModal'),image=m.querySelector('img').getBoundingClientRect(),copy=m.querySelector('.event-modal-copy').getBoundingClientRect();return {image:{left:image.left,right:image.right,top:image.top},copy:{left:copy.left,top:copy.top}}})()");
  assert.ok(columns.image.right <= columns.copy.left && Math.abs(columns.image.top - columns.copy.top) < 2, 'Desktop two-column layout: ' + JSON.stringify(columns));
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  assert.equal(await cdp.evaluate("Boolean(document.getElementById('eventCardInfoModal'))"), false, 'Escape closes popup');
  await cdp.evaluate("document.querySelector('#clubDetail [data-event-index=\"0\"]').click();document.getElementById('eventCardInfoModal').click()");
  assert.equal(await cdp.evaluate("Boolean(document.getElementById('eventCardInfoModal'))"), false, 'Overlay closes popup');
  for (const width of [1440, 768, 375, 320]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 });
    await cdp.evaluate("document.querySelector('#clubDetail [data-event-index=\"2\"]').click()");
    const layout = await cdp.evaluate("(()=>{const p=document.querySelector('#eventCardInfoModal .event-modal-panel'),r=p.getBoundingClientRect();return {scrolls:p.scrollHeight>p.clientHeight,inside:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,description:document.getElementById('eventCardInfoDescription').textContent.length}})()");
    assert.equal(layout.scrolls, true); assert.equal(layout.inside, true, `Popup fits ${width}px`);
    assert.equal(layout.description, club.events[2].description.trim().length);
    await cdp.evaluate("document.querySelector('#eventCardInfoModal .event-modal-panel').scrollTop=5000");
    const closeVisible = await cdp.evaluate("(()=>{const r=document.querySelector('#eventCardInfoModal button').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()");
    assert.equal(closeVisible, true, 'Shared close control remains reachable while scrolling');
    if (width === 375) await screenshot('event-info-mobile-long');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  }
  await cdp.evaluate("document.querySelector('#clubDetail [data-event-index=\"3\"]').click()");
  assert.equal(await cdp.evaluate("document.querySelectorAll('#eventCardInfoModal .event-modal-meta, #eventCardInfoModal .event-modal-description').length"), 0);
  assert.equal(await cdp.evaluate("/undefined|null|Invalid Date/.test(document.getElementById('eventCardInfoModal').innerText)"), false);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.evaluate("document.body.style.overflow='clip';document.querySelector('#clubDetail [data-event-index=\"0\"]').click();window.openEventInfoPopup({title:'Image-free details'},document.querySelector('#clubDetail [data-event-index=\"0\"]'))");
  assert.equal(await cdp.evaluate("document.querySelectorAll('#eventCardInfoModal').length"), 1, 'Consecutive opens replace the current popup');
  assert.equal(await cdp.evaluate("document.querySelectorAll('#eventCardInfoModal img').length"), 0);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  assert.equal(await cdp.evaluate('document.body.style.overflow'), 'clip', 'Previous scroll style is restored');
  await cdp.evaluate("document.body.style.overflow=''");
  club.posts = [
    { title: 'Older feed', createdAt: '2026-10-01', text: 'Older feed details' },
    { title: 'Newer feed', createdAt: '2026-10-10', text: 'Full feed text\nSecond line <img src=x onerror=alert(1)>', description: 'Additional description', author: 'Fixture author' }
  ];
  club.sponsors = [{ title: 'Sponsor info', description: 'Original sponsor inline description', sponsorLogo: '/assets/img/pics/mun.jpg', sponsorName: 'Sponsor name', sponsorCompany: 'Company name', sponsorType: 'Financial', sponsorAmount: '5000 EGP', sponsorBenefits: 'Full benefits\nSecond benefit', sponsorDescription: 'Full sponsor description' }];
  club.booths = [{ title: 'Booth info', description: 'Original booth inline description', boothName: 'Welcome booth', boothPurpose: 'Welcome students', boothDescription: 'Complete booth description', boothLocation: 'Main courtyard', boothSize: '3 x 4', boothEquipment: 'Table and chairs', boothSetupDate: '2026-10-20', boothOpenDate: '2026-10-21', boothCloseDate: '2026-10-22' }];
  await cdp.evaluate("window.miuLiveData.invalidate(['clubs']);loadClubs(true)");
  await until("state.clubs.find(c=>c.id===1)?.posts?.length===2");
  await cdp.evaluate('openClubDetail(1)');
  assert.equal(await cdp.evaluate("document.querySelectorAll('#clubDetail .event-tile-desc').length"), 0, 'No section retains inline details');
  assert.equal(await cdp.evaluate("document.querySelector('#clubDetail [data-content-section=posts]').dataset.contentIndex"), '1', 'Feed sort preserves identity');
  for (const [section, title, expected] of [
    ['posts', 'Newer feed', [club.posts[1].text, 'Additional description', 'Fixture author']],
    ['sponsors', 'Sponsor info', Object.entries(club.sponsors[0]).filter(([key]) => key !== 'sponsorLogo').map(([, value]) => value)],
    ['booths', 'Booth info', Object.values(club.booths[0])]
  ]) {
    await cdp.evaluate(`document.querySelector('#clubDetail [data-content-section=${section}]').click()`);
    assert.equal(await cdp.evaluate("document.getElementById('eventCardInfoTitle').textContent"), title);
    const content = await cdp.evaluate("document.querySelector('#eventCardInfoModal .event-modal-copy').textContent");
    for (const value of expected) assert.ok(content.includes(value), `${section} retains ${value}`);
    assert.equal(await cdp.evaluate("document.querySelectorAll('#eventCardInfoModal .event-modal-copy img').length"), 0);
    await screenshot(`club-info-${section}`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    assert.equal(await cdp.evaluate('document.activeElement.dataset.contentSection'), section);
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true });
  await cdp.evaluate("document.documentElement.dataset.theme='dark';document.querySelector('#clubDetail [data-content-section=booths]').click()");
  assert.equal(await cdp.evaluate("(()=>{const r=document.querySelector('#eventCardInfoModal .event-modal-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1})()"), true);
  await screenshot('club-info-booth-mobile');
  await cdp.evaluate("document.getElementById('eventCardInfoModal').click();delete document.documentElement.dataset.theme");
  await cdp.evaluate("window.openClubContentInfoPopup({title:'Video feed',text:'Video description',image:'https://res.cloudinary.com/demo/video/upload/fixture.mp4'},'feed',state.clubs[0],document.querySelector('#clubDetail [data-content-section=posts]'))");
  assert.equal(await cdp.evaluate("(()=>{const v=document.querySelector('#eventCardInfoModal video');return !!v&&v.controls&&v.preload==='none'&&!v.autoplay})()"), true, 'Feed video uses native controls without autoplay');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
  assert.equal(await cdp.evaluate('document.activeElement.tagName'), 'VIDEO', 'Video controls are keyboard accessible inside the focus trap');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  assert.equal(await cdp.evaluate("document.querySelectorAll('#eventCardInfoModal').length"), 0);
  await cdp.evaluate("document.querySelector('#clubDetail [data-content-section=sponsors]').closest('article').querySelector('.club-name').click()");
  assert.equal(await cdp.evaluate("document.getElementById('eventCardInfoTitle').textContent"), 'Sponsor info', 'Clicking the card itself opens details');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: origin + '/pages/events.html' });
  await until("document.querySelectorAll('#eventsList [data-event-open]').length>=3");
  await cdp.evaluate("[...document.querySelectorAll('#eventsList [data-event-open]')].find(button=>button.textContent.includes('Earlier workshop')).click()");
  assert.equal(await cdp.evaluate("location.pathname==='/pages/events.html' && !document.getElementById('eventModal').classList.contains('hidden')"), true, 'Event list opens its existing registration popup without navigation');
  assert.equal(await cdp.evaluate("document.getElementById('eventModalTitle').textContent"), 'Earlier workshop');
  const eventLayout = await cdp.evaluate("(()=>{const p=document.querySelector('#eventModal .event-modal-panel'),i=p.querySelector('img'),c=p.querySelector('.event-modal-copy'),a=i.getBoundingClientRect(),b=c.getBoundingClientRect();return {sideBySide:a.right<=b.left,aligned:Math.abs(a.top-b.top)<2,height:a.height,fit:getComputedStyle(i).objectFit,width:p.getBoundingClientRect().width}})()");
  assert.equal(eventLayout.sideBySide, true);
  assert.equal(eventLayout.aligned, true);
  assert.ok(eventLayout.height<=340 && eventLayout.width<=920);
  assert.equal(eventLayout.fit, 'contain');
  await until("!document.documentElement.classList.contains('site-startup-pending')");
  await screenshot('event-popup-balanced-desktop');
  await cdp.evaluate("document.getElementById('eventModalClose').click()");
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  assert.equal(await cdp.evaluate("(()=>{const c=[...document.querySelectorAll('#eventsList [data-event-open]')].find(b=>b.textContent.includes('Later workshop')),i=c.querySelector('.feed-timeline-image'),t=c.querySelector('.feed-timeline-title');return i.getBoundingClientRect().bottom<=t.getBoundingClientRect().top&&i.getBoundingClientRect().height<=200&&getComputedStyle(i).objectFit==='contain'})()"), true, 'Mobile card shows its bounded image above the title');
  await screenshot('event-card-mobile-image-first');
  await cdp.evaluate("[...document.querySelectorAll('#eventsList [data-event-open]')].find(b=>b.textContent.includes('Long description workshop')).click();document.querySelector('#eventModal .event-modal-panel').scrollTop=5000;document.getElementById('eventModalClose').click();[...document.querySelectorAll('#eventsList [data-event-open]')].find(b=>b.textContent.includes('Later workshop')).click()");
  assert.equal(await cdp.evaluate("document.querySelector('#eventModal .event-modal-panel').scrollTop"), 0, 'Reopened popup starts at its image and close button');
  assert.equal(await cdp.evaluate("(()=>{const p=document.querySelector('#eventModal .event-modal-panel'),r=p.getBoundingClientRect(),i=p.querySelector('img').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&i.height<=210})()"), true);
  await screenshot('event-popup-mobile-compact');
  await cdp.evaluate("document.getElementById('eventModalClose').click()");
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const [page, selector, dialog] of [['sponsors', '.sponsor-timeline-item', 'sponsorDetail'], ['booths', '.booth-timeline-item', 'boothDetail']]) {
    await cdp.send('Page.navigate', { url: origin + '/pages/' + page + '.html' });
    await until(`!!document.querySelector('${selector}')`);
    if (page === 'sponsors') {
      const card = await cdp.evaluate("(()=>{const c=document.querySelector('.sponsor-timeline-item'),image=c.querySelector('.feed-timeline-image'),title=c.querySelector('.feed-timeline-title');return {avatar:c.querySelector('.feed-timeline-avatar').getAttribute('src'),logo:image.getAttribute('src'),contained:getComputedStyle(image).objectFit==='contain',beside:image.getBoundingClientRect().right<=title.getBoundingClientRect().left,company:c.textContent.includes('Company name')}})()");
      assert.equal(card.avatar, club.image);
      assert.equal(card.logo, club.sponsors[0].sponsorLogo);
      assert.equal(card.contained, true); assert.equal(card.beside, true); assert.equal(card.company, true);
      await until("!document.documentElement.classList.contains('site-startup-pending')");
      await screenshot('sponsor-card-with-logo');
    }
    await cdp.evaluate(`document.querySelector('${selector}').click()`);
    assert.equal(await cdp.evaluate(`location.pathname==='/pages/${page}.html' && !document.getElementById('${dialog}').classList.contains('hidden')`), true);
    assert.equal(await cdp.evaluate(`(()=>{const p=document.querySelector('#${dialog} .event-modal-panel'),a=p.querySelector('img').getBoundingClientRect(),b=p.querySelector('.event-modal-copy').getBoundingClientRect();return a.right<=b.left&&Math.abs(a.top-b.top)<2&&a.height<=340})()`), true, `${page} keeps image and details aligned`);
    await until("!document.documentElement.classList.contains('site-startup-pending')");
    await screenshot(`${page}-popup-balanced-desktop`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    assert.equal(await cdp.evaluate(`(()=>{const p=document.querySelector('#${dialog} .event-modal-panel'),a=p.querySelector('img').getBoundingClientRect(),b=p.querySelector('.event-modal-copy').getBoundingClientRect(),r=p.getBoundingClientRect();return a.bottom<=b.top&&a.height<=210&&r.left>=0&&r.right<=innerWidth+1})()`), true);
    await screenshot(`${page}-popup-balanced-mobile`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  }
  await cdp.send('Page.navigate', { url: origin + '/pages/feed.html' });
  await until("!!document.querySelector('[data-feed-event]')");
  await cdp.evaluate("document.querySelector('[data-feed-event]').click()");
  await until("!!document.getElementById('eventModal') && !document.getElementById('eventModal').classList.contains('hidden')");
  assert.equal(await cdp.evaluate('location.pathname'), '/pages/feed.html', 'Feed event opens the shared popup without navigation');
  assert.equal(await cdp.evaluate("(()=>{const p=document.querySelector('#eventModal .event-modal-panel'),i=p.querySelector('img');return getComputedStyle(p).display==='grid'&&p.getBoundingClientRect().width<=920&&i.getBoundingClientRect().height<=340&&getComputedStyle(i).objectFit==='contain'})()"), true, 'Feed loads the same bounded popup styles');
  await cdp.evaluate("document.getElementById('eventModalClose').click()");
  await cdp.send('Page.navigate', { url: origin + '/' });
  await until("!!document.querySelector('.event-slide[data-club=\"0\"][data-type=event]')");
  await cdp.evaluate("document.querySelector('.event-slide[data-club=\"0\"][data-type=event]').click()");
  assert.equal(await cdp.evaluate("location.pathname==='/' && !document.getElementById('eventModal').classList.contains('hidden')"), true, 'University event slideshow stays on homepage');
  await cdp.evaluate("document.getElementById('eventModalClose').click()");
  console.log('PASS: event list, feed events, university slideshow, sponsor/booth lists and Club View cards open popups without changing pages.');
  console.log('PASS: Feed, Sponsor and Booth reuse Event Info; full descriptions/metadata, sorted identity, safe text, focus restoration, mobile layout and video controls.');
  console.log('PASS: Event Info uses shared popup styling; sorted identities, safe text, X/overlay/Escape, focus/scroll restoration, optional images, long content and 320–1440px layouts. No new API requests.');
};
