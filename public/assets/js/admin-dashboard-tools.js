(() => {
  const rows = [
    ['staff', 'Staff accounts', 'Manage staff access, dashboard roles and club assignments.', 'staff', 'shield', 'blue'],
    ['heads', 'Committee heads', 'Manage head accounts and their club committees.', 'staff', 'crown', 'violet'],
    ['supervisors', 'Supervisors', 'Manage supervisors and the clubs they review.', 'staff', 'userCheck', 'green'],
    ['account-passwords', 'Account passwords', 'Set and confirm a new club or dashboard account password.', 'staff', 'lock', 'amber'],
    ['recovery', 'Account recovery', 'Send a reset link to a registered club or dashboard account.', 'staff', 'key', 'amber'],
    ['admin-settings', 'Administrator login', 'View the current administrator and permitted login settings.', 'staff', 'settings', 'violet'],
    ['clubs', 'Club management', 'Create and edit club details, images and registration settings.', 'website', 'clubs', 'violet'],
    ['excel-review', 'Import clubs from Excel', 'Review club details and embedded logos, then create or update clubs and assign their President and Vice President roles.', 'people', 'file', 'green'],
    ['applications', 'Applications', 'Review full applications, interview notes, ratings and decisions.', 'people', 'clipboard', 'amber'],
    ['members', 'Member directory', 'Look up member profiles, committees and club rosters.', 'people', 'addressBook', 'amber'],
    ['committees', 'Committee registration', 'Open, close or mark individual club committees as full.', 'website', 'door', 'green'],
    ['application-forms', 'Application questions', 'Build club questions, answer types and required fields.', 'website', 'form', 'violet'],
    ['publishing', 'University publishing', 'Publish MIU events, announcements, polls and evaluations.', 'website', 'megaphone', 'blue'],
    ['miu-attendance', 'University attendance', 'Manage attendance teams for university events.', 'attendance', 'calendarCheck', 'green'],
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
  if (typeof module !== 'undefined' && module.exports) module.exports = tools;
  else window.adminDashboardTools = tools;
})();
