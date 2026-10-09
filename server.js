const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const { createAskAiRouter } = require('./services/ask-ai');
const {
  Club,
  Application,
  SiteSetting,
  SiteVisitor,
  SiteNetwork,
  ClubAccount,
  ContentRequest,
  EventRegistration,
  AttendanceSession,
  AttendanceRecord,
  StudentAccount,
  LoginAttempt,
  PasswordResetToken,
  PasswordRecoveryRateLimit,
  AdminAuthState,
  StudentEmailCode,
  AuditLog
} = require('./models');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 1111;
const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME
  && process.env.CLOUDINARY_API_KEY
  && process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));

const defaultClubs = [
  {
    id: 1,
    name: 'Utopia',
    committee: 'Utopia Club',
    category: 'Innovation',
    tagline: 'Creative projects and student initiatives',
    image: '/assets/img/pics/Utopia.jpg',
    imagePublicId: '',
    imageFit: 'contain',
    status: 'open',
    seats: 25,
    members: 18,
    applicants: 7,
    description: 'A creative student community focused on innovation, leadership, and real-world problem solving.',
    requirements: 'Curiosity, teamwork, and a passion for creating impact.',
    applicationIntro: '',
    applicationFields: [],
    sponsors: [],
    booths: []
  },
  {
    id: 2,
    name: 'MUN',
    committee: 'Model United Nations',
    category: 'Debate & Leadership',
    tagline: 'Diplomacy, debate, and public speaking',
    image: '/assets/img/pics/mun.jpg',
    imagePublicId: '',
    imageFit: 'contain',
    status: 'open',
    seats: 30,
    members: 22,
    applicants: 9,
    description: 'Develop public speaking, diplomacy, and international relations through model UN experiences.',
    requirements: 'Confidence, research skills, and strong communication.',
    applicationIntro: '',
    applicationFields: [],
    sponsors: [],
    booths: []
  },
  {
    id: 3,
    name: 'CDC',
    committee: 'Career Development Club',
    category: 'Career Growth',
    tagline: 'Career skills and professional growth',
    image: '/assets/img/pics/cdc.jpg',
    imagePublicId: '',
    imageFit: 'contain',
    status: 'open',
    seats: 20,
    members: 16,
    applicants: 6,
    description: 'Helps students build professional skills, career awareness, and future-ready opportunities.',
    requirements: 'Motivation to grow personally and professionally.',
    applicationIntro: '',
    applicationFields: [],
    sponsors: [],
    booths: []
  },
  {
    id: 4,
    name: 'Dimas',
    committee: 'Dimas Club',
    category: 'Media & Content',
    tagline: 'Media production and creative content',
    image: '/assets/img/pics/dimas.jpg',
    imagePublicId: '',
    imageFit: 'contain',
    status: 'full',
    seats: 18,
    members: 18,
    applicants: 5,
    description: 'A media-driven club focused on storytelling, digital content, and creative expression.',
    requirements: 'Creativity, design sense, and communication skills.',
    applicationIntro: '',
    applicationFields: [],
    sponsors: [],
    booths: []
  },
  {
    id: 5,
    name: 'IEEE',
    committee: 'IEEE Student Chapter',
    category: 'Technology',
    tagline: 'Engineering, technology, and innovation',
    image: '/assets/img/pics/ieee.jpg',
    imagePublicId: '',
    imageFit: 'contain',
    status: 'open',
    seats: 26,
    members: 19,
    applicants: 8,
    description: 'Connects students with engineering, technology, and innovation through events and projects.',
    requirements: 'Interest in technology, engineering, and collaboration.',
    applicationIntro: '',
    applicationFields: [],
    sponsors: [],
    booths: []
  },
  {
    id: 6,
    name: 'ACPC',
    committee: 'ACPC Club',
    category: 'Programming',
    tagline: 'Competitive programming and problem-solving',
    image: '/assets/img/pics/acpc.jpg',
    imagePublicId: '',
    imageFit: 'contain',
    status: 'open',
    seats: 24,
    members: 17,
    applicants: 10,
    description: 'Encourages competitive programming, teamwork, and problem-solving through training and events.',
    requirements: 'Analytical thinking and passion for coding challenges.',
    applicationIntro: '',
    applicationFields: [],
    sponsors: [],
    booths: []
  },
  {
    id: 7,
    name: 'Tunners',
    committee: 'Tunners Club',
    category: 'Sports',
    tagline: 'Fitness, sports, and team activities',
    image: '/assets/img/pics/tuners.jpg',
    imagePublicId: '',
    imageFit: 'contain',
    status: 'open',
    seats: 22,
    members: 14,
    applicants: 4,
    description: 'Promotes movement, teamwork, endurance, and active student life through sports activities.',
    requirements: 'Energy, discipline, and willingness to participate.',
    applicationIntro: '',
    applicationFields: [],
    sponsors: [],
    booths: []
  },
  {
    id: 8,
    name: 'Theater',
    committee: 'Theater Club',
    category: 'Arts & Performance',
    tagline: 'Acting, stage performance, and storytelling',
    image: '/assets/img/pics/theater.jpg',
    imagePublicId: '',
    imageFit: 'contain',
    status: 'full',
    seats: 16,
    members: 16,
    applicants: 3,
    description: 'A performance-focused space for acting, expression, stage work, and creative storytelling.',
    requirements: 'Confidence, creativity, and passion for performance.',
    applicationIntro: '',
    applicationFields: [],
    sponsors: [],
    booths: []
  },
  {
    id: 9,
    name: 'MSP',
    committee: 'MSP Club',
    category: 'Student Life',
    tagline: 'Campus events and student community',
    image: '/assets/img/pics/msp.jpg',
    imagePublicId: '',
    imageFit: 'contain',
    status: 'open',
    seats: 28,
    members: 20,
    applicants: 7,
    description: 'Supports student engagement, community building, and collaborative campus initiatives.',
    requirements: 'Leadership, initiative, and a service mindset.',
    applicationIntro: '',
    applicationFields: [],
    sponsors: [],
    booths: []
  },
  {
    id: 10,
    name: 'Gamers Legacy',
    committee: 'Gamers Legacy Club',
    category: 'Gaming & Esports',
    tagline: 'Gaming, competition, and community',
    image: '/assets/img/pics/gamerslegacy.jpg',
    imagePublicId: '',
    imageFit: 'contain',
    status: 'open',
    seats: 24,
    members: 16,
    applicants: 5,
    description: 'A student gaming community for competitions, events, and connecting players across campus.',
    requirements: 'Team spirit, good sportsmanship, and an interest in gaming.',
    applicationIntro: '',
    applicationFields: [],
    sponsors: [],
    booths: []
  },
  {
    id: 11,
    name: 'IHEPC',
    committee: 'International Hepatitis Club',
    category: 'Health Awareness',
    tagline: 'Hepatitis awareness and education',
    image: '/assets/img/pics/ihepc.jpg',
    imagePublicId: '',
    imageFit: 'contain',
    status: 'open',
    seats: 20,
    members: 13,
    applicants: 4,
    description: 'Raises awareness and shares educational information about hepatitis and related health topics.',
    requirements: 'Interest in health awareness, education, and community outreach.',
    applicationIntro: '',
    applicationFields: [],
    sponsors: [],
    booths: []
  },
  {
    id: 12,
    name: 'TEDx MIU',
    committee: 'TEDx MIU',
    category: 'Ideas & Events',
    tagline: 'Ideas worth sharing through campus events',
    image: '/assets/img/pics/tedx.jpg',
    imagePublicId: '',
    imageFit: 'contain',
    status: 'open',
    seats: 24,
    members: 17,
    applicants: 6,
    description: 'Organizes independently hosted TED-style events to bring ideas and speakers to the MIU community.',
    requirements: 'Creativity, organization, and an interest in sharing ideas.',
    applicationIntro: '',
    applicationFields: [],
    sponsors: [],
    booths: []
  }
];

const dataDirectory = path.join(__dirname, 'data');
const clubsFile = path.join(dataDirectory, 'clubs.json');
const homepageFile = path.join(dataDirectory, 'homepage.json');
const adminCredentialsFile = path.join(dataDirectory, 'admin.json');
const clubAccountsFile = path.join(dataDirectory, 'club-accounts.json');
const clubViewsFile = path.join(dataDirectory, 'club-views.json');
const eventViewsFile = path.join(dataDirectory, 'event-views.json');
const picsDirectory = path.join(__dirname, 'public', 'assets', 'img', 'pics');

fs.mkdirSync(dataDirectory, { recursive: true });
fs.mkdirSync(picsDirectory, { recursive: true });

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Could not read ${path.basename(filePath)}:`, error.message);
    }
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  const temporaryFile = `${filePath}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(data, null, 2));
  fs.renameSync(temporaryFile, filePath);
}

let clubs = readJsonFile(clubsFile, defaultClubs).map((club, index) => ({
  ...club,
  sortOrder: Number.isFinite(Number(club.sortOrder)) ? Number(club.sortOrder) : index + 1,
  pinned: club.pinned === true && club.status === 'open'
}));
let clubAccounts = readJsonFile(clubAccountsFile, []).map((account) => ({
  ...account,
  role: ['head', 'pr', 'english', 'security', 'sso', 'dean'].includes(account.role) ? account.role : 'president',
  committee: typeof account.committee === 'string' ? account.committee : ''
}));

function writePrivateClubAccountsFile() {
  // Passwords are never stored in plaintext — only the scrypt salt and hash.
  const privateAccounts = clubAccounts.map((account) => {
    const { password, ...rest } = account;
    return rest;
  });
  try {
    writeJsonFile(clubAccountsFile, privateAccounts);
  } catch (error) {
    // MongoDB is the source of truth; cache failure must not turn a confirmed
    // database write into a misleading failure response.
    console.error('Club credential cache update failed:', error.name);
  }
}

let mongoReady = false;

// Important submissions must never be reported as saved unless they were
// actually persisted to MongoDB. When the database is unavailable the client
// gets a clear error and keeps the user's entered data.
function requireLiveDatabase(res) {
  if (mongoReady) return true;
  res.status(503).json({ message: 'This form was not saved. Please try again.' });
  return false;
}
let homepageSettings = readJsonFile(homepageFile, {
  title: 'University Clubs',
  subtitle: 'Explore all clubs and apply to the ones that match your interests.'
});
let adminCredentials = readJsonFile(adminCredentialsFile, null);
let clubViews = readJsonFile(clubViewsFile, {});
let eventViews = readJsonFile(eventViewsFile, {});
let sessionSecret = process.env.ADMIN_SESSION_SECRET || adminCredentials?.sessionSecret || crypto.randomBytes(32).toString('hex');
let adminAuthState = null;

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
const positiveNumber = (value, fallback = 0) => {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

function normalizeApplicationFields(fields) {
  if (!Array.isArray(fields)) return [];

  const usedKeys = new Set();
  return fields.slice(0, 12).flatMap((field, index) => {
    const label = cleanText(field.label, 100);
    let key = String(field.key || `question_${index + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    if (!label) return [];
    if (!key || usedKeys.has(key)) key = `question_${index + 1}`;
    while (usedKeys.has(key)) key = `${key}_${index + 1}`;
    usedKeys.add(key);

    const type = ['text', 'textarea', 'select'].includes(field.type) ? field.type : 'text';
    const options = type === 'select' && Array.isArray(field.options)
      ? [...new Set(field.options.map((option) => cleanText(option, 100)).filter(Boolean))].slice(0, 20)
      : [];
    if (type === 'select' && options.length < 2) return [];

    return [{ key, label, type, required: field.required === true, options }];
  });
}

async function makeClub(payload, existing, id) {
  const status = ['open', 'opening-soon', 'full', 'closed'].includes(payload.status) ? payload.status : 'open';
  const club = {
    id,
    sortOrder: existing?.sortOrder ?? id,
    archivedAt: existing?.archivedAt || null,
    pinned: status === 'open' && payload.pinned === true,
    name: cleanText(payload.name, 80),
    committee: cleanText(payload.committee, 100),
    category: cleanText(payload.category, 80),
    tagline: cleanText(payload.tagline, 140),
    image: existing?.image || '',
    imagePublicId: existing?.imagePublicId || '',
    imageFit: payload.imageFit === 'cover' ? 'cover' : 'contain',
    status,
    seats: positiveNumber(payload.seats),
    members: positiveNumber(payload.members),
    memberRoster: existing?.memberRoster || [],
    committeeAvailability: existing?.committeeAvailability || [],
    applicants: positiveNumber(payload.applicants),
    description: cleanText(payload.description, 1200),
    requirements: cleanText(payload.requirements, 600),
    applicationIntro: cleanText(payload.applicationIntro, 240),
    applicationFields: normalizeApplicationFields(payload.applicationFields ?? existing?.applicationFields)
  };

  if (!club.name || !club.committee || !club.category || !club.tagline || !club.description || !club.requirements) {
    return null;
  }

  if (payload.imageData) {
    const imageMatch = String(payload.imageData).match(/^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+=*)$/);
    if (!imageMatch) {
      return null;
    }

    const imageBuffer = Buffer.from(imageMatch[2], 'base64');
    if (!imageBuffer.length || imageBuffer.length > 5 * 1024 * 1024) {
      return null;
    }

    if (cloudinaryConfigured) {
      const uploadedImage = await cloudinary.uploader.upload(payload.imageData, {
        folder: 'miu-clubs',
        public_id: `club-${id}`,
        overwrite: true,
        resource_type: 'image'
      });
      club.image = uploadedImage.secure_url;
      club.imagePublicId = uploadedImage.public_id;
    } else {
      const extension = imageMatch[1] === 'jpeg' ? 'jpg' : imageMatch[1];
      const imageName = `club-${id}.${extension}`;
      fs.writeFileSync(path.join(picsDirectory, imageName), imageBuffer);
      club.image = `/assets/img/pics/${imageName}`;
      club.imagePublicId = '';
    }
  }

  return club;
}

function removeManagedImage(imagePath) {
  const fileName = String(imagePath || '').split('/').pop();
  if (!/^club-\d+\.(png|jpg|webp)$/.test(fileName)) return;

  const filePath = path.join(picsDirectory, fileName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

async function removeClubImage(club) {
  if (club?.imagePublicId && cloudinaryConfigured) {
    try {
      await cloudinary.uploader.destroy(club.imagePublicId, { resource_type: 'image' });
    } catch (error) {
      console.error('Cloudinary image cleanup failed:', error.name);
    }
    return;
  }

  removeManagedImage(club?.image);
}

function hasAdminPassword() {
  const hasEnvironmentAccount = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
  const hasStoredAccount = Boolean(adminCredentials?.email && adminCredentials?.salt && adminCredentials?.passwordHash);
  return hasEnvironmentAccount || hasStoredAccount;
}

function isLoopbackRequest(req) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
}

function getConfiguredAdminEmail() {
  return process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD
    ? process.env.ADMIN_EMAIL.trim().toLowerCase()
    : adminCredentials?.email;
}

function matchesScryptPassword(password, salt, storedHash) {
  if (typeof password !== 'string' || !salt || !/^[a-f0-9]{128}$/i.test(String(storedHash || ''))) return false;
  const expectedHash = Buffer.from(storedHash, 'hex');
  const providedHash = crypto.scryptSync(password, salt, expectedHash.length);
  return expectedHash.length === providedHash.length && crypto.timingSafeEqual(expectedHash, providedHash);
}

async function loadAdminAuthState(email = getConfiguredAdminEmail()) {
  if (mongoReady && email) {
    adminAuthState = await AdminAuthState.findOne({ email }).lean();
  }
  return adminAuthState?.email === email ? adminAuthState : null;
}

async function passwordMatches(password) {
  const email = getConfiguredAdminEmail();
  const resetState = await loadAdminAuthState(email);
  if (resetState) return matchesScryptPassword(password, resetState.salt, resetState.passwordHash);

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    if (typeof password !== 'string') return false;
    const expectedHash = crypto.scryptSync(process.env.ADMIN_PASSWORD, 'miu-admin-env', 64);
    const providedHash = crypto.scryptSync(password, 'miu-admin-env', 64);
    return crypto.timingSafeEqual(expectedHash, providedHash);
  }

  return matchesScryptPassword(password, adminCredentials?.salt, adminCredentials?.passwordHash);
}

function emailMatches(email) {
  const expectedEmail = process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD
    ? process.env.ADMIN_EMAIL.trim().toLowerCase()
    : adminCredentials?.email;
  return typeof email === 'string' && email.trim().toLowerCase() === expectedEmail;
}

function createAdminSession() {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const version = Number(adminAuthState?.sessionVersion) || 0;
  const payload = `${expiresAt}.${version}`;
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

async function isAdminSessionValid(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  const adminCookie = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith('miu_admin='));
  if (!adminCookie) return false;

  const parts = adminCookie.slice('miu_admin='.length).split('.');
  const legacy = parts.length === 2;
  const [expiresAt, versionText, signature] = legacy ? [parts[0], '0', parts[1]] : parts;
  const version = Number(versionText);
  const payload = legacy ? String(expiresAt) : `${expiresAt}.${versionText}`;
  const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  if (!/^\d+$/.test(expiresAt || '') || Number(expiresAt) < Date.now() || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
  if (!Number.isInteger(version) || version < 0) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) return false;

  const resetState = await loadAdminAuthState();
  const currentVersion = Number(resetState?.sessionVersion) || 0;
  return version === currentVersion;
}

function setAdminSessionCookie(req, res) {
  const secure = req.secure ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `miu_admin=${createAdminSession()}; Max-Age=28800; HttpOnly; SameSite=Strict; Path=/;${secure}`);
}

async function requireAdmin(req, res, next) {
  if (!hasAdminPassword()) {
    return res.status(503).json({ message: 'Admin password setup is required.' });
  }
  try {
    if (!await isAdminSessionValid(req)) {
      return res.status(401).json({ message: 'Admin login required.' });
    }
  } catch (error) {
    console.error('Admin session validation failed:', error.name);
    return res.status(503).json({ message: 'Admin access is temporarily unavailable.' });
  }
  next();
}

function clubPasswordMatches(password, account) {
  if (typeof password !== 'string') return false;
  if (!account?.salt || !account?.passwordHash) return false;
  const expectedHash = Buffer.from(account.passwordHash, 'hex');
  const providedHash = crypto.scryptSync(password, account.salt, expectedHash.length);
  return expectedHash.length === providedHash.length && crypto.timingSafeEqual(expectedHash, providedHash);
}

function createClubSession(account) {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const encodedEmail = Buffer.from(account.email).toString('base64url');
  const version = Number(account.sessionVersion) || 0;
  const payload = `${account.clubId}.${encodedEmail}.${expiresAt}.${version}`;
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function normalizeInterviewSections(sections) {
  if (!Array.isArray(sections)) return [];
  const usedKeys = new Set();
  return sections.slice(0, 10).flatMap((section, sectionIndex) => {
    const title = cleanText(section?.title, 80);
    if (!title) return [];
    const questions = (Array.isArray(section.questions) ? section.questions : []).slice(0, 12).flatMap((question, questionIndex) => {
      const label = cleanText(question?.label, 100);
      if (!label) return [];
      let key = String(question.key || `question_${sectionIndex + 1}_${questionIndex + 1}`)
        .toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
      if (!key || usedKeys.has(key)) key = `question_${sectionIndex + 1}_${questionIndex + 1}`;
      while (usedKeys.has(key)) key = `${key}_${questionIndex + 1}`;
      usedKeys.add(key);
      const type = ['text', 'textarea', 'select'].includes(question.type) ? question.type : 'text';
      const options = type === 'select' && Array.isArray(question.options)
        ? [...new Set(question.options.map((option) => cleanText(option, 100)).filter(Boolean))].slice(0, 20)
        : [];
      if (type === 'select' && options.length < 2) return [];
      return [{ key, label, type, required: question.required === true, options }];
    });
    let key = String(section.key || `section_${sectionIndex + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    if (!key || key === 'section') key = `section_${sectionIndex + 1}`;
    return [{ key, title, questions }];
  });
}

function getInterviewFormScope(account) {
  return account.role === 'head' ? account.committee : '__president__';
}

async function getClubAccountFromRequest(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  const clubCookie = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith('miu_club='));
  if (!clubCookie) return null;

  const cookieParts = clubCookie.slice('miu_club='.length).split('.');
  const [clubIdText] = cookieParts;
  let expiresText;
  let version = 0;
  let signature;
  let payload;
  let account;

  if (cookieParts.length === 5) {
    const [, encodedEmail, newExpiresText, versionText, newSignature] = cookieParts;
    if (!/^\d+$/.test(versionText || '')) return null;
    let email;
    try {
      email = Buffer.from(encodedEmail, 'base64url').toString('utf8').toLowerCase();
    } catch {
      return null;
    }
    expiresText = newExpiresText;
    version = Number(versionText);
    signature = newSignature;
    payload = `${clubIdText}.${encodedEmail}.${expiresText}.${versionText}`;
    account = clubAccounts.find((item) => item.clubId === Number(clubIdText) && item.email === email);
  } else if (cookieParts.length === 4) {
    const [, encodedEmail, newExpiresText, newSignature] = cookieParts;
    let email;
    try {
      email = Buffer.from(encodedEmail, 'base64url').toString('utf8').toLowerCase();
    } catch {
      return null;
    }
    expiresText = newExpiresText;
    signature = newSignature;
    payload = `${clubIdText}.${encodedEmail}.${expiresText}`;
    account = clubAccounts.find((item) => item.clubId === Number(clubIdText) && item.email === email);
  } else if (cookieParts.length === 3) {
    // Accept existing president sessions until their normal expiry.
    const [, legacyExpiresText, legacySignature] = cookieParts;
    expiresText = legacyExpiresText;
    signature = legacySignature;
    payload = `${clubIdText}.${expiresText}`;
    account = clubAccounts.find((item) => item.clubId === Number(clubIdText) && item.role !== 'head');
  } else {
    return null;
  }

  if (!/^\d+$/.test(clubIdText || '') || !/^\d+$/.test(expiresText || '')
    || Number(expiresText) < Date.now() || !/^[a-f0-9]{64}$/.test(signature || '') || !account) return null;

  const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) return null;
  if (mongoReady) {
    const storedAccount = await ClubAccount.findOne({ clubId: Number(clubIdText), email: account.email }).lean();
    if (!storedAccount || Number(storedAccount.sessionVersion) !== version) return null;
    const accountIndex = clubAccounts.findIndex((item) => item.clubId === storedAccount.clubId && item.email === storedAccount.email);
    if (accountIndex >= 0) clubAccounts[accountIndex] = storedAccount;
    return storedAccount;
  }
  if (Number(account.sessionVersion || 0) !== version) return null;
  return account;
}

function setClubSessionCookie(req, res, account) {
  const secure = req.secure ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `miu_club=${createClubSession(account)}; Max-Age=28800; HttpOnly; SameSite=Strict; Path=/;${secure}`);
}

