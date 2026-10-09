const fs = require('node:fs');
const path = require('node:path');
const { compare } = require('./png.cjs');
const artifacts = path.resolve(__dirname, '../../.frontend-audit');
const stage = process.argv[2] || 'final';
const directory = path.join(artifacts, `browser-${stage}`);
const before = JSON.parse(fs.readFileSync(path.join(artifacts, 'browser-baseline/results.json')));
const after = JSON.parse(fs.readFileSync(path.join(directory, 'results.json')));
const failures = [], noise = [];
if (after.scenarios !== before.scenarios || after.results.length !== before.results.length
    || new Set(after.results.map((r) => r.key)).size !== before.results.length) {
  failures.push({ reason: 'Incomplete or duplicated scenario coverage' });
}
let exactPixels = 0;
for (const result of after.results) {
  const original = before.results.find((r) => r.key === result.key);
  if (!original) { failures.push({ key: result.key, reason: 'Baseline missing' }); continue; }
  const delta = compare(fs.readFileSync(path.join(artifacts, 'browser-baseline', result.key + '.png')), fs.readFileSync(path.join(directory, result.key + '.png')));
  if (!delta.changedPixels) exactPixels++; else noise.push({ key: result.key, ...delta });
  if (!delta.pass || result.stateHash !== original.stateHash || JSON.stringify(result.api) !== JSON.stringify(original.api) || JSON.stringify(result.exceptions) !== JSON.stringify(original.exceptions)) failures.push({ key: result.key, pixel: delta, matches: result.matches });
}
const report = { stage, scenarios: after.scenarios, baselineScenarios: before.scenarios, exactPixels, noise, failures, missingFixtures: after.missingFixtures, exceptions: after.results.filter((r) => r.exceptions.length).map((r) => ({ key: r.key, exceptions: r.exceptions })), externalHostsStubbed: after.externalHostsStubbed };
fs.writeFileSync(path.join(directory, 'comparison.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length || after.missingFixtures.length) process.exitCode = 1;
