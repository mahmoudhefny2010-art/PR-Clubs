const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerReportDownloads, csv, boundaries } = require('../services/report-downloads');
const q = value => ({ select() { return this; }, lean: async () => value });
async function harness(t, overrides = {}) {
  const filters = [];
  const club = { id: 1, name: 'Engineering', events: [
    { requestId: 10, title: 'Opening', date: '2026-01-01', registrationEnabled: true, attendanceEnabled: true },
    { requestId: 11, title: 'Closing', date: '2026-12-31' },
    { requestId: 12, title: 'Outside', date: '2027-01-01' }, { title: 'Undated' }
  ] };
  const attendance = [
    { clubId: 1, itemType: 'event', eventRequestId: 10, eventTitle: 'Opening', eventDate: '2026-01-01', name: 'Check-in name', email: 'student@miuegypt.edu.eg', attendedAt: new Date('2026-01-01T10:00:00Z'), approvalStatus: 'pending_supervisor' },
    { clubId: 1, itemType: 'event', eventRequestId: 11, eventTitle: 'Closing', eventDate: '2026-12-31', name: 'Missing Profile', email: 'missing@miuegypt.edu.eg' },
    { clubId: 2, eventRequestId: 20, eventTitle: 'Private other club', eventDate: '2026-01-01', email: 'private@example.edu' },
    { clubId: 1, eventRequestId: 12, eventTitle: 'Outside', eventDate: '2027-01-01', email: 'outside@example.edu' }
  ];
  const deps = {
    databaseReady: () => true,
    getAccount: async req => req.headers['x-role'] === 'none' ? null : { role: req.headers['x-role'] || 'supervisor', clubId: 1, assignedClubIds: req.headers['x-unassigned'] ? [] : [1] },
    Club: { find(filter) {
      filters.push(filter);
      const clubs = [club, { id: 2, name: 'Other', events: [] }];
      return q(clubs.filter(c => filter.id === undefined || (typeof filter.id === 'number' ? c.id === filter.id : filter.id.$in.includes(c.id))));
    } },
    AttendanceRecord: { find(filter) {
      filters.push(filter);
      return q(attendance.filter(r => {
        const clubMatches = typeof filter.clubId === 'number' ? r.clubId === filter.clubId : filter.clubId.$in.includes(r.clubId);
        const audienceMatches = !filter.attendanceAudience || (filter.attendanceAudience === 'all_students'
          ? r.attendanceAudience === 'all_students' : ['members', undefined].includes(r.attendanceAudience));
        return clubMatches && (!filter.itemType || r.itemType === filter.itemType)
          && (filter.eventRequestId === undefined || r.eventRequestId === filter.eventRequestId)
          && (!filter.eventDate || r.eventDate >= filter.eventDate.$gte && r.eventDate <= filter.eventDate.$lte)
          && audienceMatches;
      }));
    } },
    EventRegistration: { find: () => q([{ clubId: 1, eventIndex: 0, eventTitle: 'Opening' }]) },
    StudentAccount: { find(filter) { filters.push(filter); return q([{ email: 'student@miuegypt.edu.eg', name: 'Full Student Name', universityId: '2026-001', major: 'Computer Science', passwordHash: 'never-export' }]); } },
    Report: { find: () => q([{ clubId: 1, eventKey: 'request:10', status: 'submitted', summary: '=HYPERLINK("unsafe")', objectives: 'Objective', submittedAt: new Date('2026-01-02'), revision: 1 }]) },
    ...overrides
  };
  const app = express(); registerReportDownloads(app, deps);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (path, role = 'supervisor', extra = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/report-downloads${path}`, { headers: { 'x-role': role, ...extra } });
    return { status: response.status, headers: response.headers, text: await response.text() };
  };
  return { request, filters };
}
test('calendar years and custom periods validate strictly', () => {
  assert.deepEqual(boundaries({ year: '2026' }), { start: '2026-01-01', end: '2026-12-31' });
  assert.deepEqual(boundaries({ start: '2024-02-29', end: '2024-02-29' }), { start: '2024-02-29', end: '2024-02-29' });
  for (const query of [{ year: '20e2' }, { year: '0000' }, { year: ['2026', '2027'] }, { year: '2026', start: '2026-01-01' }, { start: '2026-02-29', end: '2026-03-01' }, { start: '2026-12-31', end: '2026-01-01' }]) assert.equal(boundaries(query), null);
});
test('CSV supports commas, quotes, newlines, Unicode and neutralizes formulas', () => {
  const output = csv([['اسم', 'a,b', 'say "yes"', 'line\nnext', '=1+1', ' +cmd', null]]);
  assert.ok(output.startsWith('\ufeff'));
  assert.ok(output.includes('"a,b"')); assert.ok(output.includes('"say ""yes"""'));
  assert.ok(output.includes("\"'=1+1\"")); assert.ok(output.includes("\"' +cmd\""));
});
test('report downloads for four roles include missing reports and filter year boundaries', async t => {
  const { request } = await harness(t);
  for (const role of ['president', 'supervisor', 'dean', 'admin', 'software_development']) {
    const result = await request('/reports.csv?year=2026&clubId=1', role);
    assert.equal(result.status, 200); assert.match(result.headers.get('content-disposition'), /attachment/);
    assert.match(result.text, /Opening/); assert.match(result.text, /Closing/); assert.match(result.text, /No report/);
    assert.match(result.text, /Unavailable/); assert.ok(!result.text.includes('Outside')); assert.ok(!result.text.includes('Undated'));
    assert.ok(result.text.includes("'=HYPERLINK"));
  }
});
test('attendance exports join only checked-in profiles and preserve unavailable values', async t => {
  const { request, filters } = await harness(t);
  for (const role of ['supervisor', 'sso', 'dean']) {
    const result = await request('/attendance.csv?year=2026&clubId=1', role);
    assert.equal(result.status, 200);
    for (const value of ['Full Student Name', 'student@miuegypt.edu.eg', '2026-001', 'Computer Science', 'Missing Profile', 'pending_supervisor', 'Missing ID or major']) assert.ok(result.text.includes(value), value);
    for (const value of ['never-export', 'private@example.edu', 'outside@example.edu']) assert.ok(!result.text.includes(value));
  }
  assert.ok(filters.some(f => f.email?.$in?.includes('student@miuegypt.edu.eg')));
  const singleDay = await request('/attendance.csv?start=2026-12-31&end=2026-12-31&clubId=1');
  assert.ok(singleDay.text.includes('Closing')); assert.ok(!singleDay.text.includes('Opening'));
});
test('role and assignment restrictions cannot be bypassed with URLs or all-club selection', async t => {
  const { request } = await harness(t);
  assert.equal((await request('/clubs', 'none')).status, 401);
  assert.equal((await request('/clubs', 'head')).status, 403);
  assert.equal((await request('/reports.csv?year=2026', 'sso')).status, 403);
  for (const role of ['president', 'admin', 'pr']) assert.equal((await request('/attendance.csv?year=2026', role)).status, 200);
  for (const role of ['president', 'supervisor']) assert.equal((await request('/reports.csv?year=2026&clubId=2', role)).status, 403);
  const unassigned = await request('/attendance.csv?year=2026&clubId=all', 'supervisor', { 'x-unassigned': 'true' });
  assert.equal(unassigned.status, 200); assert.ok(!unassigned.text.includes('student@miuegypt.edu.eg'));
  const all = await request('/attendance.csv?year=2026&clubId=all');
  assert.ok(!all.text.includes('private@example.edu'));
  const dean = JSON.parse((await request('/clubs', 'dean')).text); assert.equal(dean.clubs.length, 2);
});
test('invalid filters, empty data and database failures return predictable results', async t => {
  const { request } = await harness(t);
  assert.equal((await request('/reports.csv?year=2026&clubId=1e0')).status, 400);
  assert.equal((await request('/reports.csv')).status, 400);
  const empty = await request('/attendance.csv?year=2025'); assert.equal(empty.status, 200); assert.equal(empty.text.split('\r\n').length, 1);
  const offline = await harness(t, { databaseReady: () => false }); assert.equal((await offline.request('/clubs')).status, 503);
  const broken = await harness(t, { StudentAccount: { find() { throw new Error('DB_DOWN'); } } });
  const failure = await broken.request('/attendance.csv?year=2026'); assert.equal(failure.status, 503); assert.equal(failure.headers.get('content-disposition'), null);
});

test('attendance dashboard lists only authorized events within the period', async t => {
  const { request } = await harness(t);
  const response = await request('/events?year=2026&clubId=all');
  assert.equal(response.status, 200);
  const events = JSON.parse(response.text).events;
  assert.deepEqual(events.map(e => e.title).sort(), ['Closing', 'Opening']);
  assert.ok(events.every(e => e.clubId === 1));
  assert.equal((await request('/events?year=2026&clubId=2')).status, 403);
  assert.equal((await request('/events?year=2026&clubId=1', 'president')).status, 200);
  assert.equal((await request('/events?year=2026&clubId=2', 'president')).status, 403);
});

test('each event downloads its own verified sheet without other events or clubs', async t => {
  const { request } = await harness(t);
  const response = await request('/event-sheet.csv?year=2026&clubId=1&eventKey=request:10&sheet=verified');
  assert.equal(response.status, 200);
  assert.match(response.text, /Full Student Name/); assert.match(response.text, /Computer Science/);
  assert.ok(!response.text.includes('Closing')); assert.ok(!response.text.includes('Private other club'));
  assert.match(response.headers.get('content-disposition'), /verified-club-attendance-1-request-10/);
  assert.equal((await request('/event-sheet.csv?year=2026&clubId=1&eventKey=request:12&sheet=verified')).status, 404);
  assert.equal((await request('/event-sheet.csv?year=2026&clubId=2&eventKey=request:10&sheet=verified')).status, 403);
});

test('registered sheet contains registrations rather than check-ins and handles empty events', async t => {
  const { request } = await harness(t, { EventRegistration: { find: filter => q([
    { eventIndex: 0, eventTitle: 'Opening', name: 'Registered Only', email: 'registered@miuegypt.edu.eg' },
    { eventIndex: 1, eventTitle: 'Closing', name: 'Other event', email: 'other@miuegypt.edu.eg' }
  ].filter(r => r.eventIndex === filter.eventIndex && r.eventTitle === filter.eventTitle)) } });
  const response = await request('/event-sheet.csv?year=2026&clubId=1&eventKey=request:10&sheet=registered');
  assert.equal(response.status, 200); assert.match(response.text, /Registered Only/);
  assert.match(response.text, /not proof of attendance/); assert.ok(!response.text.includes('Other event'));
  assert.ok(!response.text.includes('Check-in name'));
  const empty = await harness(t, { EventRegistration: { find: () => q([]) } });
  const result = await empty.request('/event-sheet.csv?year=2026&clubId=1&eventKey=request:10&sheet=registered');
  assert.equal(result.status, 404); assert.match(result.text, /No registrations/);
});

test('event sheets validate type, dates and database errors', async t => {
  const { request } = await harness(t);
  assert.equal((await request('/event-sheet.csv?year=2026&clubId=1&eventKey=request:10&sheet=unknown')).status, 400);
  assert.equal((await request('/events?clubId=1')).status, 400);
  const failed = await harness(t, { EventRegistration: { find() { throw new Error('DB_DOWN'); } } });
  assert.equal((await failed.request('/event-sheet.csv?year=2026&clubId=1&eventKey=request:10&sheet=registered')).status, 503);
});

test('all requested dashboards can download per-event sheets while club ownership remains enforced', async t => {
  const { request } = await harness(t);
  for (const role of ['president', 'supervisor', 'pr', 'sso', 'dean', 'admin', 'software_development']) {
    const result = await request('/event-sheet.csv?year=2026&clubId=1&eventKey=request:10&sheet=verified', role);
    assert.equal(result.status, 200, role);
    assert.ok(!result.text.includes('private@example.edu'));
  }
  assert.equal((await request('/event-sheet.csv?year=2026&clubId=2&eventKey=request:10&sheet=verified', 'president')).status, 403);
  assert.equal((await request('/event-sheet.csv?year=2026&clubId=2&eventKey=request:10&sheet=verified', 'supervisor')).status, 403);
  assert.equal((await request('/event-sheet.csv?year=2026&clubId=1&eventKey=request:10&sheet=verified', 'head')).status, 403);
});

test('each requested dashboard loads the shared native panel and controls', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (const file of ['public/index.html', 'public/dashboards/pr-dashboard.html', 'public/dashboards/sso-dashboard.html', 'public/dashboards/dean-dashboard.html', 'public/dashboards/supervisor-dashboard.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.equal((html.match(/src="\/assets\/js\/report-dashboard-panels.js/g) || []).length, 1, file);
    assert.equal((html.match(/src="\/assets\/js\/pages\/report-downloads.js/g) || []).length, 1, file);
    assert.ok(html.includes('/assets/css/pages/event-reports.css'), file);
  }
});
test('published event choices load without dates and remain club scoped', async t => {
  const { request } = await harness(t);
  const result = await request('/events?clubId=1&period=all', 'president');
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.text).events.length, 4);
  assert.equal((await request('/events?clubId=2&period=all', 'president')).status, 403);
  assert.equal((await request('/events?clubId=1&period=all&year=2026')).status, 400);
  assert.equal((await request('/event-sheet.csv?clubId=1&period=all&eventKey=request:10&sheet=verified', 'president')).status, 200);
});
test('event sheets export scheduled times and requested identity columns without guessing end time', async t => {
  const club = { id: 1, name: 'MUN', events: [{ requestId: 10, title: 'Opening', date: '2026-01-01', time: '09:00', endTime: '12:30' }] };
  const { request } = await harness(t, { Club: { find: () => q([club]) } });
  const result = await request('/event-sheet.csv?clubId=1&period=all&eventKey=request:10&sheet=verified');
  assert.equal(result.status, 200);
  assert.ok(result.text.startsWith('"Club","Event","Event date","From time","To time","Type","Full name","MIU ID","MIU email","Major"'));
  assert.ok(result.text.includes('"2026-01-01","09:00","12:30","event","Full Student Name","2026-001","student@miuegypt.edu.eg","Computer Science"'));
  delete club.events[0].endTime;
  const missing = await request('/event-sheet.csv?clubId=1&period=all&eventKey=request:10&sheet=verified');
  assert.ok(missing.text.includes('"09:00","","event"'));
});
test('legacy check-ins without itemType are exported, and empty attendance returns a clear error', async t => {
  let filter;
  const legacy = await harness(t, { AttendanceRecord: { find(value) { filter = value; return q([{ eventRequestId: 10, name: 'Legacy Attendee', email: 'legacy@miuegypt.edu.eg' }]); } } });
  const result = await legacy.request('/event-sheet.csv?clubId=1&period=all&eventKey=request:10&sheet=verified');
  assert.equal(result.status, 200); assert.match(result.text, /Legacy Attendee/);
  assert.deepEqual(filter.$or, [{ itemType: 'event' }, { itemType: { $exists: false } }]);
  const empty = await harness(t, { AttendanceRecord: { find: () => q([]) } });
  const response = await empty.request('/event-sheet.csv?clubId=1&period=all&eventKey=request:10&sheet=verified');
  assert.equal(response.status, 404); assert.match(response.text, /No verified check-ins/);
  assert.equal(response.headers.get('content-disposition'), null);
});
test('MIU events use existing university IDs and registrations with global-role access only', async t => {
  const { request } = await harness(t, {
    UniversityContent: { find: () => q([{ id: 400, type: 'event', title: 'University Open Day', date: '2026-04-01', registrationEnabled: true }]) },
    EventRegistration: { find: () => q([{ clubId: 0, eventIndex: 400, eventTitle: 'University Open Day', name: 'MIU Student', email: 'miu@miuegypt.edu.eg' }]) }
  });
  assert.ok(JSON.parse((await request('/clubs', 'admin')).text).clubs.some(c => c.id === 0 && c.name === 'MIU events'));
  const list = JSON.parse((await request('/events?clubId=0&period=all', 'admin')).text);
  assert.equal(list.events[0].key, 'request:400');
  const report = await request('/reports.csv?clubId=0&year=2026', 'admin');
  assert.equal(report.status, 200); assert.match(report.text, /University Open Day/); assert.match(report.text, /"1","Unavailable"/);
  const registered = await request('/event-sheet.csv?clubId=0&period=all&eventKey=request:400&sheet=registered', 'admin');
  assert.equal(registered.status, 200); assert.match(registered.text, /MIU Student/);
  for (const role of ['president', 'supervisor']) {
    assert.ok(!JSON.parse((await request('/clubs', role)).text).clubs.some(c => c.id === 0));
    assert.equal((await request('/reports.csv?clubId=0&year=2026', role)).status, 403);
  }
});
test('MIU Events downloads are limited to university rows and never query club records', async t => {
  let clubQueries = 0;
  const { request } = await harness(t, {
    Club: { find() { clubQueries++; throw new Error('MIU Events must not query club data.'); } },
    UniversityContent: { find: () => q([{ id: 400, type: 'event', title: 'University Open Day', date: '2026-04-01' }]) }
  });
  const clubs = JSON.parse((await request('/clubs', 'miu_events')).text);
  assert.deepEqual(clubs.clubs, [{ id: 0, name: 'MIU events' }]);
  assert.equal(clubs.reports, true); assert.equal(clubs.attendance, true);
  const events = JSON.parse((await request('/events?clubId=0&period=all', 'miu_events')).text);
  assert.equal(events.events[0].title, 'University Open Day');
  assert.equal((await request('/events?clubId=1&period=all', 'miu_events')).status, 403);
  assert.equal((await request('/reports.csv?year=2026&clubId=1', 'miu_events')).status, 403);
  assert.equal(clubQueries, 0);
});
test('MIU event selection works without loading unrelated club images or records', async t => {
  const { request } = await harness(t, {
    Club: { find() { throw new Error('Unrelated club data must not be loaded'); } },
    UniversityContent: { find: () => q([{ id: 400, title: 'MIU Day', date: '2026-04-01' }]) }
  });
  const result = await request('/events?clubId=0&period=all', 'admin');
  assert.equal(result.status, 200); assert.equal(JSON.parse(result.text).events[0].title, 'MIU Day');
});
test('no published MIU events returns an empty list with an actionable explanation', async t => {
  const { request } = await harness(t, { UniversityContent: { find: () => q([]) } });
  const result = await request('/events?clubId=0&period=all', 'admin');
  assert.equal(result.status, 200);
  const data = JSON.parse(result.text); assert.deepEqual(data.events, []);
  assert.match(data.message, /MIU has no published events/); assert.match(data.message, /MIU Posts/);
});
test('events with recorded attendance remain downloadable when absent from the published list', async t => {
  const records = [{ clubId: 1, eventRequestId: 21, itemType: 'event', eventTitle: 'Recorded event', eventDate: '2026-10-11', name: 'Checked Student', email: 'checked@miuegypt.edu.eg' }];
  const { request } = await harness(t, { AttendanceRecord: { find: () => q(records) } });
  const list = JSON.parse((await request('/events?clubId=1&period=all')).text);
  assert.equal(list.events[0].key, 'attendance:event:21'); assert.equal(list.events[0].verifiedCount, 1);
  const result = await request('/event-sheet.csv?clubId=1&period=all&eventKey=attendance:event:21&sheet=verified');
  assert.equal(result.status, 200); assert.match(result.text, /Checked Student/);
  assert.equal((await request('/events?clubId=2&period=all')).status, 403);
});
test('self check-in identity snapshots appear in exports without a matching student account', async t => {
  const { request } = await harness(t, {
    AttendanceRecord: { find: () => q([{ clubId: 1, itemType: 'event', eventRequestId: 10, eventTitle: 'Opening', eventDate: '2026-01-01', name: 'Club Head', email: 'head@example.edu', universityId: '001234', major: 'Computer Science' }]) },
    StudentAccount: { find: () => q([]) }
  });
  const result = await request('/event-sheet.csv?clubId=1&period=all&eventKey=request:10&sheet=verified');
  assert.equal(result.status, 200);
  assert.match(result.text, /Club Head/); assert.match(result.text, /001234/); assert.match(result.text, /Computer Science/); assert.match(result.text, /head@example.edu/);
});

test('open-event attendance stays in its own per-event sheet and labels membership from the saved check-in snapshot', async t => {
  const records = [
    { clubId: 1, itemType: 'event', eventRequestId: 10, eventTitle: 'Opening', eventDate: '2026-01-01', name: 'Club member', email: 'member@miuegypt.edu.eg', attendanceAudience: 'all_students', membershipStatus: 'member', memberClubNames: ['Engineering'] },
    { clubId: 1, itemType: 'event', eventRequestId: 10, eventTitle: 'Opening', eventDate: '2026-01-01', name: 'Non-member', email: 'guest@miuegypt.edu.eg', attendanceAudience: 'all_students', membershipStatus: 'non_member', memberClubNames: [] },
    { clubId: 1, itemType: 'event', eventRequestId: 10, eventTitle: 'Opening', eventDate: '2026-01-01', name: 'Member lane only', email: 'private@miuegypt.edu.eg', attendanceAudience: 'members' }
  ];
  const { request, filters } = await harness(t, { AttendanceRecord: { find(filter) {
    filters.push(filter);
    return q(records.filter(record => (typeof filter.clubId === 'number' ? record.clubId === filter.clubId : filter.clubId.$in.includes(record.clubId))
      && (filter.attendanceAudience === 'all_students' ? record.attendanceAudience === 'all_students' : ['members', undefined].includes(record.attendanceAudience))
      && (filter.eventRequestId === undefined || filter.eventRequestId === record.eventRequestId)));
  } }, StudentAccount: { find: () => q([]) } });
  const listed = JSON.parse((await request('/events?clubId=1&period=all&audience=all_students', 'president')).text);
  assert.equal(listed.events[0].verifiedCount, 2);
  const sheet = await request('/event-sheet.csv?clubId=1&period=all&eventKey=request:10&sheet=verified&audience=all_students', 'president');
  assert.equal(sheet.status, 200); assert.match(sheet.text, /Club member/); assert.match(sheet.text, /Member/);
  assert.match(sheet.text, /Engineering/); assert.match(sheet.text, /Non-member/); assert.doesNotMatch(sheet.text, /Member lane only/);
  assert.ok(filters.some(filter => filter.attendanceAudience === 'all_students'));
});

test('organizer and usher event roles export separately from membership and member club names', async t => {
  const records = [
    { clubId: 1, itemType: 'event', eventRequestId: 10, eventTitle: 'Opening', eventDate: '2026-01-01', name: 'Organizer Member', email: 'organizer@example.test', membershipStatus: 'member', memberClubNames: ['Engineering'], eventParticipation: { role: 'organizer' } },
    { clubId: 1, itemType: 'event', eventRequestId: 10, eventTitle: 'Opening', eventDate: '2026-01-01', name: 'Usher Guest', email: 'usher@example.test', membershipStatus: 'non_member', memberClubNames: [], eventParticipation: { role: 'usher' } }
  ];
  const { request } = await harness(t, { AttendanceRecord: { find: () => q(records) }, StudentAccount: { find: () => q([]) } });
  const perEvent = await request('/event-sheet.csv?clubId=1&period=all&eventKey=request:10&sheet=verified', 'president');
  assert.equal(perEvent.status, 200); assert.match(perEvent.text, /"Event role"/);
  assert.match(perEvent.text, /"Attendance category"/);
  assert.match(perEvent.text, /"Organizer"\r?\n/); assert.match(perEvent.text, /"Usher"\r?\n|"Usher"$/);
  assert.match(perEvent.text, /"Member","Engineering","Organizer"/); assert.match(perEvent.text, /"Non-member","","Usher"/);
  const annual = await request('/attendance.csv?clubId=1&year=2026', 'president');
  assert.equal(annual.status, 200); assert.match(annual.text, /"Member","Engineering","Organizer"/); assert.match(annual.text, /"Non-member","","Usher"/);
});
