window.formatSiteTime = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return value ?? '';

  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (minutes > 59 || hours > (meridiem ? 12 : 23) || (meridiem && hours < 1)) return value;
  const suffix = meridiem || (hours >= 12 ? 'PM' : 'AM');
  if (meridiem) hours %= 12;
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.dataset.passwordToggleInitialized === 'true') return;
    input.dataset.passwordToggleInitialized = 'true';
    const field = input.closest('.field-group, .modal-field') || input.parentElement;
    if (!field) return;
    field.classList.add('has-password-toggle');
    input.classList.add('password-toggle-input');

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
    field.append(toggle);
  });

  const pingSiteVisitor = () => {
    if (document.visibilityState !== 'visible') return;
    fetch('/api/site/visitor-ping', { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => {});
  };
  pingSiteVisitor();
  window.setInterval(pingSiteVisitor, 60_000);
  document.addEventListener('visibilitychange', pingSiteVisitor);

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

  const inject = async (id, url) => {
    const el = document.getElementById(id);
    if (!el) return;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        el.innerHTML = await res.text();
        if (id === 'site-header') {
          initHeader();
          if (!document.querySelector('script[data-miu-push-client]')) {
            const pushClient = document.createElement('script');
            pushClient.src = '/assets/js/onesignal-notifications.js?v=20261012onesignal2';
            pushClient.async = true;
            pushClient.dataset.miuPushClient = 'true';
            document.head.appendChild(pushClient);
          }
        }
      }
    } catch (error) {
      // leave placeholder if component cannot be loaded
    }
  };

  const initHeader = () => {
    const refreshPageButton = document.getElementById('headerRefreshBtn');
    refreshPageButton?.addEventListener('click', async () => {
      refreshPageButton.disabled = true;
      refreshPageButton.setAttribute('aria-busy', 'true');
      refreshPageButton.title = 'Refreshing page';
      try {
        const didRefresh = window.miuRefreshPage ? await window.miuRefreshPage() : (window.location.reload(), true);
        if (didRefresh) return;
      } catch (_) {
        // Fall through and allow another refresh attempt.
      }
      refreshPageButton.disabled = false;
      refreshPageButton.removeAttribute('aria-busy');
      refreshPageButton.title = 'Refresh page';
    });

    // 1. Highlight active navigation link
    const path = window.location.pathname;
    const navLinks = document.querySelectorAll('#navLinks .nav-link');
    navLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (href === '/' && (path === '/' || path === '/index.html')) {
        link.classList.add('active');
      } else if (href !== '/' && path.startsWith(href)) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // 2. Mobile Menu Toggle
    const mobileToggle = document.getElementById('mobileMenuToggle');
    const navMenu = document.getElementById('navLinks');
    if (mobileToggle && navMenu) {
      mobileToggle.addEventListener('click', () => {
        const isOpen = navMenu.classList.toggle('open');
        mobileToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        const iconMenu = mobileToggle.querySelector('.icon-menu');
        const iconClose = mobileToggle.querySelector('.icon-close');
        if (iconMenu && iconClose) {
          iconMenu.classList.toggle('hidden', isOpen);
          iconClose.classList.toggle('hidden', !isOpen);
        }
      });
      navMenu.querySelectorAll('.nav-link').forEach((link) => {
        link.addEventListener('click', () => {
          navMenu.classList.remove('open');
          mobileToggle.setAttribute('aria-expanded', 'false');
          mobileToggle.querySelector('.icon-menu')?.classList.remove('hidden');
          mobileToggle.querySelector('.icon-close')?.classList.add('hidden');
        });
      });
    }

    // 3. Replace Sign In with the right account destination for an active session.
    const authBtn = document.getElementById('headerAuthBtn');
    const studentSignoutBtn = document.getElementById('headerStudentSignoutBtn');
    const studentProfileMenu = document.getElementById('headerStudentProfileMenu');
    const studentProfileTrigger = document.getElementById('headerStudentProfileTrigger');
    const studentProfileDropdown = document.getElementById('headerStudentProfileDropdown');
    const studentProfileName = document.getElementById('headerStudentName');
    const studentProfileEmail = document.getElementById('headerStudentEmail');
    const studentProfileAvatar = document.getElementById('headerStudentAvatar');
    const accountDashboardLink = document.getElementById('headerAccountDashboardLink');
    const studentFormsLink = document.getElementById('headerStudentFormsLink');
    let currentHeaderSession = null;
    const closeStudentProfileMenu = () => {
      if (!studentProfileDropdown || !studentProfileTrigger) return;
      studentProfileDropdown.hidden = true;
      studentProfileTrigger.setAttribute('aria-expanded', 'false');
    };
    studentProfileTrigger?.addEventListener('click', () => {
      const open = studentProfileDropdown?.hidden;
      if (!studentProfileDropdown) return;
      studentProfileDropdown.hidden = !open;
      studentProfileTrigger.setAttribute('aria-expanded', String(Boolean(open)));
    });
    document.addEventListener('click', (event) => {
      if (studentProfileMenu && !studentProfileMenu.contains(event.target)) closeStudentProfileMenu();
    });
    studentProfileDropdown?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeStudentProfileMenu));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeStudentProfileMenu(); });
    if (authBtn) {
      const refreshHeaderAccountState = async () => {
        try {
          const response = await fetch('/api/site/account-session', { cache: 'no-store' });
          if (!response.ok) return;
          const session = await response.json();
          currentHeaderSession = session;
          window.__miuAccountSession = session;
          window.dispatchEvent(new CustomEvent('miu:push-account-session-changed', { detail: session }));
          const destinations = {
            admin: { label: 'Dashboard', href: '/admin' },
            president: { label: 'Dashboard', href: '/club-dashboard' },
            head: { label: 'Dashboard', href: '/club-dashboard' },
            pr: { label: 'Dashboard', href: '/dashboards/pr-dashboard.html' },
            english: { label: 'Dashboard', href: '/dashboards/english-dashboard.html' },
            security: { label: 'Dashboard', href: '/dashboards/security-dashboard.html' },
            sso: { label: 'Dashboard', href: '/dashboards/sso-dashboard.html' },
            dean: { label: 'Dashboard', href: '/dashboards/dean-dashboard.html' },
            student: { label: 'My Dashboard', href: '/?myForms=1' }
          };
          const account = session?.authenticated
            ? destinations[session.type === 'club' ? session.role : session.type]
            : null;

          if (account) {
            authBtn.href = account.href;
            authBtn.title = session.name ? `Signed in as ${session.name}` : account.label;
            authBtn.setAttribute('aria-label', account.label);
            const span = authBtn.querySelector('span');
            if (span) span.textContent = account.label;
          } else {
            authBtn.href = '/pages/applicant-login.html';
            authBtn.removeAttribute('title');
            authBtn.setAttribute('aria-label', 'Sign In');
            const span = authBtn.querySelector('span');
            if (span) span.textContent = 'Sign In';
          }
          const isAuthenticated = Boolean(account && session?.authenticated);
          const isStudent = session?.type === 'student' && isAuthenticated;
          if (studentProfileMenu) studentProfileMenu.hidden = !isAuthenticated;
          if (authBtn) authBtn.hidden = isAuthenticated;
          if (studentSignoutBtn) studentSignoutBtn.hidden = !isAuthenticated;
          if (accountDashboardLink && account) {
            accountDashboardLink.href = account.href;
            accountDashboardLink.textContent = account.label;
          }
          if (studentFormsLink) studentFormsLink.hidden = !isStudent;
          const notificationToggle = document.getElementById('headerNotificationToggle');
          const notificationStatus = document.getElementById('headerNotificationStatus');
          const emailNotificationToggle = document.getElementById('headerEmailNotificationToggle');
          const emailNotificationStatus = document.getElementById('headerEmailNotificationStatus');
          if (notificationToggle) notificationToggle.hidden = !isStudent;
          if (emailNotificationToggle) emailNotificationToggle.hidden = !isStudent;
          if (!isStudent && notificationStatus) notificationStatus.hidden = true;
          if (!isStudent && emailNotificationStatus) emailNotificationStatus.hidden = true;
          if (isAuthenticated) {
            const accountName = String(session.name || account.label || 'My Account').trim();
            const accountIdentity = String(session.email || accountName);
            if (studentProfileName) studentProfileName.textContent = accountIdentity;
            if (studentProfileEmail) studentProfileEmail.textContent = '';
            if (studentProfileAvatar) studentProfileAvatar.textContent = accountName.charAt(0).toUpperCase() || 'A';
            if (studentProfileTrigger) studentProfileTrigger.setAttribute('aria-label', `Account menu for ${accountName}`);
          }
          if (!isAuthenticated) closeStudentProfileMenu();
        } catch (error) {
          // Keep the last known header state if the session endpoint is temporarily unavailable.
        }
      };

      window.refreshHeaderAccountState = refreshHeaderAccountState;
      window.addEventListener('miu:account-session-changed', refreshHeaderAccountState);
      refreshHeaderAccountState();
    }
    studentSignoutBtn?.addEventListener('click', async () => {
      studentSignoutBtn.disabled = true;
      try {
        const logoutPath = currentHeaderSession?.type === 'student'
          ? '/api/student-auth/logout'
          : currentHeaderSession?.type === 'admin' ? '/api/admin/logout' : '/api/club-auth/logout';
        if (currentHeaderSession?.type === 'student') await window.miuPushNotifications?.logout();
        const response = await fetch(logoutPath, { method: 'POST', cache: 'no-store' });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.message || 'Could not sign out right now. Please try again.');
        }
        sessionStorage.removeItem('miu-last-app-view');
        closeStudentProfileMenu();
        await window.refreshHeaderAccountState?.();
        window.location.replace('/');
      } catch (error) {
        window.alert(error.message || 'Could not sign out right now. Please try again.');
        studentSignoutBtn.disabled = false;
      }
    });
  };

  // Close open modals on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal:not(.hidden), .calendar-modal:not(.hidden), dialog[open]');
      if (activeModal) {
        if (typeof activeModal.close === 'function' && activeModal.tagName === 'DIALOG') {
          activeModal.close();
        } else {
          activeModal.classList.add('hidden');
        }
      }
    }
  });

  inject('site-header', '/components/site-header.html');
  inject('site-footer', '/components/site-footer.html');
});
