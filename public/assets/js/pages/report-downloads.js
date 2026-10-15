window.mountReportDownloads = function (root, kind, audienceOverride) {
  'use strict';
  const $ = id => root.querySelector('#' + id);
  const attendance = kind === 'attendance';
  const openAudience = attendance && (audienceOverride || new URLSearchParams(location.search).get('audience')) === 'all_students';
  const audienceValue = openAudience ? 'all_students' : 'members';
  $('downloadEventLabel').hidden = !attendance;
  let generation = 0;
  let activeRequest = null;
  const eventCache = new Map();
  async function loadEvents(params) {
    const key = params.toString(), cached = eventCache.get(key);
    if (cached && Date.now() - cached.at < 15000) return cached.data;
    activeRequest?.abort();
    for (let attempt = 0; attempt < 1; attempt++) {
      const controller = new AbortController();
      activeRequest = controller;
      const deadline = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`/api/report-downloads/events?${params}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal, siteStartupNonBlocking: true });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not load events.');
        eventCache.set(key, { data, at: Date.now() });
        return data;
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('Loading events timed out. Press Show events to retry.');
        if (!(error instanceof TypeError)) throw error;
        throw new Error('Could not connect to the server. Press Show events to retry.');
      } finally { clearTimeout(deadline); }
    }
  }
  $('downloadTitle').textContent = attendance ? openAudience ? 'Open event attendance sheets' : 'Club member attendance sheets' : 'Download event reports';
  if (root === document) document.title = $('downloadTitle').textContent + ' · MIU Clubs';
  $('downloadButton').textContent = attendance ? 'Show events' : 'Download Excel report';
  if ($('downloadIntro')) $('downloadIntro').textContent = attendance
    ? openAudience ? 'Choose a published MIU or club event with open student attendance.' : 'Choose a published club event to download member attendance.'
    : 'Download a formatted Excel workbook with a period summary, event statistics, detailed reports and review history.';
  $('downloadHelp').textContent = attendance
    ? openAudience ? 'This is a separate verified check-in workbook. Each attendee is labeled Member with their club names, or Non-member. Registration is never counted as attendance.' : 'This workbook contains verified club member check-ins. Open-event attendance is available in its separate download.'
    : 'Download event reports for the selected period, including events without reports. Registration and verified attendance statistics remain separate.';
  $('downloadForm').addEventListener('change', event => {
    if (event.target === $('downloadEvent')) return;
    generation++; $('downloadEvents').replaceChildren();
    activeRequest?.abort();
    $('downloadButton').disabled = $('downloadClub').disabled;
    if (attendance) { $('downloadEvent').replaceChildren(new Option('Select an event', '')); $('downloadEvent').disabled = true; }
  });
  if (attendance) {
    $('downloadEventLabel').hidden = false;
    $('downloadPeriod').add(new Option('All published events', 'all'), 0);
    $('downloadPeriod').value = 'all';
  }
  $('downloadEvent').addEventListener('change', () => {
    for (const card of $('downloadEvents').children) card.hidden = card.dataset.event !== $('downloadEvent').value;
  });
  async function save(path) {
    const response = await fetch('/api/report-downloads' + path, { credentials: 'same-origin' });
    if (!response.ok) { const error = await response.json(); throw new Error(error.message); }
    const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'event-sheet.csv';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('downloadPeriod').addEventListener('change', () => {
    const year = $('downloadPeriod').value === 'year', all = $('downloadPeriod').value === 'all';
    for (const key of ['Start', 'End']) {
      $('download' + key + 'Label').hidden = year || all;
      $('download' + key).disabled = year || all; $('download' + key).required = !year && !all;
    }
    $('downloadYearLabel').hidden = !year; $('downloadYear').disabled = !year; $('downloadYear').required = year;
  });
  if (attendance) $('downloadPeriod').dispatchEvent(new Event('change'));
  $('downloadClub').addEventListener('change', () => {
    // The form's change listener must clear the old event list before the
    // next request begins, otherwise it invalidates that request's revision.
    if (attendance && $('downloadPeriod').value === 'all') Promise.resolve().then(() => loadSelected());
  });
  async function initialize() {
    try {
      const response = await fetch('/api/report-downloads/clubs', { credentials: 'same-origin', siteStartupNonBlocking: true });
      const data = await response.json(); if (!response.ok) throw new Error(data.message);
      if (!data[attendance ? 'attendance' : 'reports']) throw new Error('You do not have access to this download page.');
      if (data.clubs.length > 1) $('downloadClub').add(new Option('All authorized clubs', 'all'));
      for (const club of data.clubs) $('downloadClub').add(new Option(club.name, club.id));
      const enabled = data.clubs.length > 0;
      for (const id of ['downloadClub', 'downloadButton']) $(id).disabled = !enabled;
      $('downloadFeedback').textContent = enabled ? 'Choose the period and download.' : 'No authorized clubs are available.';
      if (enabled && attendance) await loadSelected();
    } catch (error) { $('downloadFeedback').textContent = error.message || 'Could not load download permissions.'; }
  }
  async function loadSelected(event) {
    event?.preventDefault();
    const current = ++generation; $('downloadEvents').replaceChildren();
    const params = new URLSearchParams({ clubId: $('downloadClub').value });
    if (attendance) params.set('audience', audienceValue);
    if (attendance && $('downloadPeriod').value === 'all') params.set('period', 'all');
    else if ($('downloadPeriod').value === 'year') params.set('year', $('downloadYear').value);
    else { params.set('start', $('downloadStart').value); params.set('end', $('downloadEnd').value); }
    $('downloadButton').disabled = true; $('downloadFeedback').textContent = attendance ? 'Loading published events…' : 'Preparing download…';
    try {
      if (!attendance) {
        await save('/reports.xlsx?' + params);
        $('downloadFeedback').textContent = 'Download ready.';
        return;
      }
      const data = await loadEvents(params);
      if (generation !== current) return;
      $('downloadEvent').replaceChildren(new Option(data.events.length ? 'Select an event' : 'No published events', ''));
      $('downloadEvent').disabled = !data.events.length;
      $('downloadFeedback').textContent = data.events.length ? 'Choose a published event from the Event list to download its sheet.' : data.message || 'No events in this period.';
      for (const item of data.events) {
        const card = document.createElement('article'); card.className = 'event-report';
        const eventValue = `${item.clubId}:${item.key}`;
        $('downloadEvent').add(new Option(`${item.title} · ${item.date || 'Date not set'} · ${item.verifiedCount ?? 0} check-ins${item.itemType === 'booth' ? ' · Booth' : ''}${$('downloadClub').value === 'all' ? ' · ' + item.clubName : ''}`, eventValue));
        card.dataset.event = eventValue; card.hidden = true;
        const heading = document.createElement('h2'); heading.textContent = item.title;
        const description = document.createElement('p'); description.textContent = `${item.clubName} · ${item.date}`;
        card.append(heading, description);
        const count = document.createElement('p'); count.textContent = `${item.verifiedCount ?? 0} verified check-ins${item.source === 'attendance' ? ' · From existing attendance records' : ''}`; card.append(count);
        const actions = document.createElement('div'); actions.className = 'report-actions';
        for (const [sheet, title] of (openAudience ? [['verified', 'Download open event attendance']] : [['verified', 'Download attendance sheet'], ['registered', 'Registrations only (not attendance)']])) {
          const button = document.createElement('button'); button.type = 'button'; button.className = sheet === 'verified' ? 'primary-btn' : 'secondary-btn'; button.textContent = title;
          button.addEventListener('click', async () => {
            button.disabled = true;
            const query = new URLSearchParams(params); query.set('clubId', item.clubId); query.set('eventKey', item.key); query.set('sheet', sheet);
            try { await save('/event-sheet.xlsx?' + query); $('downloadFeedback').textContent = `${item.title}: download ready.`; }
            catch (error) { $('downloadFeedback').textContent = error.message; }
            finally { button.disabled = false; }
          });
          actions.append(button);
        }
        card.append(actions); $('downloadEvents').append(card);
      }
      if (data.events.length) {
        const first = data.events[0];
        $('downloadEvent').value = `${first.clubId}:${first.key}`;
        for (const card of $('downloadEvents').children) card.hidden = card.dataset.event !== $('downloadEvent').value;
      }
    } catch (error) { if (generation === current) $('downloadFeedback').textContent = error.message || 'Download failed. Please retry.'; }
    finally { if (generation === current) $('downloadButton').disabled = false; }
  }
  $('downloadForm').addEventListener('submit', loadSelected);
  return initialize();
};
if (document.getElementById('downloadForm')) {
  const tool = document.body.dataset.tool;
  window.mountReportDownloads(document, ['attendance', 'open-attendance'].includes(tool) ? 'attendance' : new URLSearchParams(location.search).get('type') || 'reports', tool === 'open-attendance' ? 'all_students' : undefined);
}
