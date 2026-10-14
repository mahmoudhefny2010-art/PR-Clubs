// Same backup gate, TTL validation and batching as the scheduled cleanup job.
require('dotenv').config({ quiet: true });
async function main(args = process.argv.slice(2)) {
  if (require('../database/config').provider() === 'azuresql') {
    // Azure uses managed backups and an external scheduler rather than local .bak files.
    const runtime = require('../database/runtime');
    try {
      const result = await require('./sqlserver-operations.cjs').cleanup(await runtime.connect(), { dryRun: args.includes('--dry-run') });
      console.log(JSON.stringify({ expiredRecordsDeleted: result }));
      return result;
    } finally { await runtime.disconnect(); }
  }
  return require('./sqlserver-operations.cjs').main([
    args.includes('--dry-run') ? 'cleanup-preview' : 'cleanup',
    ...args.filter(arg => arg !== '--dry-run'),
    ...(args.includes('--database') ? [] : ['--database', process.env.SQLSERVER_DATABASE])
  ]);
}
if (require.main === module) main().catch(error => {
  console.error('SQL expiry cleanup failed:', error.code || error.name, error.code ? '' : error.message);
  process.exitCode = 1;
});
module.exports = { main };
