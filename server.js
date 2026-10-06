const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { Club, Application, SiteSetting, ClubAccount, ContentRequest } = require('./models');
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

const dataDirectory = path.join(__dirname, 'data');
const clubsFile = path.join(dataDirectory, 'clubs.json');
const homepageFile = path.join(dataDirectory, 'homepage.json');
const adminCredentialsFile = path.join(dataDirectory, 'admin.json');
const clubAccountsFile = path.join(dataDirectory, 'club-accounts.json');
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
  role: account.role === 'head' || account.role === 'pr' || account.role === 'english' || account.role === 'dean' ? account.role : 'president',
  committee: typeof account.committee === 'string' ? account.committee : ''
}));

function writePrivateClubAccountsFile() {
  const previousAccounts = readJsonFile(clubAccountsFile, []);
  const previousByEmail = new Map(previousAccounts.map((account) => [account.email, account]));
  const previousByHash = new Map(previousAccounts.map((account) => [account.passwordHash, account]));
  const privateAccounts = clubAccounts.map((account) => {
    const previous = previousByEmail.get(account.email) || previousByHash.get(account.passwordHash);
    return {
      ...account,
      ...(account.password || previous?.password ? { password: account.password || previous.password } : {})
    };
  });
  writeJsonFile(clubAccountsFile, privateAccounts);
}

const clubPasswords = new Map(clubAccounts.map((account) => [account.clubId, account.password || '']));
let mongoReady = false;
let homepageSettings = readJsonFile(homepageFile, {
  title: 'University Clubs',
  subtitle: 'Explore all clubs and apply to the ones that match your interests.'
});
let adminCredentials = readJsonFile(adminCredentialsFile, null);
let sessionSecret = process.env.ADMIN_SESSION_SECRET || adminCredentials?.sessionSecret || crypto.randomBytes(32).toString('hex');

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

function passwordMatches(password) {
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const expectedHash = crypto.scryptSync(process.env.ADMIN_PASSWORD, 'miu-admin-env', 64);
    const providedHash = crypto.scryptSync(password, 'miu-admin-env', 64);
    return crypto.timingSafeEqual(expectedHash, providedHash);
  }

  if (!adminCredentials?.salt || !adminCredentials?.passwordHash) return false;
  const expectedHash = Buffer.from(adminCredentials.passwordHash, 'hex');
  const providedHash = crypto.scryptSync(password, adminCredentials.salt, expectedHash.length);
  return expectedHash.length === providedHash.length && crypto.timingSafeEqual(expectedHash, providedHash);
}

function emailMatches(email) {
  const expectedEmail = process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD
    ? process.env.ADMIN_EMAIL.trim().toLowerCase()
    : adminCredentials?.email;
  return typeof email === 'string' && email.trim().toLowerCase() === expectedEmail;
}

function createAdminSession() {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const signature = crypto.createHmac('sha256', sessionSecret).update(String(expiresAt)).digest('hex');
  return `${expiresAt}.${signature}`;
}

function isAdminSessionValid(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  const adminCookie = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith('miu_admin='));
  if (!adminCookie) return false;

  const [expiresAt, signature] = adminCookie.slice('miu_admin='.length).split('.');
  const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(String(expiresAt)).digest('hex');
  if (!/^\d+$/.test(expiresAt || '') || Number(expiresAt) < Date.now() || !/^[a-f0-9]{64}$/.test(signature || '')) return false;

  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
}

function setAdminSessionCookie(req, res) {
  const secure = req.secure ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `miu_admin=${createAdminSession()}; Max-Age=28800; HttpOnly; SameSite=Strict; Path=/;${secure}`);
}

function requireAdmin(req, res, next) {
  if (!hasAdminPassword()) {
    return res.status(503).json({ message: 'Admin password setup is required.' });
  }
  if (!isAdminSessionValid(req)) {
    return res.status(401).json({ message: 'Admin login required.' });
  }
  next();
}

