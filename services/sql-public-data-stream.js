const { readPublicRevision, changedPublicKeys } = require('../database/public-revisions');

async function serveSqlPublicDataStream(req, res, { runtime = require('../database/runtime'), duration = 25000, checkInterval = 3000 } = {}) {
  const decode = value => {
    try {
      if (typeof value !== 'string' || value.length > 512 || !value.startsWith('sql:')) return null;
      const revision = JSON.parse(Buffer.from(value.slice(4), 'base64url').toString());
      if (!revision || !/^[a-f0-9-]{36}$/i.test(revision.epoch) || !/^\d+$/.test(revision.clubs) || !/^\d+$/.test(revision.universityContent)) return null;
      return revision;
    } catch { return null; }
  };
  let previous = decode(req.get('Last-Event-ID') || req.query.since);
  let current;
  try { current = await readPublicRevision(runtime); }
  catch { return res.status(503).json({ message: 'SQL live updates require the public notification migration.' }); }
  if (res.destroyed || res.writableEnded) return;
  let stopped = false, timer, deadline;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer); clearTimeout(deadline); res.end();
  };
  res.on('close', stop);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 1500\n\n');
  const emit = revision => {
    const keys = changedPublicKeys(previous, revision);
    const token = 'sql:' + Buffer.from(JSON.stringify(revision)).toString('base64url');
    res.write(`id: ${token}\nevent: ${keys.length ? 'invalidate' : 'ready'}\ndata: ${JSON.stringify({ keys })}\n\n`);
    previous = revision;
  };
  emit(current);
  // SQL/Azure expose a committed revision row, not MongoDB's watch cursor.
  // Only metadata is checked here; browsers never poll or redownload lists.
  const check = async () => {
    if (stopped) return;
    try {
      current = await readPublicRevision(runtime);
      if (stopped) return;
      if (changedPublicKeys(previous, current).length) emit(current);
      else res.write(': keepalive\n\n');
    } catch { stop(); return; }
    timer = setTimeout(check, checkInterval);
  };
  const remaining = req.publicStreamDeadline ? Math.max(1000, req.publicStreamDeadline - Date.now()) : duration;
  deadline = setTimeout(stop, Math.min(duration, remaining));
  timer = setTimeout(check, checkInterval);
}

module.exports = { serveSqlPublicDataStream };
