const express = require('express');
const compression = require('compression');
const { publicClubProjection, registerPublicClubMedia, publicFields, sanitizePublicClub } = require('./services/public-club-media');
const cors = require('cors');
const httpSecurity = require('./services/http-security');
const { validSponsorAttachment } = require('./services/attachment-validation');
const mongoose = require('./database');
const { readAdminSessionData } = require('./services/admin-session-read');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const { verifyPublicCloudinaryImage, verifyCloudinaryUploadResponse } = require('./services/cloudinary-image-validation');
const { validateFeedMedia, MAX_FEED_VIDEO_BYTES, FEED_MEDIA_FOLDER } = require('./services/feed-video');
const { verifyGoogleStudentCredential, decideGoogleAccount, decideGoogleLink } = require('./services/google-auth');
const { createAskAiRouter } = require('./services/ask-ai');
const { describeVisitorDevice, createVisitorDeviceCode } = require('./services/visitor-device');
const { getVisitorIpAddress } = require('./services/visitor-network');
const { parseInteraction, registerFeedbackRoutes } = require('./services/student-feedback');
const { OneSignalApiError, claimOneSignalDispatch, sendOneSignalPush, sendOneSignalEmail } = require('./services/onesignal');
const {
  Club,
  SupervisorReview,
  Application,
  SiteSetting,
  UniversityContent,
  SiteVisitor,
  SiteNetwork,
  SiteVisitorPresence,
  ClubAccount,
  ContentRequest,
  SpeakerRequest,
  SpeakerCvUpload,
  SpeakerInvite,
  EventRegistration,
  AttendanceSession,
  AttendanceActivityClosure,
  AttendanceAssignment,
  AttendanceRecord,
  StudentAccount,
  StudentInterest,
  LoginAttempt,
  PasswordResetToken,
  PasswordRecoveryRateLimit,
  NotificationDispatch,
  AdminAuthState,
  StudentEmailCode,
  AuditLog
} = require('./models');
const { MAX_CV_BYTES, CV_UPLOAD_TTL_MS, requesterKey, resolveSpeakerHosting, speakerInviteTokenHash, publicSpeakerDuplicateKey, validateSpeakerPayload, validatePublicSpeakerInvitePayload, canReviewSpeakerRequest, canClubReviewSpeakerRequest, validClubSpeakerDecision, validSpeakerDecision, speakerResubmissionStatus, validateSpeakerCvAsset, decodeSpeakerCvData } = require('./services/speaker-requests');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 1111;
function getCloudinaryCredentials() {
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    return {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    };
  }
  try {
    const accountUrl = new URL(process.env.CLOUDINARY_URL || '');
    if (accountUrl.protocol !== 'cloudinary:' || !accountUrl.hostname || !accountUrl.username || !accountUrl.password) return null;
    return {
      cloud_name: accountUrl.hostname,
      api_key: decodeURIComponent(accountUrl.username),
      api_secret: decodeURIComponent(accountUrl.password)
    };
  } catch {
    return null;
  }
}

function sendRevalidatedPublicJson(req, res, payload) {
  const body = JSON.stringify(payload);
  const etag = `"${crypto.createHash('sha256').update(body).digest('base64url')}"`;
  res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
  res.setHeader('ETag', etag);
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  res.type('application/json').send(body);
}

const cloudinaryCredentials = getCloudinaryCredentials();
const cloudinaryConfigured = Boolean(cloudinaryCredentials);
const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const cloudinaryFolders = Object.freeze({
  feed: FEED_MEDIA_FOLDER,
  club: 'miu-clubs',
  applicant: 'miu-applicants',
  university: 'miu-university-content'
});
const uploadSignatureAttempts = new Map();
const speakerUploadAttempts = new Map();

if (cloudinaryConfigured) {
  cloudinary.config({
    ...cloudinaryCredentials,
    secure: true
  });
}

// Compress HTML, CSS, JavaScript and JSON for every route. The middleware
// negotiates Accept-Encoding and leaves images/small responses alone.
app.use(compression({ threshold: 1024, level: 4 }));
app.disable('x-powered-by');
app.use(httpSecurity.securityHeaders);
app.use(cors(httpSecurity.sameOriginCors));
app.use('/api', httpSecurity.protectMutations);
// Base64 expands binary images by roughly one third, so allow enough JSON
// request space for an image whose decoded size is capped at 10 MiB.
app.use(express.json({ limit: '15mb' }));
// API responses are always revalidated against their source of truth. In
// particular, browsers and intermediary caches must not reuse old dashboards.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  next();
});
app.use(express.urlencoded({ extended: true }));
app.use('/api', require('./services/security-audit').auditMiddleware({
  model: AuditLog, ready: () => mongoReady, ip: getVisitorIpAddress, adminEmail: getConfiguredAdminEmail
}));
app.use('/api', require('./services/public-abuse-limits').publicAbuseLimits({
  model: PasswordRecoveryRateLimit, ready: () => mongoReady, ip: getVisitorIpAddress, secret: () => sessionSecret
}));

// Public, non-sensitive deployment marker used by installed PWAs to detect a
// newly deployed site while they remain open.
app.get('/api/pwa/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  let localVersion = '';
  if (!process.env.VERCEL_DEPLOYMENT_ID && !process.env.VERCEL_GIT_COMMIT_SHA && !process.env.VERCEL_URL) {
    const hash = crypto.createHash('sha256');
    const roots = ['public', 'services', 'api', 'server.js', 'models.js'];
    const extensions = new Set(['.css', '.html', '.js', '.json', '.webmanifest']);
    const visit = (relativePath) => {
      const absolutePath = path.join(__dirname, relativePath);
      let info;
      try { info = fs.statSync(absolutePath); } catch { return; }
      if (info.isDirectory()) {
        for (const entry of fs.readdirSync(absolutePath).sort()) visit(path.join(relativePath, entry));
      } else if (extensions.has(path.extname(relativePath).toLowerCase())) {
        hash.update(`${relativePath}:${info.size}:${info.mtimeMs};`);
      }
    };
    roots.forEach(visit);
    localVersion = `local-${hash.digest('hex').slice(0, 20)}`;
  }
  res.json({ version: process.env.VERCEL_DEPLOYMENT_ID
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.VERCEL_URL
    || localVersion });
});

function signCloudinaryUpload(folder) {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${folder}-${crypto.randomUUID()}`;
  const params = {
    folder,
    timestamp,
    public_id: publicId,
    overwrite: false
  };
  return {
    cloudName: cloudinaryCredentials.cloud_name,
    apiKey: cloudinaryCredentials.api_key,
    signature: cloudinary.utils.api_sign_request(params, cloudinaryCredentials.api_secret),
    timestamp,
    folder,
    publicId
  };
}

async function readCloudinaryAsset(url, publicId, expectedFolder) {
  if (typeof url !== 'string' || typeof publicId !== 'string') return null;
  try {
    const cloudName = cloudinaryCredentials?.cloud_name;
    const publicIdParts = publicId.split('/');
    const leafId = publicIdParts.at(-1);
    if (!leafId?.startsWith(`${expectedFolder}-`)
      || !new RegExp(`^${expectedFolder}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, 'i').test(leafId)
      || (publicIdParts.length > 2)
      || (publicIdParts.length === 2 && publicIdParts[0] !== expectedFolder)) return null;

    // Cloudinary's Admin API can be unavailable even when a signed browser
    // upload completed. Verify the public asset over HTTPS instead, bounded by
    // the same size and image-format rules as the client upload.
    const verification = await verifyPublicCloudinaryImage(url, publicId, cloudName, MAX_IMAGE_UPLOAD_BYTES);
    if (!verification.valid) {
      console.warn('Cloudinary image verification failed:', verification.reason);
      return null;
    }
    return { url, publicId };
  } catch {
    return null;
  }
}

async function getApplicantPhoto(payload) {
  if (payload?.photoPublicId) {
    if (payload.photoUploadSignature && payload.photoVersion) {
      const verified = verifyCloudinaryUploadResponse(payload.photo, payload.photoPublicId, payload.photoVersion,
        payload.photoUploadSignature, cloudinaryFolders.applicant, cloudinaryCredentials?.cloud_name,
        cloudinaryCredentials?.api_secret, cloudinary.utils);
      return verified ? { url: payload.photo, publicId: payload.photoPublicId } : null;
    }
    return readCloudinaryAsset(payload.photo, payload.photoPublicId, cloudinaryFolders.applicant);
  }
  const match = typeof payload?.photo === 'string'
    ? payload.photo.match(/^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+=*)$/)
    : null;
  if (!match) return null;
  const image = Buffer.from(match[2], 'base64');
  if (!image.length || image.length > MAX_IMAGE_UPLOAD_BYTES) return null;
  return { url: payload.photo, publicId: '' };
}

app.post('/api/uploads/cloudinary-signature', async (req, res) => {
  if (!cloudinaryConfigured) {
    return res.status(503).json({ message: 'Cloudinary uploads are not configured. Add the Cloudinary credentials to the server environment.' });
  }
  const purpose = req.body?.purpose;
  if (!Object.hasOwn(cloudinaryFolders, purpose)) return res.status(400).json({ message: 'Unsupported image upload.' });
  try {
    if (purpose === 'applicant') {
      const now = Date.now();
      const ip = getVisitorIpAddress(req) || 'unknown';
      const recent = (uploadSignatureAttempts.get(ip) || []).filter((time) => now - time < 10 * 60 * 1000);
      if (recent.length >= 10) return res.status(429).json({ message: 'Too many photo uploads. Wait a few minutes and try again.' });
      recent.push(now);
      uploadSignatureAttempts.set(ip, recent);
      if (uploadSignatureAttempts.size > 2000) {
        for (const [key, times] of uploadSignatureAttempts) {
          if (!times.length || now - times[times.length - 1] > 10 * 60 * 1000) uploadSignatureAttempts.delete(key);
        }
      }
    }
    if (purpose === 'feed') {
      const account = await getClubAccountFromRequest(req, res);
      if (!account || !['president', 'head'].includes(account.role)) return res.status(403).json({ message: 'Club president or assigned committee head access is required to upload feed media.' });
    } else if (purpose === 'university') {
      const account = await getClubAccountFromRequest(req, res);
      if (account?.role !== 'miu_events' && !await isAdminSessionValid(req, res)) return res.status(401).json({ message: 'MIU Events dashboard access is required.' });
    } else if (purpose === 'club') {
      const account = await getClubAccountFromRequest(req, res);
      if (!await isAdminSessionValid(req, res) && (!account || !['president', 'pr', 'english', 'security', 'sso', 'dean'].includes(account.role))) {
        return res.status(403).json({ message: 'This account cannot upload club images.' });
      }
    }
    return res.json({ ...signCloudinaryUpload(cloudinaryFolders[purpose]), maxBytes: purpose === 'feed' && req.body.mediaType === 'video' ? MAX_FEED_VIDEO_BYTES : MAX_IMAGE_UPLOAD_BYTES });
  } catch (error) {
    console.error('Cloudinary signature generation failed:', error.name);
    return res.status(503).json({ message: 'Could not prepare the image upload. Please try again.' });
  }
});

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

const dataDirectory = process.env.LOCAL_DATA_DIRECTORY
  ? path.resolve(process.env.LOCAL_DATA_DIRECTORY)
  : process.env.VERCEL ? path.join(require('node:os').tmpdir(), 'miu-clubs-data') : path.join(__dirname, 'data');
const clubsFile = path.join(dataDirectory, 'clubs.json');
const homepageFile = path.join(dataDirectory, 'homepage.json');
const adminCredentialsFile = path.join(dataDirectory, 'admin.json');
const clubAccountsFile = path.join(dataDirectory, 'club-accounts.json');
const clubViewsFile = path.join(dataDirectory, 'club-views.json');
const eventViewsFile = path.join(dataDirectory, 'event-views.json');
const picsDirectory = path.join(__dirname, 'public', 'assets', 'img', 'pics');

fs.mkdirSync(dataDirectory, { recursive: true });
if (!process.env.VERCEL) fs.mkdirSync(picsDirectory, { recursive: true });

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
  role: ['vice_president', 'head', 'pr', 'english', 'security', 'sso', 'dean', 'supervisor', 'miu_events', 'software_development'].includes(account.role) ? account.role : 'president',
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
  if (mongoReady && mongoose.connection.readyState === 1) return true;
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
if (httpSecurity.production(process.env) && (!process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length < 32)) {
  throw new Error('Production requires an explicit ADMIN_SESSION_SECRET of at least 32 characters. Configure it before deploying.');
}
let adminAuthState = null;

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
const positiveNumber = (value, fallback = 0) => {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

function normalizeApplicationFields(fields) {
  if (!Array.isArray(fields)) return [];

  const usedKeys = new Set();
  const scopeCounts = new Map();
  return fields.flatMap((field, index) => {
    const committee = cleanText(field.committee, 100);
    const scope = committee.toLowerCase();
    if ((scopeCounts.get(scope) || 0) >= 12) return [];
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

    scopeCounts.set(scope, (scopeCounts.get(scope) || 0) + 1);
    return [{ key, label, type, required: field.required === true, options, committee }];
  });
}

async function makeClub(payload, existing, id, verifiedImage = null) {
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
    seats: 0,
    members: existing?.members ?? 0,
    memberRoster: existing?.memberRoster || [],
    committeeAvailability: existing?.committeeAvailability || [],
    applicants: existing?.applicants ?? 0,
    description: cleanText(payload.description, 1200),
    requirements: cleanText(payload.requirements, 600),
    applicationIntro: cleanText(payload.applicationIntro, 240),
    applicationFields: payload.applicationFields === undefined ? (existing?.applicationFields || []) : normalizeApplicationFields(payload.applicationFields)
  };

  if (!club.name || !club.committee || !club.category || !club.tagline || !club.description || !club.requirements) {
    return null;
  }

  if (verifiedImage) {
    club.image = verifiedImage.url;
    club.imagePublicId = verifiedImage.publicId;
  } else if (payload.imageUrl || payload.imagePublicId) {
    const uploadedImage = await readCloudinaryAsset(payload.imageUrl, payload.imagePublicId, cloudinaryFolders.club);
    if (!uploadedImage) return null;
    club.image = uploadedImage.url;
    club.imagePublicId = uploadedImage.publicId;
  }

  if (!club.image) return null;
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

async function removeApplicantPhoto(publicId) {
  if (!cloudinaryConfigured || typeof publicId !== 'string'
    || !publicId.split('/').pop().startsWith(`${cloudinaryFolders.applicant}-`)) return;
  try {
    // A profile photo can be shared by several applications.
    if (await require('./services/account-photo').AccountPhoto.exists({ publicId })
      || await Application.exists({ photoPublicId: publicId })) return;
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'upload' });
  } catch (error) {
    console.error('Cloudinary applicant photo cleanup failed:', error.name);
  }
}

function hasAdminPassword() {
  const hasEnvironmentAccount = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
  const hasStoredAccount = Boolean(adminCredentials?.email && adminCredentials?.salt && adminCredentials?.passwordHash);
  const hasDatabaseAccount = Boolean(adminAuthState?.email && adminAuthState?.salt && adminAuthState?.passwordHash);
  return hasEnvironmentAccount || hasStoredAccount || hasDatabaseAccount;
}

function isLoopbackRequest(req) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
}

function getConfiguredAdminEmail() {
  return process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD
    ? process.env.ADMIN_EMAIL.trim().toLowerCase()
    : adminAuthState?.email || adminCredentials?.email;
}

function matchesScryptPassword(password, salt, storedHash) {
  if (typeof password !== 'string' || password.length > 200 || !salt || !/^[a-f0-9]{128}$/i.test(String(storedHash || ''))) return false;
  const expectedHash = Buffer.from(storedHash, 'hex');
  const providedHash = crypto.scryptSync(password, salt, expectedHash.length);
  return expectedHash.length === providedHash.length && crypto.timingSafeEqual(expectedHash, providedHash);
}

async function loadAdminAuthState(email = getConfiguredAdminEmail()) {
  if (email && !mongoReady) {
    await ensureReady();
    if (!mongoReady) throw Object.assign(new Error('Session storage is temporarily unavailable.'), { code: 'DATABASE_UNAVAILABLE' });
  }
  if (mongoReady && email) {
    adminAuthState = await readAdminSessionData(() => AdminAuthState.findOne({ email }).lean(), mongoose);
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
  const expectedEmail = getConfiguredAdminEmail();
  return typeof email === 'string' && email.trim().toLowerCase() === expectedEmail;
}

function createAdminSession() {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const version = Number(adminAuthState?.sessionVersion) || 0;
  const payload = `${expiresAt}.${version}`;
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

async function isSoftwareDevelopmentSession(req, res = null) {
  const staffCookie = String(req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('miu_club='));
  if (!staffCookie) return false;
  if (!mongoReady) {
    await ensureReady();
    if (!mongoReady) throw Object.assign(new Error('Session storage is temporarily unavailable.'), { code: 'DATABASE_UNAVAILABLE' });
  }
  const parts = staffCookie.slice('miu_club='.length).split('.');
  if (![5, 6].includes(parts.length)) return false;
  if (parts.length === 6 && parts[2] !== 'software_development') return false;
  if (parts.length === 5) {
    let email = '';
    try { email = Buffer.from(parts[1], 'base64url').toString('utf8').toLowerCase(); } catch { return false; }
    const cached = clubAccounts.find(item => item.email === email && item.clubId === Number(parts[0]));
    if (cached && cached.role !== 'software_development') return false;
  }
  const staff = await readAdminSessionData(() => getClubAccountFromRequest(req, res), mongoose);
  if (staff?.role === 'software_development') req.securityActor = { email: staff.email, role: staff.role };
  return staff?.role === 'software_development';
}

async function isAdminSessionValid(req, res = null) {
  // Delegated administrators use a live, signed and revocable staff identity.
  if (await isSoftwareDevelopmentSession(req, res)) return true;
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
  const valid = version === currentVersion;
  if (valid) {
    req.securityActor = { email: getConfiguredAdminEmail(), role: 'admin' };
    if (res && !res.headersSent && Number(expiresAt) - Date.now() < 7 * 24 * 60 * 60 * 1000) {
      const secure = secureCookieSuffix(req);
      const value = `miu_admin=${createAdminSession()}; Max-Age=2592000; HttpOnly; SameSite=Strict; Path=/;${secure}`;
      if (typeof res.append === 'function') res.append('Set-Cookie', value);
      else res.setHeader('Set-Cookie', value);
    }
  }
  return valid;
}

function setAdminSessionCookie(req, res) {
  req.securityActor = { email: getConfiguredAdminEmail(), role: 'admin' };
  const secure = secureCookieSuffix(req);
  res.setHeader('Set-Cookie', `miu_admin=${createAdminSession()}; Max-Age=2592000; HttpOnly; SameSite=Strict; Path=/;${secure}`);
}

async function requireAdmin(req, res, next) {
  try {
    if (await isSoftwareDevelopmentSession(req, res)) return next();
    if (!hasAdminPassword()) {
      return res.status(503).json({ message: 'Admin password setup is required.' });
    }
    if (!await isAdminSessionValid(req, res)) {
      if (req.method === 'GET' && /^\/admin(?:\/|$)/.test(req.path)) {
        return res.set('Cache-Control', 'no-store').redirect('/admin/login?returnTo=' + encodeURIComponent(req.originalUrl));
      }
      return res.status(401).json({ message: 'Admin login required.' });
    }
  } catch (error) {
    console.error('Admin session validation failed:', error.name);
    if (req.method === 'GET' && /^\/admin(?:\/|$)/.test(req.path)) {
      res.set('Cache-Control', 'no-store');
      return sendHttpErrorPage(res, 503, 'Admin access is temporarily unavailable',
        'We could not verify your admin session. Please try again. If this continues, check that the database service is running.');
    }
    return res.status(503).json({ message: 'Admin access is temporarily unavailable.' });
  }
  next();
}

async function requireMiuEventsDashboard(req, res, next) {
  try {
    const account = await getClubAccountFromRequest(req, res);
    if (account?.role === 'miu_events') { req.clubAccount = account; return next(); }
    if (account?.role === 'software_development' || await isAdminSessionValid(req, res)) { req.clubAccount = account || null; return next(); }
    return res.status(account ? 403 : 401).json({ message: account ? 'MIU Events dashboard access is not assigned to this account.' : 'Sign in with an assigned MIU Events account.' });
  } catch (error) {
    console.error('MIU Events session validation failed:', error.name);
    return res.status(503).json({ message: 'MIU Events dashboard access is temporarily unavailable.' });
  }
}

function clubPasswordMatches(password, account) {
  if (typeof password !== 'string' || password.length > 200) return false;
  if (!account?.salt || !account?.passwordHash) return false;
  const expectedHash = Buffer.from(account.passwordHash, 'hex');
  if (expectedHash.length !== 64) return false;
  const providedHash = crypto.scryptSync(password, account.salt, expectedHash.length);
  return expectedHash.length === providedHash.length && crypto.timingSafeEqual(expectedHash, providedHash);
}

function createClubSession(account, assignment = null) {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const encodedEmail = Buffer.from(account.email).toString('base64url');
  const version = Number(account.sessionVersion) || 0;
  if (assignment) {
    const payload = `${Number(assignment.clubId) || 0}.${encodedEmail}.${assignment.role}.${expiresAt}.${version}`;
    const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
    return `${payload}.${signature}`;
  }
  const payload = `${account.clubId}.${encodedEmail}.${expiresAt}.${version}`;
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function getInterviewFormScope(account) {
  return account.role === 'head' ? account.committee : '__president__';
}

function getInterviewFormSections(interviewForms, scope) {
  const normalizedScope = String(scope || '').trim().toLowerCase();
  const forms = Array.isArray(interviewForms) ? interviewForms : [];
  const scopedForm = forms.find((item) => String(item?.scope || '').trim().toLowerCase() === normalizedScope);
  if (scopedForm) return Array.isArray(scopedForm.sections) ? scopedForm.sections : [];

  // Existing club interview questions remain the default for heads until they
  // save questions for their own committee. Saving then creates a committee scope.
  if (normalizedScope !== '__president__') {
    const clubForm = forms.find((item) => String(item?.scope || '').trim().toLowerCase() === '__president__');
    return Array.isArray(clubForm?.sections) ? clubForm.sections : [];
  }
  return [];
}

async function getClubAccountFromRequest(req, res = null) {
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
  let selectedRole = '';
  const complete = (resolvedAccount, assignment = null) => {
    // Keep an actively used club session alive, while still requiring a fresh
    // sign-in after 30 days without activity.
    if (res && !res.headersSent && Number(expiresText) - Date.now() < 7 * 24 * 60 * 60 * 1000) {
      req.securityActor = { email: resolvedAccount.email, role: assignment?.role || resolvedAccount.role };
      const secure = secureCookieSuffix(req);
      const value = `miu_club=${createClubSession(resolvedAccount, assignment)}; Max-Age=2592000; HttpOnly; SameSite=Strict; Path=/;${secure}`;
      if (typeof res.append === 'function') res.append('Set-Cookie', value);
      else res.setHeader('Set-Cookie', value);
    }
    return assignment ? { ...resolvedAccount, role: assignment.role, clubId: assignment.clubId,
      committee: assignment.committee, assignedClubIds: assignment.assignedClubIds } : resolvedAccount;
  };

  if (cookieParts.length === 6) {
    const [, encodedEmail, roleText, newExpiresText, versionText, newSignature] = cookieParts;
    if (!/^[a-z_]{2,40}$/.test(roleText || '') || !/^\d+$/.test(versionText || '')) return null;
    selectedRole = roleText;
    try { Buffer.from(encodedEmail, 'base64url').toString('utf8').toLowerCase(); } catch { return null; }
    expiresText = newExpiresText;
    version = Number(versionText);
    signature = newSignature;
    payload = `${clubIdText}.${encodedEmail}.${roleText}.${expiresText}.${versionText}`;
    const email = Buffer.from(encodedEmail, 'base64url').toString('utf8').toLowerCase();
    account = clubAccounts.find((item) => item.email === email);
  } else if (cookieParts.length === 5) {
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
    || Number(expiresText) < Date.now() || !/^[a-f0-9]{64}$/.test(signature || '')) return null;

  const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) return null;
  if (!mongoReady) {
    await ensureReady();
    if (!mongoReady) throw Object.assign(new Error('Session storage is temporarily unavailable.'), { code: 'DATABASE_UNAVAILABLE' });
  }
  if (!account && mongoReady && [5, 6].includes(cookieParts.length)) {
    const email = Buffer.from(cookieParts[1], 'base64url').toString('utf8').toLowerCase();
    account = await ClubAccount.findOne(cookieParts.length === 6 ? { email } : { clubId: Number(clubIdText), email }).lean();
  }
  if (!account || ['supervisor', 'miu_events', 'software_development'].includes(account.role) && ![5, 6].includes(cookieParts.length)) return null;
  if (mongoReady) {
    let storedAccount = await ClubAccount.findOne(cookieParts.length === 6
      ? { email: account.email } : { clubId: Number(clubIdText), email: account.email }).lean();
    if (!storedAccount || Number(storedAccount.sessionVersion) !== version) return null;
    if (storedAccount.role?.startsWith('custom_') || storedAccount.roleAssignments?.some(item => item.role.startsWith('custom_'))) {
      storedAccount = await require('./services/custom-staff-access').decorateCustomStaff(storedAccount);
      if (!storedAccount) return null;
    }
    const accountIndex = clubAccounts.findIndex((item) => item.clubId === storedAccount.clubId && item.email === storedAccount.email);
    if (accountIndex >= 0) clubAccounts[accountIndex] = storedAccount;
    else clubAccounts.push(storedAccount);
    if (selectedRole) {
      const assignment = require('./services/staff-google-auth').staffRoleAssignments(storedAccount)
        .find(item => item.role === selectedRole && item.clubId === Number(clubIdText));
      if (!assignment) return null;
      return complete(storedAccount, assignment);
    }
    return complete(storedAccount);
  }
  if (Number(account.sessionVersion || 0) !== version) return null;
  if (selectedRole) {
    const assignment = require('./services/staff-google-auth').staffRoleAssignments(account)
      .find(item => item.role === selectedRole && item.clubId === Number(clubIdText));
    if (!assignment) return null;
    return complete(account, assignment);
  }
  return complete(account);
}

function setClubSessionCookie(req, res, account, assignment = null) {
  req.securityActor = { email: account.email, role: assignment?.role || account.role };
  const secure = secureCookieSuffix(req);
  res.setHeader('Set-Cookie', `miu_club=${createClubSession(account, assignment)}; Max-Age=2592000; HttpOnly; SameSite=Strict; Path=/;${secure}`);
}

function getStaffDashboardOptions(account) {
  const { STAFF_ROUTES, STAFF_ROLE_LABELS, staffRoleAssignments, staffRoute } = require('./services/staff-google-auth');
  return staffRoleAssignments(account).map(assignment => ({
    role: assignment.role,
    clubId: assignment.clubId,
    committee: assignment.committee,
    label: account.customRoles?.find(role => role.key === assignment.role)?.name || STAFF_ROLE_LABELS[assignment.role] || assignment.role,
    href: staffRoute(assignment.role),
    clubName: (assignment.role === 'supervisor' ? assignment.assignedClubIds
      : ['president', 'vice_president', 'head'].includes(assignment.role) ? [assignment.clubId] : [])
      .map(id => clubs.find(club => Number(club.id) === Number(id))?.name).filter(Boolean).join(', ')
  }));
}

async function requireClubAuth(req, res, next) {
  try {
    const account = await getClubAccountFromRequest(req, res);
    if (!account) return res.status(401).json({ message: 'Club login required.' });
    if (['supervisor', 'miu_events', 'software_development'].includes(account.role) || account.role.startsWith('custom_')) return res.status(403).json({ message: 'Use your assigned dashboard for access.' });
    req.clubAccount = account;
    next();
  } catch (error) {
    console.error('Club session validation failed:', error.name);
    res.status(503).json({ message: 'Club access is temporarily unavailable.' });
  }
}

function createStudentSession(account) {
  const expiresAt = Date.now() + 400 * 24 * 60 * 60 * 1000;
  const encodedEmail = Buffer.from(account.email).toString('base64url');
  const version = Number(account.sessionVersion) || 0;
  const payload = `${encodedEmail}.${expiresAt}.${version}`;
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function secureCookieSuffix(req) {
  return httpSecurity.secureCookie(req);
}

function setStudentSessionCookie(req, res, account) {
  const secure = secureCookieSuffix(req);
  res.setHeader('Set-Cookie', `miu_student=${createStudentSession(account)}; Max-Age=34560000; HttpOnly; SameSite=Strict; Path=/;${secure}`);
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

function getVisitorTrackingSecret() {
  return process.env.VISITOR_TRACKING_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.MONGO_URI || sessionSecret;
}

async function identifySiteVisitor(req, res = null) {
  try {
    if (await isAdminSessionValid(req, res)) {
      return { accountType: 'admin', accountEmail: getConfiguredAdminEmail() || '', accountName: 'Global Admin', accountLabel: 'Administrator' };
    }
    const clubAccount = await getClubAccountFromRequest(req, res);
    if (clubAccount) {
      const club = clubs.find((item) => Number(item.id) === Number(clubAccount.clubId));
    const roleLabels = { president: 'Club president', vice_president: 'Club vice president', head: 'Committee head', pr: 'PR', english: 'English', security: 'Security Office', sso: 'SSO', dean: 'Dean', miu_events: 'MIU Events' };
      const role = roleLabels[clubAccount.role] || 'Club account';
      return {
        accountType: 'club', accountEmail: clubAccount.email,
        accountName: club?.name || 'Club account',
        accountLabel: clubAccount.committee ? `${role} · ${clubAccount.committee}` : role
      };
    }
    const student = await getStudentAccountFromRequest(req, res);
    if (student) {
      return { accountType: 'student', accountEmail: student.email, accountName: student.name || 'Student', accountLabel: 'Student account' };
    }
  } catch (error) {
    console.error('Visitor identity check failed:', error.name);
  }
  return { accountType: 'guest', accountEmail: '', accountName: '', accountLabel: 'Not signed in' };
}

function getVisitorIpHash(ipAddress) {
  if (!ipAddress) return '';
  return crypto.createHmac('sha256', getVisitorTrackingSecret()).update(`visitor-ip:${ipAddress}`).digest('hex');
}

app.post('/api/site/visitor-ping', async (req, res) => {
  if (!mongoReady || mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'Visitor analytics are temporarily unavailable.' });
  }
  const visitorToken = getVisitorToken(req);
  const visitorId = crypto.createHmac('sha256', getVisitorTrackingSecret())
    .update(`visitor-token:${visitorToken}`).digest('hex');
  const ipAddress = getVisitorIpAddress(req);
  const ipHash = getVisitorIpHash(ipAddress);
  const device = describeVisitorDevice(req.headers['user-agent']);
  const identity = await identifySiteVisitor(req, res);
  const now = new Date();
  try {
    const visitorUpdate = {
      $setOnInsert: { firstSeenAt: now },
      $set: { lastSeenAt: now, ...device, ...identity }
    };
    const writes = [SiteVisitor.updateOne({ visitorId }, visitorUpdate, { upsert: true })];
    if (ipHash) writes.push(SiteNetwork.updateOne(
      { ipHash },
      { $setOnInsert: { firstSeenAt: now }, $set: { lastSeenAt: now } },
      { upsert: true }
    ));
    writes.push(SiteVisitorPresence.updateOne({ visitorId }, {
      $set: { ipAddress, expiresAt: new Date(now.getTime() + 6 * 60 * 1000) }
    }, { upsert: true }));
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

async function getGoogleStudentAccountFromRequest(req, res = null) {
  const staff = await getClubAccountFromRequest(req, res);
  let identity = staff;
  if (!identity && await isAdminSessionValid(req, res)) {
    const admin = await loadAdminAuthState();
    if (admin?.email === getConfiguredAdminEmail()) identity = admin;
  }
  if (!identity?.googleSub) return null;
  return require('./services/university-account-session').resolveUniversityStudentProfile(StudentAccount, identity);
}

async function getStudentAccountFromRequest(req, res, allowGoogleStaff = true) {
  if (!mongoReady) return null;
  const cookie = String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('miu_student='));
  if (!cookie) return allowGoogleStaff ? getGoogleStudentAccountFromRequest(req, res) : null;
  const parts = cookie.slice('miu_student='.length).split('.');
  if (parts.length !== 4) return null;
  const [encodedEmail, expiresText, versionText, signature] = parts;
  if (!/^\d+$/.test(expiresText) || Number(expiresText) < Date.now() || !/^\d+$/.test(versionText) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const payload = `${encodedEmail}.${expiresText}.${versionText}`;
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return null;
  let email;
  try { email = Buffer.from(encodedEmail, 'base64url').toString('utf8').toLowerCase(); } catch { return null; }
  const account = await StudentAccount.findOne({ email }).select('email name universityId major phone age sessionVersion googleSub emailNotificationsEnabled').read('primary').readConcern('majority').lean();
  if (!account || Number(account.sessionVersion || 0) !== Number(versionText)) return null;
  // Browsers cap persistent cookies near 400 days. Renew active student
  // sessions so students remain signed in while they continue using the site.
  if (res && Number(expiresText) - Date.now() < 200 * 24 * 60 * 60 * 1000) setStudentSessionCookie(req, res, account);
  return account;
}

async function requireStudentAuth(req, res, next) {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Student sign-in is temporarily unavailable.' });
    const account = await getStudentAccountFromRequest(req, res);
    if (!account) return res.status(401).json({ message: 'Sign in with your verified MIU account to check in.' });
    req.studentAccount = account;
    next();
  } catch (error) {
    console.error('Student session validation failed:', error.name);
    res.status(503).json({ message: 'Student sign-in is temporarily unavailable.' });
  }
}

async function getSpeakerRequester(req, res) {
  if (req.speakerRequester) return req.speakerRequester;
  if (req.query?.as === 'student' || req.body?.requesterType === 'student') return null;
  return require('./services/speaker-manager-access').speakerManagerIdentity(await getClubAccountFromRequest(req, res));
}

const requireSpeakerManager = require('./services/speaker-manager-access').createSpeakerManagerGuard({
  getClubAccountFromRequest, getStudentAccountFromRequest, Club, requireLiveDatabase,
  deny(req, res, status, message) {
    if (req.path === '/speaker-request.html') return sendHttpErrorPage(res, status, 'Club Dashboard access required', message);
    return res.status(status).json({ message });
  }
});
app.get('/speaker-request.html', requireSpeakerManager, (req, res) => {
  res.redirect(303, '/club-dashboard#speakerRequestDashboardPanel');
});

function publicSpeakerRequest(record) {
  const storedAttachments = Array.isArray(record.speakerAttachments) ? record.speakerAttachments : [];
  const attachments = storedAttachments.length ? storedAttachments : (record.cvPublicId ? [{
    publicId: record.cvPublicId, name: record.cvName || 'speaker-material.pdf', format: record.cvFormat || 'pdf'
  }] : []);
  return {
    id: String(record._id), clubId: record.clubId, clubName: record.clubName, hostingType: record.hostingType || 'club',
    speakerName: record.speakerName, speakerEmail: record.speakerEmail || '', professionalDetails: record.professionalDetails,
    jobTitleCompany: record.jobTitleCompany || '', linkedinProfile: record.linkedinProfile || '',
    speakerSelectionReason: record.speakerSelectionReason || '', expectedStudentBenefit: record.expectedStudentBenefit || '',
    shortBio: record.shortBio || '', sessionFormat: record.sessionFormat || '',
    availability: record.availability || '', specialRequirements: record.specialRequirements || '',
    contactDetails: record.contactDetails, proposedTopic: record.proposedTopic,
    eventPurpose: record.eventPurpose, proposedDate: record.proposedDate,
    status: record.status, reviewerComment: record.reviewerComment || '',
    clubReviewerComment: record.clubReviewerComment || '', clubReviewedAt: record.clubReviewedAt || null,
    requesterType: record.requesterType, requesterId: record.requesterId,
    requesterEmail: record.requesterEmail || '', assignedHeadEmail: record.assignedHeadEmail || '',
    submittedAt: record.submittedAt, updatedAt: record.updatedAt,
    decidedAt: record.decidedAt,
    attachments: attachments.map((item, index) => ({ index, name: item.name || `speaker-material.${item.format || 'pdf'}`, format: item.format || 'pdf' })),
    cvAvailable: attachments.length > 0, cvName: attachments[0]?.name || record.cvName || '',
    ...(record.workflow ? { workflow: { state: record.workflow.state, stageId: record.workflow.stageId, revision: record.workflow.revision } } : {}),
    ...(record.requesterType ? { requesterName: record.requesterName || '' } : {})
  };
}

async function findSpeakerInvite(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return null;
  return SpeakerInvite.findOne({
    tokenHash: speakerInviteTokenHash(token), revokedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
  }).lean();
}

async function verifySpeakerCvUpload(uploadId, identity) {
  if (!uploadId) return { publicId: '' };
  if (typeof uploadId !== 'string' || !/^[a-f0-9-]{36}$/i.test(uploadId)) {
    return { error: 'The CV upload could not be verified. Upload the PDF again.' };
  }
  const grant = await SpeakerCvUpload.findOne({ _id: uploadId, requesterKey: requesterKey(identity, identity.type === 'club' ? identity.clubId : 0), consumedAt: null, expiresAt: { $gt: new Date() } }).lean();
  if (!grant) return { error: 'This CV upload expired or belongs to another account. Upload it again.' };
  try {
    const asset = await cloudinary.api.resource(grant.publicId, { resource_type: 'raw', type: 'authenticated' });
    if (!validateSpeakerCvAsset(asset)) {
      return { error: 'The uploaded file must be a PDF no larger than 5 MB.' };
    }
    const claimed = await SpeakerCvUpload.findOneAndUpdate(
      { _id: grant._id, consumedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { consumedAt: new Date() } }, { new: true }
    ).lean();
    if (!claimed) return { error: 'This CV upload has already been used. Upload it again.' };
    return { publicId: grant.publicId };
  } catch (error) {
    console.error('Speaker CV verification failed:', error.name);
    return { error: 'Could not verify the uploaded CV. Please upload it again.' };
  }
}

function sanitizeSpeakerAttachmentName(value, format) {
  let name = String(value || '').split(/[\\/]/).pop()
    .replace(/[^\p{L}\p{N} ._()\-]/gu, '').trim().slice(0, 180);
  if (!name || !name.toLowerCase().endsWith(`.${format}`)) name = `speaker-material.${format}`;
  return name;
}

async function verifySpeakerCvUploads(items, identity, session) {
  if (!Array.isArray(items)) return { error: 'The attachment list is invalid.' };
  if (items.length > 5) return { error: 'Choose up to five supporting documents.' };
  if (!items.length) return { attachments: [] };
  const ids = items.map((item) => String(item?.uploadId || ''));
  if (ids.some((id) => !/^[a-f0-9-]{36}$/i.test(id)) || new Set(ids).size !== ids.length) {
    return { error: 'One of the uploads could not be verified. Upload the files again.' };
  }
  const ownerKey = requesterKey(identity, identity.type === 'club' ? identity.clubId : 0);
  try {
    const grants = await Promise.all(ids.map((id) => {
      const query = SpeakerCvUpload.findOne({ _id: id, requesterKey: ownerKey, consumedAt: null, expiresAt: { $gt: new Date() } });
      return (session ? query.session(session) : query).lean();
    }));
    if (grants.some((grant) => !grant)) return { error: 'An upload expired or belongs to another account. Upload the files again.' };
    const assets = await Promise.all(grants.map((grant) => cloudinary.api.resource(grant.publicId, { resource_type: 'raw', type: 'authenticated' })));
    if (assets.some((asset) => !validateSpeakerCvAsset(asset))) {
      return { error: 'Each attachment must be a valid PDF, DOC, DOCX, PPT, or PPTX no larger than 5 MB.' };
    }
    const consumedAt = new Date();
    const claimed = [];
    for (const grant of grants) {
      const claimQuery = SpeakerCvUpload.findOneAndUpdate(
        { _id: grant._id, requesterKey: ownerKey, consumedAt: null, expiresAt: { $gt: consumedAt } },
        { $set: { consumedAt } }, { new: true }
      );
      const result = await (session ? claimQuery.session(session) : claimQuery).lean();
      if (!result) return { error: 'An upload was already used. Select and upload the files again.' };
      claimed.push(result);
    }
    return {
      attachments: claimed.map((grant, index) => {
        const format = String(assets[index].format).toLowerCase();
        return {
          publicId: grant.publicId,
          name: sanitizeSpeakerAttachmentName(items[index].name, format),
          format
        };
      })
    };
  } catch (error) {
    console.error('Speaker attachments verification failed:', error.name);
    return { error: 'Could not verify the uploaded documents. Please upload them again.' };
  }
}

async function verifySpeakerRequestAttachments(body, identity, session) {
  if (Array.isArray(body?.attachmentUploads)) return verifySpeakerCvUploads(body.attachmentUploads, identity, session);
  const legacy = await verifySpeakerCvUpload(body?.cvUploadId, identity);
  if (legacy.error) return legacy;
  if (!legacy.publicId) return { attachments: [] };
  const format = legacy.publicId.split('.').pop().toLowerCase();
  return { attachments: [{ publicId: legacy.publicId, name: sanitizeSpeakerAttachmentName(body?.cvName, format), format }] };
}

function uploadSpeakerCv(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      resource_type: 'raw', type: 'authenticated', public_id: publicId,
      overwrite: false, allowed_formats: ['pdf', 'doc', 'docx', 'ppt', 'pptx']
    }, (error, result) => error ? reject(error) : resolve(result));
    stream.end(buffer);
  });
}

