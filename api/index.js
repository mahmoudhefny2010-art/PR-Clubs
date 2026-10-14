const app = require('../server');
const ensureReady = app.ensureReady;

module.exports = async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/site/public-data-stream') req.publicStreamDeadline = Date.now() + 30000;
  // Public shells/assets do not need MongoDB. Their API requests still wait for
  // full initialization, including authentication and existing migrations.
  const publicShell = ['/', '/admin', '/club-login', '/club-dashboard', '/attendance', '/api/pwa/version'].includes(pathname)
    || /^\/(?:assets|components|push)\//.test(pathname)
    || /^\/(?:pages\/|dashboards\/)?[\w-]+\.html$/.test(pathname)
    || ['/manifest.webmanifest', '/sw.js'].includes(pathname);
  if (!publicShell) await ensureReady();
  return app(req, res);
};