async function requireClubAuth(req, res, next) {
  try {
    const account = await getClubAccountFromRequest(req);
    if (!account) return res.status(401).json({ message: 'Club login required.' });
    req.clubAccount = account;
    next();
  } catch (error) {
    console.error('Club session validation failed:', error.name);
    res.status(503).json({ message: 'Club access is temporarily unavailable.' });
  }
}

function createStudentSession(account) {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const encodedEmail = Buffer.from(account.email).toString('base64url');
  const version = Number(account.sessionVersion) || 0;
  const payload = `${encodedEmail}.${expiresAt}.${version}`;
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function secureCookieSuffix(req) {
  return req.secure || process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL) ? ' Secure;' : '';
}

function setStudentSessionCookie(req, res, account) {
  const secure = secureCookieSuffix(req);
  res.setHeader('Set-Cookie', `miu_student=${createStudentSession(account)}; Max-Age=2592000; HttpOnly; SameSite=Strict; Path=/;${secure}`);
}

// Count unique accounts that have successfully signed in. Tracking errors never
// interrupt authentication; the admin card reports accounts, not live sessions.
async function recordSuccessfulSignIn(accountType, emailValue) {
  const email = String(emailValue || '').trim().toLowerCase();
  if (!email) return;
  const lastLoginAt = new Date();
  try {
    if (accountType === 'admin') {
      if (mongoReady) {
        adminAuthState = await AdminAuthState.findOneAndUpdate(
          { email }, { $set: { lastLoginAt } }, { new: true }
        ).lean() || adminAuthState;
      }
      return;
    }
    if (accountType === 'club') {
      if (mongoReady) {
        await ClubAccount.updateOne({ email }, { $set: { lastLoginAt } });
      } else {
        const account = clubAccounts.find((item) => item.email === email);
        if (account) {
          account.lastLoginAt = lastLoginAt.toISOString();
          writePrivateClubAccountsFile();
        }
      }
      return;
    }
    if (accountType === 'student' && mongoReady) {
      await StudentAccount.updateOne({ email }, { $set: { lastLoginAt } });
    }
  } catch (error) {
    console.error('Successful sign-in tracking failed:', error.name);
  }
}

function getVisitorToken(req) {
  const cookie = String(req.headers.cookie || '').match(/(?:^|;\s*)miu_visitor=([a-f0-9-]{36})(?:;|$)/i);
  return cookie?.[1] || crypto.randomUUID();
}

function getVisitorDevice(req) {
  const userAgent = String(req.headers['user-agent'] || '').toLowerCase();
  const deviceType = /ipad|tablet/.test(userAgent) ? 'tablet'
    : /mobile|iphone|ipod|android/.test(userAgent) ? 'mobile'
    : userAgent ? 'desktop' : 'unknown';
  return deviceType;
}

function getVisitorTrackingSecret() {
  return process.env.VISITOR_TRACKING_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.MONGO_URI || sessionSecret;
}

async function identifySiteVisitor(req) {
  try {
    if (await isAdminSessionValid(req)) {
      return { accountType: 'admin', accountEmail: getConfiguredAdminEmail() || '', accountName: 'Global Admin', accountLabel: 'Administrator' };
    }
    const clubAccount = await getClubAccountFromRequest(req);
    if (clubAccount) {
      const club = clubs.find((item) => Number(item.id) === Number(clubAccount.clubId));
      const roleLabels = { president: 'Club president', head: 'Committee head', pr: 'PR', english: 'English', security: 'Security Office', sso: 'SSO', dean: 'Dean' };
      const role = roleLabels[clubAccount.role] || 'Club account';
      return {
        accountType: 'club', accountEmail: clubAccount.email,
        accountName: club?.name || 'Club account',
        accountLabel: clubAccount.committee ? `${role} · ${clubAccount.committee}` : role
      };
    }
    const student = await getStudentAccountFromRequest(req);
    if (student) {
      return { accountType: 'student', accountEmail: student.email, accountName: student.name || 'Student', accountLabel: 'Student account' };
    }
  } catch (error) {
    console.error('Visitor identity check failed:', error.name);
  }
  return { accountType: 'guest', accountEmail: '', accountName: '', accountLabel: 'Not signed in' };
}

function getVisitorIpHash(req) {
  const forwarded = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || req.ip || req.socket?.remoteAddress || '';
  if (!address || address === 'unknown') return '';
  const normalizedAddress = address.startsWith('::ffff:') ? address.slice(7) : address;
  return crypto.createHmac('sha256', getVisitorTrackingSecret()).update(`visitor-ip:${normalizedAddress}`).digest('hex');
}

app.post('/api/site/visitor-ping', async (req, res) => {
  if (!mongoReady || mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'Visitor analytics are temporarily unavailable.' });
  }
  const visitorToken = getVisitorToken(req);
  const visitorId = crypto.createHmac('sha256', getVisitorTrackingSecret())
    .update(`visitor-token:${visitorToken}`).digest('hex');
  const ipHash = getVisitorIpHash(req);
  const deviceType = getVisitorDevice(req);
  const identity = await identifySiteVisitor(req);
  const now = new Date();
  try {
    const visitorUpdate = {
      $setOnInsert: { firstSeenAt: now },
      $set: { lastSeenAt: now, deviceType, ...identity }
    };
    const writes = [SiteVisitor.updateOne({ visitorId }, visitorUpdate, { upsert: true })];
    if (ipHash) writes.push(SiteNetwork.updateOne(
      { ipHash },
      { $setOnInsert: { firstSeenAt: now }, $set: { lastSeenAt: now } },
      { upsert: true }
    ));
    await Promise.all(writes);
    // Merge records created before visitor tokens were hashed so one browser
    // does not appear twice after the tracking format changes.
    if (visitorToken !== visitorId) await SiteVisitor.deleteOne({ visitorId: visitorToken });
    const secure = secureCookieSuffix(req);
    res.setHeader('Set-Cookie', `miu_visitor=${visitorToken}; Max-Age=31536000; HttpOnly; SameSite=Lax; Path=/;${secure}`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(204).end();
  } catch (error) {
    console.error('Visitor analytics update failed:', error.name);
    res.status(503).json({ message: 'Visitor analytics are temporarily unavailable.' });
  }
});

async function getStudentAccountFromRequest(req) {
  if (!mongoReady) return null;
  const cookie = String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('miu_student='));
  if (!cookie) return null;
  const parts = cookie.slice('miu_student='.length).split('.');
  if (parts.length !== 4) return null;
  const [encodedEmail, expiresText, versionText, signature] = parts;
  if (!/^\d+$/.test(expiresText) || Number(expiresText) < Date.now() || !/^\d+$/.test(versionText) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const payload = `${encodedEmail}.${expiresText}.${versionText}`;
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return null;
  let email;
  try { email = Buffer.from(encodedEmail, 'base64url').toString('utf8').toLowerCase(); } catch { return null; }
  const account = await StudentAccount.findOne({ email }).select('email name sessionVersion').lean();
  return account && Number(account.sessionVersion || 0) === Number(versionText) ? account : null;
}

async function requireStudentAuth(req, res, next) {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Student sign-in is temporarily unavailable.' });
    const account = await getStudentAccountFromRequest(req);
    if (!account) return res.status(401).json({ message: 'Sign in with your verified MIU account to check in.' });
    req.studentAccount = account;
    next();
  } catch (error) {
    console.error('Student session validation failed:', error.name);
    res.status(503).json({ message: 'Student sign-in is temporarily unavailable.' });
  }
}

let googleSigningKeys = [];
let googleSigningKeysExpiresAt = 0;

async function getGoogleSigningKey(kid, forceRefresh = false) {
  if (forceRefresh || Date.now() >= googleSigningKeysExpiresAt || !googleSigningKeys.length) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('GOOGLE_KEYS_UNAVAILABLE');
    const payload = await response.json();
    googleSigningKeys = Array.isArray(payload.keys) ? payload.keys : [];
    googleSigningKeysExpiresAt = Date.now() + 60 * 60 * 1000;
  }
  return googleSigningKeys.find((key) => key.kid === kid && key.kty === 'RSA' && key.use === 'sig') || null;
}

async function verifyGoogleStudentCredential(credential, expectedNonce) {
  const parts = String(credential || '').split('.');
  if (parts.length !== 3 || !expectedNonce) throw new Error('GOOGLE_CREDENTIAL_INVALID');
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { throw new Error('GOOGLE_CREDENTIAL_INVALID'); }
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!clientId || header.alg !== 'RS256' || !header.kid) throw new Error('GOOGLE_CREDENTIAL_INVALID');
  let key = await getGoogleSigningKey(header.kid);
  if (!key) key = await getGoogleSigningKey(header.kid, true);
  if (!key) throw new Error('GOOGLE_CREDENTIAL_INVALID');
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(crypto.createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) {
    throw new Error('GOOGLE_CREDENTIAL_INVALID');
  }
  const audienceValid = claims.aud === clientId || (Array.isArray(claims.aud) && claims.aud.includes(clientId));
  const issuerValid = ['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss);
  if (!audienceValid || !issuerValid || Number(claims.exp) * 1000 <= Date.now()
    || Number(claims.iat) * 1000 > Date.now() + 60_000 || claims.nonce !== expectedNonce
    || claims.email_verified !== true || String(claims.hd || '').toLowerCase() !== 'miuegypt.edu.eg'
    || !/^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/i.test(String(claims.email || ''))
    || typeof claims.sub !== 'string' || !claims.sub) {
    throw new Error('GOOGLE_ACCOUNT_NOT_ALLOWED');
  }
  return { email: claims.email.toLowerCase(), name: cleanText(claims.name, 160), googleSub: claims.sub };
}

function requestCookie(req, name) {
  const prefix = `${name}=`;
  return String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) || '';
}

let applications = [
  {
    id: 1,
    studentName: 'Mohamed Medhat',
    email: 'mohamed2056794@miuegypt.edu.eg',
    universityId: '2026-05794',
    major: 'Electronics and Communication Engineering',
    phone: '01023311662',
    slot: 'Saturday 1:00 PM - 1:10 PM',
    clubId: 1,
    committee: 'Innovation and Technology Committee',
    age: '20',
    motivation: 'I want to learn more about tech projects and work with creative teams.',
    notes: 'Strong interest in technology and innovation.',
    rating: 4,
    status: 'pending',
    photo: ''
  },
  {
    id: 2,
    studentName: 'Mahmoud Hefny',
    email: 'mahmoud2406700@miuegypt.edu.eg',
    universityId: '26-06700',
    major: 'Computer Science',
    phone: '01080243466',
    slot: 'Sunday 2:30 PM - 2:40 PM',
    clubId: 1,
    committee: 'Innovation and Technology Committee',
    age: '21',
    motivation: 'I would like to gain experience in product thinking and team collaborations.',
    notes: 'Good technical background and communication skills.',
    rating: 4,
    status: 'accepted',
    photo: ''
  },
  {
    id: 3,
    studentName: 'Omar Mohamed',
    email: 'omar2607942@miuegypt.edu.eg',
    universityId: '26-07942',
    major: 'Computer Science',
    phone: '01092042401',
    slot: 'Tuesday 11:00 AM - 11:10 AM',
    clubId: 1,
    committee: 'Innovation and Technology Committee',
    age: '19',
    motivation: 'I want to contribute to coding projects and improve my problem-solving skills.',
    notes: 'Promising candidate with strong curiosity.',
    rating: 3,
    status: 'pending',
    photo: ''
  },
  {
    id: 4,
    studentName: 'Sarah Ali',
    email: 'sarahali@miuegypt.edu.eg',
    universityId: '26-08422',
    major: 'Marketing',
    phone: '01045558011',
    slot: 'Wednesday 9:00 AM - 9:15 AM',
    clubId: 4,
    committee: 'PR Committee',
    age: '20',
    motivation: 'I am passionate about communication and public engagement.',
    notes: 'Excellent presentation and media handling skills.',
    rating: 5,
    status: 'pending',
    photo: ''
  }
];

function toApiRecord(record) {
  const plainRecord = typeof record.toObject === 'function' ? record.toObject() : record;
  const { _id, __v, createdAt, updatedAt, managementTokenHash, ...apiRecord } = plainRecord;
  return apiRecord;
}

function toPublicClubRecord(record) {
  const { memberRoster, archivedAt, ...publicRecord } = toApiRecord(record);
  return publicRecord;
}

app.use('/api/ask-ai', createAskAiRouter({
  getPublicClubs: async () => {
    const records = mongoReady
      ? await Club.find({ archivedAt: null })
        .select('id sortOrder name committee category tagline description requirements applicationIntro status committeeAvailability events posts')
        .sort({ sortOrder: 1, id: 1 }).lean()
      : clubs.filter((club) => !club.archivedAt);
    return records.map(toPublicClubRecord);
  }
}));

const MY_FORM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MY_FORM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{12}$/i;
const myFormAccessAttempts = new Map();

function normalizeMyFormToken(token) {
  const value = String(token || '').trim();
  return MY_FORM_CODE_PATTERN.test(value) ? value.toUpperCase() : value;
}

function hashMyFormToken(token) {
  return crypto.createHash('sha256').update(normalizeMyFormToken(token)).digest('hex');
}

function generateMyFormCode() {
  return Array.from(crypto.randomBytes(12), (byte) => MY_FORM_CODE_ALPHABET[byte & 31]).join('');
}

function limitMyFormAccessAttempts(req, res, next) {
  const token = getMyFormToken(req);
  if (applications.some((application) => canManageMyForm(application, token))) return next();

  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 30;
  let attempts = myFormAccessAttempts.get(key);
  if (!attempts || now - attempts.startedAt >= windowMs) {
    attempts = { startedAt: now, count: 0 };
    myFormAccessAttempts.set(key, attempts);
  }
  if (attempts.count >= maxAttempts) {
    return res.status(429).json({ message: 'Too many My Forms attempts. Try again in 15 minutes.' });
  }
  attempts.count += 1;
  next();
}

function getMyFormToken(req) {
  const authorization = req.get('authorization') || '';
  const bearer = authorization.match(/^Bearer\s+([A-HJ-NP-Z2-9]{12}|[A-Za-z0-9_-]{32,})$/i);
  const bodyToken = typeof req.body?.managementToken === 'string' ? req.body.managementToken : '';
  const token = bearer?.[1] || bodyToken;
  return MY_FORM_CODE_PATTERN.test(token) || /^[A-Za-z0-9_-]{32,}$/.test(token) ? normalizeMyFormToken(token) : '';
}

function canManageMyForm(application, token) {
  if (!application || typeof token !== 'string'
    || (!MY_FORM_CODE_PATTERN.test(token) && !/^[A-Za-z0-9_-]{32,}$/.test(token))) return false;
  const storedHash = application.managementTokenHash || '';
  if (!/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const candidateHash = hashMyFormToken(token);
  return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(candidateHash, 'hex'));
}

async function initializeMongoData() {
  await Promise.all([
    Club.init(), Application.init(), SiteSetting.init(), SiteVisitor.init(), SiteNetwork.init(), EventRegistration.init(), LoginAttempt.init(),
    PasswordResetToken.init(), PasswordRecoveryRateLimit.init(), AdminAuthState.init()
  ]);
  const clubAccountCollectionName = ClubAccount.collection.collectionName;
  const accountCollectionExists = await mongoose.connection.db
    .listCollections({ name: clubAccountCollectionName }, { nameOnly: true }).hasNext();
  if (accountCollectionExists) {
    const accountIndexes = await ClubAccount.collection.indexes();
    const uniqueClubIdIndex = accountIndexes.find((index) => index.unique && index.key?.clubId === 1);
    if (uniqueClubIdIndex) await ClubAccount.collection.dropIndex(uniqueClubIdIndex.name);
  }
  await ClubAccount.createIndexes();

  if (await Club.countDocuments() === 0) {
    await Club.insertMany(clubs);
  }
  if (await Application.countDocuments() === 0) {
    await Application.insertMany(applications);
  }
  if (clubAccounts.length) {
    await ClubAccount.bulkWrite(clubAccounts.map(({ clubId, email, salt, passwordHash, role, committee }) => ({
      updateOne: {
        filter: { clubId, email },
        update: { $setOnInsert: { clubId, email, salt, passwordHash, role: ['head', 'pr', 'english', 'security', 'sso', 'dean'].includes(role) ? role : 'president', committee: committee || '' } },
        upsert: true
      }
    })));
  }
  await ClubAccount.updateMany(
    { role: { $exists: false } },
    { $set: { role: 'president', committee: '' } }
  );
  await ClubAccount.updateMany(
    { sessionVersion: { $exists: false } },
    { $set: { sessionVersion: 0 } }
  );
  adminAuthState = await AdminAuthState.findOne().lean();

  let homepageRecord = await SiteSetting.findOne({ key: 'homepage' });
  if (!homepageRecord) {
    homepageRecord = await SiteSetting.create({ key: 'homepage', ...homepageSettings });
  }
  homepageSettings = { title: homepageRecord.title, subtitle: homepageRecord.subtitle };

  // Legacy feed posts used the generic "post" type; normalize them to "feed".
  await ContentRequest.updateMany({ type: 'post' }, { $set: { type: 'feed' } });

  // Permits previously sent from Security directly to the Dean need the PR's final approval.
  const permitsAwaitingDean = await ContentRequest.find({ type: 'entry_permit', status: 'pending_dean' });
  for (const record of permitsAwaitingDean) {
    record.status = 'pending_pr';
    record.resubmitTo = 'pending_pr';
    record.clubNotice = 'Security Office review is complete. Waiting for PR final approval.';
    appendWorkflowEvent(record, 'security', 'sent_to_pr_final_review', 'pending_dean', 'pending_pr');
    await record.save();
  }

  clubs = (await Club.find().sort({ sortOrder: 1, id: 1 }).lean()).map((record, index) => ({
    ...toApiRecord(record),
    sortOrder: Number.isFinite(Number(record.sortOrder)) ? Number(record.sortOrder) : index + 1,
    pinned: record.pinned === true && record.status === 'open'
  }));
  applications = await Application.find().sort({ id: 1 }).lean();
  clubAccounts = (await ClubAccount.find().sort({ clubId: 1, role: 1, committee: 1 }).lean()).map((account) => ({
    ...toApiRecord(account),
    role: ['head', 'pr', 'english', 'security', 'sso', 'dean'].includes(account.role) ? account.role : 'president',
    committee: account.committee || ''
  }));
}

function requireClubPresident(req, res, next) {
  if (req.clubAccount.role !== 'president') {
    return res.status(403).json({ message: 'Only the club president can manage this.' });
  }
  next();
}

function accountCanReviewApplication(account, application) {
  return application.clubId === account.clubId
    && (account.role !== 'head' || application.committee === account.committee);
}

app.get('/api/clubs', async (req, res) => {
  try {
    const records = mongoReady
      ? (await Club.find({ archivedAt: null }).sort({ sortOrder: 1, id: 1 }).lean()).map(toPublicClubRecord)
      : clubs.filter((club) => !club.archivedAt).map(toPublicClubRecord);
    res.json(records);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

// Track a club view (called when a user opens a club's detail view).
app.post('/api/clubs/:id/view', (req, res) => {
  const clubId = Number(req.params.id);
  const club = clubs.find((item) => Number(item.id) === clubId);
  if (!club) return res.status(404).json({ message: 'Club not found.' });
  clubViews[String(clubId)] = Number(clubViews[String(clubId)] || 0) + 1;
  try {
    writeJsonFile(clubViewsFile, clubViews);
  } catch (error) {
    console.error('Could not persist club views:', error.message);
  }
  res.json({ clubId, views: clubViews[String(clubId)] });
});

app.get('/api/admin/session', async (req, res) => {
  try {
    res.json({
      configured: hasAdminPassword(),
      authenticated: hasAdminPassword() && await isAdminSessionValid(req)
    });
  } catch (error) {
    console.error('Admin session validation failed:', error.name);
    res.status(503).json({ message: 'Admin access is temporarily unavailable.' });
  }
});

// Count an event detail open as an interest signal (not a unique visitor count).
app.post('/api/events/:clubId/:eventIndex/view', async (req, res) => {
  const clubId = Number(req.params.clubId);
  const eventIndex = Number(req.params.eventIndex);
  if (!Number.isInteger(clubId) || !Number.isInteger(eventIndex) || clubId < 1 || eventIndex < 0) {
    return res.status(400).json({ message: 'This event could not be found.' });
  }
  try {
    const club = mongoReady
      ? await Club.findOne({ id: clubId, archivedAt: null }).select('events').lean()
      : clubs.find((item) => Number(item.id) === clubId && !item.archivedAt);
    if (!club?.events?.[eventIndex]) return res.status(404).json({ message: 'This event could not be found.' });
    const eventRequestId = Number(club.events[eventIndex]?.requestId);
    const key = eventRequestId > 0 ? `${clubId}:request:${eventRequestId}` : `${clubId}:${eventIndex}`;
    eventViews[key] = Number(eventViews[key] || 0) + 1;
    writeJsonFile(eventViewsFile, eventViews);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ views: eventViews[key] });
  } catch (error) {
    console.error('Could not track event view:', error.name);
    res.status(503).json({ message: 'Could not record this event view.' });
  }
});

app.get('/api/club-auth/session', async (req, res) => {
  let account;
  try {
    account = await getClubAccountFromRequest(req);
  } catch (error) {
    console.error('Club session validation failed:', error.name);
    return res.status(503).json({ message: 'Club access is temporarily unavailable.' });
  }
  if (account && ['pr', 'english', 'security', 'sso', 'dean'].includes(account.role)) {
    return res.json({
      configured: clubAccounts.length > 0,
      authenticated: true,
      club: { id: 0, name: account.role.toUpperCase(), image: '/assets/img/pics/logo.svg.png', role: account.role, committee: '' }
    });
  }
  const club = account && clubs.find((item) => item.id === account.clubId);
  res.json({
    configured: clubAccounts.length > 0,
    authenticated: Boolean(account && club),
    club: account && club ? {
      id: club.id,
      name: club.name,
      image: club.image,
      role: account.role,
      committee: account.committee || ''
    } : null
  });
});

app.post('/api/club-auth/login', async (req, res) => {
  if (await checkLoginSourceLock(req, res)) return;
  if (!clubAccounts.length) {
    return res.status(503).json({ message: 'Club accounts are not seeded yet. Run npm run seed.' });
  }

  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  let account;
  try {
    account = mongoReady
      ? await ClubAccount.findOne({ email }).lean()
      : clubAccounts.find((item) => item.email === email);
  } catch (error) {
    console.error('Club login failed:', error.name);
    return res.status(503).json({ message: 'Club login is temporarily unavailable.' });
  }
  if (!account || !clubPasswordMatches(req.body.password, account)) {
    if (await countLoginSourceFailure(req, res)) return;
    return res.status(401).json({ message: 'Incorrect club email or password.' });
  }

  if (!await clearLoginSourceFailures(req, res)) return;
  await recordSuccessfulSignIn('club', account.email);
  setClubSessionCookie(req, res, account);
  const committeeRoles = ['pr', 'english', 'security', 'sso', 'dean'];
  const club = committeeRoles.includes(account.role)
    ? { id: 0, name: account.role.toUpperCase(), image: '/assets/img/pics/logo.svg.png', role: account.role, committee: '' }
    : clubs.find((item) => item.id === account.clubId);
  res.json({
    authenticated: true,
    club: club ? {
      id: club.id,
      name: club.name,
      image: club.image,
      role: account.role,
      committee: account.committee || club.committee || ''
    } : null
  });
});

app.post('/api/club-auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'miu_club=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/');
  res.status(204).end();
});

