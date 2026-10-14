// Isolated verification server. Caller must supply a restored Mongo or SQL profile.
require('dotenv').config();
if (process.env.DATABASE_PROVIDER === 'mongodb') {
  // This Windows verification host cannot reliably reach Atlas over IPv6.
  // Keep the connectivity workaround confined to the isolated test server.
  const mongoose = require('mongoose');
  const connect = mongoose.connect.bind(mongoose);
  mongoose.connect = (uri, options = {}) => connect(uri, { ...options, family: 4, serverSelectionTimeoutMS: 30000, connectTimeoutMS: 10000 });
}
let reason = 'pending';
const originalError = console.error;
console.error = (...args) => {
  const message = String(args[0]);
  if (message.startsWith('MongoDB unavailable') || message.startsWith('SQL Server unavailable')) reason = String(args[1] || 'database failure');
  if (message.startsWith('MongoDB connection details')) {
    const detail = String(args[1] || '');
    if (/not authorized|requires authentication/i.test(detail)) reason = 'Mongo permissions';
    else if (/authentication failed|bad auth/i.test(detail)) reason = 'Mongo authentication';
    else if (/duplicate key/i.test(detail)) reason = 'Mongo duplicate key';
  }
  originalError(...args);
};
const app = require('../server');
let server;
async function stop() {
  if (server) await new Promise(resolve => server.close(resolve));
  await require('../database').disconnect().catch(() => {});
  process.exit(0);
}
process.on('message', message => { if (message?.type === 'stop') void stop(); });
process.on('disconnect', () => void stop());
(async () => {
  if (!await app.ensureReady()) throw new Error('Staging database did not become ready.');
  server = app.listen(0, '127.0.0.1', () => process.send?.({ type: 'ready', port: server.address().port }));
})().catch(() => { process.send?.({ type: 'failed', reason }); process.exit(1); });
