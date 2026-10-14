// Read-only HTTP comparison. Never connects directly to either database.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { parts, set } = require('../database/values');
function baseUrl(input) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Provide an HTTP(S) origin without credentials, paths or query strings.');
  return url;
}
function stable(value) {
  return Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
}
async function response(base, route, cookie, fetcher, requestTimeoutMs) {
  if (typeof route !== 'string' || !route.startsWith('/api/') || route.startsWith('//') || /[\r\n\\]/.test(route)) throw new Error('Parity cases require a same-origin /api/ path.');
  const url = new URL(route, base);
  if (url.origin !== base.origin) throw new Error('Cross-origin parity case rejected.');
  const result = await fetcher(url, { method: 'GET', redirect: 'manual', headers: { Accept: 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, signal: AbortSignal.timeout(requestTimeoutMs) });
  const contentType = (result.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new Error('Parity responses must be JSON; redirects/login HTML are not a passing comparison.');
  const chunks = []; let size = 0;
  for await (const chunk of result.body) { size += chunk.byteLength; if (size > 64 * 1024 * 1024) throw new Error('Parity response exceeds 64 MB. Compare a narrower or media-link endpoint.'); chunks.push(Buffer.from(chunk)); }
  return { status: result.status, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
}
async function compareApis({ mongoOrigin, sqlOrigin, cases, mongoCookie, sqlCookie, fetcher = fetch, requestTimeoutMs = 15000 }) {
  const mongo = baseUrl(mongoOrigin), sql = baseUrl(sqlOrigin);
  if (mongo.origin === sql.origin) throw new Error('Use two different staging application origins, one for each provider.');
  if (!Array.isArray(cases) || !cases.length) throw new Error('At least one explicit parity case is required.');
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1000 || requestTimeoutMs > 120000) throw new Error('API comparison timeout must be between 1000 and 120000 ms.');
  const results = [];
  for (const [index, item] of cases.entries()) {
    const expectedStatus = item.expectedStatus ?? 200;
    if (!Number.isInteger(expectedStatus) || expectedStatus < 200 || expectedStatus > 499) throw new Error('Cases must declare a valid expected success/client status; server errors never prove parity.');
    const [a, b] = await Promise.all([response(mongo, item.path, mongoCookie, fetcher, requestTimeoutMs), response(sql, item.path, sqlCookie, fetcher, requestTimeoutMs)]);
    const ignored = item.ignoreFields || [];
    if (!Array.isArray(ignored)) throw new Error('ignoreFields must be an explicit array of field paths.');
    for (const field of ignored) { parts(field); set(a.body, field, undefined); set(b.body, field, undefined); }
    // Reports contain no response values, cookies, IDs, tokens or request URLs.
    results.push({ case: index + 1, expectedStatus, mongoStatus: a.status, sqlStatus: b.status,
      matchingBody: JSON.stringify(stable(a.body)) === JSON.stringify(stable(b.body)), ignoredFields: ignored.length,
      passed: a.status === expectedStatus && b.status === expectedStatus && JSON.stringify(stable(a.body)) === JSON.stringify(stable(b.body)) });
  }
  return { scope: 'GET response contract comparison for explicitly listed staging cases; does not test writes, concurrent changes or unlisted routes.', checkedAt: new Date().toISOString(), passed: results.every(r => r.passed), results };
}
async function main() {
  if (process.env.API_PARITY_STAGING_CONFIRMED !== 'true') throw new Error('Confirm that both API origins point to isolated staging applications.');
  const casesFile = process.env.API_PARITY_CASES_FILE || path.resolve(__dirname, '../database/api-parity.example.json');
  const config = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
  const report = await compareApis({ mongoOrigin: process.env.API_PARITY_MONGO_ORIGIN, sqlOrigin: process.env.API_PARITY_SQL_ORIGIN,
    mongoCookie: process.env.API_PARITY_MONGO_COOKIE, sqlCookie: process.env.API_PARITY_SQL_COOKIE, cases: config.cases });
  if (process.env.API_PARITY_REPORT_FILE) {
    const file = require('./sqlserver-migrate.cjs').protectedPath(process.env.API_PARITY_REPORT_FILE);
    fs.writeFileSync(file, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ passed: report.passed, cases: report.results.length, mismatched: report.results.filter(r => !r.passed).length }));
  if (!report.passed) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error('API parity verification stopped:', error.code || error.name, 'Check private staging configuration.'); process.exitCode = 1; });
module.exports = { compareApis };
