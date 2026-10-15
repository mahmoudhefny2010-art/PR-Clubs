let adminGoogleSdkPromise;
let adminGoogleSigningIn = false;
function getAdminDestination() {
  const target = new URLSearchParams(location.search).get('returnTo') || '/admin';
  return /^\/admin(?:\/(?!login(?:\?|$)|global(?:\?|$))[a-z-]+)?(?:\?[^#]*)?$/.test(target) ? target : '/admin';
}
function setAdminLoginFeedback(message, isError = false) {
  const feedback = document.getElementById('adminLoginFeedback');
  feedback.textContent = message;
  feedback.classList.toggle('is-error', isError);
}
async function openAdminAccess() {
  const form = document.getElementById('adminLoginForm');
  const button = document.getElementById('adminLoginSubmit');
  button.disabled = true;
  try {
    const response = await fetch('/api/admin/session', { cache: 'no-store' });
    const session = await response.json();
    if (!response.ok) throw new Error(session.message || 'Admin access is temporarily unavailable. Refresh to try again.');
    if (session.authenticated) { location.replace(getAdminDestination()); return; }
    const setup = !session.configured && session.localSetupAllowed;
    form.dataset.setup = String(Boolean(setup));
    document.getElementById('adminLoginTitle').textContent = setup ? 'Create your admin account' : 'Admin access';
    document.getElementById('adminLoginMessage').textContent = setup ? 'Create the first administrator account on this computer.' : 'Sign in to the MIU administration workspace.';
    document.getElementById('adminConfirmRow').classList.toggle('hidden', !setup);
    document.getElementById('adminConfirmInput').required = Boolean(setup);
    document.getElementById('adminPasswordInput').autocomplete = setup ? 'new-password' : 'current-password';
    button.textContent = setup ? 'Create account and continue' : 'Sign in';
    button.disabled = !session.configured && !setup;
    if (button.disabled) setAdminLoginFeedback('An administrator must configure access before sign-in is available.', true);
    void configureAdminGoogleSignIn();
  } catch (error) { setAdminLoginFeedback(error.message || 'Could not check admin access. Refresh to try again.', true); }
}
document.getElementById('adminLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = document.getElementById('adminLoginSubmit');
  if (button.disabled) return;
  button.disabled = true;
  setAdminLoginFeedback('Signing in…');
  const setup = form.dataset.setup === 'true';
  const payload = { email: form.elements.email.value.trim(), password: form.elements.password.value };
  if (setup) payload.confirmPassword = form.elements.confirmPassword.value;
  try {
    const response = await fetch(setup ? '/api/admin/setup' : '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Admin sign-in failed.');
    if (result.authenticated !== true || setup && result.savedToDatabase !== true) throw new Error('The server did not confirm administrator access.');
    location.replace(getAdminDestination());
  } catch (error) { setAdminLoginFeedback(error.message, true); button.disabled = false; }
});
void openAdminAccess();
async function configureAdminGoogleSignIn() {
  const host = document.getElementById('adminGoogleButton');
  const feedback = document.getElementById('adminGoogleFeedback');
  if (!host || !feedback) return;
  host.replaceChildren();
  feedback.textContent = 'Loading Google sign-in...';
  feedback.classList.remove('is-error');

  try {
    const configResponse = await fetch('/api/student-auth/google-config', { cache: 'no-store' });
    const config = await configResponse.json();
    if (!configResponse.ok || !config.enabled || !config.clientId || !config.nonce) {
      feedback.textContent = 'Google sign-in is not configured on this server. Use your admin email and password.';
      return;
    }

    if (!window.google?.accounts?.id) {
      if (!adminGoogleSdkPromise) {
        adminGoogleSdkPromise = new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true;
          script.onload = resolve;
          script.onerror = () => reject(new Error('Google sign-in could not load. Check your connection and try again.'));
          document.head.append(script);
        });
      }
      await adminGoogleSdkPromise;
    }
    if (!window.google?.accounts?.id) throw new Error('Google sign-in could not start. Refresh the page and try again.');

    window.google.accounts.id.initialize({
      client_id: config.clientId,
      nonce: config.nonce,
      hd: 'miuegypt.edu.eg',
      error_callback: () => {
        feedback.textContent = 'Google sign-in was closed or could not be opened. Try again or use your email and password.';
        feedback.classList.add('is-error');
      },
      callback: async (credentialResponse) => {
        if (adminGoogleSigningIn) return;
        if (!credentialResponse?.credential) {
          feedback.textContent = 'Google did not return a sign-in credential. Try again or use your email and password.';
          feedback.classList.add('is-error');
          return;
        }
        adminGoogleSigningIn = true;
        feedback.textContent = 'Checking your authorized MIU account...';
        feedback.classList.remove('is-error');
        try {
          const response = await fetch('/api/student-auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: credentialResponse.credential }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || result.authenticated !== true) throw new Error(result.message || 'Google sign-in failed.');
          const destination = result.redirect || '/admin';
          const redirect = new URL((destination === '/admin' || ['admin', 'software_development'].includes(result.role))
            ? getAdminDestination() : destination, window.location.origin);
          if (redirect.origin !== window.location.origin) throw new Error('The sign-in destination is invalid.');
          window.location.assign(`${redirect.pathname}${redirect.search}${redirect.hash}`);
        } catch (error) {
          feedback.textContent = error.message || 'Google sign-in failed. Try again.';
          feedback.classList.add('is-error');
          adminGoogleSigningIn = false;
        }
      },
    });

    host.replaceChildren();
    window.google.accounts.id.renderButton(host, {
      theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: Math.min(400, Math.max(220, Math.floor(host.getBoundingClientRect().width || 396))),
    });
    feedback.textContent = '';
  } catch (error) {
    feedback.textContent = error.message || 'Google sign-in is temporarily unavailable.';
    feedback.classList.add('is-error');
  }
}