app.get('/api/club/dashboard', requireClubAuth, (req, res) => {
  const club = clubs.find((item) => item.id === req.clubAccount.clubId);
  if (!club) return res.status(404).json({ message: 'Club not found.' });
  res.json({
    id: club.id,
    name: club.name,
    committee: req.clubAccount.committee || club.committee,
    role: req.clubAccount.role,
    image: club.image
  });
});

// Public event registration — saved to MongoDB, one registration per email per event.
app.post('/api/events/:clubId/:eventIndex/registrations', async (req, res) => {
  const clubId = Number(req.params.clubId);
  const eventIndex = Number(req.params.eventIndex);
  if (!Number.isInteger(clubId) || !Number.isInteger(eventIndex) || clubId < 1 || eventIndex < 0) {
    return res.status(400).json({ message: 'This event could not be found.' });
  }
  const name = cleanText(req.body.name, 160);
  const email = cleanText(req.body.email, 254).toLowerCase();
  if (!name) return res.status(400).json({ message: 'Enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid university email.' });
  }

  try {
    if (!requireLiveDatabase(res)) return;
    const club = await Club.findOne({ id: clubId, archivedAt: null }).lean();
    if (!club) return res.status(404).json({ message: 'Club not found.' });
    const event = Array.isArray(club.events) ? club.events[eventIndex] : null;
    if (!event) return res.status(404).json({ message: 'This event could not be found.' });

    const existing = await EventRegistration.findOne({ clubId, eventIndex, email }).lean();
    if (existing) {
      return res.status(409).json({ message: 'This email is already registered for the event.' });
    }

    const registration = await EventRegistration.create({
      id: Date.now(),
      clubId,
      eventIndex,
      eventTitle: cleanText(event.title, 140),
      name,
      email
    });
    res.status(201).json({ message: 'You are registered for this event.', registrationId: registration.id });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This email is already registered for the event.' });
    }
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'This form was not saved. Please try again.' });
  }
});

