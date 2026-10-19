const fs = require('node:fs');
const path = require('node:path');
const toolIds = require('../public/assets/js/admin-dashboard-tools').map(tool => tool.id);
// Reuse trusted repository templates; never fetch HTML or execute user-supplied markup.
function element(source, tag, id) {
  const start = source.search(new RegExp(`<${tag}\\b[^>]*\\bid="${id}"[^>]*>`));
  if (start < 0) throw new Error(`Missing dashboard template: ${id}`);
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g'); tags.lastIndex = start;
  let depth = 0, match;
  while ((match = tags.exec(source))) {
    depth += match[1] ? -1 : 1;
    if (!depth) return source.slice(start, tags.lastIndex);
  }
  throw new Error('Unclosed dashboard template element');
}
function renderDashboardPage(root, tool = '') {
  let html = fs.readFileSync(path.join(root, 'private/admin-dashboard-v2.html'), 'utf8');
  const source = relative => fs.readFileSync(path.join(root, 'public', relative), 'utf8');
  const assets = [], scripts = [];
  let content = '';
  if (tool === 'clubs') scripts.push('cloudinary-upload');
  if (tool === 'excel-review') scripts.push('cloudinary-upload', 'pages/admin-excel-import');
  if (tool === 'profile') scripts.push('cloudinary-upload');
  if (['workflows', 'blocked-requests'].includes(tool)) { scripts.push('workflow-ui'); assets.push('workflow'); }
  if (tool === 'custom-roles') { scripts.push('custom-role-admin'); assets.push('workflow'); }
  const main = relative => source(relative).match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)[1];
  if (['staff', 'supervisors'].includes(tool)) {
    content = '<div class="supervisor-main supervisor-management v2-management-content">' + main(`dashboards/${tool === 'staff' ? 'staff' : 'supervisor'}-management.html`)
      .replace(/<a\b[^>]*href="\/admin"[^>]*>[^<]*<\/a>/g, '')
      .replaceAll('/dashboards/staff-management.html', '/admin/staff') + '</div>';
    assets.push('supervisor-dashboard', 'supervisor-management');
    scripts.push(tool === 'staff' ? 'staff-management' : 'supervisor-management');
  } else if (tool === 'publishing') {
    content = '<div class="miu-events-dashboard-page v2-publishing-content"><span id="miuEventsCount" hidden></span>' + element(source('dashboards/miu-events-dashboard.html'), 'section', 'miuEventsPanel').replace(' hidden', '') + '</div>';
    assets.push('event-reports', 'miu-events-dashboard'); scripts.push('cloudinary-upload', 'miu-events-dashboard');
  } else if (tool === 'secure-attendance') {
    content = '<div class="reverse-attendance-page" data-reverse-attendance="scanner">' + main('pages/attendance-scanner.html') + '</div>';
    assets.push('reverse-attendance'); scripts.push('reverse-attendance');
  } else if (tool === 'miu-attendance') {
    content = main('pages/miu-attendance.html').replace(/<a\b[^>]*data-history-back[^>]*>[\s\S]*?<\/a>/, '');
    assets.push('event-reports'); scripts.push('pages/miu-attendance');
  } else if (['reports', 'attendance', 'open-attendance'].includes(tool)) {
    content = '<div class="event-reports v2-report-content">' + main('pages/report-downloads.html') + '</div>'; assets.push('event-reports');
    scripts.push('pages/report-downloads');
  }
  html = html.replace('data-tool=""', `data-tool="${tool}"`)
    .replace('<!-- TOOL_CONTENT -->', content)
    .replace('<!-- TOOL_STYLES -->', assets.map(name => `<link rel="stylesheet" href="/assets/css/pages/${name}.css${name === 'miu-events-dashboard' ? '?v=20261019miusync1' : name === 'workflow' ? '?v=20261019blockedBadge1' : ''}">`).join('\n'))
    .replace('<!-- TOOL_SCRIPTS -->', scripts.map(name => `<script src="/assets/js/${name}.js?v=${name === 'pages/admin-excel-import' ? '20261019excelRowLog1' : name === 'workflow-ui' ? '20261019requiredRevisionFields1' : name === 'miu-events-dashboard' ? '20261019miusync1' : ['custom-role-admin', 'staff-management'].includes(name) ? '20261018customRoles1' : '20261017clubimport2'}" defer></script>`).join('\n'));
  if (tool) html = html.replace('id="overviewPage"', 'id="overviewPage" hidden').replace('id="toolPage" hidden', 'id="toolPage"');
  return html;
}
function registerAdminDashboardPages(app, { root, requireAdmin, Club }) {
  app.get('/admin/login', (req, res) => {
    res.set('Cache-Control', 'no-store').sendFile(path.join(root, 'public/pages/admin-login.html'));
  });
  // Bookmarks lead to the one dashboard; retired templates are never served.
  app.get(['/admin/club-accounts', '/admin/club-credentials', '/admin/dashboard-v2/club-accounts'], (req, res) => {
    res.set('Cache-Control', 'no-store').redirect(303, '/admin');
  });
  app.get('/admin/dashboard-v2/:tool?', (req, res) => {
    const tool = req.params.tool || '';
    if (tool && !toolIds.includes(tool)) return res.sendStatus(404);
    const search = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.set('Cache-Control', 'no-store').redirect(308, '/admin' + (tool ? '/' + tool : '') + search);
  });
  app.get('/admin/global', (req, res) => res.set('Cache-Control', 'no-store').redirect(308, '/admin'));
  if (Club) app.get('/api/admin/dashboard-content-clubs', requireAdmin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await Club.find({ archivedAt: null }).select('id name image events posts sponsors booths -_id').lean()); }
    catch { res.status(503).json({ message: 'Published club content is temporarily unavailable.' }); }
  });
  if (Club) app.get('/api/admin/dashboard-clubs/:id', requireAdmin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Choose a valid club.' });
    try {
      const club = await Club.findOne({ id }).select('id name committee category tagline status imageFit pinned seats members applicants description requirements applicationIntro applicationFields').lean();
      if (!club) return res.status(404).json({ message: 'Club not found.' });
      res.json(club);
    } catch { res.status(503).json({ message: 'Club details are temporarily unavailable.' }); }
  });
  for (const tool of ['', ...toolIds]) app.get(`/admin${tool ? '/' + tool : ''}`, requireAdmin, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderDashboardPage(root, tool));
  });
}
module.exports = { toolIds, element, renderDashboardPage, registerAdminDashboardPages };
