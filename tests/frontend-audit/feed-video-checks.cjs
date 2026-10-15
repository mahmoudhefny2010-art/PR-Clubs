const assert = require('node:assert/strict');
const videoUrl = 'https://res.cloudinary.com/fixture/video/upload/v1/miu-feed-media/miu-feed-media-video.webm';
const imageUrl = 'https://res.cloudinary.com/fixture/image/upload/v1/miu-feed-media/miu-feed-media-image.png';
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0rcAAAAASUVORK5CYII=';
exports.install = app => {
  const state = { records: [], writes: [] };
  app.get('/api/club-auth/session', (req, res, next) => {
    if (!req.headers.referer?.includes('/pages/feed-form.html')) return next();
    res.json({ authenticated: true, club: { id: 1, name: 'Fixture Club', role: 'president' } });
  });
  app.get('/api/club/heads', (req, res) => res.json([]));
  app.get('/api/club/content', (req, res) => res.json(state.records));
  app.post('/api/uploads/cloudinary-signature', (req, res) => {
    assert.equal(req.body.purpose, 'feed');
    res.json({ cloudName: 'fixture', apiKey: 'fixture', timestamp: 1, folder: 'miu-feed-media', publicId: 'miu-feed-media-fixture', signature: 'fixture', maxBytes: 50 * 1024 * 1024 });
  });
  function save(req, res) {
    state.writes.push(req.body);
    const id = Number(req.params.id) || state.records.length + 901;
    const record = { ...req.body, id, type: 'feed', clubId: 1, status: req.body.submit ? 'pending_supervisor' : 'draft', createdAt: '2026-10-15T12:00:00Z' };
    const index = state.records.findIndex(item => item.id === id);
    if (index < 0) state.records.push(record); else state.records[index] = record;
    res.json(record);
  }
  app.post('/api/club/content/feed', save); app.put('/api/club/content/:id', save);
  return state;
};
exports.run = async ({ cdp, origin, until, screenshot, fixtures, state }) => {
  await cdp.send('Network.enable');
  const intercepted = [];
  let videoBytes = '';
  const intercept = async event => {
    const message = JSON.parse(event.data);
    if (message.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = message.params;
    intercepted.push(request.url);
    let body, contentType;
    if (request.url.includes('api.cloudinary.com')) {
      const video = request.url.includes('/video/upload');
      contentType = 'application/json';
      body = Buffer.from(JSON.stringify({ secure_url: video ? videoUrl : imageUrl, public_id: `miu-feed-media/miu-feed-media-${video ? 'video' : 'image'}` })).toString('base64');
    } else if (request.url === videoUrl) { contentType = 'video/webm'; body = videoBytes; }
    else { contentType = 'image/png'; body = pixel; }
    await cdp.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Access-Control-Allow-Origin', value: '*' }], body });
  };
  cdp.socket.addEventListener('message', intercept);
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://api.cloudinary.com/*' }, { urlPattern: 'https://res.cloudinary.com/*' }] });
  try {
    await cdp.send('Page.navigate', { url: origin + '/pages/feed-form.html' });
    await until("document.getElementById('contentLayout')?.hidden===false && !document.documentElement.classList.contains('site-startup-pending')");
    videoBytes = await cdp.evaluate(`(async()=>{
      const canvas=document.createElement('canvas'); canvas.width=160; canvas.height=90;
      const context=canvas.getContext('2d'); context.fillStyle='#a92340'; context.fillRect(0,0,160,90);
      const stream=canvas.captureStream(10), recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}), chunks=[];
      recorder.ondataavailable=event=>chunks.push(event.data);
      const stopped=new Promise(resolve=>recorder.onstop=resolve); recorder.start();
      await new Promise(resolve=>setTimeout(resolve,200)); context.fillStyle='#ffffff';context.fillRect(20,20,30,30);
      await new Promise(resolve=>setTimeout(resolve,200));recorder.stop();await stopped;stream.getTracks().forEach(track=>track.stop());
      const blob=new Blob(chunks,{type:'video/webm'}), data=new DataTransfer(); data.items.add(new File([blob],'fixture.webm',{type:'video/webm'}));
      const input=document.getElementById('imageInput'); input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob)});
    })()`);
    assert.ok(videoBytes.length > 100);
    assert.equal(await cdp.evaluate("!!document.querySelector('#feedMediaPreview video[controls]')"), true);
    await cdp.evaluate("document.getElementById('titleInput').value='Video post'; document.getElementById('descInput').value='Our club video'; document.querySelector('button[value=draft]').click()");
    await until("!!document.querySelector('[data-edit=\"901\"]')");
    assert.equal(state.writes[0].image, videoUrl); assert.equal(state.writes[0].videoPublicId, 'miu-feed-media/miu-feed-media-video');
    assert.ok(intercepted.some(url => url.endsWith('/video/upload')));
    await cdp.evaluate("document.querySelector('[data-edit=\"901\"]').click()");
    await until("document.getElementById('titleInput').value==='Video post'");
    assert.equal(await cdp.evaluate("!!document.querySelector('#feedMediaPreview [data-feed-video]')"), true);
    await cdp.evaluate("document.getElementById('titleInput').value='Reviewed video'; document.getElementById('submitReviewBtn').click()");
    await until("document.querySelector('#contentList .status-pending_supervisor')!==null");
    assert.equal(state.records[0].image, videoUrl, 'Editing and submitting retains the saved video');
    await cdp.evaluate(`(()=>{const bytes=Uint8Array.from(atob('${pixel}'),c=>c.charCodeAt(0));const data=new DataTransfer();data.items.add(new File([bytes],'photo.png',{type:'image/png'}));const input=document.getElementById('imageInput');input.files=data.files;input.dispatchEvent(new Event('change'));document.getElementById('titleInput').value='Image post';document.querySelector('button[value=draft]').click()})()`);
    await until("!!document.querySelector('[data-edit=\"902\"]')");
    assert.equal(state.records[1].image, imageUrl, 'Image posts still upload and save');
    fixtures['/api/clubs'][0].posts = state.records.map(record => ({ ...record, text: record.description }));
    // Model a published revision already delivered to the browser's public cache.
    await cdp.evaluate(`localStorage.setItem('miu-public-clubs-v1', ${JSON.stringify(JSON.stringify({ savedAt: Date.now(), data: fixtures['/api/clubs'] }))})`);
    await cdp.send('Page.navigate', { url: origin + '/pages/feed.html' });
    try { await until("!!document.querySelector('.feed-post-card [data-feed-video]') && !document.documentElement.classList.contains('site-startup-pending')"); }
    catch (error) {
      console.error(await cdp.evaluate("({body:document.body.innerText.slice(0,1600),media:!!window.FeedMedia,errors:document.getElementById('communityFeedList')?.innerHTML.slice(0,1000)})"));
      console.error(cdp.events.filter(event => event.method === 'Runtime.exceptionThrown'));
      throw error;
    }
    assert.equal(await cdp.evaluate("document.querySelectorAll('.feed-post-card video').length"), 0);
    assert.equal(intercepted.includes(videoUrl), false, 'The public feed does not download video before play');
    const dimensions = await cdp.evaluate("(()=>{const button=document.querySelector('.feed-post-card [data-feed-video]'),r=button.getBoundingClientRect();return {width:r.width,height:r.height}})()");
    assert.ok(dimensions.width > 0 && dimensions.height > 0 && dimensions.height <= 320);
    await cdp.send('Runtime.evaluate', { expression: "document.querySelector('.feed-post-card [data-feed-video]').click()", userGesture: true });
    await until("document.querySelector('.feed-video-dialog[open] video')?.readyState>=2");
    assert.equal(await cdp.evaluate("document.querySelector('.feed-video-dialog video').controls"), true);
    assert.equal(await cdp.evaluate("document.querySelectorAll('.feed-post-card video').length"), 0, 'The feed keeps its original preview');
    assert.equal(await cdp.evaluate("document.querySelector('.feed-video-dialog').getBoundingClientRect().width>document.querySelector('.feed-post-card [data-feed-video]').getBoundingClientRect().width"), true, 'Desktop popup is larger than the post media frame');
    await screenshot('feed-video');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await screenshot('feed-video-mobile');
    await cdp.evaluate("window.fixturePlayback=document.querySelector('.feed-video-dialog video')");
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    await until("!document.querySelector('.feed-video-dialog')");
    assert.equal(await cdp.evaluate("window.fixturePlayback.paused && !window.fixturePlayback.getAttribute('src')"), true, 'Closing stops playback and releases the video source');
    assert.equal(await cdp.evaluate("document.activeElement.matches('[data-feed-video]')"), true, 'Focus returns to the post preview');
    await cdp.send('Runtime.evaluate', { expression: "document.querySelector('.feed-post-card [data-feed-video]').click()", userGesture: true });
    await until("!!document.querySelector('.feed-video-dialog[open]')");
    await cdp.evaluate("document.querySelector('.feed-video-close').click()");
    await until("!document.querySelector('.feed-video-dialog')");
    assert.equal(await cdp.evaluate("document.body.style.overflow==='hidden'"), false, 'Closing restores page scrolling');
  } finally {
    await cdp.send('Fetch.disable'); cdp.socket.removeEventListener('message', intercept);
  }
};
