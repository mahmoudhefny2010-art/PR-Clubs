const ExcelJS = require('exceljs');
const { formatSheet } = require('../public/assets/js/spreadsheet-export');
async function attendanceWorkbook(rows, details = {}) {
  const removed = new Set(['From time', 'To time', 'Type']);
  const keep = (rows[0] || []).map((heading, index) => removed.has(heading) ? -1 : index).filter(index => index >= 0);
  rows = rows.map(row => keep.map(index => row[index]));
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'MIU Clubs';
  const headings = rows[0] || [], records = rows.slice(1);
  const index = name => headings.indexOf(name);
  const value = (row, name) => index(name) < 0 ? '' : row[index(name)];
  const registered = details.sheet === 'registered';
  const openAudience = index('Membership') >= 0;
  const knownEmails = new Set(records.map(row => String(value(row, 'MIU email') || '').trim().toLowerCase()).filter(Boolean));
  const summary = [ ['Metric', 'Value', 'Details'],
    ['Export type', registered ? 'Registered attendees' : openAudience ? 'Open event verified check-ins' : 'Verified check-ins', registered ? 'Registration does not prove attendance.' : 'Recorded check-ins; administrative approval is tracked separately.'],
    ['Exported records', records.length, 'Number of participant rows in the Attendance sheet.'],
    ['Unique recorded emails', knownEmails.size, 'Unique people identified by their recorded email within this export.'],
    ['Missing MIU ID', records.filter(row => !value(row, 'MIU ID')).length, 'IDs are read from the current student profile; missing IDs are not guessed.'],
    ['Missing major', records.filter(row => !value(row, 'Major')).length, 'Major is read from the current student profile.'],
    ['Generated at (UTC)', new Date().toISOString(), 'Export generation time.'],
    ['Period start', details.period?.start || 'All dates', 'Activity-date filter; both boundaries are inclusive.'],
    ['Period end', details.period?.end || 'All dates', 'Activity-date filter; both boundaries are inclusive.'] ];
  if (index('Membership') >= 0) {
    summary.push(['Member check-ins', records.filter(row => value(row, 'Membership') === 'Member').length, 'Membership was recorded from existing club roster and accepted applications at check-in time.']);
    summary.push(['Non-member check-ins', records.filter(row => value(row, 'Membership') === 'Non-member').length, 'No active club membership was found at check-in time.']);
  }
  const statuses = new Map();
  for (const row of records) { const status = value(row, 'Approval status'); if (status) statuses.set(status, (statuses.get(status) || 0) + 1); }
  for (const [status, count] of statuses) summary.push(['Approval: ' + status.replace(/_/g, ' '), count, 'Administrative review status, not a separate attendance count.']);
  formatSheet(workbook, summary, 'Summary');
  const activities = new Map();
  for (const row of records) {
    const key = JSON.stringify(['Club', 'Event', 'Event date', 'Type'].map(name => value(row, name)));
    if (!activities.has(key)) activities.set(key, { row, count: 0 });
    activities.get(key).count++;
  }
  const events = [['Club', 'Event', 'Event date', 'Location', 'Description', 'Exported participants', 'Data source']];
  for (const { row, count } of activities.values()) events.push([
    ...['Club', 'Event', 'Event date'].map(name => value(row, name)),
    details.event?.location || 'Not recorded', details.event?.description || 'Not recorded', count,
    details.event?.source === 'attendance' ? 'Existing attendance activity' : details.event ? 'Existing published event' : 'Existing attendance records']);
  formatSheet(workbook, events, 'Event details');
  formatSheet(workbook, rows, 'Attendance');
  const history = [['Participant', 'MIU email', 'Reviewer role', 'Action', 'Review time (UTC)', 'Review note']];
  for (const person of details.people || []) for (const review of person.approvalHistory || []) history.push([
    person.name || '', person.email || '', review.role || '', review.action || '', review.createdAt ? new Date(review.createdAt).toISOString() : '', review.note || '']);
  formatSheet(workbook, history, 'Review history');
  workbook.views = [{ activeTab: 2 }];
  return workbook.xlsx.writeBuffer();
}
module.exports = { attendanceWorkbook };
