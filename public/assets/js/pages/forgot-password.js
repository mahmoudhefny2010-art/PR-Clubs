
      const forgotForm = document.getElementById('forgotPasswordForm');
      const forgotFeedback = document.getElementById('forgotPasswordFeedback');
      forgotForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        forgotFeedback.textContent = '';
        forgotFeedback.classList.remove('is-error');
        const emailInput = document.getElementById('recoveryEmail');
        const email = emailInput.value.trim();
        if (!emailInput.checkValidity()) {
          emailInput.reportValidity();
          return;
        }
        const button = document.getElementById('sendResetLinkBtn');
        button.disabled = true;
        try {
          const response = await fetch('/api/password-reset/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'Password recovery is temporarily unavailable.');
          forgotFeedback.textContent = result.message;
          forgotForm.reset();
        } catch (error) {
          forgotFeedback.textContent = error.message;
          forgotFeedback.classList.add('is-error');
        } finally {
          button.disabled = false;
        }
      });
