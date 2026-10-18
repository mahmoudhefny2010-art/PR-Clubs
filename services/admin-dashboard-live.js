const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { toolIds } = require('./admin-dashboard-pages');
const dependencies = {
  committees: ['Club', 'ClubAccount'], 'club-order': ['Club'], 'application-forms': ['Club'],
  'club-feedback': ['StudentFeedback', 'Club'], 'university-feedback': ['StudentFeedback', 'UniversityContent'],
  'club-analytics': ['Club', 'Application', 'SiteSetting', 'LocalClubViews'], 'event-analytics': ['Club', 'EventRegistration', 'StudentInterest', 'AttendanceRecord', 'SiteSetting', 'LocalEventViews'],
  'account-passwords': ['ClubAccount'], 'admin-settings': ['AdminAuthState'],
  'website-content': ['Club', 'UniversityContent'], profile: ['AccountPhoto', 'AdminAuthState', 'ClubAccount'],
  clubs: ['Club'], archives: ['Club'], 'excel-review': ['Club', 'ClubAccount'], homepage: ['SiteSetting'], applications: ['Application', 'Club'],
  heads: ['ClubAccount', 'Club'], members: ['Club', 'Application'], staff: ['ClubAccount', 'Club', 'AdminAuthState'],
  supervisors: ['ClubAccount', 'Club'], publishing: ['UniversityContent'],
  'miu-attendance': ['UniversityContent', 'AttendanceSession', 'AttendanceAssignment', 'AttendanceActivityClosure'],
  reports: ['EventReport', 'Club', 'ContentRequest', 'UniversityContent', 'AttendanceRecord', 'AttendanceSession', 'EventRegistration'], attendance: ['AttendanceRecord', 'Club', 'ContentRequest'],
  'open-attendance': ['AttendanceRecord', 'Club', 'ContentRequest'], analytics: ['SiteVisitor', 'SiteVisitorPresence', 'SiteNetwork'],
  recovery: ['StudentAccount', 'ClubAccount', 'AdminAuthState']
};
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function revisionsFromModels(versions) {
  return Object.fromEntries(toolIds.map(tool => [tool, digest((dependencies[tool] || Object.keys(versions)).map(name => `${name}:${versions[name] || ''}`).join('|'))]));
}
function changedTools(previous, current) { return toolIds.filter(tool => previous?.[tool] !== current[tool]); }
function createRevisionReader({ database, models = require('../database/catalog').catalog(), runtime = require('../database/runtime'), localRevisions = async () => ({}) }) {
  let cached, savedAt = 0, pending;
  return async function readRevisions() {
    if (cached && Date.now() - savedAt < 1000) return cached;
    if (pending) return pending;
    pending = (async () => {
      const versions = {};
      if (database.isSqlProvider) {
        // Hash only IDs and optimistic versions, never download saved payloads.
        const query = models.map(spec => `SELECT N'${spec.name}' AS model, CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', COALESCE(STRING_AGG(CONVERT(NVARCHAR(MAX), [_id]) + N':' + CONVERT(NVARCHAR(30), [_version]), N'|') WITHIN GROUP (ORDER BY [_id]), N'')), 2) AS revision FROM ${spec.table}`).join(' UNION ALL ');
        const result = await runtime.request().query(query);
        for (const row of result.recordset) versions[row.model] = row.revision;
      } else {
        await Promise.all(models.map(async spec => {
          const rows = await spec.model.find().select('_id updatedAt').lean();
          versions[spec.name] = digest(rows.map(row => `${row._id}:${row.updatedAt || ''}`).sort().join('|'));
        }));
      }
      Object.assign(versions, await localRevisions());
      cached = revisionsFromModels(versions); savedAt = Date.now(); return cached;
    })().finally(() => { pending = null; });
    return pending;
  };
}
function registerAdminDashboardLive(app, { database, requireAdmin, sessionSecret, ready }) {
  const models = require('../database/catalog').catalog();
  const directory = process.env.LOCAL_DATA_DIRECTORY ? path.resolve(process.env.LOCAL_DATA_DIRECTORY) : path.resolve(__dirname, '../data');
  const localRevisions = async () => Object.fromEntries(await Promise.all([
    ['LocalClubViews', 'club-views.json'], ['LocalEventViews', 'event-views.json']
  ].map(async ([key, file]) => {
    const stat = await fs.promises.stat(path.join(directory, file)).catch(() => null);
    return [key, stat ? `${stat.mtimeMs}:${stat.size}` : 'missing'];
  })));
  const readRevisions = createRevisionReader({ database, models, localRevisions });
  const identity = req => crypto.createHmac('sha256', sessionSecret).update(String(req.headers.cookie || '').split(';')
    .map(value => value.trim()).filter(value => /^(miu_admin|miu_club)=/.test(value)).sort().join(';')).digest('hex');
  app.get('/api/admin/dashboard-state', requireAdmin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!ready()) return res.status(503).json({ message: 'Dashboard data is temporarily unavailable.' });
    try { res.json({ cacheKey: identity(req), revisions: await readRevisions() }); }
    catch { res.status(503).json({ message: 'Dashboard updates are temporarily unavailable. Try again.' }); }
  });
  app.get('/api/admin/dashboard-stream', requireAdmin, async (req, res) => {
    let previous;
    try {
      const encoded = req.get('Last-Event-ID') || req.query.since;
      if (typeof encoded === 'string' && encoded.length < 8192) previous = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    } catch { /* A fresh stream sends its full current state. */ }
    let stopped = false, timer, deadline, watcher, localWatcher, localTimer;
    const stop = () => { if (stopped) return; stopped = true; clearTimeout(timer); clearTimeout(deadline); clearTimeout(localTimer); localWatcher?.close(); void watcher?.close().catch(() => {}); res.end(); };
    res.on('close', stop);
    try {
      if (!ready()) throw new Error('Database unavailable');
      const initial = await readRevisions();
      if (res.destroyed) return;
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
      res.flushHeaders(); res.write('retry: 2000\n\n');
      const emit = current => {
        const keys = changedTools(previous, current);
        const token = Buffer.from(JSON.stringify(current)).toString('base64url');
        res.write(`id: ${token}\nevent: ${keys.length ? 'invalidate' : 'ready'}\ndata: ${JSON.stringify({ keys, revisions: current })}\n\n`);
        previous = current;
      };
      emit(initial);
      deadline = setTimeout(stop, Math.min(25000, req.publicStreamDeadline ? Math.max(1000, req.publicStreamDeadline - Date.now()) : 25000));
      if (database.isSqlProvider) {
        const check = async () => {
          if (stopped) return;
          try { const current = await readRevisions(); if (stopped) return; if (changedTools(previous, current).length) emit(current); else res.write(': keepalive\n\n'); }
          catch { stop(); return; }
          timer = setTimeout(check, 3000);
        };
        timer = setTimeout(check, 3000);
      } else {
        try {
          localWatcher = fs.watch(directory, (event, filename) => {
            if (!['club-views.json', 'event-views.json'].includes(String(filename))) return;
            clearTimeout(localTimer);
            localTimer = setTimeout(async () => {
              try { const current = await readRevisions(); if (!stopped && changedTools(previous, current).length) emit(current); } catch { /* Keep the existing stream on a file notification failure. */ }
            }, 1100);
          });
          localWatcher.on('error', () => { localWatcher?.close(); localWatcher = null; });
        } catch { /* Database updates still stream if file watching is unavailable. */ }
        watcher = database.connection.db.watch([{ $match: { 'ns.coll': { $in: models.map(spec => spec.model.collection.name) }, operationType: { $in: ['insert', 'update', 'replace', 'delete'] } } }], { maxAwaitTimeMS: 8000 });
        while (!stopped) {
          const change = await watcher.tryNext();
          if (stopped) break;
          if (change) {
            // Reading after a short coalescing window combines rapid related writes.
            await new Promise(resolve => setTimeout(resolve, 1050));
            if (!stopped) emit(await readRevisions());
          } else res.write(': keepalive\n\n');
        }
      }
    } catch {
      if (!res.headersSent) res.status(503).json({ message: 'Dashboard updates are temporarily unavailable.' });
      stop();
    }
  });
}
module.exports = { dependencies, revisionsFromModels, changedTools, createRevisionReader, registerAdminDashboardLive };