// Attendance sessions are backed by MongoDB. Only a club president or an IT
// committee head can create sessions and review the resulting attendance.
app.get('/api/club/attendance-events', requireClubAuth, async (req, res) => {
  if (!canManageAttendance(req.clubAccount)) {
    return res.status(403).json({ message: 'Attendance tools are available to club presidents and the IT head.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const filter = req.clubAccount.role === 'president' ? { id: req.clubAccount.clubId, archivedAt: null } : { archivedAt: null };
    const records = await Club.find(filter).select('id name events booths').sort({ name: 1 }).lean();
    res.setHeader('Cache-Control', 'no-store');
    res.json(records.flatMap((club) => ['event', 'booth'].flatMap((itemType) => {
      const items = itemType === 'event' ? club.events : club.booths;
      return (Array.isArray(items) ? items : []).flatMap((item, itemIndex) => {
        const title = cleanText(item.title || item.boothName, 140);
        if (!title) return [];
        const date = cleanText(item.date || item.boothOpenDate, 80);
        if (!isActivityScheduledToday(date)) return [];
        const requestId = Number(item.requestId);
        // Keep legacy array-index IDs in separate ranges. This also avoids
        // collisions with installations that still have the older unique
        // index that did not include itemType.
        const legacyOffset = itemType === 'booth' ? 1_000_000 : 0;
        const eventRequestId = Number.isInteger(requestId) && requestId > 0 ? requestId : -(legacyOffset + itemIndex + 1);
        return [{
          clubId: club.id,
          clubName: club.name,
          itemType,
          eventRequestId,
          title,
          date,
          time: cleanText(item.time || item.boothOpenTime, 80),
          location: cleanText(item.location || item.boothLocation, 160)
        }];
      });
    })));
  } catch (error) {
    console.error('Attendance events could not be loaded:', error.name);
    res.status(503).json({ message: 'Could not load events from the database.' });
  }
});

app.post('/api/club/attendance-sessions', requireClubAuth, async (req, res) => {
  if (!canManageAttendance(req.clubAccount)) {
    return res.status(403).json({ message: 'Attendance tools are available to club presidents and the IT head.' });
  }
  const clubId = Number(req.body.clubId);
  const itemType = ['event', 'booth'].includes(req.body.itemType) ? req.body.itemType : 'event';
  const eventRequestId = Number(req.body.eventRequestId);
  if (!Number.isInteger(clubId) || !Number.isInteger(eventRequestId)) {
    return res.status(400).json({ message: 'Choose a valid event.' });
  }
  if (req.clubAccount.role === 'president' && clubId !== Number(req.clubAccount.clubId)) {
    return res.status(403).json({ message: 'You can only create attendance QR codes for your own club.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const club = await Club.findOne({ id: clubId, archivedAt: null }).select('id name events booths').lean();
    const items = itemType === 'event' ? club?.events : club?.booths;
    let selectedEvent;
    if (eventRequestId > 0) {
      selectedEvent = items?.find((item) => Number(item.requestId) === eventRequestId);
    } else {
      const legacyOffset = itemType === 'booth' ? 1_000_000 : 0;
      const itemIndex = -eventRequestId - legacyOffset - 1;
      selectedEvent = itemIndex >= 0 ? items?.[itemIndex] : null;
      if (selectedEvent?.requestId) selectedEvent = null;
    }
    const title = cleanText(selectedEvent?.title || selectedEvent?.boothName, 140);
    if (!club || !selectedEvent || !title) {
      return res.status(404).json({ message: 'This published event or booth could not be found.' });
    }
    const eventDate = cleanText(selectedEvent.date || selectedEvent.boothOpenDate, 80);
    if (!isActivityScheduledToday(eventDate)) {
      return res.status(409).json({ message: 'Attendance QR codes can only be created on the event or booth date.' });
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const session = await AttendanceSession.create({
      clubId,
      itemType,
      eventRequestId,
      eventTitle: title,
      eventDate,
      eventTime: cleanText(selectedEvent.time || selectedEvent.boothOpenTime, 80),
      tokenHash: attendanceTokenHash(token),
      createdBy: req.clubAccount.email
    });
    try {
      await AttendanceSession.updateMany({ clubId, itemType, eventRequestId, active: true, _id: { $ne: session._id } }, { $set: { active: false } });
    } catch (error) {
      await AttendanceSession.deleteOne({ _id: session._id }).catch(() => {});
      throw error;
    }
    const { _id, __v, tokenHash, ...safeSession } = session.toObject();
    res.status(201).json({ session: safeSession, token });
  } catch (error) {
    console.error('Attendance session could not be created:', error.name);
    res.status(503).json({ message: 'The QR code was not created. No attendance data was saved.' });
  }
});

const ATTENDANCE_QR_PERIOD_MS = 20_000;
const ATTENDANCE_SCAN_PROOF_TTL_MS = 3 * 60 * 1000;

function attendanceQrChallenge(token) {
  const expiresAt = Date.now() + ATTENDANCE_QR_PERIOD_MS;
  const signature = crypto.createHmac('sha256', sessionSecret)
    .update(`${attendanceTokenHash(token)}.${expiresAt}`).digest('base64url');
  return { code: `${expiresAt}.${signature}`, expiresAt };
}

function isCurrentAttendanceQrChallenge(token, code) {
  const [expiresText, signature] = String(code || '').split('.');
  if (!/^\d+$/.test(expiresText || '') || !/^[A-Za-z0-9_-]{40,50}$/.test(signature || '')) return false;
  const expiresAt = Number(expiresText);
  if (expiresAt <= Date.now() || expiresAt > Date.now() + ATTENDANCE_QR_PERIOD_MS) return false;
  const expected = crypto.createHmac('sha256', sessionSecret)
    .update(`${attendanceTokenHash(token)}.${expiresAt}`).digest('base64url');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function setAttendanceScanProofCookie(req, res, sessionId) {
  const expiresAt = Date.now() + ATTENDANCE_SCAN_PROOF_TTL_MS;
  const payload = `${sessionId}.${expiresAt}`;
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  const secure = secureCookieSuffix(req);
  res.setHeader('Set-Cookie', `miu_attendance_scan=${payload}.${signature}; Max-Age=180; HttpOnly; SameSite=Strict; Path=/api/attendance/;${secure}`);
}

function hasAttendanceScanProof(req, sessionId) {
  const cookie = String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('miu_attendance_scan='));
  if (!cookie) return false;
  const parts = cookie.slice('miu_attendance_scan='.length).split('.');
  if (parts.length !== 3 || parts[0] !== String(sessionId) || !/^\d+$/.test(parts[1]) || Number(parts[1]) < Date.now() || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(parts[2], 'hex'), Buffer.from(expected, 'hex'));
}

function clearAttendanceScanProofCookie(req, res) {
  const secure = secureCookieSuffix(req);
  res.setHeader('Set-Cookie', `miu_attendance_scan=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/api/attendance/;${secure}`);
}

app.post('/api/club/attendance-qr-challenge', requireClubAuth, async (req, res) => {
  if (!canManageAttendance(req.clubAccount)) return res.status(403).json({ message: 'You cannot create attendance QR codes.' });
  const token = String(req.body.token || '');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return res.status(400).json({ message: 'Attendance session is invalid.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const session = await AttendanceSession.findOne({ tokenHash: attendanceTokenHash(token), active: true }).select('clubId').lean();
    if (!session) return res.status(404).json({ message: 'This attendance session has expired.' });
    if (req.clubAccount.role === 'president' && Number(session.clubId) !== Number(req.clubAccount.clubId)) {
      return res.status(403).json({ message: 'You can only create QR codes for your own club.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(attendanceQrChallenge(token));
  } catch (error) {
    console.error('Attendance QR challenge could not be created:', error.name);
    res.status(503).json({ message: 'A fresh attendance QR code could not be created.' });
  }
});

app.get('/api/club/attendance-records', requireClubAuth, async (req, res) => {
  if (!canManageAttendance(req.clubAccount)) {
    return res.status(403).json({ message: 'Attendance records are available to club presidents and the IT head.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const filter = req.clubAccount.role === 'president' ? { clubId: req.clubAccount.clubId } : {};
    const records = await AttendanceRecord.find(filter).sort({ attendedAt: -1 }).limit(2000).lean();
    const clubIds = [...new Set(records.map((record) => record.clubId))];
    const clubsById = new Map((await Club.find({ id: { $in: clubIds } }).select('id name').lean()).map((club) => [club.id, club.name]));
    res.setHeader('Cache-Control', 'no-store');
    res.json(records.map(({ _id, __v, ...record }) => ({ ...record, clubName: clubsById.get(record.clubId) || '' })));
  } catch (error) {
    console.error('Attendance records could not be loaded:', error.name);
    res.status(503).json({ message: 'Could not load attendance records from the database.' });
  }
});

function requirePrOrDeanAttendance(req, res) {
  if (!['pr', 'dean'].includes(req.clubAccount?.role)) {
    res.status(403).json({ message: 'Attendance overview is available to PR and Dean accounts.' });
    return false;
  }
  return true;
}

app.get('/api/committee/attendance-overview', requireClubAuth, async (req, res) => {
  if (!requirePrOrDeanAttendance(req, res)) return;
  try {
    if (!requireLiveDatabase(res)) return;
    const [clubs, attendanceRecords] = await Promise.all([
      Club.find({}).select('id name events booths').sort({ name: 1 }).lean(),
      AttendanceRecord.find({}).select('clubId itemType eventRequestId eventTitle eventDate eventTime').sort({ attendedAt: -1 }).limit(5000).lean()
    ]);
    const clubsById = new Map(clubs.map((club) => [Number(club.id), club]));
    const activitiesByKey = new Map();
    clubs.forEach((club) => {
      ['event', 'booth'].forEach((itemType) => {
        const items = itemType === 'event' ? club.events : club.booths;
        (Array.isArray(items) ? items : []).forEach((item, itemIndex) => {
          const title = cleanText(item.title || item.boothName, 140);
          if (!title) return;
          const requestId = Number(item.requestId);
          const legacyOffset = itemType === 'booth' ? 1_000_000 : 0;
          const eventRequestId = Number.isInteger(requestId) && requestId > 0 ? requestId : -(legacyOffset + itemIndex + 1);
          const key = `${club.id}:${itemType}:${eventRequestId}`;
          activitiesByKey.set(key, {
            clubId: club.id,
            clubName: club.name,
            itemType,
            eventRequestId,
            title,
            date: cleanText(item.date || item.boothOpenDate, 80),
            time: cleanText(item.time || item.boothOpenTime, 80)
          });
        });
      });
    });
    attendanceRecords.forEach((record) => {
      const itemType = record.itemType === 'booth' ? 'booth' : 'event';
      const key = `${record.clubId}:${itemType}:${record.eventRequestId}`;
      if (!activitiesByKey.has(key)) {
        activitiesByKey.set(key, {
          clubId: record.clubId,
          clubName: clubsById.get(Number(record.clubId))?.name || `Club ${record.clubId}`,
          itemType,
          eventRequestId: record.eventRequestId,
          title: record.eventTitle || '(Archived activity)',
          date: record.eventDate || '',
          time: record.eventTime || ''
        });
      }
    });
    const knownClubIds = new Set(clubs.map((club) => Number(club.id)));
    attendanceRecords.forEach((record) => {
      if (!knownClubIds.has(Number(record.clubId))) {
        clubsById.set(Number(record.clubId), { id: record.clubId, name: `Club ${record.clubId}` });
        knownClubIds.add(Number(record.clubId));
      }
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      clubs: [...clubsById.values()].map(({ id, name }) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name)),
      activities: [...activitiesByKey.values()].sort((left, right) =>
        left.clubName.localeCompare(right.clubName) || left.title.localeCompare(right.title))
    });
  } catch (error) {
    console.error('Committee attendance filters could not be loaded:', error.name);
    res.status(503).json({ message: 'Could not load attendance filters from the database.' });
  }
});

app.get('/api/committee/attendance-records', requireClubAuth, async (req, res) => {
  if (!requirePrOrDeanAttendance(req, res)) return;
  const query = {};
  if (req.query.clubId && req.query.clubId !== 'all') {
    const clubId = Number(req.query.clubId);
    if (!Number.isSafeInteger(clubId)) return res.status(400).json({ message: 'Choose a valid club.' });
    query.clubId = clubId;
  }
  if (req.query.itemType && req.query.itemType !== 'all') {
    if (!['event', 'booth'].includes(req.query.itemType)) return res.status(400).json({ message: 'Choose an event or booth.' });
    query.itemType = req.query.itemType;
  }
  if (req.query.eventRequestId && req.query.eventRequestId !== 'all') {
    const eventRequestId = Number(req.query.eventRequestId);
    if (!Number.isSafeInteger(eventRequestId) || !query.itemType) return res.status(400).json({ message: 'Choose a valid activity.' });
    query.eventRequestId = eventRequestId;
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const records = await AttendanceRecord.find(query).sort({ attendedAt: -1 }).limit(5000).lean();
    const clubIds = [...new Set(records.map((record) => Number(record.clubId)))];
    const clubsById = new Map((await Club.find({ id: { $in: clubIds } }).select('id name').lean()).map((club) => [Number(club.id), club.name]));
    res.setHeader('Cache-Control', 'no-store');
    res.json(records.map(({ _id, __v, ...record }) => ({
      ...record,
      clubName: clubsById.get(Number(record.clubId)) || `Club ${record.clubId}`
    })));
  } catch (error) {
    console.error('Committee attendance records could not be loaded:', error.name);
    res.status(503).json({ message: 'Could not load attendance records from the database.' });
  }
});

app.get('/api/attendance/:token', async (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return res.status(404).json({ message: 'This attendance QR code is invalid or expired.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const session = await AttendanceSession.findOne({ tokenHash: attendanceTokenHash(token), active: true }).lean();
    if (!session) return res.status(404).json({ message: 'This attendance QR code is invalid or expired.' });
    const hasProof = hasAttendanceScanProof(req, session._id);
    if (!hasProof && !isCurrentAttendanceQrChallenge(token, req.query.code)) {
      return res.status(410).json({ message: 'This QR code has changed. Scan the current code shown by the club.' });
    }
    const club = await Club.findOne({ id: session.clubId }).select('name').lean();
    res.setHeader('Cache-Control', 'no-store');
    if (!hasProof) setAttendanceScanProofCookie(req, res, session._id);
    res.json({
      clubName: club?.name || '',
      itemType: session.itemType || 'event',
      eventTitle: session.eventTitle,
      eventDate: session.eventDate || '',
      eventTime: session.eventTime || ''
    });
  } catch (error) {
    console.error('Attendance QR could not be checked:', error.name);
    res.status(503).json({ message: 'Attendance is temporarily unavailable.' });
  }
});

app.post('/api/attendance/:token', requireStudentAuth, async (req, res) => {
  const token = String(req.params.token || '');
  // Identity always comes from the signed, verified student session. Never
  // trust a name or email supplied by the browser for an attendance record.
  const name = req.studentAccount.name;
  const email = req.studentAccount.email;
  const note = cleanText(req.body.note, 500);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return res.status(404).json({ message: 'This attendance QR code is invalid or expired.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const session = await AttendanceSession.findOne({ tokenHash: attendanceTokenHash(token), active: true }).lean();
    if (!session) return res.status(404).json({ message: 'This attendance QR code is invalid or expired.' });
    if (!hasAttendanceScanProof(req, session._id)) {
      return res.status(410).json({ message: 'Scan the current QR code to confirm attendance.' });
    }
    const itemType = session.itemType || 'event';
    const existing = await AttendanceRecord.findOne({ clubId: session.clubId, itemType, eventRequestId: session.eventRequestId, email }).lean();
    if (existing) {
      clearAttendanceScanProofCookie(req, res);
      return res.status(409).json({ message: 'Attendance is already recorded for this email.' });
    }
    await AttendanceRecord.create({
      sessionId: session._id,
      clubId: session.clubId,
      itemType,
      eventRequestId: session.eventRequestId,
      eventTitle: session.eventTitle,
      eventDate: session.eventDate || '',
      eventTime: session.eventTime || '',
      name,
      email,
      note,
      attendedAt: new Date()
    });
    clearAttendanceScanProofCookie(req, res);
    res.status(201).json({ message: 'Your attendance was recorded.' });
  } catch (error) {
    if (error.code === 11000) {
      clearAttendanceScanProofCookie(req, res);
      return res.status(409).json({ message: 'Attendance is already recorded for this email.' });
    }
    console.error('Attendance was not saved:', error.name);
    res.status(503).json({ message: 'Attendance was not saved. Please try again.' });
  }
});

// Club admins can view their event registrations.
app.get('/api/club/event-registrations', requireClubAuth, async (req, res) => {
  if (!['president', 'head'].includes(req.clubAccount.role)) {
    return res.status(403).json({ message: 'Only club presidents and heads can view registrations.' });
  }
  try {
    const records = mongoReady
      ? await EventRegistration.find({ clubId: req.clubAccount.clubId }).sort({ createdAt: -1 }).lean()
      : [];
    res.setHeader('Cache-Control', 'no-store');
    res.json(records.map((record) => {
      const { _id, __v, ...rest } = record;
      return rest;
    }));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.get('/api/clubs/:id/committees', (req, res) => {
  const clubId = Number(req.params.id);
  if (!clubs.some((club) => club.id === clubId)) return res.status(404).json({ message: 'Club not found.' });
  const committees = [...new Set(clubAccounts
    .filter((account) => account.clubId === clubId && account.role === 'head' && account.committee)
    .map((account) => account.committee))];
  res.json(committees);
});

function getManagedCommittees(clubId) {
  return [...new Set(clubAccounts
    .filter((account) => account.clubId === clubId && account.role === 'head' && account.committee)
    .map((account) => account.committee))].sort((left, right) => left.localeCompare(right));
}

function isItCommitteeHead(account) {
  if (account?.role !== 'head') return false;
  const committee = String(account.committee || '').trim().toLowerCase();
  return /(^|[^a-z])it([^a-z]|$)/.test(committee) || /information technology/.test(committee);
}

function canManageAttendance(account) {
  return account?.role === 'president' || isItCommitteeHead(account);
}

function attendanceTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cairoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isActivityScheduledToday(value) {
  const dateText = cleanText(value, 80);
  if (!dateText) return false;
  const isoDate = dateText.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1] === cairoDateKey();
  const parsed = new Date(dateText);
  return !Number.isNaN(parsed.getTime()) && cairoDateKey(parsed) === cairoDateKey();
}

function getCommitteeAvailability(clubId) {
  const club = clubs.find((item) => item.id === clubId);
  if (!club) return null;
  const saved = new Map((club.committeeAvailability || []).map((item) => [String(item.committee).toLowerCase(), item.status]));
  return getManagedCommittees(clubId).map((committee) => ({
    committee,
    status: ['open', 'full', 'closed'].includes(saved.get(committee.toLowerCase()))
      ? saved.get(committee.toLowerCase())
      : 'open'
  }));
}

function getCommitteeApplicationStatus(club, committee) {
  const setting = (club?.committeeAvailability || []).find((item) =>
    String(item.committee).toLowerCase() === String(committee).toLowerCase());
  return ['open', 'full', 'closed'].includes(setting?.status) ? setting.status : 'open';
}

function normalizeCommitteeAvailability(clubId, entries) {
  if (!Array.isArray(entries)) return null;
  const allowedCommittees = getManagedCommittees(clubId);
  const allowed = new Map(allowedCommittees.map((committee) => [committee.toLowerCase(), committee]));
  const requested = new Map();
  for (const entry of entries) {
    const key = cleanText(entry?.committee, 100).toLowerCase();
    if (!allowed.has(key) || requested.has(key) || !['open', 'full', 'closed'].includes(entry?.status)) return null;
    requested.set(key, entry.status);
  }
  const current = new Map((clubs.find((item) => item.id === clubId)?.committeeAvailability || [])
    .map((item) => [String(item.committee).toLowerCase(), item.status]));
  return allowedCommittees.map((committee) => ({
    committee,
    status: requested.get(committee.toLowerCase()) || current.get(committee.toLowerCase()) || 'open'
  }));
}

app.get('/api/clubs/:id/application-committees', (req, res) => {
  const clubId = Number(req.params.id);
  const availability = getCommitteeAvailability(clubId);
  if (!availability) return res.status(404).json({ message: 'Club not found.' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(availability.map((item) => ({
    ...item,
    selectable: item.status === 'open',
    label: item.status === 'full' ? `${item.committee} (Full)`
      : item.status === 'closed' ? `${item.committee} (Closed)` : item.committee
  })));
});

async function updateCommitteeAvailability(clubId, entries, res) {
  const availability = normalizeCommitteeAvailability(clubId, entries);
  if (!availability) {
    res.status(400).json({ message: 'Choose a valid status for each committee.' });
    return false;
  }
  if (!requireLiveDatabase(res)) return false;
  try {
    const savedClub = await Club.findOneAndUpdate(
      { id: clubId },
      { $set: { committeeAvailability: availability } },
      { new: true, runValidators: true }
    ).lean();
    if (!savedClub) {
      res.status(404).json({ message: 'Club not found.' });
      return false;
    }
    const club = clubs.find((item) => item.id === clubId);
    if (club) club.committeeAvailability = availability;
    res.json({ committees: availability });
    return true;
  } catch (error) {
    console.error('Committee availability update failed:', error.name);
    res.status(503).json({ message: 'Could not update committee availability right now.' });
    return false;
  }
}

app.get('/api/club/committee-availability', requireClubAuth, requireClubPresident, (req, res) => {
  const availability = getCommitteeAvailability(req.clubAccount.clubId);
  if (!availability) return res.status(404).json({ message: 'Club not found.' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(availability);
});

app.put('/api/club/committee-availability', requireClubAuth, requireClubPresident, async (req, res) => {
  await updateCommitteeAvailability(req.clubAccount.clubId, req.body.committees, res);
});

app.get('/api/club/heads', requireClubAuth, requireClubPresident, (req, res) => {
  res.json(clubAccounts
    .filter((account) => account.clubId === req.clubAccount.clubId && account.role === 'head')
    .map(({ email, committee }) => ({ email, committee })));
});

app.get('/api/club/members', requireClubAuth, requireClubPresident, async (req, res) => {
  try {
    const club = mongoReady
      ? await Club.findOne({ id: req.clubAccount.clubId }).select('members memberRoster').lean()
      : clubs.find((item) => item.id === req.clubAccount.clubId);
    if (!club) return res.status(404).json({ message: 'Club not found.' });
    const committees = [...new Set(clubAccounts
      .filter((account) => account.clubId === req.clubAccount.clubId && account.role === 'head' && account.committee)
      .map((account) => account.committee))];
    res.json({ members: Array.isArray(club.memberRoster) ? club.memberRoster : [], totalCount: Number(club.members) || 0, committees });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load club members right now.' });
  }
});

async function getClubMemberDirectory() {
  const directoryClubs = mongoReady
    ? await Club.find({}).select('id name members memberRoster').sort({ name: 1 }).lean()
    : clubs;
  return directoryClubs.map((club) => ({
    id: club.id,
    name: club.name,
    totalCount: Number(club.members) || 0,
    members: Array.isArray(club.memberRoster) ? club.memberRoster : []
  }));
}

app.post('/api/club/members', requireClubAuth, requireClubPresident, async (req, res) => {
  const name = cleanText(req.body.name, 120);
  const requestedCommittee = cleanText(req.body.committee, 100);
  const position = cleanText(req.body.position, 100);
  const memberType = req.body.memberType;
  const committee = clubAccounts.find((account) => account.clubId === req.clubAccount.clubId
    && account.role === 'head' && account.committee
    && account.committee.toLowerCase() === requestedCommittee.toLowerCase())?.committee;

  if (!name) return res.status(400).json({ message: 'Enter the member name.' });
  if (!committee) return res.status(400).json({ message: 'Choose a committee managed by a committee head.' });
  if (!position) return res.status(400).json({ message: 'Enter the member position.' });
  if (!['new', 'senior'].includes(memberType)) return res.status(400).json({ message: 'Choose New member or Senior member.' });

  const club = clubs.find((item) => item.id === req.clubAccount.clubId);
  if (!club) return res.status(404).json({ message: 'Club not found.' });
  const member = { id: crypto.randomBytes(16).toString('hex'), name, committee, position, memberType, createdAt: new Date().toISOString() };
  try {
    if (!requireLiveDatabase(res)) return;
    const savedClub = await Club.findOneAndUpdate(
      { id: req.clubAccount.clubId },
      { $push: { memberRoster: member }, $inc: { members: 1 } },
      { new: true, runValidators: true }
    ).select('id');
    if (!savedClub) return res.status(404).json({ message: 'Club not found.' });
    club.members = (Number(club.members) || 0) + 1;
    club.memberRoster = [...(club.memberRoster || []), member];
    res.status(201).json({ member, totalCount: club.members });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not add this member right now.' });
  }
});

app.get('/api/club/application-form', requireClubAuth, requireClubPresident, (req, res) => {
  const club = clubs.find((item) => item.id === req.clubAccount.clubId);
  if (!club) return res.status(404).json({ message: 'Club not found.' });
  res.json({
    applicationIntro: club.applicationIntro || '',
    applicationFields: club.applicationFields || []
  });
});

app.put('/api/club/application-form', requireClubAuth, requireClubPresident, async (req, res) => {
  const club = clubs.find((item) => item.id === req.clubAccount.clubId);
  if (!club) return res.status(404).json({ message: 'Club not found.' });

  const applicationIntro = cleanText(req.body.applicationIntro, 500);
  const applicationFields = normalizeApplicationFields(req.body.applicationFields);
  try {
    if (!requireLiveDatabase(res)) return;
    const savedClub = await Club.findOneAndUpdate(
      { id: req.clubAccount.clubId },
      { $set: { applicationIntro, applicationFields } },
      { new: true, runValidators: true }
    ).lean();
    if (!savedClub) return res.status(404).json({ message: 'Club not found.' });
    club.applicationIntro = applicationIntro;
    club.applicationFields = applicationFields;
    res.json({ applicationIntro, applicationFields });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not save the application form right now.' });
  }
});

app.get('/api/club/interview-form', requireClubAuth, async (req, res) => {
  try {
    const club = mongoReady
      ? await Club.findOne({ id: req.clubAccount.clubId }).select('interviewForms').lean()
      : clubs.find((item) => item.id === req.clubAccount.clubId);
    if (!club) return res.status(404).json({ message: 'Club not found.' });
    const scope = getInterviewFormScope(req.clubAccount);
    const form = (club.interviewForms || []).find((item) => item.scope === scope);
    res.json({ scope, sections: form?.sections || [] });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load interview questions right now.' });
  }
});

app.put('/api/club/interview-form', requireClubAuth, async (req, res) => {
  const scope = getInterviewFormScope(req.clubAccount);
  const sections = normalizeInterviewSections(req.body.sections);
  try {
    if (!requireLiveDatabase(res)) return;
    const club = await Club.findOne({ id: req.clubAccount.clubId }).select('interviewForms').lean();
    if (!club) return res.status(404).json({ message: 'Club not found.' });
    const interviewForms = (club.interviewForms || []).filter((item) => item.scope !== scope);
    interviewForms.push({ scope, sections });
    const savedClub = await Club.findOneAndUpdate(
      { id: req.clubAccount.clubId },
      { $set: { interviewForms } },
      { new: true, runValidators: true }
    ).lean();
    if (!savedClub) return res.status(404).json({ message: 'Club not found.' });
    const cachedClub = clubs.find((item) => item.id === req.clubAccount.clubId);
    if (cachedClub) cachedClub.interviewForms = interviewForms;
    res.json({ scope, sections });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not save interview questions right now.' });
  }
});

app.post('/api/club/heads', requireClubAuth, requireClubPresident, async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const committee = cleanText(req.body.committee, 100);
  const password = req.body.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid head email address.' });
  }
  if (!committee) return res.status(400).json({ message: 'Enter the committee this head will manage.' });
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    return res.status(400).json({ message: 'Use a password between 12 and 200 characters.' });
  }
  if (clubAccounts.some((account) => account.email === email)) {
    return res.status(409).json({ message: 'That email already has a club portal account.' });
  }
  if (clubAccounts.some((account) => account.clubId === req.clubAccount.clubId
    && account.role === 'head' && account.committee.toLowerCase() === committee.toLowerCase())) {
    return res.status(409).json({ message: 'This committee already has a head.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const account = {
    clubId: req.clubAccount.clubId,
    email,
    salt,
    passwordHash: crypto.scryptSync(password, salt, 64).toString('hex'),
    role: 'head',
    committee
  };
  try {
    if (!requireLiveDatabase(res)) return;
    await ClubAccount.create({ ...account });
    clubAccounts.push(account);
    writePrivateClubAccountsFile();
    // The password is shown exactly once here and never stored again.
    res.status(201).json({ email, committee, role: 'head', temporaryPassword: password });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(error.code === 11000 ? 409 : 503).json({
      message: error.code === 11000 ? 'That email already has a club portal account.' : 'Could not create this committee head.'
    });
  }
});

app.patch('/api/club/heads/:email', requireClubAuth, requireClubPresident, async (req, res) => {
  const oldEmail = String(req.params.email || '').trim().toLowerCase();
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const committee = cleanText(req.body.committee, 100);
  const password = req.body.password;
  const accountIndex = clubAccounts.findIndex((account) => account.clubId === req.clubAccount.clubId
    && account.role === 'head' && account.email === oldEmail);
  if (accountIndex < 0) return res.status(404).json({ message: 'Committee head not found.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid head email address.' });
  }
  if (!committee) return res.status(400).json({ message: 'Enter the committee this head will manage.' });
  if (password !== undefined && password !== ''
    && (typeof password !== 'string' || password.length < 12 || password.length > 200)) {
    return res.status(400).json({ message: 'Use a password between 12 and 200 characters, or leave it blank to keep the current password.' });
  }
  if (clubAccounts.some((account, index) => index !== accountIndex && account.email === email)) {
    return res.status(409).json({ message: 'That email already has a club portal account.' });
  }
  if (clubAccounts.some((account, index) => index !== accountIndex
    && account.clubId === req.clubAccount.clubId && account.role === 'head'
    && account.committee.toLowerCase() === committee.toLowerCase())) {
    return res.status(409).json({ message: 'Another head already manages this committee.' });
  }

  const currentAccount = clubAccounts[accountIndex];
  const oldCommittee = currentAccount.committee;
  const updates = { email, committee };
  if (typeof password === 'string' && password.length) {
    updates.salt = crypto.randomBytes(16).toString('hex');
    updates.passwordHash = crypto.scryptSync(password, updates.salt, 64).toString('hex');
  }

  try {
    if (!requireLiveDatabase(res)) return;
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      if (oldCommittee !== committee) {
        await Application.updateMany(
          { clubId: currentAccount.clubId, committee: oldCommittee },
          { $set: { committee } },
          { session }
        );
      }
      const updatedAccount = await ClubAccount.findOneAndUpdate(
        { clubId: currentAccount.clubId, email: oldEmail, role: 'head' },
        { $set: Object.fromEntries(Object.entries(updates).filter(([key]) => key !== 'password')) },
        { new: true, runValidators: true, session }
      );
      if (!updatedAccount) throw new Error('HEAD_NOT_FOUND');
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally {
      await session.endSession();
    }
    Object.assign(currentAccount, updates);
    if (oldCommittee !== committee) {
      for (const application of applications) {
        if (application.clubId === currentAccount.clubId && application.committee === oldCommittee) {
          application.committee = committee;
        }
      }
    }
    writePrivateClubAccountsFile();
    res.json({ email, committee, role: 'head' });
  } catch (error) {
    if (error.message === 'HEAD_NOT_FOUND') return res.status(404).json({ message: 'Committee head not found.' });
    console.error('Database operation failed:', error.name);
    res.status(error.code === 11000 ? 409 : 503).json({
      message: error.code === 11000 ? 'That email already has a club portal account.' : 'Could not update this committee head.'
    });
  }
});

app.delete('/api/club/heads/:email', requireClubAuth, requireClubPresident, async (req, res) => {
  const email = String(req.params.email || '').trim().toLowerCase();
  const accountIndex = clubAccounts.findIndex((account) => account.clubId === req.clubAccount.clubId
    && account.role === 'head' && account.email === email);
  if (accountIndex < 0) return res.status(404).json({ message: 'Committee head not found.' });

  try {
    if (!requireLiveDatabase(res)) return;
    const result = await ClubAccount.deleteOne({ clubId: req.clubAccount.clubId, email, role: 'head' });
    if (!result.deletedCount) return res.status(404).json({ message: 'Committee head not found.' });
    clubAccounts.splice(accountIndex, 1);
    writePrivateClubAccountsFile();
    res.status(204).end();
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not delete this committee head.' });
  }
});

function requireCommitteeRole(req, res, next) {
  const role = req.clubAccount?.role;
  if (!['pr', 'english', 'security', 'dean'].includes(role)) {
    return res.status(403).json({ message: 'Committee access only.' });
  }
  next();
}

const attendanceApprovalStages = { pr: 'pending_pr', sso: 'pending_sso', dean: 'pending_dean' };
const attendanceApprovalNames = { pr: 'PR', sso: 'SSO', dean: 'Dean' };

app.get('/api/committee/attendance-reviews', requireClubAuth, async (req, res) => {
  const role = req.clubAccount?.role;
  const stage = attendanceApprovalStages[role];
  if (!stage) return res.status(403).json({ message: 'Attendance review is available to PR, SSO, and Dean accounts.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const filter = role === 'pr'
      ? { $or: [{ approvalStatus: stage }, { approvalStatus: { $exists: false } }] }
      : { approvalStatus: stage };
    const records = await AttendanceRecord.find(filter).sort({ attendedAt: -1 }).limit(5000).lean();
    const clubIds = [...new Set(records.map((record) => Number(record.clubId)))];
    const clubsById = new Map((await Club.find({ id: { $in: clubIds } }).select('id name image').lean()).map((club) => [Number(club.id), club]));
    const reviews = new Map();
    records.forEach((record) => {
      const itemType = record.itemType === 'booth' ? 'booth' : 'event';
      const key = `${record.clubId}:${itemType}:${record.eventRequestId}`;
      const club = clubsById.get(Number(record.clubId));
      if (!reviews.has(key)) reviews.set(key, {
        clubId: Number(record.clubId), clubName: club?.name || `Club ${record.clubId}`, clubImage: club?.image || '',
        itemType, eventRequestId: record.eventRequestId, eventTitle: record.eventTitle,
        eventDate: record.eventDate || '', eventTime: record.eventTime || '', records: []
      });
      reviews.get(key).records.push({
        name: record.name, email: record.email, note: record.note || '', attendedAt: record.attendedAt
      });
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ stage, reviews: [...reviews.values()] });
  } catch (error) {
    console.error('Attendance reviews could not be loaded:', error.name);
    res.status(503).json({ message: 'Could not load attendance reviews from the database.' });
  }
});

app.post('/api/committee/attendance-reviews/:clubId/:itemType/:eventRequestId/approve', requireClubAuth, async (req, res) => {
  const role = req.clubAccount?.role;
  const stage = attendanceApprovalStages[role];
  if (!stage) return res.status(403).json({ message: 'Attendance review is available to PR, SSO, and Dean accounts.' });
  const clubId = Number(req.params.clubId);
  const eventRequestId = Number(req.params.eventRequestId);
  const itemType = req.params.itemType;
  if (!Number.isSafeInteger(clubId) || !Number.isSafeInteger(eventRequestId) || !['event', 'booth'].includes(itemType)) {
    return res.status(400).json({ message: 'Choose a valid event or booth review.' });
  }
  const reviewFilter = { clubId, itemType, eventRequestId };
  const stageFilter = role === 'pr'
    ? { $or: [{ approvalStatus: stage }, { approvalStatus: { $exists: false } }] }
    : { approvalStatus: stage };
  try {
    if (!requireLiveDatabase(res)) return;
    const result = await AttendanceRecord.updateMany(
      { ...reviewFilter, ...stageFilter },
      { $set: { approvalStatus: role === 'dean' ? 'approved' : role === 'pr' ? 'pending_sso' : 'pending_dean' },
        $push: { approvalHistory: { role, email: req.clubAccount.email, action: 'approved', createdAt: new Date() } } }
    );
    if (!result.modifiedCount) return res.status(409).json({ message: `This activity is no longer waiting for ${attendanceApprovalNames[role]} approval.` });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ approved: true, nextStage: role === 'dean' ? 'complete' : role === 'pr' ? 'sso' : 'dean', recordsUpdated: result.modifiedCount });
  } catch (error) {
    console.error('Attendance review could not be approved:', error.name);
    res.status(503).json({ message: 'Approval was not saved. Please try again.' });
  }
});

app.get('/api/committee/club-members', requireClubAuth, async (req, res) => {
  if (req.clubAccount?.role !== 'pr') {
    return res.status(403).json({ message: 'Only PR can view member rosters across clubs.' });
  }
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getClubMemberDirectory());
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load club member rosters right now.' });
  }
});

const committeeStage = { pr: 'pending_pr', english: 'pending_english', security: 'pending_security', dean: 'pending_dean' };
const committeeRoleLabels = { pr: 'PR Department', english: 'English Department', security: 'Security Office', dean: 'Dean' };

function committeeCanAccessRequest(role, type) {
  if (role === 'security') return type === 'entry_permit';
  if (role === 'english') return ['event', 'feed', 'sponsor', 'booth'].includes(type);
  return ['pr', 'dean'].includes(role);
}

// Dedicated content types. Each module (Event, Feed, Sponsor, Booth) assigns its own type.
const CONTENT_TYPES = ['event', 'feed', 'sponsor', 'booth', 'entry_permit'];
const contentTypeLabels = { event: 'Event', feed: 'Feed', sponsor: 'Sponsor', booth: 'Booth', entry_permit: 'Entry Permit' };
const contentHomeLabels = {
  event: 'Upcoming Event',
  feed: 'Latest Feed',
  sponsor: 'Upcoming Sponsor',
  booth: 'Booth Opening Soon'
};
const contentSingular = { event: 'event', feed: 'feed post', sponsor: 'sponsor request', booth: 'booth request', entry_permit: 'entry permit' };
const contentClubField = { event: 'events', feed: 'posts', sponsor: 'sponsors', booth: 'booths' };

function isContentType(value) {
  return CONTENT_TYPES.includes(value);
}

function contentLabel(type) {
  return contentTypeLabels[type] || 'Content';
}

function contentSingularLabel(type) {
  return contentSingular[type] || 'content';
}

// The date used for "upcoming" sorting: booths sort by their opening date.
function contentRequestDate(record) {
  if (record.type === 'booth') return record.boothOpenDate || record.date || '';
  return record.date || '';
}

function extractSponsorFields(body) {
  return {
    sponsorName: cleanText(body.sponsorName, 140),
    sponsorCompany: cleanText(body.sponsorCompany, 140),
    sponsorContact: cleanText(body.sponsorContact, 100),
    sponsorEmail: cleanText(body.sponsorEmail, 140),
    sponsorPhone: cleanText(body.sponsorPhone, 40),
    sponsorType: cleanText(body.sponsorType, 40),
    sponsorAmount: cleanText(body.sponsorAmount, 80),
    sponsorBenefits: cleanText(body.sponsorBenefits, 2000),
    sponsorDescription: cleanText(body.sponsorDescription, 2000),
    sponsorLogo: typeof body.sponsorLogo === 'string' ? body.sponsorLogo.slice(0, 4 * 1024 * 1024) : '',
    sponsorAttachment: typeof body.sponsorAttachment === 'string' ? body.sponsorAttachment.slice(0, 4 * 1024 * 1024) : '',
    sponsorNotes: cleanText(body.sponsorNotes, 2000)
  };
}

function extractBoothFields(body) {
  return {
    boothName: cleanText(body.boothName, 140),
    boothPurpose: cleanText(body.boothPurpose, 2000),
    boothDescription: cleanText(body.boothDescription, 2000),
    boothLocation: cleanText(body.boothLocation, 140),
    boothSize: cleanText(body.boothSize, 60),
    boothEquipment: cleanText(body.boothEquipment, 2000),
    boothSetupDate: cleanText(body.boothSetupDate, 40),
    boothOpenDate: cleanText(body.boothOpenDate, 40),
    boothCloseDate: cleanText(body.boothCloseDate, 40),
    boothContact: cleanText(body.boothContact, 100),
    boothNotes: cleanText(body.boothNotes, 2000)
  };
}

function validEntryPermitItems(items) {
  return Array.isArray(items) && items.length > 0 && items.length <= 100 && items.every((item) => {
    const quantity = Number(item?.quantity);
    return Number.isInteger(quantity) && quantity >= 1 && quantity <= 10000
      && Boolean(cleanText(item?.number, 80))
      && Boolean(cleanText(item?.details, 1000));
  });
}

// Type-specific fields attached to every content request.
function extractContentFields(type, body) {
  if (type === 'sponsor') return extractSponsorFields(body);
  if (type === 'booth') return extractBoothFields(body);
  if (type === 'entry_permit') {
    const permitItems = Array.isArray(body.permitItems) ? body.permitItems.slice(0, 100).map((item) => ({
      quantity: Math.max(1, Math.min(10000, Math.floor(Number(item?.quantity) || 1))),
      number: cleanText(item?.number, 80),
      details: cleanText(item?.details, 1000)
    })).filter((item) => item.number || item.details) : [];
    return { permitItems };
  }
  return {};
}

// The public title of a request: sponsors and booths are titled by their name field.
function contentTitle(type, body) {
  const title = cleanText(body.title, 140);
  if (title) return title;
  if (type === 'sponsor') return cleanText(body.sponsorName, 140);
  if (type === 'booth') return cleanText(body.boothName, 140);
  return '';
}

function contentRequiresTitle(type) {
  return ['event', 'feed', 'entry_permit'].includes(type);
}

function missingRequiredPublicContentImage(type, content) {
  if (type === 'event' || type === 'feed') return !String(content?.image || '').trim();
  if (type === 'sponsor') return !String(content?.sponsorLogo || '').trim();
  return false;
}

function addCommitteeClubImage(record) {
  const { _id, __v, ...item } = typeof record.toObject === 'function' ? record.toObject() : record;
  const club = clubs.find((entry) => Number(entry.id) === Number(item.clubId));
  return { ...item, clubImage: club?.image || '' };
}

// Remove a published item from the club's content list for a request.
function removePublishedItem(club, record) {
  const field = contentClubField[record.type];
  if (!club || !field) return;
  const matchesRequest = (item) => Number(item.requestId) === Number(record.id)
    || (!item.requestId && item.title === record.title && item.date === record.date && item.description === record.description);
  club[field] = (club[field] || []).filter((item) => !matchesRequest(item));
}

// The published item stored on the club document after the Dean approves.
function buildPublishedItem(record, club) {
  const item = {
    requestId: record.id,
    contentType: record.type,
    title: record.title,
    date: record.date,
    time: record.time,
    location: record.location,
    budget: record.budget,
    description: record.description,
    image: record.image || club.image,
    createdAt: record.createdAt
  };
  if (record.type === 'sponsor') {
    Object.assign(item, {
      sponsorName: record.sponsorName,
      sponsorCompany: record.sponsorCompany,
      sponsorContact: record.sponsorContact,
      sponsorEmail: record.sponsorEmail,
      sponsorPhone: record.sponsorPhone,
      sponsorType: record.sponsorType,
      sponsorAmount: record.sponsorAmount,
      sponsorBenefits: record.sponsorBenefits,
      sponsorDescription: record.sponsorDescription,
      sponsorLogo: record.sponsorLogo || '',
      sponsorAttachment: record.sponsorAttachment || '',
      sponsorNotes: record.sponsorNotes
    });
  }
  if (record.type === 'booth') {
    Object.assign(item, {
      boothName: record.boothName,
      boothPurpose: record.boothPurpose,
      boothDescription: record.boothDescription,
      boothLocation: record.boothLocation,
      boothSize: record.boothSize,
      boothEquipment: record.boothEquipment,
      boothSetupDate: record.boothSetupDate,
      boothOpenDate: record.boothOpenDate,
      boothCloseDate: record.boothCloseDate,
      boothContact: record.boothContact,
      boothNotes: record.boothNotes
    });
  }
  if (record.type === 'feed') {
    item.author = club.name;
    item.text = record.description;
  }
  return item;
}

// Shared type-aware notice text for club notifications.
function contentNotice(roleLabel, action, type, comment) {
  const label = contentSingularLabel(type);
  if (action === 'request_edit') return `${roleLabel} requested edits: ${comment}`;
  if (action === 'reject') return `${roleLabel} rejected the ${label}.`;
  if (action === 'comment') return `${roleLabel} sent a comment on the ${label}.`;
  if (action === 'delete') return `${roleLabel} deleted this ${label}.`;
  if (action === 'restarted_review') return `${roleLabel} restarted review and sent this note: ${comment}`;
  return `${roleLabel} updated the ${label}.`;
}

function shapeClubContentRecord(record) {
  const { _id, __v, ...rest } = record;
  const privateReturnEvents = (rest.workflowHistory || []).filter((event) => event.role === 'dean'
    && ['returned_to_pr', 'returned_to_english', 'returned_to_security'].includes(event.action));
  const privateReturnComments = new Set(privateReturnEvents.map((event) => event.comment).filter(Boolean));
  rest.workflowHistory = (rest.workflowHistory || []).map((event) => privateReturnComments.has(event.comment)
    && ['returned_to_pr', 'returned_to_english', 'returned_to_security'].includes(event.action) ? { ...event, comment: '' } : event);
  rest.commentHistory = (rest.commentHistory || []).filter((entry) => entry.role !== 'dean' || !privateReturnComments.has(entry.text));
  if (rest.comments?.dean) {
    rest.comments = { ...rest.comments, dean: rest.comments.dean.split('\n').filter((line) => !privateReturnComments.has(line)).join('\n') };
  }
  rest.clubNotice = String(rest.clubNotice || '').replace(/^(Dean returned the .*?) with this comment:.*$/, '$1 for another review.');
  return rest;
}

function appendCommitteeComment(record, role, text) {
  if (!text || !['pr', 'english', 'security', 'dean'].includes(role)) return;
  record.comments[role] = [record.comments[role], text].filter(Boolean).join('\n').slice(-10000);
  record.commentHistory.push({ role, text, createdAt: new Date() });
  record.hiddenCommentRoles = (record.hiddenCommentRoles || []).filter((hiddenRole) => hiddenRole !== role);
}

function appendWorkflowEvent(record, role, action, fromStatus, toStatus, comment = '', actor = {}) {
  if (!Array.isArray(record.workflowHistory)) record.workflowHistory = [];
  record.workflowHistory.push({
    role,
    actorRole: actor.role || role,
    actorEmail: actor.email || '',
    action,
    fromStatus: fromStatus || '',
    toStatus: toStatus || '',
    comment,
    createdAt: new Date()
  });
}

function shouldSendPrApprovalToDean(record) {
  const history = Array.isArray(record.workflowHistory) ? record.workflowHistory : [];
  let returnedToPrIndex = -1;
  history.forEach((event, index) => {
    if (event.role === 'dean' && event.action === 'returned_to_pr') returnedToPrIndex = index;
  });
  if (returnedToPrIndex < 0) return Boolean(record.skipEnglishOnNextPrApproval);
  const invalidated = history.slice(returnedToPrIndex + 1).some((event) =>
    event.role === 'pr' && ['request_edit', 'restarted_review'].includes(event.action));
  return !invalidated;
}

function committeeNextStage(role, action, record) {
  if (role === 'pr' && action === 'approve' && record?.type === 'entry_permit') {
    const history = Array.isArray(record.workflowHistory) ? record.workflowHistory : [];
    const latestSecurityReview = [...history].reverse().find((event) => event.role === 'security'
      && ['approve', 'request_edit', 'reject', 'restarted_review'].includes(event.action));
    const securityApproved = latestSecurityReview?.action === 'approve';
    return securityApproved ? 'approved' : 'pending_security';
  }
  if (role === 'security' && action === 'approve' && record?.type === 'entry_permit') return 'pending_pr';
  if (role === 'pr' && action === 'approve') return shouldSendPrApprovalToDean(record) ? 'pending_dean' : 'pending_english';
  if (role === 'english' && action === 'approve') return 'pending_dean';
  if (role === 'dean' && action === 'approve') return record?.type === 'entry_permit' ? null : 'published';
  if ((role === 'dean' || role === 'pr') && action === 'delete') return 'deleted';
  if (action === 'reject') return 'rejected';
  if (action === 'request_edit') return 'changes_requested';
  return null;
}

function nextCommitteeStageForRequest(role, action, record) {
  return committeeNextStage(role, action, record);
}

app.get('/api/club/content', requireClubAuth, async (req, res) => {
  if (!['president', 'head'].includes(req.clubAccount.role)) {
    return res.status(403).json({ message: 'Only club presidents and heads can manage content.' });
  }
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const records = await ContentRequest.find({ clubId: req.clubAccount.clubId }).sort({ id: -1 }).lean();
    res.json(records.map(shapeClubContentRecord));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load content right now.' });
  }
});

app.post('/api/club/content', requireClubAuth, async (req, res) => {
  if (!['president', 'head'].includes(req.clubAccount.role)) {
    return res.status(403).json({ message: 'Only club presidents and heads can manage content.' });
  }
  if (!isContentType(req.body.type)) {
    return res.status(400).json({ message: `Choose a valid content type: ${CONTENT_TYPES.join(', ')}.` });
  }
  return createContentRequest(req, res, req.body.type);
});

// Each module assigns its own content type automatically.
for (const moduleType of CONTENT_TYPES) {
  app.post(`/api/club/content/${moduleType}`, requireClubAuth, async (req, res) => {
    if (!['president', 'head'].includes(req.clubAccount.role)) {
      return res.status(403).json({ message: 'Only club presidents and heads can manage content.' });
    }
    return createContentRequest(req, res, moduleType);
  });
}

async function createContentRequest(req, res, type) {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const title = contentTitle(type, req.body);
    if (!title) {
      return res.status(400).json({ message: type === 'event' || type === 'feed'
        ? 'Enter a title.'
        : type === 'sponsor' ? 'Enter the sponsor name.' : type === 'booth' ? 'Enter the booth name.' : 'Enter a permit title.' });
    }
    const description = cleanText(req.body.description, 2000)
      || (type === 'sponsor' ? cleanText(req.body.sponsorDescription, 2000) : '')
      || (type === 'booth' ? cleanText(req.body.boothDescription, 2000) : '')
      || (type === 'entry_permit' ? (Array.isArray(req.body.permitItems) ? req.body.permitItems.map((item) => cleanText(item.details, 1000)).filter(Boolean).join(' · ').slice(0, 2000) : '') : '');
    if (type === 'entry_permit' && req.body.submit === true && !validEntryPermitItems(req.body.permitItems)) {
      return res.status(400).json({ message: 'Add at least one complete permit row with a valid quantity, number, and details.' });
    }
    const sponsorFields = type === 'sponsor' ? extractSponsorFields(req.body) : {};
    const contentForImageCheck = { image: req.body.image, ...sponsorFields };
    if (req.body.submit === true && missingRequiredPublicContentImage(type, contentForImageCheck)) {
      return res.status(400).json({ message: type === 'sponsor' ? 'Add the company logo before submitting this sponsor request.' : 'Add an image before submitting this content.' });
    }
    const club = clubs.find((item) => item.id === req.clubAccount.clubId);
    const last = await ContentRequest.findOne().sort({ id: -1 }).lean();
    const record = await ContentRequest.create({
      id: (last?.id || 0) + 1,
      clubId: req.clubAccount.clubId,
      clubName: club?.name || '',
      type,
      title,
      description,
      date: type === 'booth' ? (cleanText(req.body.boothOpenDate, 40) || cleanText(req.body.date, 40)) : cleanText(req.body.date, 40),
      time: cleanText(req.body.time, 40),
      location: type === 'booth' ? (cleanText(req.body.boothLocation, 140) || cleanText(req.body.location, 120)) : cleanText(req.body.location, 120),
      budget: cleanText(req.body.budget, 80),
      image: typeof req.body.image === 'string' ? req.body.image.slice(0, 4 * 1024 * 1024) : '',
      ...extractContentFields(type, req.body),
      status: req.body.submit === true ? 'pending_pr' : 'draft',
      clubNotice: req.body.submit === true ? `Club submitted a new ${contentSingularLabel(type)} for PR review.` : ''
    });
    if (req.body.submit === true) appendWorkflowEvent(record, 'club', 'submitted', 'draft', 'pending_pr', '', req.clubAccount);
    if (req.body.submit === true) await record.save();
    const { _id, __v, ...rest } = record.toObject();
    res.status(201).json(rest);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not save content right now.' });
  }
}

app.put('/api/club/content/:id', requireClubAuth, async (req, res) => {
  if (!['president', 'head'].includes(req.clubAccount.role)) {
    return res.status(403).json({ message: 'Only club presidents and heads can manage content.' });
  }
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id), clubId: req.clubAccount.clubId });
    if (!record) return res.status(404).json({ message: 'Content not found.' });
    if (!['draft', 'changes_requested', 'rejected'].includes(record.status)) {
      return res.status(409).json({ message: 'This content is already under review or published.' });
    }
    // The content type is fixed by the module that created the request.
    const type = record.type;
    const title = contentTitle(type, req.body);
    if (title && contentRequiresTitle(type)) record.title = title;
    else if (title && (type === 'sponsor' || type === 'booth')) record.title = title;
    if (req.body.description !== undefined || type === 'sponsor' || type === 'booth') {
      const description = cleanText(req.body.description, 2000)
        || (type === 'sponsor' ? cleanText(req.body.sponsorDescription, 2000) : '')
        || (type === 'booth' ? cleanText(req.body.boothDescription, 2000) : '');
      if (req.body.description !== undefined || description) record.description = description;
    }
    if (req.body.date !== undefined) record.date = cleanText(req.body.date, 40);
    if (req.body.time !== undefined) record.time = cleanText(req.body.time, 40);
    if (req.body.location !== undefined) record.location = cleanText(req.body.location, 120);
    if (req.body.budget !== undefined) record.budget = cleanText(req.body.budget, 80);
    if (typeof req.body.image === 'string') record.image = req.body.image.slice(0, 4 * 1024 * 1024);
    if (type === 'sponsor') Object.assign(record, extractSponsorFields(req.body));
    if (type === 'entry_permit' && req.body.submit === true
      && !validEntryPermitItems(req.body.permitItems === undefined ? record.permitItems : req.body.permitItems)) {
      return res.status(400).json({ message: 'Add at least one complete permit row with a valid quantity, number, and details.' });
    }
    if (type === 'entry_permit' && req.body.permitItems !== undefined) {
      if (!validEntryPermitItems(req.body.permitItems) && req.body.permitItems.length) {
        return res.status(400).json({ message: 'Add at least one complete permit row with a valid quantity, number, and details.' });
      }
      const fields = extractContentFields(type, req.body);
      record.permitItems = fields.permitItems;
      record.description = fields.permitItems.map((item) => item.details).filter(Boolean).join(' · ').slice(0, 2000);
    }
    if (req.body.submit === true && missingRequiredPublicContentImage(type, record)) {
      return res.status(400).json({ message: type === 'sponsor' ? 'Add the company logo before submitting this sponsor request.' : 'Add an image before submitting this content.' });
    }
    if (type === 'booth') {
      Object.assign(record, extractBoothFields(req.body));
      // Booths are tracked by their opening date and preferred location.
      record.date = record.boothOpenDate || record.date;
      record.location = record.boothLocation || record.location;
    }
    if (record.status === 'changes_requested' && !record.editRequestedBy && type === 'entry_permit' && record.comments?.security) {
      record.resubmitTo = 'pending_security';
    } else if (record.status === 'changes_requested' && !record.editRequestedBy && record.comments?.english) {
      record.resubmitTo = type === 'event' ? 'pending_english' : 'pending_pr';
    }
    if (req.body.submit === true) {
      const fromStatus = record.editRequestedBy ? 'changes_requested' : record.status;
      const targetStage = type === 'entry_permit' && record.editRequestedBy === 'pr'
        ? 'pending_pr'
        : type !== 'event' && record.editRequestedBy === 'english' ? 'pending_pr'
        : record.editRequestedBy ? committeeStage[record.editRequestedBy] : (record.resubmitTo || 'pending_pr');
      const isFirstSubmission = !(record.workflowHistory || []).some((event) => ['submitted', 'resubmitted'].includes(event.action));
      record.status = targetStage;
      record.resubmitTo = 'pending_pr';
      const nextReviewer = { pending_pr: 'PR Department', pending_english: 'English Department', pending_security: 'Security Office' }[targetStage] || 'Dean';
      record.clubNotice = `${isFirstSubmission ? 'Club submitted a new' : 'Club resubmitted the updated'} ${contentSingularLabel(type)}. Waiting for ${nextReviewer} review.`;
      appendWorkflowEvent(record, 'club', isFirstSubmission ? 'submitted' : 'resubmitted', fromStatus, targetStage, '', req.clubAccount);
      record.editRequestedBy = '';
    } else {
      record.status = 'draft';
    }
    await record.save();
    const { _id, __v, ...rest } = record.toObject();
    res.json(rest);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not update content right now.' });
  }
});

app.delete('/api/club/content/:id', requireClubAuth, async (req, res) => {
  if (!['president', 'head'].includes(req.clubAccount.role)) {
    return res.status(403).json({ message: 'Only club presidents and heads can manage content.' });
  }
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id), clubId: req.clubAccount.clubId });
    if (!record) return res.status(404).json({ message: 'Content not found.' });
    if (record.status === 'deleted') return res.status(409).json({ message: `This ${contentSingularLabel(record.type)} was deleted by the Dean and is retained in the review history.` });
    await ContentRequest.deleteOne({ _id: record._id });
    if (record.status === 'published') {
      const field = contentClubField[record.type];
      await Club.updateOne(
        { id: record.clubId },
        { $pull: { [field]: { $or: [
          { requestId: record.id },
          { title: record.title, date: record.date, description: record.description }
        ] } } }
      );
    }
    res.status(204).end();
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not delete content right now.' });
  }
});

app.get('/api/committee/requests', requireClubAuth, requireCommitteeRole, async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const stage = committeeStage[req.clubAccount.role];
    const filter = req.clubAccount.role === 'security'
      ? { status: stage, type: 'entry_permit' }
      : req.clubAccount.role === 'english'
        ? { status: stage, type: { $ne: 'entry_permit' } }
        : { status: stage };
    const records = await ContentRequest.find(filter).sort({ id: -1 }).lean();
    res.json(records.map(addCommitteeClubImage));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load requests right now.' });
  }
});

app.get('/api/committee/status', requireClubAuth, requireCommitteeRole, async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const filter = req.clubAccount.role === 'security'
      ? { type: 'entry_permit' }
      : req.clubAccount.role === 'english' ? { type: { $ne: 'entry_permit' } } : {};
    const records = await ContentRequest.find(filter)
      .select('id clubId clubName type title date time status image submittedAt publishedAt clubNotice editRequestedBy comments commentHistory hiddenCommentRoles createdAt sponsorName sponsorCompany sponsorContact sponsorEmail sponsorPhone sponsorType sponsorAmount sponsorBenefits sponsorDescription sponsorLogo sponsorAttachment sponsorNotes boothName boothPurpose boothDescription boothLocation boothSize boothEquipment boothSetupDate boothOpenDate boothCloseDate boothContact boothNotes')
      .sort({ id: -1 })
      .lean();
    res.json(records.map(addCommitteeClubImage));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load request statuses right now.' });
  }
});