function clubPasswordMatches(password, account) {
  if (typeof password !== 'string') return false;
  if (typeof account?.password === 'string' && account.password) {
    const expectedPlaintext = Buffer.from(account.password);
    const providedPlaintext = Buffer.from(password);
    if (expectedPlaintext.length === providedPlaintext.length
      && crypto.timingSafeEqual(expectedPlaintext, providedPlaintext)) return true;
  }
  if (!account?.salt || !account?.passwordHash) return false;
  const expectedHash = Buffer.from(account.passwordHash, 'hex');
  const providedHash = crypto.scryptSync(password, account.salt, expectedHash.length);
  return expectedHash.length === providedHash.length && crypto.timingSafeEqual(expectedHash, providedHash);
}

function createClubSession(account) {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const encodedEmail = Buffer.from(account.email).toString('base64url');
  const payload = `${account.clubId}.${encodedEmail}.${expiresAt}`;
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

function getClubAccountFromRequest(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  const clubCookie = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith('miu_club='));
  if (!clubCookie) return null;

  const cookieParts = clubCookie.slice('miu_club='.length).split('.');
  const [clubIdText] = cookieParts;
  let expiresText;
  let signature;
  let payload;
  let account;

  if (cookieParts.length === 4) {
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
  return account;
}

function setClubSessionCookie(req, res, account) {
  const secure = req.secure ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `miu_club=${createClubSession(account)}; Max-Age=28800; HttpOnly; SameSite=Strict; Path=/;${secure}`);
}