function deriveStableSpeakerInviteToken(inviteId) {
  const secret = process.env.SPEAKER_INVITE_SECRET
    || process.env.ADMIN_SESSION_SECRET
    || adminCredentials?.sessionSecret
    || process.env.MONGO_URI;
  if (!secret) throw new Error('Configure SPEAKER_INVITE_SECRET to create stable speaker links.');
  return crypto.createHmac('sha256', secret).update(`miu-speaker-invite:v1:${inviteId}`).digest('hex');
}

async function getOrCreateStableSpeakerInvite(club, actor, rotate = false) {
  const createdByEmail = String(actor.email || '').toLowerCase();
  const ownerFilter = { clubId: club.id, createdByEmail, revokedAt: null };
  if (!rotate) {
    const existing = await SpeakerInvite.findOne({ ...ownerFilter, stableToken: true, expiresAt: null }).lean();
    if (existing) {
      const token = deriveStableSpeakerInviteToken(existing._id);
      return { invite: existing, token, reused: true };
    }
  } else {
    await SpeakerInvite.updateMany(ownerFilter, { $set: { revokedAt: new Date() } });
  }

  const inviteId = new mongoose.Types.ObjectId();
  const token = deriveStableSpeakerInviteToken(inviteId);
  try {
    const invite = await SpeakerInvite.create({
      _id: inviteId,
      clubId: club.id,
      clubName: club.name,
      createdByEmail,
      createdByName: actor.name || actor.committee || 'University organizer',
      createdByRole: actor.role,
      tokenHash: speakerInviteTokenHash(token),
      stableToken: true,
      expiresAt: null
    });
    return { invite, token, reused: false };
  } catch (error) {
    // A unique partial index makes concurrent requests from multiple devices
    // converge on the same permanent link.
    if (error?.code !== 11000) throw error;
    const existing = await SpeakerInvite.findOne({ ...ownerFilter, stableToken: true, expiresAt: null }).lean();
    if (!existing) throw error;
    return { invite: existing, token: deriveStableSpeakerInviteToken(existing._id), reused: true };
  }
}

function speakerInviteResponse(invite, token, reused) {
  return {
    url: `/speaker-intake.html?t=${token}`,
    expiresAt: invite.expiresAt || null,
    permanent: Boolean(invite.stableToken),
    reused,
    clubName: invite.clubName
  };
}

async function workflowActor(req, res) {
  if (await isAdminSessionValid(req, res)) return { admin: true, email: getConfiguredAdminEmail().toLowerCase(), assignments: [{ role: 'admin' }] };
  const account = await getClubAccountFromRequest(req, res);
  if (account) {
    const assignments = require('./services/staff-google-auth').staffRoleAssignments(account);
    if (account.role.startsWith('custom_')) return { email: account.email.toLowerCase(), role: account.role,
      assignments: assignments.filter(item => item.role === account.role), customRoles: (account.customRoles || []).filter(role => role.key === account.role), admin: false };
    return { email: account.email.toLowerCase(), role: account.role, assignments, customRoles: account.customRoles || [], admin: assignments.some(item => item.role === 'software_development') };
  }
  const student = await getStudentAccountFromRequest(req, res, false);
  return student ? { email: student.email.toLowerCase(), role: 'student', assignments: [] } : null;
}
const dynamicWorkflowEngine = require('./services/workflow-engine').createWorkflowEngine({
  database: mongoose, ContentRequest, SpeakerRequest, ClubAccount, AuditLog, adminEmail: getConfiguredAdminEmail,
  customRoles: require('./services/custom-staff-role-model').CustomStaffRole,
  transport: getPasswordRecoveryTransport,
  afterCommit: async record => {
    if (record.type && record.status === 'published') await dispatchPublishedContentNotifications({ source: 'club', contentId: record.id, revision: record.publishedAt?.getTime() || Date.now(), type: record.type, title: record.title });
  },
  publish: async (record, session) => {
    if (record.type === 'entry_permit') return;
    if (missingRequiredPublicContentImage(record.type, record)) throw new (require('./services/workflow-policy').WorkflowError)(422, 'Add the required image before final approval.');
    const club = await Club.findOne({ id: record.clubId, archivedAt: null }).session(session);
    if (!club) throw new (require('./services/workflow-policy').WorkflowError)(409, 'The club is no longer available.');
    const field = contentClubField[record.type];
    club[field] = (club[field] || []).filter(item => Number(item.requestId) !== Number(record.id));
    club[field].push(buildPublishedItem({ ...record, publishedAt: new Date() }, club));
    await club.save({ session });
  },
  validatePatch: async (record, patch, actor, session) => {
    const { WorkflowError } = require('./services/workflow-policy');
    if (patch.image !== undefined) patch.image = await validateFeedMedia(record.type, { image: patch.image }, record.image || '', { cloudinary, cloudName: cloudinaryCredentials?.cloud_name });
    if (patch.sponsorAttachment !== undefined && !validSponsorAttachment(patch.sponsorAttachment)) throw new WorkflowError(422, 'Choose a valid supporting attachment.');
    if (patch.sponsorLogo !== undefined && patch.sponsorLogo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(patch.sponsorLogo)) throw new WorkflowError(422, 'Choose a valid company logo image.');
    if (!record.type) {
      const merged = { ...record, ...patch };
      if (record.requesterType === 'club') {
        const result = validateSpeakerPayload(merged);
        if (result.error) throw new WorkflowError(422, result.error);
      } else {
        const result = validatePublicSpeakerInvitePayload({ ...merged, fullName: merged.speakerName, email: merged.speakerEmail });
        if (result.error) throw new WorkflowError(422, result.error);
      }
      if (patch.speakerAttachments) {
        const upload = await verifySpeakerRequestAttachments({ attachmentUploads: patch.speakerAttachments }, { type: 'club', email: actor.email, id: `club:${record.clubId}:${actor.email}`, clubId: record.clubId }, session);
        if (upload.error) throw new WorkflowError(422, upload.error);
        patch.speakerAttachments = upload.attachments;
        // CV aliases are internal derivatives, never arbitrary client properties.
        patch.cvPublicId = upload.attachments[0]?.publicId || '';
        patch.cvFormat = upload.attachments[0]?.format || 'pdf';
        patch.cvName = upload.attachments[0]?.name || '';
      }
    }
  }
});
const workflowDeliveryTimer = setInterval(() => { if (mongoReady) { void dynamicWorkflowEngine.deliver(); void dynamicWorkflowEngine.reconcile().catch(error => console.error('Workflow reviewer availability check failed:', error.name)); } }, 30000);
workflowDeliveryTimer.unref();
const customStaffRoleService = require('./services/custom-staff-roles').createCustomRoleService({
  database: mongoose, ClubAccount, Club, AuditLog,
  refreshAccount(account) { const index = clubAccounts.findIndex(item => item.email === account.email); if (index < 0) clubAccounts.push(account); else clubAccounts[index] = account; },
  removeAccount(account) { clubAccounts = clubAccounts.filter(item => item.email !== account.email); }
});
require('./services/custom-staff-role-routes').registerCustomStaffRoleRoutes(app, { service: customStaffRoleService, engine: dynamicWorkflowEngine,
  actorFor: workflowActor, ready: ensureReady, sameOrigin: isSameOriginRequest, requireAdmin, root: __dirname });
require('./services/workflow-routes').registerWorkflowRoutes(app, { engine: dynamicWorkflowEngine, actorFor: workflowActor,
  requireAdmin, ready: ensureReady, sameOrigin: isSameOriginRequest,
  attachmentUrl: async attachment => {
    if (!cloudinaryConfigured) throw new (require('./services/workflow-policy').WorkflowError)(503, 'Private attachment storage is unavailable.');
    return cloudinary.utils.private_download_url(attachment.publicId, attachment.format || 'pdf', { resource_type: 'raw', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300, attachment: true });
  },
  uploadAttachment: async (record, actor, body) => {
    const { WorkflowError } = require('./services/workflow-policy');
    if (!cloudinaryConfigured) throw new WorkflowError(503, 'Private attachment storage is unavailable.');
    const decoded = decodeSpeakerCvData(body.fileData);
    if (decoded.error) throw new WorkflowError(422, decoded.error);
    const publicId = `miu-speaker-cvs/${crypto.randomUUID()}.${decoded.format}`;
    const asset = await uploadSpeakerCv(decoded.buffer, publicId);
    if (!validateSpeakerCvAsset(asset)) { await cloudinary.uploader.destroy(publicId, { resource_type: 'raw', type: 'authenticated' }).catch(() => {}); throw new WorkflowError(422, 'Choose a supported document up to 5 MB.'); }
    const uploadId = crypto.randomUUID();
    try { await SpeakerCvUpload.create({ _id: uploadId, publicId, requesterKey: requesterKey({ type: 'club', id: `club:${record.clubId}:${actor.email}`, email: actor.email }, record.clubId), expiresAt: new Date(Date.now() + CV_UPLOAD_TTL_MS) }); }
    catch (error) { await cloudinary.uploader.destroy(publicId, { resource_type: 'raw', type: 'authenticated' }).catch(() => {}); throw error; }
    return { uploadId };
  }
});

app.post('/api/club/speaker-invites', requireClubAuth, requireSpeakerManager, async (req, res) => {
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'Reload the page and try again.' });
  if (!['president', 'head'].includes(req.clubAccount?.role)) return res.status(403).json({ message: 'Only the club president or a committee head can create speaker invitation links.' });
  if (!requireLiveDatabase(res)) return;
  try {
    const club = await Club.findOne({ id: Number(req.clubAccount.clubId), archivedAt: null }).select('id name').lean();
    if (!club) return res.status(404).json({ message: 'This club is not available.' });
    const result = await getOrCreateStableSpeakerInvite(club, req.clubAccount, req.body?.rotate === true);
    res.status(result.reused ? 200 : 201).json(speakerInviteResponse(result.invite, result.token, result.reused));
  } catch (error) {
    console.error('Speaker invitation creation failed:', error.name);
    res.status(503).json({ message: error.message.includes('SPEAKER_INVITE_SECRET') ? error.message : 'Could not create a speaker invitation link.' });
  }
});

require('./services/staff-speaker-invites').registerStaffSpeakerInvites(app, {
  requireClubAuth, requireLiveDatabase, isSameOriginRequest, Club,
  getOrCreateStableSpeakerInvite, speakerInviteResponse
});

app.get('/api/public/speaker-invites/:token', async (req, res) => {
  if (!requireLiveDatabase(res)) return;
  try {
    const invite = await findSpeakerInvite(req.params.token);
    if (!invite) return res.status(404).json({ message: 'This speaker invitation link is invalid, expired, or revoked. Ask the club for a new link.' });
    res.json({ clubName: invite.clubName, expiresAt: invite.expiresAt });
  } catch (error) {
    console.error('Public speaker invitation lookup failed:', error.name);
    res.status(503).json({ message: 'Could not load this speaker form. Please try again.' });
  }
});

app.post('/api/public/speaker-invites/:token/submit', async (req, res) => {
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'Reload the form and try again.' });
  if (!requireLiveDatabase(res)) return;
  let uploadedPublicId = '';
  try {
    const invite = await findSpeakerInvite(req.params.token);
    if (!invite) return res.status(404).json({ message: 'This speaker invitation link is invalid, expired, or revoked. Ask the club for a new link.' });
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 160);
    const attempts = (speakerUploadAttempts.get(`public:${ip}`) || []).filter((time) => Date.now() - time < 10 * 60 * 1000);
    if (attempts.length >= 5) return res.status(429).json({ message: 'Too many submissions from this connection. Try again later.' });
    attempts.push(Date.now()); speakerUploadAttempts.set(`public:${ip}`, attempts);
    const validated = validatePublicSpeakerInvitePayload(req.body);
    if (validated.error) return res.status(400).json({ message: validated.error });
    if (!validated.value.speakerEmail) return res.status(400).json({ message: 'Provide an email address so the club can contact you and prevent duplicate requests.' });
    const club = invite.clubId === 0 && ['dean', 'supervisor'].includes(invite.createdByRole)
      ? { id: 0, name: 'MIU' }
      : await Club.findOne({ id: invite.clubId, archivedAt: null }).select('id name').lean();
    if (!club) return res.status(404).json({ message: 'The hosting club is no longer available.' });
    const activeRequesterKey = publicSpeakerDuplicateKey(club.id, validated.value.speakerEmail);
    if (await SpeakerRequest.exists({ activeRequesterKey })) return res.status(409).json({ message: 'You already have an active speaker request with this club.' });
    const materialData = req.body?.materialFileData || req.body?.cvFileData;
    let materialFormat = 'pdf';
    let materialName = '';
    if (materialData) {
      if (!cloudinaryConfigured) return res.status(503).json({ message: 'Private attachment storage is unavailable right now. Submit without a file or try again later.' });
      const decoded = decodeSpeakerCvData(materialData);
      if (decoded.error) return res.status(400).json({ message: decoded.error });
      materialFormat = decoded.format;
      materialName = String(req.body?.materialName || '').replace(/[^\p{L}\p{N} ._()\-]/gu, '').trim().slice(0, 180);
      if (!materialName || !materialName.toLowerCase().endsWith(`.${materialFormat}`)) materialName = `speaker-material.${materialFormat}`;
      uploadedPublicId = `miu-speaker-cvs/${crypto.randomUUID()}.${materialFormat}`;
      const asset = await uploadSpeakerCv(decoded.buffer, uploadedPublicId);
      if (!validateSpeakerCvAsset(asset)) {
        await cloudinary.uploader.destroy(uploadedPublicId, { resource_type: 'raw', type: 'authenticated' }).catch(() => {});
        uploadedPublicId = '';
        return res.status(400).json({ message: 'The attachment must be a valid PDF, DOC, DOCX, PPT, or PPTX file no larger than 5 MB.' });
      }
    }
    const speakerAttachments = uploadedPublicId ? [{ publicId: uploadedPublicId, name: materialName, format: materialFormat }] : [];
    const speakerValues = {
      ...validated.value, clubId: club.id, clubName: club.name,
      requesterType: 'speaker', requesterId: `speaker:${validated.value.speakerEmail}`,
      requesterEmail: validated.value.speakerEmail, requesterRole: 'speaker',
      requesterName: validated.value.speakerName,
      hostingType: club.id === 0 ? 'miu' : 'club',
      assignedHeadEmail: ['president', 'head'].includes(invite.createdByRole) ? invite.createdByEmail : '',
      inviteId: invite._id,
      cvPublicId: uploadedPublicId, cvFormat: materialFormat, cvName: materialName, speakerAttachments, status: club.id === 0 ? 'pending_dean' : 'pending_club', activeRequesterKey,
      decisionHistory: [{ action: 'submitted', role: 'speaker', email: validated.value.speakerEmail }]
    };
    const record = await dynamicWorkflowEngine.createNew('speaker', speakerValues, { email: validated.value.speakerEmail, role: 'speaker' });
    res.status(201).json({ message: 'Thank you for your interest! Your response has been submitted successfully. Our team will contact you soon.' });
  } catch (error) {
    if (uploadedPublicId) await cloudinary.uploader.destroy(uploadedPublicId, { resource_type: 'raw', type: 'authenticated' }).catch(() => {});
    if (error?.code === 11000) return res.status(409).json({ message: 'You already have an active speaker request with this club.' });
    console.error('Public speaker request submission failed:', error.name);
    if (error.status) return res.status(error.status).json({ message: error.message });
    res.status(503).json({ message: 'Your proposal could not be saved. Please try again.' });
  }
});

app.get('/api/speaker-requests/context', requireSpeakerManager, async (req, res) => {
  if (!requireLiveDatabase(res)) return;
  try {
    const identity = await getSpeakerRequester(req, res);
    if (!identity) return res.status(401).json({ message: 'Sign in as an authorized club representative to request a speaker.' });
    const clubs = identity.type === 'student'
      ? await Club.find({ archivedAt: null }).select('id name').sort({ name: 1 }).lean()
      : [];
    const club = identity.type === 'club'
      ? req.speakerClub || await Club.findOne({ id: identity.clubId, archivedAt: null }).select('id name').lean()
      : null;
    const clubRequestFilter = identity.role === 'head'
      ? { clubId: identity.clubId, $or: [{ assignedHeadEmail: { $in: ['', null] } }, { assignedHeadEmail: identity.email.toLowerCase() }] }
      : { clubId: identity.clubId };
    const requests = await SpeakerRequest.find(identity.type === 'student'
      ? { requesterType: 'student', requesterId: identity.id }
      : clubRequestFilter).sort({ submittedAt: -1 }).lean();
    const visibleRequests = requests.filter(record => !record.workflow || require('./services/workflow-policy').mayView({ email: identity.email, assignments: [{ role: identity.role, clubId: identity.clubId }] }, record));
    res.json({ identity: { type: identity.type, name: identity.name, email: identity.email, role: identity.role, clubId: identity.clubId || null }, club, clubs, requests: visibleRequests.map(publicSpeakerRequest) });
  } catch (error) {
    console.error('Speaker request context failed:', error.name);
    res.status(503).json({ message: 'Could not load speaker request information. Please try again.' });
  }
});

app.post('/api/speaker-requests/cv-upload', requireSpeakerManager, async (req, res) => {
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'This upload request could not be verified. Reload and try again.' });
  if (!requireLiveDatabase(res)) return;
  if (!cloudinaryConfigured) return res.status(503).json({ message: 'Private CV uploads are unavailable because file storage is not configured.' });
  try {
    const identity = await getSpeakerRequester(req, res);
    if (!identity) return res.status(401).json({ message: 'Sign in as an authorized club representative before uploading a CV.' });
    const clubId = identity.type === 'club' ? identity.clubId : 0;
    const ownerKey = requesterKey(identity, clubId);
    const attempts = (speakerUploadAttempts.get(ownerKey) || []).filter((time) => Date.now() - time < 10 * 60 * 1000);
    if (attempts.length >= 5) return res.status(429).json({ message: 'Too many CV uploads. Wait a few minutes and try again.' });
    attempts.push(Date.now());
    speakerUploadAttempts.set(ownerKey, attempts);
    if (speakerUploadAttempts.size > 2000) {
      for (const [key, times] of speakerUploadAttempts) {
        const recentTimes = times.filter((time) => Date.now() - time < 10 * 60 * 1000);
        if (recentTimes.length) speakerUploadAttempts.set(key, recentTimes);
        else speakerUploadAttempts.delete(key);
      }
    }
    const decoded = decodeSpeakerCvData(req.body?.fileData);
    if (decoded.error) return res.status(400).json({ message: decoded.error });
    const publicId = `miu-speaker-cvs/${crypto.randomUUID()}.${decoded.format}`;
    const asset = await uploadSpeakerCv(decoded.buffer, publicId);
    if (!validateSpeakerCvAsset(asset)) {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw', type: 'authenticated' }).catch(() => {});
      return res.status(400).json({ message: 'The uploaded file must be a valid PDF, DOC, DOCX, PPT, or PPTX no larger than 5 MB.' });
    }
    const uploadId = crypto.randomUUID();
    try {
      await SpeakerCvUpload.create({ _id: uploadId, publicId, requesterKey: ownerKey, expiresAt: new Date(Date.now() + CV_UPLOAD_TTL_MS) });
    } catch (error) {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw', type: 'authenticated' }).catch(() => {});
      throw error;
    }
    res.json({ uploadId });
  } catch (error) {
    console.error('Speaker CV upload setup failed:', error.name);
    res.status(503).json({ message: 'Could not prepare the private CV upload. Please try again.' });
  }
});

app.get('/api/speaker-requests', requireSpeakerManager, async (req, res) => {
  if (!requireLiveDatabase(res)) return;
  try {
    const identity = await getSpeakerRequester(req, res);
    if (!identity) return res.status(401).json({ message: 'Sign in to view your speaker requests.' });
    const filter = identity.type === 'student'
      ? { requesterType: 'student', requesterId: identity.id }
      : identity.role === 'head'
        ? { clubId: identity.clubId, $or: [{ assignedHeadEmail: { $in: ['', null] } }, { assignedHeadEmail: identity.email.toLowerCase() }] }
        : { clubId: identity.clubId };
    const records = await SpeakerRequest.find(filter).sort({ submittedAt: -1 }).lean();
    res.json(records.filter(record => !record.workflow || require('./services/workflow-policy').mayView({ email: identity.email, assignments: [{ role: identity.role, clubId: identity.clubId }] }, record)).map(publicSpeakerRequest));
  } catch (error) {
    console.error('Speaker request list failed:', error.name);
    res.status(503).json({ message: 'Could not load your speaker requests.' });
  }
});

app.post('/api/speaker-requests', requireSpeakerManager, async (req, res) => {
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'This form submission could not be verified. Reload and try again.' });
  if (!requireLiveDatabase(res)) return;
  try {
    const identity = await getSpeakerRequester(req, res);
    if (!identity) return res.status(401).json({ message: 'Sign in as an authorized club representative to submit this request.' });
    const validated = validateSpeakerPayload(req.body);
    if (validated.error) return res.status(400).json({ message: validated.error });
    const hosting = resolveSpeakerHosting(identity, req.body);
    if (!hosting) {
      return res.status(400).json({ message: 'Choose a valid hosting club or MIU official university event.' });
    }
    const { hostingType, clubId } = hosting;
    const club = hostingType === 'miu' ? { id: 0, name: 'MIU (Official University)' }
      : req.speakerClub || await Club.findOne({ id: clubId, archivedAt: null }).select('id name').lean();
    if (!club) return res.status(404).json({ message: 'The selected club was not found.' });
    const activeRequesterKey = requesterKey(identity, clubId);
    if (await SpeakerRequest.exists({ activeRequesterKey })) {
      return res.status(409).json({ message: 'You already have an active speaker request for this hosting organization. Update that request instead.' });
    }
    const upload = await verifySpeakerRequestAttachments(req.body, identity);
    if (upload.error) return res.status(400).json({ message: upload.error });
    const attachments = upload.attachments || [];
    const primaryAttachment = attachments[0];
    const speakerValues = {
      ...validated.value, clubId, clubName: club.name, hostingType, requesterType: identity.type,
      requesterId: identity.id, requesterEmail: identity.email, requesterRole: identity.role,
      requesterName: identity.name, speakerAttachments: attachments,
      cvPublicId: primaryAttachment?.publicId || '', cvFormat: primaryAttachment?.format || 'pdf', cvName: primaryAttachment?.name || '',
      status: identity.type === 'club' ? 'pending_supervisor' : hostingType === 'miu' ? 'pending_dean' : 'pending_club', activeRequesterKey,
      decisionHistory: [{ action: 'submitted', role: identity.role, email: identity.email }]
    };
    const record = typeof dynamicWorkflowEngine !== 'undefined'
      ? await dynamicWorkflowEngine.createNew('speaker', speakerValues, { email: identity.email, role: identity.role })
      : await SpeakerRequest.create(speakerValues);
    res.status(201).json(publicSpeakerRequest(record.toObject()));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'You already have an active speaker request for this hosting organization. Update that request instead.' });
    console.error('Speaker request submission failed:', error.name);
    res.status(error.status || 503).json({ message: error.status ? error.message : 'The speaker request was not saved. Please try again.' });
  }
});

app.post('/api/club/speaker-requests/:id/decision', requireClubAuth, async (req, res) => {
  if (!['president', 'head'].includes(req.clubAccount?.role)) return res.status(403).json({ message: 'Only the club president or a committee head can review speaker requests.' });
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'This decision could not be verified. Reload and try again.' });
  if (!requireLiveDatabase(res)) return;
  const action = req.body?.action;
  const comment = cleanText(req.body?.comment, 2000);
  if (!validClubSpeakerDecision('pending_club', action)) return res.status(400).json({ message: 'Choose accept or reject.' });
  if (action === 'reject' && !comment) return res.status(400).json({ message: 'Add a short reason before rejecting this request.' });
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Speaker request not found.' });
    const existing = await SpeakerRequest.findById(req.params.id).select('clubId status requesterEmail assignedHeadEmail').lean();
    if (!existing || Number(existing.clubId) !== Number(req.clubAccount.clubId)) return res.status(404).json({ message: 'Speaker request not found.' });
    if (!canClubReviewSpeakerRequest(req.clubAccount, existing)) return res.status(403).json({ message: 'You cannot review this request. It may be assigned to another head, or you submitted it yourself.' });
    if (!validClubSpeakerDecision(existing.status, action)) return res.status(409).json({ message: 'This request is no longer waiting for club review.' });
    const nextStatus = action === 'accept' ? 'pending_supervisor' : 'rejected';
    const now = new Date();
    const update = {
      $set: { status: nextStatus, clubReviewerEmail: req.clubAccount.email, clubReviewerRole: req.clubAccount.role, clubReviewerComment: comment, clubReviewedAt: now },
      $push: { decisionHistory: { action: action === 'accept' ? 'club_accepted' : 'club_rejected', role: req.clubAccount.role, email: req.clubAccount.email, comment, createdAt: now } }
    };
    if (action === 'reject') update.$unset = { activeRequesterKey: 1 };
    const record = await SpeakerRequest.findOneAndUpdate({ _id: req.params.id, status: existing.status }, update, { new: true, runValidators: true }).lean();
    if (!record) return res.status(409).json({ message: 'Another reviewer updated this request. Refresh before trying again.' });
    await notifySpeakerWorkflow(record);
    res.json(publicSpeakerRequest(record));
  } catch (error) {
    console.error('Club speaker request decision failed:', error.name);
    res.status(503).json({ message: 'The club decision was not saved. Please try again.' });
  }
});

app.patch('/api/speaker-requests/:id/resubmit', requireSpeakerManager, async (req, res) => {
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'This form submission could not be verified. Reload and try again.' });
  if (!requireLiveDatabase(res)) return;
  try {
    const identity = await getSpeakerRequester(req, res);
    if (!identity) return res.status(401).json({ message: 'Sign in to update your speaker request.' });
    const validated = validateSpeakerPayload(req.body);
    if (validated.error) return res.status(400).json({ message: validated.error });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'This request is not available for changes.' });
    const existing = await SpeakerRequest.findOne({ _id: req.params.id, status: 'changes_requested' }).select('status speakerEmail clubId hostingType requesterType requesterId requesterEmail assignedHeadEmail clubReviewedAt speakerAttachments cvPublicId cvFormat cvName').lean();
    if (!existing) return res.status(404).json({ message: 'This request is not available for changes.' });
    const isStudentOwner = identity.type === 'student' && existing.requesterType === 'student' && existing.requesterId === identity.id;
    const isClubOwner = identity.type === 'club' && Number(existing.clubId) === identity.clubId
      && (identity.role === 'president' || existing.requesterId === identity.id
        || existing.assignedHeadEmail && existing.assignedHeadEmail.toLowerCase() === identity.email.toLowerCase());
    if (!isStudentOwner && !isClubOwner) return res.status(404).json({ message: 'This request is not available for changes.' });
    const oldAttachments = Array.isArray(existing.speakerAttachments) && existing.speakerAttachments.length
      ? existing.speakerAttachments
      : existing.cvPublicId ? [{ publicId: existing.cvPublicId, name: existing.cvName || `speaker-material.${existing.cvFormat || 'pdf'}`, format: existing.cvFormat || 'pdf' }] : [];
    if (Array.isArray(req.body?.attachmentUploads) && oldAttachments.length + req.body.attachmentUploads.length > 5) {
      return res.status(400).json({ message: 'A request can have up to five supporting documents total. Remove an existing attachment before adding more.' });
    }
    const upload = await verifySpeakerRequestAttachments(req.body, identity);
    if (upload.error) return res.status(400).json({ message: upload.error });
    const resubmissionStatus = speakerResubmissionStatus(existing);
    const fields = { ...validated.value, speakerEmail: validated.value.speakerEmail || existing.speakerEmail || '', status: resubmissionStatus, reviewerComment: '', reviewerEmail: '', reviewerRole: '', decidedAt: null };
    if (resubmissionStatus === 'pending_club') fields.clubReviewerComment = '';
    const newAttachments = upload.attachments || [];
    if (newAttachments.length) {
      fields.speakerAttachments = [...oldAttachments, ...newAttachments];
      fields.cvPublicId = fields.speakerAttachments[0]?.publicId || '';
      fields.cvFormat = fields.speakerAttachments[0]?.format || 'pdf';
      fields.cvName = fields.speakerAttachments[0]?.name || '';
    }
    const record = await SpeakerRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'changes_requested' },
      { $set: fields, $push: { decisionHistory: { action: 'resubmitted', role: identity.role, email: identity.email } } },
      { new: true, runValidators: true }
    ).lean();
    if (!record) return res.status(409).json({ message: 'This request was already updated. Refresh your list before trying again.' });
    await notifySpeakerWorkflow(record);
    res.json(publicSpeakerRequest(record));
  } catch (error) {
    console.error('Speaker request update failed:', error.name);
    res.status(503).json({ message: 'The updated request was not saved. Please try again.' });
  }
});

app.get('/api/speaker-requests/:id/cv', async (req, res) => {
  if (!requireLiveDatabase(res)) return;
  if (!cloudinaryConfigured) return res.status(503).json({ message: 'Private CV storage is temporarily unavailable.' });
  try {
    const identity = await getSpeakerRequester(req, res);
    const committee = await getClubAccountFromRequest(req, res);
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Speaker request not found.' });
    const record = await SpeakerRequest.findById(req.params.id).lean();
    if (!record) return res.status(404).json({ message: 'Speaker request not found.' });
    const owner = identity && (record.requesterType === 'student' && identity.type === 'student' && record.requesterId === identity.id
      || identity.type === 'club' && ['president', 'head'].includes(identity.role) && Number(record.clubId) === identity.clubId
        && (identity.role === 'president' || !record.assignedHeadEmail || record.assignedHeadEmail.toLowerCase() === identity.email.toLowerCase()));
    const dean = committee?.role === 'dean' && (record.hostingType === 'miu' || Boolean(record.clubReviewedAt))
      && canReviewSpeakerRequest(committee.role, record.requesterEmail, committee.email);
    const supervisor = committee?.role === 'supervisor' && require('./services/supervisor-dashboard').assignedIds(committee).includes(Number(record.clubId));
    if (!owner && !dean && !supervisor) return res.status(403).json({ message: 'You do not have access to this attachment.' });
    const storedAttachments = Array.isArray(record.speakerAttachments) ? record.speakerAttachments : [];
    const attachments = storedAttachments.length ? storedAttachments : (record.cvPublicId ? [{ publicId: record.cvPublicId, format: record.cvFormat || 'pdf' }] : []);
    const attachmentIndex = req.query.attachmentIndex === undefined ? 0 : Number(req.query.attachmentIndex);
    if (!Number.isInteger(attachmentIndex) || attachmentIndex < 0 || attachmentIndex >= attachments.length) return res.status(404).json({ message: 'This request has no attachment at that position.' });
    const attachment = attachments[attachmentIndex];
    const url = cloudinary.utils.private_download_url(attachment.publicId, attachment.format || 'pdf', {
      resource_type: 'raw', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300, attachment: true
    });
    res.json({ url });
  } catch (error) {
    console.error('Speaker CV access failed:', error.name);
    res.status(503).json({ message: 'Could not prepare a secure CV download.' });
  }
});

app.get('/api/dean/speaker-requests', requireClubAuth, async (req, res) => {
  if (req.clubAccount?.role !== 'dean') return res.status(403).json({ message: 'Only the Dean can review external speaker requests.' });
  if (!requireLiveDatabase(res)) return;
  try {
    const records = await SpeakerRequest.find({ workflow: { $exists: false }, $or: [
      { status: 'pending_dean' },
      { status: { $in: ['approved', 'rejected', 'changes_requested'] }, reviewerRole: 'dean', $or: [{ hostingType: 'miu' }, { clubReviewedAt: { $ne: null } }] }
    ] }).sort({ submittedAt: -1 }).lean();
    records.sort((left, right) => Number(right.status === 'pending_dean') - Number(left.status === 'pending_dean'));
    res.json(records.map((record) => ({ ...publicSpeakerRequest(record), requesterType: record.requesterType, requesterEmail: record.requesterEmail })));
  } catch (error) {
    console.error('Dean speaker request list failed:', error.name);
    res.status(503).json({ message: 'Could not load speaker requests right now.' });
  }
});

app.post('/api/dean/speaker-requests/:id/decision', requireClubAuth, async (req, res) => {
  if (req.clubAccount?.role !== 'dean') return res.status(403).json({ message: 'Only the Dean can review external speaker requests.' });
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'This decision could not be verified. Reload and try again.' });
  if (!requireLiveDatabase(res)) return;
  const action = req.body?.action;
  const comment = cleanText(req.body?.comment, 2000);
  if (!validSpeakerDecision('pending_dean', action)) return res.status(400).json({ message: 'Choose approve, reject, or request changes.' });
  if (action === 'request_changes' && !comment) return res.status(400).json({ message: 'Add a comment explaining what changes are needed.' });
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Speaker request not found.' });
    const existing = await SpeakerRequest.findById(req.params.id).select('status requesterEmail').lean();
    if (!existing) return res.status(404).json({ message: 'Speaker request not found.' });
    if (!canReviewSpeakerRequest(req.clubAccount.role, existing.requesterEmail, req.clubAccount.email)) {
      return res.status(403).json({ message: 'A requester cannot review their own speaker request.' });
    }
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes_requested';
    const now = new Date();
    const update = {
      $set: { status, reviewerRole: 'dean', reviewerEmail: req.clubAccount.email, reviewerComment: comment, decidedAt: now },
      $push: { decisionHistory: { action: status, role: 'dean', email: req.clubAccount.email, comment, createdAt: now } }
    };
    if (status === 'approved' || status === 'rejected') update.$unset = { activeRequesterKey: 1 };
    const record = await SpeakerRequest.findOneAndUpdate({ _id: req.params.id, status: 'pending_dean' }, update, { new: true, runValidators: true }).lean();
    if (!record) return res.status(409).json({ message: 'This request has already changed. Refresh the list before reviewing it.' });
    await notifySpeakerWorkflow(record);
    res.json(publicSpeakerRequest(record));
  } catch (error) {
    console.error('Dean speaker request decision failed:', error.name);
    res.status(503).json({ message: 'The decision was not saved. Please try again.' });
  }
});

