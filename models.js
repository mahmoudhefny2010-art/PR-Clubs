const mongoose = require('mongoose');

const applicationFieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true, trim: true },
  type: { type: String, enum: ['text', 'textarea', 'select'], default: 'text' },
  required: { type: Boolean, default: false },
  options: { type: [String], default: [] }
}, { _id: false });

const clubMemberSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, default: '', trim: true, lowercase: true, maxlength: 254 },
  committee: { type: String, required: true, trim: true, maxlength: 100 },
  position: { type: String, required: true, trim: true, maxlength: 100 },
  memberType: { type: String, enum: ['new', 'senior'], required: true }
}, { _id: false, timestamps: true });

const committeeAvailabilitySchema = new mongoose.Schema({
  committee: { type: String, required: true, trim: true, maxlength: 100 },
  status: { type: String, enum: ['open', 'full', 'closed'], default: 'open' }
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
  archivedAt: { type: Date, default: null, index: true },
  pinned: { type: Boolean, default: false },
  seats: { type: Number, min: 0, default: 0 },
  members: { type: Number, min: 0, default: 0 },
  memberRoster: { type: [clubMemberSchema], default: [] },
  committeeAvailability: { type: [committeeAvailabilitySchema], default: [] },
  applicants: { type: Number, min: 0, default: 0 },
  description: { type: String, required: true },
  requirements: { type: String, required: true },
  applicationIntro: { type: String, trim: true, default: '' },
  applicationFields: { type: [applicationFieldSchema], default: [] },
  interviewForms: { type: [mongoose.Schema.Types.Mixed], default: [] },
  events: { type: [mongoose.Schema.Types.Mixed], default: [] },
  posts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  sponsors: { type: [mongoose.Schema.Types.Mixed], default: [] },
  booths: { type: [mongoose.Schema.Types.Mixed], default: [] }
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
  photoPublicId: { type: String, default: '' },
  managementTokenHash: { type: String, default: '' },
  answers: { type: mongoose.Schema.Types.Mixed, default: () => [] }
}, { timestamps: true });

const siteSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  subtitle: { type: String, required: true }
}, { timestamps: true });

const universityContentSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  type: { type: String, enum: ['event', 'announcement'], required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 140 },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  date: { type: String, default: '' },
  time: { type: String, default: '' },
  registrationEnabled: { type: Boolean, default: false },
  location: { type: String, default: '', trim: true, maxlength: 160 },
  image: { type: String, default: '' },
  imagePublicId: { type: String, default: '' },
  publishedBy: { type: String, default: '' }
}, { timestamps: true });

const siteVisitorSchema = new mongoose.Schema({
  visitorId: { type: String, required: true, unique: true, index: true },
  deviceType: { type: String, enum: ['mobile', 'tablet', 'desktop', 'unknown'], default: 'unknown', index: true },
  deviceName: { type: String, default: 'Unknown device' },
  browserName: { type: String, default: 'Unknown browser' },
  accountType: { type: String, enum: ['guest', 'admin', 'club', 'student'], default: 'guest', index: true },
  accountEmail: { type: String, default: '', lowercase: true, trim: true, index: true },
  accountName: { type: String, default: '' },
  accountLabel: { type: String, default: '' },
  firstSeenAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true, index: true }
}, { versionKey: false });

const siteNetworkSchema = new mongoose.Schema({
  ipHash: { type: String, required: true, unique: true, index: true },
  firstSeenAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true }
}, { versionKey: false });

