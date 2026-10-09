
      document.getElementById('studentLoginForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const feedback = document.getElementById('loginFeedback');
        feedback.textContent = '';
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: document.getElementById('uniId').value.trim(),
              password: document.getElementById('uniPassword').value,
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'Login failed.');
          window.location.assign(result.role === 'student' ? studentReturnTarget() : (result.redirect || '/'));
        } catch (error) {
          feedback.textContent = error.message;
          feedback.classList.add('is-error');
        }
      });
      const studentReturnTarget = () => {
        const target = new URLSearchParams(window.location.search).get('redirect') || '/';
        try {
          const parsed = new URL(target, window.location.origin);
          return target.startsWith('/') && parsed.origin === window.location.origin
            ? `${parsed.pathname}${parsed.search}${parsed.hash}`
            : '/';
        } catch { return '/'; }
      };
      async function configureGoogleSignIn() {
        const area = document.getElementById('googleLoginArea');
        const fallbackButton = document.getElementById('googleUnavailableButton');
        try {
          const configResponse = await fetch('/api/student-auth/google-config', { cache: 'no-store' });
          const config = await configResponse.json();
          if (!configResponse.ok || !config.enabled) {
            fallbackButton.hidden = false;
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true;
          script.onload = () => {
            if (!window.google?.accounts?.id) {
              fallbackButton.hidden = false;
              return;
            }
            window.google.accounts.id.initialize({
              client_id: config.clientId,
              nonce: config.nonce,
              hd: 'miuegypt.edu.eg',
              callback: async (credentialResponse) => {
                const feedback = document.getElementById('googleLoginFeedback');
                feedback.textContent = 'Checking your MIU Google account...';
                try {
                  const response = await fetch('/api/student-auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: credentialResponse.credential }) });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.message || 'Google sign-in failed.');
                  window.location.assign(studentReturnTarget());
                } catch (error) { feedback.textContent = error.message; feedback.classList.add('is-error'); }
              }
            });
            window.google.accounts.id.renderButton(document.getElementById('googleLoginButton'), { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 360 });
            area.classList.remove('hidden');
          };
          script.onerror = () => { fallbackButton.hidden = false; area.classList.remove('hidden'); };
          document.head.append(script);
        } catch {
          fallbackButton.hidden = false;
        }
      }
      configureGoogleSignIn();
      document.getElementById('googleUnavailableButton').addEventListener('click', () => {
        const feedback = document.getElementById('googleLoginFeedback');
        feedback.textContent = 'Google sign-in is not configured yet. Ask the site administrator to enable it.';
        feedback.classList.add('is-error');
      });
