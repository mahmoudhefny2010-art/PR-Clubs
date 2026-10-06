const mongoose = require('mongoose');

const applicationFieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true, trim: true },
  type: { type: String, enum: ['text', 'textarea', 'select'], default: 'text' },
  required: { type: Boolean, default: false },
  options: { type: [String], default: [] }
}, { _id: false });

const clubSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  sortOrder: { type: Number, required: true, default: 0, index: true },
  name: { type: String, required: true, trim: true },
  committee: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  tagline: { type: String, required: true, trim: true },
  image: { type: String, required: true },
  imagePublicId: { type: String, default: '' },
  imageFit: { type: String, enum: ['contain', 'cover'], default: 'contain' },
  status: { type: String, enum: ['open', 'opening-soon', 'full', 'closed'], default: 'open' },
  pinned: { type: Boolean, default: false },
  seats: { type: Number, min: 0, default: 0 },
  members: { type: Number, min: 0, default: 0 },
  applicants: { type: Number, min: 0, default: 0 },
  description: { type: String, required: true },
  requirements: { type: String, required: true },
  applicationIntro: { type: String, trim: true, default: '' },
  applicationFields: { type: [applicationFieldSchema], default: [] },
  interviewForms: { type: [mongoose.Schema.Types.Mixed], default: [] },
  events: { type: [mongoose.Schema.Types.Mixed], default: [] },
  posts: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: true });

const applicationSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  studentName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  universityId: { type: String, default: '' },
  major: { type: String, default: '' },
  phone: { type: String, default: '' },
  slot: { type: String, default: '' },
  clubId: { type: Number, required: true, index: true },
  committee: { type: String, default: '' },
  age: { type: String, default: '' },
  motivation: { type: String, default: '' },
  notes: { type: String, default: '' },
  rating: { type: Number, min: 0, max: 5, default: 0 },
  interviewed: { type: Boolean, default: false },
  interviewEvaluations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  photo: { type: String, default: '' },
  managementTokenHash: { type: String, default: '' },
  answers: { type: mongoose.Schema.Types.Mixed, default: () => [] }
}, { timestamps: true });

const siteSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  subtitle: { type: String, required: true }
}, { timestamps: true });

const clubAccountSchema = new mongoose.Schema({
  clubId: { type: Number, required: true, index: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  salt: { type: String, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['president', 'head', 'pr', 'english', 'dean'], default: 'president' },
  committee: { type: String, default: '' }
}, { timestamps: true, autoIndex: false });

const contentRequestSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  clubId: { type: Number, required: true, index: true },
  clubName: { type: String, default: '' },
  type: { type: String, enum: ['post', 'event'], required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  date: { type: String, default: '' },
  time: { type: String, default: '' },
  location: { type: String, default: '' },
  budget: { type: String, default: '' },
  image: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'pending_pr', 'pending_english', 'pending_dean', 'changes_requested', 'rejected', 'published', 'deleted'], default: 'draft', index: true },
  resubmitTo: { type: String, enum: ['pending_pr', 'pending_english'], default: 'pending_pr' },
  editRequestedBy: { type: String, enum: ['', 'pr', 'english'], default: '' },
  skipEnglishOnNextPrApproval: { type: Boolean, default: false },
  clubNotice: { type: String, default: '' },
  workflowHistory: [{
    role: { type: String, enum: ['club', 'pr', 'english', 'dean'], required: true },
    actorRole: { type: String, default: '' },
    actorEmail: { type: String, default: '' },
    action: { type: String, required: true },
    fromStatus: { type: String, default: '' },
    toStatus: { type: String, default: '' },
    comment: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }],
  comments: {
    pr: { type: String, default: '' },
    english: { type: String, default: '' },
    dean: { type: String, default: '' }
  },
  commentHistory: [{
    role: { type: String, enum: ['pr', 'english', 'dean'], required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    deletedAt: { type: Date, default: null }
  }],
  hiddenCommentRoles: { type: [String], default: [] },
  submittedAt: { type: Date, default: Date.now },
  publishedAt: { type: Date },
  deletedAt: { type: Date }
}, { timestamps: true });

const auditLogSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  actorEmail: { type: String, required: true, trim: true, index: true },
  actorRole: { type: String, default: 'admin' },
  action: { type: String, required: true, trim: true },
  targetType: { type: String, default: '' },
  targetId: { type: String, default: '' },
  targetName: { type: String, default: '' },
  details: { type: String, default: '' },
  ip: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

const Club = mongoose.models.Club || mongoose.model('Club', clubSchema);
const Application = mongoose.models.Application || mongoose.model('Application', applicationSchema);
const SiteSetting = mongoose.models.SiteSetting || mongoose.model('SiteSetting', siteSettingSchema);
const ClubAccount = mongoose.models.ClubAccount || mongoose.model('ClubAccount', clubAccountSchema);
const ContentRequest = mongoose.models.ContentRequest || mongoose.model('ContentRequest', contentRequestSchema);
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

module.exports = { Club, Application, SiteSetting, ClubAccount, ContentRequest, AuditLog };
