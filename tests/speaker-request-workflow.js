const assert = require('node:assert/strict');
const { SpeakerRequest, SpeakerCvUpload, SpeakerInvite } = require('../models');
const {
  requesterKey,
  speakerInviteTokenHash,
  publicSpeakerDuplicateKey,
  validateSpeakerPayload,
  validatePublicSpeakerInvitePayload,
  canReviewSpeakerRequest,
  canClubReviewSpeakerRequest,
  validClubSpeakerDecision,
  validSpeakerDecision,
  speakerResubmissionStatus,
  validateSpeakerCvAsset,
  decodeSpeakerCvData,
  MAX_CV_BYTES
} = require('../services/speaker-requests');

const goodPayload = {
  speakerName: 'Dr. Ada Example',
  jobTitleCompany: 'Researcher at MIU',
  linkedinProfile: 'https://www.linkedin.com/in/ada-example',
  proposedTopic: 'Responsible AI',
  speakerSelectionReason: 'Her research experience fits the event topic.',
  expectedStudentBenefit: 'Students will learn practical research methods.'
};

assert.equal(validateSpeakerPayload(goodPayload).value.jobTitleCompany, 'Researcher at MIU');
assert.equal(validateSpeakerPayload(goodPayload).value.speakerSelectionReason, goodPayload.speakerSelectionReason);
assert.match(validateSpeakerPayload({ ...goodPayload, speakerName: '' }).error, /speaker name/i);
assert.match(validateSpeakerPayload({ ...goodPayload, proposedTopic: 'x'.repeat(301) }).error, /too long/i);
assert.match(validateSpeakerPayload({ ...goodPayload, expectedStudentBenefit: '' }).error, /expected benefit to students/i);
assert.match(validateSpeakerPayload({ ...goodPayload, speakerSelectionReason: 'x'.repeat(2001) }).error, /too long/i);
assert.equal(validateSpeakerPayload({ ...goodPayload, linkedinProfile: '' }).value.linkedinProfile, '');
assert.match(validateSpeakerPayload({ ...goodPayload, linkedinProfile: 'https://example.com/profile' }).error, /LinkedIn/i);
const publicPayload = { fullName: 'Dr. Ada Example', jobTitleCompany: 'Researcher, MIU', email: 'ADA@example.edu', linkedinProfile: 'https://www.linkedin.com/in/ada', proposedTopic: 'Responsible AI', shortBio: '', sessionFormat: 'Online', availability: 'Weekdays in February', specialRequirements: '' };
assert.equal(validatePublicSpeakerInvitePayload(publicPayload).value.speakerEmail, 'ada@example.edu');
assert.equal(validatePublicSpeakerInvitePayload(publicPayload).value.sessionFormat, 'Online');
assert.match(validatePublicSpeakerInvitePayload({ ...publicPayload, fullName: ' ' }).error, /full name/i);
assert.match(validatePublicSpeakerInvitePayload({ ...publicPayload, proposedTopic: 'AI' }).error, /at least 3 characters/i);
assert.match(validatePublicSpeakerInvitePayload({ ...publicPayload, availability: '' }).error, /availability/i);
assert.match(validatePublicSpeakerInvitePayload({ ...publicPayload, availability: '  ' }).error, /availability/i);
assert.match(validatePublicSpeakerInvitePayload({ ...publicPayload, email: 'bad-email' }).error, /valid email/i);
assert.match(validatePublicSpeakerInvitePayload({ ...publicPayload, linkedinProfile: 'https://example.com/profile' }).error, /LinkedIn/i);

const student = { type: 'student', id: 'student-id', email: 'a@miuegypt.edu.eg' };
assert.equal(requesterKey(student, 7), requesterKey(student, 7));
assert.notEqual(requesterKey(student, 7), requesterKey(student, 8));
assert.notEqual(requesterKey(student, 7), requesterKey({ ...student, id: 'other-student' }, 7));
assert.equal(speakerInviteTokenHash('a'.repeat(64)), speakerInviteTokenHash('a'.repeat(64)));
assert.notEqual(speakerInviteTokenHash('a'.repeat(64)), speakerInviteTokenHash('b'.repeat(64)));
assert.equal(publicSpeakerDuplicateKey(7, 'SPEAKER@example.edu'), publicSpeakerDuplicateKey(7, 'speaker@example.edu'));
assert.notEqual(publicSpeakerDuplicateKey(7, 'speaker@example.edu'), publicSpeakerDuplicateKey(8, 'speaker@example.edu'));

