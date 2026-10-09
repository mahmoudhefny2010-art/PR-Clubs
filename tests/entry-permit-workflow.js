// Pure workflow and visibility checks; no database, server startup, or credentials are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const modelsSource = fs.readFileSync(path.join(root, 'models.js'), 'utf8');
const transitionMatch = serverSource.match(/function committeeNextStage\(role, action, record\) \{[\s\S]*?\n\}/);
const prSkipMatch = serverSource.match(/function shouldSendPrApprovalToDean\(record\) \{[\s\S]*?\n\}/);
const accessMatch = serverSource.match(/function committeeCanAccessRequest\(role, type\) \{[\s\S]*?\n\}/);
assert.ok(transitionMatch, 'Committee transition policy exists.');
assert.ok(prSkipMatch, 'PR resubmission routing policy exists.');
assert.ok(accessMatch, 'Committee visibility policy exists.');
const policy = `${prSkipMatch[0]}\n${transitionMatch[0]}\n${accessMatch[0]}`;
const sandbox = {};
vm.runInNewContext(`${policy}\nglobalThis.policy = { committeeNextStage, committeeCanAccessRequest };`, sandbox);
const { committeeNextStage: next, committeeCanAccessRequest: canAccess } = sandbox.policy;

const permit = { type: 'entry_permit', status: 'pending_pr' };
assert.equal(next('pr', 'approve', permit), 'pending_security');
assert.equal(next('security', 'approve', { ...permit, status: 'pending_security' }), 'pending_pr');
assert.equal(next('pr', 'approve', { ...permit, status: 'pending_pr', workflowHistory: [{ role: 'security', action: 'approve' }] }), 'approved');
assert.equal(next('dean', 'approve', { ...permit, status: 'approved' }), null);
assert.equal(next('security', 'request_edit', { ...permit, status: 'pending_security' }), 'changes_requested');
assert.equal(next('dean', 'approve', { type: 'event', status: 'pending_dean' }), 'published');
for (const type of ['feed', 'sponsor', 'booth']) {
  assert.equal(next('pr', 'approve', { type, status: 'pending_pr' }), 'pending_english');
  assert.equal(next('dean', 'approve', { type, status: 'pending_dean' }), 'published');
}
assert.equal(next('pr', 'approve', { type: 'event', status: 'pending_pr' }), 'pending_english');

for (const role of ['pr', 'dean']) assert.equal(canAccess(role, 'entry_permit'), true);
assert.equal(canAccess('security', 'entry_permit'), true);
assert.equal(canAccess('security', 'event'), false);
assert.equal(canAccess('english', 'entry_permit'), false);
assert.equal(canAccess('english', 'event'), true);
assert.equal(canAccess('security', 'sponsor'), false);
assert.equal(canAccess('pr', 'entry_permit'), true);
assert.equal(canAccess('sso', 'entry_permit'), false, 'SSO does not review Entry Permits.');
for (const type of ['feed', 'sponsor', 'booth']) assert.equal(canAccess('english', type), true);
assert.equal(canAccess('english', 'event'), true);
for (const type of ['application', 'attendance', 'entry_permit']) assert.equal(canAccess('english', type), false);

assert.match(serverSource, /const attendanceApprovalStages = \{ pr: 'pending_pr', sso: 'pending_sso', dean: 'pending_dean' \}/);
assert.match(serverSource, /if \(!stage\) return res\.status\(403\)\.json\(\{ message: 'Attendance review is available to PR, SSO, and Dean accounts\.' \}\)/);
assert.match(serverSource, /const filter = req\.clubAccount\.role === 'president' \? \{ clubId: req\.clubAccount\.clubId \} : \{\}/);

const clubPublishingFields = serverSource.match(/const contentClubField = \{[^}]+\}/)?.[0] || '';
for (const field of ["event: 'events'", "feed: 'posts'", "sponsor: 'sponsors'", "booth: 'booths'"]) assert.ok(clubPublishingFields.includes(field));
assert.ok(!clubPublishingFields.includes('entry_permit'), 'Entry Permits are never copied to public club content.');
assert.match(serverSource, /function toPublicClubRecord\(record\)\s*\{\s*const \{ memberRoster, archivedAt, \.\.\.publicRecord \}/, 'Published content remains available in the public club data.');
const publicShape = serverSource.match(/function toPublicClubRecord\(record\) \{[\s\S]*?\n\}/)?.[0] || '';
const publicSandbox = { toApiRecord: (record) => record };
vm.runInNewContext(`${publicShape}\nglobalThis.shape = toPublicClubRecord({ id: 1, events: [{ title: 'Public event' }], posts: [{ text: 'Internal feed' }], sponsors: [{}], booths: [{}], memberRoster: [{}] });`, publicSandbox);
assert.deepEqual(JSON.parse(JSON.stringify(publicSandbox.shape)), { id: 1, events: [{ title: 'Public event' }], posts: [{ text: 'Internal feed' }], sponsors: [{}], booths: [{}] }, 'Existing published public content remains available.');
assert.ok(!clubPublishingFields.includes('attendance'), 'Attendance review records are never copied into public club content.');
const deanHandler = serverSource.match(/app\.post\('\/api\/committee\/requests\/:id\/action'[\s\S]*?\n\}\);/)?.[0] || '';
assert.ok(deanHandler.includes("if (nextStatus === 'published' && record.type !== 'entry_permit')"), 'Existing public content types still publish after Dean approval.');
assert.ok(deanHandler.includes("record.type === 'entry_permit' && req.clubAccount.role === 'dean'"), 'The Dean cannot take action on Entry Permits.');
assert.ok(serverSource.includes("const wasPublished = record.status === 'published'"), 'Returning an internal permit must not treat it as public content.');
assert.ok(serverSource.includes('function validEntryPermitItems(items)'), 'Entry Permit submissions validate the structured request rows.');
assert.ok(modelsSource.includes('permitItems: [{') && modelsSource.includes('details: { type: String, trim: true, maxlength: 1000 }'), 'Structured permit quantities, numbers, and details are persisted.');
const dashboardForm = fs.readFileSync(path.join(root, 'public/assets/js/entry-permit-dashboard.js'), 'utf8');
assert.ok(dashboardForm.includes("fetch('/api/club/content/entry_permit'") && dashboardForm.includes('permitItems'), 'Club dashboard form submits structured Entry Permit requests.');
const reviewDialog = fs.readFileSync(path.join(root, 'public/assets/js/committee-dashboard.js'), 'utf8');
assert.ok(reviewDialog.includes("permitHeading.textContent = 'People and items requested'"), 'Reviewers see permit rows in the request details.');

const securityPage = fs.readFileSync(path.join(root, 'public/dashboards/security-dashboard.html'), 'utf8');
assert.ok(securityPage.includes('Entry Permit Review'));
assert.ok(securityPage.includes('Approve &amp; Send back to PR'));
const attendanceDashboard = fs.readFileSync(path.join(root, 'public/assets/js/attendance-dashboard.js'), 'utf8');
assert.ok(attendanceDashboard.includes('SSO approved · Waiting for Dean'));
assert.ok(attendanceDashboard.includes('Dean approved · Internal'));
console.log('Workflow checks passed: public content retains PR → English → Dean; Entry Permits follow PR → Security Office → PR final approval and remain read-only for the Dean; attendance approvals remain internal.');