const siteVisitorPresenceSchema = new mongoose.Schema({
  visitorId: { type: String, required: true, unique: true, index: true },
  ipAddress: { type: String, default: '' },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { versionKey: false });

const clubAccountSchema = new mongoose.Schema({
  clubId: { type: Number, required: true, index: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  salt: { type: String, required: true },
  passwordHash: { type: String, required: true },
  sessionVersion: { type: Number, default: 0 },
  passwordChangedAt: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
  role: { type: String, enum: ['president', 'head', 'pr', 'english', 'security', 'sso', 'dean'], default: 'president' },
  committee: { type: String, default: '' }
}, { timestamps: true, autoIndex: false });

const contentRequestSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  clubId: { type: Number, required: true, index: true },
  clubName: { type: String, default: '' },
  assignedHeadEmail: { type: String, default: '', lowercase: true, trim: true },
  type: { type: String, enum: ['event', 'feed', 'sponsor', 'booth', 'entry_permit'], required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  date: { type: String, default: '' },
  time: { type: String, default: '' },
  registrationEnabled: { type: Boolean, default: true },
  location: { type: String, default: '' },
  budget: { type: String, default: '' },
  image: { type: String, default: '' },
  permitItems: [{
    quantity: { type: Number, min: 1 },
    number: { type: String, trim: true, maxlength: 80 },
    details: { type: String, trim: true, maxlength: 1000 }
  }],
  sponsorName: { type: String, default: '' },
  sponsorCompany: { type: String, default: '' },
  sponsorContact: { type: String, default: '' },
  sponsorEmail: { type: String, default: '' },
  sponsorPhone: { type: String, default: '' },
  sponsorType: { type: String, default: '' },
  sponsorAmount: { type: String, default: '' },
  sponsorBenefits: { type: String, default: '' },
  sponsorDescription: { type: String, default: '' },
  sponsorLogo: { type: String, default: '' },
  sponsorAttachment: { type: String, default: '' },
  sponsorNotes: { type: String, default: '' },
  boothName: { type: String, default: '' },
  boothPurpose: { type: String, default: '' },
  boothDescription: { type: String, default: '' },
  boothLocation: { type: String, default: '' },
  boothSize: { type: String, default: '' },
  boothEquipment: { type: String, default: '' },
  boothSetupDate: { type: String, default: '' },
  boothOpenDate: { type: String, default: '' },
  boothCloseDate: { type: String, default: '' },
  boothContact: { type: String, default: '' },
  boothNotes: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'pending_pr', 'pending_english', 'pending_security', 'pending_dean', 'changes_requested', 'rejected', 'published', 'approved', 'deleted'], default: 'draft', index: true },
  resubmitTo: { type: String, enum: ['pending_pr', 'pending_english', 'pending_security'], default: 'pending_pr' },
  editRequestedBy: { type: String, enum: ['', 'pr', 'english', 'security'], default: '' },
  skipEnglishOnNextPrApproval: { type: Boolean, default: false },
  clubNotice: { type: String, default: '' },
  workflowHistory: [{
    role: { type: String, enum: ['club', 'pr', 'english', 'security', 'dean'], required: true },
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
    security: { type: String, default: '' },
    dean: { type: String, default: '' }
  },
  commentHistory: [{
    role: { type: String, enum: ['pr', 'english', 'security', 'dean'], required: true },
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

const eventRegistrationSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  clubId: { type: Number, required: true, index: true },
  eventIndex: { type: Number, required: true },
  eventTitle: { type: String, default: '' },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 }
}, { timestamps: true });
eventRegistrationSchema.index({ clubId: 1, eventIndex: 1, email: 1 }, { unique: true });

const attendanceSessionSchema = new mongoose.Schema({
  clubId: { type: Number, required: true, index: true },
  itemType: { type: String, enum: ['event', 'booth'], default: 'event', index: true },
  eventRequestId: { type: Number, required: true },
  eventTitle: { type: String, required: true, trim: true },
  eventDate: { type: String, default: '' },
  eventTime: { type: String, default: '' },
  tokenHash: { type: String, required: true, unique: true },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: String, required: true, lowercase: true, trim: true }
}, { timestamps: true });
attendanceSessionSchema.index({ clubId: 1, itemType: 1, eventRequestId: 1, active: 1 });

