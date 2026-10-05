const { app, ensureReady } = require('../server');

module.exports = async (req, res) => {
  await ensureReady();
  return app(req, res);
};
