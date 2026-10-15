const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const { encryptBackup, decryptBackup, offsiteConfiguration } = require('../services/offsite-backup');
async function main() {
  const args = process.argv.slice(2);
  const config = offsiteConfiguration();
  if (args[0] === '--check') { console.log(JSON.stringify({ configured: Boolean(config), destinationPending: !config })); return; }
  if (!config) throw new Error('Offsite backup destination and encryption key are not configured.');
  if (args[0] === 'export' && args.length === 2) console.log(JSON.stringify(await encryptBackup({ source: path.resolve(args[1]), ...config })));
  else if (args[0] === 'decrypt' && args.length === 3) console.log(JSON.stringify(await decryptBackup({ source: path.resolve(args[1]), destination: path.resolve(args[2]), key: config.key })));
  else throw new Error('Use --check, export <verified.bak>, or decrypt <encrypted.bak.enc> <new destination.bak>.');
}
main().catch(error => { console.error('Offsite backup failed:', error.code || error.message); process.exitCode = 1; });
