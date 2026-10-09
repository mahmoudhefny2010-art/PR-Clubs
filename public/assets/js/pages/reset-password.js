
      const resetUrl = new URL(window.location.href);
      const resetToken = resetUrl.searchParams.get('token') || '';
      window.history.replaceState(null, '', window.location.pathname);
      const resetForm = document.getElementById('resetPasswordForm');
      const resetFeedback = document.getElementById('resetPasswordFeedback');
      const resetButton = document.getElementById('resetPasswordBtn');
      const goToLogin = document.getElementById('resetBackToLogin');
      if (!resetToken) {
        resetForm.hidden = true;
        resetFeedback.textContent = 'This password reset link is no longer valid. Please request a new one.';
        resetFeedback.classList.add('is-error');
      }
      resetForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        resetFeedback.textContent = '';
        resetFeedback.classList.remove('is-error');
        const newPassword = document.getElementById('newPassword');
        const confirmPassword = document.getElementById('confirmNewPassword');
        if (!newPassword.checkValidity()) {
          newPassword.reportValidity();
          return;
        }
        if (newPassword.value !== confirmPassword.value) {
          resetFeedback.textContent = 'Passwords do not match.';
          resetFeedback.classList.add('is-error');
          confirmPassword.focus();
          return;
        }
        resetButton.disabled = true;
        try {
          const response = await fetch('/api/password-reset/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: resetToken, newPassword: newPassword.value, confirmPassword: confirmPassword.value }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'Could not reset the password.');
          resetForm.hidden = true;
          document.getElementById('resetIntro').textContent = result.message;
          goToLogin.classList.remove('hidden');
        } catch (error) {
          resetFeedback.textContent = error.message;
          resetFeedback.classList.add('is-error');
        } finally {
          resetButton.disabled = false;
        }
      });
