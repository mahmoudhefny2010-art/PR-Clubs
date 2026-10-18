// "Find Your Club" quiz user interface: floating launcher, modal dialog, question
// flow and results screen. The scoring logic itself lives in MiuQuizScoring and
// has no DOM, storage or network dependencies.
window.MiuQuiz = (function () {
  'use strict';

  const clubs = window.MiuQuizClubs;
  const questions = window.MiuQuizQuestions;
  const scoring = window.MiuQuizScoring;

  const STORAGE_VERSION = 1;
  const STORAGE_KEY = 'miu:quiz:v1';
  const DISMISSED_KEY = 'miu:quiz:message-dismissed-v1';
  const ATTEMPT_KEY = 'miu:quiz:attempt-v1';
  const PENDING_REPORT_KEY = 'miu:quiz:pending-report-v1';
  const TOTAL_QUESTIONS = questions.questions.length;

  const LAUNCHER_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<ellipse cx="12" cy="4.8" rx="2.2" ry="3.4" fill="#BE000B" transform="rotate(-20 12 4.8)"/>' +
    '<g transform="rotate(51.43 12 12)"><ellipse cx="12" cy="4.8" rx="2.2" ry="3.4" fill="#AC010A" transform="rotate(-20 12 4.8)"/></g>' +
    '<g transform="rotate(102.86 12 12)"><ellipse cx="12" cy="4.8" rx="2.2" ry="3.4" fill="#9C0108" transform="rotate(-20 12 4.8)"/></g>' +
    '<g transform="rotate(154.29 12 12)"><ellipse cx="12" cy="4.8" rx="2.2" ry="3.4" fill="#060505" transform="rotate(-20 12 4.8)"/></g>' +
    '<g transform="rotate(205.71 12 12)"><ellipse cx="12" cy="4.8" rx="2.2" ry="3.4" fill="#000000" transform="rotate(-20 12 4.8)"/></g>' +
    '<g transform="rotate(257.14 12 12)"><ellipse cx="12" cy="4.8" rx="2.2" ry="3.4" fill="#7F1D1D" transform="rotate(-20 12 4.8)"/></g>' +
    '<g transform="rotate(308.57 12 12)"><ellipse cx="12" cy="4.8" rx="2.2" ry="3.4" fill="#BE000B" transform="rotate(-20 12 4.8)"/></g>' +
    '</svg>';

  function createQuizUI(options) {
    options = options || {};

    const dom = options.dom || document;
    const win = options.window || window;
    const storage = options.storage || win.sessionStorage;
    const matchMedia =
      options.matchMedia || (win.matchMedia ? win.matchMedia.bind(win) : function () { return { matches: false }; });
    const reducedMotion =
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onViewClub = options.onViewClub || defaultViewClub;
    const onBrowseClubs = options.onBrowseClubs || defaultBrowseClubs;

    let launcherButton = null;
    let launcherBubble = null;
    let dialogEl = null;
    let openerElement = null;
    let stopFooterTracking = null;
    let reporting = false;
    let attemptId = null;
    let pendingReports = [];
    let reportsLoaded = false;

    let step = 1; // 1..TOTAL_QUESTIONS or 'results'
    let answers = {};
    let results = null;
    let submitting = false;

    // ------------------------------------------------------------------
    // Persistence
    // ------------------------------------------------------------------
    function loadStoredState() {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || data.version !== STORAGE_VERSION) return null;
        if (data.step === 'results') {
          return { step: 'results', answers: {}, results: data.results || null };
        }
        if (typeof data.step === 'number' && Number.isInteger(data.step)
          && data.step >= 1 && data.step <= TOTAL_QUESTIONS) {
          const answersCopy = {};
          for (const q of questions.questions) {
            const value = data.answers && data.answers[q.id];
            const option = questions.option(q.id, value);
            if (value && !option) continue; // stale, missing or unknown answer ID
            if (value) answersCopy[q.id] = value;
          }
          // Q2 may not repeat Q1.
          if (answersCopy.q1 && answersCopy.q2) {
            const firstInterest = questions.option('q1', answersCopy.q1)?.interestKey;
            const secondInterest = questions.option('q2', answersCopy.q2)?.interestKey;
            if (firstInterest && firstInterest === secondInterest) delete answersCopy.q2;
          }
          return { step: data.step, answers: answersCopy };
        }
        return null;
      } catch {
        return null;
      }
    }

    function persist() {
      try {
        storage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: STORAGE_VERSION,
            step,
            answers: step === 'results' ? {} : answers,
            results: results || null
          })
        );
      } catch {
        // Private browsing or full storage: quiz keeps working in memory only.
      }
    }

    function hasProgress() {
      return Object.keys(answers).length > 0 || results !== null;
    }

    // ------------------------------------------------------------------
    // Default destinations (can be overridden by the host page)
    // ------------------------------------------------------------------
    function defaultViewClub(clubId) {
      const isHomepage = win.location.pathname === '/' || win.location.pathname === '/index.html';
      if (isHomepage && typeof win.openClubDetail === 'function') {
        win.openClubDetail(String(clubId));
        return;
      }
      win.location.assign('/?club=' + encodeURIComponent(String(clubId)));
    }

    function defaultBrowseClubs() {
      if (win.location.pathname === '/' || win.location.pathname === '/index.html') {
        const grid = dom.getElementById('clubGrid');
        if (grid) {
          grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
      win.location.assign('/');
    }

    // ------------------------------------------------------------------
    // Launcher
    // ------------------------------------------------------------------
    function ensureLauncher() {
      if (launcherButton) return;

      const wrapper = dom.createElement('div');
      wrapper.className = 'quiz-launcher';

      launcherButton = dom.createElement('button');
      launcherButton.type = 'button';
      launcherButton.className = 'quiz-launcher-circle';
      launcherButton.setAttribute('aria-label', 'Find your club');
      launcherButton.setAttribute('title', 'Find your club');
      launcherButton.innerHTML = LAUNCHER_SVG;

      launcherBubble = dom.createElement('div');
      launcherBubble.className = 'quiz-launcher-bubble';
      launcherBubble.setAttribute('role', 'region');
      launcherBubble.setAttribute('aria-label', "Can't Find your Club yet?");
      launcherBubble.innerHTML =
        '<span class="quiz-launcher-bubble-text">Can\'t Find your Club yet?</span>' +
        '<button class="quiz-launcher-dismiss" type="button" aria-label="Dismiss this message">&times;</button>';

      const dismiss = launcherBubble.querySelector('.quiz-launcher-dismiss');
      dismiss.addEventListener('click', function (event) {
        event.stopPropagation();
        dismissMessage();
      });

      launcherButton.addEventListener('click', open);
      launcherBubble.addEventListener('click', open);

      wrapper.append(launcherButton, launcherBubble);
      dom.body.appendChild(wrapper);
      trackFooter(wrapper);
      if (win.addEventListener) win.addEventListener('online', flushQuizReport);
      flushQuizReport();

      // Show the greeting again on each page load, including after a refresh.
      try { storage.setItem(DISMISSED_KEY, '0'); } catch { /* ignore */ }
      updateMessageVisibility();
    }

    function trackFooter(wrapper) {
      if (!win.addEventListener) return;
      let footer = null;
      let lastOverlap = -1;
      function update() {
        if (!footer || !footer.isConnected) {
          footer = dom.querySelector('#site-footer, body > footer, .site-footer');
        }
        const rect = footer && footer.getBoundingClientRect();
        const overlap = rect && rect.height > 0 ? Math.max(0, win.innerHeight - rect.top) : 0;
        if (overlap !== lastOverlap) {
          wrapper.style.setProperty('--quiz-footer-offset', overlap + 'px');
          lastOverlap = overlap;
        }
      }
      dom.addEventListener('scroll', update, { capture: true, passive: true });
      win.addEventListener('resize', update);
      const observer = win.ResizeObserver ? new win.ResizeObserver(update) : null;
      if (observer) observer.observe(dom.body);
      update();
      stopFooterTracking = function () {
        dom.removeEventListener('scroll', update, true);
        win.removeEventListener('resize', update);
        if (observer) observer.disconnect();
      };
    }

    function updateMessageVisibility() {
      let dismissed = false;
      try { dismissed = storage.getItem(DISMISSED_KEY) === '1'; } catch { /* ignore */ }
      if (launcherBubble) launcherBubble.style.display = dismissed ? 'none' : '';
    }

    function reportQuizPoints() {
      if (!win.fetch || !win.crypto || !win.crypto.randomUUID) return;
      loadQuizReports();
      try { attemptId = attemptId || storage.getItem(ATTEMPT_KEY); } catch { /* in-memory fallback */ }
      if (!attemptId) attemptId = win.crypto.randomUUID();
      pendingReports = pendingReports.filter(report => report.attemptId !== attemptId);
      pendingReports.push({ attemptId, answers: { ...answers } });
      try { storage.setItem(ATTEMPT_KEY, attemptId); } catch { /* in-memory fallback */ }
      saveQuizReports();
      flushQuizReport();
    }

    function loadQuizReports() {
      if (reportsLoaded) return;
      reportsLoaded = true;
      try {
        const saved = JSON.parse(storage.getItem(PENDING_REPORT_KEY) || '[]');
        pendingReports = Array.isArray(saved) ? saved : saved.attemptId ? [saved] : [];
      } catch { /* in-memory fallback */ }
    }

    function saveQuizReports() {
      try {
        if (pendingReports.length) storage.setItem(PENDING_REPORT_KEY, JSON.stringify(pendingReports));
        else storage.removeItem(PENDING_REPORT_KEY);
      } catch { /* Reports remain queued in memory. */ }
    }

    async function flushQuizReport() {
      if (!win.fetch || reporting) return;
      loadQuizReports();
      reporting = true;
      try {
        while (pendingReports.length) {
          const report = pendingReports[0];
          const response = await win.fetch('/api/quiz/submissions', {
            method: 'POST', credentials: 'same-origin', keepalive: true,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report)
          });
          if (!response.ok && response.status !== 401) return; // Retry temporary failures.
          // Guests may use the quiz; only signed-in accounts contribute points.
          pendingReports = pendingReports.filter(item => item !== report);
          saveQuizReports();
        }
      } catch { /* Keep the pending report so a temporary outage does not lose it. */ }
      finally { reporting = false; }
    }

    function dismissMessage() {
      try { storage.setItem(DISMISSED_KEY, '1'); } catch { /* ignore */ }
      updateMessageVisibility();
    }

    // ------------------------------------------------------------------
    // Dialog
    // ------------------------------------------------------------------
    function ensureDialog() {
      if (dialogEl) return;

      dialogEl = dom.createElement('dialog');
      dialogEl.className = 'quiz-dialog';
      dialogEl.setAttribute('aria-labelledby', 'quiz-title');
      dialogEl.setAttribute('aria-describedby', 'quiz-description');

      dialogEl.innerHTML =
        '<button class="quiz-dialog-close calendar-close-btn" type="button" aria-label="Close quiz">&times;</button>' +
        '<div class="quiz-panel">' +
        '<div class="quiz-header">' +
        '<span class="quiz-eyebrow">Find Your Club</span>' +
        '<h2 id="quiz-title" class="quiz-modal-title">Find Your Club</h2>' +
        '<p id="quiz-description" class="quiz-modal-desc">Answer 15 quick questions to discover clubs that match your interests.</p>' +
        '<div class="quiz-progress-wrap">' +
        '<span id="quiz-progress-text" class="quiz-progress-text">Question 1 of 15</span>' +
        '<progress id="quiz-progress-bar" class="quiz-progress-bar" max="' + TOTAL_QUESTIONS + '" value="1"></progress>' +
        '<ol id="quiz-step-dots" class="quiz-step-dots" role="list" aria-label="Quiz progress"></ol>' +
        '</div>' +
        '<div id="quiz-announce" class="quiz-announce" role="status" aria-live="polite"></div>' +
        '</div>' +
        '<div class="quiz-content"></div>' +
        '<footer class="quiz-actions"></footer>' +
        '</div>';

      const closeBtn = dialogEl.querySelector('.quiz-dialog-close');
      closeBtn.addEventListener('click', close);

      dialogEl.addEventListener('click', function (event) {
        if (event.target === dialogEl) close();
      });

      bindDialogActions();

      dom.body.appendChild(dialogEl);

      renderDots();
    }

    function renderDots() {
      const list = dom.getElementById('quiz-step-dots');
      if (!list) return;
      list.innerHTML = '';
      for (let i = 1; i <= TOTAL_QUESTIONS; i += 1) {
        const item = dom.createElement('li');
        item.className = 'quiz-step-dot';
        item.setAttribute('aria-label', 'Question ' + i + ' of ' + TOTAL_QUESTIONS);
        if (step !== 'results' && i === step) item.setAttribute('aria-current', 'true');
        list.appendChild(item);
      }
    }

    function open() {
      ensureLauncher();
      ensureDialog();

      const stored = loadStoredState();
      if (stored) {
        step = stored.step;
        answers = stored.answers;
        results = stored.results || null;
      } else {
        step = 1;
        answers = {};
      }
      submitting = false;

      openerElement = dom.activeElement && typeof dom.activeElement.addEventListener === 'function' ? dom.activeElement : launcherButton;

      dialogEl.showModal();
      lockScroll();
      render();
      announce('Question ' + (step !== 'results' ? step : TOTAL_QUESTIONS) + ' of ' + TOTAL_QUESTIONS);
      focusCurrentView();

    }

    function close() {
      if (!dialogEl) return;
      dialogEl.close();
      unlockScroll();
      if (openerElement && typeof openerElement.focus === 'function') {
        openerElement.focus();
      }
      openerElement = null;
    }

    function lockScroll() {
      dom.documentElement.classList.add('quiz-scroll-lock');
    }

    function unlockScroll() {
      dom.documentElement.classList.remove('quiz-scroll-lock');
    }

    // ------------------------------------------------------------------
    // Answer state
    // ------------------------------------------------------------------
    function currentQuestion() {
      return step === 'results' ? null : questions.question('q' + step);
    }

    function selectAnswer(optionId) {
      const q = currentQuestion();
      if (!q) return false;
      const option = questions.option(q.id, optionId);
      if (!option) return false;

      answers[q.id] = optionId;
      if (q.id === 'q1') {
        const previousQ2 = questions.option('q2', answers.q2);
        if (previousQ2 && previousQ2.interestKey === option.interestKey) delete answers.q2;
      }
      persist();
      render();
      return true;
    }

    function goBack() {
      if (step === 'results' || step <= 1) return;
      step -= 1;
      submitting = false;
      results = null;
      persist();
      render();
      announce('Question ' + step + ' of ' + TOTAL_QUESTIONS);
      focusCurrentView();
    }

    function goNext() {
      const q = currentQuestion();
      if (!q) return;
      if (!answers[q.id]) return;
      if (step === 'results') return;

      if (step === TOTAL_QUESTIONS) {
        if (submitQuiz()) step = 'results';
        return;
      }
      step += 1;
      submitting = false;
      results = null;
      persist();
      render();
      announce('Question ' + step + ' of ' + TOTAL_QUESTIONS);
      focusCurrentView();
    }

    function submitQuiz() {
      if (submitting) return false;
      for (const q of questions.questions) {
        const value = answers[q.id];
        if (!value || !questions.option(q.id, value)) return false; // invalid, missing or unknown answer ID
      }
      if (answers.q1 && answers.q2 && answers.q2 === answers.q1) return false;

      submitting = true;
      results = scoring.compute(clubs.clubs, questions.questions, answers);
      reportQuizPoints();
      step = 'results';
      persist();
      render();
      announce('Results ready. Your top club matches.');
      focusCurrentView();
      return true;
    }

    function startOver(confirmNeeded) {
      if (!confirmNeeded || !hasProgress()) {
        resetAndRender();
        return;
      }
      showResetConfirmation();
    }

    function resetAndRender() {
      attemptId = null;
      try { storage.removeItem(ATTEMPT_KEY); } catch { /* ignore */ }
      step = 1;
      answers = {};
      results = null;
      submitting = false;
      persist();
      render();
      announce('Quiz restarted. Question 1 of ' + TOTAL_QUESTIONS);
      focusCurrentView();
    }

    function showResetConfirmation() {
      const content = dom.querySelector('.quiz-content');
      const previousHTML = content.innerHTML;
      content.innerHTML =
        '<article class="quiz-confirm-card">' +
        '<h3 class="quiz-confirm-title">Start over?</h3>' +
        '<p class="quiz-confirm-text">Your answers and results will be cleared.</p>' +
        '<div class="quiz-confirm-actions">' +
        '<button type="button" class="quiz-btn quiz-reset-cancel">Cancel</button>' +
        '<button type="button" class="quiz-btn quiz-reset-confirm primary-btn">Start over</button>' +
        '</div>' +
        '</article>';
      content.addEventListener('click', function onConfirmClick(event) {
        const button = event.target.closest('button');
        if (!button) return;
        content.removeEventListener('click', onConfirmClick);
        content.innerHTML = previousHTML;
        if (button.classList.contains('quiz-reset-confirm')) resetAndRender();
        else focusCurrentView();
      });
      const confirm = content.querySelector('.quiz-reset-confirm');
      if (confirm && typeof confirm.focus === 'function') confirm.focus();
    }

    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------
    function focusCurrentView() {
      if (!dialogEl || !dialogEl.open) return;
      const heading = dom.getElementById('quiz-question-heading') || dom.getElementById('quiz-results-title');
      if (heading && typeof heading.focus === 'function') heading.focus();
    }

    function announce(text) {
      const live = dom.getElementById('quiz-announce');
      if (live) live.textContent = text;
    }

    function isOptionSelected(optionId) {
      const q = currentQuestion();
      return q ? answers[q.id] === optionId : false;
    }

    function nextButtonDisabled() {
      const q = currentQuestion();
      return !q || !answers[q.id] || submitting;
    }

    function render() {
      if (!dialogEl || !dialogEl.open) return;
      renderDots();
      const progressText = dom.getElementById('quiz-progress-text');
      const progressBar = dom.getElementById('quiz-progress-bar');
      const content = dom.querySelector('.quiz-content');
      const actions = dom.querySelector('.quiz-actions');
      const stepDisplay = step === 'results' ? TOTAL_QUESTIONS : step;
      if (progressText) progressText.textContent = 'Question ' + stepDisplay + ' of ' + TOTAL_QUESTIONS;
      if (progressBar) progressBar.value = stepDisplay;

      content.innerHTML = '';
      actions.innerHTML = '';

      if (step === 'results') {
        renderResults(content, actions);
      } else {
        renderQuestion(content, actions);
      }
    }

    function renderQuestion(container, actions) {
      const q = currentQuestion();

      const heading = dom.createElement('h2');
      heading.id = 'quiz-question-heading';
      heading.className = 'quiz-question-heading';
      heading.setAttribute('tabindex', '-1');
      heading.textContent = q.text;
      container.appendChild(heading);

      const fieldset = dom.createElement('fieldset');
      fieldset.className = 'quiz-question-fieldset';
      const legend = dom.createElement('legend');
      legend.className = 'visually-hidden';
      legend.textContent = q.text;
      fieldset.appendChild(legend);

      const list = dom.createElement('ul');
      list.className = 'quiz-options';

      const q1Answer = answers.q1;
      const q1Interest = q1Answer ? questions.option('q1', q1Answer)?.interestKey : null;
      const options = q.options.filter((o) => q.id === 'q2' && q1Interest ? o.interestKey !== q1Interest : true);

      for (const o of options) {
        const item = dom.createElement('li');
        item.className = 'quiz-option-item';

        const input = dom.createElement('input');
        input.type = 'radio';
        input.name = 'quiz-answer';
        input.value = o.id;
        input.id = 'quiz-opt-' + o.id;
        input.checked = isOptionSelected(o.id);
        input.setAttribute('aria-label', o.label);

        const radioFace = dom.createElement('span');
        radioFace.className = 'quiz-option-radio';

        const label = dom.createElement('label');
        label.className = 'quiz-option-card';
        label.setAttribute('for', 'quiz-opt-' + o.id);
        if (isOptionSelected(o.id)) label.setAttribute('data-selected', 'true');

        const labelText = dom.createElement('span');
        labelText.className = 'quiz-option-label';
        labelText.textContent = o.label;

        label.append(input, radioFace, labelText);
        item.appendChild(label);
        list.appendChild(item);

        input.addEventListener('change', function () {
          if (input.checked) selectAnswer(o.id);
        });
      }

      fieldset.appendChild(list);
      container.appendChild(fieldset);

      const hint = dom.createElement('p');
      hint.className = 'quiz-option-hint';
      hint.textContent = q.id === 'q2'
        ? "This choice must differ from your main interest."
        : 'Select one answer, then tap Next.';
      container.appendChild(hint);

      const back = dom.createElement('button');
      back.type = 'button';
      back.className = 'quiz-btn quiz-back';
      back.disabled = step <= 1;
      back.textContent = 'Back';

      const next = dom.createElement('button');
      next.type = 'button';
      next.className = 'quiz-btn quiz-next primary-btn';
      next.disabled = nextButtonDisabled();
      next.textContent = step === TOTAL_QUESTIONS ? 'Submit & View Your Top 3' : 'Next';

      actions.append(back, next);

      updateSelectedVisuals();
    }

    function updateSelectedVisuals() {
      if (!dialogEl) return;
      dialogEl.querySelectorAll('.quiz-option-card').forEach((card) => {
        const input = card.querySelector('input[type="radio"]');
        if (input && input.checked) card.setAttribute('data-selected', 'true');
        else card.removeAttribute('data-selected');
      });
    }

    function renderResults(container, actions) {
      const computed = results || scoring.compute(clubs.clubs, questions.questions, answers);

      const heading = dom.createElement('h2');
      heading.id = 'quiz-results-title';
      heading.className = 'quiz-results-heading';
      heading.setAttribute('tabindex', '-1');
      heading.textContent = 'Your Top Club Matches';
      container.appendChild(heading);

      const sub = dom.createElement('p');
      sub.className = 'quiz-results-sub';
      sub.textContent = 'Based on the interests you selected.';
      container.appendChild(sub);

      if (computed.empty) {
        const empty = dom.createElement('div');
        empty.className = 'quiz-empty';
        empty.innerHTML =
          '<p>Your answers were all neutral, so we don\u2019t have a club match to show you.</p>' +
          '<p>Browse the full club directory to see everything on offer.</p>';
        container.appendChild(empty);

        const browse = dom.createElement('button');
        browse.type = 'button';
        browse.className = 'quiz-btn primary-btn';
        browse.textContent = 'Browse all clubs';
        browse.addEventListener('click', function (event) {
          event.preventDefault();
          close();
          onBrowseClubs();
        });
        const retake = dom.createElement('button');
        retake.type = 'button';
        retake.className = 'quiz-btn secondary-btn';
        retake.textContent = 'Retake quiz';
        retake.addEventListener('click', function (event) {
          event.preventDefault();
          startOver(true);
        });
        actions.append(retake, browse);
        return;
      }

      const list = dom.createElement('ul');
      list.className = 'quiz-results-list';
      container.appendChild(list);

      for (const result of computed.results) {
        const card = dom.createElement('li');
        card.className = 'quiz-result-card';

        const rank = dom.createElement('span');
        rank.className = 'quiz-result-rank';
        rank.textContent = result.rank;

        const copy = dom.createElement('div');
        copy.className = 'quiz-result-copy';

        const name = dom.createElement('h3');
        name.className = 'quiz-result-name';
        name.textContent = result.club.name;

        const category = dom.createElement('p');
        category.className = 'quiz-result-category';
        category.textContent = result.club.category;

        const desc = dom.createElement('p');
        desc.className = 'quiz-result-desc';
        desc.textContent = result.club.description;

        const reasonsList = dom.createElement('ul');
        reasonsList.className = 'quiz-reasons';
        for (const reason of result.reasons) {
          const reasonItem = dom.createElement('li');
          reasonItem.className = 'quiz-reason';
          reasonItem.textContent = reason;
          reasonsList.appendChild(reasonItem);
        }

        copy.append(name, category, desc, reasonsList);

        const view = dom.createElement('button');
        view.type = 'button';
        view.className = 'quiz-btn quiz-view-club primary-btn';
        view.setAttribute('data-club-id', result.club.id);
        view.textContent = 'View Club';
        view.addEventListener('click', function (event) {
          event.preventDefault();
          const id = event.currentTarget.getAttribute('data-club-id');
          if (id) onViewClub(id);
        });

        card.append(rank, copy, view);
        list.appendChild(card);
      }

      const review = dom.createElement('button');
      review.type = 'button';
      review.className = 'quiz-btn secondary-btn';
      review.textContent = 'Review my answers';
      review.addEventListener('click', function (event) {
        event.preventDefault();
        step = 1;
        results = null;
        submitting = false;
        persist();
        render();
        announce('Reviewing your answers. Question 1 of ' + TOTAL_QUESTIONS);
        focusCurrentView();
      });

      const retake = dom.createElement('button');
      retake.type = 'button';
      retake.className = 'quiz-btn secondary-btn';
      retake.textContent = 'Retake quiz';
      retake.addEventListener('click', function (event) {
        event.preventDefault();
        startOver(true);
      });

      const browse = dom.createElement('button');
      browse.type = 'button';
      browse.className = 'quiz-btn primary-btn';
      browse.textContent = 'Browse all clubs';
      browse.addEventListener('click', function (event) {
        event.preventDefault();
        close();
        onBrowseClubs();
      });

      actions.append(review, retake, browse);
    }

    function bindDialogActions() {
      if (!dialogEl) return;
      dialogEl.addEventListener('click', function (event) {
        const target = event.target.closest('button');
        if (!target) return;

        if (target.classList.contains('quiz-back')) {
          event.preventDefault();
          goBack();
          return;
        }
        if (target.classList.contains('quiz-next')) {
          event.preventDefault();
          goNext();
          return;
        }
        if (target.classList.contains('quiz-view-club')) {
          event.preventDefault();
          const id = target.getAttribute('data-club-id');
          if (id) onViewClub(id);
          return;
        }
      });
    }

    return {
      mount: ensureLauncher,
      open: open,
      close: close,
      isOpen: function () { return Boolean(dialogEl && dialogEl.open); },
      selectAnswer: selectAnswer,
      goBack: goBack,
      goNext: goNext,
      submitQuiz: submitQuiz,
      startOver: startOver,
      dismissMessage: dismissMessage,
      destroy: function () {
        close();
        if (win.removeEventListener) win.removeEventListener('online', flushQuizReport);
        if (stopFooterTracking) stopFooterTracking();
        stopFooterTracking = null;
        if (launcherButton && launcherButton.parentNode) launcherButton.parentNode.remove();
        launcherButton = null;
        launcherBubble = null;
        dialogEl = null;
      }
    };
  }

  return {
    create: createQuizUI
  };
})();

// Mount the floating launcher on every page without opening the quiz.
// Guarded so the module also loads in test contexts without a document.
(function () {
  const win = window;
  const doc = typeof document === 'undefined' ? null : document;
  if (!doc) return;
  function startQuiz() {
    if (win.MiuQuizInitialized) return;
    win.MiuQuizInitialized = true;
    const quiz = win.MiuQuiz.create({ dom: doc, window: win });
    quiz.mount();
    void quiz;
  }
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', startQuiz);
  } else {
    startQuiz();
  }
})();
