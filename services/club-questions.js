const crypto = require('node:crypto');
const managerRoles = new Set(['president', 'vice_president', 'head']);
const norm = value => String(value || '').trim().toLowerCase();
function invalid(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(`${name} must contain 1–${max} characters.`);
  return value.trim();
}
function validateQuestions(fields, used = new Set()) {
  if (!Array.isArray(fields) || fields.length > 12) invalid('Use up to 12 questions per form or section.');
  return fields.map(field => {
    if (!field || typeof field !== 'object') invalid('Check each question.');
    const key = field.key || `q_${crypto.randomUUID().replaceAll('-', '')}`;
    if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(key) || used.has(key)) invalid('Question identifiers must be valid and unique.');
    used.add(key);
    const label = text(field.label, 100, 'Question text');
    if (!['text', 'textarea', 'select'].includes(field.type)) invalid('Choose a supported question type.');
    if (typeof field.required !== 'boolean') invalid('Choose whether each question is required.');
    let options = [];
    if (field.type === 'select') {
      if (!Array.isArray(field.options) || field.options.length < 2 || field.options.length > 20) invalid('Choice questions need 2–20 options.');
      options = field.options.map(option => text(option, 100, 'Option'));
      if (new Set(options).size !== options.length) invalid('Question options must be unique.');
    }
    return { key, label, type: field.type, required: field.required, options };
  });
}
function validateSections(sections) {
  if (!Array.isArray(sections) || sections.length > 10) invalid('Use up to 10 interview sections.');
  const keys = new Set(), questionKeys = new Set();
  return sections.map(section => {
    if (!section || typeof section !== 'object') invalid('Check each interview section.');
    const key = section.key || `s_${crypto.randomUUID().replaceAll('-', '')}`;
    if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(key) || keys.has(key)) invalid('Section identifiers must be valid and unique.');
    keys.add(key);
    return { key, title: text(section.title, 80, 'Section title'), questions: validateQuestions(section.questions, questionKeys) };
  });
}
function applicationQuestions(club, committee) {
  return (club?.applicationFields || []).filter(field => !field.committee || norm(field.committee) === norm(committee));
}
function validateAnswers(questions, submitted) {
  if (!Array.isArray(submitted) || submitted.some(a => !a || typeof a.key !== 'string' || typeof a.value !== 'string')
    || new Set(submitted.map(a => a.key)).size !== submitted.length) invalid('Check your form answers.');
  return questions.map(question => {
    const value = (submitted.find(a => a.key === question.key)?.value || '').trim();
    if (value.length > 2000) invalid(`Keep the answer to ${question.label} within 2000 characters.`);
    if (question.required && !value) invalid(`${question.label} is required.`);
    if (question.type === 'select' && value && !question.options.includes(value)) invalid(`Choose a valid option for ${question.label}.`);
    return { key: question.key, label: question.label, value };
  });
}
function registerClubQuestions(app, { Club, ClubAccount, requireClubAuth, requireLiveDatabase, getInterviewFormScope, getInterviewFormSections, clubs }) {
  function authorize(req, res, next) {
    if (!managerRoles.has(req.clubAccount?.role) || !Number.isSafeInteger(req.clubAccount.clubId) || req.clubAccount.clubId < 1
      || req.clubAccount.role === 'head' && !req.clubAccount.committee?.trim()) return res.status(403).json({ message: 'Question management is not assigned to this account.' });
    return next();
  }
  async function context(req, source) {
    if (source.clubId !== undefined && Number(source.clubId) !== req.clubAccount.clubId) invalid('You cannot manage another club.', 403);
    const club = await Club.findOne({ id: req.clubAccount.clubId, archivedAt: null }).select('id updatedAt applicationIntro applicationFields interviewForms questionHistory').lean();
    if (!club) invalid('Club not found.', 404);
    const accounts = await ClubAccount.find({ $or: [{ clubId: req.clubAccount.clubId }, { roleAssignments: { $elemMatch: { clubId: req.clubAccount.clubId, role: 'head' } } }] }).select('clubId role committee roleAssignments').lean();
    const committees = [...new Set(accounts.flatMap(account => [account, ...(account.roleAssignments || [])])
      .filter(account => account.role === 'head' && account.committee && (account.clubId === undefined || account.clubId === req.clubAccount.clubId))
      .map(account => account.committee.trim()))];
    let committee = source.committee === undefined ? (req.clubAccount.role === 'head' ? req.clubAccount.committee : '') : source.committee;
    if (typeof committee !== 'string') invalid('Choose a valid committee.');
    committee = committee.trim();
    if (req.clubAccount.role === 'head' && norm(committee) !== norm(req.clubAccount.committee)) invalid('You can manage questions only for your assigned committee.', 403);
    if (committee) {
      const canonical = committees.find(item => norm(item) === norm(committee));
      if (!canonical) invalid('Choose an assigned committee.');
      committee = canonical;
    }
    return { club, committee, committees: req.clubAccount.role === 'head' ? [committee] : committees };
  }
  function fail(res, error) { res.status(error.status || (error.code === 'VERSION_CONFLICT' ? 409 : 503)).json({ message: error.status ? error.message : 'Questions could not be saved or loaded. Reload and try again.' }); }
  for (const kind of ['application', 'interview']) {
    const path = `/api/club/${kind}-form`;
    app.get(path, requireClubAuth, authorize, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        if (!requireLiveDatabase(res)) return;
        const { club, committee, committees } = await context(req, req.query || {});
        const scope = committee || getInterviewFormScope({ role: 'president' });
        res.json({ committee, committees, version: club.updatedAt || null,
          ...(kind === 'application' ? { applicationIntro: club.applicationIntro || '', applicationFields: (club.applicationFields || []).filter(q => norm(q.committee) === norm(committee)) }
            : { scope, sections: getInterviewFormSections(club.interviewForms, scope) }) });
      } catch (error) { fail(res, error); }
    });
    app.put(path, requireClubAuth, authorize, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        if (!requireLiveDatabase(res)) return;
        const body = req.body || {}, { club, committee, committees } = await context(req, body);
        if (body.version !== undefined && String(body.version || '') !== (club.updatedAt ? new Date(club.updatedAt).toISOString() : '')) invalid('Questions changed since you opened this form. Reload before saving.', 409);
        const updates = {}, scope = committee || '__president__';
        let result;
        if (kind === 'application') {
          const other = (club.applicationFields || []).filter(q => norm(q.committee) !== norm(committee));
          const applicationFields = validateQuestions(body.applicationFields, new Set(other.map(q => q.key))).map(q => ({ ...q, committee }));
          updates.applicationFields = [...other, ...applicationFields];
          if (!committee && body.applicationIntro !== undefined) {
            if (typeof body.applicationIntro !== 'string' || body.applicationIntro.length > 500) invalid('Keep the form introduction within 500 characters.');
            updates.applicationIntro = body.applicationIntro.trim();
          }
          result = { applicationIntro: updates.applicationIntro ?? club.applicationIntro ?? '', applicationFields };
        } else {
          const sections = validateSections(body.sections);
          updates.interviewForms = [...(club.interviewForms || []).filter(f => norm(f.scope) !== norm(scope)), { scope, sections }];
          result = { scope, sections };
        }
        // Config revisions and answer snapshots retain removed/edited questions.
        updates.questionHistory = [...(club.questionHistory || []), { kind, scope, changedAt: new Date(),
          ...(kind === 'application' ? { applicationFields: club.applicationFields || [], applicationIntro: club.applicationIntro || '' } : { interviewForms: club.interviewForms || [] }) }];
        const saved = await Club.findOneAndUpdate({ id: club.id, updatedAt: club.updatedAt || null }, { $set: updates }, { new: true, runValidators: true }).lean();
        if (!saved) invalid('Questions changed while saving. Reload before trying again.', 409);
        const cached = clubs.find(item => item.id === club.id);
        if (cached) Object.assign(cached, updates);
        res.json({ ...result, committee, committees, version: saved.updatedAt || null });
      } catch (error) { fail(res, error); }
    });
  }
  app.get('/api/clubs/:id/application-form', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!requireLiveDatabase(res)) return;
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) invalid('Invalid club.');
      const club = await Club.findOne({ id, archivedAt: null }).select('applicationIntro applicationFields').lean();
      if (!club) invalid('Club not found.', 404);
      res.json({ applicationIntro: club.applicationIntro || '', applicationFields: club.applicationFields || [] });
    } catch (error) { fail(res, error); }
  });
}
module.exports = { managerRoles, validateQuestions, validateSections, applicationQuestions, validateAnswers, registerClubQuestions };