function clearGoogleNonceCookie(req, res) {
  const secure = secureCookieSuffix(req);
  res.append('Set-Cookie', `miu_google_nonce=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secure}`);
}

function isSameOriginRequest(req) {
  return httpSecurity.sameOrigin(req);
}

async function verifyGoogleRequest(req, res) {
  const nonce = requestCookie(req, 'miu_google_nonce');
  clearGoogleNonceCookie(req, res);
  if (!nonce || !/^[A-Za-z0-9_-]{32}$/.test(nonce)) throw Object.assign(new Error('GOOGLE_CREDENTIAL_INVALID'), { reason: 'nonce_missing' });
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  return verifyGoogleStudentCredential({ credential: req.body?.credential, expectedNonce: nonce, clientId });
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
  return sanitizePublicClub(toApiRecord(record));
}

app.use('/api/ask-ai', createAskAiRouter({
  getPublicClubs: async () => {
    if (!mongoReady || mongoose.connection.readyState !== 1) {
      throw new Error('Live club data is unavailable.');
    }
    const records = await Club.find({ archivedAt: null })
      .select('id sortOrder name committee category tagline description requirements applicationIntro status committeeAvailability events posts')
      .read('primary').readConcern('majority').sort({ sortOrder: 1, id: 1 }).lean();
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

async function limitMyFormAccessAttempts(req, res, next) {
  const token = getMyFormToken(req);
  if (applications.some((application) => canManageMyForm(application, token))) return next();
  if (requestCookie(req, 'miu_student')) {
    try {
      const studentAccount = await getStudentAccountFromRequest(req, res);
      if (studentAccount) {
        req.studentAccount = studentAccount;
        return next();
      }
    } catch {
      // Fall through to the existing code-attempt rate limit if sign-in cannot be checked.
    }
  }

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

function studentApplicationOwnerFilter(account) {
  return { $or: [
    { studentAccountId: account._id },
    { email: String(account.email || '').trim().toLowerCase() }
  ] };
}

async function initializeMongoData() {
  await Promise.all([
    ...Object.values(require('./services/workflow-models')).map(model => model.init()),
    require('./services/custom-staff-role-model').CustomStaffRole.init(),
    require('./services/event-reports').EventReport.init(),
    Club.init(), Application.init(), SiteSetting.init(), UniversityContent.init(), SiteVisitor.init(), SiteNetwork.init(), SiteVisitorPresence.init(), EventRegistration.init(), AttendanceSession.init(), AttendanceAssignment.init(), AttendanceRecord.init(), LoginAttempt.init(),
    PasswordResetToken.init(), PasswordRecoveryRateLimit.init(), NotificationDispatch.init(), AdminAuthState.init()
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
  await SupervisorReview.createIndexes();

  if (!await Club.exists({})) {
    await Club.insertMany(clubs);
  }
  if (!await Application.exists({})) {
    await Application.insertMany(applications);
  }
  if (clubAccounts.length) {
    await ClubAccount.bulkWrite(clubAccounts.map(({ clubId, email, salt, passwordHash, role, committee, assignedClubIds }) => ({
      updateOne: {
        filter: { email },
        update: { $setOnInsert: { clubId, email, salt, passwordHash, role: ['vice_president', 'head', 'pr', 'english', 'security', 'sso', 'dean', 'supervisor', 'miu_events', 'software_development'].includes(role) ? role : 'president', committee: committee || '', assignedClubIds: assignedClubIds || [] } },
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
  const permitsAwaitingDean = await ContentRequest.find({ type: 'entry_permit', status: 'pending_dean', workflow: { $exists: false } });
  for (const record of permitsAwaitingDean) {
    record.status = 'pending_pr';
    record.resubmitTo = 'pending_pr';
    record.clubNotice = 'Security Office review is complete. Waiting for PR final approval.';
    appendWorkflowEvent(record, 'security', 'sent_to_pr_final_review', 'pending_dean', 'pending_pr');
    await record.save();
  }

  // These reads are independent; keep initialization gated until all succeed.
  const [clubRecords, applicationRecords, accountRecords] = await Promise.all([
    Club.find().sort({ sortOrder: 1, id: 1 }).lean(),
    Application.find().sort({ id: 1 }).lean(),
    ClubAccount.find().sort({ clubId: 1, role: 1, committee: 1 }).lean()
  ]);
  ({ clubs, applications, clubAccounts } = require('./database/cache-snapshot').cacheSnapshot(
    { clubRecords, applicationRecords, accountRecords }, toApiRecord));
}

function requireClubPresident(req, res, next) {
  if (req.clubAccount.role !== 'president') {
    return res.status(403).json({ message: 'Only the club president can manage this.' });
  }
  next();
}

function accountCanReviewApplication(account, application) {
  return ['president', 'vice_president', 'head'].includes(account.role) && application.clubId === account.clubId
    && (account.role !== 'head' || application.committee === account.committee);
}

registerPublicClubMedia(app, { Club, requireLiveDatabase,
  readMedia: mongoose.isSqlProvider ? require('./database/public-club-media').readPublicClubMedia : null,
  ensureDatabaseReady: ensureReady });
require('./services/public-content-pagination').registerPublicContentPagination(app, {
  Club, UniversityContent, ensureReady, requireLiveDatabase,
  readPage: mongoose.isSqlProvider ? require('./database/public-content-pagination').readPublicContentPage : null
});
require('./services/public-data-stream').registerPublicDataStream(app, {
  database: mongoose, ready: () => mongoReady,
  collections: {
    [Club.collection.name]: ['clubs'],
    [Application.collection.name]: ['clubs'],
    [UniversityContent.collection.name]: ['universityContent'],
    [require('./services/student-feedback').StudentFeedback.collection.name]: ['clubs', 'universityContent']
  }
});

app.get('/api/clubs', async (req, res) => {
  try {
    if (!mongoReady) await ensureReady();
    if (!requireLiveDatabase(res)) return;
    const [clubsFromDatabase, acceptedMemberGroups] = await Promise.all([
      req.query.media === 'links'
        ? Club.aggregate([{ $match: { archivedAt: null } }, { $sort: { sortOrder: 1, id: 1 } },
          { $project: publicClubProjection() }]).read('primary').readConcern('majority')
        : Club.find({ archivedAt: null }).select(publicFields)
          .read('primary').readConcern('majority').sort({ sortOrder: 1, id: 1 }).lean(),
      Application.aggregate([
        { $match: { status: 'accepted' } },
        { $project: { clubId: 1, email: { $toLower: { $trim: { input: { $ifNull: ['$email', ''] } } } } } },
        { $group: {
          _id: '$clubId',
          emails: { $addToSet: '$email' },
          blankEmailCount: { $sum: { $cond: [{ $eq: ['$email', ''] }, 1, 0] } }
        } }
      ]).read('primary').readConcern('majority')
    ]);
    const applicationWindows = clubsFromDatabase.map((club) => ({
      clubId: club.id,
      ...(club.applicationCycleStartedAt ? { createdAt: { $gte: club.applicationCycleStartedAt } } : {})
    }));
    const { StudentFeedback: feedbackModel } = require('./services/student-feedback');
    const [applicationTotals, ratings] = await Promise.all([
      applicationWindows.length
        ? Application.aggregate([
          { $match: { $or: applicationWindows } },
          { $group: { _id: '$clubId', count: { $sum: 1 } } }
        ])
        : Promise.resolve([]),
      feedbackModel.aggregate([
        { $match: { kind: 'club' } },
        { $group: { _id: '$targetKey', average: { $avg: '$value' }, count: { $sum: 1 } } }
      ])
    ]);
    const acceptedMembersByClub = new Map(acceptedMemberGroups.map((group) => [Number(group._id), group]));
    const membersByClub = new Map(clubsFromDatabase.map((club) => {
      const roster = Array.isArray(club.memberRoster) ? club.memberRoster : [];
      const rosterEmails = new Set(roster.map((member) => String(member.email || '').trim().toLowerCase()).filter(Boolean));
      const accepted = acceptedMembersByClub.get(Number(club.id));
      let combinedCount = roster.length + (Number(accepted?.blankEmailCount) || 0);
      for (const email of accepted?.emails || []) {
        if (email && !rosterEmails.has(email)) {
          rosterEmails.add(email);
          combinedCount += 1;
        }
      }
      return [club.id, combinedCount];
    }));
    const applicantsByClub = new Map(applicationTotals.map((club) => [Number(club._id), club.count]));
    const ratingByClub = new Map(ratings.map((row) => [row._id, row]));
    const records = clubsFromDatabase.map((club) => ({
      ...toPublicClubRecord(club),
      members: membersByClub.get(club.id) ?? (Number(club.members) || 0),
      applicants: applicantsByClub.get(club.id) || 0,
      ratingAverage: ratingByClub.get(String(club._id))?.average || 0,
      ratingCount: ratingByClub.get(String(club._id))?.count || 0
    }));
    sendRevalidatedPublicJson(req, res, records);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.get('/api/university-content', async (req, res) => {
  try {
    if (!mongoReady) await ensureReady();
    if (!mongoReady) return res.status(503).json({ message: 'University updates are temporarily unavailable.' });
    const records = await UniversityContent.find()
      .select(require('./services/university-content').publicFields)
      .read('primary').readConcern('majority').sort({ createdAt: -1, id: -1 }).lean();
    sendRevalidatedPublicJson(req, res, records.map(require('./services/university-content').toPublicUniversityContent));
  } catch (error) {
    console.error('University content read failed:', error.name);
    res.status(503).json({ message: 'University updates are temporarily unavailable.' });
  }
});

require('./services/university-content').registerPublicUniversityContentDetail(app, { UniversityContent, ensureReady, requireLiveDatabase });

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
    const delegatedAdmin = await isSoftwareDevelopmentSession(req, res);
    res.json({
      configured: hasAdminPassword() || delegatedAdmin,
      localSetupAllowed: !httpSecurity.production(process.env) && !hasAdminPassword() && process.env.ALLOW_LOCAL_ADMIN_SETUP === 'true' && isLoopbackRequest(req),
      authenticated: delegatedAdmin || (hasAdminPassword() && await isAdminSessionValid(req, res))
    });
  } catch (error) {
    console.error('Admin session validation failed:', error.name);
    res.status(503).json({ message: 'Admin access is temporarily unavailable.' });
  }
});

require('./services/account-photo').registerAccountPhotoRoutes(app, {
  notifyLater: async (req, email) => {
    if (!process.env.ONESIGNAL_APP_ID || !process.env.ONESIGNAL_REST_API_KEY || !process.env.ONESIGNAL_SITE_URL) return;
    const student = await getStudentAccountFromRequest(req);
    const staff = student ? null : await getClubAccountFromRequest(req);
    const externalId = student ? String(student._id) : staff
      ? clubExternalId(staff)
      : `admin-account:${crypto.createHash('sha256').update(email).digest('hex')}`;
    const eventKey = `account-photo-reminder:${crypto.createHash('sha256').update(email).digest('hex')}`;
    const url = new URL('/?myForms=1&addPhoto=1', process.env.ONESIGNAL_SITE_URL).toString();
    if (!await claimOneSignalDispatch(eventKey, key => NotificationDispatch.create({ eventKey: key, status: 'sending' }))) return;
    try {
      const result = await sendOneSignalPush({ appId: process.env.ONESIGNAL_APP_ID, apiKey: process.env.ONESIGNAL_REST_API_KEY,
        externalIds: [externalId], title: 'Add your profile photo',
        message: 'You can add your photo anytime: open the account menu and choose Add / change photo.', url });
      await NotificationDispatch.updateOne({ eventKey }, { $set: { status: result.messageId ? 'sent' : 'no_recipient', providerMessageId: result.messageId } });
    } catch (error) {
      await NotificationDispatch.updateOne({ eventKey }, { $set: { status: 'failed', errorCode: 'PUSH_FAILED' } });
      console.error('Account photo reminder failed:', error.name);
    }
  },
  databaseReady: () => mongoReady,
  sameOrigin: isSameOriginRequest,
  validatePhoto: (url, publicId) => readCloudinaryAsset(url, publicId, cloudinaryFolders.applicant),
  getEmail: async (req, res) => {
    const student = await getStudentAccountFromRequest(req, res);
    if (student) return student.email;
    const staff = await getClubAccountFromRequest(req, res);
    if (staff) return staff.email;
    return await isAdminSessionValid(req, res) ? getConfiguredAdminEmail() : '';
  }
});

app.get('/api/site/account-session', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // A browser may have both a student login and staff logins. Keep the
    // student identity as the primary account in the profile menu.
    const studentAccount = await getStudentAccountFromRequest(req, res, false);
    if (studentAccount) {
      const signedStaff = await getClubAccountFromRequest(req, res);
      const staffDashboards = signedStaff ? getStaffDashboardOptions(signedStaff) : [];
      return res.json({ authenticated: true, type: 'student', role: 'student', name: studentAccount.name || '', email: studentAccount.email || '', hasStudentDashboard: true, dashboards: staffDashboards });
    }
    const signedStaff = await getClubAccountFromRequest(req, res);
    if (!signedStaff && await isAdminSessionValid(req, res)) {
      const configuredEmail = getConfiguredAdminEmail();
      const staff = mongoReady && configuredEmail
        ? await ClubAccount.findOne({ email: configuredEmail }).read('primary').readConcern('majority').lean()
        : null;
      return res.json({ authenticated: true, type: staff?.role === 'software_development' ? 'club' : 'admin', role: staff?.role === 'software_development' ? staff.role : 'admin',
        name: staff?.role === 'software_development' ? 'Software Development team' : 'Administrator', email: staff?.role === 'software_development' ? staff.email : getConfiguredAdminEmail() || '',
        dashboards: staff ? getStaffDashboardOptions(staff) : [] });
    }
    const clubAccount = signedStaff;
    if (clubAccount) {
      const club = clubs.find((item) => Number(item.id) === Number(clubAccount.clubId));
      return res.json({
        authenticated: true,
        type: 'club',
        role: clubAccount.role,
        clubId: clubAccount.clubId,
        committee: clubAccount.committee || '',
        email: clubAccount.email || '',
        hasStudentDashboard: Boolean(await StudentAccount.exists({ email: clubAccount.email }).catch(() => null)),
        name: clubAccount.customRoles?.find(role => role.key === clubAccount.role)?.name || (['pr', 'english', 'security', 'sso', 'dean'].includes(clubAccount.role)
          ? `${committeeRoleLabels[clubAccount.role] || clubAccount.role} Dashboard`
          : club?.name || ''),
        dashboards: getStaffDashboardOptions(clubAccount)
      });
    }
    return res.json({ authenticated: false });
  } catch (error) {
    console.error('Site account session check failed:', error.name);
    return res.status(503).json({ authenticated: false, message: 'Account status is temporarily unavailable.' });
  }
});

app.get('/api/notifications/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const appId = String(process.env.ONESIGNAL_APP_ID || '').trim();
  const validAppId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(appId);
  res.json(validAppId ? { enabled: true, appId } : { enabled: false });
});

const { clubExternalId, createContentRequestNotifier } = require('./services/content-request-notifications');
const notifyContentRequest = createContentRequestNotifier({ ClubAccount, NotificationDispatch });
const notifyClubOpening = require('./services/club-opening-notifications').createClubOpeningNotifier({
  StudentAccount, ClubAccount, NotificationDispatch, getAdminEmail: getConfiguredAdminEmail
});
app.get('/api/notifications/identity', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (await isAdminSessionValid(req, res)) {
      const staff = await getClubAccountFromRequest(req, res);
      if (staff?.role === 'software_development') return res.json({ externalId: clubExternalId(staff), emailNotificationsEnabled: false, emailSupported: false });
      const email = getConfiguredAdminEmail();
      if (!email) return res.status(503).json({ message: 'Admin notification identity is temporarily unavailable.' });
      return res.json({ externalId: `admin-account:${crypto.createHash('sha256').update(email.toLowerCase()).digest('hex')}`,
        emailNotificationsEnabled: false, emailSupported: false });
    }
    const club = await getClubAccountFromRequest(req, res);
    if (club?._id) return res.json({ externalId: clubExternalId(club), emailNotificationsEnabled: false, emailSupported: false });
    const student = await getStudentAccountFromRequest(req, res);
    if (!student) return res.status(401).json({ message: 'Sign in to enable notifications.' });
    return res.json({ externalId: String(student._id), email: student.email, emailNotificationsEnabled: Boolean(student.emailNotificationsEnabled) });
  } catch (error) {
    return res.status(503).json({ message: 'Notification settings are temporarily unavailable.' });
  }
});

app.put('/api/notifications/email-preference', requireStudentAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'This request could not be verified.' });
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ message: 'Choose whether email updates are on or off.' });
  try {
    const result = await StudentAccount.updateOne({ _id: req.studentAccount._id }, { $set: { emailNotificationsEnabled: req.body.enabled } });
    if (!result.matchedCount) return res.status(401).json({ message: 'Sign in again to update your preference.' });
    res.json({ emailNotificationsEnabled: req.body.enabled });
  } catch (error) {
    console.error('Email notification preference update failed:', error.name);
    res.status(503).json({ message: 'Your email preference could not be saved. Please try again.' });
  }
});

async function dispatchAcceptedApplicationPush(application) {
  const appId = String(process.env.ONESIGNAL_APP_ID || '').trim();
  const apiKey = String(process.env.ONESIGNAL_REST_API_KEY || '').trim();
  const configuredBaseUrl = String(process.env.ONESIGNAL_SITE_URL || '').trim();
  const externalId = application?.studentAccountId ? String(application.studentAccountId) : '';
  if (!appId || !apiKey || !configuredBaseUrl || !externalId) return;

  let notificationUrl;
  try {
    const parsedBase = new URL(configuredBaseUrl);
    const isLoopback = ['localhost', '127.0.0.1'].includes(parsedBase.hostname);
    if (parsedBase.protocol !== 'https:' && !(isLoopback && parsedBase.protocol === 'http:')) throw new Error('INVALID_ORIGIN');
    notificationUrl = new URL('/?myForms=1', parsedBase).toString();
  } catch {
    return;
  }
  const student = await StudentAccount.findById(externalId).select('emailNotificationsEnabled').lean().catch((error) => {
    console.error('Notification recipient lookup failed:', error.name);
    return null;
  });
  const sendChannel = async (channel, send) => {
    const eventKey = channel === 'push'
      ? `application-accepted:${application.id}`
      : `application-accepted:${application.id}:email`;
    try {
      const claimed = await claimOneSignalDispatch(eventKey, (key) => NotificationDispatch.create({ eventKey: key, status: 'sending' }));
      if (!claimed) return;
      const result = await send();
      await NotificationDispatch.updateOne({ eventKey }, {
        $set: { status: result.messageId ? 'sent' : 'no_recipient', providerMessageId: result.messageId }
      }).catch((error) => console.error(`${channel} dispatch status update failed:`, error.name));
    } catch (error) {
      const errorCode = error instanceof OneSignalApiError
        ? `HTTP_${error.status}`
        : error.message === 'ONESIGNAL_INVALID_RECIPIENTS' ? 'RECIPIENT_LIMIT'
          : error.name === 'TimeoutError' || error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';
      await NotificationDispatch.updateOne({ eventKey }, { $set: { status: 'failed', errorCode } }).catch(() => {});
      console.error(`OneSignal ${channel} dispatch failed:`, errorCode);
    }
  };
  await sendChannel('push', () => sendOneSignalPush({
    appId,
    apiKey,
    externalId,
    title: 'MIU Clubs',
    message: 'Your club application status has been updated. Sign in to view it.',
    url: notificationUrl
  }));
  if (student?.emailNotificationsEnabled) {
    await sendChannel('email', () => sendOneSignalEmail({
      appId,
      apiKey,
      externalId,
      subject: 'MIU Clubs: application update',
      message: 'Your club application status has been updated.',
      url: notificationUrl
    }));
  }
}

async function notifySpeakerWorkflow(record) {
  await dispatchSpeakerRequestStatusPush(record);
  await notifyContentRequest({ ...record, type: 'speaker', id: String(record._id),
    workflowHistory: (record.decisionHistory || []).map(event => ({ ...event, actorEmail: event.email })) });
}
async function notifyAttendanceWorkflow(key, status, action, revision = new Date()) {
  await notifyContentRequest({ ...key, _id: 'attendance:' + key.clubId + ':' + key.itemType + ':' + key.eventRequestId,
    id: key.eventRequestId, type: 'attendance', status,
    workflowHistory: [{ _id: new Date(revision).getTime(), action, role: 'club' }] });
}

async function dispatchSpeakerRequestStatusPush(request) {
  const statusMessages = {
    pending_supervisor: 'Your speaker request is waiting for the hosting club supervisor.',
    pending_dean: request => request.hostingType === 'miu'
      ? 'Your MIU official university speaker request is waiting for Dean review.'
      : 'The club supervisor approved your speaker request and sent it to the Dean for review.',
    approved: 'Your speaker request was approved. Sign in to view the review details.',
    rejected: 'Your speaker request was declined. Sign in to view the review details.',
    changes_requested: 'Changes were requested to your speaker request. Sign in to review the feedback.'
  };
  if (request?.requesterType !== 'student' || !statusMessages[request.status]
    || !mongoose.isValidObjectId(request.requesterId)) return;

  const appId = String(process.env.ONESIGNAL_APP_ID || '').trim();
  const apiKey = String(process.env.ONESIGNAL_REST_API_KEY || '').trim();
  const configuredBaseUrl = String(process.env.ONESIGNAL_SITE_URL || '').trim();
  if (!appId || !apiKey || !configuredBaseUrl) return;

  let notificationUrl;
  try {
    const parsedBase = new URL(configuredBaseUrl);
    const isLoopback = ['localhost', '127.0.0.1'].includes(parsedBase.hostname);
    if (parsedBase.protocol !== 'https:' && !(isLoopback && parsedBase.protocol === 'http:')) throw new Error('INVALID_ORIGIN');
    notificationUrl = new URL('/', parsedBase).toString();
  } catch {
    return;
  }

  let eventKey = '';
  try {
    const student = await StudentAccount.findById(request.requesterId).select('_id').lean();
    if (!student) return;
    eventKey = `speaker-request:${request._id}:status:${request.status}:${new Date(request.updatedAt || Date.now()).getTime()}`;
    const claimed = await claimOneSignalDispatch(eventKey, (key) => NotificationDispatch.create({ eventKey: key, status: 'sending' }));
    if (!claimed) return;
    const result = await sendOneSignalPush({
      appId,
      apiKey,
      externalId: String(student._id),
      title: 'MIU Clubs · Speaker request',
      message: typeof statusMessages[request.status] === 'function' ? statusMessages[request.status](request) : statusMessages[request.status],
      url: notificationUrl
    });
    await NotificationDispatch.updateOne({ eventKey }, {
      $set: { status: result.messageId ? 'sent' : 'no_recipient', providerMessageId: result.messageId }
    }).catch((error) => console.error('Speaker request push status update failed:', error.name));
  } catch (error) {
    const errorCode = error instanceof OneSignalApiError
      ? `HTTP_${error.status}`
      : error.message === 'ONESIGNAL_INVALID_RECIPIENTS' ? 'RECIPIENT_LIMIT'
        : error.name === 'TimeoutError' || error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';
    if (eventKey) await NotificationDispatch.updateOne({ eventKey }, { $set: { status: 'failed', errorCode } }).catch(() => {});
    console.error('Speaker request push dispatch failed:', errorCode);
  }
}

async function dispatchPublishedContentNotifications({ source, contentId, revision, type, title }) {
  const appId = String(process.env.ONESIGNAL_APP_ID || '').trim();
  const apiKey = String(process.env.ONESIGNAL_REST_API_KEY || '').trim();
  const configuredBaseUrl = String(process.env.ONESIGNAL_SITE_URL || '').trim();
  if (!appId || !apiKey || !configuredBaseUrl) return;

  let feedUrl;
  try {
    const parsedBase = new URL(configuredBaseUrl);
    const isLoopback = ['localhost', '127.0.0.1'].includes(parsedBase.hostname);
    if (parsedBase.protocol !== 'https:' && !(isLoopback && parsedBase.protocol === 'http:')) throw new Error('INVALID_ORIGIN');
    feedUrl = new URL('/pages/feed.html', parsedBase).toString();
  } catch {
    console.error('Published content notification skipped: INVALID_SITE_URL');
    return;
  }

  const safeTitle = cleanText(title, 140).replace(/[\r\n\t]+/g, ' ');
  const kindLabels = { event: 'event', announcement: 'announcement', feed: 'club update', sponsor: 'sponsor update', booth: 'booth update' };
  if (!safeTitle || !kindLabels[type]) return;
  const kind = kindLabels[type];
  let students;
  try {
    students = await StudentAccount.find({}).select('_id emailNotificationsEnabled').read('primary').readConcern('majority').lean();
  } catch (error) {
    console.error('Published content notification recipients unavailable:', error.name);
    return;
  }
  const allStudentIds = students.map((student) => String(student._id));
  const emailStudentIds = students.filter((student) => student.emailNotificationsEnabled === true).map((student) => String(student._id));
  const publishKey = `published-content:${source}:${contentId}:${revision}`;
  const message = `New ${kind} published: ${safeTitle}. Open the club feed for details.`;

  const sendChannel = async (channel, externalIds, send) => {
    if (!externalIds.length) return;
    const eventKey = `${publishKey}:${channel}`;
    try {
      const claimed = await claimOneSignalDispatch(eventKey, (key) => NotificationDispatch.create({ eventKey: key, status: 'sending' }));
      if (!claimed) return;
      const result = await send();
      await NotificationDispatch.updateOne({ eventKey }, {
        $set: { status: result.messageId ? 'sent' : 'no_recipient', providerMessageId: result.messageId }
      }).catch((error) => console.error(`${channel} broadcast status update failed:`, error.name));
    } catch (error) {
      const errorCode = error instanceof OneSignalApiError
        ? `HTTP_${error.status}`
        : error.message === 'ONESIGNAL_INVALID_RECIPIENTS' ? 'RECIPIENT_LIMIT'
          : error.name === 'TimeoutError' || error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';
      await NotificationDispatch.updateOne({ eventKey }, { $set: { status: 'failed', errorCode } }).catch(() => {});
      console.error(`OneSignal ${channel} broadcast failed:`, errorCode);
    }
  };

  await sendChannel('push', allStudentIds, () => sendOneSignalPush({
    appId,
    apiKey,
    externalIds: allStudentIds,
    title: 'MIU Clubs',
    message,
    url: feedUrl
  }));
  await sendChannel('email', emailStudentIds, () => sendOneSignalEmail({
    appId,
    apiKey,
    externalIds: emailStudentIds,
    subject: `New ${kind}: ${safeTitle}`,
    message,
    url: feedUrl
  }));
}

// Count an event detail open as an interest signal (not a unique visitor count).
app.post('/api/events/:clubId/:eventIndex/view', async (req, res) => {
  const clubId = Number(req.params.clubId);
  const eventIndex = Number(req.params.eventIndex);
  if (!Number.isInteger(clubId) || !Number.isInteger(eventIndex) || clubId < 1 || eventIndex < 0) {
    return res.status(400).json({ message: 'This event could not be found.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const club = await Club.findOne({ id: clubId, archivedAt: null })
      .select('events').read('primary').readConcern('majority').lean();
    if (!club?.events?.[eventIndex]) return res.status(404).json({ message: 'This event could not be found.' });
    const eventRequestId = Number(club.events[eventIndex]?.requestId);
    const key = eventRequestId > 0 ? `${clubId}:request:${eventRequestId}` : `${clubId}:${eventIndex}`;
    eventViews[key] = Number(eventViews[key] || 0) + 1;
    writeJsonFile(eventViewsFile, eventViews);
    const student = await getStudentAccountFromRequest(req, res);
    if (student) {
      const interestKey = { studentEmail: student.email, clubId, eventIndex };
      try {
        await StudentInterest.updateOne(
          interestKey,
          {
            $setOnInsert: interestKey,
            $set: { eventTitle: cleanText(club.events[eventIndex].title, 140), lastViewedAt: new Date() },
            $inc: { detailViews: 1 }
          },
          { upsert: true, writeConcern: { w: 'majority' } }
        );
      } catch (error) {
        if (error.code !== 11000) throw error;
        await StudentInterest.updateOne(interestKey, {
          $set: { eventTitle: cleanText(club.events[eventIndex].title, 140), lastViewedAt: new Date() },
          $inc: { detailViews: 1 }
        }, { writeConcern: { w: 'majority' } });
      }
    }
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
    account = await getClubAccountFromRequest(req, res);
  } catch (error) {
    console.error('Club session validation failed:', error.name);
    return res.status(503).json({ message: 'Club access is temporarily unavailable.' });
  }
  if (account && ['pr', 'english', 'security', 'sso', 'dean', 'supervisor', 'miu_events', 'software_development'].includes(account.role)) {
    const dashboardName = account.role === 'miu_events' ? 'MIU Events' : account.role === 'software_development' ? 'Software Development team' : account.role.toUpperCase();
    return res.json({
      configured: clubAccounts.length > 0,
      authenticated: true,
      club: { id: 0, name: dashboardName, image: '/assets/img/pics/logo.svg.png', role: account.role, committee: '' }
    });
  }
  const club = account && clubs.find((item) => item.id === account.clubId);
  const hasAssignedContent = account?.role === 'head' && mongoReady
    ? Boolean(await ContentRequest.exists({
      clubId: account.clubId,
      assignedHeadEmail: account.email,
      type: { $ne: 'entry_permit' },
      status: { $in: ['draft', 'changes_requested', 'rejected'] }
    }).catch(() => null))
    : false;
  res.json({
    configured: clubAccounts.length > 0,
    authenticated: Boolean(account && club),
    club: account && club ? {
      id: club.id,
      name: club.name,
      image: club.image,
      status: club.status,
      role: account.role,
      committee: account.committee || '',
      hasAssignedContent
    } : null
  });
});

app.post('/api/club-auth/switch-dashboard', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'Reload and try again.' });
  if (!mongoReady) return res.status(503).json({ message: 'Dashboard access is temporarily unavailable.' });
  try {
    let account = await getClubAccountFromRequest(req, res);
    if (!account && await isAdminSessionValid(req, res)) {
      const email = getConfiguredAdminEmail();
      if (email) account = await ClubAccount.findOne({ email }).read('primary').readConcern('majority').lean();
    }
    if (!account) return res.status(401).json({ message: 'Sign in to switch dashboards.' });
    if (req.body?.role === 'student') {
      const studentAccount = await StudentAccount.findOne({ email: account.email }).read('primary').readConcern('majority').lean();
      if (!studentAccount) return res.status(403).json({ message: 'A student dashboard is not linked to this account.' });
      setStudentSessionCookie(req, res, studentAccount);
      return res.json({ redirect: '/?myForms=1', role: 'student' });
    }
    const assignment = getStaffDashboardOptions(account).find(item => item.role === req.body?.role
      && (req.body?.clubId === undefined || item.clubId === Number(req.body.clubId))
      && (req.body?.committee === undefined || item.committee === String(req.body.committee || '')));
    if (!assignment) return res.status(403).json({ message: 'This dashboard is not assigned to your account.' });
    setClubSessionCookie(req, res, account, assignment);
    return res.json({ redirect: assignment.href, role: assignment.role });
  } catch (error) {
    console.error('Dashboard switch failed:', error.name);
    return res.status(503).json({ message: 'Dashboard access is temporarily unavailable.' });
  }
});

app.post('/api/club-auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', [
    `miu_student=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`,
    `miu_club=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`,
    `miu_admin=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`
  ]);
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
    image: club.image,
    status: club.status
  });
});

// Public event registration — saved to MongoDB, one registration per email per event.
app.patch('/api/club/status', requireClubAuth, async (req, res) => {
  if (req.clubAccount.role !== 'president') {
    return res.status(403).json({ message: 'Only the club president can change club status.' });
  }
  const clubId = Number(req.clubAccount.clubId);
  const status = typeof req.body.status === 'string' ? req.body.status : '';
  if (!Number.isSafeInteger(clubId) || clubId < 1 || !['open', 'opening-soon', 'full', 'closed'].includes(status)) {
    return res.status(400).json({ message: 'Choose Open, Opening soon, Full, or Closed.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const currentClub = await Club.findOne({ id: clubId, archivedAt: null })
      .select('id name status applicationCycleStartedAt')
      .read('primary').readConcern('majority').lean();
    if (!currentClub) return res.status(404).json({ message: 'Your club could not be found.' });
    const statusUpdate = { status };
    if (status === 'open' && currentClub.status !== 'open') {
      statusUpdate.applicationCycleStartedAt = new Date();
    }
    const saved = await Club.findOneAndUpdate(
      { id: clubId, archivedAt: null, status: currentClub.status },
      { $set: statusUpdate },
      { new: true, runValidators: true, writeConcern: { w: 'majority' } }
    ).select('id name status applicationCycleStartedAt').read('primary').lean();
    if (!saved) return res.status(409).json({ message: 'The club status changed. Refresh and try again.' });
    const applicationQuery = { clubId };
    if (saved.applicationCycleStartedAt) applicationQuery.createdAt = { $gte: saved.applicationCycleStartedAt };
    const applicantCount = await Application.countDocuments(applicationQuery).read('primary').readConcern('majority');
    const clubIndex = clubs.findIndex((item) => Number(item.id) === clubId);
    if (clubIndex >= 0) clubs[clubIndex] = {
      ...clubs[clubIndex],
      status: saved.status,
      applicationCycleStartedAt: saved.applicationCycleStartedAt
    };
    res.setHeader('Cache-Control', 'no-store');
    await notifyClubOpening(currentClub.status, saved);
    res.json({ savedToDatabase: true, clubId, status: saved.status, applicants: applicantCount });
  } catch (error) {
    console.error('Club president status update failed:', error.name);
    res.status(503).json({ message: 'Could not save your club status. Please try again.' });
  }
});

require('./services/student-event-registration').registerStudentEvents(app, {
  Club, Application, EventRegistration, StudentInterest, mongoose, requireStudentAuth,
  sameOrigin: isSameOriginRequest, databaseReady: () => mongoReady
});
// Existing all-student MIU registration keeps the public form, while member-only
// MIU events require a signed-in student identity and a verified club membership.
async function requireMiuMemberRegistrationAuth(req, res, next) {
  const eventId = Number(req.params.id);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return next();
  try {
    if (!requireLiveDatabase(res)) return;
    const event = await UniversityContent.findOne({ id: eventId, type: 'event' }).select('attendanceAudience').lean();
    if (event?.attendanceAudience === 'members') return requireStudentAuth(req, res, next);
    next();
  } catch {
    res.status(503).json({ message: 'This event registration is temporarily unavailable.' });
  }
}
async function handleUniversityEventRegistration(req, res) {
  const eventId = Number(req.params.id);
  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    return res.status(400).json({ message: 'This event could not be found.' });
  }
  if (req.method !== 'GET' && !isSameOriginRequest(req)) return res.status(403).json({ message: 'Reload the event page before registering.' });

  try {
    if (!requireLiveDatabase(res)) return;
    const event = await UniversityContent.findOne({ id: eventId, type: 'event' })
      .read('primary').readConcern('majority').lean();
    if (!event) return res.status(404).json({ message: 'This event could not be found.' });
    if (event.registrationEnabled !== true) {
      return res.status(409).json({ message: 'Registration is not open for this event.' });
    }
    const audience = event.attendanceAudience === 'members' ? 'members' : 'all_students';
    const student = req.studentAccount;
    const email = audience === 'members' ? cleanText(student?.email, 254).toLowerCase() : cleanText(req.body?.email, 254).toLowerCase();
    const name = audience === 'members' ? cleanText(student?.name, 160) : cleanText(req.body?.name, 160);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: audience === 'members' ? 'Complete your signed-in MIU student profile before registering.' : 'Enter your name and a valid university email.' });
    }
    const rulesMessage = require('./services/student-event-registration').eventRules(event);
    if (rulesMessage) return res.status(409).json({ message: rulesMessage });
    let isClubMember = audience === 'all_students';
    if (audience === 'members') {
      const [rosterClubs, acceptedMemberships] = await Promise.all([
        Club.find({ archivedAt: null, 'memberRoster.email': email }).select('id').lean(),
        Application.find({ email, status: 'accepted' }).select('clubId').lean()
      ]);
      isClubMember = rosterClubs.length > 0 || acceptedMemberships.length > 0;
    }
    const existing = await EventRegistration.findOne({ clubId: 0, eventIndex: eventId, email }).lean();
    if (req.method === 'GET') {
      const registeredCount = await EventRegistration.countDocuments({ clubId: 0, eventIndex: eventId });
      return res.json({ registered: Boolean(existing), eligible: isClubMember, audience,
        message: existing ? 'You are registered for this event.' : !isClubMember ? 'Registration is limited to current members of any MIU club.'
          : audience === 'members' ? 'Registration is open to current MIU club members.' : 'Registration is open to all university students.',
        cancellationAllowed: false, capacity: null, registeredCount });
    }
    if (!isClubMember) return res.status(403).json({ message: 'Registration is limited to current members of any MIU club.' });
    if (existing) return res.status(409).json({ message: 'This email is already registered for the event.' });
    const registration = await EventRegistration.create({
      id: Date.now() * 1000 + crypto.randomInt(1000), clubId: 0, eventIndex: eventId, eventRequestId: eventId,
      registrationKey: `miu:${eventId}:${email}`, eventTitle: cleanText(event.title, 140), name, email,
      ...(student?._id ? { studentAccountId: student._id } : {})
    });
    const confirmed = await EventRegistration.findById(registration._id)
      .read('primary').readConcern('majority').select('_id').lean();
    if (!confirmed) throw new Error('University event registration was not confirmed in the database.');
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ message: 'You are registered for this event.', registrationId: registration.id });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This email is already registered for the event.' });
    }
    console.error('University event registration failed:', error.name);
    res.status(503).json({ message: 'This form was not saved. Please try again.' });
  }
}
app.get('/api/university-content/:id/registrations', requireMiuMemberRegistrationAuth, handleUniversityEventRegistration);
app.post('/api/university-content/:id/registrations', requireMiuMemberRegistrationAuth, handleUniversityEventRegistration);

