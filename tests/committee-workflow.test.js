const test = require('node:test');
const assert = require('node:assert/strict');
const { shapeCommitteeWorkflowRequest } = require('../services/committee-workflow');

function record(stageId, status = 'pending_pr') {
  const stages = [
    { id: 'supervisor', roles: ['supervisor'], reviewFields: ['title'], permissions: { supervisor: ['approve', 'view_all'] } },
    { id: 'pr', roles: ['pr'], reviewFields: ['title', 'date'], editableFields: ['date'], permissions: { pr: ['approve', 'request_changes', 'view_all'] } },
    { id: 'english', roles: ['english'], reviewFields: ['title'], permissions: { english: ['approve', 'view_all'] } },
    { id: 'dean', roles: ['dean'], reviewFields: ['title'], permissions: { dean: ['approve', 'view_all'] } }
  ];
  return { id: 42, clubId: 7, clubName: 'Robotics', type: 'event', title: 'Robotics night', date: '2026-10-25',
    privateField: 'do not expose', status, updatedAt: new Date(), workflow: { state: 'review', stageId, ownerEmail: 'club@example.edu',
      revision: 2, assignedEmails: [], definition: { stages }, history: [] } };
}

test('committee dashboard exposes managed requests only to an authorized current-stage role', () => {
  const account = { email: 'pr@example.edu', role: 'pr' };
  const pendingForPr = shapeCommitteeWorkflowRequest(record('pr'), account, 'pr', { activeOnly: true, clubImage: '/club.png' });
  assert.equal(pendingForPr.workflow, true);
  assert.equal(pendingForPr.title, 'Robotics night');
  assert.equal(pendingForPr.date, '2026-10-25');
  assert.equal(pendingForPr.workflowRevision, 2);
  assert.deepEqual(pendingForPr.workflowActions, ['approve', 'request_changes']);
  assert.deepEqual(pendingForPr.workflowEditableFields, [{ id: 'date', label: 'Date' }]);
  assert.equal(pendingForPr.privateField, undefined);
  assert.equal(pendingForPr.clubImage, '/club.png');
  assert.equal(shapeCommitteeWorkflowRequest(record('english', 'pending_english'), account, 'pr', { activeOnly: true }), null);
  const prStatusView = shapeCommitteeWorkflowRequest(record('english', 'pending_english'), account, 'pr');
  assert.equal(prStatusView.status, 'pending_english');
  assert.deepEqual(prStatusView.workflowActions, []);
  assert.equal(shapeCommitteeWorkflowRequest(record('pr'), { email: 'english@example.edu', role: 'english' }, 'english', { activeOnly: true }), null);
});

test('committee workflow actions respect assignment emails regardless of email casing', () => {
  const request = record('pr');
  request.workflow.assignedEmails = ['PR@EXAMPLE.EDU'];
  const shaped = shapeCommitteeWorkflowRequest(request, { email: 'pr@example.edu', role: 'pr' }, 'pr', { activeOnly: true });
  assert.deepEqual(shaped.workflowActions, ['approve', 'request_changes']);
  assert.equal(shapeCommitteeWorkflowRequest(request, { email: 'other@example.edu', role: 'pr' }, 'pr', { activeOnly: true }), null);
});

test('committee type visibility keeps Entry Permits out of English and regular events out of Security', () => {
  const entryPermit = { ...record('security', 'pending_security'), type: 'entry_permit' };
  assert.equal(shapeCommitteeWorkflowRequest(entryPermit, { email: 'english@example.edu', role: 'english' }, 'english'), null);
  const event = record('security', 'pending_security');
  assert.equal(shapeCommitteeWorkflowRequest(event, { email: 'security@example.edu', role: 'security' }, 'security'), null);
});