assert.equal(canReviewSpeakerRequest('dean', 'student@miuegypt.edu.eg', 'dean@miuegypt.edu.eg'), true);
assert.equal(canReviewSpeakerRequest('dean', 'same@miuegypt.edu.eg', 'SAME@miuegypt.edu.eg'), false);
assert.equal(canReviewSpeakerRequest('pr', 'student@miuegypt.edu.eg', 'pr@miuegypt.edu.eg'), false);
assert.equal(validSpeakerDecision('pending_dean', 'approve'), true);
assert.equal(validSpeakerDecision('pending_dean', 'reject'), true);
assert.equal(validSpeakerDecision('pending_dean', 'request_changes'), true);
assert.equal(validSpeakerDecision('pending', 'approve'), false);
assert.equal(validSpeakerDecision('approved', 'reject'), false);
assert.equal(validSpeakerDecision('changes_requested', 'approve'), false);
const head = { role: 'head', clubId: 7, email: 'head@miuegypt.edu.eg' };
const assignedRequest = { clubId: 7, requesterEmail: 'speaker@example.edu', assignedHeadEmail: head.email };
assert.equal(canClubReviewSpeakerRequest(head, assignedRequest), true);
assert.equal(canClubReviewSpeakerRequest({ ...head, email: 'other@miuegypt.edu.eg' }, assignedRequest), false);
assert.equal(canClubReviewSpeakerRequest({ ...head, clubId: 8 }, assignedRequest), false);
assert.equal(canClubReviewSpeakerRequest(head, { ...assignedRequest, requesterEmail: head.email }), false);
assert.equal(validClubSpeakerDecision('pending_club', 'accept'), true);
assert.equal(validClubSpeakerDecision('pending', 'reject'), true);
assert.equal(validClubSpeakerDecision('pending_dean', 'accept'), false);
assert.equal(speakerResubmissionStatus({ clubReviewedAt: null }), 'pending_club');
assert.equal(speakerResubmissionStatus({ clubReviewedAt: new Date() }), 'pending_supervisor');
assert.equal(validateSpeakerCvAsset({ format: 'pdf', bytes: 1024, public_id: 'miu-speaker-cvs/uuid.pdf' }), true);
assert.equal(validateSpeakerCvAsset({ format: 'docx', bytes: 1024, public_id: 'miu-speaker-cvs/uuid.pdf' }), false);
assert.equal(validateSpeakerCvAsset({ format: 'docx', bytes: 1024, public_id: 'miu-speaker-cvs/uuid.docx' }), true);
assert.equal(validateSpeakerCvAsset({ format: 'pdf', bytes: MAX_CV_BYTES + 1, public_id: 'miu-speaker-cvs/uuid.pdf' }), false);
assert.equal(validateSpeakerCvAsset({ format: 'pdf', bytes: 1024, public_id: 'other-folder/uuid.pdf' }), false);
assert.equal(decodeSpeakerCvData('data:application/pdf;base64,JVBERi0xLjQK').buffer.subarray(0, 5).toString('ascii'), '%PDF-');
assert.equal(decodeSpeakerCvData('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEsDBA==').format, 'docx');
assert.equal(decodeSpeakerCvData('data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,UEsDBA==').format, 'pptx');
assert.equal(decodeSpeakerCvData('data:application/vnd.ms-powerpoint;base64,0M8R4KGxGuE=').format, 'ppt');
assert.equal(decodeSpeakerCvData('data:application/msword;base64,0M8R4KGxGuE=').format, 'doc');
assert.equal(decodeSpeakerCvData('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,bm90emlw').error !== undefined, true);
assert.match(decodeSpeakerCvData('data:application/pdf;base64,bm90IGEgcGRm').error, /PDF header/i);
assert.match(decodeSpeakerCvData('data:application/msword;base64,JVBERi0=').error, /valid DOC/i);

assert(SpeakerRequest.schema.indexes().some(([keys, options]) => keys.activeRequesterKey === 1 && options.unique && options.sparse));
assert(SpeakerRequest.schema.path('status').enumValues.includes('pending_club'));
assert(SpeakerRequest.schema.path('status').enumValues.includes('pending_dean'));
assert(SpeakerRequest.schema.path('requesterType').enumValues.includes('speaker'));
assert(SpeakerRequest.schema.path('speakerSelectionReason'));
assert(SpeakerRequest.schema.path('expectedStudentBenefit'));
assert(SpeakerRequest.schema.path('speakerAttachments'));
assert(SpeakerRequest.schema.path('speakerAttachments').schema.path('format').enumValues.includes('pptx'));
assert(SpeakerRequest.schema.path('decisionHistory').schema.path('action').enumValues.includes('club_accepted'));
assert(SpeakerCvUpload.schema.path('expiresAt'));
assert(SpeakerInvite.schema.path('tokenHash').options.unique);
assert(SpeakerInvite.schema.path('createdByRole').enumValues.includes('head'));
assert(SpeakerInvite.schema.path('createdByRole').enumValues.includes('dean'));
assert(SpeakerInvite.schema.indexes().some(([keys, options]) => keys.clubId === 1 && keys.createdByEmail === 1 && options.unique && options.partialFilterExpression?.stableToken === true));
assert.equal(MAX_CV_BYTES, 5 * 1024 * 1024);

console.log('Speaker request workflow checks passed.');