app.get('/api/committee/status/:id', requireClubAuth, requireCommitteeRole, async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id) }).lean();
    if (!record) return res.status(404).json({ message: 'Request not found.' });
    if (!committeeCanAccessRequest(req.clubAccount.role, record.type)) {
      return res.status(404).json({ message: 'Request not found.' });
    }
    const { _id, __v, ...rest } = record;
    res.json(addCommitteeClubImage(rest));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load request details right now.' });
  }
});

app.post('/api/committee/requests/:id/reopen', requireClubAuth, requireCommitteeRole, async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const role = req.clubAccount.role;
    if (!['pr', 'english', 'security'].includes(role)) return res.status(403).json({ message: 'This account cannot restart the review process.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id) });
    if (!record) return res.status(404).json({ message: 'Request not found.' });
  if (!committeeCanAccessRequest(role, record.type) || record.type === 'entry_permit' && !['pr', 'security'].includes(role)) return res.status(404).json({ message: 'Request not found.' });
    if (record.status === 'draft' || record.status === 'changes_requested' || record.status === committeeStage[role]) {
      return res.status(409).json({ message: `This request is already in the ${committeeRoleLabels[role]} review process.` });
    }
    const comment = cleanText(req.body.comment, 2000);
    if (!comment) return res.status(400).json({ message: 'Add a comment before restarting review.' });

    const wasPublished = record.status === 'published';
    const fromStatus = record.status;
    appendCommitteeComment(record, role, comment);
    record.status = committeeStage[role];
    record.resubmitTo = committeeStage[role];
    record.editRequestedBy = '';
    record.skipEnglishOnNextPrApproval = false;
    record.clubNotice = contentNotice(committeeRoleLabels[role], 'restarted_review', record.type, comment);
    appendWorkflowEvent(record, role, 'restarted_review', fromStatus, record.status, comment, req.clubAccount);
    record.publishedAt = undefined;

    if (wasPublished) {
      const club = await Club.findOne({ id: record.clubId });
      if (club) {
        removePublishedItem(club, record);
        await club.save();
      }
    }
    await record.save();
    const { _id, __v, ...rest } = record.toObject();
    res.json(rest);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not restart review right now.' });
  }
});

app.post('/api/committee/requests/:id/return-to-committee', requireClubAuth, requireCommitteeRole, async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    if (req.clubAccount.role !== 'dean') return res.status(403).json({ message: 'Only the Dean can return a request to a committee.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id) });
    if (!record) return res.status(404).json({ message: 'Request not found.' });
    if (!committeeCanAccessRequest(req.clubAccount.role, record.type)) return res.status(404).json({ message: 'Request not found.' });
    if (record.type === 'entry_permit') return res.status(403).json({ message: 'The Dean can view Entry Permits but cannot review or change them.' });
    const targetRole = req.body.target === 'pr' ? 'pr'
      : req.body.target === 'english' && record.type !== 'entry_permit' ? 'english' : null;
    if (!targetRole) return res.status(400).json({ message: 'Choose a valid review destination for this request.' });
    const comment = cleanText(req.body.comment, 2000);
    if (!comment) return res.status(400).json({ message: 'Add a comment explaining why the request is being returned.' });
    const returnableStatus = ['pending_dean', 'published'].includes(record.status);
    if (!returnableStatus) {
      return res.status(409).json({ message: 'Only a request waiting for the Dean or already published can be returned.' });
    }

    const fromStatus = record.status;
    const wasPublished = record.status === 'published';
    const nextStatus = committeeStage[targetRole];
    appendWorkflowEvent(record, 'dean', `returned_to_${targetRole}`, fromStatus, nextStatus, comment, req.clubAccount);
    record.status = nextStatus;
    record.resubmitTo = nextStatus;
    record.editRequestedBy = '';
    record.skipEnglishOnNextPrApproval = targetRole === 'pr' && record.type !== 'entry_permit';
    record.publishedAt = undefined;
    record.clubNotice = `Dean returned the ${contentSingularLabel(record.type)} to ${committeeRoleLabels[targetRole]} for another review.`;

    if (wasPublished) {
      const club = await Club.findOne({ id: record.clubId });
      if (club) {
        removePublishedItem(club, record);
        await club.save();
      }
    }
    await record.save();
    const { _id, __v, ...rest } = record.toObject();
    res.json(rest);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not return the request to committee review.' });
  }
});

app.delete('/api/committee/requests/:id', requireClubAuth, requireCommitteeRole, async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    if (req.clubAccount.role !== 'dean') return res.status(403).json({ message: 'Only the Dean can delete a request.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id) });
    if (!record) return res.status(404).json({ message: 'Request not found.' });
    if (record.status === 'deleted') return res.status(409).json({ message: 'This content has already been deleted.' });

    const previousStatus = record.status;
    const club = await Club.findOne({ id: record.clubId });
    if (club) {
      removePublishedItem(club, record);
      await club.save();
    }
    record.status = 'deleted';
    record.deletedAt = new Date();
    record.publishedAt = undefined;
    record.editRequestedBy = '';
    record.skipEnglishOnNextPrApproval = false;
    record.clubNotice = contentNotice('Dean', 'delete', record.type);
    appendWorkflowEvent(record, 'dean', 'deleted', previousStatus, 'deleted', '', req.clubAccount);
    await record.save();
    res.json({ deleted: true, status: record.status });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not delete this content.' });
  }
});