const attendanceActivityClosureSchema = new mongoose.Schema({
  clubId: { type: Number, required: true, index: true },
  itemType: { type: String, enum: ['event', 'booth'], required: true },
  eventRequestId: { type: Number, required: true },
  eventTitle: { type: String, required: true, trim: true },
  eventDate: { type: String, default: '' },
  endedByEmail: { type: String, required: true, lowercase: true, trim: true },
  endedByRole: { type: String, enum: ['president', 'head'], required: true },
  endedAt: { type: Date, default: Date.now }
}, { timestamps: true });
attendanceActivityClosureSchema.index({ clubId: 1, itemType: 1, eventRequestId: 1 }, { unique: true });

const attendanceAssignmentSchema = new mongoose.Schema({
  clubId: { type: Number, required: true, index: true },
  clubName: { type: String, required: true, trim: true },
  itemType: { type: String, enum: ['event', 'booth'], required: true },
  eventRequestId: { type: Number, required: true },
  eventTitle: { type: String, required: true, trim: true },
  eventDate: { type: String, default: '' },
  eventTime: { type: String, default: '' },
  memberEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  activeMemberDayKey: { type: String, default: undefined },
  memberName: { type: String, required: true, trim: true },
  committee: { type: String, required: true, trim: true },
  assignedBy: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ['assigned', 'accepted'], default: 'assigned', index: true },
  acceptedAt: { type: Date, default: null }
}, { timestamps: true });
attendanceAssignmentSchema.index({ clubId: 1, itemType: 1, eventRequestId: 1 }, { unique: true });
attendanceAssignmentSchema.index({ memberEmail: 1, eventDate: 1 });
attendanceAssignmentSchema.index({ activeMemberDayKey: 1 }, {
  unique: true,
  partialFilterExpression: { activeMemberDayKey: { $type: 'string' } }
});

const attendanceRecordSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  clubId: { type: Number, required: true, index: true },
  itemType: { type: String, enum: ['event', 'booth'], default: 'event', index: true },
  eventRequestId: { type: Number, required: true },
  eventTitle: { type: String, required: true },
  eventDate: { type: String, default: '' },
  eventTime: { type: String, default: '' },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  deviceHash: { type: String, select: false },
  note: { type: String, default: '', trim: true, maxlength: 500 },
  approvalStatus: { type: String, enum: ['pending_pr', 'pending_sso', 'pending_dean', 'approved', 'rejected'], default: 'pending_pr', index: true },
  approvalHistory: [{
    role: { type: String, enum: ['pr', 'sso', 'dean'], required: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    action: { type: String, enum: ['approved', 'rejected', 'noted'], required: true },
    note: { type: String, default: '', trim: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now }
  }],
  attendedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true });
attendanceRecordSchema.index({ clubId: 1, itemType: 1, eventRequestId: 1, email: 1 }, { unique: true });
attendanceRecordSchema.index({ clubId: 1, itemType: 1, eventRequestId: 1, deviceHash: 1 }, {
  unique: true,
  partialFilterExpression: { deviceHash: { $type: 'string' } }
});

const studentAccountSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  universityId: { type: String, default: '', trim: true, maxlength: 40 },
  major: { type: String, default: '', trim: true, maxlength: 120 },
  phone: { type: String, default: '', trim: true, maxlength: 40 },
  age: { type: String, default: '', trim: true, maxlength: 3 },
  salt: { type: String, default: '' },
  passwordHash: { type: String, default: '' },
  googleSub: { type: String, unique: true, sparse: true },
  sessionVersion: { type: Number, default: 0 },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

const studentInterestSchema = new mongoose.Schema({
  studentEmail: { type: String, required: true, lowercase: true, trim: true },
  clubId: { type: Number, required: true },
  eventIndex: { type: Number, required: true },
  eventTitle: { type: String, default: '', trim: true, maxlength: 140 },
  detailViews: { type: Number, default: 0 },
  registered: { type: Boolean, default: false },
  lastViewedAt: { type: Date, default: Date.now }
}, { timestamps: true });
studentInterestSchema.index({ studentEmail: 1, clubId: 1, eventIndex: 1 }, { unique: true });
studentInterestSchema.index({ clubId: 1, eventIndex: 1 });

const studentEmailCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  salt: { type: String, required: true },
  passwordHash: { type: String, required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
studentEmailCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const loginAttemptSchema = new mongoose.Schema({
  sourceHash: { type: String, required: true, unique: true },
  windowStart: { type: Date, required: true },
  failures: { type: Number, required: true, default: 0 },
  lockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const passwordResetTokenSchema = new mongoose.Schema({
  accountType: { type: String, enum: ['admin', 'club', 'student'], required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
passwordResetTokenSchema.index({ accountType: 1, email: 1 }, { unique: true });
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const passwordRecoveryRateLimitSchema = new mongoose.Schema({
  sourceHash: { type: String, required: true, unique: true },
  windowStart: { type: Date, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
passwordRecoveryRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const adminAuthStateSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  salt: { type: String, required: true },
  passwordHash: { type: String, required: true },
  sessionVersion: { type: Number, default: 0 },
  passwordChangedAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

const EventRegistration = mongoose.models.EventRegistration || mongoose.model('EventRegistration', eventRegistrationSchema);
const AttendanceSession = mongoose.models.AttendanceSession || mongoose.model('AttendanceSession', attendanceSessionSchema);
const AttendanceActivityClosure = mongoose.models.AttendanceActivityClosure || mongoose.model('AttendanceActivityClosure', attendanceActivityClosureSchema);
const AttendanceAssignment = mongoose.models.AttendanceAssignment || mongoose.model('AttendanceAssignment', attendanceAssignmentSchema);
const AttendanceRecord = mongoose.models.AttendanceRecord || mongoose.model('AttendanceRecord', attendanceRecordSchema);
const StudentAccount = mongoose.models.StudentAccount || mongoose.model('StudentAccount', studentAccountSchema);
const StudentInterest = mongoose.models.StudentInterest || mongoose.model('StudentInterest', studentInterestSchema);
const StudentEmailCode = mongoose.models.StudentEmailCode || mongoose.model('StudentEmailCode', studentEmailCodeSchema);
const LoginAttempt = mongoose.models.LoginAttempt || mongoose.model('LoginAttempt', loginAttemptSchema);
const PasswordResetToken = mongoose.models.PasswordResetToken || mongoose.model('PasswordResetToken', passwordResetTokenSchema);
const PasswordRecoveryRateLimit = mongoose.models.PasswordRecoveryRateLimit || mongoose.model('PasswordRecoveryRateLimit', passwordRecoveryRateLimitSchema);
const AdminAuthState = mongoose.models.AdminAuthState || mongoose.model('AdminAuthState', adminAuthStateSchema);

const Club = mongoose.models.Club || mongoose.model('Club', clubSchema);
const Application = mongoose.models.Application || mongoose.model('Application', applicationSchema);
const SiteSetting = mongoose.models.SiteSetting || mongoose.model('SiteSetting', siteSettingSchema);
const UniversityContent = mongoose.models.UniversityContent || mongoose.model('UniversityContent', universityContentSchema);
const SiteVisitor = mongoose.models.SiteVisitor || mongoose.model('SiteVisitor', siteVisitorSchema);
const SiteNetwork = mongoose.models.SiteNetwork || mongoose.model('SiteNetwork', siteNetworkSchema);
const SiteVisitorPresence = mongoose.models.SiteVisitorPresence || mongoose.model('SiteVisitorPresence', siteVisitorPresenceSchema);
const ClubAccount = mongoose.models.ClubAccount || mongoose.model('ClubAccount', clubAccountSchema);
const ContentRequest = mongoose.models.ContentRequest || mongoose.model('ContentRequest', contentRequestSchema);
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

module.exports = {
  Club,
  Application,
  SiteSetting,
  UniversityContent,
  SiteVisitor,
  SiteNetwork,
  SiteVisitorPresence,
  ClubAccount,
  ContentRequest,
  AuditLog,
  EventRegistration,
  AttendanceSession,
  AttendanceActivityClosure,
  AttendanceAssignment,
  AttendanceRecord,
  StudentAccount,
  StudentInterest,
  StudentEmailCode,
  LoginAttempt,
  PasswordResetToken,
  PasswordRecoveryRateLimit,
  AdminAuthState
};
