function getVisitorIpAddress(req) {
  return require('./http-security').trustedClientIp(req);
}

module.exports = { getVisitorIpAddress };