app.delete('/api/committee/requests/:id/comment', requireClubAuth, requireCommitteeRole, async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id) });
    if (!record) return res.status(404).json({ message: 'Request not found.' });
    if (!committeeCanAccessRequest(req.clubAccount.role, record.type)) {
      return res.status(404).json({ message: 'Request not found.' });
    }
    const role = req.clubAccount.role;
    if (!['pr', 'english', 'security', 'dean'].includes(role)) {
      return res.status(404).json({ message: 'Your comment was not found.' });
    }
    const roleHistory = record.commentHistory.filter((entry) => entry.role === role);
    if (roleHistory.length) {
      const latest = [...roleHistory].reverse().find((entry) => !entry.deletedAt);
      if (!latest) return res.status(404).json({ message: 'Your comment was not found.' });
      latest.deletedAt = new Date();
      appendWorkflowEvent(record, role, 'comment_deleted', record.status, record.status, latest.text, req.clubAccount);
      if (record.clubNotice?.includes(latest.text)) {
        record.clubNotice = record.status === 'changes_requested'
          ? `${committeeRoleLabels[role]} requested changes. Please review the request.`
          : `${committeeRoleLabels[role]} updated the request.`;
      }
    } else if (record.comments?.[role] && !record.hiddenCommentRoles.includes(role)) {
      record.hiddenCommentRoles.push(role);
    } else {
      return res.status(404).json({ message: 'Your comment was not found.' });
    }
    await record.save();
    res.json({ deleted: true });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not delete the comment right now.' });
  }
});

app.post('/api/committee/requests/:id/action', requireClubAuth, requireCommitteeRole, async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id) });
    if (!record) return res.status(404).json({ message: 'Request not found.' });
    if (!committeeCanAccessRequest(req.clubAccount.role, record.type)) {
      return res.status(404).json({ message: 'Request not found.' });
    }
    const expected = committeeStage[req.clubAccount.role];
    const action = ['approve', 'reject', 'request_edit', 'comment', 'delete'].includes(req.body.action) ? req.body.action : null;
    if (!action) return res.status(400).json({ message: 'Choose approve, reject, request edit, comment, or delete.' });
    if (action === 'approve' && req.clubAccount.role === 'dean' && missingRequiredPublicContentImage(record.type, record)) {
      return res.status(400).json({ message: record.type === 'sponsor' ? 'This sponsor cannot be published without a company logo.' : 'This content cannot be published without an image.' });
    }
    if (record.type === 'entry_permit' && req.clubAccount.role === 'dean') {
      return res.status(403).json({ message: 'The Dean can view Entry Permits but cannot approve or change them. PR has final approval.' });
    }
    if (action === 'delete' && !['pr', 'dean'].includes(req.clubAccount.role)) return res.status(403).json({ message: 'Only PR or the Dean can delete a request.' });
    if (action !== 'comment' && action !== 'delete' && record.status !== expected) return res.status(409).json({ message: 'This request is not waiting for your review.' });
    if (action === 'request_edit' && !['pr', 'english', 'security'].includes(req.clubAccount.role)) {
      return res.status(403).json({ message: 'This account cannot request edits.' });
    }
    const comment = cleanText(req.body.comment, 2000);
    if (action === 'comment' && !comment) return res.status(400).json({ message: 'Enter a comment before sending.' });
    if (action === 'request_edit' && !comment) return res.status(400).json({ message: 'Add a comment explaining the requested edits.' });
    const fromStatus = record.status;
    if (comment) appendCommitteeComment(record, req.clubAccount.role, comment);
    let nextStatus = action === 'comment' ? record.status : nextCommitteeStageForRequest(req.clubAccount.role, action, record);
    const skipEnglish = record.type !== 'entry_permit' && req.clubAccount.role === 'pr' && action === 'approve' && shouldSendPrApprovalToDean(record);
    if (skipEnglish) nextStatus = 'pending_dean';
    record.status = nextStatus;
    if (action === 'request_edit') {
      record.resubmitTo = expected;
      record.editRequestedBy = req.clubAccount.role;
      record.skipEnglishOnNextPrApproval = false;
    }
    if (action === 'reject') { record.resubmitTo = 'pending_pr'; record.editRequestedBy = ''; record.skipEnglishOnNextPrApproval = false; }
    if (skipEnglish) record.skipEnglishOnNextPrApproval = false;
    const roleLabel = committeeRoleLabels[req.clubAccount.role];
    const actionLabel = action === 'request_edit' ? 'requested edits' : action === 'approve' ? 'approved the request' : action === 'reject' ? 'rejected the request' : 'sent a comment';
    const includeComment = action === 'request_edit' || action === 'reject' || action === 'comment';
    record.clubNotice = `${roleLabel} ${actionLabel}.${includeComment && comment ? ` Comment: ${comment}` : ''}`;
    appendWorkflowEvent(record, req.clubAccount.role, action, fromStatus, nextStatus, comment, req.clubAccount);
    if (action === 'approve' && req.clubAccount.role === 'pr' && record.type === 'entry_permit') {
      record.clubNotice = nextStatus === 'pending_security'
        ? 'PR Department approved the Entry Permit and sent it to the Security Office.'
        : 'PR Department gave final approval to the Entry Permit. It is available to the Dean for viewing.';
    }
    if (action === 'approve' && req.clubAccount.role === 'pr' && record.type !== 'entry_permit') {
      record.clubNotice = skipEnglish
        ? `PR approved the ${contentSingularLabel(record.type)} and returned it directly to the Dean.`
        : `PR approved the ${contentSingularLabel(record.type)} and sent it to the English Department.`;
    }
    if (action === 'approve' && req.clubAccount.role === 'english') record.clubNotice = `English Department approved the ${contentSingularLabel(record.type)} and sent it to the Dean.`;
    if (action === 'approve' && req.clubAccount.role === 'security' && record.type === 'entry_permit') record.clubNotice = 'Security Office approved the Entry Permit and sent it back to PR for final approval.';
    if (action === 'approve' && req.clubAccount.role === 'dean' && record.type !== 'entry_permit') record.clubNotice = `Dean approved the ${contentSingularLabel(record.type)}. It is now published.`;
    if (action === 'delete') {
      record.clubNotice = contentNotice(roleLabel, 'delete', record.type);
      const club = await Club.findOne({ id: record.clubId });
      if (club) {
        removePublishedItem(club, record);
        await club.save();
      }
    }
    if (action === 'request_edit') record.clubNotice = `${roleLabel} requested edits: ${comment}`;
    if (nextStatus === 'published' && record.type !== 'entry_permit') {
      record.publishedAt = new Date();
      const club = await Club.findOne({ id: record.clubId });
      if (club) {
        const item = buildPublishedItem(record, club);
        const field = contentClubField[record.type];
        club[field] = club[field] || [];
        club[field].push(item);
        await club.save();
      }
    }
    await record.save();
    const { _id, __v, ...rest } = record.toObject();
    res.json(rest);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not update request right now.' });
  }
});

const loginAttempts = new Map();
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

function loginAttemptKey(req) {
  const forwardedFor = process.env.VERCEL
    ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    : '';
  const sourceAddress = forwardedFor || req.ip || req.socket.remoteAddress || 'unknown';
  const hashSecret = process.env.LOGIN_ATTEMPT_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.MONGO_URI || sessionSecret;
  return crypto.createHmac('sha256', hashSecret).update(sourceAddress).digest('hex');
}

async function loginLockExpiry(key) {
  const now = new Date();
  if (mongoReady) {
    const entry = await LoginAttempt.findOne({ sourceHash: key, lockedUntil: { $gt: now } })
      .select('lockedUntil').lean();
    return entry?.lockedUntil || null;
  }
  if (process.env.VERCEL) throw new Error('Persistent login protection is unavailable.');

  const entry = loginAttempts.get(key);
  if (!entry) return null;
  if (entry.lockedUntil && entry.lockedUntil > now.getTime()) return new Date(entry.lockedUntil);
  if (entry.lockedUntil) loginAttempts.delete(key);
  return null;
}

async function recordLoginFailure(key) {
  const now = Date.now();
  if (mongoReady) {
    const resetWindow = {
      $or: [
        { $eq: [{ $ifNull: ['$windowStart', null] }, null] },
        { $lte: ['$windowStart', new Date(now - LOGIN_LOCK_MS)] }
      ]
    };
    const updates = [
      {
        $set: {
          sourceHash: key,
          windowStart: { $cond: [resetWindow, new Date(now), '$windowStart'] },
          failures: { $cond: [resetWindow, 1, { $add: [{ $ifNull: ['$failures', 0] }, 1] }] }
        }
      },
      {
        $set: {
          lockedUntil: { $cond: [{ $gte: ['$failures', MAX_LOGIN_FAILURES] }, new Date(now + LOGIN_LOCK_MS), null] },
          expiresAt: new Date(now + LOGIN_LOCK_MS)
        }
      }
    ];
    try {
      await LoginAttempt.findOneAndUpdate({ sourceHash: key }, updates, { upsert: true, new: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      await LoginAttempt.findOneAndUpdate({ sourceHash: key }, updates, { new: true });
    }
    return;
  }
  if (process.env.VERCEL) throw new Error('Persistent login protection is unavailable.');

  let entry = loginAttempts.get(key);
  if (!entry || now - entry.windowStart >= LOGIN_LOCK_MS) {
    entry = { windowStart: now, failures: 0 };
  }
  entry.failures += 1;
  if (entry.failures >= MAX_LOGIN_FAILURES) {
    entry.lockedUntil = now + LOGIN_LOCK_MS;
  }
  loginAttempts.set(key, entry);
}

async function clearLoginFailures(key) {
  if (mongoReady) {
    await LoginAttempt.deleteOne({ sourceHash: key });
    return;
  }
  if (process.env.VERCEL) throw new Error('Persistent login protection is unavailable.');
  loginAttempts.delete(key);
}

function sendLoginLockResponse(res, lockedUntil) {
  const remainingSeconds = Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000));
  const remainingMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));
  res.setHeader('Retry-After', String(remainingSeconds));
  res.status(429).json({
    message: `Too many failed login attempts. Login is temporarily blocked. Try again in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`,
    retryAfterSeconds: remainingSeconds
  });
}

async function checkLoginSourceLock(req, res) {
  try {
    const lockedUntil = await loginLockExpiry(loginAttemptKey(req));
    if (!lockedUntil) return false;
    sendLoginLockResponse(res, lockedUntil);
    return true;
  } catch (error) {
    console.error('Login protection unavailable:', error.name);
    res.status(503).json({ message: 'Login is temporarily unavailable. Please try again shortly.' });
    return true;
  }
}

async function countLoginSourceFailure(req, res) {
  const sourceKey = loginAttemptKey(req);
  try {
    await recordLoginFailure(sourceKey);
    return await checkLoginSourceLock(req, res);
  } catch (error) {
    console.error('Login protection unavailable:', error.name);
    res.status(503).json({ message: 'Login is temporarily unavailable. Please try again shortly.' });
    return true;
  }
}

async function clearLoginSourceFailures(req, res) {
  try {
    await clearLoginFailures(loginAttemptKey(req));
    return true;
  } catch (error) {
    console.error('Login protection unavailable:', error.name);
    res.status(503).json({ message: 'Login is temporarily unavailable. Please try again shortly.' });
    return false;
  }
}

app.get('/api/student-auth/google-config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) return res.json({ enabled: false });
  const nonce = crypto.randomBytes(24).toString('base64url');
  const secure = secureCookieSuffix(req);
  res.setHeader('Set-Cookie', `miu_google_nonce=${nonce}; Max-Age=600; HttpOnly; SameSite=Strict; Path=/;${secure}`);
  res.json({ enabled: true, clientId, nonce });
});

app.post('/api/student-auth/google', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (await checkLoginSourceLock(req, res)) return;
  if (!mongoReady) return res.status(503).json({ message: 'Google sign-in requires the database.' });
  const nonce = requestCookie(req, 'miu_google_nonce');
  try {
    const identity = await verifyGoogleStudentCredential(req.body.credential, nonce);
    let account = await StudentAccount.findOne({ email: identity.email }).lean();
    if (account?.googleSub && account.googleSub !== identity.googleSub) {
      if (await countLoginSourceFailure(req, res)) return;
      return res.status(403).json({ message: 'This MIU email is already linked to another Google account.' });
    }
    if (!account) {
      try {
        account = await StudentAccount.create({ email: identity.email, name: identity.name || identity.email.split('@')[0], googleSub: identity.googleSub });
        account = account.toObject();
      } catch (error) {
        if (error.code !== 11000) throw error;
        account = await StudentAccount.findOne({ email: identity.email }).lean();
      }
    }
    if (account && !account.googleSub) {
      await StudentAccount.updateOne({ email: identity.email, googleSub: { $exists: false } }, {
        $set: { googleSub: identity.googleSub, ...(identity.name ? { name: identity.name } : {}) }
      });
      account = await StudentAccount.findOne({ email: identity.email }).lean();
    }
    if (!account || account.googleSub !== identity.googleSub) {
      if (await countLoginSourceFailure(req, res)) return;
      return res.status(403).json({ message: 'This Google account cannot be linked to the supplied MIU identity.' });
    }
    if (!await clearLoginSourceFailures(req, res)) return;
    await recordSuccessfulSignIn('student', account.email);
    setStudentSessionCookie(req, res, account);
    const secure = secureCookieSuffix(req);
    res.append('Set-Cookie', `miu_google_nonce=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secure}`);
    return res.json({ authenticated: true, role: 'student' });
  } catch (error) {
    if (error.message === 'GOOGLE_KEYS_UNAVAILABLE') {
      console.error('Google sign-in keys could not be loaded.');
      return res.status(503).json({ message: 'Google sign-in is temporarily unavailable.' });
    }
    if (error.message !== 'GOOGLE_ACCOUNT_NOT_ALLOWED' && error.message !== 'GOOGLE_CREDENTIAL_INVALID') {
      console.error('Google sign-in failed:', error.name);
      return res.status(503).json({ message: 'Google sign-in is temporarily unavailable.' });
    }
    if (await countLoginSourceFailure(req, res)) return;
    res.status(401).json({ message: 'Use a verified Google account from the MIU university domain.' });
  }
});

app.get('/api/student-auth/session', requireStudentAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ authenticated: true, name: req.studentAccount.name, email: req.studentAccount.email });
});

app.post('/api/auth/login', async (req, res) => {
  if (await checkLoginSourceLock(req, res)) return;
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body.password;

  let adminPasswordValid = false;
  if (emailMatches(email) && typeof password === 'string') {
    try {
      adminPasswordValid = await passwordMatches(password);
    } catch (error) {
      console.error('Admin login failed:', error.name);
      return res.status(503).json({ message: 'Login is temporarily unavailable. Please try again shortly.' });
    }
  }
  if (adminPasswordValid) {
    if (!await clearLoginSourceFailures(req, res)) return;
    await recordSuccessfulSignIn('admin', email);
    setAdminSessionCookie(req, res);
    return res.json({ authenticated: true, role: 'admin', redirect: '/admin/global' });
  }

  let account;
  try {
    account = mongoReady
      ? await ClubAccount.findOne({ email }).lean()
      : clubAccounts.find((item) => item.email === email);
  } catch (error) {
    console.error('Club login failed:', error.name);
    return res.status(503).json({ message: 'Login is temporarily unavailable. Please try again shortly.' });
  }
  if (account && typeof password === 'string' && clubPasswordMatches(password, account)) {
    if (!await clearLoginSourceFailures(req, res)) return;
    await recordSuccessfulSignIn('club', account.email);
    setClubSessionCookie(req, res, account);
    const roleRedirects = {
      president: '/club-login',
      head: '/club-login',
      pr: '/dashboards/pr-dashboard.html',
      english: '/dashboards/english-dashboard.html',
      security: '/dashboards/security-dashboard.html',
      sso: '/dashboards/sso-dashboard.html',
      dean: '/dashboards/dean-dashboard.html',
    };
    return res.json({ authenticated: true, role: account.role, redirect: roleRedirects[account.role] || '/club-login' });
  }

  const studentAccount = mongoReady ? await StudentAccount.findOne({ email }).lean().catch((error) => {
    console.error('Student login failed:', error.name);
    return null;
  }) : null;
  if (studentAccount && typeof password === 'string' && clubPasswordMatches(password, studentAccount)) {
    if (!await clearLoginSourceFailures(req, res)) return;
    await recordSuccessfulSignIn('student', studentAccount.email);
    setStudentSessionCookie(req, res, studentAccount);
    return res.json({ authenticated: true, role: 'student', redirect: '/' });
  }

  if (await countLoginSourceFailure(req, res)) return;
  return res.status(401).json({ message: 'Incorrect email or password.' });
});

app.post('/api/admin/setup', (req, res) => {
  if (hasAdminPassword()) {
    return res.status(409).json({ message: 'Admin password is already configured.' });
  }
  if (!isLoopbackRequest(req)) {
    return res.status(403).json({ message: 'Initial admin setup is only allowed from this computer.' });
  }

  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password, confirmPassword } = req.body;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid admin email address.' });
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 200 || password !== confirmPassword) {
    return res.status(400).json({ message: 'Use a password of at least 12 characters and confirm it correctly.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  sessionSecret = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  adminCredentials = {
    email,
    salt,
    passwordHash: crypto.scryptSync(password, salt, 64).toString('hex'),
    sessionSecret
  };
  writeJsonFile(adminCredentialsFile, adminCredentials);
  setAdminSessionCookie(req, res);
  res.status(201).json({ authenticated: true });
});

app.post('/api/admin/login', async (req, res) => {
  if (!hasAdminPassword()) {
    return res.status(503).json({ message: 'Complete the one-time admin password setup first.' });
  }
  if (await checkLoginSourceLock(req, res)) return;
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  let passwordValid = false;
  if (emailMatches(email) && typeof req.body.password === 'string') {
    try {
      passwordValid = await passwordMatches(req.body.password);
    } catch (error) {
      console.error('Admin login failed:', error.name);
      return res.status(503).json({ message: 'Admin login is temporarily unavailable.' });
    }
  }
  if (!passwordValid) {
    if (await countLoginSourceFailure(req, res)) return;
    return res.status(401).json({ message: 'Incorrect email or password.' });
  }

  if (!await clearLoginSourceFailures(req, res)) return;
  await recordSuccessfulSignIn('admin', email);
  setAdminSessionCookie(req, res);
  res.json({ authenticated: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'miu_admin=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/');
  res.status(204).end();
});

const PASSWORD_RESET_TTL_MS = 20 * 60 * 1000;
const PASSWORD_RECOVERY_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RECOVERY_MAX_REQUESTS = 10;
const PASSWORD_RECOVERY_MESSAGE = 'If an account exists for this email, a password reset link has been sent.';

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function getPasswordRecoveryTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !EMAIL_FROM) return null;
  const port = Number(SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

function getPasswordResetBaseUrl() {
  if (!process.env.APP_BASE_URL) return null;
  try {
    const baseUrl = new URL(process.env.APP_BASE_URL);
    if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) return null;
    if ((process.env.NODE_ENV === 'production' || process.env.VERCEL) && baseUrl.protocol !== 'https:') return null;
    return baseUrl.origin;
  } catch {
    return null;
  }
}

async function limitPasswordResetRequests(req, res, next) {
  if (!mongoReady) {
    return res.status(503).json({ message: 'Password recovery is temporarily unavailable. Please try again later.' });
  }

  const now = Date.now();
  const sourceHash = loginAttemptKey(req);
  const resetWindow = {
    $or: [
      { $eq: [{ $ifNull: ['$windowStart', null] }, null] },
      { $lte: ['$windowStart', new Date(now - PASSWORD_RECOVERY_WINDOW_MS)] }
    ]
  };
  const updates = [
    {
      $set: {
        sourceHash,
        windowStart: { $cond: [resetWindow, new Date(now), '$windowStart'] },
        count: { $cond: [resetWindow, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] },
        expiresAt: new Date(now + PASSWORD_RECOVERY_WINDOW_MS)
      }
    }
  ];

  try {
    let entry;
    try {
      entry = await PasswordRecoveryRateLimit.findOneAndUpdate({ sourceHash }, updates, { upsert: true, new: true }).lean();
    } catch (error) {
      if (error.code !== 11000) throw error;
      entry = await PasswordRecoveryRateLimit.findOneAndUpdate({ sourceHash }, updates, { new: true }).lean();
    }
    if (entry.count > PASSWORD_RECOVERY_MAX_REQUESTS) {
      return res.status(429).json({ message: 'Too many password recovery requests. Please try again in 15 minutes.' });
    }
    next();
  } catch (error) {
    console.error('Password recovery rate limit failed:', error.name);
    res.status(503).json({ message: 'Password recovery is temporarily unavailable. Please try again later.' });
  }
}

async function findRecoverableAccount(email) {
  const isAdmin = hasAdminPassword() && emailMatches(email);
  const studentAccount = mongoReady ? await StudentAccount.findOne({ email }).select('email').lean() : null;
  const clubAccount = mongoReady
    ? await ClubAccount.findOne({ email }).select('email').lean()
    : clubAccounts.find((account) => account.email === email);
  if (isAdmin && (clubAccount || studentAccount)) return null;
  if (isAdmin) return 'admin';
  if (studentAccount && clubAccount) return null;
  if (studentAccount) return 'student';
  return clubAccount ? 'club' : null;
}

app.post('/api/password-reset/request', limitPasswordResetRequests, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ message: 'Enter your email address.' });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  const transporter = getPasswordRecoveryTransport();
  const baseUrl = getPasswordResetBaseUrl();
  if (!transporter || !baseUrl || !mongoReady) {
    return res.status(503).json({ message: 'Password recovery is temporarily unavailable. Please try again later.' });
  }

  let accountType;
  try {
    accountType = await findRecoverableAccount(email);
    if (!accountType) return res.json({ message: PASSWORD_RECOVERY_MESSAGE });

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    try {
      await PasswordResetToken.findOneAndUpdate(
        { accountType, email },
        { $set: { accountType, email, tokenHash, expiresAt } },
        { upsert: true, new: true, runValidators: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      await PasswordResetToken.findOneAndUpdate(
        { accountType, email },
        { $set: { tokenHash, expiresAt } },
        { new: true, runValidators: true }
      );
    }

    const resetUrl = new URL('/pages/reset-password.html', baseUrl);
    resetUrl.searchParams.set('token', token);
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: 'Reset Your Password — Student Club Portal',
        text: `Hello,\n\nWe received a request to reset the password for your Student Club Portal account.\n\nOpen this link to create a new password:\n${resetUrl.toString()}\n\nThis link expires in 20 minutes and can only be used once. If you did not request a password reset, you can safely ignore this email.`,
        html: `<p>Hello,</p><p>We received a request to reset the password for your Student Club Portal account.</p><p><a href="${resetUrl.toString()}">Reset your password</a></p><p>This link expires in 20 minutes and can only be used once. If you did not request a password reset, you can safely ignore this email.</p>`
      });
    } catch (error) {
      try {
        await PasswordResetToken.deleteOne({ accountType, email, tokenHash });
      } catch (cleanupError) {
        console.error('Failed password reset cleanup:', cleanupError.name);
      }
      console.error('Password reset email delivery failed:', error.name);
      return res.status(503).json({ message: 'Password recovery is temporarily unavailable. Please try again later.' });
    }

    return res.json({ message: PASSWORD_RECOVERY_MESSAGE });
  } catch (error) {
    console.error('Password recovery request failed:', error.name);
    return res.status(503).json({ message: 'Password recovery is temporarily unavailable. Please try again later.' });
  }
});

