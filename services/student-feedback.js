const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  kind: { type: String, enum: ['club', 'university'], required: true },
  targetId: { type: Number, required: true },
  targetKey: { type: String, required: true },
  email: { type: String, required: true },
  value: { type: Number, required: true },
  comment: { type: String, default: '', maxlength: 1000 }
}, { timestamps: true });
schema.index({ kind: 1, targetKey: 1, email: 1 }, { unique: true });
const StudentFeedback = require('../database').bindModel(mongoose.models.StudentFeedback || mongoose.model('StudentFeedback', schema));

function parseInteraction(body) {
  const interaction = body.interaction || 'none';
  if (!['none', 'poll', 'evaluation'].includes(interaction)) throw new Error('Choose a valid response type.');
  if (interaction === 'none') return { interaction, question: '', options: [] };
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 300) throw new Error('Enter a question of up to 300 characters.');
  const options = interaction === 'poll' && Array.isArray(body.options) ? body.options.map(value => typeof value === 'string' ? value.trim() : '') : [];
  if (interaction === 'poll' && (options.length < 2 || options.length > 20 || options.some(value => !value || value.length > 160) || new Set(options.map(value => value.toLowerCase())).size !== options.length)) {
    throw new Error('Enter 2–20 different poll options, each up to 160 characters.');
  }
  return { interaction, question, options };
}

function registerFeedbackRoutes(app, { Club, UniversityContent, requireStudentAuth, isAdminSessionValid, getClubAccountFromRequest, requireLiveDatabase, feedbackModel = StudentFeedback }) {
  const safe = handler => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { await handler(req, res); } catch (error) {
      console.error('Student feedback operation failed:', error.name);
      res.status(503).json({ message: 'Feedback is temporarily unavailable. Please try again.' });
    }
  };
  async function reviewer(req) {
    if (await isAdminSessionValid(req)) return 'admin';
    return (await getClubAccountFromRequest(req))?.role;
  }
  app.get('/api/feedback/access', safe(async (req, res) => {
    const role = await reviewer(req);
    res.json({ club: ['admin', 'pr', 'dean'].includes(role), university: ['admin', 'pr'].includes(role) });
  }));
  app.get('/api/feedback/results/:kind', safe(async (req, res) => {
    const kind = req.params.kind;
    if (!['club', 'university'].includes(kind)) return res.status(404).json({ message: 'Not found.' });
    const allowed = kind === 'club' ? ['admin', 'pr', 'dean'] : ['admin', 'pr'];
    if (!allowed.includes(await reviewer(req))) return res.status(403).json({ message: 'You cannot view these results.' });
    if (!requireLiveDatabase(res)) return;
    const targets = await (kind === 'club' ? Club : UniversityContent).find(kind === 'club' ? {} : { interaction: { $in: ['poll', 'evaluation'] } }).lean();
    const responses = await feedbackModel.find({ kind }).sort({ updatedAt: -1 }).lean();
    res.json(targets.map(target => {
      const rows = responses.filter(row => row.targetKey === String(target._id));
      return { id: target.id, title: target.name || target.title, question: target.question || '', interaction: target.interaction || 'evaluation', options: target.options || [], count: rows.length,
        average: rows.length && target.interaction !== 'poll' ? rows.reduce((sum, row) => sum + row.value, 0) / rows.length : null,
        counts: (target.options || []).map((option, index) => ({ option, count: rows.filter(row => row.value === index).length })),
        responses: rows.map(({ email, value, comment, updatedAt }) => ({ ...(kind === 'club' ? { email } : {}), value, comment, updatedAt })) };
    }));
  }));
  app.put('/api/feedback/:kind/:id', requireStudentAuth, safe(async (req, res) => {
    if (!requireLiveDatabase(res)) return;
    const { kind } = req.params;
    const targetId = Number(req.params.id);
    if (!['club', 'university'].includes(kind) || !Number.isSafeInteger(targetId) || targetId < 1) return res.status(400).json({ message: 'Choose a valid post or club.' });
    const target = await (kind === 'club' ? Club : UniversityContent).findOne({ id: targetId, ...(kind === 'club' ? { archivedAt: null } : {}) }).lean();
    if (!target) return res.status(404).json({ message: 'This post or club is no longer available.' });
    if (kind === 'university' && !['poll', 'evaluation'].includes(target.interaction)) return res.status(400).json({ message: 'This post does not accept responses.' });
    const value = req.body.value;
    const poll = kind === 'university' && target.interaction === 'poll';
    if (!Number.isInteger(value) || value < (poll ? 0 : 1) || value > (poll ? target.options.length - 1 : 5)) return res.status(400).json({ message: 'Choose a valid option or a rating from 1 to 5.' });
    const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
    if (comment.length > 1000) return res.status(400).json({ message: 'Keep comments within 1,000 characters.' });
    await feedbackModel.init();
    const key = { kind, targetId, targetKey: String(target._id), email: req.studentAccount.email };
    try {
      await feedbackModel.updateOne(key, { $set: { value, comment: poll ? '' : comment } }, { upsert: true, runValidators: true, writeConcern: { w: 'majority' } });
    } catch (error) {
      if (error.code !== 11000) throw error;
      await feedbackModel.updateOne(key, { $set: { value, comment: poll ? '' : comment } }, { runValidators: true, writeConcern: { w: 'majority' } });
    }
    res.json({ message: 'Your response has been saved. Submitting again updates your response.' });
  }));
}
module.exports = { StudentFeedback, parseInteraction, registerFeedbackRoutes };
