const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
function registeredRoutes(stack, prefix = '') {
  const routes = [];
  for (const layer of stack || []) {
    if (layer.route) {
      for (const routePath of [layer.route.path].flat()) for (const method of Object.keys(layer.route.methods).sort()) routes.push({ method: method.toUpperCase(), prefix, path: String(routePath) });
    } else if (layer.handle?.stack) routes.push(...registeredRoutes(layer.handle.stack, prefix + String(layer.regexp)));
  }
  return routes.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function inspectProvider(name) {
  return JSON.parse(execFileSync(process.execPath, [__filename, '--child'], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, DATABASE_PROVIDER: name, MONGO_URI: '', NODE_ENV: 'test' }
  }));
}
function verifyRoutes() {
  const providers = ['mongodb', 'sqlserver', 'azuresql'];
  const snapshots = providers.map(inspectProvider), mongo = snapshots[0];
  if (snapshots.some(s => JSON.stringify(mongo.routes) !== JSON.stringify(s.routes))) throw new Error('The providers register different HTTP routes.');
  if (snapshots.some(s => s.connectionState !== 0)) throw new Error('Route audit unexpectedly opened a database connection.');
  return { passed: true, providers, checkedAt: new Date().toISOString(), routeCount: mongo.routes.length,
    scope: 'Actual Express method/path/router registration, without database connections or requests. Does not prove database contents or HTTP response parity.',
    routes: mongo.routes };
}
if (require.main === module && process.argv.includes('--child')) {
  // Prevent both providers from accessing a real database while registering routes.
  console.log = console.warn = console.error = () => {};
  const unavailable = async () => { throw Object.assign(new Error('Offline route audit.'), { code: 'OFFLINE_ROUTE_AUDIT' }); };
  require('../database/runtime').connect = unavailable;
  require('mongoose').connect = unavailable;
  const app = require('../server');
  process.stdout.write(JSON.stringify({ routes: registeredRoutes(app._router?.stack), connectionState: require('../database').connection.readyState }));
} else if (require.main === module) {
  const report = verifyRoutes();
  if (process.argv.includes('--write')) fs.writeFileSync(path.resolve(__dirname, '../docs/database-migration/provider-routes.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, routeCount: report.routeCount, databaseConnections: 0 }));
}
module.exports = { verifyRoutes };
