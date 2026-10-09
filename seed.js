const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Club, SiteSetting, ClubAccount } = require('./models');
require('dotenv').config();

const defaultClubs = [
  {
    id: 1,
    name: 'Utopia',
    committee: 'Utopia Club',
    category: 'Innovation',
    tagline: 'Creative projects and student initiatives',
    image: '/assets/img/pics/Utopia.jpg',
    imageFit: 'contain',
    status: 'open',
    seats: 25,
    members: 18,
    applicants: 7,
    description: 'A creative student community focused on innovation, leadership, and real-world problem solving.',
    requirements: 'Curiosity, teamwork, and a passion for creating impact.'
  },
  {
    id: 2,
    name: 'MUN',
    committee: 'Model United Nations',
    category: 'Debate & Leadership',
    tagline: 'Diplomacy, debate, and public speaking',
    image: '/assets/img/pics/mun.jpg',
    imageFit: 'contain',
    status: 'open',
    seats: 30,
    members: 22,
    applicants: 9,
    description: 'Develop public speaking, diplomacy, and international relations through model UN experiences.',
    requirements: 'Confidence, research skills, and strong communication.'
  },
  {
    id: 3,
    name: 'CDC',
    committee: 'Career Development Club',
    category: 'Career Growth',
    tagline: 'Career skills and professional growth',
    image: '/assets/img/pics/cdc.jpg',
    imageFit: 'contain',
    status: 'open',
    seats: 20,
    members: 16,
    applicants: 6,
    description: 'Helps students build professional skills, career awareness, and future-ready opportunities.',
    requirements: 'Motivation to grow personally and professionally.'
  },
  {
    id: 4,
    name: 'Dimas',
    committee: 'Dimas Club',
    category: 'Media & Content',
    tagline: 'Media production and creative content',
    image: '/assets/img/pics/dimas.jpg',
    imageFit: 'contain',
    status: 'full',
    seats: 18,
    members: 18,
    applicants: 5,
    description: 'A media-driven club focused on storytelling, digital content, and creative expression.',
    requirements: 'Creativity, design sense, and communication skills.'
  },
  {
    id: 5,
    name: 'IEEE',
    committee: 'IEEE Student Chapter',
    category: 'Technology',
    tagline: 'Engineering, technology, and innovation',
    image: '/assets/img/pics/ieee.jpg',
    imageFit: 'contain',
    status: 'open',
    seats: 26,
    members: 19,
    applicants: 8,
    description: 'Connects students with engineering, technology, and innovation through events and projects.',
    requirements: 'Interest in technology, engineering, and collaboration.'
  },
  {
    id: 6,
    name: 'ACPC',
    committee: 'ACPC Club',
    category: 'Programming',
    tagline: 'Competitive programming and problem-solving',
    image: '/assets/img/pics/acpc.jpg',
    imageFit: 'contain',
    status: 'open',
    seats: 24,
    members: 17,
    applicants: 10,
    description: 'Encourages competitive programming, teamwork, and problem-solving through training and events.',
    requirements: 'Analytical thinking and passion for coding challenges.'
  },
  {
    id: 7,
    name: 'Tunners',
    committee: 'Tunners Club',
    category: 'Sports',
    tagline: 'Fitness, sports, and team activities',
    image: '/assets/img/pics/tuners.jpg',
    imageFit: 'contain',
    status: 'open',
    seats: 22,
    members: 14,
    applicants: 4,
    description: 'Promotes movement, teamwork, endurance, and active student life through sports activities.',
    requirements: 'Energy, discipline, and willingness to participate.'
  },
  {
    id: 8,
    name: 'Theater',
    committee: 'Theater Club',
    category: 'Arts & Performance',
    tagline: 'Acting, stage performance, and storytelling',
    image: '/assets/img/pics/theater.jpg',
    imageFit: 'contain',
    status: 'full',
    seats: 16,
    members: 16,
    applicants: 3,
    description: 'A performance-focused space for acting, expression, stage work, and creative storytelling.',
    requirements: 'Confidence, creativity, and passion for performance.'
  },
  {
    id: 9,
    name: 'MSP',
    committee: 'MSP Club',
    category: 'Student Life',
    tagline: 'Campus events and student community',
    image: '/assets/img/pics/msp.jpg',
    imageFit: 'contain',
    status: 'open',
    seats: 28,
    members: 20,
    applicants: 7,
    description: 'Supports student engagement, community building, and collaborative campus initiatives.',
    requirements: 'Leadership, initiative, and a service mindset.'
  },
  {
    id: 10,
    name: 'Gamers Legacy',
    committee: 'Gamers Legacy Club',
    category: 'Gaming & Esports',
    tagline: 'Gaming, competition, and community',
    image: '/assets/img/pics/gamerslegacy.jpg',
    imageFit: 'contain',
    status: 'open',
    seats: 24,
    members: 16,
    applicants: 5,
    description: 'A student gaming community for competitions, events, and connecting players across campus.',
    requirements: 'Team spirit, good sportsmanship, and an interest in gaming.'
  },
  {
    id: 11,
    name: 'IHEPC',
    committee: 'International Hepatitis Club',
    category: 'Health Awareness',
    tagline: 'Hepatitis awareness and education',
    image: '/assets/img/pics/ihepc.jpg',
    imageFit: 'contain',
    status: 'open',
    seats: 20,
    members: 13,
    applicants: 4,
    description: 'Raises awareness and shares educational information about hepatitis and related health topics.',
    requirements: 'Interest in health awareness, education, and community outreach.'
  },
  {
    id: 12,
    name: 'TEDx MIU',
    committee: 'TEDx MIU',
    category: 'Ideas & Events',
    tagline: 'Ideas worth sharing through campus events',
    image: '/assets/img/pics/tedx.jpg',
    imageFit: 'contain',
    status: 'open',
    seats: 24,
    members: 17,
    applicants: 6,
    description: 'Organizes independently hosted TED-style events to bring ideas and speakers to the MIU community.',
    requirements: 'Creativity, organization, and an interest in sharing ideas.'
  }
];