// Attendance sessions are backed by MongoDB. Only a club president or an IT
// committee head can create sessions and review the resulting attendance.
app.get('/api/club/attendance-events', requireClubAuth, async (req, res) => {
  if (!['president', 'head'].includes(req.clubAccount.role)) return res.status(403).json({ message: 'Attendance is available to club presidents and committee heads.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const filter = canManageAttendance(req.clubAccount) && isItCommitteeHead(req.clubAccount)
      ? { archivedAt: null }
      : { id: req.clubAccount.clubId, archivedAt: null };
    const records = await Club.find(filter).select('id name events booths').sort({ name: 1 }).lean();
    const activities = records.flatMap((club) => ['event', 'booth'].flatMap((itemType) => {
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
          attendanceAudience: itemType === 'event' && ['members', 'all_students'].includes(item.attendanceAudience) ? item.attendanceAudience : '',
          date,
          time: cleanText(item.time || item.boothOpenTime, 80),
          location: cleanText(item.location || item.boothLocation, 160)
        }];
      });
    }));
    const closures = activities.length ? await AttendanceActivityClosure.find({
      $or: activities.map(({ clubId, itemType, eventRequestId }) => ({ clubId, itemType, eventRequestId }))
    }).select('clubId itemType eventRequestId endedAt endedByRole').lean() : [];
    const closureMap = new Map(closures.map((entry) => [attendanceActivityKey(entry), entry]));
    res.setHeader('Cache-Control', 'no-store');
    res.json(activities.map((activity) => {
      const closure = closureMap.get(attendanceActivityKey(activity));
      return { ...activity, attendanceEnded: Boolean(closure), attendanceEndedAt: closure?.endedAt || null, attendanceEndedByRole: closure?.endedByRole || '' };
    }));
  } catch (error) {
    console.error('Attendance events could not be loaded:', error.name);
    res.status(503).json({ message: 'Could not load events from the database.' });
  }
});

app.post('/api/club/attendance-events/:clubId/:itemType/:eventRequestId/end', requireClubAuth, async (req, res) => {
  const account = req.clubAccount;
  const clubId = Number(req.params.clubId);
  const eventRequestId = Number(req.params.eventRequestId);
  const itemType = req.params.itemType;
  if (!['president', 'head'].includes(account.role)) return res.status(403).json({ message: 'Only the club president or a committee head can end attendance.' });
  if (clubId !== Number(account.clubId) || !Number.isSafeInteger(eventRequestId) || !['event', 'booth'].includes(itemType)) {
    return res.status(400).json({ message: 'Choose a valid event or booth in your club.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const club = await Club.findOne({ id: clubId, archivedAt: null }).select('id events booths').read('primary').readConcern('majority').lean();
    const items = itemType === 'event' ? club?.events : club?.booths;
    let selected = eventRequestId > 0 ? (items || []).find((item) => Number(item.requestId) === eventRequestId) : null;
    if (eventRequestId < 0) {
      const legacyOffset = itemType === 'booth' ? 1_000_000 : 0;
      const itemIndex = -eventRequestId - legacyOffset - 1;
      selected = itemIndex >= 0 ? items?.[itemIndex] : null;
      if (selected?.requestId) selected = null;
    }
    const eventTitle = cleanText(selected?.title || selected?.boothName, 140);
    const eventDate = cleanText(selected?.date || selected?.boothOpenDate, 80);
    if (!club || !selected || !eventTitle) return res.status(404).json({ message: 'This event or booth could not be found in your club.' });
    if (itemType === 'event' && selected.attendanceEnabled === false) return res.status(409).json({ message: 'This event was published without attendance tracking.' });
    if (!isActivityScheduledToday(eventDate)) return res.status(409).json({ message: 'Attendance can only be ended on the event or booth day.' });
    const key = { clubId, itemType, eventRequestId };
    const endedAt = new Date();
    let alreadyEnded = false;
    try {
      const result = await AttendanceActivityClosure.updateOne(key, { $setOnInsert: {
        ...key, eventTitle, eventDate, endedByEmail: account.email, endedByRole: account.role, endedAt
      } }, { upsert: true, writeConcern: { w: 'majority' } });
      alreadyEnded = !result.upsertedCount;
    } catch (error) {
      if (error.code !== 11000) throw error;
      alreadyEnded = true;
    }
    await AttendanceSession.updateMany({ ...key, active: true }, { $set: { active: false } }, { writeConcern: { w: 'majority' } });
    const closure = await AttendanceActivityClosure.findOne(key).read('primary').readConcern('majority').lean();
    if (!closure) throw new Error('Attendance closure could not be confirmed in the database.');
    await notifyAttendanceWorkflow(key, 'pending_supervisor', 'submitted', closure.endedAt);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ended: true, alreadyEnded, endedAt: closure.endedAt });
  } catch (error) {
    console.error('Attendance could not be ended:', error.name);
    res.status(503).json({ message: 'Attendance was not ended. Please retry.' });
  }
});

app.post('/api/miu/attendance-events/:eventRequestId/end', requireAttendanceSessionManager, async (req, res) => {
  const account = req.clubAccount;
  const eventRequestId = Number(req.params.eventRequestId);
  if (!['pr', 'sso', 'dean', 'miu_events', 'admin', 'software_development'].includes(account.role)) return res.status(403).json({ message: 'MIU attendance can be managed by PR, SSO, Dean, the MIU Events team, or the global administrator.' });
  if (!Number.isSafeInteger(eventRequestId) || eventRequestId <= 0) return res.status(400).json({ message: 'Choose a valid MIU event.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const event = await UniversityContent.findOne({ id: eventRequestId, type: 'event', attendanceEnabled: true }).select('id title date').read('primary').readConcern('majority').lean();
    if (!event || !isActivityScheduledToday(event.date)) return res.status(409).json({ message: 'Attendance can only be ended for a published MIU event on its event day.' });
    const key = { clubId: 0, itemType: 'event', eventRequestId };
    const endedAt = new Date();
    await AttendanceActivityClosure.updateOne(key, { $setOnInsert: { ...key, eventTitle: event.title, eventDate: event.date,
      endedByEmail: account.email, endedByRole: account.role, endedAt } }, { upsert: true, writeConcern: { w: 'majority' } });
    await AttendanceSession.updateMany({ ...key, sourceType: 'miu', active: true }, { $set: { active: false } }, { writeConcern: { w: 'majority' } });
    const closure = await AttendanceActivityClosure.findOne(key).read('primary').readConcern('majority').lean();
    if (!closure) throw new Error('MIU attendance closure could not be confirmed.');
    await notifyAttendanceWorkflow(key, 'pending_supervisor', 'submitted', closure.endedAt);
    res.json({ ended: true, endedAt: closure.endedAt });
  } catch (error) {
    console.error('MIU attendance could not be ended:', error.name);
    res.status(503).json({ message: 'MIU attendance was not ended. Please retry.' });
  }
});

app.post('/api/attendance/admin-self-checkin', requireClubAuth, async (req, res) => {
  const account = req.clubAccount;
  if (!['president', 'head'].includes(account.role)) {
    return res.status(403).json({ message: 'Only club presidents and committee heads can check in for themselves.' });
  }
  const clubId = Number(req.body.clubId);
  const eventRequestId = Number(req.body.eventRequestId);
  const itemType = ['event', 'booth'].includes(req.body.itemType) ? req.body.itemType : '';
  const name = cleanText(req.body.name, 160);
  const email = cleanText(account.email, 254).toLowerCase();
  if (typeof req.body.universityId !== 'string' || !req.body.universityId.trim() || req.body.universityId.length > 40
    || typeof req.body.major !== 'string' || !req.body.major.trim() || req.body.major.length > 120) {
    return res.status(400).json({ message: 'Enter your MIU ID (maximum 40 characters) and major (maximum 120 characters).' });
  }
  let universityId = req.body.universityId.trim(), major = req.body.major.trim();
  if (clubId !== Number(account.clubId) || !Number.isSafeInteger(eventRequestId) || !itemType || !name) {
    return res.status(400).json({ message: 'Enter your name and choose an event or booth from your club.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const selfProfile = await StudentAccount.findOne({ email }).select('universityId major').lean();
    universityId = selfProfile?.universityId || universityId;
    major = selfProfile?.major || major;
    const club = await Club.findOne({ id: clubId, archivedAt: null })
      .select('id name events booths').read('primary').readConcern('majority').lean();
    const items = itemType === 'event' ? club?.events : club?.booths;
    let selected = eventRequestId > 0 ? (items || []).find((item) => Number(item.requestId) === eventRequestId) : null;
    if (eventRequestId < 0) {
      const legacyOffset = itemType === 'booth' ? 1_000_000 : 0;
      const itemIndex = -eventRequestId - legacyOffset - 1;
      selected = itemIndex >= 0 ? items?.[itemIndex] : null;
      if (selected?.requestId) selected = null;
    }
    const eventTitle = cleanText(selected?.title || selected?.boothName, 140);
    const eventDate = cleanText(selected?.date || selected?.boothOpenDate, 80);
    const eventTime = cleanText(selected?.time || selected?.boothOpenTime, 80);
    if (!club || !selected || !eventTitle) return res.status(404).json({ message: 'This event or booth could not be found in your club.' });
    if (itemType === 'event' && selected.attendanceEnabled === false) return res.status(409).json({ message: 'This event was published without attendance tracking.' });
    if (!isActivityScheduledToday(eventDate)) return res.status(409).json({ message: 'You can check in only on the event or booth date.' });
    if (await isAttendanceActivityManuallyEnded(clubId, itemType, eventRequestId)) return res.status(409).json({ message: 'Attendance has ended for this event or booth.' });

    const deviceHashes = attendanceDeviceHashes(req, res);
    const deviceHash = deviceHashes[0];
    const existing = await AttendanceRecord.findOne({
      clubId, itemType, eventRequestId,
      $or: [{ email }, { deviceHash: { $in: deviceHashes } }]
    }).select('+deviceHash email').read('primary').readConcern('majority').lean();
    if (String(existing?.email || '').trim().toLowerCase() === email) {
      if (existing.deviceHash && !deviceHashes.includes(existing.deviceHash)) return res.status(409).json({ message: 'Your attendance for this activity is tied to another device.' });
      await AttendanceRecord.updateOne({ _id: existing._id, email }, { $set: { eventParticipation: { role: account.role } } });
      return res.json({ savedToDatabase: true, alreadyRecorded: true, message: 'Your attendance is already recorded for this event or booth.' });
    }
    if (existing) return res.status(409).json({ message: 'Attendance has already been recorded from this device for this event or booth.' });
    if (await isAttendanceActivityManuallyEnded(clubId, itemType, eventRequestId)) return res.status(409).json({ message: 'Attendance has ended for this event or booth.' });

    // Keep a database session reference for the record without opening or
    // replacing the rotating QR session used by student check-ins.
    const session = await AttendanceSession.create({
      clubId, itemType, eventRequestId, eventTitle, eventDate, eventTime,
      tokenHash: attendanceTokenHash(crypto.randomBytes(32).toString('base64url')),
      active: false,
      createdBy: email
    });
    try {
      const record = await AttendanceRecord.create({
        sessionId: session._id, clubId, itemType, eventRequestId, eventTitle,
        eventDate, eventTime, name, email, universityId, major, deviceHash, attendedAt: new Date(),
        eventParticipation: { role: account.role },
        attendanceAudience: selected.attendanceAudience === 'all_students' ? 'all_students' : 'members',
        ...await require('./services/attendance-participation').membershipSnapshot(email, { Club, Application })
      });
      const confirmed = await AttendanceRecord.findById(record._id).select('email clubId eventRequestId')
        .read('primary').readConcern('majority').lean();
      if (!confirmed || confirmed.email !== email || confirmed.clubId !== clubId || confirmed.eventRequestId !== eventRequestId) {
        throw new Error('Self check-in could not be confirmed in the database.');
      }
    } catch (error) {
      if (error.code === 11000) {
        await AttendanceSession.deleteOne({ _id: session._id }).catch(() => {});
        const accountRecord = await AttendanceRecord.findOne({ clubId, itemType, eventRequestId, email })
          .select('email').read('primary').readConcern('majority').lean();
        if (error.keyPattern?.email || accountRecord) {
          return res.json({ savedToDatabase: true, alreadyRecorded: true, message: 'Your attendance is already recorded for this event or booth.' });
        }
        return res.status(409).json({ message: 'Attendance has already been recorded from this device for this event or booth.' });
      }
      throw error;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ savedToDatabase: true, message: 'Your attendance was recorded.' });
  } catch (error) {
    console.error('Club admin self check-in failed:', error.name);
    res.status(503).json({ message: 'Attendance was not saved. Please try again.' });
  }
});

app.post('/api/club/attendance-sessions', requireAttendanceSessionManager, async (req, res) => {
  const role = req.clubAccount.role;
  const isMiuReviewer = ['pr', 'sso', 'dean', 'miu_events', 'admin', 'software_development'].includes(role);
  const isMiuSession = Number(req.body.clubId) === 0;
  if (!(isMiuSession ? isMiuReviewer : canManageAttendance(req.clubAccount))) {
    return res.status(403).json({ message: 'Attendance tools are available to club presidents and the IT head.' });
  }
  const clubId = Number(req.body.clubId);
  const itemType = ['event', 'booth'].includes(req.body.itemType) ? req.body.itemType : 'event';
  const eventRequestId = Number(req.body.eventRequestId);
  if (!Number.isInteger(clubId) || !Number.isInteger(eventRequestId)) {
    return res.status(400).json({ message: 'Choose a valid event.' });
  }
  if (!isMiuSession && role === 'president' && clubId !== Number(req.clubAccount.clubId)) {
    return res.status(403).json({ message: 'You can only create attendance QR codes for your own club.' });
  }
  if (isMiuSession && itemType !== 'event') return res.status(400).json({ message: 'MIU attendance is available for university events.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const [club, miuEvent] = await Promise.all([
      isMiuSession ? Promise.resolve(null) : Club.findOne({ id: clubId, archivedAt: null }).select('id name events booths').lean(),
      isMiuSession ? UniversityContent.findOne({ id: eventRequestId, type: 'event', attendanceEnabled: true }).select('id title date time attendanceEnabled attendanceAudience').lean() : Promise.resolve(null)
    ]);
    const items = itemType === 'event' ? club?.events : club?.booths;
    let selectedEvent;
    if (isMiuSession) selectedEvent = miuEvent ? { ...miuEvent, requestId: miuEvent.id } : null;
    else if (eventRequestId > 0) {
      selectedEvent = items?.find((item) => Number(item.requestId) === eventRequestId);
    } else {
      const legacyOffset = itemType === 'booth' ? 1_000_000 : 0;
      const itemIndex = -eventRequestId - legacyOffset - 1;
      selectedEvent = itemIndex >= 0 ? items?.[itemIndex] : null;
      if (selectedEvent?.requestId) selectedEvent = null;
    }
    const title = cleanText(selectedEvent?.title || selectedEvent?.boothName, 140);
    if ((!club && !isMiuSession) || !selectedEvent || !title) {
      return res.status(404).json({ message: 'This published event or booth could not be found.' });
    }
    if (itemType === 'event' && selectedEvent.attendanceEnabled === false) return res.status(409).json({ message: 'This event was published without attendance tracking.' });
    const eventDate = cleanText(selectedEvent.date || selectedEvent.boothOpenDate, 80);
    if (!isActivityScheduledToday(eventDate)) {
      return res.status(409).json({ message: 'Attendance QR codes can only be created on the event or booth date.' });
    }
    if (await isAttendanceActivityManuallyEnded(clubId, itemType, eventRequestId)) {
      return res.status(409).json({ message: 'Attendance has ended for this event or booth.' });
    }
    const miuAssignments = isMiuSession
      ? (Array.isArray(req.body.assignments) ? req.body.assignments : [{ supervisorEmail: req.body.supervisorEmail, attendanceTakerEmail: req.body.attendanceTakerEmail }])
        .map((assignment) => ({
          supervisorEmail: cleanText(assignment?.supervisorEmail, 254).toLowerCase(),
          attendanceTakerEmail: cleanText(assignment?.attendanceTakerEmail, 254).toLowerCase()
        }))
      : [];
    let assignedSupervisorEmail = '';
    let assignedMemberEmail = '';
    const createdMiuSessionIds = [];
    if (isMiuSession) {
      if (!miuAssignments.length || miuAssignments.length > 20
        || miuAssignments.some((assignment) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignment.supervisorEmail)
          || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignment.attendanceTakerEmail))) {
        return res.status(400).json({ message: 'Add between 1 and 20 valid supervisor and usher account pairs.' });
      }
      const usherEmails = miuAssignments.map((assignment) => assignment.attendanceTakerEmail);
      if (new Set(usherEmails).size !== usherEmails.length) return res.status(400).json({ message: 'Each attendance usher account can be assigned only once to this event.' });
      if (miuAssignments.some((assignment) => assignment.supervisorEmail === assignment.attendanceTakerEmail)) {
        return res.status(400).json({ message: 'Assign each event review and usher task to different accounts.' });
      }
      const supervisorEmails = [...new Set(miuAssignments.map((assignment) => assignment.supervisorEmail))];
      const [supervisors, students, staff, existingTasks] = await Promise.all([
        ClubAccount.find({ email: { $in: supervisorEmails }, $or: [{ role: 'supervisor' }, { 'roleAssignments.role': 'supervisor' }] }).select('email').lean(),
        StudentAccount.find({ email: { $in: usherEmails } }).select('email').lean(),
        ClubAccount.find({ email: { $in: usherEmails } }).select('email').lean(),
        AttendanceSession.find({ sourceType: 'miu', active: true, assignedMemberEmail: { $in: usherEmails }, eventDate }).select('assignedMemberEmail').lean()
      ]);
      const validSupervisors = new Set(supervisors.map((account) => account.email));
      if (supervisorEmails.some((email) => !validSupervisors.has(email))) return res.status(400).json({ message: 'Every assigned reviewer must be an active Supervisor account.' });
      const validUshers = new Set([...students, ...staff].map((account) => account.email));
      if (usherEmails.some((email) => !validUshers.has(email))) return res.status(400).json({ message: 'Every usher must have an existing student or staff account.' });
      if (existingTasks.length) return res.status(409).json({ message: `An assigned usher already has an active MIU attendance task today: ${existingTasks[0].assignedMemberEmail}` });
      assignedSupervisorEmail = miuAssignments[0].supervisorEmail;
      assignedMemberEmail = miuAssignments[0].attendanceTakerEmail;
    }
    const sessionId = new mongoose.Types.ObjectId();
    const token = isMiuSession ? assignedMiuAttendanceToken(sessionId, assignedMemberEmail) : crypto.randomBytes(32).toString('base64url');
    const attendanceAudience = isMiuSession
      ? (selectedEvent.attendanceAudience === 'members' ? 'members' : 'all_students')
      : itemType === 'event' && ['members', 'all_students'].includes(selectedEvent.attendanceAudience)
        ? selectedEvent.attendanceAudience
        : req.body.audience === 'all_students' ? 'all_students' : 'members';
    const sessionFields = {
      _id: sessionId,
      clubId,
      sourceType: isMiuSession ? 'miu' : 'club',
      attendanceAudience,
      assignedSupervisorEmail,
      itemType,
      eventRequestId,
      eventTitle: title,
      eventDate,
      eventTime: cleanText(selectedEvent.time || selectedEvent.boothOpenTime, 80),
      tokenHash: attendanceTokenHash(token),
      createdBy: req.clubAccount.email,
      assignedMemberEmail
    };
    let session;
    if (isMiuSession) {
      const createdSessions = [];
      try {
        for (const assignment of miuAssignments) {
          const assignedId = new mongoose.Types.ObjectId();
          const assignedToken = assignedMiuAttendanceToken(assignedId, assignment.attendanceTakerEmail);
          const created = await AttendanceSession.create({ ...sessionFields, _id: assignedId,
            assignedSupervisorEmail: assignment.supervisorEmail, assignedMemberEmail: assignment.attendanceTakerEmail,
            tokenHash: attendanceTokenHash(assignedToken) });
          createdMiuSessionIds.push(created._id);
          createdSessions.push(created);
        }
        const safeSessions = createdSessions.map((created) => {
          const { _id, __v, tokenHash, ...safeSession } = created.toObject();
          return safeSession;
        });
        return res.status(201).json({ sessions: safeSessions, assignmentsCreated: safeSessions.length });
      } catch (error) {
        await AttendanceSession.deleteMany({ _id: { $in: createdMiuSessionIds } }).catch(() => {});
        throw error;
      }
    }
    session = await AttendanceSession.create(sessionFields);
    try {
      await AttendanceSession.updateMany({ clubId, itemType, eventRequestId, active: true, assignedMemberEmail: { $in: ['', null] }, _id: { $ne: session._id } }, { $set: { active: false } });
    } catch (error) {
      await AttendanceSession.deleteOne({ _id: session._id }).catch(() => {});
      throw error;
    }
    const { _id, __v, tokenHash, ...safeSession } = session.toObject();
    res.status(201).json({ session: safeSession, ...(isMiuSession ? {} : { token }) });
  } catch (error) {
    console.error('Attendance session could not be created:', error.name);
    res.status(503).json({ message: 'The QR code was not created. No attendance data was saved.' });
  }
});

app.post('/api/member/attendance-assignments/:id/session', requireStudentAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'This attendance assignment could not be found.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const assignment = await currentMemberAttendanceAssignment(req.studentAccount.email);
    if (!assignment || String(assignment._id) !== req.params.id || assignment.status !== 'accepted') {
      return res.status(403).json({ message: 'Accept your current attendance task before opening its check-in QR.' });
    }
    const assignedDeviceHash = await bindMemberAttendanceDevice(assignment, req.studentAccount.email, req, res);
    if (!assignedDeviceHash) return res.status(403).json({ message: 'This attendance task is tied to the device where you accepted it.' });
    if (!isActivityScheduledToday(assignment.eventDate)) return res.status(409).json({ message: 'The attendance QR is available only on the event or booth date.' });
    const club = await Club.findOne({ id: assignment.clubId, archivedAt: null }).select('id name events booths').read('primary').readConcern('majority').lean();
    const items = assignment.itemType === 'event' ? club?.events : club?.booths;
    let selected = assignment.eventRequestId > 0 ? (items || []).find((item) => Number(item.requestId) === assignment.eventRequestId) : null;
    if (assignment.eventRequestId < 0) {
      const legacyOffset = assignment.itemType === 'booth' ? 1_000_000 : 0;
      const itemIndex = -assignment.eventRequestId - legacyOffset - 1;
      selected = itemIndex >= 0 ? items?.[itemIndex] : null;
      if (selected?.requestId) selected = null;
    }
    const title = cleanText(selected?.title || selected?.boothName, 140);
    const selectedDate = cleanText(selected?.date || selected?.boothOpenDate, 80);
    if (!club || !selected || !title || title !== assignment.eventTitle || !isActivityScheduledToday(selectedDate)) {
      return res.status(404).json({ message: 'The assigned event or booth is no longer available.' });
    }
    if (await isAttendanceActivityManuallyEnded(assignment.clubId, assignment.itemType, assignment.eventRequestId)) {
      return res.status(410).json({ message: 'Attendance has ended for this event or booth.' });
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const session = await AttendanceSession.create({
      clubId: assignment.clubId, itemType: assignment.itemType, eventRequestId: assignment.eventRequestId,
      eventTitle: title, eventDate: assignment.eventDate, eventTime: assignment.eventTime,
      tokenHash: attendanceTokenHash(token), createdBy: req.studentAccount.email,
      assignedMemberEmail: String(assignment.memberEmail || '').trim().toLowerCase(), assignedDeviceHash
    });
    try {
      await AttendanceSession.updateMany({
        clubId: assignment.clubId, itemType: assignment.itemType, eventRequestId: assignment.eventRequestId,
        assignedMemberEmail: String(assignment.memberEmail || '').trim().toLowerCase(), active: true,
        _id: { $ne: session._id }
      }, { $set: { active: false } }, { writeConcern: { w: 'majority' } });
    } catch (error) {
      await AttendanceSession.deleteOne({ _id: session._id }).catch(() => {});
      throw error;
    }
    const confirmed = await AttendanceSession.findById(session._id).read('primary').readConcern('majority').lean();
    if (!confirmed || confirmed.tokenHash !== attendanceTokenHash(token) || confirmed.createdBy !== req.studentAccount.email
      || confirmed.assignedMemberEmail !== String(assignment.memberEmail || '').trim().toLowerCase()
      || confirmed.assignedDeviceHash !== assignedDeviceHash) {
      await AttendanceSession.deleteOne({ _id: session._id }).catch(() => {});
      return res.status(503).json({ message: 'The check-in QR session could not be confirmed in the database.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ token, eventTitle: title, eventDate: assignment.eventDate, itemType: assignment.itemType });
  } catch (error) {
    console.error('Delegated attendance session could not be created:', error.name);
    res.status(503).json({ message: 'The attendance QR was not saved. Please try again.' });
  }
});

async function requireAttendanceTaskAuth(req, res, next) {
  try {
    const student = await getStudentAccountFromRequest(req, res);
    if (student) { req.attendanceTaskAccount = student; return next(); }
    const staff = await getClubAccountFromRequest(req, res);
    if (staff) { req.attendanceTaskAccount = staff; return next(); }
    return res.status(401).json({ message: 'Sign in to the student or staff account assigned to this task.' });
  } catch { return res.status(503).json({ message: 'Could not verify the account assigned to this task.' }); }
}

app.get('/api/miu-attendance-task', requireAttendanceTaskAuth, async (req, res) => {
  try {
    if (!requireLiveDatabase(res)) return;
    const session = await AttendanceSession.findOne({ sourceType: 'miu', active: true, assignedMemberEmail: req.attendanceTaskAccount.email })
      .select('eventRequestId eventTitle eventDate eventTime assignedMemberAccepted assignedMemberEmail').sort({ createdAt: -1 }).lean();
    const attendance = session ? await AttendanceRecord.findOne({ clubId: 0, itemType: 'event', eventRequestId: session.eventRequestId, email: req.attendanceTaskAccount.email }).select('eventParticipation').lean() : null;
    res.json({ task: session ? { eventTitle: session.eventTitle, eventDate: session.eventDate, eventTime: session.eventTime, accepted: session.assignedMemberAccepted === true, attendanceRecorded: Boolean(attendance), attendanceAsUsher: attendance?.eventParticipation?.role === 'usher',
      profile: { name: req.attendanceTaskAccount.name || '', universityId: req.attendanceTaskAccount.universityId || '', major: req.attendanceTaskAccount.major || '' } } : null });
  } catch { res.status(503).json({ message: 'Could not load your MIU attendance task.' }); }
});

app.get('/pages/my-attendance-task.html', requireAttendanceTaskAuth, async (req, res) => {
  try {
    if (!requireLiveDatabase(res)) return;
    const assignedTask = await AttendanceSession.exists({
      sourceType: 'miu', active: true, assignedMemberEmail: req.attendanceTaskAccount.email
    });
    if (!assignedTask) return res.status(404).send('Attendance task not found.');
    return res.sendFile(path.join(__dirname, 'public/pages/my-attendance-task.html'));
  } catch {
    return res.status(503).send('Attendance task is temporarily unavailable.');
  }
});

app.post('/api/miu-attendance-task/accept', requireAttendanceTaskAuth, async (req, res) => {
  try {
    if (!requireLiveDatabase(res)) return;
    const session = await AttendanceSession.findOne({ sourceType: 'miu', active: true, assignedMemberEmail: req.attendanceTaskAccount.email }).sort({ createdAt: -1 });
    if (!session) return res.status(404).json({ message: 'No MIU attendance task is assigned to your account.' });
    if (!isActivityScheduledToday(session.eventDate)) return res.status(410).json({ message: 'This attendance task is only available on the event day.' });
    session.assignedMemberAccepted = true; session.assignedAcceptedAt = new Date();
    await session.save({ writeConcern: { w: 'majority' } });
    res.json({ accepted: true, message: 'Task accepted. Open the QR panel on the device you will use at the event.' });
  } catch { res.status(503).json({ message: 'Your attendance task acceptance could not be saved.' }); }
});

app.post('/api/miu-attendance-task/session', requireAttendanceTaskAuth, async (req, res) => {
  try {
    if (!requireLiveDatabase(res)) return;
    const session = await AttendanceSession.findOne({ sourceType: 'miu', active: true, assignedMemberEmail: req.attendanceTaskAccount.email, assignedMemberAccepted: true }).sort({ createdAt: -1 }).lean();
    if (!session) return res.status(403).json({ message: 'Accept your assigned attendance task before opening its QR.' });
    if (!isActivityScheduledToday(session.eventDate) || await isAttendanceActivityManuallyEnded(0, 'event', session.eventRequestId)) return res.status(410).json({ message: 'Attendance has ended for this MIU event.' });
    const token = assignedMiuAttendanceToken(session._id, req.attendanceTaskAccount.email);
    if (attendanceTokenHash(token) !== session.tokenHash) return res.status(503).json({ message: 'The assigned QR could not be confirmed.' });
    res.json({ token, eventTitle: session.eventTitle, eventDate: session.eventDate });
  } catch { res.status(503).json({ message: 'The assigned QR could not be opened.' }); }
});

app.post('/api/miu-attendance-task/qr-challenge', requireAttendanceTaskAuth, async (req, res) => {
  const token = String(req.body.token || '');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return res.status(400).json({ message: 'Attendance session is invalid.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const session = await AttendanceSession.findOne({ tokenHash: attendanceTokenHash(token), sourceType: 'miu', active: true,
      assignedMemberEmail: req.attendanceTaskAccount.email, assignedMemberAccepted: true }).select('_id clubId itemType eventRequestId eventDate assignedDeviceHash').read('primary').readConcern('majority').lean();
    if (!session || !isActivityScheduledToday(session.eventDate) || await isAttendanceActivityManuallyEnded(0, 'event', session.eventRequestId)) return res.status(410).json({ message: 'This attendance task is no longer active.' });
    if (!await bindUsherDevice(session, req.attendanceTaskAccount.email, req, res)) return res.status(403).json({ message: 'This attendance task is tied to the device where you first opened it.' });
    res.setHeader('Cache-Control', 'no-store'); res.json(attendanceQrChallenge(token));
  } catch { res.status(503).json({ message: 'A fresh attendance QR could not be created.' }); }
});

require('./services/attendance-participation').registerUsherSelfCheckin(app, {
  requireAttendanceTaskAuth, requireLiveDatabase, sameOrigin: isSameOriginRequest,
  AttendanceSession, AttendanceRecord, StudentAccount, UniversityContent, Club, Application,
  isActivityScheduledToday, isAttendanceActivityManuallyEnded, bindUsherDevice, attendanceDeviceHashes, cleanText
});

async function bindUsherDevice(session, email, req, res) {
  const deviceHash = attendanceDeviceHash(ensureMemberAttendanceDeviceCookie(req, res));
  if (session.assignedDeviceHash) return session.assignedDeviceHash === deviceHash;
  const result = await AttendanceSession.updateOne({ _id: session._id, sourceType: 'miu', active: true,
    assignedMemberEmail: email, assignedMemberAccepted: true,
    $or: [{ assignedDeviceHash: '' }, { assignedDeviceHash: { $exists: false } }]
  }, { $set: { assignedDeviceHash: deviceHash } }, { writeConcern: { w: 'majority' } });
  return result.modifiedCount === 1;
}

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
  appendAttendanceCookie(res, `miu_attendance_scan=${payload}.${signature}; Max-Age=180; HttpOnly; SameSite=Strict; Path=/api/attendance/;${secure}`);
}

function appendAttendanceCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  const cookies = Array.isArray(current) ? current : current ? [current] : [];
  res.setHeader('Set-Cookie', [...cookies, cookie]);
}

