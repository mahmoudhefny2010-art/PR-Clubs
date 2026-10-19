const path = require('node:path');
const P = require('./workflow-policy');
const { customDashboardUrl, isCustomRole } = require('./staff-role-keys');
function registerCustomStaffRoleRoutes(app, { service, engine, actorFor, ready, sameOrigin, requireAdmin, root }) {
  const safe = handler => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (!await ready()) return res.status(503).json({ message: 'Role storage is temporarily unavailable.' });
      const actor = await actorFor(req, res);
      if (!actor) return res.status(401).json({ message: 'Sign in with your assigned MIU staff account.' });
      if (req.method !== 'GET' && !sameOrigin(req)) P.fail(403, 'Reload and try again.');
      await handler(req, res, actor);
    } catch (error) {
      if (!error.status) console.error('Custom staff role operation failed:', error.name);
      res.status(error.status || 503).json({ message: error.status ? error.message : 'Role changes could not be confirmed. Reload before retrying.' });
    }
  };
  const admin = fn => safe(async (req, res, actor) => { if (!actor.admin) P.fail(403, 'Administrator access required.'); await fn(req, res, actor); });
  app.get('/api/admin/custom-roles', requireAdmin, admin(async (req, res) => res.json(await service.list())));
  app.post('/api/admin/custom-roles', requireAdmin, admin(async (req, res, actor) => res.status(201).json(await service.save(null, req.body, actor))));
  app.put('/api/admin/custom-roles/:key', requireAdmin, admin(async (req, res, actor) => res.json(await service.save(req.params.key, req.body, actor))));
  function assigned(actor, key) {
    if (!isCustomRole(key)) P.fail(404, 'Dashboard not found.');
    const role = actor.customRoles?.find(role => role.key === key && role.enabled);
    if (!role || !P.assignments(actor).some(item => item.role === key)) P.fail(403, 'This dashboard is not assigned to your account.');
    if (actor.role !== key) P.fail(403, 'Choose this role from My dashboards before opening its dashboard.');
    return role;
  }
  app.get('/dashboards/custom-role.html', safe(async (req, res, actor) => {
    assigned(actor, req.query.role); res.sendFile(path.join(root, 'public/dashboards/custom-role.html'));
  }));
  app.get('/api/custom-dashboard/:key', safe(async (req, res, actor) => {
    const role = assigned(actor, req.params.key);
    res.json({ key: role.key, name: role.name, description: role.description, modules: role.modules, permissions: role.permissions,
      types: role.requestTypes, scope: role.scope, dashboardUrl: customDashboardUrl(role.key), email: actor.email });
  }));
}
module.exports = { registerCustomStaffRoleRoutes };
