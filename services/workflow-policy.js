const { isDeepStrictEqual } = require('node:util');
const roles = ['admin', 'software_development', 'president', 'vice_president', 'head', 'supervisor', 'pr', 'english', 'security', 'sso', 'dean', 'miu_events'];
const types = ['event', 'feed', 'sponsor', 'booth', 'entry_permit', 'speaker', 'speaker_miu', 'speaker_public'];
const actions = ['approve', 'reject', 'request_changes', 'comment', 'forward', 'assign', 'history', 'view_all'];
const common = { title: ['Title', 'text', 140, true], description: ['Description', 'textarea', 2000], date: ['Date', 'date', 40], time: ['Time', 'time', 40], location: ['Location', 'text', 140], image: ['Image', 'image', 4194304] };
const fields = {
  event: { ...common, budget: ['Budget', 'text', 80], registrationEnabled: ['Registration enabled', 'boolean'], attendanceEnabled: ['Record attendance', 'boolean'], attendanceAudience: ['Audience', 'audience'] },
  feed: { title: common.title, description: common.description, image: common.image },
  sponsor: Object.fromEntries(['sponsorName', 'sponsorCompany', 'sponsorContact', 'sponsorEmail', 'sponsorPhone', 'sponsorType', 'sponsorAmount', 'sponsorBenefits', 'sponsorDescription', 'sponsorLogo', 'sponsorAttachment', 'sponsorNotes'].map(key => [key, [key.replace(/^sponsor/, '').replace(/([A-Z])/g, ' $1').trim(), key === 'sponsorLogo' ? 'image' : key === 'sponsorAttachment' ? 'file' : key.includes('Description') || key.includes('Notes') || key.includes('Benefits') ? 'textarea' : 'text', ['sponsorLogo', 'sponsorAttachment'].includes(key) ? 4194304 : 2000, key === 'sponsorName']])),
  booth: { ...common, ...Object.fromEntries(['boothName', 'boothPurpose', 'boothDescription', 'boothLocation', 'boothSize', 'boothEquipment', 'boothSetupDate', 'boothOpenDate', 'boothCloseDate', 'boothContact', 'boothNotes'].map(key => [key, [key.replace(/^booth/, '').replace(/([A-Z])/g, ' $1').trim(), key.includes('Date') ? 'date' : key.includes('Description') || key.includes('Notes') ? 'textarea' : 'text', 2000, key === 'boothName']])) },
  entry_permit: { title: common.title, description: common.description, date: common.date, time: common.time, location: common.location, permitItems: ['Permit items', 'permit', 0, true] },
  speaker: Object.fromEntries(['speakerName', 'jobTitleCompany', 'linkedinProfile', 'proposedTopic', 'speakerSelectionReason', 'expectedStudentBenefit', 'shortBio', 'sessionFormat', 'availability', 'specialRequirements', 'speakerAttachments'].map(key => [key, [key.replace(/([A-Z])/g, ' $1').trim(), key === 'speakerAttachments' ? 'speaker_files' : ['speakerSelectionReason', 'expectedStudentBenefit', 'shortBio', 'specialRequirements'].includes(key) ? 'textarea' : 'text', ['speakerName'].includes(key) ? 160 : ['linkedinProfile', 'availability'].includes(key) ? 500 : ['jobTitleCompany', 'proposedTopic'].includes(key) ? 300 : 2000, ['speakerName', 'jobTitleCompany', 'proposedTopic'].includes(key)]]))
};
fields.speaker_miu = fields.speaker;
fields.speaker_public = fields.speaker;
class WorkflowError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new WorkflowError(status, message); };
const clone = value => JSON.parse(JSON.stringify(value));
const clean = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const descriptors = type => Object.entries(fields[type] || {}).map(([id, [label, kind, maxLength, required]]) => ({ id, label, kind, maxLength, required: !!required }));
function validateDefinition(input, type, customRoles = []) {
  if (!types.includes(type)) fail(400, 'Unknown request type.');
  if (!input || !Array.isArray(input.stages) || !input.stages.length || input.stages.length > 20) fail(422, 'Add between 1 and 20 stages.');
  const stages = input.stages.map(raw => {
    const id = clean(raw.id, 40);
    if (!/^[a-z][a-z0-9_-]{0,39}$/.test(id)) fail(422, 'Stage IDs must be stable lowercase identifiers.');
    const name = clean(raw.name, 100);
    if (!name || !Array.isArray(raw.roles) || !raw.roles.length || raw.roles.some(role => !roles.includes(role) && !customRoles.some(custom => custom.key === role && custom.enabled && custom.modules.includes('requests') && custom.requestTypes.includes(type)))) fail(422, `Choose a name and eligible roles for ${id}.`);
    if (!['any', 'all_roles'].includes(raw.approvalRule)) fail(422, 'Choose one reviewer or all assigned roles.');
    const permissions = {};
    for (const role of raw.roles) {
      const allowed = raw.permissions?.[role] || [];
      if (!Array.isArray(allowed) || allowed.some(action => !actions.includes(action))) fail(422, 'Unknown workflow permission.');
      const custom = customRoles.find(item => item.key === role);
      if (custom && allowed.some(action => !custom.permissions.includes(action))) fail(422, `${custom.name} cannot receive permissions beyond its role settings.`);
      permissions[role] = [...new Set(allowed)];
      if (raw.approvalRule === 'all_roles' && !allowed.includes('approve')) fail(422, `Role ${role} needs approval permission in ${name}.`);
    }
    if (!raw.automatic && !Object.values(permissions).some(allowed => allowed.includes('approve'))) fail(422, `Assign approval permission to at least one role in ${name}.`);
    const editableFields = raw.editableFields;
    const reviewFields = raw.reviewFields || Object.keys(fields[type]);
    if (!Array.isArray(reviewFields) || !reviewFields.length || reviewFields.some(field => !Object.hasOwn(fields[type], field))) fail(422, `Choose valid inspectable fields for ${name}.`);
    if (!Array.isArray(editableFields) || editableFields.some(field => !Object.hasOwn(fields[type], field))) fail(422, `Choose valid revision fields for ${name}.`);
    if (editableFields.some(field => !reviewFields.includes(field))) fail(422, 'Revision fields must also be inspectable by the stage.');
    if (Object.values(permissions).some(list => list.includes('request_changes')) && !editableFields.length) fail(422, `${name} needs at least one eligible revision field.`);
    return { id, name, roles: [...new Set(raw.roles)], reviewFields: [...new Set(reviewFields)], enabled: raw.enabled !== false, next: clean(raw.next, 40), resubmit: clean(raw.resubmit || id, 40),
      approvalRule: raw.approvalRule, permissions, editableFields: [...new Set(editableFields)], commentOnApprove: raw.commentOnApprove === true,
      automatic: raw.automatic === true, requireAllRevisions: raw.requireAllRevisions !== false,
      escalationTargets: Array.isArray(raw.escalationTargets) ? [...new Set(raw.escalationTargets.map(value => clean(value, 40)))] : [] };
  });
  const byId = new Map(stages.map(stage => [stage.id, stage]));
  if (byId.size !== stages.length) fail(422, 'Stage IDs must be unique.');
  const start = clean(input.start, 40);
  if (!byId.has(start)) fail(422, 'Choose a valid starting stage.');
  for (const stage of stages) {
    if (stage.next && !byId.has(stage.next) || !byId.has(stage.resubmit) || stage.enabled && !byId.get(stage.resubmit).enabled) fail(422, `Invalid next or revision stage for ${stage.name}.`);
    if (stage.automatic && stage.enabled && (stage.editableFields.length || !stage.next)) fail(422, 'Automatic stages must forward to another stage without approval or revision fields.');
    for (const target of stage.escalationTargets) if (!byId.has(target) || !byId.get(target).enabled || target === stage.id) fail(422, 'Escalation must target another enabled stage.');
    const seen = new Set(); let next = stage;
    while (next) { if (seen.has(next.id)) fail(422, 'Forward routing contains a cycle.'); seen.add(next.id); next = byId.get(next.next); }
  }
  const reachable = new Set(); let cursor = byId.get(start);
  while (cursor) { reachable.add(cursor.id); cursor = byId.get(cursor.next); }
  for (const stage of stages) if (stage.enabled && !reachable.has(stage.id)) fail(422, `Stage ${stage.name} is inaccessible from the starting stage.`);
  if (!stages.some(stage => stage.enabled && !stage.automatic)) fail(422, 'Keep at least one explicit approval stage.');
  for (const stage of stages) for (const target of stage.escalationTargets) {
    let next = byId.get(stage.next), found = false;
    while (next) { if (next.id === target) found = true; next = byId.get(next.next); }
    if (!found) fail(422, 'Escalation may only move forward along the configured path.');
  }
  return { type, name: clean(input.name, 120) || type, start, enabled: input.enabled !== false, stages };
}
function defaults(type) {
  const order = type === 'entry_permit' ? [['supervisor', 'Supervisor'], ['pr', 'PR review'], ['security', 'Security'], ['pr_final', 'PR final approval']]
    : type === 'speaker_miu' ? [['dean', 'Dean']]
      : type === 'speaker_public' ? [['president', 'Club review'], ['supervisor', 'Supervisor'], ['dean', 'Dean']]
    : type === 'speaker' ? [['supervisor', 'Supervisor'], ['dean', 'Dean']]
      : [['supervisor', 'Supervisor'], ['pr', 'PR'], ['english', 'English'], ['dean', 'Dean']];
  return validateDefinition({ name: `${type.replace('_', ' ')} approval`, enabled: true, start: order[0][0], stages: order.map(([id, name], index) => {
    const role = id === 'pr_final' ? 'pr' : id;
    return { id, name, enabled: true, roles: [role], next: order[index + 1]?.[0] || '', resubmit: id, approvalRule: 'any',
      permissions: { [role]: ['approve', 'reject', 'request_changes', 'comment', 'forward', 'assign', 'history', 'view_all'] }, editableFields: Object.keys(fields[type]) };
  }) }, type);
}
function assignments(actor) { return actor?.assignments?.length ? actor.assignments : actor ? [actor] : []; }
function sameEmail(left, right) { return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase(); }
function permitted(actor, role, action) {
  if (!require('./staff-role-keys').isCustomRole(role)) return true;
  return !!actor?.customRoles?.some(custom => custom.key === role && custom.enabled && custom.modules.includes('requests') && custom.permissions.includes(action));
}
function scoped(actor, role, record) {
  if (require('./staff-role-keys').isCustomRole(role)) {
    const custom = actor?.customRoles?.find(item => item.key === role && item.enabled && item.modules.includes('requests'));
    const type = record.workflow?.definition.type || record.type || (record.hostingType === 'miu' ? 'speaker_miu' : record.requesterType === 'club' ? 'speaker' : 'speaker_public');
    if (!custom || !custom.requestTypes.includes(type)) return false;
    return assignments(actor).some(assignment => assignment.role === role && (custom.scope === 'global' || (assignment.assignedClubIds || []).map(Number).includes(Number(record.clubId))));
  }
  return assignments(actor).some(assignment => assignment.role === role && (['president', 'vice_president', 'head'].includes(role)
    ? Number(assignment.clubId) === Number(record.clubId) && (role !== 'head' || actor.email === record.assignedHeadEmail || actor.email === record.workflow?.ownerEmail)
    : role === 'supervisor' ? (assignment.assignedClubIds || []).map(Number).includes(Number(record.clubId)) : true));
}
function owner(actor, record) { return !!actor && (actor.admin || actor.email === record.requesterEmail || ['president', 'vice_president', 'head'].some(role => scoped(actor, role, record))); }
function eligibleRoles(actor, record, stage) {
  if (!actor || actor.email === record.workflow?.ownerEmail) return [];
  return stage.roles.filter(role => (actor.admin && role === 'admin' || scoped(actor, role, record))
    && (!record.workflow.assignedEmails?.length || record.workflow.assignedEmails.some(email => sameEmail(email, actor.email))));
}
function mayView(actor, record) {
  if (!record.workflow) return false;
  if (owner(actor, record)) return true;
  return record.workflow.definition.stages.some(stage => stage.roles.some(role => scoped(actor, role, record)
    && (stage.id === record.workflow.stageId && (!record.workflow.assignedEmails?.length || record.workflow.assignedEmails.some(email => sameEmail(email, actor.email))) || stage.permissions[role]?.includes('view_all') && permitted(actor, role, 'view_all'))));
}
function authorize(actor, record, action) {
  if (!mayView(actor, record)) fail(404, 'Request not found.');
  const flow = record.workflow, stage = flow.definition.stages.find(item => item.id === flow.stageId);
  if (flow.state !== 'review' || !stage) fail(409, 'This request is not awaiting a review decision.');
  const allowed = eligibleRoles(actor, record, stage).filter(role => stage.permissions[role]?.includes(action) && permitted(actor, role, action));
  if (!allowed.length) fail(403, 'This action is not permitted at the current stage.');
  return { stage, role: allowed[0] };
}
function visibleFields(record) { return Object.fromEntries(Object.keys(fields[record.type || 'speaker']).map(key => [key, record[key] ?? (fields[record.type || 'speaker'][key][1] === 'boolean' ? false : '')])); }
function revisionPatch(record, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) fail(422, 'Enter the requested corrections.');
  const allowed = record.workflow.revisionFields || [], result = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.includes(key) || !Object.hasOwn(fields[record.type || 'speaker'], key)) fail(403, `Field ${key} is locked for this revision.`);
    const [label, kind, maxLength, required] = fields[record.type || 'speaker'][key];
    if (kind === 'boolean') { if (typeof value !== 'boolean') fail(422, `${label} must be true or false.`); result[key] = value; }
    else if (['permit', 'speaker_files'].includes(kind)) {
      if (!Array.isArray(value) || !value.length || value.length > 100) fail(422, `Provide valid ${label}.`);
      if (kind === 'permit') result[key] = value.map(row => {
        if (!row || Object.keys(row).some(field => !['quantity', 'number', 'details', '_id'].includes(field)) || !Number.isSafeInteger(Number(row.quantity)) || Number(row.quantity) < 1 || Number(row.quantity) > 10000 || !clean(row.number, 80) || !clean(row.details, 1000)) fail(422, 'Complete every permit row.');
        return { quantity: Number(row.quantity), number: clean(row.number, 80), details: clean(row.details, 1000) };
      });
      else result[key] = clone(value); // Attachment ownership is verified by the existing upload service before saving.
    } else {
      if (typeof value !== 'string' || value.length > maxLength || required && !value.trim()) fail(422, `Provide a valid ${label} (${maxLength} characters maximum).`);
      if (kind === 'date' && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) fail(422, `Choose a valid ${label}.`);
      if (kind === 'time' && value && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) fail(422, 'Choose a valid time.');
      if (kind === 'audience' && !['members', 'all_students'].includes(value)) fail(422, 'Choose a valid audience.');
      if (key === 'sponsorEmail' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail(422, 'Enter a valid sponsor email address.');
      result[key] = value.trim();
    }
  }
  if (!Object.entries(result).some(([key, value]) => !isDeepStrictEqual(value, record[key]))) fail(422, 'Change at least one requested field before resubmitting.');
  return result;
}
module.exports = { roles, types, actions, fields, descriptors, validateDefinition, defaults, assignments, scoped, permitted, owner, eligibleRoles, mayView, authorize, visibleFields, revisionPatch, WorkflowError, fail, clone, clean };
