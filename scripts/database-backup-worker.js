require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const mongoose = require('mongoose');
const { createWorkbook } = require('./xlsx-writer');

const gzip = promisify(zlib.gzip);
function loadConfig() {
  const mongoUri = process.env.MONGO_URI;
  const backupDir = process.env.BACKUP_DIR;
  const excelBackupFile = process.env.EXCEL_BACKUP_FILE || (backupDir ? path.join(backupDir, 'miu project new.xlsx') : '');
  const keyText = process.env.BACKUP_ENCRYPTION_KEY;
  if (!mongoUri) throw new Error('MONGO_URI is required.');
  if (!backupDir || !path.isAbsolute(backupDir)) throw new Error('Set BACKUP_DIR to an absolute path on persistent storage outside the application folder.');
  if (!excelBackupFile || !path.isAbsolute(excelBackupFile) || path.extname(excelBackupFile).toLowerCase() !== '.xlsx') {
    throw new Error('EXCEL_BACKUP_FILE must be an absolute path ending in .xlsx on persistent storage.');
  }
  const projectRoot = path.resolve(__dirname, '..');
  for (const [label, target] of [['BACKUP_DIR', backupDir], ['EXCEL_BACKUP_FILE', path.dirname(excelBackupFile)]]) {
    const relativePath = path.relative(projectRoot, path.resolve(target));
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      throw new Error(`${label} must be outside the application folder.`);
    }
  }
  const key = Buffer.from(keyText || '', 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return { mongoUri, backupDir: path.resolve(backupDir), excelBackupFile: path.resolve(excelBackupFile), key };
}

function encryptSnapshot(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({
    format: 'miu-clubs-mongodb-backup-v1',
    algorithm: 'aes-256-gcm+gzip',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64')
  });
}

const privateFields = new Set(['_id', '__v', 'salt', 'passwordHash', 'managementTokenHash', 'sessionVersion', 'sessionSecret', 'resetToken', 'tokenHash', 'codeHash']);

function safeExcelValue(value, key = '') {
  if (privateFields.has(key)) return undefined;
  if (typeof value === 'string' && /^data:image\//i.test(value)) return '[included in encrypted backup]';
  if (Array.isArray(value)) return value.map((item) => safeExcelValue(item));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value)
      .filter(([childKey]) => !privateFields.has(childKey))
      .map(([childKey, childValue]) => [childKey, safeExcelValue(childValue, childKey)]));
  }
  return value;
}

function dynamicSheet(name, records, preferred = []) {
  const keys = [...new Set(records.flatMap((record) => Object.keys(record)))].filter((key) => !privateFields.has(key));
  const ordered = [...preferred.filter((key) => keys.includes(key)), ...keys.filter((key) => !preferred.includes(key)).sort()];
  return {
    name,
    headers: ordered.map((key) => key === 'createdAt' ? 'Created At' : key === 'updatedAt' ? 'Last Updated' : key),
    rows: records.map((record) => ordered.map((key) => safeExcelValue(record[key], key)))
  };
}

