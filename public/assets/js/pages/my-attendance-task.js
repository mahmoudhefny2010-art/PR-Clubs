(() => {
  const $ = id => document.getElementById(id), message = $('usherTaskMessage'), panel = $('usherTask');
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
      $('usherSelfCheckinForm').hidden = true;
      $('openUsherQr').textContent = 'Open attendance scanner';
      $('usherAttendanceStatus').textContent = task.attendanceAsUsher ? 'Your attendance is recorded as an Usher.' : 'Register for the event and show your personal attendance QR to another supervisor.';
      for (const [id, key] of [['usherName', 'name'], ['usherUniversityId', 'universityId'], ['usherMajor', 'major']]) {
        if (!$(id).value) $(id).value = task.profile?.[key] || '';
      }
      message.textContent = task.accepted ? 'Task accepted. Open the scanner on your assigned device.' : 'A university event team assigned this attendance task to your account.';
    } catch (error) { message.textContent = error.message; }
  }
  $('acceptUsherTask').addEventListener('click', async () => {
    $('acceptUsherTask').disabled = true;
    try { const result = await api('/api/miu-attendance-task/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); message.textContent = result.message; await load(); }
    catch (error) { message.textContent = error.message; $('acceptUsherTask').disabled = false; }
  });
  $('openUsherQr').addEventListener('click', () => { location.href = '/pages/attendance-scanner.html'; });
  void load();
})();
