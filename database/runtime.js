const { AsyncLocalStorage } = require('node:async_hooks');
const { sqlConfig, sqlPrefix } = require('./config');
const context = new AsyncLocalStorage();
let pool, connecting, sql, readinessValidated = false;
const connection = { readyState: 0 };
async function verifyReadiness(candidate) {
  const ready = await candidate.request().query("SELECT [version], [validatedAt] FROM [dbo].[PlatformDatabaseState] WHERE [id] = 1;");
  if (ready.recordset[0]?.version !== 1 || !ready.recordset[0]?.validatedAt) throw new Error('SQL database has not passed migration validation. Run the documented staging migration first.');
  const notifications = await candidate.request().query("SELECT (SELECT COUNT(*) FROM [dbo].[PlatformPublicRevision] WHERE [id] = 1) AS revisionRows, (SELECT COUNT(*) FROM sys.triggers WHERE [name] IN (N'TR_Club_PublicRevision', N'TR_Application_PublicRevision', N'TR_UniversityContent_PublicRevision', N'TR_StudentFeedback_PublicRevision') AND is_disabled = 0) AS notificationTriggers;");
  if (notifications.recordset[0]?.revisionRows !== 1 || notifications.recordset[0]?.notificationTriggers !== 4) throw new Error('SQL public notifications are not installed. Apply the public notification migration.');
  if (process.env.NODE_ENV === 'production' && process.env[`${sqlPrefix()}_CUTOVER_APPROVED`] !== 'true') throw new Error('Production SQL cutover has not been approved.');
}
function driver() { return sql ||= require('mssql'); }
async function connect({ readiness = true } = {}) {
  if (connecting) await connecting;
  if (pool?.connected) {
    if (readiness && !readinessValidated) {
      try { await verifyReadiness(pool); readinessValidated = true; }
      catch (error) { await disconnect(); throw error; }
    }
    return pool;
  }
  connecting = (async () => {
    const config = sqlConfig();
    connection.readyState = 2;
    const candidate = new (driver().ConnectionPool)(config);
    candidate.on('error', () => { if (pool === candidate) connection.readyState = 0; });
    try {
      await candidate.connect();
      const result = await candidate.request().query('SELECT compatibility_level AS level FROM sys.databases WHERE name = DB_NAME();');
      if (result.recordset[0]?.level < 130) throw new Error('SQL Server database compatibility level must be at least 130.');
      if (readiness) await verifyReadiness(candidate);
      readinessValidated = readiness;
      pool = candidate; connection.readyState = 1; return pool;
    } catch (error) { await candidate.close().catch(() => {}); readinessValidated = false; connection.readyState = 0; throw error; }
  })().finally(() => { connecting = null; });
  return connecting;
}
async function disconnect() { if (pool) await pool.close(); pool = undefined; readinessValidated = false; connection.readyState = 0; }
function request(session) {
  const tx = session?.transaction || context.getStore()?.transaction;
  if (tx) return new (driver().Request)(tx);
  if (!pool?.connected) throw Object.assign(new Error('SQL Server is unavailable.'), { code: 'DATABASE_UNAVAILABLE' });
  return pool.request();
}
class Session {
  async begin() {
    if (this.transaction) return;
    if (!pool?.connected) throw new Error('SQL Server is unavailable.');
    this.rolledBack = false;
    this.pending = null;
    this.transaction = new (driver().Transaction)(pool);
    await this.transaction.begin(driver().ISOLATION_LEVEL.READ_COMMITTED);
    this.transaction.on('rollback', () => { this.rolledBack = true; });
    try {
      // One application write lock avoids lock-order deadlocks across the legacy
      // multi-model workflows. Revisit partitioning only after concurrency QA.
      await request(this).query("SET XACT_ABORT ON; DECLARE @result INT; EXEC @result = sys.sp_getapplock @Resource=N'miu-platform-write-v1', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=15000; IF @result < 0 THROW 51000, 'Platform write lock unavailable.', 1;");
    } catch (error) { await this.abortTransaction(); throw error; }
  }
  startTransaction() { this.pending = this.begin(); return this.pending; }
  async commitTransaction() { await this.pending; if (this.transaction && !this.rolledBack) await this.transaction.commit(); this.transaction = null; }
  async abortTransaction() { if (this.transaction && !this.rolledBack) await this.transaction.rollback(); this.transaction = null; }
  async endSession() { await this.pending?.catch(() => {}); await this.abortTransaction(); }
  async withTransaction(fn) {
    await this.begin();
    try { const result = await context.run(this, fn); await this.commitTransaction(); return result; }
    catch (error) { await this.abortTransaction().catch(() => {}); throw error; }
  }
}
async function transaction(session, fn) {
  const active = session || context.getStore();
  if (active) { await active.pending; if (!active.transaction) throw new Error('SQL session has no active transaction.'); return fn(active); }
  const own = new Session(); return own.withTransaction(() => fn(own));
}
function normalizeError(error, spec) {
  const number = error.number || error.originalError?.info?.number;
  if ([2601, 2627].includes(number)) {
    const index = spec?.indexes.find(i => String(error.message).includes(i.name));
    return Object.assign(new Error('Duplicate database key.'), { code: 11000, keyPattern: index?.keys || { _id: 1 } });
  }
  return error;
}
module.exports = { connect, disconnect, connection, request, Session, transaction, driver, normalizeError };
