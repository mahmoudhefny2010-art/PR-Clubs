const Policy = require('./workflow-policy');
const { staffRoleAssignments } = require('./staff-google-auth');

function canCommitteeAccess(role, type) {
  if (role === 'security') return type === 'entry_permit';
  if (role === 'english') return ['event', 'feed', 'sponsor', 'booth'].includes(type);
  return ['pr', 'dean'].includes(role);
}

function shapeCommitteeWorkflowRequest(record, account, role, { activeOnly = false, clubImage = '' } = {}) {
  const flow = record?.workflow;
  if (!flow || !canCommitteeAccess(role, record.type)) return null;
  const actor = { email: String(account?.email || '').toLowerCase(), assignments: staffRoleAssignments(account) };
  if (!Policy.mayView(actor, record)) return null;
  const current = flow.definition?.stages?.find(stage => stage.id === flow.stageId);
  const assigned = !flow.assignedEmails?.length || flow.assignedEmails.some(email => String(email || '').trim().toLowerCase() === actor.email);
  const canReviewCurrentStage = flow.state === 'review' && current?.roles.includes(role) && assigned
    && Policy.scoped(actor, role, record);
  const workflowActions = canReviewCurrentStage
    ? (current.permissions?.[role] || []).filter(action => ['approve', 'reject', 'request_changes'].includes(action)
      && Policy.permitted(actor, role, action)
      && (action !== 'approve' || !(flow.approvals || []).some(approval => String(approval.email || '').trim().toLowerCase() === actor.email)))
    : [];
  if (activeOnly && (flow.state !== 'review' || !current?.roles.includes(role)
    || !current.permissions?.[role]?.some(action => ['approve', 'reject', 'request_changes', 'comment'].includes(action))
    || !assigned || !Policy.scoped(actor, role, record))) return null;
  const viewerStage = activeOnly ? current : flow.definition.stages.find(stage => stage.roles.some(stageRole =>
    Policy.scoped(actor, stageRole, record) && (stage.id === flow.stageId || stage.permissions[stageRole]?.includes('view_all') && Policy.permitted(actor, stageRole, 'view_all'))));
  if (!viewerStage) return null;
  const visible = new Set(viewerStage.reviewFields || []);
  const result = { id: record.id, clubId: record.clubId, clubName: record.clubName, clubImage,
    type: record.type, title: record.title || record.sponsorName || record.boothName || '', status: record.status,
    workflow: true, updatedAt: record.updatedAt, submittedAt: record.createdAt };
  if (workflowActions.length) {
    result.workflowRevision = flow.revision;
    result.workflowActions = workflowActions;
    result.workflowEditableFields = workflowActions.includes('request_changes')
      ? (current.editableFields || []).filter(key => Object.hasOwn(Policy.fields[record.type] || {}, key))
        .map(id => ({ id, label: Policy.fields[record.type][id][0] }))
      : [];
  } else {
    result.workflowActions = [];
  }
  const summaryFields = ['date', 'time', 'location', 'image', 'sponsorName', 'sponsorCompany', 'sponsorType', 'sponsorAmount', 'sponsorLogo',
    'boothName', 'boothLocation', 'boothOpenDate', 'clubNotice'];
  for (const key of summaryFields) if (visible.has(key) && Object.hasOwn(Policy.fields[record.type] || {}, key) && record[key] !== undefined) {
    const value = record[key];
    result[key] = ['image', 'sponsorLogo'].includes(key) && typeof value === 'string' && value.startsWith('data:') ? '' : value;
  }
  result.workflowHistory = (flow.history || []).map(event => ({ role: event.actorRole || (event.actorEmail === flow.ownerEmail ? 'club' : 'system'),
    action: event.action, comment: event.comment || '', createdAt: event.at, fromStatus: '', toStatus: '' }));
  return result;
}

module.exports = { canCommitteeAccess, shapeCommitteeWorkflowRequest };