function attendanceDeviceId(req) {
  const cookie = requestCookie(req, 'miu_attendance_event_device') || requestCookie(req, 'miu_attendance_device');
  const [id, signature] = cookie.split('.');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(id || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return '';
  const expected = crypto.createHmac('sha256', sessionSecret).update(`attendance-device.${id}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex')) ? id : '';
}

function ensureAttendanceDeviceCookie(req, res) {
  if (req.attendanceCanonicalDeviceId) return req.attendanceCanonicalDeviceId;
  const existingId = attendanceDeviceId(req);
  if (existingId && requestCookie(req, 'miu_attendance_event_device')) return existingId;
  const id = existingId || memberAttendanceDeviceId(req) || crypto.randomBytes(32).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(`attendance-device.${id}`).digest('hex');
  const secure = secureCookieSuffix(req);
  appendAttendanceCookie(res, `miu_attendance_event_device=${id}.${signature}; Max-Age=31536000; HttpOnly; SameSite=Strict; Path=/api/;${secure}`);
  appendAttendanceCookie(res, `miu_attendance_device=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/api/attendance/;${secure}`);
  req.attendanceCanonicalDeviceId = id;
  return id;
}

function attendanceDeviceHashes(req, res) {
  return [...new Set([ensureAttendanceDeviceCookie(req, res), memberAttendanceDeviceId(req)].filter(Boolean).map(attendanceDeviceHash))];
}

function attendanceDeviceHash(id) {
  return crypto.createHmac('sha256', sessionSecret).update(`attendance-record-device.${id}`).digest('hex');
}

function memberAttendanceDeviceId(req) {
  const cookie = requestCookie(req, 'miu_member_attendance_device');
  const [id, signature] = cookie.split('.');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(id || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return '';
  const expected = crypto.createHmac('sha256', sessionSecret).update(`member-attendance-device.${id}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex')) ? id : '';
}

function ensureMemberAttendanceDeviceCookie(req, res) {
  const existingId = memberAttendanceDeviceId(req);
  if (existingId) return existingId;
  const id = crypto.randomBytes(32).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(`member-attendance-device.${id}`).digest('hex');
  const secure = secureCookieSuffix(req);
  appendAttendanceCookie(res, `miu_member_attendance_device=${id}.${signature}; Max-Age=31536000; HttpOnly; SameSite=Strict; Path=/api/;${secure}`);
  return id;
}

async function bindMemberAttendanceDevice(assignment, email, req, res) {
  const deviceHash = attendanceDeviceHash(ensureMemberAttendanceDeviceCookie(req, res));
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (assignment.checkInDeviceHash) return assignment.checkInDeviceHash === deviceHash ? deviceHash : '';
  const updated = await AttendanceAssignment.findOneAndUpdate({
    _id: assignment._id,
    memberEmail: normalizedEmail,
    status: 'accepted',
    $or: [{ checkInDeviceHash: '' }, { checkInDeviceHash: { $exists: false } }]
  }, { $set: { checkInDeviceHash: deviceHash } }, { new: true, writeConcern: { w: 'majority' } })
    .read('primary').readConcern('majority').lean();
  if (updated?.checkInDeviceHash === deviceHash) return deviceHash;
  const current = await AttendanceAssignment.findOne({ _id: assignment._id, memberEmail: normalizedEmail, status: 'accepted' })
    .select('checkInDeviceHash').read('primary').readConcern('majority').lean();
  return current?.checkInDeviceHash === deviceHash ? deviceHash : '';
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

app.post('/api/club/attendance-qr-challenge', requireAttendanceSessionManager, async (req, res) => {
  const isMiuReviewer = ['pr', 'sso', 'dean', 'miu_events', 'admin', 'software_development'].includes(req.clubAccount.role);
  if (!canManageAttendance(req.clubAccount) && !isMiuReviewer) return res.status(403).json({ message: 'You cannot create attendance QR codes.' });
  const token = String(req.body.token || '');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return res.status(400).json({ message: 'Attendance session is invalid.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const session = await AttendanceSession.findOne({ tokenHash: attendanceTokenHash(token), active: true }).select('clubId sourceType itemType eventRequestId eventDate').lean();
    if (!session) return res.status(404).json({ message: 'This attendance session has expired.' });
    if (req.clubAccount.role === 'miu_events' && session.sourceType !== 'miu') return res.status(403).json({ message: 'MIU Events accounts can only create QR codes for university events.' });
    if (!isActivityScheduledToday(session.eventDate)) return res.status(410).json({ message: 'This attendance QR has expired because the event day is over.' });
    if (await isAttendanceActivityManuallyEnded(session.clubId, session.itemType || 'event', session.eventRequestId)) {
      return res.status(410).json({ message: 'Attendance has ended for this event or booth.' });
    }
    if (session.sourceType === 'miu' && !isMiuReviewer) return res.status(403).json({ message: 'Only PR, SSO, Dean, or the global administrator may manage an MIU attendance session.' });
    if (session.sourceType !== 'miu' && isMiuReviewer) return res.status(403).json({ message: 'This account can only manage MIU attendance sessions.' });
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

app.post('/api/member/attendance-qr-challenge', requireStudentAuth, async (req, res) => {
  const token = String(req.body.token || '');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return res.status(400).json({ message: 'Attendance session is invalid.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const session = await AttendanceSession.findOne({ tokenHash: attendanceTokenHash(token), active: true })
      .select('clubId sourceType itemType eventRequestId eventDate createdBy assignedMemberEmail assignedDeviceHash assignedMemberAccepted').read('primary').readConcern('majority').lean();
    const assignedMiuUsher = session?.sourceType === 'miu' && session.assignedMemberEmail === req.studentAccount.email && session.assignedMemberAccepted === true;
    if (!session || session.createdBy !== req.studentAccount.email && !assignedMiuUsher || !isActivityScheduledToday(session.eventDate)) {
      return res.status(403).json({ message: 'This QR session is no longer available to your account.' });
    }
    if (await isAttendanceActivityManuallyEnded(session.clubId, session.itemType || 'event', session.eventRequestId)) {
      return res.status(410).json({ message: 'Attendance has ended for this event or booth.' });
    }
    const assignment = assignedMiuUsher ? null : await currentMemberAttendanceAssignment(req.studentAccount.email);
    const memberDeviceHash = attendanceDeviceHash(ensureMemberAttendanceDeviceCookie(req, res));
    const memberHashMatches = session.assignedDeviceHash && session.assignedDeviceHash === memberDeviceHash;
    if (assignedMiuUsher) {
      if (session.assignedDeviceHash && !memberHashMatches) return res.status(403).json({ message: 'This attendance task is tied to the device where you accepted it.' });
      if (!session.assignedDeviceHash) {
        const updated = await AttendanceSession.updateOne({ _id: session._id, assignedMemberEmail: req.studentAccount.email, assignedMemberAccepted: true, assignedDeviceHash: '' }, { $set: { assignedDeviceHash: memberDeviceHash } }, { writeConcern: { w: 'majority' } });
        if (!updated.modifiedCount && !memberHashMatches) return res.status(403).json({ message: 'This attendance task has already been opened on another device.' });
      }
    } else if (!assignment || assignment.status !== 'accepted' || assignment.clubId !== session.clubId
      || assignment.itemType !== session.itemType || assignment.eventRequestId !== session.eventRequestId
      || String(session.assignedMemberEmail || session.createdBy).trim().toLowerCase() !== String(req.studentAccount.email || '').trim().toLowerCase()
      || !memberHashMatches || session.assignedDeviceHash !== assignment.checkInDeviceHash) {
      return res.status(403).json({ message: 'This account no longer has this attendance assignment.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(attendanceQrChallenge(token));
  } catch (error) {
    console.error('Member attendance QR challenge could not be created:', error.name);
    res.status(503).json({ message: 'A fresh attendance QR code could not be created.' });
  }
});

app.post('/api/member/attendance-assignments/:id/check-in', requireStudentAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'This attendance assignment could not be found.' });
  const email = String(req.studentAccount.email || '').trim().toLowerCase();
  try {
    if (!requireLiveDatabase(res)) return;
    const assignment = await currentMemberAttendanceAssignment(email);
    if (!assignment || String(assignment._id) !== req.params.id || assignment.status !== 'accepted') {
      return res.status(403).json({ message: 'Only the member who accepted this attendance task can check in.' });
    }
    if (!isActivityScheduledToday(assignment.eventDate)) return res.status(409).json({ message: 'You can check in only on the event or booth date.' });
    if (await isAttendanceActivityManuallyEnded(assignment.clubId, assignment.itemType, assignment.eventRequestId)) {
      return res.status(410).json({ message: 'Attendance has ended for this event or booth.' });
    }

    const assignedDeviceHash = await bindMemberAttendanceDevice(assignment, email, req, res);
    if (!assignedDeviceHash) return res.status(403).json({ message: 'This attendance task is tied to the device where you accepted it.' });
    const [club, acceptedApplication] = await Promise.all([
      Club.findOne({ id: assignment.clubId, archivedAt: null }).select('id name memberRoster events booths').read('primary').readConcern('majority').lean(),
      Application.findOne({ clubId: assignment.clubId, status: 'accepted', email }).select('id universityId major studentName').read('primary').readConcern('majority').lean()
    ]);
    const rosterMember = (club?.memberRoster || []).find((member) => String(member.email || '').trim().toLowerCase() === email);
    if (!club || (!rosterMember && !acceptedApplication)) {
      return res.status(403).json({ message: 'Attendance is limited to current members of this club.' });
    }
    const items = assignment.itemType === 'booth' ? club.booths : club.events;
    let selected = assignment.eventRequestId > 0
      ? (items || []).find((item) => Number(item.requestId) === assignment.eventRequestId)
      : null;
    if (assignment.eventRequestId < 0) {
      const legacyOffset = assignment.itemType === 'booth' ? 1_000_000 : 0;
      const itemIndex = -assignment.eventRequestId - legacyOffset - 1;
      selected = itemIndex >= 0 ? items?.[itemIndex] : null;
      if (selected?.requestId) selected = null;
    }
    const eventTitle = cleanText(selected?.title || selected?.boothName, 140);
    const eventDate = cleanText(selected?.date || selected?.boothOpenDate, 80);
    if (!selected || eventTitle !== assignment.eventTitle || !isActivityScheduledToday(eventDate)) {
      return res.status(404).json({ message: 'The assigned event or booth is no longer available.' });
    }
    if (assignment.itemType === 'event' && selected.attendanceEnabled === false) return res.status(409).json({ message: 'This event was published without attendance tracking.' });
    const deviceHashes = attendanceDeviceHashes(req, res);
    const recordDeviceHash = deviceHashes[0];
    const existing = await AttendanceRecord.findOne({
      clubId: assignment.clubId, itemType: assignment.itemType, eventRequestId: assignment.eventRequestId,
      $or: [{ email }, { deviceHash: { $in: deviceHashes } }]
    }).select('+deviceHash email').read('primary').readConcern('majority').lean();
    if (existing?.email === email) {
      if (existing.deviceHash && !deviceHashes.includes(existing.deviceHash)) return res.status(409).json({ message: 'Your attendance for this activity is tied to another device.' });
      await AttendanceRecord.updateOne({ _id: existing._id, email }, { $set: { eventParticipation: { role: 'organizer' } } });
      return res.json({ savedToDatabase: true, alreadyRecorded: true, message: 'Your attendance is already recorded for this event or booth.' });
    }
    if (existing) return res.status(409).json({ message: 'Attendance has already been recorded from this device for this event or booth.' });
    if (await isAttendanceActivityManuallyEnded(assignment.clubId, assignment.itemType, assignment.eventRequestId)) {
      return res.status(410).json({ message: 'Attendance has ended for this event or booth.' });
    }

    const session = await AttendanceSession.create({
      clubId: assignment.clubId, itemType: assignment.itemType, eventRequestId: assignment.eventRequestId,
      eventTitle, eventDate: assignment.eventDate, eventTime: assignment.eventTime,
      tokenHash: attendanceTokenHash(crypto.randomBytes(32).toString('base64url')),
      active: false, createdBy: email, assignedMemberEmail: email, assignedDeviceHash
    });
    try {
      const record = await AttendanceRecord.create({
        sessionId: session._id, clubId: assignment.clubId, itemType: assignment.itemType,
        eventRequestId: assignment.eventRequestId, eventTitle, eventDate: assignment.eventDate,
        eventTime: assignment.eventTime, name: cleanText(req.studentAccount.name || rosterMember?.name || assignment.memberName, 160),
        universityId: cleanText(req.studentAccount.universityId || acceptedApplication?.universityId, 40),
        major: cleanText(req.studentAccount.major || acceptedApplication?.major, 120),
        email, deviceHash: recordDeviceHash, attendedAt: new Date(), eventParticipation: { role: 'organizer' },
        attendanceAudience: selected.attendanceAudience === 'all_students' ? 'all_students' : 'members',
        ...await require('./services/attendance-participation').membershipSnapshot(email, { Club, Application })
      });
      const confirmed = await AttendanceRecord.findById(record._id).select('email clubId itemType eventRequestId')
        .read('primary').readConcern('majority').lean();
      if (!confirmed || confirmed.email !== email || confirmed.clubId !== assignment.clubId
        || confirmed.itemType !== assignment.itemType || confirmed.eventRequestId !== assignment.eventRequestId) {
        throw new Error('Member self check-in could not be confirmed in the database.');
      }
    } catch (error) {
      await AttendanceSession.deleteOne({ _id: session._id }).catch(() => {});
      if (error.code === 11000) return res.status(409).json({ message: error.keyPattern?.deviceHash
        ? 'Attendance has already been recorded from this device for this event or booth.'
        : 'Your attendance is already recorded for this event or booth.' });
      throw error;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ savedToDatabase: true, message: 'Your attendance was recorded from your assigned MIU account.' });
  } catch (error) {
    console.error('Member self check-in failed:', error.name);
    res.status(503).json({ message: 'Attendance was not saved. Please try again.' });
  }
});

app.get('/api/club/attendance-records', requireClubAuth, async (req, res) => {
  if (!['president', 'head'].includes(req.clubAccount.role)) {
    return res.status(403).json({ message: 'Attendance history is available to club presidents and committee heads.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const filter = req.clubAccount.role === 'president' || !isItCommitteeHead(req.clubAccount)
      ? { clubId: req.clubAccount.clubId }
      : {};
    const records = await AttendanceRecord.find(filter).sort({ attendedAt: -1 }).lean();
    const clubIds = [...new Set(records.map((record) => record.clubId))];
    const clubsById = new Map((await Club.find({ id: { $in: clubIds } }).select('id name').lean()).map((club) => [club.id, club.name]));
    const closureMap = await attendanceClosureMapFor(records);
    res.setHeader('Cache-Control', 'no-store');
    res.json(records.map(({ _id, __v, ...record }) => {
      const closure = closureMap.get(attendanceActivityKey(record));
      return {
        ...record, clubName: clubsById.get(record.clubId) || '',
        attendanceEnded: isAttendanceActivityEnded(record.eventDate) || Boolean(closure),
        attendanceEndedAt: closure?.endedAt || null
      };
    }));
  } catch (error) {
    console.error('Attendance records could not be loaded:', error.name);
    res.status(503).json({ message: 'Could not load attendance records from the database.' });
  }
});

function requireInstitutionAttendanceHistory(req, res) {
  if (!['pr', 'sso', 'dean'].includes(req.clubAccount?.role)) {
    res.status(403).json({ message: 'Attendance history is available to PR, SSO, and Dean accounts.' });
    return false;
  }
  return true;
}

app.get('/api/committee/attendance-overview', requireClubAuth, async (req, res) => {
  if (!requireInstitutionAttendanceHistory(req, res)) return;
  try {
    if (!requireLiveDatabase(res)) return;
    const [clubs, attendanceRecords] = await Promise.all([
      Club.find({}).select('id name events booths').sort({ name: 1 }).lean(),
      AttendanceRecord.find({}).select('clubId itemType eventRequestId eventTitle eventDate eventTime').sort({ attendedAt: -1 }).lean()
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
          clubName: Number(record.clubId) === 0 ? 'MIU events' : clubsById.get(Number(record.clubId))?.name || `Club ${record.clubId}`,
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
        clubsById.set(Number(record.clubId), { id: record.clubId, name: Number(record.clubId) === 0 ? 'MIU events' : `Club ${record.clubId}` });
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
  if (!requireInstitutionAttendanceHistory(req, res)) return;
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
    const records = await AttendanceRecord.find(query).sort({ attendedAt: -1 }).lean();
    const clubIds = [...new Set(records.map((record) => Number(record.clubId)))];
    const clubsById = new Map((await Club.find({ id: { $in: clubIds.filter(id => id > 0) } }).select('id name image').lean()).map((club) => [Number(club.id), club]));
    const closureMap = await attendanceClosureMapFor(records);
    res.setHeader('Cache-Control', 'no-store');
    res.json(records.map(({ _id, __v, ...record }) => {
      const closure = closureMap.get(attendanceActivityKey(record));
      return {
        ...record,
        attendanceEnded: isAttendanceActivityEnded(record.eventDate) || Boolean(closure),
        attendanceEndedAt: closure?.endedAt || null,
        clubName: Number(record.clubId) === 0 ? 'MIU events' : clubsById.get(Number(record.clubId))?.name || `Club ${record.clubId}`,
        clubImage: clubsById.get(Number(record.clubId))?.image || ''
      };
    }));
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
    if (!isActivityScheduledToday(session.eventDate)) return res.status(410).json({ message: 'This attendance QR code expired when the event day ended.' });
    if (await isAttendanceActivityManuallyEnded(session.clubId, session.itemType || 'event', session.eventRequestId)) {
      return res.status(410).json({ message: 'Attendance has ended for this event or booth.' });
    }
    const hasProof = hasAttendanceScanProof(req, session._id);
    if (!hasProof && !isCurrentAttendanceQrChallenge(token, req.query.code)) {
      return res.status(410).json({ message: 'This QR code has changed. Scan the current code shown by the club.' });
    }
    const club = session.sourceType === 'miu' ? { name: 'MIU events' } : await Club.findOne({ id: session.clubId }).select('name').lean();
    res.setHeader('Cache-Control', 'no-store');
    ensureAttendanceDeviceCookie(req, res);
    if (!hasProof) setAttendanceScanProofCookie(req, res, session._id);
    res.json({
      clubName: club?.name || '',
      itemType: session.itemType || 'event',
      eventTitle: session.eventTitle,
      eventDate: session.eventDate || '',
      eventTime: session.eventTime || '',
      attendanceAudience: session.attendanceAudience || 'members'
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
  const normalizedEmail = String(email || '').trim().toLowerCase();
  let session;
  const note = cleanText(req.body.note, 500);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return res.status(404).json({ message: 'This attendance QR code is invalid or expired.' });
  try {
    if (!requireLiveDatabase(res)) return;
    session = await AttendanceSession.findOne({ tokenHash: attendanceTokenHash(token), active: true }).lean();
    if (!session) return res.status(404).json({ message: 'This attendance QR code is invalid or expired.' });
    if (!isActivityScheduledToday(session.eventDate)) return res.status(410).json({ message: 'Attendance is closed because the event day is over.' });
    if (await isAttendanceActivityManuallyEnded(session.clubId, session.itemType || 'event', session.eventRequestId)) {
      clearAttendanceScanProofCookie(req, res);
      return res.status(410).json({ message: 'Attendance has ended for this event or booth.' });
    }
    const assignedMemberEmail = String(session.assignedMemberEmail || '').trim().toLowerCase();
    const isMiuSession = session.sourceType === 'miu';
    const isAllStudents = session.attendanceAudience === 'all_students';
    const [activityClub, acceptedApplication, memberClubs, acceptedMemberships] = await Promise.all([
      session.clubId > 0 ? Club.findOne({ id: session.clubId, archivedAt: null })
        .select('name memberRoster').read('primary').readConcern('majority').lean() : Promise.resolve(null),
      session.clubId > 0 ? Application.findOne({ clubId: session.clubId, status: 'accepted', email: normalizedEmail })
        .select('_id').read('primary').readConcern('majority').lean() : Promise.resolve(null),
      isAllStudents || isMiuSession ? Club.find({ archivedAt: null, 'memberRoster.email': normalizedEmail }).select('name memberRoster').lean() : Promise.resolve([]),
      isAllStudents || isMiuSession ? Application.find({ email: normalizedEmail, status: 'accepted' }).select('clubId').lean() : Promise.resolve([])
    ]);
    const isRosterMember = (activityClub?.memberRoster || []).some((member) =>
      String(member.email || '').trim().toLowerCase() === normalizedEmail);
    const isAnyClubMember = isRosterMember || Boolean(acceptedApplication) || memberClubs.length > 0 || acceptedMemberships.length > 0;
    if (!isAllStudents && !(isMiuSession ? isAnyClubMember : activityClub && isAnyClubMember)) {
      return res.status(403).json({ message: isMiuSession
        ? 'Attendance is limited to current members of an MIU club. Sign in with the MIU email on your membership.'
        : 'Attendance is limited to current members of this club. Sign in with the MIU email on your accepted membership.' });
    }
    if (isMiuSession) {
      const published = await UniversityContent.exists({ id: session.eventRequestId, type: 'event', attendanceEnabled: true, date: session.eventDate });
      if (!published) return res.status(410).json({ message: 'This MIU event is no longer published for attendance.' });
    }
    if (!hasAttendanceScanProof(req, session._id)) {
      return res.status(410).json({ message: 'Scan the current QR code to confirm attendance.' });
    }
    const deviceId = attendanceDeviceId(req);
    if (!deviceId) return res.status(403).json({ message: 'Reopen the current QR code on this device, then try again.' });
    const itemType = session.itemType || 'event';
    const deviceHash = attendanceDeviceHash(deviceId);
    const deviceHashes = attendanceDeviceHashes(req, res);
    let eventParticipation = { role: 'attendee' };
    const ownTask = isMiuSession
      ? await AttendanceSession.findOne({ sourceType: 'miu', active: true, eventRequestId: session.eventRequestId, assignedMemberEmail: email, assignedMemberAccepted: true }).lean()
      : await AttendanceAssignment.findOne({ clubId: session.clubId, itemType, eventRequestId: session.eventRequestId, memberEmail: email, status: 'accepted' }).lean();
    if (ownTask) {
      const bound = isMiuSession ? await bindUsherDevice(ownTask, email, req, res) : await bindMemberAttendanceDevice(ownTask, email, req, res);
      if (!bound) return res.status(403).json({ message: 'Use the device assigned to your attendance task.' });
      eventParticipation = { role: isMiuSession ? 'usher' : 'organizer' };
    }
    const existing = await AttendanceRecord.findOne({
      clubId: session.clubId, itemType, eventRequestId: session.eventRequestId,
      $or: [{ email }, { deviceHash: { $in: deviceHashes } }]
    }).select('+deviceHash').lean();
    if (existing) {
      clearAttendanceScanProofCookie(req, res);
      if (existing.email === email) {
        if (ownTask) await AttendanceRecord.updateOne({ _id: existing._id, email }, { $set: { eventParticipation } });
        return res.json({ alreadyRecorded: true, message: 'You are already checked in for this event or booth.' });
      }
      return res.status(409).json({ message: 'Attendance has already been recorded from this device for this event.' });
    }
    if (await isAttendanceActivityManuallyEnded(session.clubId, itemType, session.eventRequestId)) {
      clearAttendanceScanProofCookie(req, res);
      return res.status(410).json({ message: 'Attendance has ended for this event or booth.' });
    }
    const memberClubIds = new Set(acceptedMemberships.map((membership) => Number(membership.clubId)));
    const memberClubNames = memberClubs.filter((club) => (club.memberRoster || []).some((member) => String(member.email || '').trim().toLowerCase() === normalizedEmail))
      .map((club) => cleanText(club.name, 100));
    if (memberClubIds.size) {
      const acceptedClubs = await Club.find({ id: { $in: [...memberClubIds] }, archivedAt: null }).select('name').lean();
      acceptedClubs.forEach((memberClub) => { if (!memberClubNames.includes(memberClub.name)) memberClubNames.push(cleanText(memberClub.name, 100)); });
    }
    if ((isRosterMember || acceptedApplication) && activityClub?.name) memberClubNames.push(activityClub.name);
    const uniqueMemberClubNames = [...new Set(memberClubNames)];
    const attendanceRecord = new AttendanceRecord({
      universityId: cleanText(req.studentAccount.universityId, 40),
      major: cleanText(req.studentAccount.major, 120),
      attendanceAudience: isAllStudents ? 'all_students' : 'members',
      membershipStatus: uniqueMemberClubNames.length ? 'member' : 'non_member',
      memberClubNames: uniqueMemberClubNames,
      eventParticipation,
      supervisorEmail: cleanText(session.assignedSupervisorEmail, 254).toLowerCase(),
      sessionId: session._id,
      clubId: session.clubId,
      itemType,
      eventRequestId: session.eventRequestId,
      eventTitle: session.eventTitle,
      eventDate: session.eventDate || '',
      eventTime: session.eventTime || '',
      name,
      email,
      deviceHash,
      note,
      attendedAt: new Date()
    });
    await attendanceRecord.save({ writeConcern: { w: 'majority' } });
    const savedRecord = await AttendanceRecord.findById(attendanceRecord._id)
      .select('clubId itemType eventRequestId email')
      .read('primary').readConcern('majority').lean();
    if (!savedRecord || savedRecord.clubId !== session.clubId || savedRecord.itemType !== itemType
      || savedRecord.eventRequestId !== session.eventRequestId || savedRecord.email !== email) {
      return res.status(503).json({ message: 'Attendance could not be confirmed in the database. Please retry only after checking your attendance status.' });
    }
    clearAttendanceScanProofCookie(req, res);
    res.status(201).json({ message: 'Your attendance was recorded.' });
  } catch (error) {
    if (error.code === 11000) {
      clearAttendanceScanProofCookie(req, res);
      const accountRecord = await AttendanceRecord.findOne({
        clubId: session.clubId, itemType: session.itemType || 'event', eventRequestId: session.eventRequestId,
        email: normalizedEmail
      }).select('email').read('primary').readConcern('majority').lean();
      if (error.keyPattern?.email || accountRecord) return res.json({ alreadyRecorded: true, message: 'You are already checked in for this event or booth.' });
      return res.status(409).json({ message: 'Attendance has already been recorded from this device for this event.' });
    }
    console.error('Attendance was not saved:', error.name);
    res.status(503).json({ message: 'Attendance was not saved. Please try again.' });
  }
});

// Club admins can view their event registrations.
app.get('/api/club/event-registrations', requireClubAuth, async (req, res) => {
  if (!['president', 'vice_president', 'head'].includes(req.clubAccount.role)) {
    return res.status(403).json({ message: 'Only club leaders can view registrations.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const [club, records] = await Promise.all([
      Club.findOne({ id: req.clubAccount.clubId, archivedAt: null }).select('id events').read('primary').lean(),
      EventRegistration.find({ clubId: req.clubAccount.clubId }).sort({ createdAt: -1 }).read('primary').lean()
    ]);
    if (!club) return res.status(404).json({ message: 'Club not found.' });
    const events = (Array.isArray(club.events) ? club.events : []).flatMap((event, eventIndex) => {
      const title = cleanText(event?.title, 140);
      if (!title) return [];
      const requestId = Number(event.requestId) > 0 ? Number(event.requestId) : null;
      const registrations = records.filter(record => record.eventIndex === eventIndex && record.eventTitle === title
        && (requestId ? (record.eventRequestId === requestId || record.eventRequestId == null) : record.eventRequestId == null));
      return [{ title, date: cleanText(event.date, 80), time: cleanText(event.time, 40), location: cleanText(event.location, 160), registrations: registrations.map(record => ({ name: record.name, email: record.email, registeredAt: record.createdAt })) }];
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json(events);
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
    .flatMap(account => account.roleAssignments?.length ? account.roleAssignments : [account])
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

async function requireAttendanceSessionManager(req, res, next) {
  try {
    const account = await getClubAccountFromRequest(req, res);
    if (account) { req.clubAccount = account; return next(); }
    if (isAdminSessionValid(req, res)) {
      req.clubAccount = { role: 'admin', email: adminAuthState?.email || getConfiguredAdminEmail() || '' };
      return next();
    }
    return res.status(401).json({ message: 'Sign in to an authorized dashboard to manage attendance.' });
  } catch { return res.status(503).json({ message: 'Could not verify attendance management access.' }); }
}

function attendanceTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function assignedMiuAttendanceToken(sessionId, email) {
  return crypto.createHmac('sha256', sessionSecret)
    .update(`miu-attendance-usher:${String(sessionId)}:${String(email || '').trim().toLowerCase()}`)
    .digest('base64url');
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

function isAttendanceActivityEnded(value) {
  const dateText = cleanText(value, 80);
  if (!dateText) return true; // Legacy records without a stored date remain reviewable.
  const isoDate = dateText.match(/^(\d{4}-\d{2}-\d{2})/);
  const activityDay = isoDate ? isoDate[1] : (() => {
    const parsed = new Date(dateText);
    return Number.isNaN(parsed.getTime()) ? '' : cairoDateKey(parsed);
  })();
  return Boolean(activityDay) && activityDay < cairoDateKey();
}

function attendanceActivityKey(activity) {
  return `${Number(activity.clubId)}:${activity.itemType === 'booth' ? 'booth' : 'event'}:${Number(activity.eventRequestId)}`;
}

async function isAttendanceActivityManuallyEnded(clubId, itemType, eventRequestId) {
  return Boolean(await AttendanceActivityClosure.exists({ clubId: Number(clubId), itemType, eventRequestId: Number(eventRequestId) }));
}

async function attendanceClosureMapFor(records) {
  const keys = [...new Map(records.map((record) => [attendanceActivityKey(record), {
    clubId: Number(record.clubId), itemType: record.itemType === 'booth' ? 'booth' : 'event', eventRequestId: Number(record.eventRequestId)
  }])).values()];
  if (!keys.length) return new Map();
  const closures = await AttendanceActivityClosure.find({ $or: keys }).select('clubId itemType eventRequestId endedAt endedByEmail endedByRole').lean();
  return new Map(closures.map((closure) => [attendanceActivityKey(closure), closure]));
}

async function currentMemberAttendanceAssignment(email) {
  const assignments = await AttendanceAssignment.find({
    memberEmail: email, status: { $in: ['assigned', 'accepted'] }
  }).read('primary').readConcern('majority').sort({ createdAt: -1 }).limit(1000).lean();
  const todayAssignments = assignments.filter((assignment) => isActivityScheduledToday(assignment.eventDate));
  if (!todayAssignments.length) return null;
  const closures = await AttendanceActivityClosure.find({
    $or: todayAssignments.map((assignment) => ({
      clubId: Number(assignment.clubId),
      itemType: assignment.itemType === 'booth' ? 'booth' : 'event',
      eventRequestId: Number(assignment.eventRequestId)
    }))
  }).select('clubId itemType eventRequestId').read('primary').readConcern('majority').lean();
  const closedKeys = new Set(closures.map(attendanceActivityKey));
  return todayAssignments.find((assignment) => !closedKeys.has(attendanceActivityKey(assignment))) || null;
}

app.get('/api/club/attendance-assignment-options', requireClubAuth, async (req, res) => {
  const isPresident = req.clubAccount.role === 'president';
  if (!isPresident && !isItCommitteeHead(req.clubAccount)) return res.status(403).json({ message: 'Only the club president or IT committee head can assign attendance tasks.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const activityClubFilter = isPresident
      ? { id: req.clubAccount.clubId, archivedAt: null }
      : { archivedAt: null };
    const [databaseClubs, ownClub, acceptedMembers] = await Promise.all([
      Club.find(activityClubFilter).select('id name events booths').read('primary').readConcern('majority').lean(),
      Club.findOne({ id: req.clubAccount.clubId }).select('memberRoster').read('primary').readConcern('majority').lean(),
      Application.find({ clubId: req.clubAccount.clubId, status: 'accepted' })
        .select('studentName email committee').read('primary').readConcern('majority').sort({ studentName: 1 }).lean()
    ]);
    const membersByEmail = new Map();
    [...(ownClub?.memberRoster || []), ...acceptedMembers].forEach((member) => {
      const memberCommittee = String(member.committee || '').trim().toLowerCase();
      const belongsToEligibleCommittee = isPresident
        ? /(^|[^a-z])it([^a-z]|$)/.test(memberCommittee) || memberCommittee.includes('information technology')
        : memberCommittee === String(req.clubAccount.committee || '').trim().toLowerCase();
      if (!belongsToEligibleCommittee) return;
      const email = cleanText(member.email, 254).toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      membersByEmail.set(email, { name: cleanText(member.name || member.studentName, 160) || email.split('@')[0], email });
    });
    const allEvents = databaseClubs.flatMap((club) => ['event', 'booth'].flatMap((itemType) => {
      const items = itemType === 'event' ? club.events : club.booths;
      return (Array.isArray(items) ? items : []).flatMap((item, itemIndex) => {
        const title = cleanText(item.title || item.boothName, 140);
        const date = cleanText(item.date || item.boothOpenDate, 80);
        if (!title || !isActivityScheduledToday(date)) return [];
        const requestId = Number(item.requestId);
        const legacyOffset = itemType === 'booth' ? 1_000_000 : 0;
        const eventRequestId = Number.isInteger(requestId) && requestId > 0 ? requestId : -(legacyOffset + itemIndex + 1);
        return [{ clubId: club.id, clubName: club.name, itemType, eventRequestId, title, date, time: cleanText(item.time || item.boothOpenTime, 80) }];
      });
    })).sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title));
    const closures = allEvents.length ? await AttendanceActivityClosure.find({
      $or: allEvents.map(({ clubId, itemType, eventRequestId }) => ({ clubId, itemType, eventRequestId }))
    }).select('clubId itemType eventRequestId').lean() : [];
    const closedKeys = new Set(closures.map(attendanceActivityKey));
    const events = allEvents.filter((activity) => !closedKeys.has(attendanceActivityKey(activity)));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ members: [...membersByEmail.values()].sort((left, right) => left.name.localeCompare(right.name)), events });
  } catch (error) {
    console.error('Attendance delegation options could not be loaded:', error.name);
    res.status(503).json({ message: 'Could not load eligible IT members and today’s events from the database.' });
  }
});

app.post('/api/club/attendance-assignments', requireClubAuth, async (req, res) => {
  const isPresident = req.clubAccount.role === 'president';
  if (!isPresident && !isItCommitteeHead(req.clubAccount)) return res.status(403).json({ message: 'Only the club president or IT committee head can assign attendance tasks.' });
  const clubId = Number(req.body.clubId);
  const eventRequestId = Number(req.body.eventRequestId);
  const itemType = req.body.itemType === 'booth' ? 'booth' : req.body.itemType === 'event' ? 'event' : '';
  const memberEmail = cleanText(req.body.memberEmail, 254).toLowerCase();
  if (!Number.isSafeInteger(clubId) || !Number.isSafeInteger(eventRequestId) || !itemType || !memberEmail) {
    return res.status(400).json({ message: 'Choose a member and an event or booth.' });
  }
  if (isPresident && clubId !== Number(req.clubAccount.clubId)) {
    return res.status(403).json({ message: 'A president can assign attendance only for their own club.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const [activityClub, memberClub, acceptedMember] = await Promise.all([
      Club.findOne({ id: clubId, archivedAt: null }).select('id name events booths').read('primary').readConcern('majority').lean(),
      Club.findOne({ id: req.clubAccount.clubId }).select('memberRoster').read('primary').readConcern('majority').lean(),
      Application.findOne({ clubId: req.clubAccount.clubId, status: 'accepted', email: memberEmail })
        .select('studentName email committee').read('primary').readConcern('majority').lean()
    ]);
    const matchesEligibleCommittee = (member) => {
      const committee = String(member?.committee || '').trim().toLowerCase();
      return isPresident
        ? /(^|[^a-z])it([^a-z]|$)/.test(committee) || committee.includes('information technology')
        : committee === String(req.clubAccount.committee || '').trim().toLowerCase();
    };
    const rosterMember = (memberClub?.memberRoster || []).find((member) => String(member.email || '').toLowerCase() === memberEmail
      && matchesEligibleCommittee(member));
    const member = rosterMember || (matchesEligibleCommittee(acceptedMember) ? acceptedMember : null);
    if (!member) return res.status(403).json({ message: 'Choose an eligible member with a verified MIU email.' });
    const items = itemType === 'event' ? activityClub?.events : activityClub?.booths;
    let selected = eventRequestId > 0 ? (items || []).find((item) => Number(item.requestId) === eventRequestId) : null;
    if (eventRequestId < 0) {
      const legacyOffset = itemType === 'booth' ? 1_000_000 : 0;
      const itemIndex = -eventRequestId - legacyOffset - 1;
      selected = itemIndex >= 0 ? items?.[itemIndex] : null;
      if (selected?.requestId) selected = null;
    }
    const eventTitle = cleanText(selected?.title || selected?.boothName, 140);
    const eventDate = cleanText(selected?.date || selected?.boothOpenDate, 80);
    if (!activityClub || !selected || !eventTitle || !isActivityScheduledToday(eventDate)) {
      return res.status(404).json({ message: 'Choose an event or booth scheduled for today.' });
    }
    if (itemType === 'event' && selected.attendanceEnabled === false) return res.status(409).json({ message: 'This event was published without attendance tracking.' });
    if (await isAttendanceActivityManuallyEnded(clubId, itemType, eventRequestId)) {
      return res.status(409).json({ message: 'Attendance has ended for this event or booth.' });
    }
    const activeMemberDayKey = crypto.createHmac('sha256', sessionSecret)
      .update(`attendance-assignment.${memberEmail}.${cairoDateKey()}`).digest('hex');
    const existingActiveAssignments = await AttendanceAssignment.find({
      memberEmail, status: { $in: ['assigned', 'accepted'] }
    }).select('eventDate').read('primary').readConcern('majority').lean();
    if (existingActiveAssignments.some((assignment) => isActivityScheduledToday(assignment.eventDate))) {
      return res.status(409).json({ message: 'This member already has an attendance assignment for today.' });
    }
    const assignment = await AttendanceAssignment.create({
      clubId, clubName: activityClub.name, itemType, eventRequestId, eventTitle, eventDate,
      eventTime: cleanText(selected.time || selected.boothOpenTime, 80),
      memberEmail, memberName: cleanText(member.name || member.studentName, 160),
      committee: cleanText(member.committee, 100), assignedBy: req.clubAccount.email, activeMemberDayKey
    });
    const saved = await AttendanceAssignment.findById(assignment._id).read('primary').readConcern('majority').lean();
    if (!saved || saved.memberEmail !== memberEmail || saved.eventRequestId !== eventRequestId
      || saved.activeMemberDayKey !== activeMemberDayKey || !isActivityScheduledToday(saved.eventDate)) {
      await AttendanceAssignment.deleteOne({ _id: assignment._id }).catch(() => {});
      return res.status(503).json({ message: 'The request could not be confirmed in the database.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ savedToDatabase: true, assignment: { id: String(saved._id), eventTitle: saved.eventTitle, eventDate: saved.eventDate, memberName: saved.memberName } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'This member already has an attendance assignment for today, or the activity is already assigned.' });
    console.error('Attendance assignment could not be saved:', error.name);
    res.status(503).json({ message: 'The request was not saved. Please try again.' });
  }
});

app.get('/api/member/attendance-assignments', requireStudentAuth, async (req, res) => {
  try {
    if (!requireLiveDatabase(res)) return;
    const assignment = await currentMemberAttendanceAssignment(req.studentAccount.email);
    res.setHeader('Cache-Control', 'no-store');
    if (!assignment) return res.json([]);
    const { _id, __v, activeMemberDayKey, checkInDeviceHash, ...publicAssignment } = assignment;
    const attendance = await AttendanceRecord.findOne({
      clubId: assignment.clubId, itemType: assignment.itemType,
      eventRequestId: assignment.eventRequestId, email: req.studentAccount.email
    }).select('eventParticipation').lean();
    res.json([{ ...publicAssignment, id: String(_id), attendanceRecorded: Boolean(attendance), attendanceRole: attendance?.eventParticipation?.role || 'attendee' }]);
  } catch (error) {
    console.error('Member attendance tasks could not be loaded:', error.name);
    res.status(503).json({ message: 'Could not load your club attendance tasks.' });
  }
});

app.post('/api/member/attendance-assignments/:id/accept', requireStudentAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'This attendance assignment could not be found.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const requested = await currentMemberAttendanceAssignment(req.studentAccount.email);
    if (!requested || String(requested._id) !== req.params.id || requested.status !== 'assigned') {
      return res.status(409).json({ message: 'This task is no longer waiting for your response.' });
    }
    const assignment = await AttendanceAssignment.findOneAndUpdate(
      { _id: req.params.id, memberEmail: req.studentAccount.email, status: 'assigned' },
      { $set: { status: 'accepted', acceptedAt: new Date() } },
      { new: true, writeConcern: { w: 'majority' } }
    ).read('primary').readConcern('majority').lean();
    if (!assignment) return res.status(409).json({ message: 'This task is no longer waiting for your response.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ savedToDatabase: true, id: String(assignment._id), status: assignment.status });
  } catch (error) {
    console.error('Member attendance task acceptance failed:', error.name);
    res.status(503).json({ message: 'Your response was not saved. Please try again.' });
  }
});

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

app.get('/api/club/heads', requireClubAuth, requireClubPresident, async (req, res) => {
  if (!mongoReady) return res.status(503).json({ message: 'Committee head records need the database.' });
  try {
    const heads = await ClubAccount.find({ clubId: req.clubAccount.clubId, role: 'head' })
      .select('email committee').read('primary').lean();
    res.json(heads.map(({ email, committee }) => ({ email, committee })));
  } catch (error) {
    console.error('Committee head lookup failed:', error.name);
    res.status(503).json({ message: 'Could not load this club’s committee heads.' });
  }
});

function acceptedApplicationsAsMembers(applicationsForClub) {
  return applicationsForClub.map((application) => ({
    id: `application-${application.id}`,
    name: application.studentName,
    email: application.email || '',
    committee: application.committee,
    position: application.memberPosition || 'Member',
    memberType: application.memberType || 'new',
    source: 'accepted-application',
    createdAt: application.updatedAt
  }));
}

function buildClubMemberListing(club, acceptedApplications) {
  const members = Array.isArray(club.memberRoster) ? [...club.memberRoster] : [];
  const acceptedMembers = acceptedApplicationsAsMembers(acceptedApplications);
  const memberIndexByEmail = new Map(members
    .map((member, index) => [String(member.email || '').trim().toLowerCase(), index])
    .filter(([email]) => email));
  acceptedMembers.forEach((member) => {
    const email = String(member.email || '').trim().toLowerCase();
    const existingIndex = email ? memberIndexByEmail.get(email) : undefined;
    if (existingIndex === undefined) {
      members.push(member);
      if (email) memberIndexByEmail.set(email, members.length - 1);
    } else {
      // Accepted application data is the live source for new members.
      members[existingIndex] = { ...members[existingIndex], ...member };
    }
  });
  return {
    id: club.id,
    name: club.name,
    members,
    totalCount: members.length
  };
}

app.get('/api/club/members', requireClubAuth, async (req, res) => {
  if (!['president', 'head'].includes(req.clubAccount.role)) {
    return res.status(403).json({ message: 'Only club presidents and committee heads can view club members.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const [club, acceptedApplications] = await Promise.all([
      Club.findOne({ id: req.clubAccount.clubId })
        .select('members memberRoster').read('primary').readConcern('majority').lean(),
      Application.find({ clubId: req.clubAccount.clubId, status: 'accepted' })
        .select('id studentName email universityId committee updatedAt')
        .read('primary').readConcern('majority').sort({ updatedAt: -1 }).lean()
    ]);
    if (!club) return res.status(404).json({ message: 'Club not found.' });
    const committees = [...new Set(clubAccounts
      .filter((account) => account.clubId === req.clubAccount.clubId && account.role === 'head' && account.committee)
      .map((account) => account.committee))];
    const listing = buildClubMemberListing(club, acceptedApplications);
    const isHead = req.clubAccount.role === 'head';
    const visibleMembers = isHead
      ? listing.members.filter((member) => String(member.committee || '').trim().toLowerCase() === String(req.clubAccount.committee || '').trim().toLowerCase())
      : listing.members;
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      clubId: listing.id,
      clubName: club.name,
      committee: isHead ? req.clubAccount.committee : '',
      members: visibleMembers,
      totalCount: isHead ? visibleMembers.length : listing.totalCount,
      committees
    });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load club members right now.' });
  }
});

app.patch('/api/club/members/:memberId', requireClubAuth, async (req, res) => {
  if (!['president', 'head'].includes(req.clubAccount.role)) {
    return res.status(403).json({ message: 'Only club presidents and committee heads can edit member roles.' });
  }
  const memberId = cleanText(req.params.memberId, 100);
  const position = cleanText(req.body.position, 100);
  const memberType = req.body.memberType;
  if (!position) return res.status(400).json({ message: 'Enter the member role.' });
  if (!['new', 'senior'].includes(memberType)) return res.status(400).json({ message: 'Choose New member or Senior member.' });
  try {
    if (!requireLiveDatabase(res)) return;
    if (memberId.startsWith('application-')) {
      const applicationId = Number(memberId.slice('application-'.length));
      if (!Number.isSafeInteger(applicationId)) return res.status(400).json({ message: 'Invalid member.' });
      const filter = {
        id: applicationId,
        clubId: req.clubAccount.clubId,
        status: 'accepted',
        ...(req.clubAccount.role === 'head' ? { committee: req.clubAccount.committee } : {})
      };
      const application = await Application.findOneAndUpdate(filter, {
        $set: { memberPosition: position, memberType }
      }, { new: true, runValidators: true }).read('primary');
      if (!application) return res.status(404).json({ message: 'Accepted member not found in your committee.' });
      return res.json({ member: { id: memberId, name: application.studentName, email: application.email, committee: application.committee, position: application.memberPosition, memberType: application.memberType } });
    }

    const club = await Club.findOne({ id: req.clubAccount.clubId }).select('memberRoster').read('primary');
    if (!club) return res.status(404).json({ message: 'Club not found.' });
    const member = club.memberRoster.find((item) => item.id === memberId
      && (req.clubAccount.role !== 'head' || String(item.committee || '').trim().toLowerCase() === String(req.clubAccount.committee || '').trim().toLowerCase()));
    if (!member) return res.status(404).json({ message: 'Member not found in your committee.' });
    member.position = position;
    member.memberType = memberType;
    await club.save();
    return res.json({ member: { id: member.id, name: member.name, email: member.email, committee: member.committee, position: member.position, memberType: member.memberType } });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    return res.status(503).json({ message: 'Could not update this member right now.' });
  }
});

require('./services/club-member-removal').registerClubMemberRemoval(app, {
  requireClubAuth, requireClubPresident, requireLiveDatabase, mongoose, Club, Application, clubs, applications
});

async function getClubMemberDirectory() {
  if (!mongoReady || mongoose.connection.readyState !== 1) throw new Error('Live club data is unavailable.');
  const [directoryClubs, acceptedApplications] = await Promise.all([
    Club.find({}).select('id name members memberRoster')
      .read('primary').readConcern('majority').sort({ name: 1 }).lean(),
    Application.find({ status: 'accepted' }).select('id clubId studentName committee updatedAt')
      .read('primary').readConcern('majority').sort({ updatedAt: -1 }).lean()
  ]);
  const acceptedByClub = new Map();
  acceptedApplications.forEach((application) => {
    const grouped = acceptedByClub.get(application.clubId) || [];
    grouped.push(application);
    acceptedByClub.set(application.clubId, grouped);
  });
  return directoryClubs.map((club) => buildClubMemberListing(club, acceptedByClub.get(club.id) || []));
}

app.post('/api/club/members', requireClubAuth, requireClubPresident, async (req, res) => {
  const committees = [...new Set(clubAccounts.filter((account) => account.clubId === req.clubAccount.clubId
    && account.role === 'head' && account.committee)
    .map((account) => account.committee.trim()))];
  const club = clubs.find((item) => item.id === req.clubAccount.clubId);
  if (!club) return res.status(404).json({ message: 'Club not found.' });
  try {
    if (!requireLiveDatabase(res)) return;
    const persistedClub = await Club.findOne({ id: req.clubAccount.clubId }).select('interviewForms').read('primary').readConcern('majority').lean();
    if (!persistedClub) return res.status(404).json({ message: 'Club not found.' });
    const interviewScope = getInterviewFormScope(req.clubAccount);
    const interviewSections = getInterviewFormSections(persistedClub.interviewForms, interviewScope);
    const questions = interviewSections.flatMap((section) => section.questions || []);
    let memberDetails;
    try {
      memberDetails = require('./services/club-member-intake').validateDirectMember(
        req.body || {}, committees, questions, require('./services/club-questions').validateAnswers
      );
    } catch (error) { return res.status(400).json({ message: error.message }); }
    const existingRosterMember = await Club.exists({ id: req.clubAccount.clubId, 'memberRoster.email': memberDetails.email });
    const existingAcceptedApplication = await Application.exists({ clubId: req.clubAccount.clubId, email: memberDetails.email, status: 'accepted' });
    if (existingRosterMember || existingAcceptedApplication) return res.status(409).json({ message: 'This person is already listed as a member of the club.' });
    const member = { id: crypto.randomBytes(16).toString('hex'), ...memberDetails, createdAt: new Date().toISOString() };
    const savedClub = await Club.findOneAndUpdate(
      { id: req.clubAccount.clubId, 'memberRoster.email': { $ne: member.email } },
      { $push: { memberRoster: member }, $inc: { members: 1 } },
      { new: true, runValidators: true }
    ).select('id members memberRoster');
    if (!savedClub) {
      const clubStillExists = await Club.exists({ id: req.clubAccount.clubId });
      return clubStillExists
        ? res.status(409).json({ message: 'This person is already listed as a member of the club.' })
        : res.status(404).json({ message: 'Club not found.' });
    }
    const savedMember = savedClub.memberRoster?.find((item) => item.id === member.id);
    if (!savedMember || savedMember.email !== member.email || savedMember.universityId !== member.universityId
      || savedMember.interviewAnswers?.length !== member.interviewAnswers.length) return res.status(503).json({ message: 'The member was not confirmed in the database. Please retry.' });
    club.members = Number(savedClub.members) || (Number(club.members) || 0) + 1;
    club.memberRoster = [...(club.memberRoster || []), member];
    res.status(201).json({ member: savedMember.toObject ? savedMember.toObject() : member, totalCount: club.members });
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not add this member right now.' });
  }
});

require('./services/club-questions').registerClubQuestions(app, {
  Club, ClubAccount, requireClubAuth, requireLiveDatabase, getInterviewFormScope, getInterviewFormSections, clubs
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
    const stageFilter = role === 'pr'
      ? { $or: [{ approvalStatus: stage }, { approvalStatus: { $exists: false } }] }
      : { approvalStatus: stage };
    const records = await AttendanceRecord.find(stageFilter).sort({ attendedAt: -1 }).lean();
    const closureMap = await attendanceClosureMapFor(records);
    const reviewableRecords = records.filter((record) => isAttendanceActivityEnded(record.eventDate)
      || closureMap.has(attendanceActivityKey(record)));
    const clubIds = [...new Set(records.map((record) => Number(record.clubId)))];
    const clubsById = new Map((await Club.find({ id: { $in: clubIds } }).select('id name image').lean()).map((club) => [Number(club.id), club]));
    const reviews = new Map();
    reviewableRecords.forEach((record) => {
      const itemType = record.itemType === 'booth' ? 'booth' : 'event';
      const attendanceAudience = record.attendanceAudience === 'all_students' ? 'all_students' : 'members';
      const key = `${record.clubId}:${itemType}:${record.eventRequestId}:${attendanceAudience}`;
      const club = Number(record.clubId) === 0 ? { name: 'MIU events', image: '' } : clubsById.get(Number(record.clubId));
      if (!reviews.has(key)) reviews.set(key, {
        clubId: Number(record.clubId), clubName: club?.name || `Club ${record.clubId}`, clubImage: club?.image || '',
        itemType, eventRequestId: record.eventRequestId, attendanceAudience, eventTitle: record.eventTitle, attendanceEnded: true,
        attendanceEndedAt: closureMap.get(attendanceActivityKey(record))?.endedAt || null,
        eventDate: record.eventDate || '', eventTime: record.eventTime || '', records: [], notes: []
      });
      const review = reviews.get(key);
      review.records.push({
        name: record.name, email: record.email, note: record.note || '', attendedAt: record.attendedAt,
        membershipStatus: record.membershipStatus || '', memberClubNames: record.memberClubNames || [], eventParticipation: record.eventParticipation
      });
      (record.approvalHistory || []).filter((entry) => entry.note).forEach((entry) => {
        const note = {
          role: entry.role, email: entry.email || '', action: entry.action, text: entry.note,
          createdAt: entry.createdAt || record.updatedAt || record.attendedAt
        };
        const noteKey = `${note.role}:${note.email}:${new Date(note.createdAt).getTime()}:${note.text}`;
        if (!review.notes.some((saved) => `${saved.role}:${saved.email}:${new Date(saved.createdAt).getTime()}:${saved.text}` === noteKey)) {
          review.notes.push(note);
        }
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
  const audience = req.query.audience === 'all_students' ? 'all_students' : req.query.audience === 'members' || req.query.audience === undefined ? 'members' : '';
  const action = ['approve', 'reject', 'note'].includes(req.body.action) ? req.body.action : 'approve';
  const note = cleanText(req.body.note, 500);
  if (!audience) return res.status(400).json({ message: 'Choose a valid attendance lane.' });
  if (!Number.isSafeInteger(clubId) || !Number.isSafeInteger(eventRequestId) || !['event', 'booth'].includes(itemType)) {
    return res.status(400).json({ message: 'Choose a valid event or booth review.' });
  }
  if (action === 'note' && !note) return res.status(400).json({ message: 'Write a note before saving it.' });
  if (action === 'reject' && !note) return res.status(400).json({ message: 'Add a short reason before rejecting this attendance list.' });
  const reviewFilter = { clubId, itemType, eventRequestId, ...(audience === 'all_students' ? { attendanceAudience: 'all_students' } : { attendanceAudience: { $in: ['members', null] } }) };
  const stageFilter = role === 'pr'
    ? { $or: [{ approvalStatus: stage }, { approvalStatus: { $exists: false } }] }
    : { approvalStatus: stage };
  try {
    if (!requireLiveDatabase(res)) return;
    const pendingRecords = await AttendanceRecord.find({ $and: [reviewFilter, stageFilter] })
      .select('clubId itemType eventRequestId eventDate').read('primary').readConcern('majority').lean();
    if (!pendingRecords.length) return res.status(409).json({ message: `This activity is no longer waiting for ${attendanceApprovalNames[role]} approval.` });
    const closureMap = await attendanceClosureMapFor(pendingRecords);
    if (pendingRecords.some((record) => !isAttendanceActivityEnded(record.eventDate)
      && !closureMap.has(attendanceActivityKey(record)))) {
      return res.status(409).json({ message: 'The club must end attendance before this list can be reviewed.' });
    }
    const update = { $push: { approvalHistory: {
      role, email: req.clubAccount.email,
      action: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'noted',
      note, createdAt: new Date()
    } } };
    if (action === 'approve') update.$set = { approvalStatus: role === 'dean' ? 'approved' : role === 'pr' ? 'pending_sso' : 'pending_dean' };
    if (action === 'reject') update.$set = { approvalStatus: 'rejected' };
    const result = await AttendanceRecord.updateMany({ $and: [reviewFilter, stageFilter] }, update);
    if (!result.modifiedCount) return res.status(409).json({ message: `This activity is no longer waiting for ${attendanceApprovalNames[role]} approval.` });
    await notifyAttendanceWorkflow(reviewFilter, action === 'approve' ? (role === 'dean' ? 'approved' : role === 'pr' ? 'pending_sso' : 'pending_dean') : action === 'reject' ? 'rejected' : stage, action);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      action, nextStage: action === 'approve' ? (role === 'dean' ? 'complete' : role === 'pr' ? 'sso' : 'dean') : '',
      recordsUpdated: result.modifiedCount
    });
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

const committeeStage = { supervisor: 'pending_supervisor', pr: 'pending_pr', english: 'pending_english', security: 'pending_security', dean: 'pending_dean' };
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
    sponsorAttachment: typeof body.sponsorAttachment === 'string' ? body.sponsorAttachment : '',
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
  if (record.type === 'event') {
    item.registrationEnabled = record.registrationEnabled !== false;
    item.attendanceEnabled = record.registrationEnabled !== false && record.attendanceEnabled === true;
    item.attendanceAudience = record.attendanceAudience === 'members' ? 'members' : 'all_students';
  }
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
    const filter = { clubId: req.clubAccount.clubId };
    if (req.clubAccount.role === 'head') {
      filter.assignedHeadEmail = req.clubAccount.email;
      filter.type = { $ne: 'entry_permit' };
      filter.status = { $in: ['draft', 'changes_requested', 'rejected'] };
    }
    const records = await ContentRequest.find(filter).sort({ id: -1 }).lean();
    res.json(records.map(shapeClubContentRecord));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load content right now.' });
  }
});

app.patch('/api/club/content/:id/assignment', requireClubAuth, async (req, res) => {
  if (req.clubAccount.role !== 'president') {
    return res.status(403).json({ message: 'Only the club president can assign a content task.' });
  }
  const email = cleanText(req.body.email, 254).toLowerCase();
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id), clubId: req.clubAccount.clubId });
    if (!record) return res.status(404).json({ message: 'Content not found.' });
    if (email) {
      const head = await ClubAccount.findOne({ clubId: req.clubAccount.clubId, role: 'head', email }).select('_id').lean();
      if (!head) return res.status(400).json({ message: 'Choose a committee head from this club.' });
      if (record.type === 'entry_permit') return res.status(403).json({ message: 'Entry Permits can only be managed by the club president.' });
      if (!['draft', 'changes_requested', 'rejected'].includes(record.status)) {
        return res.status(409).json({ message: 'Only items that need club updates can be assigned to a committee head.' });
      }
    }
    record.assignedHeadEmail = email;
    appendWorkflowEvent(record, 'club', 'assigned', record.status, record.status, '', req.clubAccount);
    await record.save();
    await notifyContentRequest(record);
    res.json({ id: record.id, assignedHeadEmail: record.assignedHeadEmail });
  } catch (error) {
    console.error('Content task assignment failed:', error.name);
    res.status(503).json({ message: 'Could not update the task assignment.' });
  }
});

app.post('/api/club/content', requireClubAuth, async (req, res) => {
  if (req.clubAccount.role !== 'president') {
    return res.status(403).json({ message: 'Only the club president can create content. Heads can edit only items assigned to them.' });
  }
  if (!isContentType(req.body.type)) {
    return res.status(400).json({ message: `Choose a valid content type: ${CONTENT_TYPES.join(', ')}.` });
  }
  if (req.clubAccount.role === 'head' && req.body.type === 'entry_permit') {
    return res.status(403).json({ message: 'Only the club president can create Entry Permits.' });
  }
  return createContentRequest(req, res, req.body.type);
});

// Each module assigns its own content type automatically.
for (const moduleType of CONTENT_TYPES) {
  app.post(`/api/club/content/${moduleType}`, requireClubAuth, async (req, res) => {
    if (req.clubAccount.role !== 'president') {
      return res.status(403).json({ message: 'Only the club president can create content. Heads can edit only items assigned to them.' });
    }
    if (req.clubAccount.role === 'head' && moduleType === 'entry_permit') {
      return res.status(403).json({ message: 'Only the club president can create Entry Permits.' });
    }
    return createContentRequest(req, res, moduleType);
  });
}

async function resolveContentHeadAssignment(req, type, rawEmail) {
  const email = cleanText(rawEmail, 254).toLowerCase();
  if (!email) return '';
  if (type === 'entry_permit' || req.clubAccount.role !== 'president') return null;
  const head = await ClubAccount.findOne({
    clubId: req.clubAccount.clubId,
    role: 'head',
    email
  }).select('_id').lean();
  return head ? email : null;
}

async function createContentRequest(req, res, type) {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    let media;
    try { media = await validateFeedMedia(type, req.body, '', { cloudinary, cloudName: cloudinaryCredentials?.cloud_name }); }
    catch (error) { return res.status(error.status || 400).json({ message: error.message }); }
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
    if (type === 'event' && req.body.attendanceAudience !== undefined && !['members', 'all_students'].includes(req.body.attendanceAudience)) {
      return res.status(400).json({ message: 'Choose whether this event is for club members or all university students.' });
    }
    if (type === 'event' && req.body.submit === true && !['members', 'all_students'].includes(req.body.attendanceAudience)) {
      return res.status(400).json({ message: 'Choose an audience before submitting this event for review.' });
    }
    if (type === 'entry_permit' && req.body.submit === true && !validEntryPermitItems(req.body.permitItems)) {
      return res.status(400).json({ message: 'Add at least one complete permit row with a valid quantity, number, and details.' });
    }
    const sponsorFields = type === 'sponsor' ? extractSponsorFields(req.body) : {};
    if (type === 'sponsor' && !validSponsorAttachment(req.body.sponsorAttachment)) return res.status(422).json({ message: 'Choose a valid PDF, DOC, DOCX, PPT or PPTX attachment up to 3 MB.' });
    const contentForImageCheck = { image: media, ...sponsorFields };
    if (req.body.submit === true && missingRequiredPublicContentImage(type, contentForImageCheck)) {
      return res.status(400).json({ message: type === 'sponsor' ? 'Add the company logo before submitting this sponsor request.' : type === 'feed' ? 'Add an image or video before submitting this post.' : 'Add an image before submitting this content.' });
    }
    const club = clubs.find((item) => item.id === req.clubAccount.clubId);
    const assignedHeadEmail = req.body.assignedHeadEmail
      ? await resolveContentHeadAssignment(req, type, req.body.assignedHeadEmail)
      : '';
    if (assignedHeadEmail === null) return res.status(400).json({ message: 'Choose a committee head assigned to this club.' });
    const last = await ContentRequest.findOne().sort({ id: -1 }).lean();
    const contentValues = {
      id: (last?.id || 0) + 1,
      clubId: req.clubAccount.clubId,
      clubName: club?.name || '',
      type,
      assignedHeadEmail,
      title,
      description,
      date: type === 'booth' ? (cleanText(req.body.boothOpenDate, 40) || cleanText(req.body.date, 40)) : cleanText(req.body.date, 40),
      time: cleanText(req.body.time, 40),
      ...(type === 'event' ? {
        registrationEnabled: req.body.registrationEnabled === undefined ? true : req.body.registrationEnabled === true,
        attendanceEnabled: req.body.registrationEnabled !== false && req.body.attendanceEnabled === true,
        attendanceAudience: req.body.attendanceAudience === 'members' ? 'members' : req.body.attendanceAudience === 'all_students' ? 'all_students' : undefined
      } : {}),
      location: type === 'booth' ? (cleanText(req.body.boothLocation, 140) || cleanText(req.body.location, 120)) : cleanText(req.body.location, 120),
      budget: cleanText(req.body.budget, 80),
      image: media.slice(0, 4 * 1024 * 1024),
      ...extractContentFields(type, req.body),
      status: req.body.submit === true ? 'pending_supervisor' : 'draft',
      clubNotice: req.body.submit === true ? `Club submitted a new ${contentSingularLabel(type)} for supervisor review.` : ''
    };
    const managed = req.body.submit === true && typeof dynamicWorkflowEngine !== 'undefined';
    const record = managed
      ? await dynamicWorkflowEngine.createNew('content', contentValues, { email: req.clubAccount.email, role: req.clubAccount.role })
      : await ContentRequest.create(contentValues);
    if (req.body.submit === true && !managed) appendWorkflowEvent(record, 'club', 'submitted', 'draft', 'pending_supervisor', '', req.clubAccount);
    if (req.body.submit === true && !managed) {
      await record.save();
      await notifyContentRequest(record);
    }
    const { _id, __v, ...rest } = record.toObject();
    res.status(201).json(rest);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(error.status || 503).json({ message: error.status ? error.message : 'Could not save content right now.' });
  }
}

app.put('/api/club/content/:id', requireClubAuth, async (req, res) => {
  if (!['president', 'head'].includes(req.clubAccount.role)) {
    return res.status(403).json({ message: 'Only club presidents and assigned committee heads can manage this content.' });
  }
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Content storage needs MongoDB.' });
    const record = await ContentRequest.findOne({ id: Number(req.params.id), clubId: req.clubAccount.clubId });
    if (!record) return res.status(404).json({ message: 'Content not found.' });
    if (req.clubAccount.role === 'head' && (record.type === 'entry_permit' || record.assignedHeadEmail !== req.clubAccount.email)) {
      return res.status(403).json({ message: 'This content item has not been assigned to your account.' });
    }
    if (!['draft', 'changes_requested', 'rejected'].includes(record.status)) {
      return res.status(409).json({ message: 'This content is already under review or published.' });
    }
    // The content type is fixed by the module that created the request.
    const type = record.type;
    let media;
    try { media = await validateFeedMedia(type, req.body, record.image, { cloudinary, cloudName: cloudinaryCredentials?.cloud_name }); }
    catch (error) { return res.status(error.status || 400).json({ message: error.message }); }
    if (type === 'event' && req.body.submit === true
      && !['members', 'all_students'].includes(req.body.attendanceAudience ?? record.attendanceAudience)) {
      return res.status(400).json({ message: 'Choose an audience before submitting this event for review.' });
    }
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
    if (type === 'event' && req.body.registrationEnabled !== undefined) {
      record.registrationEnabled = req.body.registrationEnabled === true;
      if (!record.registrationEnabled) record.attendanceEnabled = false;
    }
    if (type === 'event' && req.body.attendanceEnabled !== undefined) {
      record.attendanceEnabled = record.registrationEnabled && req.body.attendanceEnabled === true;
    }
    if (type === 'event' && req.body.attendanceAudience !== undefined) {
      record.attendanceAudience = req.body.attendanceAudience;
    }
    if (req.body.location !== undefined) record.location = cleanText(req.body.location, 120);
    if (req.body.budget !== undefined) record.budget = cleanText(req.body.budget, 80);
    if (typeof req.body.image === 'string') record.image = media.slice(0, 4 * 1024 * 1024);
    if (req.clubAccount.role === 'president' && req.body.assignedHeadEmail !== undefined && type !== 'entry_permit') {
      const assignedHeadEmail = await resolveContentHeadAssignment(req, type, req.body.assignedHeadEmail);
      if (assignedHeadEmail === null) return res.status(400).json({ message: 'Choose a committee head assigned to this club.' });
      record.assignedHeadEmail = assignedHeadEmail;
    }
    if (type === 'sponsor') {
      if (req.body.sponsorAttachment !== record.sponsorAttachment && !validSponsorAttachment(req.body.sponsorAttachment)) return res.status(422).json({ message: 'Choose a valid PDF, DOC, DOCX, PPT or PPTX attachment up to 3 MB.' });
      Object.assign(record, extractSponsorFields(req.body));
    }
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
      return res.status(400).json({ message: type === 'sponsor' ? 'Add the company logo before submitting this sponsor request.' : type === 'feed' ? 'Add an image or video before submitting this post.' : 'Add an image before submitting this content.' });
    }
    if (type === 'booth') {
      Object.assign(record, extractBoothFields(req.body));
      // Booths are tracked by their opening date and preferred location.
      record.date = record.boothOpenDate || record.date;
      record.location = record.boothLocation || record.location;
    }
    if (req.body.submit === true && !record.workflow && typeof dynamicWorkflowEngine !== 'undefined') {
      await dynamicWorkflowEngine.submitNew(record, { email: req.clubAccount.email, role: req.clubAccount.role });
      return res.json(shapeClubContentRecord(record.toObject()));
    }
    if (record.status === 'changes_requested' && !record.editRequestedBy && type === 'entry_permit' && record.comments?.security) {
      record.resubmitTo = 'pending_security';
    } else if (record.status === 'changes_requested' && !record.editRequestedBy && record.comments?.english) {
      record.resubmitTo = type === 'event' ? 'pending_english' : 'pending_pr';
    }
    if (req.body.submit === true) {
      const fromStatus = record.editRequestedBy ? 'changes_requested' : record.status;
      const targetStage = record.editRequestedBy === 'supervisor' ? (record.supervisorNextStage || 'pending_pr')
        : type === 'entry_permit' && record.editRequestedBy === 'pr'
        ? 'pending_pr'
        : type !== 'event' && record.editRequestedBy === 'english' ? 'pending_pr'
        : record.editRequestedBy ? committeeStage[record.editRequestedBy] : (record.resubmitTo || 'pending_pr');
      const isFirstSubmission = !(record.workflowHistory || []).some((event) => ['submitted', 'resubmitted'].includes(event.action));
      record.supervisorNextStage = targetStage;
      record.status = 'pending_supervisor';
      record.resubmitTo = 'pending_pr';
      const nextReviewer = { pending_pr: 'PR Department', pending_english: 'English Department', pending_security: 'Security Office' }[targetStage] || 'Dean';
      record.clubNotice = `${isFirstSubmission ? 'Club submitted a new' : 'Club resubmitted the updated'} ${contentSingularLabel(type)}. Waiting for club supervisor approval, then ${nextReviewer} review.`;
      appendWorkflowEvent(record, 'club', isFirstSubmission ? 'submitted' : 'resubmitted', fromStatus, 'pending_supervisor', '', req.clubAccount);
      record.editRequestedBy = '';
    } else {
      appendWorkflowEvent(record, 'club', 'edited', record.status, 'draft', '', req.clubAccount);
      record.status = 'draft';
    }
    await record.save();
    await notifyContentRequest(record);
    const { _id, __v, ...rest } = record.toObject();
    res.json(rest);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not update content right now.' });
  }
});

app.delete('/api/club/content/:id', requireClubAuth, async (req, res) => {
  if (req.clubAccount.role !== 'president') {
    return res.status(403).json({ message: 'Only the club president can delete content.' });
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
    filter.workflow = { $exists: false };
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
    filter.workflow = { $exists: false };
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
    const record = await ContentRequest.findOne({ id: Number(req.params.id), workflow: { $exists: false } }).lean();
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
    if (record.status === 'pending_supervisor' || record.status === 'draft' || record.status === 'changes_requested' || record.status === committeeStage[role]) {
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
    await notifyContentRequest(record);
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
    await notifyContentRequest(record);
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
    await notifyContentRequest(record);
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
    await notifyContentRequest(record);
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
    await notifyContentRequest(record);
    if (nextStatus === 'published' && record.type !== 'entry_permit') {
      await dispatchPublishedContentNotifications({
        source: 'club',
        contentId: record.id,
        revision: record.publishedAt?.getTime() || Date.now(),
        type: record.type,
        title: record.title
      });
    }
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

function loginAttemptKey(req, scope = 'account') {
  const sourceAddress = httpSecurity.trustedClientIp(req) || 'unknown';
  const email = scope === 'account' ? String(req.body?.email || '').trim().toLowerCase().slice(0, 254) : '';
  const hashSecret = process.env.LOGIN_ATTEMPT_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.MONGO_URI || sessionSecret;
  return crypto.createHmac('sha256', hashSecret).update(`${scope}|${sourceAddress}|${email}`).digest('hex');
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

async function recordLoginFailure(key, threshold = MAX_LOGIN_FAILURES) {
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
          lockedUntil: { $cond: [{ $gte: ['$failures', threshold] }, new Date(now + LOGIN_LOCK_MS), null] },
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
  if (entry.failures >= threshold) {
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
    const expiries = await Promise.all([loginLockExpiry(loginAttemptKey(req)), loginLockExpiry(loginAttemptKey(req, 'source'))]);
    const lockedUntil = expiries.find(Boolean);
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
    await recordLoginFailure(loginAttemptKey(req, 'source'), 100);
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
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'Google sign-in request was blocked. Reload this page and try again.' });
  if (await checkLoginSourceLock(req, res)) return;
  if (!mongoReady) await ensureReady();
  if (!mongoReady) return res.status(503).json({ message: 'Sign-in is temporarily unavailable because the database could not be reached. Please try again shortly.' });
  try {
    const identity = await verifyGoogleRequest(req, res);
    if (identity.email === getConfiguredAdminEmail()) {
      adminAuthState = await require('./services/staff-google-auth').resolveAdminGoogleAccount({
        AdminAuthState, identity, configuredEmail: getConfiguredAdminEmail(),
        async fallbackCredentials() {
          if (process.env.ADMIN_EMAIL?.trim().toLowerCase() === identity.email && process.env.ADMIN_PASSWORD) {
            const salt = crypto.randomBytes(16).toString('hex');
            const passwordHash = await new Promise((resolve, reject) => crypto.scrypt(process.env.ADMIN_PASSWORD, salt, 64,
              (error, hash) => error ? reject(error) : resolve(hash.toString('hex'))));
            return { salt, passwordHash };
          }
          return adminCredentials?.email === identity.email ? { salt: adminCredentials.salt, passwordHash: adminCredentials.passwordHash } : null;
        }
      });
      if (!adminAuthState) throw new Error('STAFF_GOOGLE_ACCOUNT_CONFLICT');
      if (!await clearLoginSourceFailures(req, res)) return;
      await recordSuccessfulSignIn('admin', identity.email);
      setAdminSessionCookie(req, res);
      res.append('Set-Cookie', `miu_club=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`);
      res.append('Set-Cookie', `miu_student=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`);
      clearGoogleNonceCookie(req, res);
      return res.json({ authenticated: true, role: 'admin', redirect: '/admin' });
    }
    const staff = await require('./services/staff-google-auth').resolveStaffGoogleAccount(ClubAccount, identity);
    if (staff) {
      if (!await clearLoginSourceFailures(req, res)) return;
      await recordSuccessfulSignIn('club', staff.account.email);
      setClubSessionCookie(req, res, staff.account);
      res.append('Set-Cookie', `miu_admin=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`);
      res.append('Set-Cookie', `miu_student=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`);
      clearGoogleNonceCookie(req, res);
      return res.json({ authenticated: true, role: staff.account.role, redirect: staff.redirect });
    }
    const accountBySubject = await StudentAccount.findOne({ googleSub: identity.googleSub }).lean();
    const accountByEmail = accountBySubject ? null : await StudentAccount.findOne({ email: identity.email }).lean();
    const decision = decideGoogleAccount({ accountBySubject, accountByEmail });
    if (decision.action === 'explicit_link_required') {
      if (await countLoginSourceFailure(req, res)) return;
      return res.status(409).json({ message: 'An account already exists for this email. Sign in with your existing password, then choose Link Google account to connect it securely.' });
    }
    let account = decision.account;
    if (decision.action === 'create') {
      try {
        account = await StudentAccount.create({ email: identity.email, name: cleanText(identity.name, 160) || identity.email.split('@')[0], googleSub: identity.googleSub });
        account = account.toObject();
      } catch (error) {
        if (error.code !== 11000) throw error;
        account = await StudentAccount.findOne({ googleSub: identity.googleSub }).lean();
        if (!account) {
          const emailAccount = await StudentAccount.findOne({ email: identity.email }).lean();
          if (emailAccount) {
            if (await countLoginSourceFailure(req, res)) return;
            return res.status(409).json({ message: 'An account already exists for this email. Sign in with your existing password, then choose Link Google account to connect it securely.' });
          }
          throw error;
        }
      }
    }
    if (!account || account.googleSub !== identity.googleSub) {
      if (await countLoginSourceFailure(req, res)) return;
      return res.status(403).json({ message: 'This Google account could not be matched to a student account.' });
    }
    if (!await clearLoginSourceFailures(req, res)) return;
    await recordSuccessfulSignIn('student', account.email);
    setStudentSessionCookie(req, res, account);
    res.append('Set-Cookie', `miu_club=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`);
    res.append('Set-Cookie', `miu_admin=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`);
    clearGoogleNonceCookie(req, res);
    return res.json({ authenticated: true, role: 'student' });
  } catch (error) {
    if (error.message === 'STAFF_GOOGLE_ACCOUNT_CONFLICT' || error.code === 11000) {
      return res.status(409).json({ message: 'This staff Google account could not be linked. Contact the platform administrator.' });
    }
    if (error.message !== 'GOOGLE_ACCOUNT_NOT_ALLOWED' && error.message !== 'GOOGLE_CREDENTIAL_INVALID') {
      console.error('Google sign-in failed:', error.name);
      return res.status(503).json({ message: 'Google sign-in is temporarily unavailable.' });
    }
    if (await countLoginSourceFailure(req, res)) return;
    const messages = {
      nonce_missing: 'This Google check expired. Reload the page and try again.',
      nonce_mismatch: 'Google returned a different sign-in check. Reload the page and try again.',
      miu_domain_mismatch: 'Choose your MIU Google Workspace account ending in @miuegypt.edu.eg.',
      email_unverified: 'Google did not confirm this email address. Verify it in your MIU Google account and try again.',
      client_not_configured: 'Google sign-in is not configured correctly on this site. Contact the site administrator.',
      token_rejected: 'Google could not verify this sign-in. Reload and try again; if it continues, the site administrator should check the Google OAuth client ID.'
    };
    res.status(401).json({ message: messages[error.reason] || 'Use a verified Google account from the MIU university domain.' });
  }
});

app.post('/api/student-auth/google/link', requireStudentAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'Google account linking request was blocked. Reload this page and try again.' });
  if (await checkLoginSourceLock(req, res)) return;
  if (!mongoReady) return res.status(503).json({ message: 'Google account linking requires the database.' });
  try {
    const identity = await verifyGoogleRequest(req, res);
    if (identity.email !== String(req.studentAccount.email || '').toLowerCase()) {
      return res.status(403).json({ message: `The Google account you chose (${identity.email}) does not match the signed-in student account (${String(req.studentAccount.email || '').toLowerCase()}). Choose the matching MIU account.` });
    }
    const subjectOwner = await StudentAccount.findOne({ googleSub: identity.googleSub }).select('email').lean();
    const linkDecision = decideGoogleLink({
      accountEmail: req.studentAccount.email,
      googleEmail: identity.email,
      currentGoogleSub: req.studentAccount.googleSub,
      requestedGoogleSub: identity.googleSub,
      subjectOwnerEmail: subjectOwner?.email
    });
    if (linkDecision === 'subject_in_use') {
      return res.status(409).json({ message: 'This Google account is already linked to another student account.' });
    }
    if (linkDecision === 'different_google_account_linked') {
      return res.status(409).json({ message: 'A different Google account is already linked to this student account.' });
    }
    if (linkDecision !== 'link') return res.status(403).json({ message: 'The Google account email must match the signed-in student account.' });
    const result = await StudentAccount.updateOne({
      email: req.studentAccount.email,
      sessionVersion: req.studentAccount.sessionVersion,
      $or: [{ googleSub: { $exists: false } }, { googleSub: null }, { googleSub: identity.googleSub }]
    }, { $set: { googleSub: identity.googleSub } }, { writeConcern: { w: 'majority' } });
    if (!result.matchedCount) return res.status(409).json({ message: 'A different Google account is already linked, or this session expired. Sign in again and retry.' });
    if (!await clearLoginSourceFailures(req, res)) return;
    return res.json({ linked: true });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'This Google account is already linked to another student account.' });
    if (error.message !== 'GOOGLE_ACCOUNT_NOT_ALLOWED' && error.message !== 'GOOGLE_CREDENTIAL_INVALID') {
      console.error('Google account linking failed:', error.name);
      return res.status(503).json({ message: 'Google account linking is temporarily unavailable.' });
    }
    if (await countLoginSourceFailure(req, res)) return;
    const messages = {
      nonce_missing: 'This Google check expired. A fresh check is being prepared; try again.',
      nonce_mismatch: 'This Google check did not match. A fresh check is being prepared; try again.',
      miu_domain_mismatch: 'Google selected an account outside MIU Workspace. Choose the MIU account ending in @miuegypt.edu.eg.',
      email_unverified: 'Google did not confirm this email address. Verify your MIU account and try again.',
      client_not_configured: 'Google sign-in is not configured correctly on this site. Contact the site administrator.',
      token_rejected: 'Google could not verify this sign-in. Try again; if it continues, the site administrator should check the Google OAuth client ID.'
    };
    return res.status(401).json({ message: messages[error.reason] || 'Google could not verify this MIU account. Try again with your university Google account.' });
  }
});

app.get('/api/student-auth/session', requireStudentAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ authenticated: true, name: req.studentAccount.name, email: req.studentAccount.email });
});

function toStudentProfile(account) {
  return {
    name: account.name || '',
    email: account.email || '',
    universityId: account.universityId || '',
    major: account.major || '',
    phone: account.phone || '',
    age: account.age || ''
  };
}

app.get('/api/student-auth/profile', requireStudentAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(toStudentProfile(req.studentAccount));
});

app.put('/api/student-auth/profile', requireStudentAuth, async (req, res) => {
  const submittedProfile = req.body || {};
  const profile = {
    name: cleanText(submittedProfile.name, 160) || req.studentAccount.name,
    universityId: cleanText(submittedProfile.universityId, 40),
    major: cleanText(submittedProfile.major, 120),
    phone: cleanText(submittedProfile.phone, 40),
    age: cleanText(submittedProfile.age, 3)
  };
  if (profile.age && (!/^\d{1,3}$/.test(profile.age) || Number(profile.age) < 16 || Number(profile.age) > 100)) {
    return res.status(422).json({ message: 'Enter an age between 16 and 100.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const updated = await StudentAccount.findOneAndUpdate(
      { email: req.studentAccount.email, sessionVersion: req.studentAccount.sessionVersion },
      { $set: profile },
      { new: true, runValidators: true, writeConcern: { w: 'majority' } }
    ).read('primary').readConcern('majority').lean();
    if (!updated) return res.status(401).json({ message: 'Your session ended. Sign in again to save your profile.' });
    if (updated.name !== profile.name || updated.universityId !== profile.universityId
      || updated.major !== profile.major || updated.phone !== profile.phone || updated.age !== profile.age) {
      return res.status(503).json({ message: 'Your profile could not be verified as saved. Please try again.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(toStudentProfile(updated));
  } catch (error) {
    console.error('Student profile save failed:', error.name);
    res.status(503).json({ message: 'Your profile was not saved. Please try again.' });
  }
});

app.post('/api/student-auth/logout', async (req, res) => {
  const secure = secureCookieSuffix(req);
  const clearedCookies = ['miu_student', 'miu_club', 'miu_admin'].map(name => `${name}=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secure}`);
  try {
    if (!mongoReady || mongoose.connection.readyState !== 1) throw new Error('DATABASE_UNAVAILABLE');
    const account = await getStudentAccountFromRequest(req);
    if (account) {
      const result = await StudentAccount.updateOne(
        { email: account.email, sessionVersion: account.sessionVersion },
        { $inc: { sessionVersion: 1 } },
        { writeConcern: { w: 'majority' } }
      );
      if (!result.modifiedCount) throw new Error('SESSION_REVOCATION_NOT_CONFIRMED');
    }
    res.setHeader('Set-Cookie', clearedCookies);
    res.status(204).end();
  } catch (error) {
    console.error('Student logout could not be verified:', error.name);
    res.setHeader('Set-Cookie', clearedCookies);
    res.status(503).json({ message: 'This browser was signed out, but the session could not be revoked on the server. Try again when the database is available.' });
  }
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
    return res.json({ authenticated: true, role: 'admin', redirect: '/admin' });
  }

  let account;
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Sign-in storage is temporarily unavailable. Please try again.' });
    account = await ClubAccount.findOne({ email }).read('primary').readConcern('majority').lean();
  } catch (error) {
    console.error('Club login failed:', error.name);
    return res.status(503).json({ message: 'Login is temporarily unavailable. Please try again shortly.' });
  }
  if (account && typeof password === 'string' && clubPasswordMatches(password, account)) {
    if (account.role?.startsWith('custom_')) {
      try { account = await require('./services/custom-staff-access').decorateCustomStaff(account); }
      catch { return res.status(503).json({ message: 'Role access is temporarily unavailable.' }); }
      if (!account) return res.status(403).json({ message: 'Your dashboard assignment is no longer active.' });
    }
    if (!await clearLoginSourceFailures(req, res)) return;
    await recordSuccessfulSignIn('club', account.email);
    setClubSessionCookie(req, res, account);
    res.append('Set-Cookie', `miu_admin=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`);
    res.append('Set-Cookie', `miu_student=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`);
    const roleRedirects = {
      software_development: '/admin',
      miu_events: '/dashboards/miu-events-dashboard.html',
      supervisor: '/dashboards/supervisor-dashboard.html',
      president: '/club-dashboard',
      vice_president: '/club-dashboard',
      head: '/club-dashboard',
      pr: '/dashboards/pr-dashboard.html',
      english: '/dashboards/english-dashboard.html',
      security: '/dashboards/security-dashboard.html',
      sso: '/dashboards/sso-dashboard.html',
      dean: '/dashboards/dean-dashboard.html',
    };
    return res.json({ authenticated: true, role: account.role, redirect: roleRedirects[account.role] || require('./services/staff-google-auth').staffRoute(account.role) || '/club-login' });
  }

  if (account) {
    if (await countLoginSourceFailure(req, res)) return;
    return res.status(401).json({ message: 'Incorrect email or password.' });
  }
  const studentAccount = mongoReady ? await StudentAccount.findOne({ email }).lean().catch((error) => {
    console.error('Student login failed:', error.name);
    return null;
  }) : null;
  if (studentAccount && typeof password === 'string' && clubPasswordMatches(password, studentAccount)) {
    if (!await clearLoginSourceFailures(req, res)) return;
    await recordSuccessfulSignIn('student', studentAccount.email);
    setStudentSessionCookie(req, res, studentAccount);
    res.append('Set-Cookie', `miu_club=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`);
    res.append('Set-Cookie', `miu_admin=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/;${secureCookieSuffix(req)}`);
    return res.json({ authenticated: true, role: 'student', redirect: '/' });
  }

  if (await countLoginSourceFailure(req, res)) return;
  return res.status(401).json({ message: 'Incorrect email or password.' });
});

app.post('/api/admin/setup', async (req, res) => {
  const replacingConfiguredAccount = hasAdminPassword();
  if (httpSecurity.production(process.env) || replacingConfiguredAccount || process.env.ALLOW_LOCAL_ADMIN_SETUP !== 'true') {
    return res.status(403).json({ message: 'Administrator setup is disabled. Use authenticated account settings for an existing administrator.' });
  }
  if (!isLoopbackRequest(req)) {
    return res.status(403).json({ message: 'Admin account setup is only allowed from this computer.' });
  }
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    return res.status(409).json({ message: 'The admin account is managed by environment settings and cannot be changed here.' });
  }
  if (!mongoReady) {
    return res.status(503).json({ message: 'The admin account was not changed because the database is unavailable. Try again after it reconnects.' });
  }

  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password, confirmPassword } = req.body;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid admin email address.' });
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 200 || password !== confirmPassword) {
    return res.status(400).json({ message: 'Use a password of at least 12 characters and confirm it correctly.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const nextSessionVersion = (Number(adminAuthState?.sessionVersion) || 0) + 1;
  const nextCredentials = {
    email,
    salt,
    passwordHash: crypto.scryptSync(password, salt, 64).toString('hex'),
    sessionSecret: adminCredentials?.sessionSecret || sessionSecret
  };
  let savedAccount = null;
  if (mongoReady) {
    const databaseSession = await mongoose.startSession();
    try {
      await databaseSession.withTransaction(async () => {
        await AdminAuthState.deleteMany({}).session(databaseSession);
        await PasswordResetToken.deleteMany({ accountType: 'admin' }).session(databaseSession);
        await AdminAuthState.create([{
          email,
          salt,
          passwordHash: nextCredentials.passwordHash,
          sessionVersion: nextSessionVersion,
          passwordChangedAt: new Date(),
          lastLoginAt: null
        }], { session: databaseSession });
      }, { writeConcern: { w: 'majority' } });
      savedAccount = await AdminAuthState.findOne({ email }).read('primary').readConcern('majority').lean();
      if (!savedAccount || !matchesScryptPassword(password, savedAccount.salt, savedAccount.passwordHash)) {
        throw new Error('ADMIN_CREDENTIAL_VERIFICATION_FAILED');
      }
    } catch (error) {
      console.error('Admin account setup could not be confirmed in the database:', error.name);
      return res.status(503).json({ message: 'The database could not confirm the final account state. Refresh the admin page and check the new login before trying again.' });
    } finally {
      await databaseSession.endSession();
    }
  }

  adminCredentials = nextCredentials;
  adminAuthState = savedAccount;
  try {
    writeJsonFile(adminCredentialsFile, adminCredentials);
  } catch (error) {
    console.error('Admin credential cache update failed:', error.name);
  }
  setAdminSessionCookie(req, res);
  res.status(replacingConfiguredAccount ? 200 : 201).json({ authenticated: true, email, savedToDatabase: true });
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
  res.setHeader('Set-Cookie', ['miu_admin=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/', 'miu_club=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/', 'miu_student=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/']);
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
  const [studentAccount, clubAccount] = await Promise.all([
    StudentAccount.findOne({ email }).select('_id').read('primary').lean(),
    ClubAccount.findOne({ email }).select('_id').read('primary').lean()
  ]);
  if (!clubAccount) return null;
  return 'club';
}

async function requestClubPasswordReset(email) {
  if (!mongoReady) throw new Error('Password recovery is temporarily unavailable. Please try again later.');
  const [studentAccount, clubAccount] = await Promise.all([
    StudentAccount.findOne({ email }).select('_id').read('primary').lean(),
    ClubAccount.findOne({ email }).select('email role').read('primary').readConcern('majority').lean()
  ]);
  if (studentAccount && !clubAccount) return { status: 'student' };
  if (!clubAccount) return { status: 'not_found' };

  const transporter = getPasswordRecoveryTransport();
  const baseUrl = getPasswordResetBaseUrl();
  if (!transporter || !baseUrl) throw new Error('Password recovery email is not configured. Ask the site administrator to configure email delivery.');

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  try {
    await PasswordResetToken.findOneAndUpdate(
      { accountType: 'club', email },
      { $set: { accountType: 'club', email, tokenHash, expiresAt } },
      { upsert: true, new: true, runValidators: true, writeConcern: { w: 'majority' } }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    await PasswordResetToken.findOneAndUpdate(
      { accountType: 'club', email },
      { $set: { tokenHash, expiresAt } },
      { new: true, runValidators: true, writeConcern: { w: 'majority' } }
    );
  }

  const savedToken = await PasswordResetToken.findOne({ accountType: 'club', email, tokenHash })
    .read('primary').readConcern('majority').lean();
  if (!savedToken || savedToken.expiresAt <= new Date()) throw new Error('The reset request could not be confirmed in the database.');

  const resetUrl = new URL('/pages/reset-password.html', baseUrl);
  resetUrl.searchParams.set('token', token);
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Reset Your MIU Club Dashboard Password',
      text: `Hello,\n\nA password reset was requested for your MIU club or dashboard account.\n\nUse this link to create and confirm a new password:\n${resetUrl.toString()}\n\nThis link expires in 20 minutes and can only be used once. If you did not request this, you can safely ignore this email.`,
      html: `<p>Hello,</p><p>A password reset was requested for your MIU club or dashboard account.</p><p><a href="${resetUrl.toString()}">Create a new password</a></p><p>This link expires in 20 minutes and can only be used once. If you did not request this, you can safely ignore this email.</p>`
    });
  } catch (error) {
    await PasswordResetToken.deleteOne({ accountType: 'club', email, tokenHash }).catch((cleanupError) => {
      console.error('Failed password reset cleanup:', cleanupError.name);
    });
    throw error;
  }
  return { status: 'sent', email };
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
        { upsert: true, new: true, runValidators: true, writeConcern: { w: 'majority' } }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      await PasswordResetToken.findOneAndUpdate(
        { accountType, email },
        { $set: { tokenHash, expiresAt } },
        { new: true, runValidators: true, writeConcern: { w: 'majority' } }
      );
    }

    const savedToken = await PasswordResetToken.findOne({ accountType, email, tokenHash })
      .read('primary').readConcern('majority').lean();
    if (!savedToken || savedToken.expiresAt <= new Date()) {
      throw new Error('PASSWORD_RESET_NOT_CONFIRMED');
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
    if (tokenRecord.accountType !== 'club') {
      await PasswordResetToken.deleteOne({ _id: tokenRecord._id });
      return res.status(422).json({ message: 'This reset link is not for a club or dashboard account. Students use Google sign-in or can contact the MIU IT Office.' });
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

        updatedAccount = await ClubAccount.findOneAndUpdate(
          { email: tokenRecord.email },
          { $set: { salt, passwordHash, passwordChangedAt: now }, $inc: { sessionVersion: 1 } },
          { new: true, session }
        ).lean();
        if (!updatedAccount || !clubPasswordMatches(newPassword, updatedAccount)) throw new Error('RESET_ACCOUNT_UNAVAILABLE');
      }, { writeConcern: { w: 'majority' } });
    } finally {
      await session.endSession();
    }

    if (updatedAccount) {
      const accountIndex = clubAccounts.findIndex((account) => account.email === updatedAccount.email);
      if (accountIndex >= 0) clubAccounts[accountIndex] = updatedAccount;
      try {
        writePrivateClubAccountsFile();
      } catch (error) {
        console.error('Club credential cache update failed:', error.name);
      }
    }
    res.json({ message: 'Password updated successfully. Your previous password is no longer valid. Sign in to the Club Dashboard with your new password.' });
  } catch (error) {
    if (error.code === 'RESET_TOKEN_UNAVAILABLE') {
      return res.status(400).json({ message: 'This password reset link is no longer valid. Please request a new one.' });
    }
    console.error('Password reset failed:', error.name);
    res.status(503).json({ message: 'Password reset is temporarily unavailable. Please try again later.' });
  }
});

registerFeedbackRoutes(app, { Club, UniversityContent, requireStudentAuth, isAdminSessionValid, getClubAccountFromRequest, requireLiveDatabase });
require('./services/quiz-analytics').registerQuizAnalytics(app, {
  requireAdmin, requireLiveDatabase, getClubs: () => clubs,
  getAccountEmail: async (req, res) => {
    const student = await getStudentAccountFromRequest(req, res, false);
    if (student) return student.email;
    const staff = await getClubAccountFromRequest(req, res);
    if (staff) return staff.email;
    return await isAdminSessionValid(req, res) ? getConfiguredAdminEmail() : '';
  }
});
app.use('/api/admin', requireAdmin);
require('./services/security-center').registerSecurityCenter(app, { requireAdmin, AuditLog });
app.get('/api/admin/login-settings', (req, res) => {
  res.json({ email: getConfiguredAdminEmail() || '',
    editable: isLoopbackRequest(req) && !(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD),
    environmentManaged: Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) });
});
require('./services/staff-account-admin').registerStaffAccountAdmin(app, {
  ClubAccount, Club, databaseReady: () => mongoReady, sameOrigin: isSameOriginRequest, isAdminEmail: emailMatches,
  refreshAccount(account) {
    const index = clubAccounts.findIndex(item => item.email === account.email);
    if (index < 0) clubAccounts.push(account); else clubAccounts[index] = account;
    writePrivateClubAccountsFile();
  },
  removeAccount(account) {
    clubAccounts = clubAccounts.filter(item => item.email !== account.email);
    writePrivateClubAccountsFile();
  }
});
require('./services/supervisor-admin').registerSupervisorAdmin(app, {
  ClubAccount, StudentAccount, Club, databaseReady: () => mongoReady, sameOrigin: isSameOriginRequest,
  isAdminEmail: emailMatches,
  removeAccount(email) {
    clubAccounts = clubAccounts.filter(account => account.email !== email);
    writePrivateClubAccountsFile();
  },
  refreshAccount(account) {
    const index = clubAccounts.findIndex(item => item.email === account.email);
    if (index < 0) clubAccounts.push(account); else clubAccounts[index] = account;
    writePrivateClubAccountsFile();
  }
});
const universityPublishingDeps = {
  UniversityContent, EventRegistration, databaseReady: () => mongoReady, sameOrigin: isSameOriginRequest, cleanText, parseInteraction,
  readCloudinaryAsset, cloudinary, cloudinaryFolders, cloudinaryConfigured,
  dispatchPublishedContentNotifications, toApiRecord, requireMiuEventsDashboard,
  actorEmail: req => req.clubAccount?.email || getConfiguredAdminEmail() || 'MIU Admin'
};
require('./services/miu-event-admin').registerMiuEventAdmin(app, universityPublishingDeps);
require('./services/report-downloads').registerReportDownloads(app, {
  Club, UniversityContent, ContentRequest, AttendanceRecord, AttendanceSession, EventRegistration, StudentAccount,
  databaseReady: () => mongoReady,
  getAccount: async req => {
    const account = await getClubAccountFromRequest(req, res);
    if (account) return account.role === 'software_development' ? { role: 'admin' } : account;
    return await isAdminSessionValid(req, res) ? { role: 'admin' } : null;
  }
});
require('./services/event-reports').registerEventReports(app, {
  getAccount: getClubAccountFromRequest, databaseReady: () => mongoReady,
  Club, EventRegistration, AttendanceRecord, sameOrigin: isSameOriginRequest
});
require('./services/supervisor-dashboard').registerSupervisorDashboard(app, {
  getAccount: getClubAccountFromRequest, databaseReady: () => mongoReady,
  Club, ContentRequest, SpeakerRequest, AttendanceRecord, AttendanceSession, EventRegistration, Review: SupervisorReview,
  sameOrigin: isSameOriginRequest, publicSpeakerRequest,
  notifyContent: notifyContentRequest, notifySpeaker: notifySpeakerWorkflow, notifyAttendance: notifyAttendanceWorkflow,
  attendanceClosureMapFor, attendanceActivityKey, isAttendanceActivityEnded
});


app.post('/api/admin/accounts/password-reset', limitPasswordResetRequests, async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid account email address.' });
  }
  try {
    const result = await requestClubPasswordReset(email);
    if (result.status === 'student') {
      return res.status(422).json({ message: 'Student accounts use Google sign-in. The student must use Google or contact the MIU IT Office.' });
    }
    if (result.status === 'not_found') {
      return res.status(404).json({ message: 'No club or dashboard account was found for this email.' });
    }
    return res.json({ message: `A password reset link was sent to ${result.email}. The account owner must use it to choose and confirm a new password.` });
  } catch (error) {
    console.error('Admin password reset request failed:', error.name);
    return res.status(503).json({ message: error.message || 'The reset request could not be confirmed. Please try again.' });
  }
});

app.post('/api/admin/accounts/password', limitPasswordResetRequests, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password, confirmPassword } = req.body;
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid club or dashboard email address.' });
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    return res.status(400).json({ message: 'Use a password between 12 and 200 characters.' });
  }
  if (password !== confirmPassword) return res.status(400).json({ message: 'The passwords do not match.' });
  if (!requireLiveDatabase(res)) return;

  try {
    const studentAccount = await StudentAccount.findOne({ email }).select('_id').read('primary').lean();
    if (studentAccount && !await ClubAccount.exists({ email })) {
      return res.status(422).json({ message: 'Student accounts use Google sign-in. They cannot have a portal password set here; contact the MIU IT Office for access help.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
    const updatedAccount = await ClubAccount.findOneAndUpdate(
      { email },
      { $set: { salt, passwordHash, passwordChangedAt: new Date() }, $inc: { sessionVersion: 1 } },
      { new: true, runValidators: true, writeConcern: { w: 'majority' } }
    ).read('primary').readConcern('majority').lean();
    if (!updatedAccount) return res.status(404).json({ message: 'No club or dashboard account was found for this email.' });

    const verifiedAccount = await ClubAccount.findOne({ email }).read('primary').readConcern('majority').lean();
    if (!verifiedAccount || verifiedAccount.passwordHash !== passwordHash || verifiedAccount.salt !== salt
      || !clubPasswordMatches(password, verifiedAccount)) {
      return res.status(503).json({ message: 'The database could not confirm the new password. Do not treat it as saved; try again after checking the account.' });
    }

    const accountIndex = clubAccounts.findIndex((account) => account.email === email);
    if (accountIndex >= 0) clubAccounts[accountIndex] = verifiedAccount;
    writePrivateClubAccountsFile();
    return res.json({ message: 'The new password was saved and verified in the database. Share it with the account owner through a secure channel.' });
  } catch (error) {
    console.error('Admin direct account password update failed:', error.name);
    return res.status(503).json({ message: 'The password was not confirmed in the database. Please try again.' });
  }
});

require('./services/university-content-admin').registerUniversityContentAdmin(app, universityPublishingDeps, '/api/admin/university-content');

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
        .select('visitorId deviceType deviceName browserName accountType accountEmail accountName accountLabel lastSeenAt')
        .sort({ lastSeenAt: -1 }).lean(),
    ]);
    const presenceRecords = activeRecords.length
      ? await SiteVisitorPresence.find({
        visitorId: { $in: activeRecords.map((record) => record.visitorId) },
        expiresAt: { $gt: new Date() }
      }).select('visitorId ipAddress').lean()
      : [];
    const ipByVisitor = new Map(presenceRecords.map((record) => [record.visitorId, record.ipAddress]));
    const peopleByIdentity = new Map();
    for (const record of activeRecords) {
      const accountType = record.accountType || 'guest';
      const accountEmail = String(record.accountEmail || '').toLowerCase();
      const identityKey = accountType !== 'guest' && accountEmail ? `account:${accountEmail}` : `guest:${record.visitorId}`;
      let person = peopleByIdentity.get(identityKey);
      if (!person) {
        const deviceCode = createVisitorDeviceCode(record.visitorId);
        person = {
          accountType,
          name: record.accountName || (accountType === 'guest' ? `Device ${deviceCode}` : 'Signed-in account'),
          email: accountEmail,
          label: record.accountLabel || (accountType === 'guest' ? 'Not signed in' : 'Signed in'),
          deviceType: record.deviceType || 'unknown',
          deviceName: record.deviceName || 'Unknown device',
          browserName: record.browserName || 'Unknown browser',
          deviceCode,
          ipAddress: ipByVisitor.get(record.visitorId) || '',
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
    return res.status(503).json({ message: 'The database is not connected. Live database totals are unavailable.' });
  }

  try {
    const [
      totalClubs, activeClubs, archivedClubs, clubContent, applicationsByStatus,
      contentByType, contentByStatus, attendanceByStatus, eventRegistrations,
      attendanceSessions, clubAccounts, studentAccounts, studentEmailCodes,
      passwordResetTokens, loginAttempts, auditLogs, siteSettings, adminAccounts,
      namedMemberProfiles, memberTotals, acceptedMemberProfiles
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
      Club.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ['$members', 0] } } } }]),
      Application.countDocuments({ status: 'accepted' })
    ]);

    const countMap = (rows) => Object.fromEntries(rows.map((row) => [row._id || 'unknown', row.count]));
    const embeddedContent = clubContent[0] || { events: 0, booths: 0, posts: 0, sponsors: 0 };
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      checkedAt: new Date().toISOString(),
      database: { connected: true, state: 'connected' },
      sections: [
        { title: 'Clubs and homepage', count: totalClubs, detail: `${activeClubs} active · ${archivedClubs} archived`, methods: 'GET /api/clubs · GET/PUT /api/admin/homepage · POST /api/admin/clubs · PATCH /api/admin/clubs/:id · archive/restore/order routes' },
        { title: 'Club members', count: (namedMemberProfiles[0]?.count || 0) + acceptedMemberProfiles, detail: `${(memberTotals[0]?.total || 0) + acceptedMemberProfiles} total members across club rosters, including accepted applicants`, methods: 'GET /api/admin/club-members · GET/POST /api/club/members (club login required)' },
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
    const [clubRecords, registrations, attendance, studentInterests] = await Promise.all([
      Club.find({ archivedAt: null }).select('id name events').sort({ name: 1 }).lean(),
      EventRegistration.find({}).select('clubId eventIndex eventTitle').lean(),
      AttendanceRecord.find({ itemType: 'event' }).select('clubId eventRequestId eventTitle').lean(),
      StudentInterest.find({}).select('clubId eventIndex registered').read('primary').readConcern('majority').lean()
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
    const studentInterestCounts = new Map();
    const studentRegistrationCounts = new Map();
    for (const interest of studentInterests) {
      const key = `${Number(interest.clubId)}:${Number(interest.eventIndex)}`;
      studentInterestCounts.set(key, (studentInterestCounts.get(key) || 0) + 1);
      if (interest.registered) studentRegistrationCounts.set(key, (studentRegistrationCounts.get(key) || 0) + 1);
    }
    const events = clubRecords.flatMap((club) => (Array.isArray(club.events) ? club.events : []).map((event, eventIndex) => {
      const title = String(event.title || 'Untitled event');
      const eventKey = `${Number(club.id)}:${eventIndex}`;
      const requestId = Number(event.requestId);
      const checkIns = requestId > 0
        ? attendanceCounts.get(`${Number(club.id)}:request:${requestId}`) || 0
        : attendanceCounts.get(`${Number(club.id)}:${title.trim().toLocaleLowerCase()}`) || 0;
      return {
        clubId: Number(club.id), clubName: club.name || 'Club', eventIndex,
        title, date: String(event.date || ''),
        views: Math.max(0, Number(eventViews[requestId > 0 ? `${Number(club.id)}:request:${requestId}` : `${Number(club.id)}:${eventIndex}`]) || 0),
        registrations: registrationCounts.get(eventKey) || 0,
        studentInterest: studentInterestCounts.get(eventKey) || 0,
        studentRegistrations: studentRegistrationCounts.get(eventKey) || 0,
        checkIns
      };
    }));
    res.setHeader('Cache-Control', 'no-store');
    const totals = events.reduce((total, event) => ({
        views: total.views + event.views,
        registrations: total.registrations + event.registrations,
        checkIns: total.checkIns + event.checkIns
      }), { views: 0, registrations: 0, checkIns: 0 });
    totals.studentsInterested = new Set(studentInterests.map((interest) => interest.studentEmail)).size;
    res.json({
      totals,
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
    if (!requireLiveDatabase(res)) return;
    res.setHeader('Cache-Control', 'no-store');
    const records = (await Club.find({ archivedAt: { $ne: null } }).read('primary').readConcern('majority')
      .sort({ archivedAt: -1, name: 1 }).lean()).map(toApiRecord);
    res.json(records);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'Could not load archived clubs right now.' });
  }
});

