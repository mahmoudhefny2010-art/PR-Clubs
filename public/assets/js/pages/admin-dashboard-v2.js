(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/>',
    chart: '<path d="M4 3v18h17M8 16v-5m5 5V7m5 9V4"/>',
    clubs: '<path d="m3 10 9-6 9 6M5 10v10h14V10M9 20v-6h6v6M9 3h6"/>',
    clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6m-6 4h6"/>',
    door: '<path d="M4 21h16M6 21V4l12-2v19M14 12h1"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/>',
    code: '<path d="m8 17-5-5 5-5m8 10 5-5-5-5m-2-12-4 24"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8m-10 5h6"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    file: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h8"/>',
    key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-5-5 3-3m-6 0 3-3"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5"/>',
    logout: '<path d="M10 4H4v16h6m4-12 4 4-4 4M8 12h12"/>'
    , home: '<path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/>'
    , crown: '<path d="m3 6 5 4 4-7 4 7 5-4-2 12H5L3 6Zm2 15h14"/>'
    , userCheck: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2m0-10 2 2 4-5"/>'
    , addressBook: '<rect x="5" y="3" width="16" height="18" rx="2"/><path d="M3 7h4m-4 5h4m-4 5h4m3 0a3 3 0 0 1 6 0"/><circle cx="13" cy="10" r="2"/>'
    , megaphone: '<path d="m3 9 18-6v14L3 13V9Zm4 5 2 7h4l-2-6M17 5v10"/>'
    , calendarCheck: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5 3 3 5-5"/>'
    , badgeCheck: '<path d="M9 3h6l2 3 4 1v6l-2 3-1 4-6 1-6-1-1-4-2-3V7l4-1 2-3Zm-1 9 3 3 5-6"/>'
    , ticket: '<path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6Zm12 0v2m0 3v2m0 3v2"/>'
    , sort: '<path d="M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4"/>'
    , form: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h2m4 0h4M7 12h2m4 0h4M7 17h2m4 0h4"/>'
    , messageStar: '<path d="M21 14a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8Z"/><path d="m12 6 1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4L12 6Z"/>'
    , vote: '<path d="m8 3 10 5-5 9-10-5L8 3Zm0 5 1 3 4-1M3 16v5h18v-5h-4"/>'
    , trend: '<path d="M3 3v18h18M6 16l5-5 4 3 6-8m-5 0h5v5"/>'
    , calendarChart: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M7 17v-3m5 3v-5m5 5v-2"/>'
    , badge: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M9 5V3h6v2M6 18a3 3 0 0 1 6 0m3-6h3m-3 4h3"/><circle cx="9" cy="11" r="2"/>'
    , lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>'
    , settings: '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3h3l2 3h3l1-3 3-1 2-3-2-2 1-3-2-3h-3l-2-3H9Z"/><circle cx="12" cy="12" r="3"/>'
    , camera: '<path d="m8 5 2-2h4l2 2h4a2 2 0 0 1 2 2v12H2V7a2 2 0 0 1 2-2h4Z"/><circle cx="12" cy="12" r="4"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
  const categories = { staff: 'Staff & access', website: 'Website & clubs', people: 'People & access', attendance: 'Events & attendance', insights: 'Insights & system' };
  const tools = window.adminDashboardTools;
  const toolGroups = tools.groups || [];
  let selectedGroup = toolGroups.find(group => group.key === new URLSearchParams(location.search).get('group')) || null;
  const activeTool = document.body.dataset.tool;
  const specialized = new Set(['staff', 'supervisors', 'publishing', 'miu-attendance', 'reports', 'attendance', 'open-attendance']);
  const route = id => '/admin/' + id;
  window.miuDashboardGoBack = () => {
    if (!activeTool) return false;
    if (history.length > 1) history.back(); else location.assign('/admin');
    return true;
  };
  let category = new URLSearchParams(location.search).get('category') || 'all';
  if (category !== 'all' && !categories[category]) category = 'all';
  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403
        ? 'Your admin session has expired or access is unavailable. Sign in again to continue.'
        : data.message || 'Could not load this information. Please try again.');
      error.status = response.status;
      error.commitUncertain = data.commitUncertain === true;
      throw error;
    }
    return data;
  }
  const read = url => request(url);
  const invalidate = () => window.adminDashboardData.invalidate();
  let blockedSnapshot = { total: 0, keys: [] }, blockedSeen = new Set(), blockedStorageKey, blockedGeneration = 0, blockedOpened = false;
  const blockedReady = window.adminDashboardData.ready.then(state => {
    blockedStorageKey = 'miu:admin-blocked-seen:' + state.cacheKey;
    try { const saved = JSON.parse(localStorage.getItem(blockedStorageKey) || '[]'); if (Array.isArray(saved)) blockedSeen = new Set(saved.filter(key => typeof key === 'string')); } catch { /* Badges also work without browser storage. */ }
  });
  function paintBlockedBadge() {
    const hasNew = blockedSnapshot.keys.some(key => !blockedSeen.has(key));
    for (const badge of document.querySelectorAll('[data-blocked-badge]')) {
      badge.hidden = blockedSnapshot.total === 0;
      badge.textContent = blockedSnapshot.total > 99 ? '99+' : String(blockedSnapshot.total);
      badge.dataset.badgeState = hasNew ? 'new' : 'pending';
      badge.setAttribute('aria-label', `${blockedSnapshot.total} blocked requests${hasNew ? ', new requests available' : ', viewed and awaiting review'}`);
      badge.title = badge.getAttribute('aria-label');
    }
  }
  async function refreshBlockedBadge() {
    const generation = ++blockedGeneration;
    try {
      await blockedReady;
      const data = await request('/api/admin/workflows/blocked?summary=1', { siteStartupNonBlocking: true });
      if (generation !== blockedGeneration || !Array.isArray(data.keys) || !Number.isSafeInteger(data.total) || data.total < 0) return;
      blockedSnapshot = { total: data.total, keys: data.keys }; paintBlockedBadge();
    } catch { /* Retain the last confirmed count during a connection failure. */ }
  }
  document.addEventListener('miu:blocked-inbox-loaded', async event => {
    if (activeTool !== 'blocked-requests' || !Array.isArray(event.detail?.keys)) return;
    try {
      await blockedReady;
      if (!blockedOpened || event.detail.markSeen) {
        blockedOpened = true;
        blockedSeen = new Set(event.detail.keys.filter(key => typeof key === 'string'));
        try { localStorage.setItem(blockedStorageKey, JSON.stringify([...blockedSeen])); } catch { /* Keep seen state for this page if storage is unavailable. */ }
      }
      blockedSnapshot = { total: event.detail.total, keys: event.detail.keys }; paintBlockedBadge();
      void refreshBlockedBadge();
    } catch { /* Session verification must succeed before storing seen state. */ }
  });
  window.addEventListener('storage', event => {
    if (event.key !== blockedStorageKey) return;
    try { const saved = JSON.parse(event.newValue || '[]'); if (Array.isArray(saved)) { blockedSeen = new Set(saved); paintBlockedBadge(); } } catch { /* Ignore malformed storage updates. */ }
  });
  function feedback(id, message = '', error = false) { $(id).textContent = message; $(id).classList.toggle('is-error', error); }
  function renderTools() {
    const query = $('toolSearch').value.trim().toLowerCase();
    const matchesCategory = tool => category === 'all' || category === tool.category;
    const grouped = !query && !selectedGroup;
    document.body.classList.toggle('v2-tools-compact', !activeTool && !grouped);
    const candidates = grouped
      ? toolGroups.map(group => ({ ...group, matchingTools: group.toolIds.map(id => tools.find(tool => tool.id === id)).filter(matchesCategory) })).filter(group => group.matchingTools.length)
      : tools.filter(tool => matchesCategory(tool) && (query ? `${tool.title} ${tool.description} ${categories[tool.category]}`.toLowerCase().includes(query) : selectedGroup.toolIds.includes(tool.id)));
    const visible = window.adminDashboardLayout?.sortTools(candidates) || candidates;
    $('widgetGrid').innerHTML = visible.map(tool => {
      const href = grouped ? `/admin?group=${tool.key}${category !== 'all' ? '&category=' + category : ''}#managementTools` : route(tool.id);
      const attrs = `href="${href}" data-tool="${tool.id}"${grouped ? ` data-tool-group="${tool.key}"` : ''}`;
      const tag = 'a';
      const hasBlockedBadge = tool.id === 'blocked-requests' || grouped && tool.toolIds.includes('blocked-requests');
      return `<${tag} class="v2-widget ${tool.color}" ${attrs}><span class="v2-widget-top"><span class="v2-widget-icon">${icon(tool.symbol)}</span><span class="v2-widget-arrow">${icon('arrow')}</span></span><h3>${tool.title}${hasBlockedBadge ? '<span class="v2-request-badge" data-blocked-badge hidden></span>' : ''}</h3><p>${tool.description}</p><span class="v2-widget-label">${grouped ? tool.matchingTools.length + ' tools · ' : ''}${categories[category !== 'all' ? category : tool.category]}</span></${tag}>`;
    }).join('');
    $('emptyTools').hidden = visible.length > 0;
    paintBlockedBadge();
    $('toolsHeading').textContent = query ? 'Search results' : selectedGroup?.title || 'Management tools';
    $('toolGroupNavigation').hidden = !selectedGroup && !query;
    $('toolGroupBack').href = '/admin' + (category !== 'all' ? '?category=' + category : '') + '#managementTools';
    $('toolsCount').textContent = grouped ? `${visible.length} groups · ${candidates.reduce((total, group) => total + group.matchingTools.length, 0)} tools · Choose a group.` : `${visible.length} ${visible.length === 1 ? 'tool' : 'tools'} · Choose what you want to manage.`;
    document.querySelectorAll('[data-category]').forEach(button => {
      const active = button.dataset.category === category;
      button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
    });
  }
  const urls = { clubs: '/api/clubs?media=links', applications: '/api/admin/applications', heads: '/api/admin/club-heads',
    homepage: '/api/admin/homepage', archives: '/api/admin/clubs/archived', members: '/api/admin/club-members',
    analytics: '/api/admin/visitor-analytics', 'quiz-points': '/api/admin/quiz-points', data: '/api/admin/system/data-status' };
  let overviewVersion = 0;
  async function overview(force = false) {
    const version = ++overviewVersion;
    $('refreshDashboard').disabled = true; $('dashboardSummary').setAttribute('aria-busy', 'true');
    if (force) invalidate();
    const results = await Promise.allSettled(['clubs', 'applications', 'heads'].map(key => read(urls[key])));
    if (version !== overviewVersion) return;
    const number = (index, id, select = data => data.length) => { $(id).textContent = results[index].status === 'fulfilled' ? select(results[index].value).toLocaleString() : '—'; };
    number(0, 'totalClubs'); number(1, 'totalApplications'); number(2, 'totalHeads');
    number(0, 'openClubs', clubs => clubs.filter(club => club.status === 'open').length);
    const failed = results.find(result => result.status === 'rejected');
    feedback('overviewFeedback', failed ? failed.reason.message : force ? 'Overview updated.' : '', Boolean(failed));
    $('refreshDashboard').disabled = false; $('dashboardSummary').setAttribute('aria-busy', 'false');
  }
  const record = (title, detail, actions = '') => `<article class="v2-record"><div><strong>${escape(title)}</strong><p>${escape(detail)}</p></div>${actions ? `<div class="v2-record-actions">${actions}</div>` : ''}</article>`;
  const list = items => `<div class="v2-record-list">${items.length ? items.join('') : '<p class="v2-panel-note">No records to display.</p>'}</div>`;
  let panelVersion = 0;
  window.miuConfirmAction = message => new Promise(resolve => {
    const host = $('inlineConfirmation');
    host.hidden = false;
    host.innerHTML = `<p>${escape(message)}</p><div><button class="v2-action" type="button" data-decision="yes">Confirm</button><button class="v2-action secondary" type="button" data-decision="no">Cancel</button></div>`;
    host.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    host.querySelector('[data-decision=no]').focus();
    host.onclick = event => { const button = event.target.closest('[data-decision]'); if (!button) return; host.hidden = true; host.onclick = null; resolve(button.dataset.decision === 'yes'); };
  });
  async function showTool(id) {
    const tool = tools.find(item => item.id === id);
    if (!tool) return;
    const version = ++panelVersion;
    $('toolTitle').textContent = tool.title; $('toolEyebrow').textContent = categories[tool.category];
    document.title = `${tool.title} · Admin Dashboard · MIU Clubs`;
    if (specialized.has(id)) return;
    feedback('toolFeedback'); $('toolContent').innerHTML = '<p class="v2-panel-note" role="status">Loading…</p>';
    try {
      const data = urls[id] ? await read(urls[id]) : null;
      if (version !== panelVersion) return;
      if (id === 'custom-roles') {
        await window.MiuCustomRoles.mount($('toolContent'));
      } else if (id === 'workflows') {
        await window.MiuWorkflow.mountAdmin($('toolContent'));
      } else if (id === 'blocked-requests') {
        await window.MiuWorkflow.blockedRequests($('toolContent'));
      } else if (id === 'homepage') {
        $('toolContent').innerHTML = `<form class="v2-form" id="homepageForm"><label>Welcome title<input name="title" maxlength="100" required value="${escape(data.title)}"></label><label>Introduction<textarea name="subtitle" maxlength="240" required>${escape(data.subtitle)}</textarea></label><button class="v2-action" type="submit">Save homepage</button></form>`;
        $('homepageForm').addEventListener('submit', event => saveForm(event, async form => {
          const saved = await request(urls.homepage, { method: 'PUT', body: JSON.stringify({ title: form.elements.title.value.trim(), subtitle: form.elements.subtitle.value.trim() }) });
          return 'Homepage saved.';
        }));
      } else if (id === 'recovery') {
        $('toolContent').innerHTML = '<p class="v2-panel-note">The account owner receives a secure link to choose a new password.</p><form class="v2-form" id="recoveryForm"><label>Account email<input name="email" type="email" autocomplete="email" maxlength="254" required placeholder="name@example.com"></label><button class="v2-action" type="submit">Send reset link</button></form>';
        $('recoveryForm').addEventListener('submit', event => saveForm(event, async form => {
          const result = await request('/api/admin/accounts/password-reset', { method: 'POST', body: JSON.stringify({ email: form.elements.email.value.trim() }) });
          return result.message || 'Password reset link sent.';
        }));
      } else if (id === 'excel-review') {
        window.mountAdminExcelImport({ read, request, escape, invalidate, refresh: () => overview(true) });
      } else if (id === 'clubs') {
        await window.renderAdminClubEditor({ data, request, read, escape, list, record, saveForm });
      } else if (id === 'heads') {
        await window.renderAdminHeadEditor({ data, request, read, escape, list, record, saveForm });
      } else if (id === 'applications') {
        await window.renderAdminDashboardFeature({ id, data, request, read, escape, list, record, saveForm });
      } else if (id === 'archives') {
        $('toolContent').innerHTML = list(data.map(club => record(club.name, club.category || 'Archived club', `<button type="button" data-restore="${escape(club.id)}">Restore club</button>`)));
      } else if (id === 'members') {
        $('toolContent').innerHTML = data.map(club => `<section><h3>${escape(club.name)} <small>(${escape(club.totalCount ?? 0)} members)</small></h3>${list((club.members || []).map(member => record(member.name || member.studentName || member.email, [member.email, member.committee, member.position, member.memberType].filter(Boolean).join(' · '))))}</section>`).join('') || '<p class="v2-panel-note">No clubs to display.</p>';
      } else if (id === 'quiz-points') {
        const number = value => Number(value || 0).toLocaleString();
        const maximum = Math.max(1, ...data.clubs.map(club => club.points));
        $('toolContent').innerHTML = record('Accounts counted', number(data.totalSubmissions))
          + '<p class="v2-panel-note">Each signed-in account contributes once per club. Retaking the quiz or reviewing answers updates that account’s points. Anonymous results are excluded.</p>'
          + (data.totalSubmissions ? '' : '<p class="v2-panel-note" role="status">No signed-in quiz results recorded yet. Club totals will update as signed-in accounts finish the quiz.</p>')
          + '<div class="v2-quiz-points">' + data.clubs.map((club, index) => `<article class="v2-quiz-points-row"><span class="v2-quiz-rank">${index + 1}</span><div><strong>${escape(club.name)}</strong><progress max="${maximum}" value="${club.points}" aria-label="${escape(club.name)} quiz points"></progress></div><strong>${number(club.points)} <small>pts</small></strong></article>`).join('') + '</div>';
      } else if (id === 'analytics') {
        $('toolContent').innerHTML = list([
          record('Unique visitors', data.uniqueVisitors ?? 'Unavailable'), record('Unique IP addresses', data.uniqueIpAddresses ?? 'Unavailable'),
          record('Active visitors', `${data.activeVisitors ?? 0} in the last ${data.activeWindowMinutes ?? 5} minutes`),
          record('Active signed-in accounts', data.activeSignedInAccounts ?? 0), record('Active guests', data.activeGuestVisitors ?? 0)
        ]) + '<h2 class="v2-section-title">Who is online</h2>' + list((data.activePeople || []).map(person => record(person.name || person.email || person.deviceCode || 'Visitor',
          [person.email, person.label, person.deviceCode, person.deviceName, person.browserName, person.ipAddress, person.lastSeenAt ? new Date(person.lastSeenAt).toLocaleString() : ''].filter(Boolean).join(' · '))));
      } else if (id === 'data') {
        const security = await read('/api/admin/security/audit?limit=50').catch(() => null);
        if (version !== panelVersion) return;
        $('toolContent').innerHTML = record('Database', data.database?.connected ? 'Connected' : 'Unavailable')
          + list((data.sections || []).map(section => record(section.title, `${section.count ?? '—'} records · ${section.detail || ''}`)))
          + `<p class="v2-panel-note">Last checked: ${escape(data.checkedAt ? new Date(data.checkedAt).toLocaleString() : 'Unavailable')}</p>`
          + '<h2 class="v2-section-title">Security &amp; sign-in</h2>'
          + record('Google sign-in', security?.googleSignInConfigured ? 'Available. Google manages verification prompts according to your account security settings.' : 'Google sign-in needs to be configured.')
          + '<a class="v2-action secondary" href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener noreferrer">Protect your Google account</a>'
          + '<h2 class="v2-section-title">Recent security activity</h2>'
          + (security ? list(security.logs.map(entry => record(entry.action, [entry.actorEmail, entry.actorRole, entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '', entry.targetId].filter(Boolean).join(' · ')))) : '<p class="v2-panel-note">Security activity is temporarily unavailable. Refresh to try again.</p>');
      } else if (id === 'all-activity-log' || id === 'developer-activity-log') {
        const developerOnly = id === 'developer-activity-log';
        const security = await read(developerOnly ? '/api/admin/security/audit?actorRole=software_development' : '/api/admin/security/audit');
        if (version !== panelVersion) return;
        const logs = (Array.isArray(security.logs) ? security.logs : []).filter(entry => (!developerOnly || String(entry.actorRole || '').toLowerCase() === 'software_development')
          && !/(?:switch-dashboard|\/login(?:\/|$)|\/logout(?:\/|$)|\/session(?:\/|$))/.test(String(entry.action || '')));
        const date = value => {
          const parsed = value ? new Date(value) : null;
          return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Time unavailable';
        };
        const actionName = (value, changes = []) => {
          const match = String(value || '').match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/);
          if (!match) return changes.length ? `Updated ${changes.slice(0, 3).map(change => escape(change.field)).join(', ')}` : 'Earlier change (details unavailable)';
          const route = match[2].toLowerCase();
          if (/\/clubs(?:\/|$)/.test(route)) {
            if (/\/archive(?:\/|$)/.test(route)) return 'Archived a club';
            if (/\/restore(?:\/|$)/.test(route)) return 'Restored a club';
            if (/\/order(?:\/|$)/.test(route)) return 'Changed club display order';
            return match[1] === 'POST' ? 'Added a club' : 'Edited club information';
          }
          const topics = [
            [/club-heads|staff-accounts|supervisors/, 'staff roles and access'], [/applications/, 'an application'],
            [/homepage/, 'the homepage'], [/university-content/, 'university events or announcements'],
            [/club\/content|content-requests/, 'club content'], [/speaker-requests|speaker-invites/, 'speaker request details'],
            [/members/, 'club member details'], [/attendance/, 'event attendance settings'], [/committee-availability/, 'committee availability'],
            [/password-reset|accounts\/password/, 'account access settings']
          ];
          const subject = topics.find(([pattern]) => pattern.test(route))?.[1];
          if (subject) {
            if (match[1] === 'DELETE') return `Removed ${subject}`;
            if (match[1] === 'POST' && /^(?:\/api\/admin\/club-heads|\/api\/admin\/university-content|\/api\/admin\/clubs)$/.test(route)) return `Added ${subject}`;
            return `Edited ${subject}`;
          }
          const fields = changes.slice(0, 3).map(change => String(change.field || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase()).filter(Boolean);
          return fields.length ? `Updated ${fields.join(', ')}` : 'Earlier change (details unavailable)';
        };
        const entries = logs.map(entry => {
          let outcome = '';
          let auditDetails = {};
          try { auditDetails = JSON.parse(entry.details || '{}'); outcome = auditDetails.outcome || ''; } catch {}
          const status = outcome === 'success' ? 'Completed' : outcome === 'denied-or-failed' ? 'Denied or failed' : '';
          const target = entry.targetId ? `Record ${entry.targetId}` : '';
          const detailId = `activity-${logs.indexOf(entry)}`;
          const changes = Array.isArray(auditDetails.changes) ? auditDetails.changes : [];
          const title = actionName(entry.action, changes);
          const changeRows = changes.length ? changes.map(change => `<li><strong>${escape(String(change.field || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase())}</strong>${Object.hasOwn(change, 'value') ? ` <span aria-label="submitted value">→ ${escape(typeof change.value === 'object' ? JSON.stringify(change.value) : change.value)}</span>` : ''}</li>`).join('') : `<li>${Array.isArray(auditDetails.changes) ? 'No editable fields were included in this operation.' : 'Field details were not recorded for this older log entry.'}</li>`;
          const resultText = outcome === 'success' ? 'Saved successfully' : auditDetails.status === 403 ? 'Not saved: this account does not have permission' : auditDetails.status === 401 ? 'Not saved: sign in again and retry' : auditDetails.status >= 500 ? 'Not saved: the server encountered an error' : 'Not saved: check the information and try again';
          const roleLabels = { software_development: 'Software Development', admin: 'Administrator', president: 'Club President', vice_president: 'Vice President', head: 'Committee Head', supervisor: 'Supervisor', student: 'Student', dean: 'Dean', miu_events: 'MIU Events', pr: 'PR', english: 'English Department', security: 'Security Office', sso: 'SSO' };
          const roleLabel = roleLabels[String(entry.actorRole || '').toLowerCase()] || String(entry.actorRole || 'Staff').replace(/[_-]+/g, ' ');
          return `<article class="v2-activity-entry"><span class="v2-activity-icon" aria-hidden="true">${icon(developerOnly ? 'code' : 'history')}</span><div class="v2-activity-main"><div class="v2-activity-heading"><strong>${escape(title)}</strong><time datetime="${escape(entry.timestamp || '')}">${escape(date(entry.timestamp))}</time></div><p><button type="button" class="v2-activity-actor" aria-expanded="false" aria-controls="${detailId}" data-activity-toggle="${detailId}">${escape(entry.actorEmail || 'Unknown account')}</button><span class="v2-activity-role">${escape(roleLabel)}</span>${target ? `<span>${escape(target)}</span>` : ''}<span class="v2-activity-status ${outcome === 'success' ? 'is-success' : 'is-error'}">${escape(resultText)}</span></p><div class="v2-activity-detail" id="${detailId}" hidden><p><strong>Activity:</strong> ${escape(title)}</p><p><strong>Result:</strong> ${escape(resultText)}</p><p><strong>What was changed:</strong></p><ul>${changeRows}</ul></div></div></article>`;
        });
        const heading = developerOnly ? 'Developer Activity Log' : 'All Activity Log';
        const description = developerOnly ? 'Changes made by Software Development accounts.' : 'All recorded changes across website accounts and roles.';
        $('toolContent').innerHTML = `<section class="v2-activity-card" aria-label="${heading}"><div class="v2-activity-card-heading"><div><h2>${heading}</h2><p>${description}</p></div><span class="v2-activity-count">${logs.length} ${logs.length === 1 ? 'change' : 'changes'}</span></div>${entries.length ? `<div class="v2-activity-list">${entries.join('')}</div>` : '<p class="v2-panel-note">No recorded changes are available yet.</p>'}<p class="v2-activity-note">All available recorded changes are shown. Private fields are excluded.</p></section>`;
      } else {
        await window.renderAdminDashboardFeature({ id, data, request, read, escape, list, record, saveForm });
      }
    } catch (error) {
      if (version !== panelVersion) return;
      $('toolContent').innerHTML = '<button type="button" class="v2-action secondary" id="retryTool">Try again</button>';
      feedback('toolFeedback', error.message, true);
      $('retryTool').addEventListener('click', () => showTool(id));
    }
  }
  async function saveForm(event, save) {
    event.preventDefault(); const form = event.currentTarget;
    const submittedVersion = form.dataset.v2EditVersion || '0';
    const version = panelVersion; const button = form.querySelector('[type="submit"]');
    button.disabled = true; feedback('toolFeedback', 'Saving…');
    try { const message = await save(form); if ((form.dataset.v2EditVersion || '0') === submittedVersion) form.dataset.miuDirty = 'false'; if (version === panelVersion) feedback('toolFeedback', message); }
    catch (error) { if (version === panelVersion) feedback('toolFeedback', error.message, true); }
    finally { button.disabled = false; }
  }
  $('toolContent').addEventListener('click', async event => {
    const activityToggle = event.target.closest('[data-activity-toggle]');
    if (activityToggle) {
      const panel = $(activityToggle.dataset.activityToggle);
      if (panel) { panel.hidden = !panel.hidden; activityToggle.setAttribute('aria-expanded', String(!panel.hidden)); }
      return;
    }
    const button = event.target.closest('[data-application], [data-restore]');
    if (!button || button.disabled) return;
    const restore = button.hasAttribute('data-restore');
    const action = restore ? 'Restore this club to the website?' : `Change this application to ${button.dataset.status}?`;
    if (!await window.miuConfirmAction(action)) return;
    const version = panelVersion;
    const actions = [...button.parentElement.querySelectorAll('button')]; actions.forEach(item => { item.disabled = true; });
    try {
      await request(restore ? `/api/admin/clubs/${encodeURIComponent(button.dataset.restore)}/restore` : `/api/admin/applications/${encodeURIComponent(button.dataset.application)}/status`, {
        method: restore ? 'POST' : 'PATCH', body: JSON.stringify(restore ? {} : { status: button.dataset.status })
      });
      invalidate();
      if (version === panelVersion) { await showTool(restore ? 'archives' : 'applications'); feedback('toolFeedback', restore ? 'Club restored.' : 'Application updated.'); }
    } catch (error) { if (version === panelVersion) feedback('toolFeedback', error.message, true); }
    finally { actions.forEach(item => { item.disabled = false; }); }
  });
  document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
  for (const name of ['input', 'change']) $('toolContent').addEventListener(name, event => {
    const form = event.target.form;
    if (form) form.dataset.v2EditVersion = String(Number(form.dataset.v2EditVersion || 0) + 1);
  }, true);
  document.querySelectorAll('.v2-quick-nav a, .v2-blocked-link').forEach(anchor => {
    if (new URL(anchor.href).pathname === location.pathname) anchor.setAttribute('aria-current', 'page');
  });
  document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    category = button.dataset.category;
    if (activeTool) { location.assign('/admin?category=' + category); return; }
    selectedGroup = null;
    const url = new URL(location.href); url.searchParams.set('category', category); url.searchParams.delete('group'); history.replaceState(history.state, '', url);
    renderTools();
  }));
  $('toolSearch').addEventListener('input', renderTools);
  document.addEventListener('miu:admin-layout-ready', renderTools);
  $('toolSearch').value = new URLSearchParams(location.search).get('q') || '';
  $('adminNavSearch').value = $('toolSearch').value;
  $('refreshDashboard').addEventListener('click', () => overview(true));
  $('dashboardDate').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const dirty = () => $('toolContent').dataset.v2Saving === 'true'
    || Boolean(document.querySelector('#toolContent form[data-miu-dirty="true"]'))
    || Boolean($('miuAttendanceQr') && !$('miuAttendanceQr').classList.contains('hidden'))
    || Boolean(activeTool === 'excel-review' && ($('excelReviewFile')?.files?.length || $('excelImportConfirm')?.disabled));
  async function refreshData(manual = false) {
    if (dirty()) {
      if (!manual) { $('pendingUpdates').hidden = false; return; }
      if (!await window.miuConfirmAction('Load updated data? Your unsaved changes on this page will be discarded.')) return false;
    }
    $('pendingUpdates').hidden = true;
    if (manual) invalidate();
    if (specialized.has(activeTool)) { location.reload(); return true; }
    if (activeTool) await showTool(activeTool); else await overview();
    return true;
  }
  window.miuRefreshPage = () => refreshData(true);
  $('adminNavRefresh').addEventListener('click', () => window.siteStartup?.track(refreshData(true)));
  $('adminNavSignout').addEventListener('click', async () => {
    $('adminNavSignout').disabled = true;
    try {
      await request('/api/admin/logout', { method: 'POST' });
      for (const key of Object.keys(sessionStorage)) if (key.startsWith('miu:admin-dashboard:')) sessionStorage.removeItem(key);
      location.assign('/admin/login');
    } catch (error) { feedback(activeTool ? 'toolFeedback' : 'overviewFeedback', error.message, true); $('adminNavSignout').disabled = false; }
  });
  $('refreshTool').addEventListener('click', () => refreshData(true));
  $('applyUpdates').addEventListener('click', () => refreshData(true));
  window.adminDashboardData.watch(({ keys, local }) => {
    if (local || keys?.includes('blocked-requests')) void refreshBlockedBadge();
    if (local) return;
    if (activeTool && !keys.includes(activeTool) && !(keys.includes('reports') && specialized.has(activeTool))) return;
    if (!activeTool && !keys.some(key => ['clubs', 'applications', 'heads'].includes(key))) return;
    void refreshData();
  });
  window.addEventListener('online', () => { if (!activeTool || !specialized.has(activeTool)) void refreshData(); });
  renderTools();
  void refreshBlockedBadge();
  window.addEventListener('online', refreshBlockedBadge);
  window.addEventListener('focus', () => void refreshBlockedBadge());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refreshBlockedBadge(); });
  const initial = activeTool ? showTool(activeTool) : overview();
  async function loadIdentity() {
    const results = await Promise.allSettled([
      request('/api/site/account-session', { siteStartupNonBlocking: true }), request('/api/site/account-photo', { siteStartupNonBlocking: true })
    ]);
    const account = results[0].status === 'fulfilled' ? results[0].value : null;
    const photo = results[1].status === 'fulfilled' ? results[1].value : null;
    const initial = (account?.name || account?.email || 'Administrator').slice(0, 1).toUpperCase();
    $('accountInitial').textContent = initial;
    if (photo?.url && /^(https?:\/\/|\/(?!\/)|data:image\/)/i.test(photo.url)) {
      const image = document.createElement('img'); image.src = photo.url; image.alt = '';
      image.addEventListener('error', () => { $('accountInitial').textContent = initial; }, { once: true });
      $('accountInitial').replaceChildren(image);
    }
  }
  window.addEventListener('miu:account-session-changed', loadIdentity);
  window.siteStartup?.afterStartup(loadIdentity);
  window.siteStartup?.track(initial);
  if (!activeTool) window.siteStartup?.afterStartup(() => Promise.allSettled([
    urls.homepage, urls.archives, urls.members
  ].map(url => read(url))));
})();
