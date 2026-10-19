(() => {
  'use strict';
  const host = document.querySelector('[data-reverse-attendance]'); if (!host) return;
  const $ = selector => host.querySelector(selector), student = host.dataset.reverseAttendance === 'student', select = $('[data-ra-event]'), status = $('[data-ra-status]');
  let timer, countdown, generation = 0, eventController, stream, frame, detector, paused = true, scanning = false, currentWindow, serverOffset = 0, verificationToken, decoderPromise, cameraGeneration = 0;
  const ref = () => { try { return JSON.parse(select.value); } catch { return null; } };
  const endpoint = suffix => { const value = ref(); if (!value) throw new Error('Select an event first.'); return `/api/reverse-attendance/${value.source}/${value.clubId}/${value.eventIndex}${suffix || ''}${value.eventRequestId ? '?eventRequestId=' + value.eventRequestId : ''}`; };
  const api = async (url, options = {}) => { const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }); const value = await response.json().catch(() => ({})); if (!response.ok) { const error = new Error(value.message || 'The operation could not be confirmed. Check your connection and refresh.'); error.status = response.status; error.code = value.code; throw error; } return value; };
  const attendanceError = error => error.code === 'SCHEDULE_REQUIRED'
    ? 'This event needs a valid date and start time. Ask the event organizer to update the event schedule. The QR opens 10 minutes before it starts and refreshes every 20 seconds.'
    : error.message;
  const write = (url, body, method = 'POST') => api(url, { method, body: JSON.stringify(body) });
  function clearQr() { clearTimeout(timer); clearInterval(countdown); $('[data-ra-qr]')?.replaceChildren(); }
  function stopCamera() { cameraGeneration++; cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); stream = null; paused = true; if ($('[data-ra-video]')) { $('[data-ra-video]').srcObject = null; $('[data-ra-video]').hidden = true; } }
  function showResult(value) {
    const box = $('[data-ra-result]'); box.replaceChildren(); box.hidden = false; box.dataset.color = value.color || 'red';
    const message = document.createElement('strong'); message.textContent = value.message; box.append(message);
    for (const [label, item] of [['Student',value.name],['University ID',value.universityId],['Event',value.eventTitle],['Type',value.eventType],['Registration',value.registrationStatus],['Attendance time',value.attendedAt ? new Date(value.attendedAt).toLocaleString() : '']]) if (item) { const line = document.createElement('p'); line.textContent = label + ': ' + item; box.append(line); }
    verificationToken = value.verificationToken;
    $('[data-ra-verify]').hidden = !(value.result === 'verification_required' && value.canVerify && verificationToken);
    $('[data-ra-verify]').reset(); $('[data-ra-next]').hidden = false;
    if (value.result === 'verification_required' && !value.canVerify) { const note = document.createElement('p'); note.textContent = 'Ask the authorized event supervisor to verify the student and scan their refreshed QR.'; box.append(note); }
  }
  async function submitToken(token, verified = false) {
    if (scanning || !ref()) return; scanning = true; paused = true; $('[data-ra-next]').disabled = true;
    const ticket = generation; status.textContent = 'Validating with the server…';
    try {
      const result = await write(endpoint('/scan'), verified ? { verificationToken, verifiedIdentity: $('[data-ra-verify] [name=verified]').checked, verificationNote: $('[data-ra-verify] [name=note]').value } : { token });
      if (ticket !== generation) return;
      if (result.result === 'recorded' && result.savedToDatabase !== true) throw new Error('Attendance was not confirmed by the database.');
      if (result.result === 'recorded') await loadOverview();
      if (ticket !== generation) return;
      showResult(result); status.textContent = result.message;
    } catch (error) { if (ticket === generation) { showResult({ color: 'red', message: error.message }); status.textContent = error.message; } if ([401,403].includes(error.status)) stopCamera(); }
    finally { scanning = false; $('[data-ra-next]').disabled = false; }
  }
  async function loadQr() {
    clearQr(); if (!ref() || document.hidden) return;
    const ticket = generation;
    eventController?.abort(); eventController = new AbortController();
    try {
      const data = await api(endpoint('/qr'), { signal: eventController.signal });
      if (ticket !== generation) return;
      serverOffset = data.serverNow - Date.now(); currentWindow = data;
      status.textContent = data.message;
      if (data.attended || data.state === 'closed') { $('[data-ra-clock]').textContent = data.attendedAt ? 'Recorded: ' + new Date(data.attendedAt).toLocaleString() : ''; return; }
      if (data.available) {
        await window.ensureQRCode(); if (ticket !== generation || Date.now() + serverOffset >= data.expiresAt) { if (ticket === generation) timer = setTimeout(loadQr, 50); return; }
        await window.renderAttendanceQr($('[data-ra-qr]'), data.token, { size: 336, logo: data.qrLogo, label: data.qrLabel, alt: `Rotating attendance QR for ${select.selectedOptions[0]?.textContent || 'event'}` });
      }
      const deadline = data.available ? data.expiresAt : data.opensAt;
      const tick = () => { const seconds = Math.max(0, Math.ceil((deadline - Date.now() - serverOffset) / 1000)); $('[data-ra-clock]').textContent = data.available ? `QR refreshes in ${seconds}s` : `QR available in ${Math.floor(seconds / 60)}m ${seconds % 60}s (${data.timeZone})`; if (!seconds) $('[data-ra-qr]').replaceChildren(); };
      tick(); countdown = setInterval(tick, 250);
      timer = setTimeout(loadQr, Math.min(20000, Math.max(100, deadline - Date.now() - serverOffset + 25)));
    } catch (error) { if (ticket !== generation || error.name === 'AbortError') return; clearQr(); status.textContent = attendanceError(error); if (error.status === 401) signInLink(); else if (!error.status || error.status >= 500) timer = setTimeout(loadQr, 5000); }
  }
  function signInLink() { const link = document.createElement('a'); link.className = 'secondary-btn'; link.href = '/pages/applicant-login.html?redirect=' + encodeURIComponent(location.pathname + location.search); link.textContent = 'Sign in'; status.append(document.createTextNode(' '), link); }
  async function loadOverview() {
    if (!ref()) return; const ticket = generation;
    try { const value = await api(endpoint()); if (ticket !== generation) return;
      currentWindow = value; serverOffset = value.serverNow - Date.now(); status.textContent = value.message || `Attendance: ${value.state}`;
      $('[data-ra-details]').textContent = `${value.title} · ${value.eventType === 'miu' ? 'University event' : 'Club event'} · ${value.date} · ${value.time || 'Start time not set'} · ${value.registrationCount} registered / ${value.registrationCapacity ?? 'unlimited'} places · ${value.attendanceCount} attended`;
      $('[data-ra-camera]').disabled = value.state !== 'open';
      const form = $('[data-ra-settings]'); form.hidden = !value.canManageCapacity; form.elements.capacity.value = value.registrationCapacity ?? ''; form.elements.timeZone.value = value.settings.timeZone || 'Africa/Cairo'; form.elements.endTime.value = value.settings.endTime || ''; form.elements.cancellationEnabled.checked = value.settings.cancellationEnabled === true;
    } catch (error) { if (ticket !== generation) return; status.textContent = attendanceError(error); stopCamera(); if (error.status === 401) signInLink(); }
  }
  async function changeEvent() { generation++; eventController?.abort(); clearQr(); stopCamera(); if (!student) { $('[data-ra-result]').hidden = true; $('[data-ra-verify]').hidden = true; $('[data-ra-next]').hidden = true; $('[data-ra-settings]').hidden = true; verificationToken = null; } return student ? loadQr() : loadOverview(); }
  function decoder() { if (window.jsQR) return Promise.resolve(); if (!decoderPromise) decoderPromise = new Promise((resolve,reject) => { const script = document.createElement('script'); script.src = '/assets/vendor/jsQR.js'; script.onload = () => window.jsQR ? resolve() : reject(new Error('QR reader unavailable.')); script.onerror = () => { decoderPromise = null; reject(new Error('QR reader could not load. Check your connection.')); }; document.head.append(script); }); return decoderPromise; }
  const canvas = document.createElement('canvas'); const context = canvas.getContext('2d', { willReadFrequently: true });
  async function decode(source, width, height) {
    if (detector) { const values = await detector.detect(source); return values[0]?.rawValue || ''; }
    await decoder(); const scale = Math.min(1, 900 / Math.max(width,height)); canvas.width = Math.max(1, Math.round(width*scale)); canvas.height = Math.max(1, Math.round(height*scale)); context.drawImage(source,0,0,canvas.width,canvas.height); const image = context.getImageData(0,0,canvas.width,canvas.height); return window.jsQR(image.data,image.width,image.height,{inversionAttempts:'dontInvert'})?.data || '';
  }
  async function openCamera() {
    stopCamera(); const ticket = cameraGeneration; status.textContent = 'Requesting camera access…';
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera scanning requires HTTPS and a supported browser. You can upload a QR image instead.');
      if (window.BarcodeDetector && (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new window.BarcodeDetector({ formats:['qr_code'] }); else { detector = null; await decoder(); }
      const opened = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false });
      if (ticket !== cameraGeneration) { opened.getTracks().forEach(track=>track.stop()); return; }
      stream = opened; const video = $('[data-ra-video]'); video.srcObject = stream; video.hidden = false; await video.play(); paused = false; status.textContent = 'Scan the current QR displayed on the student’s device.';
      let last = 0;
      const loop = async time => { if (!stream || ticket !== cameraGeneration) return; if (currentWindow?.endsAt && Date.now() + serverOffset >= currentWindow.endsAt) { stopCamera(); status.textContent = 'Attendance has closed for this event.'; return; } if (!paused && !scanning && time-last>200 && video.readyState>=2) { last = time; try { const code = await decode(video,video.videoWidth,video.videoHeight); if (code && ticket===cameraGeneration) await submitToken(code); } catch { status.textContent = 'Could not read this frame. Hold the QR steady or use a QR image.'; } } if(stream&&ticket===cameraGeneration) frame=requestAnimationFrame(loop); };
      frame = requestAnimationFrame(loop);
    } catch(error) { stopCamera(); status.textContent = error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in browser settings, or upload a current QR image.' : error.message; }
  }
  select.addEventListener('change', changeEvent); $('[data-ra-refresh]').onclick = () => { if (!student) { $('[data-ra-settings]').dataset.dirty = ''; } void changeEvent(); };
  if (!student) {
    $('[data-ra-camera]').onclick = openCamera; $('[data-ra-close]').onclick = stopCamera;
    $('[data-ra-next]').onclick = () => { paused = false; verificationToken = null; $('[data-ra-result]').hidden = true; $('[data-ra-verify]').hidden = true; $('[data-ra-next]').hidden = true; status.textContent = stream ? 'Ready for the next student.' : 'Open the scanner for the next student.'; };
    $('[data-ra-manual]').onsubmit = event => { event.preventDefault(); void submitToken(event.target.elements.token.value.trim()); event.target.reset(); };
    $('[data-ra-verify]').onsubmit = event => { event.preventDefault(); void submitToken('',true); };
    $('[data-ra-file]').onchange = async event => { const file=event.target.files?.[0]; if(!file)return; try { if(file.size>10*1024*1024)throw new Error('Choose a QR image up to 10 MB.'); const bitmap=await createImageBitmap(file); let code;try{code=await decode(bitmap,bitmap.width,bitmap.height);}finally{bitmap.close();}if(!code)throw new Error('No QR was found in this image.');await submitToken(code); }catch(error){status.textContent=error.message;}finally{event.target.value='';} };
    $('[data-ra-settings]').onsubmit = async event => { event.preventDefault(); const form=event.target,button=form.querySelector('button'),feedback=form.querySelector('[data-ra-settings-feedback]');button.disabled=true;try{const result=await write(endpoint('/settings'),{capacity:form.elements.capacity.value===''?null:Number(form.elements.capacity.value),timeZone:form.elements.timeZone.value,endTime:form.elements.endTime.value,cancellationEnabled:form.elements.cancellationEnabled.checked},'PUT');if(result.savedToDatabase!==true)throw new Error('The settings were not confirmed.');await loadOverview();feedback.textContent=result.message;}catch(error){feedback.textContent=error.message;}finally{button.disabled=false;} };
  }
  document.addEventListener('visibilitychange', () => { if(document.hidden){generation++;clearQr();stopCamera();eventController?.abort();}else if(student)void loadQr();else void loadOverview(); });
  window.addEventListener('pagehide',()=>{generation++;clearQr();stopCamera();eventController?.abort();});
  window.addEventListener('offline',()=>{generation++;clearQr();stopCamera();status.textContent='You are offline. Attendance cannot be confirmed until the connection returns.';});
  window.addEventListener('online',()=>{if(ref())void changeEvent();});
  (async()=>{try{const data=await api('/api/reverse-attendance/'+(student?'my-events':'managed-events'));select.replaceChildren();for(const event of data.items){const option=document.createElement('option');option.value=JSON.stringify({source:event.source,clubId:event.clubId,eventIndex:event.eventIndex,eventRequestId:event.eventRequestId});const schedule=[event.date||'Date not set',event.time||'Start time not set'].join(' · ');option.textContent=`${event.title} · ${event.source==='miu'?'University':'Club'} · ${schedule}`;select.append(option);}const params=new URLSearchParams(location.search);if(params.has('eventIndex')){const match=[...select.options].find(option=>{const item=JSON.parse(option.value);return item.source===params.get('source')&&item.clubId===Number(params.get('clubId'))&&(params.has('eventRequestId')?item.eventRequestId===Number(params.get('eventRequestId')):item.eventIndex===Number(params.get('eventIndex')));});if(match)select.value=match.value;}if(!select.options.length){status.textContent=student?'No registered events yet. Register from an event page first.':'No events are assigned to your account.';return;}await changeEvent();}catch(error){status.textContent=attendanceError(error);if(error.status===401)signInLink();}})();
})();
