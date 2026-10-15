// Shared browser primitives. Loaded synchronously before feature scripts.
// Policies stay explicit: no implicit headers, serialization, redirects or retries.
(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const createJsonClient = ({ defaults = {}, fallbackMessage, tolerateInvalidJson = true, includeStatus = false }) => async (url, options) => {
    const response = await fetch(url, { ...defaults, ...options });
    const pending = response.json();
    const payload = await (tolerateInvalidJson ? pending.catch(() => ({})) : pending);
    if (!response.ok) {
      const error = new Error(payload.message || fallbackMessage);
      if (includeStatus) error.status = response.status;
      throw error;
    }
    return payload;
  };
  const button = (label, className, onClick) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.textContent = label;
    element.addEventListener('click', onClick);
    return element;
  };
  // Visibility only. Feature owners retain focus, scroll locks and cleanup.
  // Existing CSS owns transitions; do not introduce timers or new animations.
  const modals = Object.freeze({
    open(element) { element.classList.remove('hidden'); },
    close(element) { element.classList.add('hidden'); }
  });
  window.MiuUI = Object.freeze({
    escapeHtml, createJsonClient, button, modals,
    attendanceEventRoleLabel(record) {
      return ({ organizer: 'Organizer', usher: 'Usher', president: 'President', head: 'Head' })[record?.eventParticipation?.role] || 'Attendee';
    },
    initModalControls() {
      const closeButtonSelector = 'button[aria-label*="close" i], button[aria-label*="exit" i], button[title*="close" i], button[class*="close" i], button[id*="close" i], .club-detail-close, .calendar-close-btn, .close-btn, .request-dialog-close, .club-review-notice-close, .club-feedback-dialog-close, .attachment-preview-close';
      const closeRailTargetSelector = '.request-dialog-inner, .calendar-panel, .modal-card, .event-modal-panel, .member-directory-inner, .member-dialog-inner, .status-overview-inner, .review-history-inner, .approval-checkpoint-more-inner, .attachment-preview-panel, .club-feedback-dialog, .club-review-notice-content, .attendance-review-panel, .committee-attendance-inner, .committee-availability-dialog, .attendance-review-dialog, .committee-sidebar, .president-sidebar, .student-dashboard-sidebar, .report-admin-sidebar';
      const moveCloseButtonToRail = (button) => {
        if (!(button instanceof HTMLElement) || button.closest('.modal-close-rail, .request-dialog-close-rail')) return;
        if (button.closest('.committee-inline-panel')) return;
        const panel = button.closest(closeRailTargetSelector);
        if (!panel) return;
        const rail = document.createElement('div');
        rail.className = 'modal-close-rail';
        panel.prepend(rail);
        rail.append(button);
      };
      const scanCloseButtons = (root) => {
        if (!(root instanceof Element)) return;
        if (root.matches(closeButtonSelector)) moveCloseButtonToRail(root);
        root.querySelectorAll(closeButtonSelector).forEach(moveCloseButtonToRail);
      };
      scanCloseButtons(document.documentElement);
      new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(scanCloseButtons)))
        .observe(document.body, { childList: true, subtree: true });
    },
    initPasswordControls() {
      document.querySelectorAll('input[type="password"]').forEach((input) => {
        if (input.dataset.passwordToggleInitialized === 'true') return;
        input.dataset.passwordToggleInitialized = 'true';
        const field = input.closest('.field-group, .modal-field') || input.parentElement;
        if (!field) return;
        field.classList.add('has-password-toggle');
        input.classList.add('password-toggle-input');
        const inputWrap = document.createElement('span');
        inputWrap.className = 'password-input-wrap';
        input.before(inputWrap);
        inputWrap.append(input);

        const toggle = document.createElement('button');
        toggle.className = 'password-visibility-toggle';
        toggle.type = 'button';
        toggle.setAttribute('aria-label', 'Show password');
        toggle.title = 'Show password';
        toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
        toggle.addEventListener('click', () => {
          const reveal = input.type === 'password';
          const start = input.selectionStart;
          const end = input.selectionEnd;
          input.type = reveal ? 'text' : 'password';
          toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
          toggle.title = reveal ? 'Hide password' : 'Show password';
          toggle.innerHTML = reveal
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15.8 15.8 0 0 1-3.1 3.8"/><path d="M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
          input.focus();
          if (start !== null && end !== null) input.setSelectionRange(start, end);
        });
        inputWrap.append(toggle);
      });
    },
    initFormValidation() {
      const validateDataEntryForm = (form) => {
        if (!form) return true;
        let firstInvalid = null;
        for (const field of form.querySelectorAll('input, select, textarea')) {
          field.setCustomValidity('');
          const value = String(field.value || '');
          const trimmed = value.trim();
          let message = '';
          if (field.required && !trimmed && field.type !== 'file') message = 'This field is required.';
          if (!message && field.required && field.type === 'file' && !field.files.length) message = 'This field is required.';
          if (!message && trimmed && /(?:phone|tel)/i.test(`${field.name} ${field.id}`)) {
            const digits = value.replace(/\D/g, '');
            if (digits.length < 7 || digits.length > 15) message = 'Please enter a valid phone number.';
          }
          if (!message && trimmed && /(?:^|[-_ ])age(?:$|[-_ ])/i.test(`${field.name} ${field.id}`)
            && (!/^\d{1,3}$/.test(trimmed) || Number(trimmed) < 16 || Number(trimmed) > 100)) {
            message = 'Please enter a valid age between 16 and 100.';
          }
          if (!message && trimmed && /(?:first.?name|last.?name|regName|contact)/i.test(`${field.name} ${field.id}`)
            && !/^[\p{L}\p{M}\s.'’\-]+$/u.test(trimmed)) message = 'Numbers and inappropriate characters are not allowed in this field.';
          if (!message && trimmed && field.type === 'email' && !field.validity.valid) message = 'Please enter a valid email address.';
          if (message) {
            field.setCustomValidity(message);
            firstInvalid ||= field;
          }
        }
        const setupDate = form.querySelector('#boothSetupDateInput')?.value;
        const openDate = form.querySelector('#boothOpenDateInput')?.value;
        const closeDate = form.querySelector('#boothCloseDateInput')?.value;
        if (openDate && closeDate && closeDate < openDate) {
          const field = form.querySelector('#boothCloseDateInput');
          field.setCustomValidity('Closing date must be on or after the opening date.');
          firstInvalid ||= field;
        } else if (setupDate && openDate && openDate < setupDate) {
          const field = form.querySelector('#boothOpenDateInput');
          field.setCustomValidity('Opening date must be on or after the setup date.');
          firstInvalid ||= field;
        }
        if (firstInvalid) {
          firstInvalid.reportValidity();
          const feedback = form.querySelector('[aria-live], #formFeedback, #applicationFeedback');
          if (feedback) feedback.textContent = firstInvalid.validationMessage;
          return false;
        }
        if (!form.checkValidity()) {
          form.reportValidity();
          return false;
        }
        return true;
      };
      window.validateDataEntryForm = validateDataEntryForm;
      document.addEventListener('input', (event) => {
        if (event.target.matches('input, textarea, select')) event.target.setCustomValidity('');
      }, true);
      document.addEventListener('submit', (event) => {
        if (!validateDataEntryForm(event.target)) event.preventDefault();
      }, true);
    }
  });
})();
