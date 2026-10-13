(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  window.studentFeedbackForm = (kind, id, interaction = 'evaluation', question = 'How would you rate this club?', options = []) => {
    if (!['poll', 'evaluation'].includes(interaction)) return '';
    return `<form class="student-feedback" data-feedback-kind="${escape(kind)}" data-feedback-id="${Number(id)}">
      <h3>${escape(question)}</h3>
      <label>${interaction === 'poll' ? 'Your choice' : 'Your rating'}<select name="value" required><option value="">Choose an option</option>${(interaction === 'poll' ? options : ['1 — Poor', '2 — Fair', '3 — Good', '4 — Very good', '5 — Excellent']).map((option, index) => `<option value="${interaction === 'poll' ? index : index + 1}">${escape(option)}</option>`).join('')}</select></label>
      ${interaction === 'poll' ? '' : '<label>Comments (optional)<textarea name="comment" maxlength="1000" rows="3"></textarea></label>'}
      <p>Sign in as a student to respond. ${kind === 'club' ? 'Only admin, PR, and dean can view ratings.' : 'Only admin and PR can view responses.'} You can submit again to update your response.</p>
      <button class="primary-btn" type="submit">Save response</button><p role="status" aria-live="polite"></p>
    </form>`;
  };
  const style = document.createElement('style');
  style.textContent = '.student-feedback{display:grid;gap:12px;margin:20px 0;padding:20px;border:1px solid var(--border-color,#ccc);border-radius:16px;background:var(--bg-panel,#fff);color:var(--text-main,#222)}.student-feedback label{display:grid;gap:6px}.student-feedback select,.student-feedback textarea{width:100%;padding:10px;border:1px solid var(--border-color,#ccc);border-radius:8px;background:var(--bg-panel,#fff);color:inherit;font:inherit}.student-feedback p{font-size:.88rem}.feedback-results-dialog{width:min(900px,94vw);max-height:85vh;overflow:auto;border:1px solid var(--border-color,#ccc);border-radius:18px;padding:24px;background:var(--bg-panel,#fff);color:var(--text-main,#222)}.feedback-results-dialog::backdrop{background:#0008}.feedback-results-dialog article{padding:16px 0;border-bottom:1px solid #9995}.feedback-results-dialog p{white-space:pre-wrap;overflow-wrap:anywhere}.feedback-review-link{display:block;width:max-content;max-width:95%;margin:12px auto;padding:10px 18px}';
  document.head.append(style);
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-feedback-kind]');
    if (!form) return;
    event.preventDefault();
    const status = form.querySelector('[role="status"]');
    const button = form.querySelector('button');
    button.disabled = true;
    status.textContent = 'Saving…';
    try {
      const response = await fetch(`/api/feedback/${form.dataset.feedbackKind}/${form.dataset.feedbackId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: Number(form.elements.value.value), comment: form.elements.comment?.value || '' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in with your student account, then return to submit your response.' : data.message);
      status.textContent = data.message;
    } catch (error) { status.textContent = error.message || 'Could not save your response.'; }
    finally { button.disabled = false; }
  });
  async function setupReview() {
    const hasAdminFeedback = document.querySelector('#adminTabs [data-tab="feedback"]')
      && document.getElementById('studentFeedbackResults');
    const hasCommitteeFeedback = document.querySelector('.committee-sidebar')
      && document.getElementById('studentFeedbackPanel')
      && document.getElementById('studentFeedbackResults');
    if (!hasAdminFeedback && !hasCommitteeFeedback) return;

    try {
      const response = await fetch('/api/feedback/access', { cache: 'no-store', siteStartupNonBlocking: true });
      if (!response.ok) return;
      const access = await response.json();
      if (!access.club && !access.university) return;
      const feedbackRowsCache = new Map();
      const feedbackRowsLoadedAt = new Map();
      const feedbackRowsPending = new Map();
      const getFeedbackRows = (kind, refresh = false) => {
        if (!refresh && feedbackRowsCache.has(kind) && Date.now() - feedbackRowsLoadedAt.get(kind) < 30_000) {
          return Promise.resolve(feedbackRowsCache.get(kind));
        }
        if (!refresh && feedbackRowsPending.has(kind)) return feedbackRowsPending.get(kind);
        const request = (async () => {
          const res = await fetch(`/api/feedback/results/${kind}`, { cache: 'no-store' });
          const rows = await res.json();
          if (!res.ok) throw new Error(rows.message);
          feedbackRowsCache.set(kind, rows);
          feedbackRowsLoadedAt.set(kind, Date.now());
          return rows;
        })();
        feedbackRowsPending.set(kind, request);
        return request.finally(() => { if (feedbackRowsPending.get(kind) === request) feedbackRowsPending.delete(kind); });
      };
      const renderResults = async (results, kinds, refresh = false) => {
        if (refresh) kinds.forEach((kind) => { feedbackRowsCache.delete(kind); feedbackRowsLoadedAt.delete(kind); });
        const hasWarmResults = kinds.every((kind) => feedbackRowsCache.has(kind)
          && Date.now() - feedbackRowsLoadedAt.get(kind) < 30_000);
        if (!hasWarmResults) results.textContent = 'Loading…';
        try {
          let clubRows = [];
          const feedbackKeys = [];
          const sections = await Promise.all(kinds.map(async kind => {
            const rows = await getFeedbackRows(kind, refresh);
            feedbackKeys.push(...rows.flatMap(row => (row.responses || []).map(item => `${kind}:${row.id}:${item.email}:${item.updatedAt || ''}`)));
            if (kind === 'club') {
              clubRows = rows;
              const cards = rows.map(row => {
                const average = Number(row.average) || 0;
                const stars = Array.from({ length: 5 }, (_, index) => `<span class="feedback-star${average >= index + 0.75 ? ' is-filled' : ''}" aria-hidden="true">★</span>`).join('');
                return `<article class="club-feedback-card" data-club-name="${escape(row.title).toLowerCase()}" data-has-responses="${row.count > 0}"><div class="club-feedback-card-main"><div><h4>${escape(row.title)}</h4><div class="club-feedback-rating" aria-label="Average ${average.toFixed(2)} out of 5">${stars}<span>${row.count ? `${average.toFixed(2)} / 5` : 'Not rated yet'}</span></div><p>${row.count} response(s)</p></div><button class="club-feedback-detail-button" type="button" data-club-index="${rows.indexOf(row)}">Details</button></div></article>`;
              }).join('');
              return `<section class="student-feedback-section"><h2>Club ratings</h2><div class="club-feedback-filters"><label>Search clubs<input type="search" class="club-feedback-search" placeholder="Type a club name" /></label><label>Filter<select class="club-feedback-filter"><option value="all">All clubs</option><option value="rated">Rated clubs</option><option value="unrated">Not rated yet</option></select></label></div><div class="club-feedback-grid">${cards || '<p>No clubs found.</p>'}</div></section>`;
            }
            const cards = rows.map(row => `<article class="miu-feedback-card"><div class="miu-feedback-card-heading"><h3>${escape(row.title)}</h3><span>${row.interaction === 'poll' ? 'POLL' : 'EVALUATION'}</span></div><p class="miu-feedback-question">${escape(row.question)}</p><p class="miu-feedback-count">${row.count} response(s)${row.average == null ? '' : ` · Average: ${row.average.toFixed(2)} / 5`}</p>${row.counts.map(option => `<div class="miu-feedback-option"><span>${escape(option.option)}</span><strong>${option.count} vote(s)</strong></div>`).join('')}${row.interaction === 'evaluation' ? `<details><summary>View individual evaluations</summary>${row.responses.map(item => `<p><strong>${item.value} / 5</strong>${item.comment ? ` — ${escape(item.comment)}` : ''}</p>`).join('') || '<p>No responses yet.</p>'}</details>` : ''}</article>`).join('');
            return `<section class="student-feedback-section"><h2>MIU polls &amp; evaluations</h2><div class="miu-feedback-grid">${cards || '<p>No feedback items yet.</p>'}</div></section>`;
          }));
          results.innerHTML = sections.join('');
          window.dashboardUnread?.update('studentFeedback', feedbackKeys);
          let detailDialog = results.querySelector('.club-feedback-dialog');
          if (!detailDialog) {
            detailDialog = document.createElement('dialog');
            detailDialog.className = 'club-feedback-dialog';
            detailDialog.setAttribute('aria-label', 'Club rating details');
            results.append(detailDialog);
          }
          results.querySelectorAll('.club-feedback-detail-button').forEach(button => button.addEventListener('click', () => {
            const row = clubRows[Number(button.dataset.clubIndex)];
            if (!row) return;
            const responses = row.responses?.map(item => `<article class="club-feedback-response"><strong>${escape(item.email || 'Student')} · ${item.value} / 5</strong>${item.comment ? `<p>${escape(item.comment)}</p>` : '<p>No comment left.</p>'}</article>`).join('') || '<p>No responses yet.</p>';
            detailDialog.innerHTML = `<div class="club-feedback-dialog-heading"><h3>${escape(row.title)} details</h3><button type="button" class="club-feedback-dialog-close" aria-label="Close details">×</button></div><p>${row.count} response(s)${row.average == null ? '' : ` · Average ${row.average.toFixed(2)} / 5`}</p><div class="club-feedback-dialog-responses">${responses}</div>`;
            detailDialog.querySelector('.club-feedback-dialog-close').onclick = () => detailDialog.close();
            detailDialog.showModal();
          }));
          const search = results.querySelector('.club-feedback-search');
          const filter = results.querySelector('.club-feedback-filter');
          const applyFilters = () => {
            const query = search?.value.trim().toLocaleLowerCase() || '';
            results.querySelectorAll('.club-feedback-card').forEach(card => {
              const matchesName = card.dataset.clubName.includes(query);
              const matchesRating = filter?.value === 'rated' ? card.dataset.hasResponses === 'true' : filter?.value === 'unrated' ? card.dataset.hasResponses !== 'true' : true;
              card.hidden = !(matchesName && matchesRating);
            });
          };
          search?.addEventListener('input', applyFilters);
          filter?.addEventListener('change', applyFilters);
        } catch (error) { results.textContent = error.message || 'Could not load feedback.'; }
      };

      const adminTabButton = document.querySelector('#adminTabs [data-tab="feedback"]');
      const adminResults = document.getElementById('studentFeedbackResults');
      if (access.university && adminTabButton && adminResults) {
        adminTabButton.addEventListener('click', () => renderResults(adminResults, ['club']));
        document.getElementById('refreshStudentFeedbackBtn')?.addEventListener('click', () => renderResults(adminResults, ['club'], true));
        const miuTabButton = document.querySelector('#adminTabs [data-tab="miu-feedback"]');
        const miuResults = document.getElementById('miuFeedbackResults');
        if (miuTabButton && miuResults) {
          miuTabButton.addEventListener('click', () => renderResults(miuResults, ['university']));
          document.getElementById('refreshMiuFeedbackBtn')?.addEventListener('click', () => renderResults(miuResults, ['university'], true));
        }
        const preloadAdminFeedback = async () => {
          const tasks = [renderResults(adminResults, ['club'])];
          if (access.university && miuResults) tasks.push(renderResults(miuResults, ['university']));
          await Promise.allSettled(tasks);
        };
        if (window.siteStartup?.afterStartup) window.siteStartup.afterStartup(preloadAdminFeedback);
        else preloadAdminFeedback();
        return;
      }

      const sidebar = document.querySelector('.committee-sidebar');
      if (!sidebar) return;
      const feedbackPanel = document.getElementById('studentFeedbackPanel');
      const feedbackResults = document.getElementById('studentFeedbackResults');
      if (!feedbackPanel || !feedbackResults) return;
      const kinds = [...(access.club ? ['club'] : []), ...(access.university ? ['university'] : [])];
      const preloadCommitteeFeedback = () => renderResults(feedbackResults, kinds);
      if (window.siteStartup?.afterStartup) window.siteStartup.afterStartup(preloadCommitteeFeedback);
      else preloadCommitteeFeedback();
      document.getElementById('refreshStudentFeedbackBtn')?.addEventListener('click', () => renderResults(feedbackResults, kinds, true));
    } catch { /* Public pages remain available when session checks fail. */ }
  }  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupReview);
  else setupReview();
})();
