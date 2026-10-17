function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validateDirectMember(body, committees, questions, validateAnswers) {
  const name = clean(body.name, 120);
  const email = clean(body.email, 254).toLowerCase();
  const universityId = clean(body.universityId, 40);
  const major = clean(body.major, 120);
  const phone = clean(body.phone, 40);
  const age = clean(body.age, 3);
  const motivation = clean(body.motivation, 2000);
  const requestedCommittee = clean(body.committee, 100);
  const position = clean(body.position, 100);
  const memberType = body.memberType;
  const committee = committees.find(item => item.toLowerCase() === requestedCommittee.toLowerCase());

  if (!name) throw new Error('Enter the member name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid member email.');
  if (!universityId) throw new Error('Enter the member university ID.');
  if (!major) throw new Error('Enter the member major.');
  if (!phone) throw new Error('Enter the member phone number.');
  if (age && (!/^\d{1,3}$/.test(age) || Number(age) < 16 || Number(age) > 100)) throw new Error('Enter an age between 16 and 100.');
  if (!committee) throw new Error('Choose a committee managed by a committee head.');
  if (!position) throw new Error('Enter the member position.');
  if (!['new', 'senior'].includes(memberType)) throw new Error('Choose New member or Senior member.');
  if (typeof body.interviewNotes === 'string' && body.interviewNotes.length > 2000) throw new Error('Keep interview notes within 2000 characters.');
  const rating = body.interviewRating === undefined ? 0 : Number(body.interviewRating);
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new Error('Choose a valid interview rating.');
  const interviewAnswers = validateAnswers(questions, body.interviewAnswers ?? []);

  return {
    name, email, universityId, major, phone, age, motivation, committee, position, memberType,
    interviewAnswers, interviewNotes: clean(body.interviewNotes, 2000), interviewRating: rating
  };
}

module.exports = { validateDirectMember };
