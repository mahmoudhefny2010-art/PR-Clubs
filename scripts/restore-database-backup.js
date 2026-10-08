require('dotenv').config();

const fs = require('fs');
const zlib = require('zlib');
const { promisify } = require('util');
const mongoose = require('mongoose');

const gunzip = promisify(zlib.gunzip);

function loadConfig() {
  const backupFile = process.env.BACKUP_FILE;
  const mongoUri = process.env.MONGO_URI;
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || '', 'base64');
  if (process.env.ALLOW_DATABASE_RESTORE !== 'YES') {
    throw new Error('Set ALLOW_DATABASE_RESTORE=YES only after verifying the target database and backup file.');
  }
  if (!backupFile || !require('path').isAbsolute(backupFile)) throw new Error('Set BACKUP_FILE to the absolute backup file path.');
  if (!mongoUri) throw new Error('MONGO_URI must point to the database that will receive the restore.');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return { backupFile, mongoUri, key };
}

function decryptSnapshot(envelope, key) {
  if (envelope.format !== 'miu-clubs-mongodb-backup-v1' || envelope.algorithm !== 'aes-256-gcm+gzip') {
    throw new Error('Unsupported or invalid backup file format.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final()
  ]);
}

async function main() {
  const config = loadConfig();
  const envelope = JSON.parse(await fs.promises.readFile(config.backupFile, 'utf8'));
  const compressed = decryptSnapshot(envelope, config.key);
  const EJSON = mongoose.mongo.BSON.EJSON;
  const snapshot = EJSON.parse((await gunzip(compressed)).toString('utf8'));
  if (snapshot.format !== 'miu-clubs-mongodb-snapshot-v1' || !Array.isArray(snapshot.collections)) {
    throw new Error('The decrypted file is not a valid MIU Clubs database snapshot.');
  }

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log(`Restoring snapshot created ${snapshot.createdAt} into database "${db.databaseName}".`);
  for (const entry of snapshot.collections) {
    if (typeof entry.name !== 'string' || !entry.name || entry.name.startsWith('system.')) {
      throw new Error(`Refusing to restore unexpected collection: ${entry.name}`);
    }
    const collection = db.collection(entry.name);
    await collection.deleteMany({});
    if (entry.documents.length) await collection.insertMany(entry.documents, { ordered: true });
    console.log(`Restored ${entry.documents.length} records to ${entry.name}.`);
  }
  await mongoose.disconnect();
  console.log('Restore completed. Verify the target database before directing the website to it.');
}

main().catch(async (error) => {
  console.error('Database restore failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
