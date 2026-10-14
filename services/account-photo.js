const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  url: { type: String, default: '' },
  publicId: { type: String, default: '' },
  promptDismissed: { type: Boolean, default: false }
}, { timestamps: true });
const AccountPhoto = require('../database').bindModel(mongoose.models.AccountPhoto || mongoose.model('AccountPhoto', schema));

function registerAccountPhotoRoutes(app, { getEmail, databaseReady, sameOrigin, validatePhoto, notifyLater = async () => {}, model = AccountPhoto }) {
  const handle = (save, remove = false) => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (save && !sameOrigin(req)) return res.status(403).json({ message: 'Reload the page and try again.' });
      if (!databaseReady()) return res.status(503).json({ message: 'Account photos are temporarily unavailable.' });
      const email = String(await getEmail(req, res) || '').trim().toLowerCase();
      if (!email) return res.status(401).json({ message: 'Sign in to manage your account photo.' });
      let photo;
      if (save) {
        photo = remove ? { url: '', publicId: '', promptDismissed: true } : req.body?.promptDismissed === true
          ? { promptDismissed: true }
          : await validatePhoto(req.body?.url, req.body?.publicId);
        if (!photo) return res.status(422).json({ message: 'Choose a valid PNG, JPG, or WebP photo up to 10 MB.' });
        photo.promptDismissed = true;
        photo = await model.findOneAndUpdate({ email }, { $set: photo },
          { upsert: true, new: true, runValidators: true, writeConcern: { w: 'majority' } }).lean();
        if (!remove && req.body?.promptDismissed === true && !photo?.url) {
          Promise.resolve().then(() => notifyLater(req, email)).catch(() => {});
        }
      } else photo = await model.findOne({ email }).lean();
      return res.json(photo ? { url: photo.url || '', publicId: photo.publicId || '', promptDismissed: Boolean(photo.promptDismissed || photo.url) } : null);
    } catch {
      return res.status(503).json({ message: 'Your account photo could not be loaded or saved. Please try again.' });
    }
  };
  app.get('/api/site/account-photo', handle(false));
  app.put('/api/site/account-photo', handle(true));
  app.delete('/api/site/account-photo', handle(true, true));
}

module.exports = { registerAccountPhotoRoutes, AccountPhoto };
