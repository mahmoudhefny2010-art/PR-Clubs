(() => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const qrCode = params.get('code') || '';
  const details = document.getElementById('attendanceEventDetails');
  const title = document.getElementById('attendanceTitle');
  const form = document.getElementById('attendanceCheckinForm');
  const feedback = document.getElementById('attendanceCheckinFeedback');
  const submit = document.getElementById('attendanceSubmitButton');
  const accountDetails = document.getElementById('attendanceAccountDetails');
  const signInLink = document.getElementById('attendanceSignInLink');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    title.textContent = 'QR code unavailable';
    details.textContent = 'This attendance link is invalid. Ask the club for a current QR code.';
    return;
  }
  const apiJson = async (url, options) => {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || 'Could not confirm attendance.');
      error.status = response.status;
      throw error;
    }
    return payload;
  };
  const scanUrl = new URL(`/api/attendance/${encodeURIComponent(token)}`, window.location.origin);
  if (qrCode) scanUrl.searchParams.set('code', qrCode);
  apiJson(scanUrl.toString()).then(async (event) => {
    details.textContent = [event.itemType === 'booth' ? 'Booth' : 'Event', event.eventTitle, event.clubName, event.eventDate, window.formatSiteTime(event.eventTime)].filter(Boolean).join(' · ');
    const account = await apiJson('/api/student-auth/session');
    accountDetails.textContent = `Signed in as ${account.name} (${account.email})`;
    accountDetails.classList.remove('hidden');
    form.classList.remove('hidden');
  }).catch((error) => {
    if (error.status === 401) {
      title.textContent = 'Sign in required';
      const returnTo = `${window.location.pathname}${window.location.search}`;
      signInLink.href = `/pages/applicant-login.html?redirect=${encodeURIComponent(returnTo)}`;
      signInLink.classList.remove('hidden');
      return;
    }
    title.textContent = 'Attendance unavailable';
    details.textContent = error.message;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.textContent = 'Saving attendance…';
    feedback.classList.remove('is-error');
    submit.disabled = true;
    const formData = new FormData(form);
    try {
      const result = await apiJson(`/api/attendance/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: formData.get('note') })
      });
      feedback.textContent = result.message;
      form.classList.add('hidden');
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add('is-error');
      submit.disabled = false;
    }
  });
})();
