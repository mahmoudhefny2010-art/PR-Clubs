// Shared page navigation: keep Back separate from the explicit Home links.
(() => {
  window.loadAccountPhoto = async () => {
    const response = await fetch('/api/site/account-photo', { cache: 'no-store' });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('Could not load your account photo.');
    return response.json();
  };
  let spreadsheetLibraries;
  window.downloadFormattedExcel = async (rows, filename) => {
    if (!spreadsheetLibraries) spreadsheetLibraries = Promise.all(['/assets/vendor/exceljs.min.js', '/assets/js/spreadsheet-export.js?v=20261013formatted1'].map(src => new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = () => reject(new Error('Could not load Excel export. Please retry.')); document.head.append(script);
    }))).catch(error => { spreadsheetLibraries = null; throw error; });
    await spreadsheetLibraries;
    const workbook = new window.ExcelJS.Workbook();
    window.formatSpreadsheetSheet(workbook, rows);
    const bytes = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a'); link.href = url; link.download = filename.replace(/\.(csv|xlsx)$/i, '') + '.xlsx'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  let qrCodeLibraryPromise = null;
  window.ensureQRCode = () => {
    if (typeof window.QRCode === 'function') return Promise.resolve();
    if (qrCodeLibraryPromise) return qrCodeLibraryPromise;
    qrCodeLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
      script.async = true;
      script.onload = () => typeof window.QRCode === 'function'
        ? resolve()
        : reject(new Error('QR generator did not load.'));
      script.onerror = () => reject(new Error('QR generator could not be reached. Check your connection and try again.'));
      document.head.append(script);
    }).catch((error) => {
      qrCodeLibraryPromise = null;
      throw error;
    });
    return qrCodeLibraryPromise;
  };

  const safePrevious = value => {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, location.origin);
      if (url.origin !== location.origin || url.href === location.href || /(?:login|sign-in|reset-password|forgot-password)/i.test(url.pathname)) return '';
      return url.pathname + url.search + url.hash;
    } catch { return ''; }
  };
  let previous = document.referrer ? safePrevious(document.referrer) : '';
  try {
    const current = location.pathname + location.search + location.hash;
    const saved = JSON.parse(sessionStorage.getItem('miu:page-navigation') || 'null');
    if (saved?.current === current) previous = safePrevious(saved.previous) || previous;
    else previous = previous || (saved?.current ? safePrevious(saved.current) : '');
    sessionStorage.setItem('miu:page-navigation', JSON.stringify({ current, previous }));
  } catch { /* Private browsing can disable storage. */ }
  window.miuGoBack = (fallback = '/') => {
    if (window.miuDashboardGoBack?.()) return;
    if (previous) {
      if (document.referrer && safePrevious(document.referrer) === previous && history.length > 1) history.back();
      else location.assign(previous);
    } else location.assign(fallback);
  };
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const control = event.target.closest('[data-history-back], a, button');
    if (!control || (!control.hasAttribute('data-history-back') && !/^(?:Back|Exit)(?:\b|$)/i.test(control.textContent.trim()))) return;
    if (control.closest('.recovery-card') || /(?:forgot-password|reset-password)/.test(location.pathname)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    window.miuGoBack(control.getAttribute('href') || '/');
  }, true);
})();

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
  const closeButtonSelector = 'button[aria-label*="close" i], button[aria-label*="exit" i], button[title*="close" i], button[class*="close" i], button[id*="close" i], .club-detail-close, .calendar-close-btn, .close-btn, .request-dialog-close, .club-review-notice-close, .club-feedback-dialog-close, .attachment-preview-close';
  const closeRailTargetSelector = '.request-dialog-inner, .calendar-panel, .modal-card, .event-modal-panel, .member-directory-inner, .member-dialog-inner, .status-overview-inner, .review-history-inner, .approval-checkpoint-more-inner, .attachment-preview-panel, .club-feedback-dialog, .club-review-notice-content, .attendance-review-panel, .admin-data-status-dialog, .committee-attendance-inner, .committee-availability-dialog, .attendance-review-dialog, .committee-sidebar, .president-sidebar, .student-dashboard-sidebar, .report-admin-sidebar, .homepage-admin-sidebar, #adminTabs';
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

  const navigationScript = document.createElement('script'); navigationScript.src = '/assets/js/dashboard-navigation.js?v=20261014freshvisit1'; document.head.append(navigationScript);
  const drawerStyles = document.createElement('link'); drawerStyles.rel = 'stylesheet'; drawerStyles.href = '/assets/css/mobile-sidebars.css?v=20261014hidescrollbar1';
  const drawerScript = document.createElement('script'); drawerScript.src = '/assets/js/mobile-sidebars.js?v=20261014unifieddrawer2';
  let drawerStarted = false;
  const loadMobileDrawers = () => { if (drawerStarted) return; drawerStarted = true; document.head.append(drawerScript); };
  drawerStyles.addEventListener('load', loadMobileDrawers, { once: true });
  drawerStyles.addEventListener('error', loadMobileDrawers, { once: true });
  document.head.append(drawerStyles);
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
      const res = await fetch(url, { siteStartupNonBlocking: true });
      if (res.ok) {
        el.innerHTML = await res.text();
        if (id === 'site-header') {
          initHeader();
          if (!document.querySelector('script[data-miu-push-client]')) {
            const pushClient = document.createElement('script');
            pushClient.src = '/assets/js/onesignal-notifications.js?v=20261014promptqueue1';
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
    const studentProfileLink = document.getElementById('headerStudentProfileLink');
    const studentProfileName = document.getElementById('headerStudentName');
    const studentProfileEmail = document.getElementById('headerStudentEmail');
    const studentProfileAvatar = document.getElementById('headerStudentAvatar');
    const accountPhotoButton = document.getElementById('headerAccountPhotoButton');
    const accountPhotoInput = document.getElementById('headerAccountPhotoInput');
    const accountPhotoStatus = document.getElementById('headerAccountPhotoStatus');
    let photoPrompt;
    const showPhotoPrompt = (photo) => {
      const requestedPhoto = new URLSearchParams(window.location.search).get('addPhoto') === '1';
      if (photo?.url || (photo?.promptDismissed && !requestedPhoto) || photoPrompt) return;
      if (requestedPhoto) {
        const url = new URL(window.location.href);
        url.searchParams.delete('addPhoto');
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      }
      photoPrompt = document.createElement('dialog');
      photoPrompt.className = 'account-photo-prompt';
      photoPrompt.setAttribute('aria-labelledby', 'accountPhotoPromptTitle');
      photoPrompt.innerHTML = `<h2 id="accountPhotoPromptTitle">Add your profile photo</h2>
        <p>Your photo will appear on your account and fill personal photo fields in applications.</p>
        <p>You can add or change it anytime: open the account menu and choose <strong>Add / change photo</strong>.</p>
        <p data-photo-prompt-status role="status" aria-live="polite"></p>
        <div class="account-photo-prompt-actions"><button type="button" data-photo-add>Add photo</button><button type="button" data-photo-later>Maybe later</button></div>`;
      document.body.append(photoPrompt);
      photoPrompt.addEventListener('cancel', event => event.preventDefault());
      photoPrompt.querySelector('[data-photo-add]').addEventListener('click', () => accountPhotoInput?.click());
      photoPrompt.querySelector('[data-photo-later]').addEventListener('click', async (event) => {
        if (event.target.dataset.saved === 'true') { photoPrompt.close(); return; }
        event.target.disabled = true;
        const status = photoPrompt.querySelector('[data-photo-prompt-status]');
        try {
          const response = await fetch('/api/site/account-photo', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promptDismissed: true })
          });
          if (!response.ok) throw new Error('Could not save your choice. Please try again.');
          status.textContent = 'You can add it later: account menu → Add / change photo.';
          photoPrompt.querySelector('[data-photo-add]').hidden = true;
          event.target.textContent = 'Got it';
          event.target.disabled = false;
          event.target.dataset.saved = 'true';
        } catch (error) {
          status.textContent = error.message;
          event.target.disabled = false;
        }
      });
      const promptEmail = currentHeaderSession?.email;
      window.queueSitePrompt('account-photo', photoPrompt, {
        eligible: () => currentHeaderSession?.authenticated && currentHeaderSession?.email === promptEmail
      });
    };
    const renderAccountPhoto = (photo) => {
      if (!studentProfileAvatar || !photo?.url) return;
      const image = document.createElement('img');
      image.src = photo.url;
      image.alt = '';
      studentProfileAvatar.replaceChildren(image);
    };
    accountPhotoButton?.addEventListener('click', () => accountPhotoInput?.click());
    accountPhotoInput?.addEventListener('change', async () => {
      const file = accountPhotoInput.files[0];
      if (!file) return;
      accountPhotoButton.disabled = true;
      accountPhotoStatus.hidden = false;
      accountPhotoStatus.textContent = 'Saving photo...';
      const promptStatus = photoPrompt?.querySelector('[data-photo-prompt-status]');
      if (promptStatus) promptStatus.textContent = 'Saving photo...';
      photoPrompt?.querySelectorAll('button').forEach(button => { button.disabled = true; });
      try {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
          throw new Error('Choose a PNG, JPG, or WebP photo up to 10 MB.');
        }
        if (!window.uploadImageToCloudinary) await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/assets/js/cloudinary-upload.js?v=2';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Could not load photo upload. Please retry.'));
          document.head.append(script);
        });
        const uploaded = await window.uploadImageToCloudinary(file, 'applicant');
        const response = await fetch('/api/site/account-photo', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(uploaded)
        });
        const photo = await response.json();
        if (!response.ok) throw new Error(photo?.message || 'Could not save your photo.');
        renderAccountPhoto(photo);
        photoPrompt?.close();
        window.dispatchEvent(new CustomEvent('miu:account-photo-changed', { detail: photo }));
        accountPhotoStatus.textContent = 'Photo saved. It will be used in personal photo fields.';
      } catch (error) {
        accountPhotoStatus.textContent = error.message;
        if (promptStatus) promptStatus.textContent = error.message;
      } finally {
        accountPhotoButton.disabled = false;
        accountPhotoInput.value = '';
        photoPrompt?.querySelectorAll('button').forEach(button => { button.disabled = false; });
      }
    });
    const accountDashboardLink = document.getElementById('headerAccountDashboardLink');
    const dashboardChoices = document.getElementById('headerDashboardChoices');
    const dashboardChoiceList = document.getElementById('headerDashboardChoiceList');
    const dashboardSwitchStatus = document.getElementById('headerDashboardSwitchStatus');
    const studentFormsLink = document.getElementById('headerStudentFormsLink');
    const attendanceUsherTaskLink = document.getElementById('headerAttendanceUsherTaskLink');
    let currentHeaderSession = null;
    let headerAccountRequestId = 0;
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
    studentProfileLink?.addEventListener('click', async (event) => {
      event.preventDefault();
      studentProfileLink.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch('/api/student-auth/session', { cache: 'no-store' });
        window.location.assign(response.ok
          ? '/?myForms=1'
          : '/pages/applicant-login.html?redirect=%2F%3FmyForms%3D1');
      } catch {
        window.location.assign('/pages/applicant-login.html?redirect=%2F%3FmyForms%3D1');
      }
    });
    document.addEventListener('click', (event) => {
      if (studentProfileMenu && !studentProfileMenu.contains(event.target)) closeStudentProfileMenu();
    });
    studentProfileDropdown?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeStudentProfileMenu));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeStudentProfileMenu(); });
    if (authBtn) {
      const refreshHeaderAccountState = async () => {
        const requestId = ++headerAccountRequestId;
        if (attendanceUsherTaskLink) attendanceUsherTaskLink.hidden = true;
        try {
          const response = await fetch('/api/site/account-session', { cache: 'no-store', siteStartupNonBlocking: true });
          if (!response.ok) return;
          const session = await response.json();
          currentHeaderSession = session;
          window.__miuAccountSession = session;
          window.dispatchEvent(new CustomEvent('miu:push-account-session-changed', { detail: session }));
          const destinations = {
            admin: { label: 'Admin Dashboard', href: '/admin' },
            president: { label: 'Club President Dashboard', href: '/club-dashboard' },
            head: { label: 'Committee Head Dashboard', href: '/club-dashboard' },
            pr: { label: 'PR Dashboard', href: '/dashboards/pr-dashboard.html' },
            english: { label: 'English Dashboard', href: '/dashboards/english-dashboard.html' },
            security: { label: 'Security Dashboard', href: '/dashboards/security-dashboard.html' },
            sso: { label: 'SSO Dashboard', href: '/dashboards/sso-dashboard.html' },
            supervisor: { label: 'Supervisor Dashboard', href: '/dashboards/supervisor-dashboard.html' },
            dean: { label: 'Dean Dashboard', href: '/dashboards/dean-dashboard.html' },
            software_development: { label: 'Software Development Dashboard', href: '/admin' },
            miu_events: { label: 'MIU Events Dashboard', href: '/dashboards/miu-events-dashboard.html' },
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
          const isSoftwareDeveloper = session?.type === 'club' && session?.role === 'software_development' && isAuthenticated;
          const studentDashboardHref = '/?myForms=1';
          if (studentProfileLink) studentProfileLink.href = studentDashboardHref;
          if (studentProfileMenu) studentProfileMenu.hidden = !isAuthenticated;
          if (authBtn) authBtn.hidden = isAuthenticated;
          if (studentSignoutBtn) studentSignoutBtn.hidden = !isAuthenticated;
          if (accountDashboardLink && account) {
            accountDashboardLink.href = isStudent ? studentDashboardHref : account.href;
            accountDashboardLink.textContent = isStudent ? 'Student dashboard' : isSoftwareDeveloper ? 'Software Development dashboard' : 'Dashboard';
            accountDashboardLink.title = isStudent ? 'Student dashboard and forms' : account.label;
            accountDashboardLink.hidden = false;
          }
          if (dashboardChoiceList) {
            dashboardChoiceList.replaceChildren();
            const choices = Array.isArray(session.dashboards)
              ? session.dashboards.filter(item => destinations[item.role]) : [];
            if (dashboardChoices) dashboardChoices.hidden = choices.length === 0 || isStudent;
            choices.forEach(choice => {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'nav-profile-item nav-profile-dashboard-option';
              button.setAttribute('role', 'menuitem');
              const shortLabels = { president: 'President', head: 'Committee head', software_development: 'Developer', miu_events: 'MIU Events', pr: 'PR', sso: 'SSO', dean: 'Dean', english: 'English', security: 'Security', supervisor: 'Supervisor' };
              button.textContent = [shortLabels[choice.role] || choice.label, choice.clubName || choice.committee].filter(Boolean).join(' · ');
              button.title = [destinations[choice.role].label, choice.committee, choice.clubName].filter(Boolean).join(' · ');
              if (choice.role === session.role) button.setAttribute('aria-current', 'page');
              button.addEventListener('click', async () => {
                button.disabled = true;
                if (dashboardSwitchStatus) dashboardSwitchStatus.textContent = `Opening ${choice.label}...`;
                try {
                  const response = await fetch('/api/club-auth/switch-dashboard', {
                    method: 'POST', credentials: 'same-origin', cache: 'no-store',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: choice.role })
                  });
                  const result = await response.json().catch(() => ({}));
                  if (!response.ok) throw new Error(result.message || 'Could not switch dashboards.');
                  const target = new URL(result.redirect, window.location.origin);
                  if (target.origin !== window.location.origin || !target.pathname.startsWith('/')) throw new Error('This dashboard link is not valid.');
                  window.location.assign(`${target.pathname}${target.search}${target.hash}`);
                } catch (error) {
                  if (dashboardSwitchStatus) dashboardSwitchStatus.textContent = error.message;
                  button.disabled = false;
                }
              });
              dashboardChoiceList.append(button);
            });
          }
          if (studentFormsLink) studentFormsLink.hidden = !isStudent;
          if (attendanceUsherTaskLink && isAuthenticated) {
            fetch('/api/miu-attendance-task', { credentials: 'same-origin', cache: 'no-store', siteStartupNonBlocking: true })
              .then(response => response.ok ? response.json() : null)
              .then(result => {
                if (requestId === headerAccountRequestId) attendanceUsherTaskLink.hidden = !Boolean(result?.task);
              })
              .catch(() => {
                if (requestId === headerAccountRequestId) attendanceUsherTaskLink.hidden = true;
              });
          }
          const notificationToggle = document.getElementById('headerNotificationToggle');
          const notificationStatus = document.getElementById('headerNotificationStatus');
          const emailNotificationToggle = document.getElementById('headerEmailNotificationToggle');
          const emailNotificationStatus = document.getElementById('headerEmailNotificationStatus');
          if (notificationToggle) notificationToggle.hidden = !(isAuthenticated && ['student', 'club', 'admin'].includes(session.type));
          if (emailNotificationToggle) emailNotificationToggle.hidden = !isStudent;
          if (!isStudent && notificationStatus) notificationStatus.hidden = true;
          if (!isStudent && emailNotificationStatus) emailNotificationStatus.hidden = true;
          if (isAuthenticated) {
            const accountName = String(session.name || account.label || 'My Account').trim();
            const accountIdentity = String(session.email || accountName);
            if (studentProfileName) studentProfileName.textContent = accountIdentity;
            if (studentProfileEmail) studentProfileEmail.textContent = '';
            if (studentProfileAvatar) studentProfileAvatar.textContent = accountName.charAt(0).toUpperCase() || 'A';
            window.loadAccountPhoto().then(photo => {
              if (requestId === headerAccountRequestId) {
                renderAccountPhoto(photo);
                showPhotoPrompt(photo);
              }
            }).catch(() => {});
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
        if (['student', 'club', 'admin'].includes(currentHeaderSession?.type)) await window.miuPushNotifications?.logout();
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

  inject('site-header', '/components/site-header.html?v=20261014accountphoto1');
  inject('site-footer', '/components/site-footer.html');
});
