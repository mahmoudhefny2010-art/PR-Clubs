window.mountEventReports = function (root) {
  'use strict';
  const $ = id => root.querySelector('#' + id);
  const fields = { summary: 'Event summary', objectives: 'Objectives', activities: 'Activities', outcomes: 'Outcomes', lessonsLearned: 'Lessons learned' };
  let role, loaded;
  function node(tag, text) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; }
  async function api(path, options) {
    const response = await fetch('/api/event-reports' + path, { credentials: 'same-origin', ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Reporting request failed.');
    return data;
  }
  const count = value => value === null ? 'Unavailable' : String(value);
  function render(data) {
    const o = data.overview;
    $('reportOverview').replaceChildren();
    const metrics = node('div'); metrics.className = 'report-metrics';
    for (const text of [`${o.events} events`, `${o.reported} reports submitted`, `${o.registered} registrations in available records`, `${o.verified} verified check-ins in available records`]) metrics.append(node('span', text));
    $('reportOverview').append(metrics, node('p', `${o.missingRegistration} events lack registration data; ${o.missingAttendance} lack attendance data. Totals count event participations, not unique students. ${data.undatedEvents} club events have missing or invalid dates and cannot be assigned to this period.`));
    $('reportEvents').replaceChildren();
    if (!data.events.length) $('reportEvents').append(node('p', 'No events fall within this period.'));
    for (const event of data.events) {
      const report = event.report, article = node('article'); article.className = 'event-report';
      article.append(node('h2', event.title), node('p', `${event.date} · ${report?.status || 'No report'}`),
        node('p', `Registered attendees: ${count(event.statistics.registered)} · Verified attendance: ${count(event.statistics.verified)}`),
        node('p', 'Verified attendance counts recorded check-ins; it does not imply final administrative approval. Figures are calculated from existing records and cannot be entered manually.'));
      if (report) article.append(node('p', `Submitted: ${report.submittedAt ? new Date(report.submittedAt).toLocaleString() : 'Not submitted'} · Updated: ${new Date(report.updatedAt).toLocaleString()}`));
      const editable = role === 'president' && (!report || ['draft', 'changes_requested'].includes(report.status));
      const form = node('form');
      for (const [key, title] of Object.entries(fields)) {
        if (editable) {
          const label = node('label', title), input = node('textarea'); input.name = key; input.maxLength = 5000; input.value = report?.[key] || ''; label.append(input); form.append(label);
        } else { const dl = node('dl'); dl.append(node('dt', title), node('dd', report?.[key] || 'No report supplied')); article.append(dl); }
      }
      if (report?.history?.length) {
        const details = node('details'); details.append(node('summary', 'Report history'));
        for (const h of report.history) details.append(node('p', `${new Date(h.at).toLocaleString()} · ${h.action} · ${h.actor}${h.note ? ': ' + h.note : ''}`));
        article.append(details);
      }
      const review = role === 'supervisor' && report?.status === 'submitted';
      if (review) { const label = node('label', 'Review note'); const input = node('textarea'); input.name = 'note'; input.required = true; input.maxLength = 2000; label.append(input); form.append(label); }
      if (editable || review) {
        const actions = node('div'); actions.className = 'report-actions';
        for (const [status, title] of (review ? [['reviewed', 'Mark reviewed'], ['changes_requested', 'Request changes']] : [['draft', 'Save draft'], ['submitted', 'Submit report']])) {
          const button = node('button', title); button.type = 'submit'; button.value = status; button.className = 'primary-btn'; actions.append(button);
        }
        form.append(actions);
        form.addEventListener('submit', async e => {
          e.preventDefault();
          const body = Object.fromEntries(new FormData(form)); body.status = e.submitter.value; body.revision = report?.revision || 0;
          const buttons = [...form.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
          try {
            await api(`/clubs/${loaded.clubId}/events/${encodeURIComponent(event.key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            await load();
          } catch (error) { $('reportFeedback').textContent = error.message; }
          finally { buttons.forEach(b => b.disabled = false); }
        });
        article.append(form);
      }
      $('reportEvents').append(article);
    }
  }
  async function load() {
    $('reportFeedback').textContent = 'Loading reports…';
    $('reportEvents').replaceChildren(); $('reportOverview').replaceChildren();
    const data = await api(`/clubs/${loaded.clubId}?${new URLSearchParams({ start: loaded.start, end: loaded.end })}`);
    render(data); $('reportFeedback').textContent = 'Reports loaded.';
  }
  $('reportFilters').addEventListener('submit', async e => {
    e.preventDefault(); loaded = { clubId: $('reportClub').value, start: $('reportStart').value, end: $('reportEnd').value };
    try { await load(); } catch (error) { $('reportFeedback').textContent = error.message; }
  });
  api('/clubs').then(data => {
    role = data.role;
    for (const club of data.clubs) { const option = node('option', club.name); option.value = club.id; $('reportClub').append(option); }
    $('reportClub').disabled = !data.clubs.length;
    $('reportFeedback').textContent = data.clubs.length ? 'Select the official semester dates to begin.' : 'No authorized clubs are available.';
  }).catch(error => { $('reportFeedback').textContent = error.message; });
};
if (document.getElementById('reportFilters')) window.mountEventReports(document);