app.post('/api/admin/clubs/import/cleanup', async (req, res) => {
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'Reload the page and try again.' });
  const publicIds = Array.isArray(req.body?.publicIds) ? [...new Set(req.body.publicIds)] : [];
  const isTemporaryClubImageId = id => typeof id === 'string'
    && new RegExp(`^${cloudinaryFolders.club}/${cloudinaryFolders.club}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, 'i').test(id);
  if (publicIds.length > 2000 || publicIds.some(id => !isTemporaryClubImageId(id))) {
    return res.status(400).json({ message: 'Invalid temporary image list.' });
  }
  if (cloudinaryConfigured) await Promise.all(publicIds.map(id => cloudinary.uploader.destroy(id, { resource_type: 'image' }).catch(() => null)));
  return res.json({ cleaned: publicIds.length });
});

const clubImportUndoAction = 'club_import_undo_state';
const clubImportUndoService = require('./services/club-import-undo');
const clubImportUndoFields = club => ({ name: club.name, category: club.category, description: club.description,
  image: club.image, imagePublicId: club.imagePublicId || '', updatedAt: club.updatedAt || null });
const clubImportUndoId = () => crypto.randomUUID();
const clubImportUndoAuditId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

app.get('/api/admin/clubs/import/undo/latest', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireLiveDatabase(res)) return;
  try {
    const record = (await AuditLog.find({ action: clubImportUndoAction }).sort({ timestamp: -1 }).limit(1).read('primary').lean())[0];
    if (!record) return res.json({ available: false });
    const snapshot = clubImportUndoService.open(record.details, sessionSecret);
    if (snapshot.undoneAt || snapshot.supersededAt) return res.json({ available: false });
    return res.json({ available: true, importId: record.targetId, imported: snapshot.clubs.length,
      timestamp: record.timestamp, hasRoleChanges: snapshot.accounts.length > 0 });
  } catch (error) {
    console.error('Club import undo status failed:', error.name);
    return res.status(503).json({ message: 'Undo status is temporarily unavailable.' });
  }
});

app.post('/api/admin/clubs/import/undo', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'Reload the page and try again.' });
  if (!requireLiveDatabase(res)) return;
  const importId = typeof req.body?.importId === 'string' ? req.body.importId : '';
  if (!/^[0-9a-f-]{36}$/i.test(importId)) return res.status(400).json({ message: 'Choose a valid import to undo.' });
  const removedImages = [];
  try {
    const record = await AuditLog.findOne({ action: clubImportUndoAction, targetId: importId }).read('primary').lean();
    if (!record) return res.status(404).json({ message: 'This import is no longer available to undo.' });
    const snapshot = clubImportUndoService.open(record.details, sessionSecret);
    const latest = (await AuditLog.find({ action: clubImportUndoAction }).sort({ timestamp: -1 }).limit(1).read('primary').lean())[0];
    if (latest?.targetId !== importId || snapshot.undoneAt || snapshot.supersededAt) {
      return res.status(409).json({ message: 'Only the latest completed import can be undone. A later import has replaced this undo option.' });
    }
    const session = await mongoose.startSession();
    const restoredClubs = [], deletedClubIds = [];
    const restoredAccounts = new Map();
    try {
      session.startTransaction({ writeConcern: { w: 'majority' } });
      for (const entry of snapshot.clubs) {
        const current = await Club.findOne({ id: entry.id }).session(session).lean();
        if (!current || clubImportUndoService.fingerprint(clubImportUndoFields(current)) !== entry.afterFingerprint) {
          throw Object.assign(new Error(`Club ${entry.after.name} changed after this import. Reload the dashboard; the undo was not applied.`), { status: 409 });
        }
        if (!entry.before) {
          const [applications, content, registrations, attendanceSessions, attendanceAssignments, attendanceRecords, speakers, invites, interests] = await Promise.all([
            Application.countDocuments({ clubId: entry.id }).session(session), ContentRequest.countDocuments({ clubId: entry.id }).session(session),
            EventRegistration.countDocuments({ clubId: entry.id }).session(session), AttendanceSession.countDocuments({ clubId: entry.id }).session(session),
            AttendanceAssignment.countDocuments({ clubId: entry.id }).session(session), AttendanceRecord.countDocuments({ clubId: entry.id }).session(session),
            SpeakerRequest.countDocuments({ clubId: entry.id }).session(session), SpeakerInvite.countDocuments({ clubId: entry.id }).session(session),
            StudentInterest.countDocuments({ clubId: entry.id }).session(session)
          ]);
          if (applications + content + registrations + attendanceSessions + attendanceAssignments + attendanceRecords + speakers + invites + interests > 0) {
            throw Object.assign(new Error(`${entry.after.name} has new activity since the import, so it was kept. No undo changes were applied.`), { status: 409 });
          }
        }
      }
      for (const entry of snapshot.accounts) {
        const current = await ClubAccount.findOne({ email: entry.email }).session(session).lean();
        const fingerprint = current ? clubImportUndoService.fingerprint(current) : null;
        if (fingerprint !== entry.afterFingerprint) {
          throw Object.assign(new Error(`The club account ${entry.email} changed after import. No undo changes were applied.`), { status: 409 });
        }
      }
      for (const entry of snapshot.clubs) {
        if (entry.before) {
          const restored = await Club.findOneAndUpdate({ id: entry.id }, { $set: entry.before }, { new: true, runValidators: true, session }).lean();
          if (!restored) throw Object.assign(new Error(`Could not restore ${entry.before.name}.`), { status: 409 });
          restoredClubs.push(restored);
        } else {
          const result = await Club.deleteOne({ id: entry.id }, { session });
          if (!result.deletedCount) throw Object.assign(new Error(`Could not remove newly imported club ${entry.after.name}.`), { status: 409 });
          deletedClubIds.push(entry.id);
        }
        if (entry.after.imagePublicId && entry.after.imagePublicId !== entry.before?.imagePublicId) removedImages.push(entry.after.imagePublicId);
      }
      for (const entry of snapshot.accounts) {
        await ClubAccount.deleteOne({ email: entry.email }, { session });
        if (entry.before) {
          const [restored] = await ClubAccount.create([entry.before], { session });
          restoredAccounts.set(entry.email, restored?.toObject ? restored.toObject() : restored);
        } else restoredAccounts.set(entry.email, null);
      }
      snapshot.undoneAt = new Date().toISOString();
      await AuditLog.findOneAndUpdate({ id: record.id }, { $set: { details: clubImportUndoService.seal(snapshot, sessionSecret) } }, { new: true, session }).lean();
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally { await session.endSession(); }

    for (const id of deletedClubIds) {
      const index = clubs.findIndex(club => Number(club.id) === Number(id));
      if (index >= 0) clubs.splice(index, 1);
    }
    for (const restored of restoredClubs) {
      const index = clubs.findIndex(club => Number(club.id) === Number(restored.id));
      if (index < 0) clubs.push(restored); else clubs[index] = restored;
    }
    for (const [email, account] of restoredAccounts) {
      const index = clubAccounts.findIndex(item => item.email === email);
      if (!account) { if (index >= 0) clubAccounts.splice(index, 1); }
      else if (index < 0) clubAccounts.push(account); else clubAccounts[index] = account;
    }
    if (cloudinaryConfigured) await Promise.all([...new Set(removedImages)].map(id => cloudinary.uploader.destroy(id, { resource_type: 'image' }).catch(() => null)));
    return res.json({ undone: snapshot.clubs.length, message: `Restored ${snapshot.clubs.length} clubs to their pre-import state.` });
  } catch (error) {
    console.error('Club spreadsheet undo failed:', error.name);
    return res.status(error.status || 503).json({ message: error.status ? error.message : 'The import could not be safely undone.' });
  }
});

app.post('/api/admin/clubs/import', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'Reload the page and try again.' });
  if (!requireLiveDatabase(res)) return;
  const { assignNewClubRole, removeClubRoleAssignment } = require('./services/new-club-accounts');
  const records = req.body?.records;
  if (!Array.isArray(records) || !records.length || records.length > 25) {
    return res.status(400).json({ message: 'Import requests are limited to 25 club rows. The admin tool splits larger workbooks into safe batches.' });
  }
  const normalizeName = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  const knownClubAliases = new Map([['miu theatre','theater'],['tuners','tunners'],['ieee miu sb','ieee'],['miu-munal','mun']]);
  const importKey = name => knownClubAliases.get(normalizeName(name)) || normalizeName(name);
  const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/i.test(value.trim());
  const isTemporaryClubImageId = id => typeof id === 'string'
    && new RegExp(`^${cloudinaryFolders.club}/${cloudinaryFolders.club}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, 'i').test(id);
  const names = new Set();
  const uploadedIds = records.map(item => item?.image?.publicId).filter(id => typeof id === 'string');
  const importId = typeof req.body?.importId === 'string' && /^[0-9a-f-]{36}$/i.test(req.body.importId) ? req.body.importId : clubImportUndoId();
  let committed = false;
  let commitAttempted = false;
  try {
    const normalized = [];
    for (let index = 0; index < records.length; index += 1) {
      const row = records[index] || {};
      const rowNumber = Number.isSafeInteger(row.rowNumber) && row.rowNumber >= 2 && row.rowNumber <= 1048576 ? row.rowNumber : index + 2;
      const rawName = typeof row.name === 'string' ? row.name.trim() : '';
      const name = cleanText(rawName, 80);
      const key = importKey(name);
      if (!key || rawName.length > 80 || names.has(key)) throw Object.assign(new Error(`Club name is empty, longer than 80 characters, or duplicated at data row ${rowNumber}.`), { status: 400 });
      names.add(key);
      const presidentEmail = String(row.presidentEmail || '').trim().toLowerCase();
      const vicePresidentEmail = String(row.vicePresidentEmail || '').trim().toLowerCase();
      const presidentName = cleanText(row.presidentName, 120);
      const vicePresidentName = cleanText(row.vicePresidentName, 120);
      if (!name || presidentEmail && (!validEmail(presidentEmail) || String(row.presidentName || '').trim().length > 120)
        || vicePresidentEmail && (!validEmail(vicePresidentEmail) || String(row.vicePresidentName || '').trim().length > 120)
        || presidentEmail && vicePresidentEmail && presidentEmail === vicePresidentEmail) {
        throw Object.assign(new Error(`Check the supplied President/Vice President names and MIU emails on data row ${rowNumber}.`), { status: 400 });
      }
      if (emailMatches(presidentEmail) || emailMatches(vicePresidentEmail)) {
        throw Object.assign(new Error(`A club manager email on data row ${rowNumber} cannot be the configured admin account.`), { status: 400 });
      }
      const category = cleanText(row.category, 80);
      const description = cleanText(row.description, 1200);
      if (!description || !row.image || typeof row.image.url !== 'string' || !isTemporaryClubImageId(row.image.publicId)) {
        throw Object.assign(new Error(`Description and an embedded club image are required on data row ${rowNumber}.`), { status: 400 });
      }
      const image = await readCloudinaryAsset(row.image.url, row.image.publicId, cloudinaryFolders.club);
      if (!image) throw Object.assign(new Error(`The club image could not be verified on data row ${rowNumber}. Upload it again and retry.`), { status: 400 });
      const newDetails = row.newClub && typeof row.newClub === 'object' ? row.newClub : row;
      normalized.push({ name, category, description, image, presidentEmail, vicePresidentEmail,
        presidentName, vicePresidentName,
        newClub: {
          committee: cleanText(newDetails.committee, 100) || name,
          tagline: cleanText(newDetails.tagline, 140) || description.slice(0, 140),
          requirements: cleanText(newDetails.requirements, 600) || 'Contact the club for current application requirements.'
        } });
    }

    const currentClubs = await Club.find({}).select('id name archivedAt image imagePublicId sortOrder members memberRoster committeeAvailability applicants applicationFields').read('primary').lean();
    const byName = new Map(currentClubs.map(club => [normalizeName(club.name), club]));
    const findClubByImportName = name => byName.get(normalizeName(name)) || byName.get(importKey(name)) || null;
    for (const row of normalized) {
      const match = findClubByImportName(row.name);
      if (match?.archivedAt) throw Object.assign(new Error(`${row.name} is archived. Restore it before importing.`), { status: 409 });
    }

    const savedAccounts = [];
    const changedAccounts = new Map();
    const importedClubs = [];
    const preparedRows = [];
    const undoClubs = [];
    const accountBefore = new Map();
    const captureAccount = async (email, session) => {
      if (!email || accountBefore.has(email)) return;
      accountBefore.set(email, await ClubAccount.findOne({ email }).session(session).lean());
    };
    const session = await mongoose.startSession();
    try {
      session.startTransaction({ writeConcern: { w: 'majority' } });
      let nextId = (Math.max(0, ...currentClubs.map(club => Number(club.id) || 0))) + 1;
      for (const row of normalized) {
        let club = findClubByImportName(row.name);
        if (club) {
          const before = clubImportUndoFields(club);
          const previousNameKey = normalizeName(club.name);
          const clubUpdate = { name: row.name, description: row.description, image: row.image.url, imagePublicId: row.image.publicId };
          if (row.category) clubUpdate.category = row.category;
          const updated = await Club.findOneAndUpdate({ id: club.id, archivedAt: null }, { $set: clubUpdate }, { new: true, runValidators: true, session }).lean();
          if (!updated) throw Object.assign(new Error(`Could not update ${row.name}.`), { status: 409 });
          club = updated;
          if (previousNameKey !== normalizeName(row.name)) byName.delete(previousNameKey);
          const after = clubImportUndoFields(club);
          undoClubs.push({ id: club.id, before, after, afterFingerprint: clubImportUndoService.fingerprint(after) });
        } else {
          const payload = { name: row.name, category: row.category || 'Other', description: row.description,
            committee: row.newClub.committee, tagline: row.newClub.tagline, requirements: row.newClub.requirements,
            imageUrl: row.image.url, imagePublicId: row.image.publicId, status: 'open' };
          club = await makeClub(payload, null, nextId, row.image);
          if (!club) throw Object.assign(new Error(`Complete the new-club details for ${row.name}.`), { status: 400 });
          club.applicationCycleStartedAt = new Date();
          club.createdAt = new Date(); club.updatedAt = club.createdAt;
          const [createdClub] = await Club.create([club], { session });
          if (createdClub) club = createdClub.toObject ? createdClub.toObject() : createdClub;
          const after = clubImportUndoFields(club);
          undoClubs.push({ id: club.id, before: null, after, afterFingerprint: clubImportUndoService.fingerprint(after) });
          nextId += 1;
        }
        byName.set(normalizeName(row.name), club);
        importedClubs.push(club);
        preparedRows.push({ row, club });
      }
      // Remove obsolete assignments for every imported club before adding any new
      // assignments. This lets an officer move between clubs within one workbook
      // without the spreadsheet row order causing a false role conflict.
      for (const { row, club } of preparedRows) {
        for (const [role, email] of [['president', row.presidentEmail], ['vice_president', row.vicePresidentEmail]]) {
          if (!email) continue;
          const currentRoleAccounts = await ClubAccount.find({ $or: [
            { roleAssignments: { $elemMatch: { role, clubId: club.id } } },
            { role, clubId: club.id }
          ] }).session(session).lean();
          for (const account of currentRoleAccounts) {
            if (account.email === email) continue;
            await captureAccount(account.email, session);
            const result = await removeClubRoleAssignment({ ClubAccount, session, email: account.email, clubId: club.id, role });
            if (result.removed) changedAccounts.set(account.email, result.account);
          }
        }
      }
      for (const { row, club } of preparedRows) {
        if (row.presidentEmail) { await captureAccount(row.presidentEmail, session); savedAccounts.push(await assignNewClubRole({ ClubAccount, session, email: row.presidentEmail, clubId: club.id, role: 'president' })); }
        if (row.vicePresidentEmail) { await captureAccount(row.vicePresidentEmail, session); savedAccounts.push(await assignNewClubRole({ ClubAccount, session, email: row.vicePresidentEmail, clubId: club.id, role: 'vice_president' })); }
      }
      const undoAccounts = [];
      for (const [email, before] of accountBefore) {
        const after = await ClubAccount.findOne({ email }).session(session).lean();
        undoAccounts.push({ email, before, afterFingerprint: after ? clubImportUndoService.fingerprint(after) : null });
      }
      const currentUndo = await AuditLog.findOne({ action: clubImportUndoAction, targetId: importId }).session(session).lean();
      const latestUndo = (await AuditLog.find({ action: clubImportUndoAction }).sort({ timestamp: -1 }).limit(1).session(session).lean())[0];
      let undoSnapshot = currentUndo ? clubImportUndoService.open(currentUndo.details, sessionSecret) : { version: 1, clubs: [], accounts: [] };
      if (latestUndo && latestUndo.targetId !== importId) {
        try {
          const priorSnapshot = clubImportUndoService.open(latestUndo.details, sessionSecret);
          if (!priorSnapshot.undoneAt && !priorSnapshot.supersededAt) {
            priorSnapshot.supersededAt = new Date().toISOString();
            await AuditLog.findOneAndUpdate({ id: latestUndo.id }, { $set: { details: clubImportUndoService.seal(priorSnapshot, sessionSecret) } }, { new: true, session }).lean();
          }
        } catch (error) { console.error('Previous club import undo could not be retired:', error.name); }
      }
      undoSnapshot.clubs.push(...undoClubs);
      for (const entry of undoAccounts) {
        const existing = undoSnapshot.accounts.findIndex(item => item.email === entry.email);
        if (existing < 0) undoSnapshot.accounts.push(entry);
        else undoSnapshot.accounts[existing].afterFingerprint = entry.afterFingerprint;
      }
      const sealedUndo = clubImportUndoService.seal(undoSnapshot, sessionSecret);
      if (currentUndo) {
        await AuditLog.findOneAndUpdate({ id: currentUndo.id }, { $set: { details: sealedUndo, timestamp: new Date() } }, { new: true, session }).lean();
      } else {
        const [undoRecord] = await AuditLog.create([{ id: clubImportUndoAuditId(), actorEmail: adminAuthState?.email || getConfiguredAdminEmail() || 'admin',
          actorRole: 'admin', action: clubImportUndoAction, targetType: 'club_import', targetId: importId,
          targetName: `Import of ${undoSnapshot.clubs.length} clubs`, details: sealedUndo, timestamp: new Date() }], { session });
        if (!undoRecord) throw Object.assign(new Error('Could not save an undo point for this import.'), { status: 503 });
      }
      commitAttempted = true;
      await session.commitTransaction();
      committed = true;
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally { await session.endSession(); }

    for (const club of importedClubs) {
      const index = clubs.findIndex(item => Number(item.id) === Number(club.id));
      if (index < 0) clubs.push(club); else clubs[index] = club;
    }
    for (const [email, account] of changedAccounts) {
      const index = clubAccounts.findIndex(item => item.email === email);
      if (!account) { if (index >= 0) clubAccounts.splice(index, 1); }
      else if (index < 0) clubAccounts.push(account); else clubAccounts[index] = account;
    }
    for (const account of savedAccounts) {
      const index = clubAccounts.findIndex(item => item.email === account.email);
      if (index < 0) clubAccounts.push(account); else clubAccounts[index] = account;
    }
    const priorUndo = (await AuditLog.find({ action: clubImportUndoAction }).sort({ timestamp: -1 }).limit(2).read('primary').lean())
      .find(entry => entry.targetId !== importId);
    if (priorUndo) {
      try {
        const priorSnapshot = clubImportUndoService.open(priorUndo.details, sessionSecret);
        const supersededImageIds = new Set(priorSnapshot.clubs.map(entry => entry.before?.imagePublicId).filter(Boolean));
        const currentImageIds = new Set(normalized.map(row => row.image.publicId));
        if (cloudinaryConfigured) await Promise.all([...supersededImageIds].filter(id => !currentImageIds.has(id))
          .map(id => cloudinary.uploader.destroy(id, { resource_type: 'image' }).catch(() => null)));
      } catch (error) { console.error('Superseded club images could not be removed:', error.name); }
    }
    try { writePrivateClubAccountsFile(); } catch (error) { console.error('Club credential cache update failed:', error.name); }
    return res.json({ imported: importedClubs.length, created: importedClubs.filter(club => !currentClubs.some(old => old.id === club.id)).length,
      updated: importedClubs.filter(club => currentClubs.some(old => old.id === club.id)).length,
      rowResults: importedClubs.map((club, index) => ({ rowNumber: Number.isSafeInteger(records[index]?.rowNumber) && records[index].rowNumber >= 2 && records[index].rowNumber <= 1048576 ? records[index].rowNumber : index + 2,
        name: club.name, clubId: club.id, status: currentClubs.some(old => old.id === club.id) ? 'updated' : 'inserted',
        reason: currentClubs.some(old => old.id === club.id) ? 'Updated the existing club matched by name; no duplicate was inserted.' : 'Inserted a new club.' })),
      rolesAssigned: savedAccounts.length, undoAvailable: true, importId,
      message: `Imported ${importedClubs.length} clubs and verified ${savedAccounts.length} dashboard role assignments.` });
  } catch (error) {
    // A lost commit acknowledgement is ambiguous. Keep images in that case so
    // a committed club can never be left pointing at a deleted asset.
    if (!committed && !commitAttempted) await Promise.all(uploadedIds.map(id => {
      if (cloudinaryConfigured && isTemporaryClubImageId(id)) {
        return cloudinary.uploader.destroy(id, { resource_type: 'image' }).catch(() => {});
      }
      return Promise.resolve();
    }));
    console.error('Club spreadsheet import failed:', error.name, error.code || error.originalError?.code || '', error.message || error.originalError?.message || '');
    return res.status(error.status || 503).json({
      message: error.status ? error.message : 'The import could not be confirmed. Reload and check the clubs before retrying.',
      commitUncertain: commitAttempted || committed
    });
  }
});

