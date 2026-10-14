const fs = require('node:fs');
const path = require('node:path');
const { compare } = require('./png.cjs');
const artifacts = path.resolve(__dirname, '../../.frontend-audit');
const stage = process.argv[2] || 'final';
const directory = path.join(artifacts, `browser-${stage}`);
const reference = process.argv[3] || 'baseline';
const before = JSON.parse(fs.readFileSync(path.join(artifacts, `browser-${reference}/results.json`)));
const after = JSON.parse(fs.readFileSync(path.join(directory, 'results.json')));
const failures = [], noise = [];
const referenceMissingFixtures = before.missingFixtures || [];
const newMissingFixtures = (after.missingFixtures || []).filter(item => !referenceMissingFixtures.includes(item));
const allowExistingFixtureGaps = process.argv.includes('--allow-existing-fixture-gaps');
const allowRepeatedSessionReads = process.argv.includes('--allow-repeated-session-reads');
const sessionRead = JSON.stringify({ method: 'GET', url: '/api/site/account-session' });
const sessionReadCountDrift = [];
if (after.scenarios !== before.scenarios || after.results.length !== before.results.length
    || new Set(after.results.map((r) => r.key)).size !== before.results.length) {
  failures.push({ reason: 'Incomplete or duplicated scenario coverage' });
}
let exactPixels = 0;
for (const result of after.results) {
  const original = before.results.find((r) => r.key === result.key);
  if (!original) { failures.push({ key: result.key, reason: 'Baseline missing' }); continue; }
  const delta = compare(fs.readFileSync(path.join(artifacts, `browser-${reference}`, result.key + '.png')), fs.readFileSync(path.join(directory, result.key + '.png')));
  if (!delta.changedPixels) exactPixels++; else noise.push({ key: result.key, ...delta });
  let apiMatches = JSON.stringify(result.api) === JSON.stringify(original.api);
  if (!apiMatches && allowRepeatedSessionReads) {
    const beforeCount = original.api.filter(item => item === sessionRead).length;
    const afterCount = result.api.filter(item => item === sessionRead).length;
    if (beforeCount > 0 && beforeCount <= 2 && afterCount > 0 && afterCount <= 2 && JSON.stringify(result.api.filter(item => item !== sessionRead)) === JSON.stringify(original.api.filter(item => item !== sessionRead))) {
      apiMatches = true;
      sessionReadCountDrift.push({ key: result.key, before: beforeCount, after: afterCount });
    }
  }
  if (!delta.pass || result.stateHash !== original.stateHash || !apiMatches || JSON.stringify(result.exceptions) !== JSON.stringify(original.exceptions)) failures.push({ key: result.key, pixel: delta, matches: { state: result.stateHash === original.stateHash, api: apiMatches, exceptions: JSON.stringify(result.exceptions) === JSON.stringify(original.exceptions) } });
}
const report = { stage, reference, scenarios: after.scenarios, baselineScenarios: before.scenarios, exactPixels, noise, failures, missingFixtures: after.missingFixtures, referenceMissingFixtures, newMissingFixtures, allowExistingFixtureGaps, allowRepeatedSessionReads, sessionReadCountDrift, exceptions: after.results.filter((r) => r.exceptions.length).map((r) => ({ key: r.key, exceptions: r.exceptions })), externalHostsStubbed: after.externalHostsStubbed };
fs.writeFileSync(path.join(directory, 'comparison.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length || report.exceptions.length || (allowExistingFixtureGaps ? newMissingFixtures.length : after.missingFixtures.length)) process.exitCode = 1;
