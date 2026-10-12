
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
        const hint = document.getElementById('googleLoginHint');
        try {
          const configResponse = await fetch('/api/student-auth/google-config', { cache: 'no-store' });
          const config = await configResponse.json();
          if (!configResponse.ok || !config.enabled) {
            fallbackButton.hidden = false;
            return;
          }
          const sessionResponse = await fetch('/api/student-auth/session', { cache: 'no-store' });
          const linkExistingAccount = sessionResponse.ok;
          if (linkExistingAccount) {
            hint.textContent = 'Link your signed-in student account to your verified MIU Google account.';
            hint.hidden = false;
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
              error_callback: () => {
                const feedback = document.getElementById('googleLoginFeedback');
                feedback.textContent = 'Google sign-in was closed or could not be opened. You can try again or use your email and password.';
                feedback.classList.add('is-error');
              },
              callback: async (credentialResponse) => {
                const feedback = document.getElementById('googleLoginFeedback');
                feedback.classList.remove('is-error');
                if (!credentialResponse?.credential) {
                  feedback.textContent = 'Google did not return a sign-in credential. Try again or use your email and password.';
                  feedback.classList.add('is-error');
                  return;
                }
                feedback.textContent = 'Checking your MIU Google account...';
                try {
                  const endpoint = linkExistingAccount ? '/api/student-auth/google/link' : '/api/student-auth/google';
                  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: credentialResponse.credential }) });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.message || 'Google sign-in failed.');
                  if (linkExistingAccount) {
                    feedback.textContent = 'Your Google account is now linked. You can use either sign-in method.';
                    return;
                  }
                  window.location.assign(studentReturnTarget());
                } catch (error) { feedback.textContent = error.message; feedback.classList.add('is-error'); }
              }
            });
            const buttonHost = document.getElementById('googleLoginButton');
            let renderedWidth = 0;
            const renderGoogleButton = () => {
              const availableWidth = buttonHost.getBoundingClientRect().width;
              if (availableWidth < 120) return;
              const width = Math.min(400, Math.floor(availableWidth));
              if (width === renderedWidth) return;
              renderedWidth = width;
              buttonHost.replaceChildren();
              window.google.accounts.id.renderButton(buttonHost, { theme: 'outline', size: 'large', text: linkExistingAccount ? 'continue_with' : 'signin_with', shape: 'rectangular', width });
            };
            area.classList.remove('hidden');
            renderGoogleButton();
            if ('ResizeObserver' in window) new ResizeObserver(renderGoogleButton).observe(buttonHost);
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