app.get('/api/admin/applications', async (req, res) => {
  try {
    if (!requireLiveDatabase(res)) return;
    const records = (await Application.find().read('primary').readConcern('majority').sort({ id: -1 }).lean())
      .map(toApiRecord);
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
    const previousApplication = await Application.findOne({ id: appId }).select('status').lean();
    if (!previousApplication) return res.status(404).json({ message: 'Application not found.' });
    const updated = await Application.findOneAndUpdate({ id: appId }, { $set: updates }, { new: true }).lean();
    if (!updated) return res.status(404).json({ message: 'Application not found.' });
    const cached = applications.find((item) => item.id === appId);
    if (cached) Object.assign(cached, updates);
    if (status === 'accepted' && previousApplication.status !== 'accepted') {
      await dispatchAcceptedApplicationPush(updated);
    }
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
    await removeApplicantPhoto(applications[applicationIndex].photoPublicId);
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

require('./services/admin-dashboard-pages').registerAdminDashboardPages(app, { root: __dirname, requireAdmin, Club });
require('./services/admin-dashboard-live').registerAdminDashboardLive(app, {
  database: mongoose, requireAdmin, sessionSecret, ready: () => mongoReady && mongoose.connection.readyState === 1
});

app.get('/dashboards/miu-events-dashboard.html', requireMiuEventsDashboard, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'dashboards', 'miu-events-dashboard.html'));
});

