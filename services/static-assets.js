const path = require('path');

// Revalidate every code asset on each request. Browsers and service workers
// may keep a local fallback, but must ask the server before using it online.
function staticAssetHeaders(res, filePath) {
  const hostname = String(res.req.hostname || '').toLowerCase();
  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return;
  }
  if (!res.req.path.startsWith('/assets/')) return;
  const codeAsset = /\.(?:css|js|mjs|json|webmanifest)$/i.test(path.extname(filePath));
  if (codeAsset) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
  }
}
module.exports = { staticAssetHeaders };