async function writeExcelWorkbook(config, snapshot) {
  const collection = (name) => snapshot.collections.find((item) => item.name === name)?.documents || [];
  const applications = collection('applications');
  const answerLabels = [...new Set(applications.flatMap((item) => (Array.isArray(item.answers) ? item.answers : [])
    .map((answer) => answer.label || answer.key).filter(Boolean)))];
  const applicationHeaders = [
    'Application ID', 'Submitted At', 'Last Updated', 'Club ID', 'Committee', 'Student Name',
    'Email', 'University ID', 'Major', 'Phone', 'Interview Slot', 'Age', 'Motivation', 'Notes',
    'Rating', 'Interviewed', 'Status', 'Interview Evaluations', ...answerLabels, 'Photo'
  ];
  const clubs = collection('clubs');
  const clubNames = new Map(clubs.map((club) => [Number(club.id), club.name || '']));
  const answerRows = applications.map((item) => {
    const answers = new Map((Array.isArray(item.answers) ? item.answers : []).map((answer) => [answer.label || answer.key, answer.value]));
    return [
      item.id, item.createdAt, item.updatedAt, item.clubId, item.committee, item.studentName,
      item.email, item.universityId, item.major, item.phone, item.slot, item.age, item.motivation,
      item.notes, item.rating, item.interviewed, item.status, safeExcelValue(item.interviewEvaluations),
      ...answerLabels.map((label) => answers.get(label) || ''),
      item.photo ? 'Photo is stored in the encrypted database backup' : ''
    ];
  });
  const requestRecords = collection('contentrequests');
  const registrations = collection('eventregistrations');
  const accounts = collection('clubaccounts');
  const studentAccounts = collection('studentaccounts');
  const settings = collection('sitesettings');
  const auditLogs = collection('auditlogs');
  const attendanceRecords = collection('attendancerecords');
  const attendanceSessions = collection('attendancesessions');
  const clubHeaders = ['Club ID', 'Name', 'Main Committee', 'Category', 'Status', 'Archived At', 'Seats', 'Members', 'Applicants', 'Description', 'Requirements', 'Committee Availability', 'Events'];
  const sheets = [
    { name: 'Applications', headers: applicationHeaders, rows: answerRows },
    dynamicSheet('Content Requests', requestRecords, ['id', 'createdAt', 'updatedAt', 'clubId', 'clubName', 'type', 'title', 'status', 'description', 'date', 'time', 'location']),
    {
      name: 'Event Registrations',
      headers: ['Registration ID', 'Registered At', 'Last Updated', 'Club ID', 'Club', 'Event Index', 'Event', 'Name', 'Email'],
      rows: registrations.map((item) => [
        item.id, item.createdAt, item.updatedAt, item.clubId, clubNames.get(Number(item.clubId)) || '',
        item.eventIndex, item.eventTitle, item.name, item.email
      ])
    },
    {
      name: 'Clubs',
      headers: clubHeaders,
      rows: clubs.map((item) => [
    item.id, item.name, item.committee, item.category, item.status, item.archivedAt, item.seats,
        item.members, item.applicants, item.description, item.requirements,
        safeExcelValue(item.committeeAvailability || []), safeExcelValue(item.events || [])
      ])
    },
    dynamicSheet('Club Accounts', accounts, ['clubId', 'email', 'role', 'committee', 'createdAt', 'updatedAt']),
    dynamicSheet('Student Accounts', studentAccounts, ['email', 'name', 'createdAt', 'updatedAt']),
    {
      name: 'Attendance',
      headers: ['Checked In At', 'Activity Date', 'Activity Time', 'Club ID', 'Club', 'Type', 'Event / Booth', 'Name', 'Email', 'Note'],
      rows: attendanceRecords.map((item) => [
        item.attendedAt, item.eventDate, item.eventTime, item.clubId, clubNames.get(Number(item.clubId)) || '',
        item.itemType || 'event', item.eventTitle, item.name, item.email, item.note
      ])
    },
    dynamicSheet('Attendance Sessions', attendanceSessions, ['clubId', 'itemType', 'eventRequestId', 'eventTitle', 'eventDate', 'eventTime', 'active', 'createdBy', 'createdAt', 'updatedAt']),
    dynamicSheet('Site Settings', settings, ['key', 'title', 'subtitle', 'createdAt', 'updatedAt']),
    dynamicSheet('Audit Logs', auditLogs, ['timestamp', 'actorEmail', 'actorRole', 'action', 'targetType', 'targetId', 'targetName', 'details', 'ip'])
  ];
  const workbook = createWorkbook(sheets);
  await fs.promises.mkdir(path.dirname(config.excelBackupFile), { recursive: true, mode: 0o700 });
  let lockNoticeShown = false;
  while (true) {
    const temporaryPath = `${config.excelBackupFile}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.promises.writeFile(temporaryPath, workbook, { flag: 'wx', mode: 0o600 });
    try {
      await fs.promises.rename(temporaryPath, config.excelBackupFile);
      break;
    } catch (error) {
      await fs.promises.unlink(temporaryPath).catch(() => {});
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      if (!lockNoticeShown) {
        console.error(`Excel is open or locked. Waiting to update ${config.excelBackupFile}; close it to let the latest backup finish.`);
        lockNoticeShown = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  console.log(`Excel workbook updated: ${config.excelBackupFile}`);
}

async function saveSnapshot(config, trigger) {
  const db = mongoose.connection.db;
  const collections = [];
  const collectionNames = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((collection) => collection.name)
    .filter((name) => !name.startsWith('system.'));
  for (const name of collectionNames) {
    const documents = await db.collection(name).find({}).toArray();
    collections.push({ name, documents });
  }

  const EJSON = mongoose.mongo.BSON.EJSON;
  const snapshot = {
    format: 'miu-clubs-mongodb-snapshot-v1',
    createdAt: new Date().toISOString(),
    database: db.databaseName,
    trigger,
    collections
  };
  const compressed = await gzip(Buffer.from(EJSON.stringify(snapshot), 'utf8'));
  const encrypted = encryptSnapshot(compressed, config.key);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `snapshot-${stamp}-${crypto.randomBytes(4).toString('hex')}.json.gz.enc`;
  const finalPath = path.join(config.backupDir, fileName);
  const temporaryPath = `${finalPath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.promises.writeFile(temporaryPath, encrypted, { flag: 'wx', mode: 0o600 });
  await fs.promises.rename(temporaryPath, finalPath);
  await writeExcelWorkbook(config, snapshot);
  console.log(`Encrypted MongoDB snapshot created: ${finalPath}`);
}

async function main() {
  const config = loadConfig();
  await fs.promises.mkdir(config.backupDir, { recursive: true, mode: 0o700 });
  await fs.promises.mkdir(path.dirname(config.excelBackupFile), { recursive: true, mode: 0o700 });
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log(`Connected to MongoDB; encrypted snapshots: ${config.backupDir}; Excel workbook: ${config.excelBackupFile}`);

  const checkpointPath = path.join(config.backupDir, 'change-stream-checkpoint.json');
  const EJSON = mongoose.mongo.BSON.EJSON;
  let resumeAfter;
  try {
    const savedCheckpoint = JSON.parse(await fs.promises.readFile(checkpointPath, 'utf8'));
    resumeAfter = EJSON.parse(savedCheckpoint.resumeToken);
    console.log(`Resuming MongoDB change monitoring from ${savedCheckpoint.savedAt}.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const stream = mongoose.connection.watch([
    { $match: { 'ns.coll': { $not: /^system\./ }, operationType: { $in: ['insert', 'update', 'replace', 'delete'] } } }
  ], {
    fullDocument: 'updateLookup',
    ...(resumeAfter ? { resumeAfter } : {})
  });

  // Start watching before the first baseline so changes made during the scan
  // are queued and backed up immediately after it completes.
  let pending = saveSnapshot(config, { type: resumeAfter ? 'restart-baseline' : 'baseline' });
  pending.catch((error) => {
    console.error('Initial database backup failed:', error.message);
    process.exit(1);
  });
  stream.on('change', (change) => {
    const trigger = {
      type: 'database-change',
      collection: change.ns?.coll || '',
      operation: change.operationType,
      documentKey: change.documentKey || {},
      changedAt: new Date().toISOString()
    };
    pending = pending.then(() => saveSnapshot(config, trigger)).then(async () => {
      const temporaryPath = `${checkpointPath}.tmp`;
      await fs.promises.writeFile(temporaryPath, JSON.stringify({
        savedAt: new Date().toISOString(),
        resumeToken: EJSON.stringify(change._id)
      }), { flag: 'w', mode: 0o600 });
      await fs.promises.rename(temporaryPath, checkpointPath);
    }).catch(async (error) => {
      console.error('Backup snapshot failed; the last successful backup is unchanged:', error.message);
      await stream.close().catch(() => {});
      process.exit(1);
    });
  });

  stream.on('error', (error) => {
    console.error('MongoDB change stream stopped. Backups will not include new edits until this worker is restarted:', error.message);
    process.exit(1);
  });

  const shutdown = async () => {
    await stream.close().catch(() => {});
    await pending.catch(() => {});
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch(async (error) => {
  console.error('Database backup worker did not start:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