const defaultHomepageSettings = {
  title: 'University Clubs',
  subtitle: 'Explore all clubs and apply to the ones that match your interests.'
};
const defaultClubsWithOrder = defaultClubs.map((club, index) => ({ ...club, sortOrder: index + 1 }));

function writeJsonFile(filePath, value) {
  const temporaryFile = `${filePath}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2));
  fs.renameSync(temporaryFile, filePath);
}

async function seedMongo() {
  if (!process.env.MONGO_URI) {
    console.log('MONGO_URI is not configured; MongoDB seed skipped.');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    await Promise.all([Club.init(), SiteSetting.init()]);
    const accountCollectionName = ClubAccount.collection.collectionName;
    const accountCollectionExists = await mongoose.connection.db
      .listCollections({ name: accountCollectionName }, { nameOnly: true }).hasNext();
    if (accountCollectionExists) {
      const indexes = await ClubAccount.collection.indexes();
      const uniqueClubIdIndex = indexes.find((index) => index.unique && index.key?.clubId === 1);
      if (uniqueClubIdIndex) await ClubAccount.collection.dropIndex(uniqueClubIdIndex.name);
    }
    await ClubAccount.createIndexes();
    const existingClubs = await Club.countDocuments();
    if (existingClubs === 0) {
      await Club.insertMany(defaultClubsWithOrder);
      console.log(`Seeded ${defaultClubs.length} clubs into MongoDB.`);
    } else {
      console.log(`MongoDB already has ${existingClubs} clubs; existing records preserved.`);
    }
    const homepageSettings = await SiteSetting.findOne({ key: 'homepage' });
    if (!homepageSettings) {
      await SiteSetting.create({ key: 'homepage', ...defaultHomepageSettings });
      console.log('Seeded homepage settings into MongoDB.');
    } else {
      console.log('Existing MongoDB homepage settings preserved.');
    }
    const clubAccounts = readJson(path.join(__dirname, 'data', 'club-accounts.json'), []);
    if (clubAccounts.length) {
      await ClubAccount.bulkWrite(clubAccounts.map((account) => ({
        updateOne: {
          filter: { clubId: account.clubId, email: account.email },
          update: { $setOnInsert: {
            ...account,
            role: ['head', 'pr', 'english', 'sso', 'dean'].includes(account.role) ? account.role : 'president',
            committee: account.committee || ''
          } },
          upsert: true
        }
      })));
      await ClubAccount.updateMany(
        { role: { $exists: false } },
        { $set: { role: 'president', committee: '' } }
      );
      console.log('Seeded missing MongoDB club accounts; existing accounts preserved.');
    }
  } catch (error) {
    console.log(`MongoDB seed unavailable; local club accounts are ready: ${error.name}`);
  } finally {
    await mongoose.disconnect();
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function seedClubAccounts(dataDirectory) {
  const clubs = readJson(path.join(dataDirectory, 'clubs.json'), defaultClubsWithOrder);
  const accountsFile = path.join(dataDirectory, 'club-accounts.json');
  const accounts = readJson(accountsFile, []);
  const knownClubIds = new Set(accounts.map((account) => account.clubId));
  const newCredentials = [];

  for (const club of clubs) {
    if (knownClubIds.has(club.id)) continue;

    const slug = club.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || `club-${club.id}`;
    let email = `${slug}@clubs.miu.local`;
    if (accounts.some((account) => account.email === email)) email = `${slug}.${club.id}@clubs.miu.local`;
    const password = crypto.randomBytes(18).toString('base64url');
    const salt = crypto.randomBytes(16).toString('hex');

    accounts.push({
      clubId: club.id,
      email,
      salt,
      passwordHash: crypto.scryptSync(password, salt, 64).toString('hex')
    });
    newCredentials.push({ clubId: club.id, clubName: club.name, email, password });
    knownClubIds.add(club.id);
  }

  const committeeAccounts = [
    { clubId: 0, email: 'pr@miu.local', role: 'pr' },
    { clubId: 0, email: 'english@miu.local', role: 'english' },
    { clubId: 0, email: 'security@miu.local', role: 'security' },
    { clubId: 0, email: 'sso@miu.local', role: 'sso' },
    { clubId: 0, email: 'dean@miu.local', role: 'dean' }
  ];
  for (const committee of committeeAccounts) {
    if (accounts.some((account) => account.email === committee.email)) continue;
    const password = crypto.randomBytes(18).toString('base64url');
    const salt = crypto.randomBytes(16).toString('hex');
    accounts.push({
      clubId: 0,
      email: committee.email,
      salt,
      passwordHash: crypto.scryptSync(password, salt, 64).toString('hex'),
      role: committee.role,
      committee: ''
    });
    newCredentials.push({ clubName: committee.role.toUpperCase(), email: committee.email, password });
  }

  if (newCredentials.length) {
    writeJsonFile(accountsFile, accounts);
    // Show the generated passwords exactly once at seed time. They are never
    // persisted in plaintext, so they cannot be viewed later.
    console.log('Generated new club logins (shown once, not stored):');
    for (const credential of newCredentials) {
      console.log(`  ${credential.clubName || ''} <${credential.email}>  password: ${credential.password}`);
    }
  } else {
    console.log(`Preserved all ${accounts.length} existing club logins.`);
  }
}

async function seed() {
  const dataDirectory = path.join(__dirname, 'data');
  fs.mkdirSync(dataDirectory, { recursive: true });

  const clubsFile = path.join(dataDirectory, 'clubs.json');
  const homepageFile = path.join(dataDirectory, 'homepage.json');
  const adminFile = path.join(dataDirectory, 'admin.json');

  if (fs.existsSync(clubsFile)) {
    console.log('Existing club data preserved.');
  } else {
    writeJsonFile(clubsFile, defaultClubsWithOrder);
    console.log(`Seeded ${defaultClubs.length} clubs.`);
  }

  if (fs.existsSync(homepageFile)) {
    console.log('Existing homepage settings preserved.');
  } else {
    writeJsonFile(homepageFile, defaultHomepageSettings);
    console.log('Seeded homepage settings.');
  }

  if (fs.existsSync(adminFile)) {
    const adminAccount = JSON.parse(fs.readFileSync(adminFile, 'utf8'));
    if (!adminAccount.email && process.env.ADMIN_EMAIL) {
      const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('ADMIN_EMAIL must be a valid email address.');
      }
      adminAccount.email = email;
      writeJsonFile(adminFile, adminAccount);
      console.log('Added ADMIN_EMAIL to the existing admin account; password preserved.');
    } else {
      console.log('Existing admin account preserved.');
    }
  } else if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
      throw new Error('ADMIN_EMAIL must be valid and ADMIN_PASSWORD must contain at least 12 characters.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    writeJsonFile(adminFile, {
      email,
      salt,
      passwordHash: crypto.scryptSync(password, salt, 64).toString('hex'),
      sessionSecret: process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex')
    });
    console.log('Seeded admin account from environment variables.');
  } else if (process.env.ADMIN_EMAIL || process.env.ADMIN_PASSWORD) {
    throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD before seeding an admin account.');
  } else {
    console.log('No admin account seeded. Create one at /admin on this computer.');
  }

  seedClubAccounts(dataDirectory);
  await seedMongo();
}

if (require.main === module) {
  seed().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { defaultClubs, defaultHomepageSettings, seed, seedClubAccounts };
