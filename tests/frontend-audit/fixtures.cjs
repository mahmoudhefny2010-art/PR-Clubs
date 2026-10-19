// Synthetic test records. These fixtures never read .env, data/, or any real database.
const event = { id: 101, requestId: 101, title: 'Campus workshop', description: 'A sample event for the frontend audit.', date: '2026-10-09', time: '14:30', location: 'Main hall', image: '/assets/img/pics/mun.jpg', status: 'published', type: 'event', createdAt: '2026-10-08T10:00:00Z' };
const clubs = [
  { id: 1, name: 'MUN', category: 'Debate & Leadership', tagline: 'Learn, discuss, participate.', description: 'A sample university club.', status: 'open', members: 23, applicants: 2, capacity: 30, image: '/assets/img/pics/mun.jpg', events: [event], posts: [], sponsors: [], booths: [], committees: ['Organizing'], applicationFields: [], interviewFields: [], pinned: true },
  { id: 2, name: 'IEEE', category: 'Technology', tagline: 'Build and learn together.', description: 'A sample technology club.', status: 'full', members: 26, applicants: 3, capacity: 26, image: '/assets/img/pics/ieee.jpg', events: [], posts: [], sponsors: [], booths: [], committees: [], applicationFields: [], interviewFields: [] },
];
const content = ['event', 'feed', 'sponsor', 'booth', 'entry_permit'].map((type, index) => ({ ...event, id: 101 + index, type, title: type === 'entry_permit' ? 'Campus access request' : event.title, status: type === 'entry_permit' ? 'approved' : 'draft', clubId: 1, clubName: 'MUN', clubImage: clubs[0].image, workflowHistory: type === 'entry_permit' ? [{ role: 'club', action: 'submitted', toStatus: 'pending_pr', createdAt: '2026-10-09T06:00:00Z' }, { role: 'pr', action: 'approve', toStatus: 'pending_security', createdAt: '2026-10-09T06:15:00Z' }, { role: 'security', action: 'approve', toStatus: 'pending_dean', createdAt: '2026-10-09T06:30:00Z' }, { role: 'dean', action: 'approve', toStatus: 'approved', createdAt: '2026-10-09T07:00:00Z' }] : [], comments: [], boothName: 'Campus booth', boothPurpose: 'Information', boothLocation: 'Courtyard', boothOpenDate: '2026-10-09', boothCloseDate: '2026-10-10', sponsorCompany: 'Example Company', sponsorType: 'Support', sponsorAmount: '1000' }));
content[4].workflowHistory = [
  { role: 'club', action: 'submitted', fromStatus: 'draft', toStatus: 'pending_pr', createdAt: '2026-10-09T06:00:00Z' },
  { role: 'pr', action: 'approve', fromStatus: 'pending_pr', toStatus: 'pending_security', createdAt: '2026-10-09T06:15:00Z' },
  { role: 'security', action: 'approve', fromStatus: 'pending_security', toStatus: 'pending_pr', createdAt: '2026-10-09T06:30:00Z' },
  { role: 'pr', action: 'approve', fromStatus: 'pending_pr', toStatus: 'approved', createdAt: '2026-10-09T07:00:00Z' },
];
const requests = [{ ...content[0], status: 'pending_pr', workflowHistory: [{ action: 'submitted', role: 'club', at: '2026-10-08T10:00:00Z' }] }];
const permit = { ...content[4], id: 105, title: 'Campus access request', status: 'pending_security', description: 'Request entry for an evening club activity.', location: 'Main campus gate', date: '2026-10-20', time: '17:00', workflowHistory: [{ role: 'club', action: 'submitted', fromStatus: 'draft', toStatus: 'pending_pr', createdAt: '2026-10-08T10:00:00Z' }, { role: 'pr', action: 'approve', fromStatus: 'pending_pr', toStatus: 'pending_security', createdAt: '2026-10-08T11:00:00Z' }] };
const initialUniversityRecords = () => [
  { id: 701, type: 'announcement', title: 'MIU community update', description: 'A university announcement shown to students.', image: '/assets/img/pics/logo.svg.png', createdAt: '2026-10-09T10:00:00.000Z', updatedAt: '2026-10-09T10:00:00.000Z' },
  { id: 702, type: 'event', title: 'University welcome event', description: 'A sample university event.', date: '2026-10-20', time: '10:30', location: 'Main Hall', image: '/assets/img/pics/logo.svg.png', attendanceAudience: 'all_students', createdAt: '2026-10-09T10:00:00.000Z', updatedAt: '2026-10-09T10:00:00.000Z' }
].map(item => ({ ...item, organization: { id: 0, type: 'university', name: 'Misr International University', image: '/assets/img/pics/logo.svg.png' } }));
let universityRecords = initialUniversityRecords();
let permitStatus = 'pending_security';
let permitSecurityApproved = false;
function reset() { permitStatus = 'pending_security'; permitSecurityApproved = false; universityRecords = initialUniversityRecords(); }
function respond(url, method, referer, body, scenario = '') {
  const p = url.pathname;
  if (p.startsWith('/api/public-content/')) {
    const section = p.split('/').pop();
    const university = respond(new URL('/api/university-content', url), 'GET', referer, null, scenario)[1];
    let rows = [];
    const collection = section === 'updates' ? 'posts' : section;
    for (const club of clubs) for (const key of section === 'feed' ? ['events', 'posts'] : [collection]) {
      rows.push(...(club[key] || []).map((item, index) => ({ club, item, index, collection: key, university: false })));
    }
    if (['feed', 'events', 'updates'].includes(section)) rows.push(...university
      .filter(item => section === 'feed' || item.type === (section === 'events' ? 'event' : 'announcement'))
      .map(item => ({ item, club: { id: 0, name: 'Misr International University', image: '/assets/img/pics/logo.svg.png' },
        index: item.id, collection: item.type === 'event' ? 'events' : 'posts', university: true })));
    if (scenario.startsWith('pagination-')) {
      const total = scenario.includes('-empty') ? 0 : scenario.includes('-single') ? 3 : 93;
      rows = Array.from({ length: total }, (_, index) => ({ club: clubs[0], item: { ...event, title: `Pagination item ${index + 1}`, type: 'announcement' },
        index, collection: section === 'feed' ? (scenario.endsWith('-details') ? 'events' : 'posts') : section === 'updates' ? 'posts' : section, university: false }));
      if (url.searchParams.get('filter') === 'announcements') rows = rows.slice(0, 3);
    }
    const size = { feed: 10, events: 8, sponsors: 8, booths: 10, updates: 10 }[section];
    const totalPages = Math.ceil(rows.length / size), page = Math.max(1, Math.min(Number(url.searchParams.get('page')) || 1, totalPages || 1));
    return [200, { items: rows.slice((page - 1) * size, page * size), pagination: { page, pageSize: size, totalItems: rows.length, totalPages } }];
  }
  if (p === '/api/workflow/context') return [401, { message: 'No workflow fixture session.' }];
  if (scenario.startsWith('account-menu')) {
    if (p === '/api/pwa/version') return [200, { version: 'account-menu-fixture' }];
    const email = 'mahmoud2406700.long.account.name@miuegypt.edu.eg';
    const selectedRole = (scenario === 'account-menu-custom-role' ? 'custom_review' : scenario.match(/^account-menu-role-([a-z_]+)/)?.[1])
      || (scenario === 'account-menu-student-dashboard' ? 'student' : 'president');
    const accountType = selectedRole === 'student' ? 'student' : selectedRole === 'admin' ? 'admin' : 'club';
    if (p === '/api/site/account-session') return [200, { authenticated: selectedRole !== 'expired', type: accountType, role: selectedRole, name: selectedRole === 'president' ? 'MUN' : selectedRole, email, hasStudentDashboard: scenario === 'account-menu-multi-student' || selectedRole === 'student',
      dashboards: selectedRole === 'custom_review' ? [{ role: 'custom_review', label: 'Activities Review Team', href: '/dashboards/custom-role.html?role=custom_review' }] : selectedRole === 'president' ? ['president', 'vice_president', 'head', 'supervisor', 'pr', 'english', 'security', 'sso', 'dean', 'miu_events', 'software_development'].map(role => ({ role, label: role, clubName: ['president', 'vice_president', 'head', 'supervisor'].includes(role) ? 'Model United Nations University Club' : '' })) : [] }];
    if (p === '/api/site/account-photo') return [200, { url: '/assets/img/pics/mun.jpg', prompt: false }];
    if (p === '/api/notifications/config') return [200, { enabled: false }];
    if (p === '/api/miu-attendance-task') return [200, { task: null }];
    if (p === '/api/student/my-forms') return [200, { forms: [] }];
    if (p === '/api/member/attendance-assignments') return [200, []];
    if (p === '/api/student-auth/profile') return [200, { name: 'Test Student', email }];
  }
  const role = /security-dashboard/.test(referer) ? 'security' : /english-dashboard/.test(referer) ? 'english' : /dean-dashboard|__audit\/dean-entry-permit/.test(referer) ? 'dean' : /pr-dashboard/.test(referer) ? 'pr' : /sso-dashboard/.test(referer) ? 'sso' : 'president';
  if (p === '/api/site/visitor-ping' || /\/view$/.test(p)) return [200, { ok: true }];
  if (p === '/api/speaker-requests/context') return [403, { message: 'Speaker manager access required.' }];
  if (p === '/api/report-downloads/clubs') return [200, []];
  if (p === '/api/report-downloads/events') return [200, []];
  if (p === '/api/pwa/version') return [200, { version: 'routing-fixture' }];
  if (p === '/api/notifications/config') return [200, { enabled: false }];
  if (p === '/api/student/my-forms') return [200, { forms: [] }];
  if (p === '/api/member/attendance-assignments') return [200, []];
  if (p === '/api/site/account-session') return [200, /\/admin\/global/.test(referer) ? { authenticated: true, type: 'admin' } : { authenticated: false }];
  if (p === '/api/student-auth/profile') return [401, { message: 'Sign in with a university student account.' }];
  if (p === '/api/feedback/access') return [200, { club: false, university: false }];
  if (p === '/api/clubs') return [200, clubs];
  if (p === '/api/admin/homepage') return [200, { title: 'University Clubs', subtitle: 'Explore all clubs and apply to the ones that match your interests.' }];
  if (p === '/api/club-auth/session') return [200, scenario === 'club-dashboard-expired-session' ? { authenticated: false } : { authenticated: true, club: { id: ['pr', 'english', 'security', 'dean', 'sso'].includes(role) ? 0 : 1, clubId: 1, name: role === 'dean' ? 'Dean' : role === 'security' ? 'Security Office' : role.toUpperCase() === 'PRESIDENT' ? 'MUN' : role.toUpperCase(), email: 'fixture@example.test', role, committee: 'All Committees', image: clubs[0].image } }];
  if (p === '/api/admin/session') return [200, { authenticated: true, configured: true }];
  if (p === '/api/student-auth/session') return [200, { authenticated: true, name: 'Test Student', email: 'student@example.test' }];
  if (p === '/api/student-auth/google-config') return [200, { enabled: false }];
  if (p === '/api/auth/login') return [401, { message: 'Fixture login rejected.' }];
  if (p === '/api/password-reset/request') return [200, { message: 'If the account exists, a reset link has been sent.' }];
  if (p === '/api/password-reset/confirm') return [200, { message: 'Your password has been reset.' }];
  if (p === '/api/club/content' && method === 'GET') return [200, scenario.startsWith('club-entry-permit-') || scenario.startsWith('entry-permit-') ? content : content.slice(0, 4)];
  if (p === '/api/club/attendance-records' && method === 'GET') return [200, scenario === 'club-attendance-approval-status' ? [{ clubId: 1, clubName: 'MUN', itemType: 'event', eventRequestId: 101, eventTitle: 'Campus workshop', eventDate: '2026-10-09', eventTime: '14:30', name: 'Test Student', email: 'student@example.test', attendedAt: '2026-10-09T10:30:00Z', approvalStatus: 'pending_dean' }] : []];
  if (p === '/api/club/content/entry_permit' && method === 'POST') return [201, { id: 105, type: 'entry_permit', status: body?.submit ? 'pending_pr' : 'draft', ...body }];
  if (p.startsWith('/api/club/content/') && method !== 'GET') return [200, { id: 101, status: 'draft', ...body }];
  if (p === '/api/committee/requests' && role === 'security') return [200, permitStatus === 'pending_security' ? [{ ...permit, status: permitStatus, workflowHistory: [...permit.workflowHistory.slice(0, 1), { role: 'pr', action: 'approve', fromStatus: 'pending_pr', toStatus: 'pending_security', createdAt: '2026-10-08T11:00:00Z' }] }] : []];
  if (p === '/api/committee/requests' && role === 'dean' && scenario.startsWith('dean-entry-permit-')) return [200, []];
  if (p === '/api/committee/requests' && role === 'dean' && scenario.startsWith('dean-request-details')) return [200, [{ ...permit, status: 'pending_dean' }]];
  if (p === '/api/committee/requests' && role === 'pr' && scenario.startsWith('pr-entry-permit-')) return [200, permitStatus === 'pending_pr' ? [{ ...permit, status: permitStatus, workflowHistory: [{ role: 'club', action: 'submitted', fromStatus: 'draft', toStatus: 'pending_pr', createdAt: '2026-10-08T10:00:00Z' }] }] : []];
  if (p === '/api/committee/requests' && scenario.startsWith('entry-permit-workflow-')) {
    if (role === 'pr') return [200, permitStatus === 'pending_pr' ? [{ ...permit, status: permitStatus }] : []];
    if (role === 'security') return [200, permitStatus === 'pending_security' ? [{ ...permit, status: permitStatus }] : []];
    if (role === 'dean') return [200, permitStatus === 'pending_dean' ? [{ ...permit, status: permitStatus }] : []];
  }
  if (p === '/api/committee/requests') return [200, requests];
  if (p === '/api/committee/status' && role === 'security') return [200, [{ ...permit, status: permitStatus, workflowHistory: [...permit.workflowHistory.slice(0, 1), { role: 'pr', action: 'approve', fromStatus: 'pending_pr', toStatus: 'pending_security', createdAt: '2026-10-08T11:00:00Z' }] }]];
  if (p === '/api/committee/status' && scenario.startsWith('dean-entry-permit-')) return [200, [{ ...permit, status: 'approved', workflowHistory: [...permit.workflowHistory, { role: 'security', action: 'approve', fromStatus: 'pending_security', toStatus: 'pending_pr', createdAt: '2026-10-08T12:00:00Z' }, { role: 'pr', action: 'approve', fromStatus: 'pending_pr', toStatus: 'approved', createdAt: '2026-10-08T13:00:00Z' }] }]];
  if (p === '/api/committee/status' && role === 'security') return [200, [{ ...permit, status: permitStatus }]];
  if (p === '/api/committee/status' && role === 'english') return [200, requests];
  if (p === '/api/committee/status') return [200, [...requests, ...(scenario.startsWith('dean-entry-permit-') ? [{ ...permit, status: permitStatus }] : [])]];
  if (/^\/api\/committee\/status\/\d+$/.test(p)) {
    const history = scenario.startsWith('dean-entry-permit-')
      ? [...permit.workflowHistory, { role: 'security', action: 'approve', fromStatus: 'pending_security', toStatus: 'pending_pr', createdAt: '2026-10-08T12:00:00Z' }, { role: 'pr', action: 'approve', fromStatus: 'pending_pr', toStatus: 'approved', createdAt: '2026-10-08T13:00:00Z' }]
      : [...permit.workflowHistory.slice(0, 1), { role: 'pr', action: 'approve', fromStatus: 'pending_pr', toStatus: 'pending_security', createdAt: '2026-10-08T11:00:00Z' }];
    return [200, scenario.includes('entry-permit') || role === 'security' ? { ...permit, status: scenario.startsWith('dean-entry-permit-') ? 'approved' : permitStatus, workflowHistory: history } : requests[0]];
  }
  if (/^\/api\/committee\/requests\/\d+\/action$/.test(p) && method === 'POST') {
    if (role === 'dean' && body?.action) return [403, { message: 'The Dean can view Entry Permits but cannot approve or change them.' }];
    permitStatus = role === 'pr' && body?.action === 'approve' ? (permitSecurityApproved ? 'approved' : 'pending_security')
      : role === 'security' && body?.action === 'approve' ? 'pending_pr'
          : body?.action === 'reject' ? 'rejected' : permitStatus;
    if (role === 'security' && body?.action === 'approve') permitSecurityApproved = true;
    const updatedPermit = { ...permit, status: permitStatus, workflowHistory: [...permit.workflowHistory, { role, action: body?.action || 'comment', toStatus: permitStatus, createdAt: '2026-10-09T07:00:00Z' }] };
    if (scenario.startsWith('dean-entry-permit-') && role === 'dean' && body?.action === 'approve') content[4] = { ...updatedPermit };
    return [200, updatedPermit];
  }
  if (/^\/api\/committee\/requests\/\d+\/return-to-committee$/.test(p) && method === 'POST') {
    permitStatus = 'pending_security';
    return [200, { ...permit, status: permitStatus }];
  }
  if (p === '/api/committee/attendance-reviews') return [200, { stage: role, reviews: [] }];
  if (p === '/api/committee/attendance-overview') return [200, { clubs: [], events: [], records: [], totals: { events: 0, registrations: 0, attendees: 0 } }];
  if (/\/attendance-records$/.test(p) || /\/event-registrations$/.test(p) || /\/attendance-events$/.test(p)) return [200, []];
  if (p === '/api/club/members') return [200, { members: [] }];
  if (/\/club-members$/.test(p)) return [200, []];
  if (/\/committee-availability$/.test(p)) return [200, { committees: [], availability: {} }];
  if (/\/application-committees$/.test(p) || /\/committees$/.test(p)) return [200, []];
  if (p === '/api/club/application-form') return [200, { intro: 'Apply to our club.', fields: [] }];
  if (p === '/api/club/interview-form') return [200, { sections: [], fields: [] }];
  if (/\/(?:applications|club-heads|heads|archived)$/.test(p)) return [200, []];
  if (p === '/api/admin/club-views') return [200, { totalViews: 4, clubs: [{ clubId: 1, views: 4 }] }];
  if (p === '/api/admin/event-analytics') return [200, { totals: { views: 4, registrations: 2, checkins: 1 }, events: [{ ...event, clubName: 'MUN', clubId: 1, views: 4, registrations: 2, checkins: 1 }] }];
  if (p === '/api/admin/visitor-analytics') return [200, {
    onlineNow: 1, signedInAccounts: 0, uniqueVisitors: 1, uniqueIps: 1,
    activePeople: scenario === 'admin-anonymous-device-code'
      ? [{ accountType: 'guest', name: 'Device DEV-3A91BC72', deviceCode: 'DEV-3A91BC72', deviceType: 'mobile', deviceName: 'iPhone', browserName: 'Safari', ipAddress: '203.0.113.42', lastSeenAt: '2026-10-11T08:00:00.000Z' }]
      : [],
    deviceTypes: {}, onlineWindowMinutes: 5
  }];
  if (['/api/admin/university-content', '/api/miu-events/content'].includes(p)) {
    if (method === 'GET') return [200, universityRecords];
    if (method === 'POST') {
      if (scenario === 'admin-university-save-failure') return [503, { message: 'Database write could not be confirmed.' }];
      const record = { id: Math.max(0,...universityRecords.map(item=>item.id))+1, ...body, createdAt: '2026-10-09T11:00:00Z', updatedAt: '2026-10-09T11:00:00Z', organization: { id: 0, type: 'university', name: 'Misr International University' } };
      universityRecords.push(record); return [201, record];
    }
  }
  const universityWrite = p.match(/^\/api\/(?:admin\/university-content|miu-events\/content)\/(\d+)$/);
  if (universityWrite) {
    const id=Number(universityWrite[1]);
    if (method === 'DELETE') { universityRecords = universityRecords.filter(item => item.id !== id); return [204, null]; }
    if (method === 'PUT') { const record=universityRecords.find(item=>item.id===id);Object.assign(record, body, { id, updatedAt: '2026-10-09T12:00:00Z' });return [200, record]; }
  }
  if (p === '/api/miu-events/registrations') return [200, []];
  if (p === '/api/university-content') return [200, universityRecords];
  if (/^\/api\/university-content\/\d+$/.test(p)) {
    const record=universityRecords.find(item=>item.id===Number(p.split('/').pop()) && item.type==='event');
    return record ? [200, record] : [404, { message: 'This university event is no longer available.' }];
  }
  if (p.startsWith('/api/attendance/')) return [200, { eventTitle: event.title, clubName: 'MUN', eventDate: event.date, eventTime: event.time, itemType: 'event', message: 'Attendance recorded.' }];
  if (/\/registrations$/.test(p)) return [200, { registered: false, count: 0 }];
  return [404, { message: `No audit fixture for ${method} ${p}` }];
}
module.exports = { respond, reset };
