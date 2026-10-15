(() => {
  const $ = id => document.getElementById(id), message = $('usherTaskMessage'), panel = $('usherTask');
  let token = '', refreshTimer = 0, countdownTimer = 0, expiresAt = 0;
  const api = window.MiuUI.createJsonClient({
    defaults: {"credentials":"same-origin","cache":"no-store"},
    fallbackMessage: "Could not load your task.", tolerateInvalidJson: true, includeStatus: false
  });
  async function load() {
    try {
      const { task } = await api('/api/miu-attendance-task');
      if (!task) { panel.hidden = true; message.textContent = 'No MIU attendance task is currently assigned to your account.'; return; }
      panel.hidden = false; $('usherTaskTitle').textContent = task.eventTitle; $('usherTaskDate').textContent = task.eventDate;
      $('acceptUsherTask').hidden = task.accepted; $('openUsherQr').hidden = !task.accepted;
      $('usherSelfCheckinForm').hidden = !task.accepted || task.attendanceAsUsher;
      $('usherAttendanceStatus').textContent = task.attendanceAsUsher ? 'Your attendance is recorded as an Usher.' : 'Record your own attendance once as an Usher for this event.';
      for (const [id, key] of [['usherName', 'name'], ['usherUniversityId', 'universityId'], ['usherMajor', 'major']]) {
        if (!$(id).value) $(id).value = task.profile?.[key] || '';
      }
      message.textContent = task.accepted ? 'Task accepted. Open the QR on the device you will use to present it.' : 'A university event team assigned this attendance task to your account.';
    } catch (error) { message.textContent = error.message; }
  }
  $('acceptUsherTask').addEventListener('click', async () => {
    $('acceptUsherTask').disabled = true;
    try { const result = await api('/api/miu-attendance-task/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); message.textContent = result.message; await load(); }
    catch (error) { message.textContent = error.message; $('acceptUsherTask').disabled = false; }
  });
  $('usherSelfCheckinForm').addEventListener('submit', async event => {
    event.preventDefault();
    event.currentTarget.dataset.miuDirty = 'true';
    const button = $('recordUsherAttendance'); button.disabled = true;
    const feedback = $('usherSelfCheckinFeedback'); feedback.textContent = 'Recording your attendance…';
    try {
      const result = await api('/api/miu-attendance-task/check-in', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('usherName').value.trim(), universityId: $('usherUniversityId').value.trim(), major: $('usherMajor').value.trim() }) });
      if (result.savedToDatabase !== true) throw new Error('Your attendance was not confirmed.');
      delete $('usherSelfCheckinForm').dataset.miuDirty;
      feedback.textContent = result.message; await load();
    } catch (error) { feedback.textContent = error.message; }
    finally { button.disabled = false; }
  });
  async function rotate() {
    try {
      const challenge = await api('/api/miu-attendance-task/qr-challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      if (!token) return; expiresAt = challenge.expiresAt;
      const url = new URL('/attendance', location.origin); url.searchParams.set('token', token); url.searchParams.set('code', challenge.code);
      const canvas = $('usherTaskQr'); canvas.replaceChildren(); new window.QRCode(canvas, { text: url.toString(), width: 230, height: 230, colorDark: '#102a43', colorLight: '#fff', correctLevel: window.QRCode.CorrectLevel.M });
      clearInterval(countdownTimer); countdownTimer = setInterval(() => { $('usherTaskCountdown').textContent = `A new QR code will appear in ${Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))} seconds.`; }, 250);
      refreshTimer = setTimeout(rotate, Math.max(250, challenge.expiresAt - Date.now() + 100));
    } catch (error) { $('usherTaskCountdown').textContent = error.message; }
  }
  $('openUsherQr').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { await window.ensureQRCode(); const data = await api('/api/miu-attendance-task/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); token = data.token; await rotate(); }
    catch (error) { $('usherTaskCountdown').textContent = error.message; }
    finally { event.currentTarget.disabled = false; }
  });
  void load(); window.addEventListener('pagehide', () => { clearTimeout(refreshTimer); clearInterval(countdownTimer); token = ''; });
})();
