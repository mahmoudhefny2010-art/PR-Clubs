const crypto = require('crypto');

const MAX_CV_BYTES = 5 * 1024 * 1024;
const CV_UPLOAD_TTL_MS = 30 * 60 * 1000;

function requesterKey(identity, clubId) {
  const raw = identity.type === 'student'
    ? `student:${identity.id}:${clubId}`
    : `club:${identity.email}:${identity.id}:${clubId}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function resolveSpeakerHosting(identity, payload = {}) {
  if (identity?.type !== 'club') return null;
  const clubId = Number(identity.clubId);
  if (!Number.isSafeInteger(clubId) || clubId <= 0
    || payload.hostingType !== undefined && payload.hostingType !== 'club'
    || payload.clubId !== undefined && Number(payload.clubId) !== clubId) return null;
  return { hostingType: 'club', clubId };
}

function validateSpeakerPayload(payload = {}) {
  const fields = {
    speakerName: String(payload.speakerName || '').trim(),
    jobTitleCompany: String(payload.jobTitleCompany || '').trim(),
    linkedinProfile: String(payload.linkedinProfile || '').trim(),
    proposedTopic: String(payload.proposedTopic || '').trim(),
    speakerSelectionReason: String(payload.speakerSelectionReason || '').trim(),
    expectedStudentBenefit: String(payload.expectedStudentBenefit || '').trim()
  };
  const limits = { speakerName: 160, jobTitleCompany: 300, linkedinProfile: 500, proposedTopic: 300, speakerSelectionReason: 2000, expectedStudentBenefit: 2000 };
  for (const [name, value] of Object.entries(fields)) {
    if (value.length > limits[name]) return { error: `${name} is too long.` };
  }
  for (const [name, label] of Object.entries({
    speakerName: 'the speaker name', jobTitleCompany: 'the current position and company',
    proposedTopic: 'the proposed talk topic', speakerSelectionReason: 'why this speaker was chosen',
    expectedStudentBenefit: 'the expected benefit to students'
  })) {
    if (!fields[name]) return { error: `Please provide ${label}.` };
    const minimum = name === 'speakerName' || name === 'jobTitleCompany' ? 2 : 3;
    if (fields[name].length < minimum) return { error: `Please provide more detail for ${label}.` };
  }
  if (fields.linkedinProfile) {
    try {
      const url = new URL(fields.linkedinProfile);
      const host = url.hostname.toLowerCase();
      if (!['http:', 'https:'].includes(url.protocol) || (host !== 'linkedin.com' && !host.endsWith('.linkedin.com'))) throw new Error('invalid');
    } catch (_) { return { error: 'Enter a valid LinkedIn profile URL.' }; }
  }
  return {
    value: {
      ...fields,
      professionalDetails: fields.jobTitleCompany,
      speakerEmail: '',
      contactDetails: fields.linkedinProfile,
      eventPurpose: '',
      proposedDate: null
    }
  };
}

function validatePublicSpeakerInvitePayload(payload = {}) {
  const values = {
    speakerName: String(payload.fullName || '').trim(),
    jobTitleCompany: String(payload.jobTitleCompany || '').trim(),
    speakerEmail: String(payload.email || '').trim().toLowerCase(),
    linkedinProfile: String(payload.linkedinProfile || '').trim(),
    proposedTopic: String(payload.proposedTopic || '').trim(),
    shortBio: String(payload.shortBio || '').trim(),
    sessionFormat: String(payload.sessionFormat || '').trim(),
    availability: String(payload.availability || '').trim(),
    specialRequirements: String(payload.specialRequirements || '').trim()
  };
  const limits = { speakerName: 160, jobTitleCompany: 300, speakerEmail: 254, linkedinProfile: 500, proposedTopic: 300, shortBio: 2000, availability: 500, specialRequirements: 1500 };
  for (const [name, value] of Object.entries(values)) {
    if (limits[name] && value.length > limits[name]) return { error: `${name} is too long.` };
  }
  for (const [name, label] of Object.entries({ speakerName: 'your full name', jobTitleCompany: 'your job title and company', speakerEmail: 'your email address', proposedTopic: 'a proposed talk topic', sessionFormat: 'a preferred session format', availability: 'your availability' })) {
    if (!values[name]) return { error: `Please provide ${label}.` };
  }
  for (const [name, minimum] of Object.entries({ speakerName: 2, jobTitleCompany: 2, proposedTopic: 3, availability: 3 })) {
    if (values[name].length < minimum) return { error: `Please provide at least ${minimum} characters for ${name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}.` };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.speakerEmail)) return { error: 'Enter a valid email address.' };
  if (!['On-campus', 'Online', 'Either'].includes(values.sessionFormat)) return { error: 'Choose a valid session format.' };
  if (values.linkedinProfile) {
    try {
      const url = new URL(values.linkedinProfile);
      if (!['http:', 'https:'].includes(url.protocol) || !/(^|\.)linkedin\.com$/i.test(url.hostname)) throw new Error('invalid');
    } catch (_) { return { error: 'Enter a valid LinkedIn profile URL.' }; }
  }
  const eventDetails = [`Preferred session format: ${values.sessionFormat}`, `Availability: ${values.availability}`];
  if (values.specialRequirements) eventDetails.push(`Special requirements: ${values.specialRequirements}`);
  return { value: {
    ...values,
    professionalDetails: values.jobTitleCompany,
    contactDetails: values.linkedinProfile,
    eventPurpose: eventDetails.join('\n'),
    proposedDate: null
  } };
}

function speakerInviteTokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function publicSpeakerDuplicateKey(clubId, email) {
  return crypto.createHash('sha256').update(`speaker:${Number(clubId)}:${String(email || '').trim().toLowerCase()}`).digest('hex');
}

function canReviewSpeakerRequest(role, requesterEmail, reviewerEmail) {
  return role === 'dean'
    && Boolean(reviewerEmail)
    && String(requesterEmail || '').toLowerCase() !== String(reviewerEmail).toLowerCase();
}

function canClubReviewSpeakerRequest(account, record) {
  if (!account || !record || !['president', 'head'].includes(account.role)) return false;
  if (Number(account.clubId) !== Number(record.clubId)) return false;
  if (String(account.email || '').toLowerCase() === String(record.requesterEmail || '').toLowerCase()) return false;
  if (account.role === 'head' && record.assignedHeadEmail
    && String(account.email || '').toLowerCase() !== String(record.assignedHeadEmail).toLowerCase()) return false;
  return true;
}

function validClubSpeakerDecision(status, action) {
  return ['pending_club', 'pending'].includes(status) && ['accept', 'reject'].includes(action);
}

function validSpeakerDecision(status, action) {
  return status === 'pending_dean' && ['approve', 'reject', 'request_changes'].includes(action);
}

function speakerResubmissionStatus(record) {
  return record?.hostingType === 'miu' ? 'pending_dean'
    : record?.clubReviewedAt || record?.requesterType === 'club' || record?.reviewerRole === 'supervisor' ? 'pending_supervisor' : 'pending_club';
}

function validateSpeakerCvAsset(asset) {
  const format = String(asset?.format || '').toLowerCase();
  const publicId = String(asset?.public_id || '');
  return Boolean(asset)
    && ['pdf', 'doc', 'docx', 'ppt', 'pptx'].includes(format)
    && Number.isSafeInteger(Number(asset.bytes))
    && Number(asset.bytes) > 0
    && Number(asset.bytes) <= MAX_CV_BYTES
    && publicId.startsWith('miu-speaker-cvs/')
    && publicId.toLowerCase().endsWith(`.${format}`);
}

function decodeSpeakerCvData(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(MAX_CV_BYTES / 3) * 4 + 64) {
    return { error: 'The attachment must be no larger than 5 MB.' };
  }
  const match = dataUrl.match(/^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) return { error: 'Choose a valid PDF, DOC, DOCX, PPT, or PPTX file.' };
  const mime = match[1].toLowerCase();
  const formats = {
    'application/pdf': 'pdf', 'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
  };
  const format = formats[mime];
  if (!format) return { error: 'Choose a valid PDF, DOC, DOCX, PPT, or PPTX file.' };
  const encoded = match[2];
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > MAX_CV_BYTES || buffer.toString('base64') !== encoded) {
    return { error: 'The attachment must be no larger than 5 MB.' };
  }
  if (format === 'pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') return { error: 'The selected file does not contain a valid PDF header.' };
  if (format === 'doc' && buffer.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1') return { error: 'The selected file does not contain a valid DOC document.' };
  if (format === 'ppt' && buffer.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1') return { error: 'The selected file does not contain a valid PPT document.' };
  if (['docx', 'pptx'].includes(format) && buffer.subarray(0, 2).toString('ascii') !== 'PK') return { error: 'The selected file does not contain a valid Office document.' };
  return { buffer, format };
}

module.exports = { MAX_CV_BYTES, CV_UPLOAD_TTL_MS, requesterKey, resolveSpeakerHosting, validateSpeakerPayload, validatePublicSpeakerInvitePayload, speakerInviteTokenHash, publicSpeakerDuplicateKey, canReviewSpeakerRequest, canClubReviewSpeakerRequest, validClubSpeakerDecision, validSpeakerDecision, speakerResubmissionStatus, validateSpeakerCvAsset, decodeSpeakerCvData };
