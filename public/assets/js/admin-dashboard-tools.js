(() => {
  const rows = [
    ['staff', 'Staff accounts', 'Manage staff access, dashboard roles and club assignments.', 'staff', 'shield', 'blue'],
    ['heads', 'Committee heads', 'Manage head accounts and their club committees.', 'staff', 'crown', 'violet'],
    ['supervisors', 'Supervisors', 'Manage supervisors and the clubs they review.', 'staff', 'userCheck', 'green'],
    ['account-passwords', 'Account passwords', 'Set and confirm a new club or dashboard account password.', 'staff', 'lock', 'amber'],
    ['recovery', 'Account recovery', 'Send a reset link to a registered club or dashboard account.', 'staff', 'key', 'amber'],
    ['admin-settings', 'Administrator login', 'View the current administrator and permitted login settings.', 'staff', 'settings', 'violet'],
    ['clubs', 'Club management', 'Create and edit club details, images and registration settings.', 'website', 'clubs', 'violet'],
    ['workflows', 'Workflow management', 'Configure approval stages, roles, revision fields and review current requests.', 'website', 'sort', 'violet'],
    ['blocked-requests', 'Blocked approval requests', 'Find requests waiting for eligible reviewers and resolve missing staff assignments.', 'website', 'clipboard', 'amber'],
    ['custom-roles', 'Roles & dashboards', 'Create staff roles, choose their dashboard tools and assign MIU staff emails.', 'staff', 'shield', 'violet'],
    ['excel-review', 'Import clubs from Excel', 'Review club details and embedded logos, then create or update clubs and assign their President and Vice President roles.', 'people', 'file', 'green'],
    ['applications', 'Applications', 'Review full applications, interview notes, ratings and decisions.', 'people', 'clipboard', 'amber'],
    ['members', 'Member directory', 'Look up member profiles, committees and club rosters.', 'people', 'addressBook', 'amber'],
    ['committees', 'Committee registration', 'Open, close or mark individual club committees as full.', 'website', 'door', 'green'],
    ['application-forms', 'Application questions', 'Build club questions, answer types and required fields.', 'website', 'form', 'violet'],
    ['publishing', 'University publishing', 'Publish MIU events, announcements, polls and evaluations.', 'website', 'megaphone', 'blue'],
    ['miu-attendance', 'University attendance', 'Manage attendance teams for university events.', 'attendance', 'calendarCheck', 'green'],
    ['secure-attendance', 'Event attendance & capacity', 'Scan personal student QR codes and manage event registration capacity.', 'attendance', 'badgeCheck', 'green'],
    ['attendance', 'Club attendance', 'Download member attendance sheets and event roles.', 'attendance', 'badgeCheck', 'amber'],
    ['open-attendance', 'Open-event attendance', 'Export attendance for events open to all students.', 'attendance', 'ticket', 'green'],
    ['reports', 'Event reports', 'Download event reports for a year or custom date range.', 'attendance', 'file', 'violet'],
    ['homepage', 'Homepage', 'Update the welcome title and introduction visitors see.', 'website', 'home', 'blue'],
    ['club-order', 'Club card ordering', 'Arrange club cards while preserving status and pin groups.', 'website', 'sort', 'blue'],
    ['website-content', 'Published website content', 'Browse club events, news, booths, sponsors and MIU updates.', 'website', 'globe', 'blue'],
    ['archives', 'Archived clubs', 'Find archived clubs and restore them to the website.', 'website', 'archive', 'green'],
    ['club-feedback', 'Student club feedback', 'Review club ratings, comments and individual responses.', 'insights', 'messageStar', 'amber'],
    ['university-feedback', 'MIU polls & evaluations', 'View poll votes and university evaluation responses.', 'insights', 'vote', 'green'],
    ['club-analytics', 'Club performance', 'Compare demand, capacity, acceptance and club page views.', 'insights', 'trend', 'blue'],
    ['quiz-points', 'Club quiz points', 'See club quiz points, counted once per signed-in account.', 'insights', 'chart', 'violet'],
    ['event-analytics', 'Event performance', 'Explore views, registrations, interest and verified check-ins.', 'insights', 'calendarChart', 'violet'],
    ['analytics', 'Visitor analytics', 'See visitor totals, online accounts and device activity.', 'insights', 'chart', 'blue'],
    ['all-activity-log', 'All Activity Log', 'Review every recorded change across website accounts and roles.', 'insights', 'history', 'violet'],
    ['developer-activity-log', 'Developer Activity Log', 'Review changes made by Software Development accounts.', 'insights', 'code', 'blue'],
    ['data', 'Data status', 'Check database availability and saved website records.', 'insights', 'database', 'violet'],
    ['profile', 'My account photo', 'Add, change or remove your administrator profile photo.', 'people', 'camera', 'green']
  ];
  const tools = rows.map(([id, title, description, category, symbol, color]) => ({ id, title, description, category, symbol, color }));
  const groupRows = [
    ['staff-roles', 'Staff & roles', 'Staff accounts, committee heads, supervisors and dashboard roles.', 'staff', 'shield', 'blue', ['staff', 'heads', 'supervisors', 'custom-roles']],
    ['account-security', 'Accounts & security', 'Passwords, account recovery, administrator login and your profile photo.', 'staff', 'lock', 'amber', ['account-passwords', 'recovery', 'admin-settings', 'profile']],
    ['club-setup', 'Clubs & registration', 'Club details, Excel imports, committee registration and archived clubs.', 'website', 'clubs', 'violet', ['clubs', 'excel-review', 'committees', 'archives']],
    ['approvals', 'Workflows & approvals', 'Approval stages, reviewer permissions and requests waiting for reviewers.', 'website', 'clipboard', 'amber', ['workflows', 'blocked-requests']],
    ['applications-members', 'Applications & members', 'Applications, interview decisions, application questions and member records.', 'people', 'addressBook', 'green', ['applications', 'application-forms', 'members']],
    ['website-publishing', 'Publishing & website', 'University publishing, published club content, homepage text and club card order.', 'website', 'globe', 'blue', ['publishing', 'website-content', 'homepage', 'club-order']],
    ['attendance-reports', 'Attendance & reports', 'Personal QR scanner, event capacity, attendance teams and reports.', 'attendance', 'calendarCheck', 'green', ['secure-attendance', 'miu-attendance', 'attendance', 'open-attendance', 'reports']],
    ['feedback', 'Feedback & evaluations', 'Student club feedback, university poll votes and evaluation responses.', 'insights', 'messageStar', 'amber', ['club-feedback', 'university-feedback']],
    ['performance', 'Analytics & points', 'Club and event performance, club quiz points and website visitor analytics.', 'insights', 'chart', 'violet', ['club-analytics', 'event-analytics', 'quiz-points', 'analytics']],
    ['activity-system', 'Activity & system', 'All activity, developer activity and database status.', 'insights', 'history', 'violet', ['all-activity-log', 'developer-activity-log', 'data']]
  ];
  const groups = groupRows.map(([key, title, description, category, symbol, color, toolIds]) => ({ id: 'group-' + key, key, title, description, category, symbol, color, toolIds }));
  Object.defineProperty(tools, 'groups', { value: groups });
  if (typeof module !== 'undefined' && module.exports) module.exports = tools;
  else window.adminDashboardTools = tools;
})();