function requireClubAuth(req, res, next) {
  const account = getClubAccountFromRequest(req);
  if (!account) return res.status(401).json({ message: 'Club login required.' });
  req.clubAccount = account;
  next();
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
  await Promise.all([Club.init(), Application.init(), SiteSetting.init()]);
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
        update: { $setOnInsert: { clubId, email, salt, passwordHash, role: role === 'head' || role === 'pr' || role === 'english' || role === 'dean' ? role : 'president', committee: committee || '' } },
        upsert: true
      }
    })));
  }
  await ClubAccount.updateMany(
    { role: { $exists: false } },
    { $set: { role: 'president', committee: '' } }
  );

  let homepageRecord = await SiteSetting.findOne({ key: 'homepage' });
  if (!homepageRecord) {
    homepageRecord = await SiteSetting.create({ key: 'homepage', ...homepageSettings });
  }
  homepageSettings = { title: homepageRecord.title, subtitle: homepageRecord.subtitle };

  clubs = (await Club.find().sort({ sortOrder: 1, id: 1 }).lean()).map((record, index) => ({
    ...toApiRecord(record),
    sortOrder: Number.isFinite(Number(record.sortOrder)) ? Number(record.sortOrder) : index + 1,
    pinned: record.pinned === true && record.status === 'open'
  }));
  applications = await Application.find().sort({ id: 1 }).lean();
  const privatePasswordsByEmail = new Map(readJsonFile(clubAccountsFile, [])
    .filter((account) => account.email && typeof account.password === 'string')
    .map((account) => [account.email, account.password]));
  clubAccounts = (await ClubAccount.find().sort({ clubId: 1, role: 1, committee: 1 }).lean()).map((account) => ({
    ...toApiRecord(account),
    password: privatePasswordsByEmail.get(account.email) || '',
    role: account.role === 'head' || account.role === 'pr' || account.role === 'english' || account.role === 'dean' ? account.role : 'president',
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
      ? (await Club.find().sort({ sortOrder: 1, id: 1 }).lean()).map(toApiRecord)
      : clubs;
    res.json(records);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.get('/api/admin/session', (req, res) => {
  res.json({
    configured: hasAdminPassword(),
    authenticated: hasAdminPassword() && isAdminSessionValid(req)
  });
});

app.get('/api/club-auth/session', (req, res) => {
  const account = getClubAccountFromRequest(req);
  if (account && ['pr', 'english', 'dean'].includes(account.role)) {
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

app.post('/api/club-auth/login', (req, res) => {
  if (!clubAccounts.length) {
    return res.status(503).json({ message: 'Club accounts are not seeded yet. Run npm run seed.' });
  }

  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const account = clubAccounts.find((item) => item.email === email);
  if (!account || !clubPasswordMatches(req.body.password, account)) {
    return res.status(401).json({ message: 'Incorrect club email or password.' });
  }

  setClubSessionCookie(req, res, account);
  res.json({ authenticated: true });
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

app.get('/api/clubs/:id/committees', (req, res) => {
  const clubId = Number(req.params.id);
  if (!clubs.some((club) => club.id === clubId)) return res.status(404).json({ message: 'Club not found.' });
  const committees = [...new Set(clubAccounts
    .filter((account) => account.clubId === clubId && account.role === 'head' && account.committee)
    .map((account) => account.committee))];
  res.json(committees);
});

app.get('/api/club/heads', requireClubAuth, requireClubPresident, (req, res) => {
  res.json(clubAccounts
    .filter((account) => account.clubId === req.clubAccount.clubId && account.role === 'head')
    .map(({ email, committee }) => ({ email, committee })));
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
    if (mongoReady) {
      const savedClub = await Club.findOneAndUpdate(
        { id: req.clubAccount.clubId },
        { $set: { applicationIntro, applicationFields } },
        { new: true, runValidators: true }
      ).lean();
      if (!savedClub) return res.status(404).json({ message: 'Club not found.' });
    }
    club.applicationIntro = applicationIntro;
    club.applicationFields = applicationFields;
    if (!mongoReady) writeJsonFile(clubsFile, clubs);
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
    const club = mongoReady
      ? await Club.findOne({ id: req.clubAccount.clubId }).select('interviewForms').lean()
      : clubs.find((item) => item.id === req.clubAccount.clubId);
    if (!club) return res.status(404).json({ message: 'Club not found.' });
    const interviewForms = (club.interviewForms || []).filter((item) => item.scope !== scope);
    interviewForms.push({ scope, sections });
    if (mongoReady) {
      const savedClub = await Club.findOneAndUpdate(
        { id: req.clubAccount.clubId },
        { $set: { interviewForms } },
        { new: true, runValidators: true }
      ).lean();
      if (!savedClub) return res.status(404).json({ message: 'Club not found.' });
    }
    club.interviewForms = interviewForms;
    if (!mongoReady) writeJsonFile(clubsFile, clubs);
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
    password,
    role: 'head',
    committee
  };
  try {
    const databaseAccount = { ...account };
    delete databaseAccount.password;
    if (mongoReady) await ClubAccount.create(databaseAccount);
    clubAccounts.push(account);
    writePrivateClubAccountsFile();
    res.status(201).json({ email, committee, role: 'head' });
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
    updates.password = password;
  }

  try {
    if (mongoReady) {
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
    if (mongoReady) {
      await ClubAccount.deleteOne({ clubId: req.clubAccount.clubId, email, role: 'head' });
    }
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
  if (!['pr', 'english', 'dean'].includes(role)) {
    return res.status(403).json({ message: 'Committee access only.' });
  }
  next();
}

const committeeStage = { pr: 'pending_pr', english: 'pending_english', dean: 'pending_dean' };
const committeeRoleLabels = { pr: 'PR Department', english: 'English Department', dean: 'Dean' };

function shapeClubContentRecord(record) {
  const { _id, __v, ...rest } = record;
  const privateReturnEvents = (rest.workflowHistory || []).filter((event) => event.role === 'dean'
    && ['returned_to_pr', 'returned_to_english'].includes(event.action));
  const privateReturnComments = new Set(privateReturnEvents.map((event) => event.comment).filter(Boolean));
  rest.workflowHistory = (rest.workflowHistory || []).map((event) => privateReturnComments.has(event.comment)
    && ['returned_to_pr', 'returned_to_english'].includes(event.action) ? { ...event, comment: '' } : event);
  rest.commentHistory = (rest.commentHistory || []).filter((entry) => entry.role !== 'dean' || !privateReturnComments.has(entry.text));
  if (rest.comments?.dean) {
    rest.comments = { ...rest.comments, dean: rest.comments.dean.split('\n').filter((line) => !privateReturnComments.has(line)).join('\n') };
  }
  rest.clubNotice = String(rest.clubNotice || '').replace(/^(Dean returned the event to .*?) with this comment:.*$/, '$1 for another review.');
  return rest;
}

function appendCommitteeComment(record, role, text) {
  if (!text || !['pr', 'english', 'dean'].includes(role)) return;
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

function committeeNextStage(role, action) {
  if (role === 'pr' && action === 'approve') return 'pending_english';
  if (role === 'english' && action === 'approve') return 'pending_dean';
  if (role === 'dean' && action === 'approve') return 'published';
  if ((role === 'dean' || role === 'pr') && action === 'delete') return 'deleted';
  if (action === 'reject') return 'rejected';
  if (action === 'request_edit') return 'changes_requested';
  return null;
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
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const type = req.body.type === 'event' ? 'event' : 'post';
    const title = cleanText(req.body.title, 140);
    const description = cleanText(req.body.description, 2000);
    if (!title) return res.status(400).json({ message: 'Enter a title.' });
    const club = clubs.find((item) => item.id === req.clubAccount.clubId);
    const last = await ContentRequest.findOne().sort({ id: -1 }).lean();
    const record = await ContentRequest.create({
      id: (last?.id || 0) + 1,
      clubId: req.clubAccount.clubId,
      clubName: club?.name || '',
      type,
      title,
      description,
      date: cleanText(req.body.date, 40),
      time: cleanText(req.body.time, 40),
      location: cleanText(req.body.location, 120),
      budget: cleanText(req.body.budget, 80),
      image: typeof req.body.image === 'string' ? req.body.image.slice(0, 4 * 1024 * 1024) : '',
      status: req.body.submit === true ? 'pending_pr' : 'draft',
      clubNotice: req.body.submit === true ? 'Club submitted a new event for PR review.' : ''
    });
    if (req.body.submit === true) appendWorkflowEvent(record, 'club', 'submitted', 'draft', 'pending_pr', '', req.clubAccount);
    if (req.body.submit === true) await record.save();
    const { _id, __v, ...rest } = record.toObject();
    res.status(201).json(rest);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not save content right now.' });
  }
});

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
    if (req.body.type === 'event' || req.body.type === 'post') record.type = req.body.type;
    record.title = cleanText(req.body.title, 140) || record.title;
    if (req.body.description !== undefined) record.description = cleanText(req.body.description, 2000);
    if (req.body.date !== undefined) record.date = cleanText(req.body.date, 40);
    if (req.body.time !== undefined) record.time = cleanText(req.body.time, 40);
    if (req.body.location !== undefined) record.location = cleanText(req.body.location, 120);
    if (req.body.budget !== undefined) record.budget = cleanText(req.body.budget, 80);
    if (typeof req.body.image === 'string') record.image = req.body.image.slice(0, 4 * 1024 * 1024);
    if (record.status === 'changes_requested' && !record.editRequestedBy && record.comments?.english) {
      record.resubmitTo = 'pending_english';
    }
    if (req.body.submit === true) {
      const fromStatus = record.editRequestedBy ? 'changes_requested' : record.status;
      const targetStage = record.editRequestedBy ? committeeStage[record.editRequestedBy] : (record.resubmitTo || 'pending_pr');
      const isFirstSubmission = !(record.workflowHistory || []).some((event) => ['submitted', 'resubmitted'].includes(event.action));
      record.status = targetStage;
      record.resubmitTo = 'pending_pr';
      record.clubNotice = `${isFirstSubmission ? 'Club submitted a new event' : 'Club resubmitted the updated event'}. Waiting for ${targetStage === 'pending_pr' ? 'PR Department' : 'English Department'} review.`;
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
    if (record.status === 'deleted') return res.status(409).json({ message: 'This event was deleted by the Dean and is retained in the review history.' });
    await ContentRequest.deleteOne({ _id: record._id });
    if (record.status === 'published') {
      await Club.updateOne({ id: record.clubId }, record.type === 'event'
        ? { $pull: { events: { title: record.title, date: record.date } } }
        : { $pull: { posts: { title: record.title, date: record.date } } });
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
    const records = await ContentRequest.find({ status: stage }).sort({ id: -1 }).lean();
    res.json(records.map((record) => { const { _id, __v, ...rest } = record; return rest; }));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load requests right now.' });
  }
});

app.get('/api/committee/status', requireClubAuth, requireCommitteeRole, async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const records = await ContentRequest.find({})
      .select('id clubName type title date time status image submittedAt publishedAt clubNotice editRequestedBy comments commentHistory hiddenCommentRoles')
      .sort({ id: -1 })
      .lean();
    res.json(records.map((record) => { const { _id, __v, ...rest } = record; return rest; }));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load event statuses right now.' });
  }
});

app.get('/api/committee/status/:id', requireClubAuth, requireCommitteeRole, async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id) }).lean();
    if (!record) return res.status(404).json({ message: 'Request not found.' });
    const { _id, __v, ...rest } = record;
    res.json(rest);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load request details right now.' });
  }
});

app.post('/api/committee/requests/:id/reopen', requireClubAuth, requireCommitteeRole, async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const role = req.clubAccount.role;
    if (!['pr', 'english'].includes(role)) return res.status(403).json({ message: 'Only PR or English can restart the review process.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id) });
    if (!record) return res.status(404).json({ message: 'Request not found.' });
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
    record.clubNotice = `${committeeRoleLabels[role]} restarted review and sent this note: ${comment}`;
    appendWorkflowEvent(record, role, 'restarted_review', fromStatus, record.status, comment, req.clubAccount);
    record.publishedAt = undefined;

    if (wasPublished) {
      const club = await Club.findOne({ id: record.clubId });
      if (club) {
        const matchesRequest = (item) => Number(item.requestId) === Number(record.id)
          || (!item.requestId && item.title === record.title && item.date === record.date && item.description === record.description);
        if (record.type === 'event') club.events = (club.events || []).filter((item) => !matchesRequest(item));
        else club.posts = (club.posts || []).filter((item) => !matchesRequest(item));
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
    if (req.clubAccount.role !== 'dean') return res.status(403).json({ message: 'Only the Dean can return an event to a committee.' });
    const targetRole = req.body.target === 'pr' ? 'pr' : req.body.target === 'english' ? 'english' : null;
    if (!targetRole) return res.status(400).json({ message: 'Choose PR or English as the review destination.' });
    const comment = cleanText(req.body.comment, 2000);
    if (!comment) return res.status(400).json({ message: 'Add a comment explaining why the event is being returned.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id) });
    if (!record) return res.status(404).json({ message: 'Request not found.' });
    if (!['pending_dean', 'published'].includes(record.status)) {
      return res.status(409).json({ message: 'Only an event waiting for the Dean or already published can be returned.' });
    }

    const fromStatus = record.status;
    const wasPublished = fromStatus === 'published';
    const nextStatus = committeeStage[targetRole];
    appendWorkflowEvent(record, 'dean', `returned_to_${targetRole}`, fromStatus, nextStatus, comment, req.clubAccount);
    record.status = nextStatus;
    record.resubmitTo = nextStatus;
    record.editRequestedBy = '';
    record.skipEnglishOnNextPrApproval = targetRole === 'pr';
    record.publishedAt = undefined;
    record.clubNotice = `Dean returned the event to ${committeeRoleLabels[targetRole]} for another review.`;

    if (wasPublished) {
      const club = await Club.findOne({ id: record.clubId });
      if (club) {
        const matchesRequest = (item) => Number(item.requestId) === Number(record.id)
          || (!item.requestId && item.title === record.title && item.date === record.date && item.description === record.description);
        if (record.type === 'event') club.events = (club.events || []).filter((item) => !matchesRequest(item));
        else club.posts = (club.posts || []).filter((item) => !matchesRequest(item));
        await club.save();
      }
    }
    await record.save();
    const { _id, __v, ...rest } = record.toObject();
    res.json(rest);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not return the event to committee review.' });
  }
});

app.delete('/api/committee/requests/:id', requireClubAuth, requireCommitteeRole, async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    if (req.clubAccount.role !== 'dean') return res.status(403).json({ message: 'Only the Dean can delete an event or feed post.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id) });
    if (!record) return res.status(404).json({ message: 'Request not found.' });
    if (record.status === 'deleted') return res.status(409).json({ message: 'This content has already been deleted.' });

    const previousStatus = record.status;
    const club = await Club.findOne({ id: record.clubId });
    if (club) {
      const matchesRequest = (item) => Number(item.requestId) === Number(record.id)
        || (!item.requestId && item.title === record.title && item.date === record.date && item.description === record.description);
      if (record.type === 'event') club.events = (club.events || []).filter((item) => !matchesRequest(item));
      else club.posts = (club.posts || []).filter((item) => !matchesRequest(item));
      await club.save();
    }
    record.status = 'deleted';
    record.deletedAt = new Date();
    record.publishedAt = undefined;
    record.editRequestedBy = '';
    record.skipEnglishOnNextPrApproval = false;
    record.clubNotice = `Dean deleted this ${record.type === 'event' ? 'event' : 'feed post'}.`;
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
    const role = req.clubAccount.role;
    if (!['pr', 'english', 'dean'].includes(role)) {
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
    const expected = committeeStage[req.clubAccount.role];
    const action = ['approve', 'reject', 'request_edit', 'comment', 'delete'].includes(req.body.action) ? req.body.action : null;
    if (!action) return res.status(400).json({ message: 'Choose approve, reject, request edit, comment, or delete.' });
    if (action !== 'comment' && action !== 'delete' && record.status !== expected) return res.status(409).json({ message: 'This request is not waiting for your review.' });
    if (action === 'request_edit' && !['pr', 'english'].includes(req.clubAccount.role)) {
      return res.status(403).json({ message: 'Only PR or English can request edits.' });
    }
    const comment = cleanText(req.body.comment, 2000);
    if (action === 'comment' && !comment) return res.status(400).json({ message: 'Enter a comment before sending.' });
    if (action === 'request_edit' && !comment) return res.status(400).json({ message: 'Add a comment explaining the requested edits.' });
    const fromStatus = record.status;
    if (comment) appendCommitteeComment(record, req.clubAccount.role, comment);
    let nextStatus = action === 'comment' ? record.status : committeeNextStage(req.clubAccount.role, action);
    const skipEnglish = req.clubAccount.role === 'pr' && action === 'approve' && shouldSendPrApprovalToDean(record);
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
    if (action === 'approve' && req.clubAccount.role === 'pr') {
      record.clubNotice = skipEnglish
        ? 'PR approved the event and returned it directly to the Dean.'
        : 'PR approved the event and sent it to the English Department.';
    }
    if (action === 'approve' && req.clubAccount.role === 'english') record.clubNotice = 'English Department approved the event and sent it to the Dean.';
    if (action === 'approve' && req.clubAccount.role === 'dean') record.clubNotice = 'Dean approved the event. It is now published.';
    if (action === 'delete') {
      record.clubNotice = `${roleLabel} deleted this event.`;
      const club = await Club.findOne({ id: record.clubId });
      if (club) {
        if (record.type === 'event') {
          club.events = (club.events || []).filter((e) => e.requestId !== record.id);
        } else {
          club.posts = (club.posts || []).filter((p) => p.requestId !== record.id);
        }
        await club.save();
      }
    }
    if (action === 'request_edit') record.clubNotice = `${roleLabel} requested edits: ${comment}`;
    if (nextStatus === 'published') {
      record.publishedAt = new Date();
      const club = await Club.findOne({ id: record.clubId });
      if (club) {
        const item = {
          requestId: record.id,
          title: record.title,
          date: record.date,
          time: record.time,
          location: record.location,
          budget: record.budget,
          description: record.description,
          image: record.image || club.image
        };
        if (record.type === 'event') club.events.push(item);
        else club.posts.push({ ...item, author: club.name, text: record.description });
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

app.post('/api/auth/login', (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body.password;

  if (emailMatches(email) && typeof password === 'string' && passwordMatches(password)) {
    setAdminSessionCookie(req, res);
    return res.json({ authenticated: true, role: 'admin', redirect: '/admin/global' });
  }

  const account = clubAccounts.find((item) => item.email === email);
  if (account && typeof password === 'string' && clubPasswordMatches(password, account)) {
    setClubSessionCookie(req, res, account);
    const roleRedirects = {
      president: '/club-login',
      head: '/club-login',
      pr: '/dashboards/pr-dashboard.html',
      english: '/dashboards/english-dashboard.html',
      dean: '/dashboards/dean-dashboard.html',
    };
    return res.json({ authenticated: true, role: account.role, redirect: roleRedirects[account.role] || '/club-login' });
  }

  const hasApplication = applications.some((application) => String(application.email || '').trim().toLowerCase() === email);
  if (hasApplication) {
    return res.json({ authenticated: true, role: 'student', redirect: '/' });
  }

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

app.post('/api/admin/login', (req, res) => {
  if (!hasAdminPassword()) {
    return res.status(503).json({ message: 'Complete the one-time admin password setup first.' });
  }
  if (!emailMatches(req.body.email) || typeof req.body.password !== 'string' || !passwordMatches(req.body.password)) {
    return res.status(401).json({ message: 'Incorrect email or password.' });
  }

  setAdminSessionCookie(req, res);
  res.json({ authenticated: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'miu_admin=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/');
  res.status(204).end();
});

app.use('/api/admin', requireAdmin);

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
    if (mongoReady) {
      const updated = await Application.findOneAndUpdate({ id: appId }, { $set: updates }, { new: true }).lean();
      if (!updated) return res.status(404).json({ message: 'Application not found.' });
      const cached = applications.find((item) => item.id === appId);
      if (cached) Object.assign(cached, updates);
      return res.json(toApiRecord(updated));
    }
    const application = applications.find((item) => item.id === appId);
    if (!application) return res.status(404).json({ message: 'Application not found.' });
    Object.assign(application, updates);
    res.json(toApiRecord(application));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.delete('/api/admin/applications/:id', async (req, res) => {
  const appId = Number(req.params.id);
  const applicationIndex = applications.findIndex((item) => item.id === appId);
  if (!mongoReady && applicationIndex < 0) return res.status(404).json({ message: 'Application not found.' });
  try {
    if (mongoReady) {
      const result = await Application.deleteOne({ id: appId });
      if (!result.deletedCount) return res.status(404).json({ message: 'Application not found.' });
    }
    if (applicationIndex >= 0) applications.splice(applicationIndex, 1);
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
    password,
    role: 'head',
    committee
  };
  try {
    const databaseAccount = { ...account };
    delete databaseAccount.password;
    if (mongoReady) await ClubAccount.create(databaseAccount);
    clubAccounts.push(account);
    writePrivateClubAccountsFile();
    res.status(201).json({ clubId, clubName: club.name, email, committee, role: 'head' });
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
    updates.password = password;
  }

  try {
    if (mongoReady) {
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
    const account = clubAccounts[accountIndex];
    if (mongoReady) await ClubAccount.deleteOne({ clubId: account.clubId, email, role: 'head' });
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
  res.json(clubs.map((club) => {
    const account = clubAccounts.find((item) => item.clubId === club.id && item.role === 'president');
    return {
      clubId: club.id,
      clubName: club.name,
      email: account?.email || '',
      password: clubPasswords.get(club.id) || account?.password || ''
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
    homepageSettings = { title, subtitle };
    if (mongoReady) {
      await SiteSetting.findOneAndUpdate({ key: 'homepage' }, { $set: homepageSettings }, { upsert: true, new: true });
    } else {
      writeJsonFile(homepageFile, homepageSettings);
    }
    res.json(homepageSettings);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.post('/api/admin/clubs', async (req, res) => {
  const nextId = clubs.reduce((largestId, club) => Math.max(largestId, club.id), 0) + 1;
  let club;
  try {
    club = await makeClub(req.body, null, nextId);
    if (!club) {
      return res.status(400).json({ message: 'Complete the required fields and upload a valid image.' });
    }

    if (mongoReady) await Club.create(club);
    clubs.push(club);
    if (!mongoReady) writeJsonFile(clubsFile, clubs);
    res.status(201).json(club);
  } catch (error) {
    if (club) await removeClubImage(club);
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.put('/api/admin/clubs/order', async (req, res) => {
  const orderedIds = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : [];
  const currentIds = clubs.map((club) => club.id);

  if (!Array.isArray(orderedIds) || orderedIds.length !== currentIds.length
    || new Set(orderedIds).size !== currentIds.length
    || orderedIds.some((id) => !currentIds.includes(id))) {
    return res.status(400).json({ message: 'Provide every club ID exactly once.' });
  }

  const orderedClubs = orderedIds.map((id, index) => ({
    ...clubs.find((club) => club.id === id),
    sortOrder: index + 1
  }));

  try {
    if (mongoReady) {
      await Club.bulkWrite(orderedClubs.map((club) => ({
        updateOne: {
          filter: { id: club.id },
          update: { $set: { sortOrder: club.sortOrder } }
        }
      })));
    }

    clubs = orderedClubs;
    if (!mongoReady) writeJsonFile(clubsFile, clubs);
    res.json(clubs);
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
    updatedClub = await makeClub(req.body, previousClub, clubId);
    if (!updatedClub) {
      return res.status(400).json({ message: 'Complete the required fields and upload a valid image.' });
    }

    if (mongoReady) {
      const savedClub = await Club.findOneAndUpdate({ id: clubId }, { $set: updatedClub }, { new: true });
      if (!savedClub) return res.status(404).json({ message: 'Club not found.' });
    }

    clubs[clubIndex] = updatedClub;
    if (!mongoReady) writeJsonFile(clubsFile, clubs);
    if (previousClub.image !== updatedClub.image) await removeClubImage(previousClub);
    res.json(updatedClub);
  } catch (error) {
    if (updatedClub && updatedClub.image !== previousClub.image) await removeClubImage(updatedClub);
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.delete('/api/admin/clubs/:id', async (req, res) => {
  const clubId = Number(req.params.id);
  const clubIndex = clubs.findIndex((item) => item.id === clubId);

  if (clubIndex < 0) {
    return res.status(404).json({ message: 'Club not found.' });
  }

  try {
    const deletedClub = clubs[clubIndex];
    if (mongoReady) {
      await Club.deleteOne({ id: clubId });
    } else {
      clubs.splice(clubIndex, 1);
      writeJsonFile(clubsFile, clubs);
    }
    if (mongoReady) clubs.splice(clubIndex, 1);
    await removeClubImage(deletedClub);
    res.status(204).end();
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
  const selectedClub = clubs.find((club) => club.id === clubId);

  if (!selectedClub) {
    return res.status(404).json({ message: 'Club not found.' });
  }
  if (selectedClub.status !== 'open') {
    return res.status(409).json({ message: 'Applications are not open for this club.' });
  }
  const committee = cleanText(payload.committee, 100);
  if (!committee || !clubAccounts.some((account) => account.clubId === clubId
    && account.role === 'head' && account.committee === committee)) {
    return res.status(409).json({ message: 'This committee is not accepting applications yet.' });
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
    if (mongoReady) await Application.create(newApplication);
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

  const selectedClub = clubs.find((club) => club.id === application.clubId);
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
    if (mongoReady) {
      const updated = await Application.findOneAndUpdate(
        { id: application.id, managementTokenHash: hashMyFormToken(token), interviewed: { $ne: true }, status: 'pending' },
        { $set: updates },
        { new: true }
      ).lean();
      if (!updated) return res.status(409).json({ message: 'This form can no longer be edited because its interview process has started.' });
      Object.assign(application, updates);
      return res.json(toApiRecord(updated));
    }
    Object.assign(application, updates);
    res.json(toApiRecord(application));
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
    if (mongoReady) {
      const result = await Application.deleteOne({
        id: application.id,
        managementTokenHash: hashMyFormToken(token),
        interviewed: { $ne: true },
        status: 'pending'
      });
      if (!result.deletedCount) return res.status(409).json({ message: 'This form can no longer be removed because its interview process has started.' });
    }
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
    if (mongoReady) {
      const updatedApplication = await Application.findOneAndUpdate({ id: appId }, { $set: updates }, { new: true }).lean();
      if (!updatedApplication) return res.status(404).json({ message: 'Application not found.' });
      Object.assign(app, updates);
      return res.json(toApiRecord(updatedApplication));
    }

    Object.assign(app, updates);
    res.json(toApiRecord(app));
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
    if (mongoReady) await Application.deleteOne({ id: appId });
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
app.get('/club-application.html', (req, res) => {
  const clubId = Number(req.query.id);
  res.redirect(302, Number.isInteger(clubId) && clubId > 0 ? `/?apply=${clubId}` : '/');
});
app.get('/committee-dashboard.html', (req, res) => res.redirect(302, '/club-login'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
