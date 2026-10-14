require('dotenv').config();
const { catalog } = require('../database/catalog');
const runtime = require('../database/runtime');
async function main() {
  await runtime.connect();
  const result = {};
  for (const spec of catalog()) {
    if (!spec.indexes.some(i => i.options.expireAfterSeconds === 0 || i.options.expires === 0)) continue;
    // Only declared TTL collections; no content/account deletion by this job.
    const expired = await runtime.transaction(null, async session => runtime.request(session)
      .query(`DELETE FROM ${spec.table} WHERE [expiresAt] <= SYSUTCDATETIME();`));
    result[spec.name] = expired.rowsAffected[0];
  }
  console.log(JSON.stringify({ expiredRecordsDeleted: result }));
}
if (require.main === module) main().catch(error => { console.error('SQL expiry cleanup failed:', error.code || error.name); process.exitCode = 1; }).finally(() => runtime.disconnect());
module.exports = { main };