app.get('/api/admin/homepage', async (req, res) => {
  try {
    if (!requireLiveDatabase(res)) return;
    const settings = await SiteSetting.findOne({ key: 'homepage' }).read('primary').readConcern('majority').lean();
    res.json(settings
      ? { title: settings.title, subtitle: settings.subtitle }
      : { title: 'University Clubs', subtitle: 'Explore all clubs and apply to the ones that match your interests.' });
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
  let nextId;
  const { validateNewClubEmails, assignNewClubRole } = require('./services/new-club-accounts');
  const validatedEmails = validateNewClubEmails(req.body, emailMatches);
  if (validatedEmails.error) return res.status(400).json({ message: validatedEmails.error });
  const { presidentEmail, supervisorEmail } = validatedEmails;

  if (!requireLiveDatabase(res)) return;
  let club;
  try {
    const normalizeClubName = (value) => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
    const requestedName = normalizeClubName(req.body?.name);
    if (requestedName) {
      const existingClubs = await Club.find().select('id name archivedAt').lean();
      const duplicate = existingClubs.find((item) => normalizeClubName(item.name) === requestedName);
      if (duplicate) {
        const archived = Boolean(duplicate.archivedAt);
        return res.status(409).json({
          code: 'CLUB_ALREADY_EXISTS',
          existingClubId: duplicate.id,
          archived,
          message: archived
            ? `A club named “${String(duplicate.name).trim()}” already exists in Archived clubs. Restore or edit it instead of creating a duplicate.`
            : `A club named “${String(duplicate.name).trim()}” already exists. Open it from Club management to edit it instead of creating a duplicate.`
        });
      }
    }
    const lastClub = await Club.findOne().sort({ id: -1 }).select('id').lean();
    nextId = (Number(lastClub?.id) || 0) + 1;
    club = await makeClub(req.body, null, nextId);
    if (!club) {
      return res.status(400).json({ message: 'Complete the required fields and upload a valid image.' });
    }
    if (club.status === 'open') club.applicationCycleStartedAt = new Date();
    const savedAccounts = [];
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      await Club.create([club], { session });
      savedAccounts.push(await assignNewClubRole({ ClubAccount, session, email: presidentEmail, clubId: nextId, role: 'president' }));
      if (supervisorEmail) savedAccounts.push(await assignNewClubRole({ ClubAccount, session, email: supervisorEmail, clubId: nextId, role: 'supervisor' }));
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally {
      await session.endSession();
    }
    clubs.push(club);
    for (const account of savedAccounts) {
      const index = clubAccounts.findIndex(item => item.email === account.email);
      if (index >= 0) clubAccounts[index] = account; else clubAccounts.push(account);
    }
    try {
      writePrivateClubAccountsFile();
    } catch (error) {
      console.error('Club credential cache update failed:', error.name);
    }
    await notifyClubOpening(null, club);
    res.status(201).json(club);
  } catch (error) {
    if (club) await removeClubImage(club);
    console.error('Database operation failed:', error.name);
    if (error.status === 409) return res.status(409).json({ message: error.message });
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

  let previousClub = clubs[clubIndex];
  let updatedClub;
  try {
    if (!requireLiveDatabase(res)) return;
    previousClub = await Club.findOne({ id: clubId }).read('primary').lean();
    if (!previousClub) return res.status(404).json({ message: 'Club not found.' });
    updatedClub = await makeClub(req.body, previousClub, clubId);
    if (!updatedClub) {
      return res.status(400).json({ message: 'Complete the required fields and upload a valid image.' });
    }
    updatedClub.applicationCycleStartedAt = updatedClub.status === 'open' && previousClub.status !== 'open'
      ? new Date() : previousClub.applicationCycleStartedAt || null;
    const savedClub = await Club.findOneAndUpdate({ id: clubId, status: previousClub.status }, { $set: updatedClub },
      { new: true, writeConcern: { w: 'majority' } });
    if (!savedClub) return res.status(409).json({ message: 'Club status changed. Refresh and try again.' });
    clubs[clubIndex] = updatedClub;
    if (previousClub.image !== updatedClub.image) await removeClubImage(previousClub);
    await notifyClubOpening(previousClub.status, updatedClub);
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
    if (!requireLiveDatabase(res)) return;
    const records = (await Application.find({ clubId, ...(req.clubAccount.role === 'head' ? { committee: req.clubAccount.committee } : {}) })
      .read('primary').readConcern('majority').sort({ id: 1 }).lean()).map(toApiRecord);
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
    if (!requireLiveDatabase(res)) return;
    const filtered = (await Application.find({ clubId, ...(req.clubAccount.role === 'head' ? { committee: req.clubAccount.committee } : {}) })
      .read('primary').readConcern('majority').sort({ id: 1 }).lean()).map(toApiRecord);
    res.json(filtered);
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.get('/api/applications', requireAdmin, async (req, res) => {
  try {
    if (!requireLiveDatabase(res)) return;
    const records = (await Application.find().read('primary').readConcern('majority').sort({ id: 1 }).lean())
      .map(toApiRecord);
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
    if (!requireLiveDatabase(res)) return;
    selectedClub = await Club.findOne({ id: clubId, archivedAt: null }).read('primary').readConcern('majority').lean();
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
  if (!committee || !getManagedCommittees(clubId).includes(committee)) {
    return res.status(409).json({ message: 'This committee is not accepting applications yet.' });
  }
  const committeeStatus = getCommitteeApplicationStatus(selectedClub, committee);
  if (committeeStatus !== 'open') {
    return res.status(409).json({ message: committeeStatus === 'full'
      ? 'This committee is full and is not accepting applications.'
      : 'This committee is closed and is not accepting applications.' });
  }

  const applicantEmail = cleanText(payload.email, 254).toLowerCase();
  let signedInStudent = null;
  try {
    signedInStudent = await getStudentAccountFromRequest(req, res);
    const duplicateIdentityFilters = [{ email: applicantEmail }];
    if (signedInStudent) {
      duplicateIdentityFilters.push(
        { studentAccountId: signedInStudent._id },
        { email: String(signedInStudent.email || '').trim().toLowerCase() }
      );
    }
    const existingApplication = await Application.findOne({ clubId, status: { $ne: 'removed' }, $or: duplicateIdentityFilters })
      .select('id').read('primary').readConcern('majority').lean();
    if (existingApplication) {
      return res.status(409).json({ message: 'You have already submitted an application to this club. Check My Forms for its status.' });
    }
  } catch (error) {
    console.error('Duplicate application check failed:', error.name);
    return res.status(503).json({ message: 'We could not verify your previous applications. Please try again.' });
  }

  const applicantPhoto = await getApplicantPhoto(payload);
  if (!applicantPhoto) {
    const photoNeedsRefresh = Boolean(payload.photoPublicId)
      && !(payload.photoUploadSignature && payload.photoVersion);
    return res.status(400).json({ message: photoNeedsRefresh
      ? 'This form page is out of date. Refresh the page, reopen the application, choose the photo again, and submit.'
      : 'A PNG, JPG, or WebP applicant photo is required.' });
  }

  let answers;
  try {
    const { applicationQuestions, validateAnswers } = require('./services/club-questions');
    answers = validateAnswers(applicationQuestions(selectedClub, committee), payload.answers ?? []);
  } catch (error) { return res.status(400).json({ message: error.message }); }

  const newApplication = {
    id: Date.now(),
    studentName: payload.studentName,
    email: applicantEmail,
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
    photo: applicantPhoto.url,
    photoPublicId: applicantPhoto.publicId,
    answers
  };

  const managementToken = generateMyFormCode();
  newApplication.managementTokenHash = hashMyFormToken(managementToken);

  try {
    if (!requireLiveDatabase(res)) return;
    if (signedInStudent) {
      newApplication.studentAccountId = signedInStudent._id;
      newApplication.studentClubKey = `${signedInStudent._id}:${clubId}`;
    }
    if (signedInStudent && cleanText(payload.email, 254).toLowerCase() === signedInStudent.email) {
      const profile = {
        name: cleanText(payload.studentName, 160),
        universityId: cleanText(payload.universityId, 40),
        major: cleanText(payload.major, 120),
        phone: cleanText(payload.phone, 40),
        age: cleanText(payload.age, 3)
      };
      const savedProfile = await StudentAccount.findOneAndUpdate(
        { email: signedInStudent.email, sessionVersion: signedInStudent.sessionVersion },
        { $set: profile },
        { new: true, runValidators: true, writeConcern: { w: 'majority' } }
      ).read('primary').readConcern('majority').lean();
      if (!savedProfile || savedProfile.name !== profile.name || savedProfile.universityId !== profile.universityId
        || savedProfile.major !== profile.major || savedProfile.phone !== profile.phone || savedProfile.age !== profile.age) {
        return res.status(503).json({ message: 'Your profile could not be verified as saved. Your application was not submitted.' });
      }
    }
    // Historical removals retain the application, but no longer reserve its
    // unique account/club key. Also covers removals made before key release.
    if (newApplication.studentClubKey) {
      await Application.updateMany(
        { studentClubKey: newApplication.studentClubKey, status: 'removed' },
        { $unset: { studentClubKey: 1 } }
      );
    }
    await Application.create(newApplication);
    applications.unshift(newApplication);
    res.status(201).json({ application: toApiRecord(newApplication), managementToken });
  } catch (error) {
    if (error.code === 11000 && (error.keyPattern?.studentClubKey || error.keyValue?.studentClubKey)) {
      return res.status(409).json({ message: 'You have already submitted an application to this club. Check My Forms for its status.' });
    }
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.get('/api/student/my-forms', requireStudentAuth, async (req, res) => {
  try {
    if (!requireLiveDatabase(res)) return;
    const records = await Application.find(studentApplicationOwnerFilter(req.studentAccount))
      .read('primary').readConcern('majority').sort({ createdAt: -1 }).lean();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ forms: records.map((record) => {
      const application = toApiRecord(record);
      delete application.studentAccountId;
      return {
        id: record.id,
        application,
        canEdit: !record.interviewed && record.status === 'pending',
        studentOwned: true
      };
    }) });
  } catch (error) {
    console.error('Student forms lookup failed:', error.name);
    res.status(503).json({ message: 'Your applications are temporarily unavailable.' });
  }
});

app.post('/api/my-forms/access', limitMyFormAccessAttempts, (req, res) => {
  const token = getMyFormToken(req);
  const application = applications.find((item) => canManageMyForm(item, token));
  if (!application) return res.status(404).json({ message: 'That My Forms code was not found.' });
  res.json({ application: toApiRecord(application), canEdit: !application.interviewed && application.status === 'pending' });
});

app.get('/api/my-forms/:id', limitMyFormAccessAttempts, async (req, res) => {
  const token = getMyFormToken(req);
  const account = token ? null : req.studentAccount;
  let application;
  if (token) {
    application = applications.find((item) => item.id === Number(req.params.id) && canManageMyForm(item, token));
  } else if (account) {
    try {
      application = await Application.findOne({ id: Number(req.params.id), ...studentApplicationOwnerFilter(account) })
        .read('primary').readConcern('majority').lean();
    } catch (error) {
      console.error('Student form lookup failed:', error.name);
      return res.status(503).json({ message: 'This form is temporarily unavailable.' });
    }
  }
  if (!application) return res.status(404).json({ message: 'This form could not be found.' });
  res.json({ application: toApiRecord(application), canEdit: !application.interviewed && application.status === 'pending' });
});

app.patch('/api/my-forms/:id', limitMyFormAccessAttempts, async (req, res) => {
  const token = getMyFormToken(req);
  const account = token ? null : req.studentAccount;
  let application;
  if (token) {
    application = applications.find((item) => item.id === Number(req.params.id) && canManageMyForm(item, token));
  } else if (account) {
    try {
      application = await Application.findOne({ id: Number(req.params.id), ...studentApplicationOwnerFilter(account) })
        .read('primary').readConcern('majority').lean();
    } catch (error) {
      console.error('Student form lookup failed:', error.name);
      return res.status(503).json({ message: 'This form is temporarily unavailable.' });
    }
  }
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
  if (account && !application.studentAccountId) updates.studentAccountId = account._id;
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
    if (!committee || !getManagedCommittees(application.clubId).includes(committee)) {
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
    try {
      const { applicationQuestions, validateAnswers } = require('./services/club-questions');
      const active = validateAnswers(applicationQuestions(selectedClub, updates.committee ?? application.committee), req.body.answers);
      const keys = new Set(active.map(answer => answer.key));
      updates.answers = [...active, ...(application.answers || []).filter(answer => !keys.has(answer.key))];
      updates.answerHistory = [...(application.answerHistory || []), { savedAt: new Date(), answers: application.answers || [] }];
    } catch (error) { return res.status(400).json({ message: error.message }); }
  }
  if (req.body.photo !== undefined) {
    const applicantPhoto = await getApplicantPhoto(req.body);
    if (!applicantPhoto) return res.status(400).json({ message: 'Choose a valid PNG, JPG, or WebP photo up to 10 MB.' });
    updates.photo = applicantPhoto.url;
    updates.photoPublicId = applicantPhoto.publicId;
  }

  try {
    if (!requireLiveDatabase(res)) return;
    const ownerFilter = token
      ? { managementTokenHash: hashMyFormToken(token) }
      : studentApplicationOwnerFilter(account);
    const updated = await Application.findOneAndUpdate(
      { id: application.id, ...ownerFilter, interviewed: { $ne: true }, status: 'pending' },
      { $set: updates },
      { new: true }
    ).lean();
    if (!updated) return res.status(409).json({ message: 'This form can no longer be edited because its interview process has started.' });
    if (updates.photoPublicId && updates.photoPublicId !== application.photoPublicId) {
      await removeApplicantPhoto(application.photoPublicId);
    }
    Object.assign(application, updates);
    return res.json(toApiRecord(updated));
  } catch (error) {
    console.error('Database operation failed:', error.name);
    res.status(503).json({ message: 'The data store is temporarily unavailable.' });
  }
});

app.delete('/api/my-forms/:id', limitMyFormAccessAttempts, async (req, res) => {
  const token = getMyFormToken(req);
  const account = token ? null : req.studentAccount;
  const applicationIndex = applications.findIndex((item) => item.id === Number(req.params.id) && canManageMyForm(item, token));
  let application = token ? applications[applicationIndex] : null;
  if (!token && account) {
    try {
      application = await Application.findOne({ id: Number(req.params.id), ...studentApplicationOwnerFilter(account) })
        .read('primary').readConcern('majority').lean();
    } catch (error) {
      console.error('Student form lookup failed:', error.name);
      return res.status(503).json({ message: 'This form is temporarily unavailable.' });
    }
  }
  if (!application) return res.status(404).json({ message: 'This form could not be found.' });
  if (application.interviewed || application.status !== 'pending') {
    return res.status(409).json({ message: 'This form can no longer be removed because its interview process has started.' });
  }
  try {
    if (!requireLiveDatabase(res)) return;
    const ownerFilter = token
      ? { managementTokenHash: hashMyFormToken(token) }
      : studentApplicationOwnerFilter(account);
    const result = await Application.deleteOne({
      id: application.id,
      ...ownerFilter,
      interviewed: { $ne: true },
      status: 'pending'
    });
    if (!result.deletedCount) return res.status(409).json({ message: 'This form can no longer be removed because its interview process has started.' });
    await removeApplicantPhoto(application.photoPublicId);
    if (applicationIndex >= 0) applications.splice(applicationIndex, 1);
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
    const applicantPhoto = await getApplicantPhoto(req.body);
    if (!applicantPhoto) return res.status(400).json({ message: 'Choose a valid PNG, JPG, or WebP photo up to 10 MB.' });
    updates.photo = applicantPhoto.url;
    updates.photoPublicId = applicantPhoto.publicId;
  }
  try {
    if (Array.isArray(req.body.interviewAnswers)) {
      const club = mongoReady
        ? await Club.findOne({ id: req.clubAccount.clubId }).select('interviewForms').lean()
        : clubs.find((item) => item.id === req.clubAccount.clubId);
      const scope = getInterviewFormScope(req.clubAccount);
      const questions = getInterviewFormSections(club?.interviewForms, scope)
        .flatMap((section) => section.questions || []);
      let interviewAnswers;
      try { interviewAnswers = require('./services/club-questions').validateAnswers(questions, req.body.interviewAnswers); }
      catch (error) { return res.status(400).json({ message: error.message }); }
      const priorEvaluation = (app.interviewEvaluations || []).find((entry) => entry.scope === scope);
      const activeKeys = new Set(questions.map((question) => question.key));
      const archivedAnswers = (priorEvaluation?.answers || []).filter((answer) => !activeKeys.has(answer.key));
      const evaluations = (app.interviewEvaluations || []).filter((entry) => entry.scope !== scope);
      evaluations.push({ scope, answers: [...interviewAnswers, ...archivedAnswers],
        history: [...(priorEvaluation?.history || []), ...(priorEvaluation ? [{ savedAt: new Date(), answers: priorEvaluation.answers || [] }] : [])] });
      updates.interviewEvaluations = evaluations;
    }
    if (notes !== undefined || rating !== undefined || Array.isArray(req.body.interviewAnswers)
      || status === 'accepted' || status === 'rejected') {
      updates.interviewed = true;
    }
    if (!requireLiveDatabase(res)) return;
    const previousApplication = await Application.findOne({ id: appId }).select('status').lean();
    if (!previousApplication) return res.status(404).json({ message: 'Application not found.' });
    const updatedApplication = await Application.findOneAndUpdate({ id: appId }, { $set: updates }, { new: true }).lean();
    if (!updatedApplication) return res.status(404).json({ message: 'Application not found.' });
    if (updates.photoPublicId && updates.photoPublicId !== app.photoPublicId) {
      await removeApplicantPhoto(app.photoPublicId);
    }
    Object.assign(app, updates);
    if (status === 'accepted' && previousApplication.status !== 'accepted') {
      await dispatchAcceptedApplicationPush(updatedApplication);
    }
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
    await removeApplicantPhoto(applications[applicationIndex].photoPublicId);
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
app.get('/club-login', (req, res) => res.set('Cache-Control', 'no-store').redirect(303, '/pages/applicant-login.html?redirect=%2Fclub-dashboard'));
app.get('/club-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/club-application.html', (req, res) => {
  const clubId = Number(req.query.id);
  res.redirect(302, Number.isInteger(clubId) && clubId > 0 ? `/?apply=${clubId}` : '/');
});
app.get('/committee-dashboard.html', (req, res) => res.redirect(302, '/club-login'));
app.get('/attendance', (req, res) => res.sendFile(path.join(__dirname, 'public', 'attendance.html')));

app.get('/assets/vendor/exceljs.min.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules', 'exceljs', 'dist', 'exceljs.min.js')));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: require('./services/static-assets').staticAssetHeaders
}));

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function sendHttpErrorPage(res, status, title, detail) {
  const retryButton = status >= 500
    ? '<button class="retry-action" type="button" onclick="location.reload()">Try again</button>'
    : '';
  const html = fs.readFileSync(path.join(__dirname, 'private', 'error-page.html'), 'utf8')
    .replaceAll('{{STATUS}}', escapeHtml(status))
    .replaceAll('{{TITLE}}', escapeHtml(title))
    .replaceAll('{{DETAIL}}', escapeHtml(detail))
    .replace('{{RETRY_BUTTON}}', retryButton);
  return res.status(status).type('html').send(html);
}

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ status: 404, code: 'API_NOT_FOUND', message: 'This API endpoint was not found.' });
  }
  return sendHttpErrorPage(res, 404, 'We couldn’t find that page', 'The address may be incorrect, or the page may have moved.');
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const isMalformedJson = error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, 'body');
  const isPayloadTooLarge = error.status === 413 || error.statusCode === 413 || error.type === 'entity.too.large'
    || error.code === 'LIMIT_FILE_SIZE';
  const isDuplicate = error.code === 11000;
  const isValidation = error.name === 'ValidationError' || error.name === 'CastError';
  const status = isMalformedJson ? 400 : isPayloadTooLarge ? 413 : isDuplicate ? 409
    : isValidation ? 422 : [400, 401, 403, 404, 408, 409, 413, 422, 429, 503].includes(error.status) ? error.status : 500;
  if (status === 500) {
    console.error('Request failed:', error.name || 'Error');
    if (req.path === '/api/uploads/cloudinary-signature') {
      console.error('Cloudinary signature failure location:', String(error.stack || '').split('\n').slice(1, 7).join(' | '));
    }
  }
  const code = ({ 400: 'INVALID_REQUEST', 401: 'SIGN_IN_REQUIRED', 403: 'ACCESS_DENIED', 404: 'NOT_FOUND',
    408: 'REQUEST_TIMEOUT', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 422: 'VALIDATION_FAILED',
    429: 'TOO_MANY_REQUESTS', 500: 'INTERNAL_ERROR', 503: 'SERVICE_UNAVAILABLE' })[status] || 'REQUEST_FAILED';
  const message = isMalformedJson ? 'The request could not be read. Check the submitted form and try again.'
    : isPayloadTooLarge ? 'This upload is larger than the allowed limit. Choose a smaller file or remove large attachments.'
    : isDuplicate ? `This information already exists${Object.keys(error.keyPattern || {}).length ? ` (${Object.keys(error.keyPattern).join(', ')}).` : '. Check for a duplicate name or email address.'}`
    : isValidation ? `Some submitted information needs to be corrected${details.length ? `: ${details.map((item) => item.field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ')).join(', ')}.` : '.'}`
    : status === 409 ? 'This action conflicts with the latest saved information. Refresh and try again.'
    : status === 503 ? 'The service is temporarily unavailable. Your changes have not been confirmed as saved.'
    : 'Something went wrong while processing this request. Please try again.';
  const details = isMalformedJson
    ? [{ field: 'request', message: 'The form data was incomplete or incorrectly formatted.' }]
    : isPayloadTooLarge
      ? [{ field: 'upload', message: 'Reduce the file size and submit again.' }]
      : isDuplicate
        ? Object.keys(error.keyPattern || {}).map((field) => ({ field, message: 'This value is already in use.' }))
        : error.name === 'ValidationError'
          ? Object.values(error.errors || {}).map((fieldError) => ({
            field: fieldError.path,
            message: fieldError.kind === 'required' ? 'This field is required.' : 'Check the value entered for this field.'
          }))
          : error.name === 'CastError' ? [{ field: error.path, message: 'Use a valid value for this field.' }] : [];
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ status, code, message, ...(details.length ? { details } : {}) });
  }
  const pageTitle = status === 413 ? 'Your request is too large'
    : status === 422 ? 'Check the information you entered'
    : status === 409 ? 'This action needs an update'
    : status === 503 ? 'The service is temporarily unavailable'
    : status === 400 ? 'The request could not be read'
    : 'Something went wrong';
  const pageDetail = details.length ? details.map((item) => `${item.field}: ${item.message}`).join(' ')
    : message;
  return sendHttpErrorPage(res, status, pageTitle, pageDetail);
});

const connectMongo = async () => {
  try {
    if (mongoose.isSqlProvider) {
      await mongoose.connect();
      // SQL DDL/import/validation are explicit CLI operations. Never run the
      // legacy Mongo startup seeding or workflow rewrites against migrated data.
      const [clubRecords, applicationRecords, accountRecords, homepageRecord, authState] = await Promise.all([
        Club.find().sort({ sortOrder: 1, id: 1 }).lean(), Application.find().sort({ id: 1 }).lean(),
        ClubAccount.find().sort({ clubId: 1, role: 1, committee: 1 }).lean(),
        SiteSetting.findOne({ key: 'homepage' }).lean(), AdminAuthState.findOne().lean()
      ]);
      ({ clubs, applications, clubAccounts } = require('./database/cache-snapshot').cacheSnapshot(
        { clubRecords, applicationRecords, accountRecords }, toApiRecord));
      if (homepageRecord) homepageSettings = { title: homepageRecord.title, subtitle: homepageRecord.subtitle };
      adminAuthState = authState;
      mongoReady = true;
      console.log(`${mongoose.providerName === 'azuresql' ? 'Azure SQL' : 'SQL Server'} connected; validated data loaded.`);
      return;
    }
    if (!process.env.MONGO_URI) {
      console.log('MONGO_URI is not configured. Using local demo data.');
      return;
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      // Negotiate wire compression for legacy embedded media during hydration.
      compressors: ['zlib'],
      zlibCompressionLevel: 4,
      // Keep each serverless instance's connection footprint small. Vercel can
      // scale many function instances at once, each with its own Mongo pool.
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 45000,
      readPreference: 'primary',
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority' }
    });
    await initializeMongoData();
    mongoReady = true;
    console.log('MongoDB connected successfully');
  } catch (error) {
    mongoReady = false;
    await mongoose.disconnect().catch(() => {});
    if (mongoose.isSqlProvider) {
      // Do not log the driver message: it can include host/login information.
      console.error('SQL Server unavailable; database-dependent requests remain unavailable:', error.code || error.name);
      console.error('SQL connection check:', require('./database/diagnostics').sqlConnectionDiagnostic(error));
      return;
    }
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
let lastMongoConnectAttemptAt = 0;
const MONGO_RETRY_COOLDOWN_MS = 5000;
function ensureReady() {
  if (mongoReady && mongoose.connection.readyState === 1) return Promise.resolve(true);
  if (!mongoose.isSqlProvider && !process.env.MONGO_URI) return Promise.resolve(false);
  if (connectPromise) return connectPromise;
  if (Date.now() - lastMongoConnectAttemptAt < MONGO_RETRY_COOLDOWN_MS) return Promise.resolve(false);

  lastMongoConnectAttemptAt = Date.now();
  connectPromise = connectMongo().then(() => mongoReady && mongoose.connection.readyState === 1)
    .finally(() => { connectPromise = null; });
  return connectPromise;
}

if (require.main === module) {
  startServer();
} else {
  ensureReady();
}

module.exports = app;
module.exports.ensureReady = ensureReady;
