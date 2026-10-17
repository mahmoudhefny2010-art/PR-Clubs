const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDirectMember } = require('../services/club-member-intake');
const { validateAnswers } = require('../services/club-questions');

const committees = ['IT', 'Media'];
const questions = [{ key: 'why', label: 'Why do you want to join?', type: 'textarea', required: true, options: [] }];
const valid = {
  name: 'Demo Student', email: 'DEMO@MIUEDU.EDU.EG', universityId: '26-12345', major: 'Computer Science',
  phone: '01000000000', age: '20', motivation: 'I want to learn.', committee: 'it', position: 'Member',
  memberType: 'new', interviewAnswers: [{ key: 'why', value: 'I enjoy building projects.' }],
  interviewNotes: 'Good fit', interviewRating: '4'
};

test('validates and normalizes direct member intake including interview answers', () => {
  const member = validateDirectMember(valid, committees, questions, validateAnswers);
  assert.equal(member.email, 'demo@miuedu.edu.eg');
  assert.equal(member.committee, 'IT');
  assert.equal(member.interviewAnswers[0].value, 'I enjoy building projects.');
  assert.equal(member.interviewRating, 4);
});

test('requires the same required interview answers and core student details', () => {
  assert.throws(() => validateDirectMember({ ...valid, universityId: '' }, committees, questions, validateAnswers), /university ID/);
  assert.throws(() => validateDirectMember({ ...valid, interviewAnswers: [] }, committees, questions, validateAnswers), /Why do you want to join\? is required/);
  assert.throws(() => validateDirectMember({ ...valid, committee: 'Unknown' }, committees, questions, validateAnswers), /Choose a committee/);
});

test('accepts an omitted optional age and motivation but rejects invalid age or rating', () => {
  const member = validateDirectMember({ ...valid, age: '', motivation: '' }, committees, questions, validateAnswers);
  assert.equal(member.age, '');
  assert.equal(member.motivation, '');
  assert.throws(() => validateDirectMember({ ...valid, age: '12' }, committees, questions, validateAnswers), /age between 16 and 100/);
  assert.throws(() => validateDirectMember({ ...valid, interviewRating: '8' }, committees, questions, validateAnswers), /valid interview rating/);
});
