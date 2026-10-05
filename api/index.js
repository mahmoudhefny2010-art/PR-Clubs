const app = require('../server');
const ensureReady = app.ensureReady;

module.exports = async (req, res) => {
  await ensureReady();
  return app(req, res);
};