app.post('/api/password-reset/confirm', limitPasswordResetRequests, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
  const newPassword = req.body.newPassword;
  const confirmPassword = req.body.confirmPassword;

  if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 200) {
    return res.status(400).json({ message: 'Password must be between 12 and 200 characters.' });
  }
  if (newPassword !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match.' });
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return res.status(400).json({ message: 'This password reset link is no longer valid. Please request a new one.' });
  }

  const tokenHash = hashResetToken(token);
  try {
    const tokenRecord = await PasswordResetToken.findOne({ tokenHash }).lean();
    if (!tokenRecord) {
      return res.status(400).json({ message: 'This password reset link is no longer valid. Please request a new one.' });
    }
    if (tokenRecord.expiresAt <= new Date()) {
      await PasswordResetToken.deleteOne({ _id: tokenRecord._id });
      return res.status(400).json({ message: 'This password reset link has expired. Please request a new one.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
    const now = new Date();
    let updatedAccount = null;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const consumed = await PasswordResetToken.findOneAndDelete({ tokenHash, expiresAt: { $gt: new Date() } })
          .session(session).lean();
        if (!consumed) {
          const invalidTokenError = new Error('RESET_TOKEN_UNAVAILABLE');
          invalidTokenError.code = 'RESET_TOKEN_UNAVAILABLE';
          throw invalidTokenError;
        }

        if (tokenRecord.accountType === 'club') {
          updatedAccount = await ClubAccount.findOneAndUpdate(
            { email: tokenRecord.email },
            { $set: { salt, passwordHash, passwordChangedAt: now }, $inc: { sessionVersion: 1 } },
            { new: true, session }
          ).lean();
          if (!updatedAccount) throw new Error('RESET_ACCOUNT_UNAVAILABLE');
        } else if (tokenRecord.accountType === 'student') {
          updatedAccount = await StudentAccount.findOneAndUpdate(
            { email: tokenRecord.email },
            { $set: { salt, passwordHash }, $inc: { sessionVersion: 1 } },
            { new: true, session }
          ).lean();
          if (!updatedAccount) throw new Error('RESET_ACCOUNT_UNAVAILABLE');
        } else if (tokenRecord.accountType === 'admin'
          && hasAdminPassword() && emailMatches(tokenRecord.email)) {
          updatedAccount = await AdminAuthState.findOneAndUpdate(
            { email: tokenRecord.email },
            { $set: { email: tokenRecord.email, salt, passwordHash, passwordChangedAt: now }, $inc: { sessionVersion: 1 } },
            { upsert: true, new: true, session, runValidators: true }
          ).lean();
        } else {
          throw new Error('RESET_ACCOUNT_UNAVAILABLE');
        }
      });
    } finally {
      await session.endSession();
    }

    if (tokenRecord.accountType === 'club' && updatedAccount) {
      const accountIndex = clubAccounts.findIndex((account) => account.email === updatedAccount.email);
      if (accountIndex >= 0) clubAccounts[accountIndex] = updatedAccount;
      try {
        writePrivateClubAccountsFile();
      } catch (error) {
        console.error('Club credential cache update failed:', error.name);
      }
    } else if (tokenRecord.accountType === 'admin' && updatedAccount) {
      adminAuthState = updatedAccount;
    }
    res.json({ message: 'Your password has been reset successfully. Please sign in with your new password.' });
  } catch (error) {
    if (error.code === 'RESET_TOKEN_UNAVAILABLE') {
      return res.status(400).json({ message: 'This password reset link is no longer valid. Please request a new one.' });
    }
    console.error('Password reset failed:', error.name);
    res.status(503).json({ message: 'Password reset is temporarily unavailable. Please try again later.' });
  }
});

app.use('/api/admin', requireAdmin);

app.get('/api/admin/visitor-analytics', async (req, res) => {
  if (!mongoReady || mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'Visitor analytics are unavailable while MongoDB is disconnected.' });
  }
  try {
    const activeSince = new Date(Date.now() - 5 * 60 * 1000);
    const [uniqueVisitors, uniqueIpAddresses, activeRecords] = await Promise.all([
      SiteVisitor.countDocuments(),
      SiteNetwork.countDocuments(),
      SiteVisitor.find({ lastSeenAt: { $gte: activeSince } })
        .select('visitorId deviceType accountType accountEmail accountName accountLabel lastSeenAt')
        .sort({ lastSeenAt: -1 }).lean(),
    ]);
    const peopleByIdentity = new Map();
    for (const record of activeRecords) {
      const accountType = record.accountType || 'guest';
      const accountEmail = String(record.accountEmail || '').toLowerCase();
      const identityKey = accountType !== 'guest' && accountEmail ? `account:${accountEmail}` : `guest:${record.visitorId}`;
      let person = peopleByIdentity.get(identityKey);
      if (!person) {
        person = {
          accountType,
          name: record.accountName || `Guest visitor ${String(record.visitorId).slice(-6)}`,
          email: accountEmail,
          label: record.accountLabel || (accountType === 'guest' ? 'Not signed in' : 'Signed in'),
          deviceType: record.deviceType || 'unknown',
          lastSeenAt: record.lastSeenAt
        };
        peopleByIdentity.set(identityKey, person);
      }
    }
    const activePeople = [...peopleByIdentity.values()];
    const activeSignedInAccounts = activePeople.filter((person) => person.accountType !== 'guest').length;
    const activeGuestVisitors = activePeople.length - activeSignedInAccounts;
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      uniqueVisitors,
      uniqueIpAddresses,
      activeVisitors: activePeople.length,
      activeSignedInAccounts,
      activeGuestVisitors,
      activePeople,
      activeWindowMinutes: 5
    });
  } catch (error) {
    console.error('Admin visitor analytics failed:', error.name);
    res.status(503).json({ message: 'Could not load visitor analytics right now.' });
  }
});

app.get('/api/admin/system/data-status', async (req, res) => {
  if (!mongoReady || mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'MongoDB is not connected. Live database totals are unavailable.' });
  }

  try {
    const [
      totalClubs, activeClubs, archivedClubs, clubContent, applicationsByStatus,
      contentByType, contentByStatus, attendanceByStatus, eventRegistrations,
      attendanceSessions, clubAccounts, studentAccounts, studentEmailCodes,
      passwordResetTokens, loginAttempts, auditLogs, siteSettings, adminAccounts,
      namedMemberProfiles, memberTotals
    ] = await Promise.all([
      Club.countDocuments(),
      Club.countDocuments({ $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }] }),
      Club.countDocuments({ archivedAt: { $ne: null } }),
      Club.aggregate([{ $group: { _id: null, events: { $sum: { $size: { $ifNull: ['$events', []] } } }, booths: { $sum: { $size: { $ifNull: ['$booths', []] } } }, posts: { $sum: { $size: { $ifNull: ['$posts', []] } } }, sponsors: { $sum: { $size: { $ifNull: ['$sponsors', []] } } } } }]),
      Application.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      ContentRequest.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      ContentRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      AttendanceRecord.aggregate([{ $group: { _id: '$approvalStatus', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      EventRegistration.countDocuments(), AttendanceSession.countDocuments(),
      ClubAccount.countDocuments(), StudentAccount.countDocuments(), StudentEmailCode.countDocuments(),
      PasswordResetToken.countDocuments(), LoginAttempt.countDocuments(), AuditLog.countDocuments(),
      SiteSetting.countDocuments(), AdminAuthState.countDocuments(),
      Club.aggregate([{ $unwind: '$memberRoster' }, { $count: 'count' }]),
      Club.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ['$members', 0] } } } }])
    ]);

    const countMap = (rows) => Object.fromEntries(rows.map((row) => [row._id || 'unknown', row.count]));
    const embeddedContent = clubContent[0] || { events: 0, booths: 0, posts: 0, sponsors: 0 };
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      checkedAt: new Date().toISOString(),
      database: { connected: true, state: 'connected' },
      sections: [
        { title: 'Clubs and homepage', count: totalClubs, detail: `${activeClubs} active · ${archivedClubs} archived`, methods: 'GET /api/clubs · GET/PUT /api/admin/homepage · POST /api/admin/clubs · PATCH /api/admin/clubs/:id · archive/restore/order routes' },
        { title: 'Club members', count: namedMemberProfiles[0]?.count || 0, detail: `${memberTotals[0]?.total || 0} total members across club rosters`, methods: 'GET /api/admin/club-members · GET/POST /api/club/members (club login required)' },
        { title: 'Applications', count: Object.values(countMap(applicationsByStatus)).reduce((sum, value) => sum + value, 0), detail: Object.entries(countMap(applicationsByStatus)).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'No applications', methods: 'GET /api/admin/applications · POST /api/applications · PATCH status · DELETE application' },
        { title: 'Events, booths, posts, and sponsors', count: Object.values(embeddedContent).reduce((sum, value) => sum + value, 0), detail: `Events ${embeddedContent.events} · booths ${embeddedContent.booths} · posts ${embeddedContent.posts} · sponsors ${embeddedContent.sponsors}; ${Object.values(countMap(contentByType)).reduce((sum, value) => sum + value, 0)} workflow requests`, methods: 'GET /api/clubs · GET/POST /api/club/content · POST event/feed/sponsor/booth · PUT/DELETE content item' },
        { title: 'Content approval workflow', count: Object.values(countMap(contentByStatus)).reduce((sum, value) => sum + value, 0), detail: Object.entries(countMap(contentByStatus)).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'No requests', methods: 'GET /api/committee/requests · POST /api/committee/requests/:id/action · Entry Permits: PR → Security Office → Dean; other content: PR → English → Dean' },
        { title: 'Event attendance', count: await AttendanceRecord.countDocuments(), detail: `${attendanceSessions} QR sessions · ${eventRegistrations} event registrations · ${Object.entries(countMap(attendanceByStatus)).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'no review records'}`, methods: 'GET /api/club/attendance-events · POST /api/club/attendance-sessions · POST /api/attendance/:token · GET attendance records/reviews · POST approval' },
        { title: 'Accounts and sign-in', count: clubAccounts + studentAccounts + adminAccounts, detail: `${clubAccounts} club/committee · ${studentAccounts} student · ${adminAccounts} admin accounts`, methods: 'POST /api/admin/login · POST /api/auth/login · POST /api/student-auth/google · session checks' },
        { title: 'Security and recovery', count: studentEmailCodes + passwordResetTokens + loginAttempts, detail: `${studentEmailCodes} verification codes · ${passwordResetTokens} reset tokens · ${loginAttempts} login protection records`, methods: 'POST /api/password-reset/request · POST /api/password-reset/confirm · email verification · login rate limits' },
        { title: 'Site settings and audit log', count: siteSettings + auditLogs, detail: `${siteSettings} settings records · ${auditLogs} audit records`, methods: 'GET /api/admin/homepage · administrative changes' }
      ]
    });
  } catch (error) {
    console.error('Admin data status check failed:', error.name);
    res.status(503).json({ message: 'Could not read all database sections. Refresh to try again.' });
  }
});

app.get('/api/admin/clubs/:id/committee-availability', (req, res) => {
  const clubId = Number(req.params.id);
  const availability = getCommitteeAvailability(clubId);
  if (!availability) return res.status(404).json({ message: 'Club not found.' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(availability);
});

app.put('/api/admin/clubs/:id/committee-availability', async (req, res) => {
  const clubId = Number(req.params.id);
  if (!clubs.some((club) => club.id === clubId)) return res.status(404).json({ message: 'Club not found.' });
  await updateCommitteeAvailability(clubId, req.body.committees, res);
});

app.get('/api/admin/club-views', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(clubs.map((club) => ({
    clubId: Number(club.id),
    name: club.name,
    views: Number(clubViews[String(club.id)] || 0)
  })));
});

app.get('/api/admin/event-analytics', async (req, res) => {
  if (!mongoReady || mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'Live database analytics are unavailable while MongoDB is disconnected.' });
  }
  try {
    const [clubRecords, registrations, attendance] = await Promise.all([
      Club.find({ archivedAt: null }).select('id name events').sort({ name: 1 }).lean(),
      EventRegistration.find({}).select('clubId eventIndex eventTitle').lean(),
      AttendanceRecord.find({ itemType: 'event' }).select('clubId eventRequestId eventTitle').lean()
    ]);
    const registrationCounts = new Map();
    for (const registration of registrations) {
      const key = `${Number(registration.clubId)}:${Number(registration.eventIndex)}`;
      registrationCounts.set(key, (registrationCounts.get(key) || 0) + 1);
    }
    const attendanceCounts = new Map();
    for (const record of attendance) {
      const clubId = Number(record.clubId);
      const titleKey = `${clubId}:${String(record.eventTitle || '').trim().toLocaleLowerCase()}`;
      attendanceCounts.set(titleKey, (attendanceCounts.get(titleKey) || 0) + 1);
      const requestId = Number(record.eventRequestId);
      if (requestId > 0) {
        const requestKey = `${clubId}:request:${requestId}`;
        attendanceCounts.set(requestKey, (attendanceCounts.get(requestKey) || 0) + 1);
      }
    }
    const events = clubRecords.flatMap((club) => (Array.isArray(club.events) ? club.events : []).map((event, eventIndex) => {
      const title = String(event.title || 'Untitled event');
      const requestId = Number(event.requestId);
      const checkIns = requestId > 0
        ? attendanceCounts.get(`${Number(club.id)}:request:${requestId}`) || 0
        : attendanceCounts.get(`${Number(club.id)}:${title.trim().toLocaleLowerCase()}`) || 0;
      return {
        clubId: Number(club.id), clubName: club.name || 'Club', eventIndex,
        title, date: String(event.date || ''),
        views: Math.max(0, Number(eventViews[requestId > 0 ? `${Number(club.id)}:request:${requestId}` : `${Number(club.id)}:${eventIndex}`]) || 0),
        registrations: registrationCounts.get(`${Number(club.id)}:${eventIndex}`) || 0,
        checkIns
      };
    }));
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      totals: events.reduce((total, event) => ({
        views: total.views + event.views,
        registrations: total.registrations + event.registrations,
        checkIns: total.checkIns + event.checkIns
      }), { views: 0, registrations: 0, checkIns: 0 }),
      events: events.sort((a, b) => b.views - a.views || b.registrations - a.registrations || a.title.localeCompare(b.title))
    });
  } catch (error) {
    console.error('Admin event analytics failed:', error.name);
    res.status(503).json({ message: 'Could not load event analytics right now.' });
  }
});

app.get('/api/admin/club-members', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getClubMemberDirectory());
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load club member rosters right now.' });
  }
});

app.get('/api/admin/clubs/archived', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const records = mongoReady
      ? (await Club.find({ archivedAt: { $ne: null } }).sort({ archivedAt: -1, name: 1 }).lean()).map(toApiRecord)
      : clubs.filter((club) => Boolean(club.archivedAt)).sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
    res.json(records);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load archived clubs right now.' });
  }
});

