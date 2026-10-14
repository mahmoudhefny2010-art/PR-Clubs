// MongoDB change streams notify visitors without repeatedly reading public lists.
const { EJSON, Binary } = require('mongoose').mongo.BSON;

function registerPublicDataStream(app, { database, ready, collections, duration = 25000 }) {
  app.get('/api/site/public-data-stream', async (req, res) => {
    if (!ready()) {
      return res.status(503).json({ message: 'Live public updates are unavailable.' });
    }
    if (database.isSqlProvider) return require('./sql-public-data-stream').serveSqlPublicDataStream(req, res, { duration });
    if (!database.connection.db?.watch) return res.status(503).json({ message: 'Live public updates are unavailable.' });
    const decode = value => {
      try {
        if (typeof value !== 'string' || value.length > 4096) return null;
        const token = EJSON.parse(Buffer.from(value, 'base64url').toString());
        if (!token || typeof token._data !== 'string' || !/^[a-f0-9]+$/i.test(token._data)) return null;
        if (Object.keys(token).some(key => !['_data', '_typeBits'].includes(key))) return null;
        if (token._typeBits !== undefined && !(token._typeBits instanceof Binary)) return null;
        return token;
      } catch { return null; }
    };
    const resume = decode(req.get('Last-Event-ID') || req.query.since);
    const pipeline = [{ $match: {
      'ns.coll': { $in: Object.keys(collections) },
      operationType: { $in: ['insert', 'update', 'replace', 'delete', 'drop', 'rename', 'invalidate'] }
    } }];
    let stream, stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(deadline);
      void stream?.close().catch(() => {});
      res.end();
    };
    // Leave room for cold-start database initialization inside Vercel's limit.
    const remaining = req.publicStreamDeadline ? Math.max(1000, req.publicStreamDeadline - Date.now()) : duration;
    const deadline = setTimeout(stop, Math.min(duration, remaining));
    res.on('close', stop);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 1500\n\n');
    const emit = (event, keys, token) => {
      if (stopped) return;
      if (token) res.write(`id: ${Buffer.from(EJSON.stringify(token)).toString('base64url')}\n`);
      res.write(`event: ${event}\ndata: ${JSON.stringify({ keys })}\n\n`);
    };
    const open = token => database.connection.db.watch(pipeline, {
      maxAwaitTimeMS: 8000, ...(token ? { resumeAfter: token } : {})
    });
    try {
      stream = open(resume);
      let reset = !resume;
      let initial = true;
      let lastHeartbeat = Date.now();
      while (!stopped) {
        let change;
        try { change = await stream.tryNext(); }
        catch (error) {
          // A cache older than the oplog must fetch a fresh snapshot once.
          if (initial && resume && [260, 280, 286].includes(error.code)) {
            await stream.close();
            stream = open(null);
            reset = true;
            continue;
          }
          throw error;
        }
        if (stopped) break;
        if (reset) { emit('invalidate', ['clubs', 'universityContent'], stream.resumeToken); reset = false; }
        if (change) emit('invalidate', collections[change.ns?.coll] || ['clubs', 'universityContent'], change._id);
        // Post-batch tokens let an idle visitor resume without missing changes.
        else if (initial) emit('ready', [], stream.resumeToken);
        else if (Date.now() - lastHeartbeat >= 10000) {
          res.write(': keepalive\n\n');
          lastHeartbeat = Date.now();
        }
        initial = false;
      }
    } catch {
      // EventSource reconnects; existing saved data stays on screen.
    } finally { stop(); }
  });
}

module.exports = { registerPublicDataStream };
