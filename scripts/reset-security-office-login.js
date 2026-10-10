require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { ClubAccount } = require('../models');

const previousEmail = 'security@miu.local';
const newEmail = 'security.office@miu.local';
const dataFile = path.join(__dirname, '..', 'data', 'club-accounts.json');

function writeLocalAccountCache(salt, passwordHash, passwordChangedAt) {
  const accounts = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const oldIndex = accounts.findIndex((account) => account.email?.toLowerCase() === previousEmail);
  if (oldIndex < 0) throw new Error('The local Security Office account record is missing.');
  if (accounts.some((account) => account.email?.toLowerCase() === newEmail)) {
    throw new Error('The new Security Office email already exists in the local account cache.');
  }

  const oldAccount = accounts[oldIndex];
  accounts[oldIndex] = {
    ...oldAccount,
    email: newEmail,
    role: 'security',
    clubId: 0,
    salt,
    passwordHash,
    sessionVersion: (Number(oldAccount.sessionVersion) || 0) + 1,
    passwordChangedAt: passwordChangedAt.toISOString()
  };

  const tempFile = `${dataFile}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(accounts, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, dataFile);
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing. No account data was changed.');
  }

  const existingNewEmail = await ClubAccount.exists({ email: newEmail });
  if (existingNewEmail) throw new Error(`${newEmail} is already in use. No account data was changed.`);

  const password = crypto.randomBytes(18).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const passwordChangedAt = new Date();

  const updated = await ClubAccount.findOneAndUpdate(
    { email: previousEmail, role: 'security', clubId: 0 },
    {
      $set: { email: newEmail, salt, passwordHash, passwordChangedAt },
      $inc: { sessionVersion: 1 }
    },
    { new: true, projection: { email: 1, role: 1, clubId: 1, salt: 1, passwordHash: 1 } }
  ).lean();

  if (!updated) throw new Error('The existing Security Office account was not found in MongoDB. No account data was changed.');
  if (updated.email !== newEmail || updated.role !== 'security' || updated.clubId !== 0) {
    throw new Error('MongoDB returned an unexpected account record.');
  }
  if (crypto.scryptSync(password, updated.salt, 64).toString('hex') !== updated.passwordHash) {
    throw new Error('The saved password could not be verified.');
  }

  let cacheUpdated = true;
  try {
    writeLocalAccountCache(salt, passwordHash, passwordChangedAt);
  } catch (error) {
    cacheUpdated = false;
    console.error(`Warning: MongoDB was updated, but the local cache was not: ${error.message}`);
  }

  console.log('\nSecurity Office login updated and verified in MongoDB.');
  console.log(`Email: ${newEmail}`);
  console.log(`Password: ${password}`);
  console.log(`Local cache updated: ${cacheUpdated ? 'yes' : 'no'}`);
  console.log('The previous email and active sessions have been disabled.');
}

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is missing. No account data was changed.');
  process.exitCode = 1;
} else {
  mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  }).then(main).catch((error) => {
    console.error(`Could not connect to MongoDB. No account data was changed: ${error.message}`);
    process.exitCode = 1;
  }).finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
}