app.get('/api/admin/applications', async (req, res) => {
  try {
    const records = mongoReady
      ? (await Application.find().sort({ id: -1 }).lean()).map(toApiRecord)
      : applications.map(toApiRecord);
    res.setHeader('Cache-Control', 'no-store');
    res.json(records);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.patch('/api/admin/applications/:id/status', async (req, res) => {
  const appId = Number(req.params.id);
  const { status, notes, rating } = req.body;
  const updates = {};
  if (['pending', 'accepted', 'rejected'].includes(status)) updates.status = status;
  if (notes !== undefined) updates.notes = String(notes).slice(0, 2000);
  if (rating !== undefined) updates.rating = Math.max(0, Math.min(5, Number(rating) || 0));
  if (notes !== undefined || rating !== undefined || status === 'accepted' || status === 'rejected') {
    updates.interviewed = true;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ message: 'Provide a valid application update.' });

  try {
    if (!requireLiveDatabase(res)) return;
    const updated = await Application.findOneAndUpdate({ id: appId }, { $set: updates }, { new: true }).lean();
    if (!updated) return res.status(404).json({ message: 'Application not found.' });
    const cached = applications.find((item) => item.id === appId);
    if (cached) Object.assign(cached, updates);
    return res.json(toApiRecord(updated));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.delete('/api/admin/applications/:id', async (req, res) => {
  const appId = Number(req.params.id);
  const applicationIndex = applications.findIndex((item) => item.id === appId);
  if (applicationIndex < 0) return res.status(404).json({ message: 'Application not found.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const result = await Application.deleteOne({ id: appId });
    if (!result.deletedCount) return res.status(404).json({ message: 'Application not found.' });
    applications.splice(applicationIndex, 1);
    res.status(204).end();
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.get('/api/admin/club-heads', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(clubAccounts
    .filter((account) => account.role === 'head')
    .map(({ clubId, email, committee }) => ({
      clubId,
      clubName: clubs.find((club) => club.id === clubId)?.name || `Club ${clubId}`,
      email,
      committee
    })));
});

app.post('/api/admin/club-heads', async (req, res) => {
  const clubId = Number(req.body.clubId);
  const club = clubs.find((item) => item.id === clubId);
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const committee = cleanText(req.body.committee, 100);
  const password = req.body.password;
  if (!club) return res.status(404).json({ message: 'Club not found.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid head email address.' });
  if (!committee) return res.status(400).json({ message: 'Enter the committee this head will manage.' });
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    return res.status(400).json({ message: 'Use a password between 12 and 200 characters.' });
  }
  if (clubAccounts.some((account) => account.email === email)) {
    return res.status(409).json({ message: 'That email already has a club portal account.' });
  }
  if (clubAccounts.some((account) => account.clubId === clubId && account.role === 'head'
    && account.committee.toLowerCase() === committee.toLowerCase())) {
    return res.status(409).json({ message: 'This committee already has a head.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const account = {
    clubId,
    email,
    salt,
    passwordHash: crypto.scryptSync(password, salt, 64).toString('hex'),
    role: 'head',
    committee
  };
  try {
    if (!requireLiveDatabase(res)) return;
    await ClubAccount.create({ ...account });
    clubAccounts.push(account);
    writePrivateClubAccountsFile();
    // The password is shown exactly once here and never stored again.
    res.status(201).json({ clubId, clubName: club.name, email, committee, role: 'head', temporaryPassword: password });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(error.code === 11000 ? 409 : 503).json({
      message: error.code === 11000 ? 'That email already has a club portal account.' : 'Could not create this committee head.'
    });
  }
});

app.patch('/api/admin/club-heads/:email', async (req, res) => {
  const oldEmail = String(req.params.email || '').trim().toLowerCase();
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const committee = cleanText(req.body.committee, 100);
  const password = req.body.password;
  const accountIndex = clubAccounts.findIndex((account) => account.role === 'head' && account.email === oldEmail);
  if (accountIndex < 0) return res.status(404).json({ message: 'Committee head not found.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid head email address.' });
  if (!committee) return res.status(400).json({ message: 'Enter the committee this head will manage.' });
  if (password !== undefined && password !== ''
    && (typeof password !== 'string' || password.length < 12 || password.length > 200)) {
    return res.status(400).json({ message: 'Use a password between 12 and 200 characters, or leave it blank to keep the current password.' });
  }
  if (clubAccounts.some((account, index) => index !== accountIndex && account.email === email)) {
    return res.status(409).json({ message: 'That email already has a club portal account.' });
  }
  const currentAccount = clubAccounts[accountIndex];
  if (clubAccounts.some((account, index) => index !== accountIndex && account.clubId === currentAccount.clubId
    && account.role === 'head' && account.committee.toLowerCase() === committee.toLowerCase())) {
    return res.status(409).json({ message: 'Another head already manages this committee.' });
  }
  const oldCommittee = currentAccount.committee;
  const updates = { email, committee };
  if (typeof password === 'string' && password.length) {
    updates.salt = crypto.randomBytes(16).toString('hex');
    updates.passwordHash = crypto.scryptSync(password, updates.salt, 64).toString('hex');
  }

  try {
    if (!requireLiveDatabase(res)) return;
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      if (oldCommittee !== committee) {
        await Application.updateMany(
          { clubId: currentAccount.clubId, committee: oldCommittee },
          { $set: { committee } },
          { session }
        );
      }
      const updated = await ClubAccount.findOneAndUpdate(
        { clubId: currentAccount.clubId, email: oldEmail, role: 'head' },
        { $set: Object.fromEntries(Object.entries(updates).filter(([key]) => key !== 'password')) },
        { new: true, runValidators: true, session }
      );
      if (!updated) throw new Error('HEAD_NOT_FOUND');
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally {
      await session.endSession();
    }
    Object.assign(currentAccount, updates);
    if (oldCommittee !== committee) {
      for (const application of applications) {
        if (application.clubId === currentAccount.clubId && application.committee === oldCommittee) application.committee = committee;
      }
    }
    writePrivateClubAccountsFile();
    res.json({ clubId: currentAccount.clubId, email, committee, role: 'head' });
  } catch (error) {
    if (error.message === 'HEAD_NOT_FOUND') return res.status(404).json({ message: 'Committee head not found.' });
    console.error('Database operation failed:', error.name);
    res.status(error.code === 11000 ? 409 : 503).json({
      message: error.code === 11000 ? 'That email already has a club portal account.' : 'Could not update this committee head.'
    });
  }
});

app.delete('/api/admin/club-heads/:email', async (req, res) => {
  const email = String(req.params.email || '').trim().toLowerCase();
  const accountIndex = clubAccounts.findIndex((account) => account.role === 'head' && account.email === email);
  if (accountIndex < 0) return res.status(404).json({ message: 'Committee head not found.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const account = clubAccounts[accountIndex];
    const result = await ClubAccount.deleteOne({ clubId: account.clubId, email, role: 'head' });
    if (!result.deletedCount) return res.status(404).json({ message: 'Committee head not found.' });
    clubAccounts.splice(accountIndex, 1);
    writePrivateClubAccountsFile();
    res.status(204).end();
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not delete this committee head.' });
  }
});

app.get('/api/admin/club-credentials', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // Passwords are never returned — only the account email so access can be contacted.
  res.json(clubs.map((club) => {
    const account = clubAccounts.find((item) => item.clubId === club.id && item.role === 'president');
    return {
      clubId: club.id,
      clubName: club.name,
      email: account?.email || ''
    };
  }).filter((account) => account.email));
});

app.get('/admin/club-credentials', requireAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'private', 'admin-club-credentials.html'));
});

app.get('/admin/global', requireAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'private', 'global-admin.html'));
});

app.get('/api/admin/homepage', async (req, res) => {
  try {
    if (mongoReady) {
      const settings = await SiteSetting.findOne({ key: 'homepage' }).lean();
      if (settings) homepageSettings = { title: settings.title, subtitle: settings.subtitle };
    }
    res.json(homepageSettings);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.put('/api/admin/homepage', async (req, res) => {
  const title = cleanText(req.body.title, 100);
  const subtitle = cleanText(req.body.subtitle, 240);

  if (!title || !subtitle) {
    return res.status(400).json({ message: 'A homepage title and subtitle are required.' });
  }

  try {
    if (!requireLiveDatabase(res)) return;
    const savedSettings = await SiteSetting.findOneAndUpdate(
      { key: 'homepage' },
      { $set: { title, subtitle } },
      { upsert: true, new: true, runValidators: true }
    );
    if (!savedSettings) throw new Error('Homepage settings were not saved.');
    homepageSettings = { title: savedSettings.title, subtitle: savedSettings.subtitle };
    res.json(homepageSettings);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.post('/api/admin/clubs', async (req, res) => {
  const nextId = clubs.reduce((largestId, club) => Math.max(largestId, club.id), 0) + 1;
  const email = typeof req.body.clubLoginEmail === 'string' ? req.body.clubLoginEmail.trim().toLowerCase() : '';
  const password = req.body.clubInitialPassword;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid Club Login Email.' });
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    return res.status(400).json({ message: 'Use an Initial Password between 12 and 200 characters.' });
  }
  if (emailMatches(email)) {
    return res.status(409).json({ message: 'This email is already associated with an account.' });
  }
  try {
    const existingAccount = mongoReady
      ? await ClubAccount.findOne({ email }).select('_id').lean()
      : clubAccounts.find((account) => account.email === email);
    if (existingAccount) return res.status(409).json({ message: 'This email is already associated with an account.' });
  } catch (error) {
    console.error('Club account validation failed:', error.name);
    return res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }

  if (!requireLiveDatabase(res)) return;
  let club;
  try {
    club = await makeClub(req.body, null, nextId);
    if (!club) {
      return res.status(400).json({ message: 'Complete the required fields and upload a valid image.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const account = {
      clubId: nextId,
      email,
      salt,
      passwordHash: crypto.scryptSync(password, salt, 64).toString('hex'),
      sessionVersion: 0,
      role: 'president',
      committee: ''
    };
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      await Club.create([club], { session });
      await ClubAccount.create([account], { session });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally {
      await session.endSession();
    }
    clubs.push(club);
    clubAccounts.push(account);
    try {
      writePrivateClubAccountsFile();
    } catch (error) {
      console.error('Club credential cache update failed:', error.name);
    }
    res.status(201).json(club);
  } catch (error) {
    if (club) await removeClubImage(club);
    console.error('Database operation failed:', error.name);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This email is already associated with an account.' });
    }
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.put('/api/admin/clubs/order', async (req, res) => {
  const orderedIds = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : [];
  const activeClubs = clubs.filter((club) => !club.archivedAt);
  const currentIds = activeClubs.map((club) => club.id);

  if (!Array.isArray(orderedIds) || orderedIds.length !== currentIds.length
    || new Set(orderedIds).size !== currentIds.length
    || orderedIds.some((id) => !currentIds.includes(id))) {
    return res.status(400).json({ message: 'Provide every club ID exactly once.' });
  }

  const orderedClubs = orderedIds.map((id, index) => ({
    ...activeClubs.find((club) => club.id === id),
    sortOrder: index + 1
  }));

  try {
    if (!requireLiveDatabase(res)) return;
    await Club.bulkWrite(orderedClubs.map((club) => ({
      updateOne: {
        filter: { id: club.id },
        update: { $set: { sortOrder: club.sortOrder } }
      }
    })));
    const orderedById = new Map(orderedClubs.map((club) => [club.id, club]));
    clubs = clubs.map((club) => orderedById.get(club.id) || club);
    res.json(orderedClubs);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.patch('/api/admin/clubs/:id', async (req, res) => {
  const clubId = Number(req.params.id);
  const clubIndex = clubs.findIndex((item) => item.id === clubId);

  if (clubIndex < 0) {
    return res.status(404).json({ message: 'Club not found.' });
  }

  const previousClub = clubs[clubIndex];
  let updatedClub;
  try {
    if (!requireLiveDatabase(res)) return;
    updatedClub = await makeClub(req.body, previousClub, clubId);
    if (!updatedClub) {
      return res.status(400).json({ message: 'Complete the required fields and upload a valid image.' });
    }
    const savedClub = await Club.findOneAndUpdate({ id: clubId }, { $set: updatedClub }, { new: true });
    if (!savedClub) return res.status(404).json({ message: 'Club not found.' });
    clubs[clubIndex] = updatedClub;
    if (previousClub.image !== updatedClub.image) await removeClubImage(previousClub);
    res.json(updatedClub);
  } catch (error) {
    if (updatedClub && updatedClub.image !== previousClub.image) await removeClubImage(updatedClub);
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.post('/api/admin/clubs/:id/archive', async (req, res) => {
  const clubId = Number(req.params.id);
  const clubIndex = clubs.findIndex((item) => item.id === clubId);

  if (clubIndex < 0) {
    return res.status(404).json({ message: 'Club not found.' });
  }

  try {
    if (!requireLiveDatabase(res)) return;
    if (clubs[clubIndex].archivedAt) return res.status(409).json({ message: 'This club is already archived.' });
    const archivedAt = new Date();
    const updated = await Club.findOneAndUpdate(
      { id: clubId, archivedAt: null },
      { $set: { archivedAt } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ message: 'Club not found or already archived.' });
    clubs[clubIndex] = { ...clubs[clubIndex], archivedAt };
    res.json(toApiRecord(updated));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.post('/api/admin/clubs/:id/restore', async (req, res) => {
  const clubId = Number(req.params.id);
  const clubIndex = clubs.findIndex((item) => item.id === clubId);
  if (clubIndex < 0) return res.status(404).json({ message: 'Club not found.' });

  try {
    if (!requireLiveDatabase(res)) return;
    if (!clubs[clubIndex].archivedAt) return res.status(409).json({ message: 'This club is already active.' });
    const updated = await Club.findOneAndUpdate(
      { id: clubId, archivedAt: { $ne: null } },
      { $set: { archivedAt: null } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ message: 'Archived club not found.' });
    clubs[clubIndex] = { ...clubs[clubIndex], archivedAt: null };
    res.json(toApiRecord(updated));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.get('/api/club/applications', requireClubAuth, async (req, res) => {
  const clubId = req.clubAccount.clubId;
  try {
    const records = mongoReady
      ? (await Application.find({ clubId, ...(req.clubAccount.role === 'head' ? { committee: req.clubAccount.committee } : {}) }).sort({ id: 1 }).lean()).map(toApiRecord)
      : applications.filter((application) => accountCanReviewApplication(req.clubAccount, application)).map(toApiRecord);
    res.json(records);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.get('/api/club/:id/applications', requireClubAuth, async (req, res) => {
  const clubId = Number(req.params.id);
  if (clubId !== req.clubAccount.clubId) return res.status(403).json({ message: 'This club account cannot access another club.' });
  try {
    const filtered = mongoReady
      ? (await Application.find({ clubId, ...(req.clubAccount.role === 'head' ? { committee: req.clubAccount.committee } : {}) }).sort({ id: 1 }).lean()).map(toApiRecord)
      : applications.filter((application) => accountCanReviewApplication(req.clubAccount, application)).map(toApiRecord);
    res.json(filtered);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.get('/api/applications', requireAdmin, async (req, res) => {
  try {
    const records = mongoReady
      ? (await Application.find().sort({ id: 1 }).lean()).map(toApiRecord)
      : applications.map(toApiRecord);
    res.json(records);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.post('/api/applications', async (req, res) => {
  const payload = req.body;
  const clubId = Number(payload.clubId);
  let selectedClub;
  try {
    selectedClub = mongoReady
      ? await Club.findOne({ id: clubId, archivedAt: null }).lean()
      : clubs.find((club) => club.id === clubId && !club.archivedAt);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    return res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }

  if (!selectedClub) {
    return res.status(404).json({ message: 'Club not found or no longer accepting applications.' });
  }
  if (selectedClub.status !== 'open') {
    return res.status(409).json({ message: 'Applications are not open for this club.' });
  }
  const committee = cleanText(payload.committee, 100);
  if (!committee || !clubAccounts.some((account) => account.clubId === clubId
    && account.role === 'head' && account.committee === committee)) {
    return res.status(409).json({ message: 'This committee is not accepting applications yet.' });
  }
  const committeeStatus = getCommitteeApplicationStatus(selectedClub, committee);
  if (committeeStatus !== 'open') {
    return res.status(409).json({ message: committeeStatus === 'full'
      ? 'This committee is full and is not accepting applications.'
      : 'This committee is closed and is not accepting applications.' });
  }

  const photoMatch = typeof payload.photo === 'string'
    ? payload.photo.match(/^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+=*)$/)
    : null;
  if (!photoMatch) {
    return res.status(400).json({ message: 'A PNG, JPG, or WebP applicant photo is required.' });
  }
  const photoBuffer = Buffer.from(photoMatch[2], 'base64');
  if (!photoBuffer.length || photoBuffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ message: 'Applicant photo must be 5 MB or smaller.' });
  }

  const submittedAnswers = Array.isArray(payload.answers) ? payload.answers : [];
  const answers = [];
  for (const field of selectedClub.applicationFields || []) {
    const submitted = submittedAnswers.find((answer) => answer.key === field.key);
    const value = cleanText(submitted?.value, 2000);
    if (field.required && !value) {
      return res.status(400).json({ message: `${field.label} is required.` });
    }
    if (field.type === 'select' && value && !field.options.includes(value)) {
      return res.status(400).json({ message: `Choose a valid option for ${field.label}.` });
    }
    answers.push({ key: field.key, label: field.label, value });
  }

  const newApplication = {
    id: Date.now(),
    studentName: payload.studentName,
    email: payload.email,
    universityId: payload.universityId,
    major: payload.major,
    phone: payload.phone,
    slot: payload.slot,
    clubId,
    committee,
    age: payload.age,
    motivation: payload.motivation,
    notes: payload.notes || '',
    rating: payload.rating || 0,
    interviewed: false,
    status: 'pending',
    photo: payload.photo || '',
    answers
  };

  const managementToken = generateMyFormCode();
  newApplication.managementTokenHash = hashMyFormToken(managementToken);

  try {
    if (!requireLiveDatabase(res)) return;
    await Application.create(newApplication);
    applications.unshift(newApplication);
    res.status(201).json({ application: toApiRecord(newApplication), managementToken });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.post('/api/my-forms/access', limitMyFormAccessAttempts, (req, res) => {
  const token = getMyFormToken(req);
  const application = applications.find((item) => canManageMyForm(item, token));
  if (!application) return res.status(404).json({ message: 'That My Forms code was not found.' });
  res.json({ application: toApiRecord(application), canEdit: !application.interviewed && application.status === 'pending' });
});

app.get('/api/my-forms/:id', limitMyFormAccessAttempts, (req, res) => {
  const token = getMyFormToken(req);
  const application = applications.find((item) => item.id === Number(req.params.id) && canManageMyForm(item, token));
  if (!application) return res.status(404).json({ message: 'This form could not be found.' });
  res.json({ application: toApiRecord(application), canEdit: !application.interviewed && application.status === 'pending' });
});

app.patch('/api/my-forms/:id', limitMyFormAccessAttempts, async (req, res) => {
  const token = getMyFormToken(req);
  const application = applications.find((item) => item.id === Number(req.params.id) && canManageMyForm(item, token));
  if (!application) return res.status(404).json({ message: 'This form could not be found.' });
  if (application.interviewed || application.status !== 'pending') {
    return res.status(409).json({ message: 'This form can no longer be edited because its interview process has started.' });
  }

  let selectedClub;
  try {
    selectedClub = mongoReady
      ? await Club.findOne({ id: application.clubId, archivedAt: null }).select('applicationFields committeeAvailability').lean()
      : clubs.find((club) => club.id === application.clubId && !club.archivedAt);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    return res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
  const updates = {};
  const textFields = [
    ['studentName', 160], ['email', 254], ['universityId', 80], ['major', 120],
    ['phone', 40], ['slot', 120], ['age', 10], ['motivation', 2000], ['notes', 2000]
  ];
  for (const [field, maxLength] of textFields) {
    if (req.body[field] !== undefined) updates[field] = cleanText(req.body[field], maxLength);
  }
  if (req.body.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email || '')) {
    return res.status(400).json({ message: 'Enter a valid university email.' });
  }
  if (req.body.committee !== undefined) {
    const committee = cleanText(req.body.committee, 100);
    if (!committee || !clubAccounts.some((account) => account.clubId === application.clubId
      && account.role === 'head' && account.committee === committee)) {
      return res.status(409).json({ message: 'This committee is not accepting applications anymore.' });
    }
    const committeeStatus = getCommitteeApplicationStatus(selectedClub, committee);
    if (committee !== application.committee && committeeStatus !== 'open') {
      return res.status(409).json({ message: committeeStatus === 'full'
        ? 'This committee is full and cannot be selected.'
        : 'This committee is closed and cannot be selected.' });
    }
    updates.committee = committee;
  }
  if (req.body.answers !== undefined) {
    if (!Array.isArray(req.body.answers)) return res.status(400).json({ message: 'Check your form answers.' });
    const submittedAnswers = req.body.answers;
    updates.answers = [];
    for (const field of selectedClub?.applicationFields || []) {
      const submitted = submittedAnswers.find((answer) => answer.key === field.key);
      const value = cleanText(submitted?.value, 2000);
      if (field.required && !value) return res.status(400).json({ message: `${field.label} is required.` });
      if (field.type === 'select' && value && !field.options.includes(value)) {
        return res.status(400).json({ message: `Choose a valid option for ${field.label}.` });
      }
      updates.answers.push({ key: field.key, label: field.label, value });
    }
  }
  if (req.body.photo !== undefined) {
    const photoMatch = typeof req.body.photo === 'string'
      ? req.body.photo.match(/^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+=*)$/)
      : null;
    if (!photoMatch) return res.status(400).json({ message: 'Choose a PNG, JPG, or WebP photo.' });
    const photoBuffer = Buffer.from(photoMatch[2], 'base64');
    if (!photoBuffer.length || photoBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ message: 'Applicant photo must be 5 MB or smaller.' });
    }
    updates.photo = req.body.photo;
  }

  try {
    if (!requireLiveDatabase(res)) return;
    const updated = await Application.findOneAndUpdate(
      { id: application.id, managementTokenHash: hashMyFormToken(token), interviewed: { $ne: true }, status: 'pending' },
      { $set: updates },
      { new: true }
    ).lean();
    if (!updated) return res.status(409).json({ message: 'This form can no longer be edited because its interview process has started.' });
    Object.assign(application, updates);
    return res.json(toApiRecord(updated));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.delete('/api/my-forms/:id', limitMyFormAccessAttempts, async (req, res) => {
  const token = getMyFormToken(req);
  const applicationIndex = applications.findIndex((item) => item.id === Number(req.params.id) && canManageMyForm(item, token));
  if (applicationIndex < 0) return res.status(404).json({ message: 'This form could not be found.' });
  const application = applications[applicationIndex];
  if (application.interviewed || application.status !== 'pending') {
    return res.status(409).json({ message: 'This form can no longer be removed because its interview process has started.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const result = await Application.deleteOne({
      id: application.id,
      managementTokenHash: hashMyFormToken(token),
      interviewed: { $ne: true },
      status: 'pending'
    });
    if (!result.deletedCount) return res.status(409).json({ message: 'This form can no longer be removed because its interview process has started.' });
    applications.splice(applicationIndex, 1);
    res.status(204).end();
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.patch('/api/applications/:id/status', requireClubAuth, async (req, res) => {
  const appId = Number(req.params.id);
  const { status, notes, rating } = req.body;
  const app = applications.find(item => item.id === appId);

  if (!app) {
    return res.status(404).json({ message: 'Application not found' });
  }
  if (!accountCanReviewApplication(req.clubAccount, app)) {
    return res.status(403).json({ message: 'This account cannot access applications for another committee.' });
  }

  const updates = {};
  if (['pending', 'accepted', 'rejected'].includes(status)) updates.status = status;
  if (notes !== undefined) updates.notes = String(notes).slice(0, 2000);
  if (rating !== undefined) updates.rating = Math.max(0, Math.min(5, Number(rating) || 0));
  if (req.body.photo !== undefined) {
    const photoMatch = typeof req.body.photo === 'string'
      ? req.body.photo.match(/^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+=*)$/)
      : null;
    if (!photoMatch) return res.status(400).json({ message: 'Choose a PNG, JPG, or WebP applicant photo.' });
    const photoBuffer = Buffer.from(photoMatch[2], 'base64');
    if (!photoBuffer.length || photoBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ message: 'Applicant photo must be 5 MB or smaller.' });
    }
    updates.photo = req.body.photo;
  }
  try {
    if (Array.isArray(req.body.interviewAnswers)) {
      const club = mongoReady
        ? await Club.findOne({ id: req.clubAccount.clubId }).select('interviewForms').lean()
        : clubs.find((item) => item.id === req.clubAccount.clubId);
      const scope = getInterviewFormScope(req.clubAccount);
      const form = (club?.interviewForms || []).find((item) => item.scope === scope);
      const questions = (form?.sections || []).flatMap((section) => section.questions || []);
      const submittedAnswers = new Map(req.body.interviewAnswers.map((answer) => [String(answer.key), answer.value]));
      const interviewAnswers = questions.map((question) => ({
        key: question.key,
        label: question.label,
        value: cleanText(submittedAnswers.get(question.key), 2000)
      }));
      const missingRequired = questions.find((question) => question.required
        && !interviewAnswers.find((answer) => answer.key === question.key)?.value);
      if (missingRequired) {
        return res.status(400).json({ message: `Answer “${missingRequired.label}” before saving.` });
      }
      const priorEvaluation = (app.interviewEvaluations || []).find((entry) => entry.scope === scope);
      const activeKeys = new Set(questions.map((question) => question.key));
      const archivedAnswers = (priorEvaluation?.answers || []).filter((answer) => !activeKeys.has(answer.key));
      const evaluations = (app.interviewEvaluations || []).filter((entry) => entry.scope !== scope);
      evaluations.push({ scope, answers: [...interviewAnswers, ...archivedAnswers] });
      updates.interviewEvaluations = evaluations;
    }
    if (notes !== undefined || rating !== undefined || Array.isArray(req.body.interviewAnswers)
      || status === 'accepted' || status === 'rejected') {
      updates.interviewed = true;
    }
    if (!requireLiveDatabase(res)) return;
    const updatedApplication = await Application.findOneAndUpdate({ id: appId }, { $set: updates }, { new: true }).lean();
    if (!updatedApplication) return res.status(404).json({ message: 'Application not found.' });
    Object.assign(app, updates);
    return res.json(toApiRecord(updatedApplication));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.delete('/api/applications/:id', requireClubAuth, async (req, res) => {
  const appId = Number(req.params.id);
  const applicationIndex = applications.findIndex((item) => item.id === appId);
  if (applicationIndex < 0) return res.status(404).json({ message: 'Application not found.' });
  if (!accountCanReviewApplication(req.clubAccount, applications[applicationIndex])) {
    return res.status(403).json({ message: 'This account cannot access applications for another committee.' });
  }

  try {
    if (!requireLiveDatabase(res)) return;
    const result = await Application.deleteOne({ id: appId });
    if (!result.deletedCount) return res.status(404).json({ message: 'Application not found.' });
    applications.splice(applicationIndex, 1);
    res.status(204).end();
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.get('/club.html', (req, res) => res.redirect(301, '/club-details.html'));
app.get('/apply.html', (req, res) => res.redirect(301, '/club-application.html'));
app.get('/committee.html', (req, res) => res.redirect(301, '/committee-dashboard.html'));
app.get(['/admin', '/club-login', '/club-dashboard'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/club-application.html', (req, res) => {
  const clubId = Number(req.query.id);
  res.redirect(302, Number.isInteger(clubId) && clubId > 0 ? `/?apply=${clubId}` : '/');
});
app.get('/committee-dashboard.html', (req, res) => res.redirect(302, '/club-login'));
app.get('/attendance', (req, res) => res.sendFile(path.join(__dirname, 'public', 'attendance.html')));

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'API endpoint not found.' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const isMalformedJson = error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, 'body');
  const status = isMalformedJson ? 400 : error.status === 413 ? 413 : 500;
  if (status === 500) console.error('Request failed:', error.name || 'Error');
  if (req.path.startsWith('/api/')) {
    const message = isMalformedJson ? 'The request contains invalid JSON.'
      : status === 413 ? 'The uploaded data is too large.'
      : 'Something went wrong. Please try again.';
    return res.status(status).json({ message });
  }
  if (isMalformedJson) return res.status(status).send('The request contains invalid JSON.');
  res.status(status).sendFile(path.join(__dirname, 'public', '500.html'));
});

const connectMongo = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.log('MONGO_URI is not configured. Using local demo data.');
      return;
    }

    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    await initializeMongoData();
    mongoReady = true;
    console.log('MongoDB connected successfully');
  } catch (error) {
    mongoReady = false;
    await mongoose.disconnect().catch(() => {});
    console.error('MongoDB unavailable; using local demo data:', error.name);
    const safeMongoError = (message) => String(message || '').replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '<redacted MongoDB URI>');
    console.error('MongoDB connection details:', safeMongoError(error.message));
    if (error.reason?.servers) {
      for (const [address, server] of error.reason.servers) {
        console.error(`MongoDB server ${address}: ${server.error?.name || server.type}${server.error?.message ? ` — ${safeMongoError(server.error.message)}` : ''}`);
      }
    }
  }
};

const startServer = async () => {
  await connectMongo();
  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });

  server.on('error', async (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Use the existing site or stop its process before restarting.`);
    } else {
      console.error('Server failed to start:', error.name);
    }
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
};

let connectPromise = null;
function ensureReady() {
  if (!connectPromise) connectPromise = connectMongo();
  return connectPromise;
}

if (require.main === module) {
  startServer();
} else {
  ensureReady();
}

module.exports = app;
module.exports.ensureReady = ensureReady;
