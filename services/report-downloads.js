const express = require('express');
const { assignedIds } = require('./supervisor-dashboard');
const { EventReport, period, eventsFor, statistics, fields } = require('./event-reports');

function csv(rows) {
  return '\ufeff' + rows.map(row => row.map(value => {
    let text = value == null ? '' : String(value);
    // Prevent spreadsheet formulas in user-supplied report/student text.
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(',')).join('\r\n');
}
function boundaries(query) {
  if (query.year !== undefined) {
    if (typeof query.year !== 'string' || !/^\d{4}$/.test(query.year) || Number(query.year) < 1900 || Number(query.year) > 9998 || query.start !== undefined || query.end !== undefined) return null;
    return { start: `${query.year}-01-01`, end: `${query.year}-12-31` };
  }
  return period(query.start, query.end) ? { start: query.start, end: query.end } : null;
}
function scope(account) {
  if (account.role === 'president') return { id: account.clubId };
  if (account.role === 'supervisor') return { id: { $in: assignedIds(account) } };
  if (account.role === 'miu_events') return { id: -1 };
  return {};
}
function reportingEvents(club) {
  return eventsFor(club).map(event => club.id === 0 ? { ...event, index: event.attendanceId } : event);
}
function registerReportDownloads(app, deps) {
  const { Club, UniversityContent, ContentRequest, AttendanceRecord, AttendanceSession, EventRegistration, StudentAccount, getAccount, databaseReady } = deps;
  const canReadMiu = async account => Boolean(UniversityContent && (['admin', 'software_development', 'miu_events', 'dean', 'pr', 'sso'].includes(account.role)
    || account.role === 'supervisor' && AttendanceSession && await AttendanceSession.exists({ sourceType: 'miu', assignedSupervisorEmail: account.email })));
  async function authorizedSources(account, selection) {
    // University event choices must not hydrate every club's embedded images
    // and attachments. Export sources contain metadata only.
    const specific = selection !== undefined && selection !== 'all';
    const selectedId = specific ? Number(selection) : null;
    if (account.role === 'miu_events' && specific && selectedId !== 0) return [];
    if (specific && (account.role === 'president' && account.clubId !== selectedId
      || account.role === 'supervisor' && (selectedId === 0 ? !await canReadMiu(account) : !assignedIds(account).includes(selectedId)))) return [];
    const query = selection === '0' || account.role === 'miu_events' ? null : Club.find(specific ? { id: selectedId } : scope(account))
      .select('id name events.title events.location events.description events.date events.time events.startTime events.endTime events.requestId events.registrationEnabled events.attendanceEnabled booths.title booths.boothName booths.date booths.boothOpenDate booths.time booths.boothOpenTime booths.boothCloseTime booths.requestId');
    if (query?.maxTimeMS) query.maxTimeMS(5000);
    const clubs = query ? await query.lean() : [];
    if (await canReadMiu(account) && (!selection || selection === 'all' || selection === '0')) {
      const supervisorScope = account.role === 'supervisor' ? { id: { $in: await AttendanceSession.distinct('eventRequestId', { sourceType: 'miu', assignedSupervisorEmail: account.email }) } } : {};
      const events = await UniversityContent.find({ type: 'event', ...supervisorScope }).select('id title description location date time registrationEnabled attendanceEnabled attendanceAudience').lean();
      clubs.push({ id: 0, name: 'MIU events', events: events.map(event => ({ ...event, requestId: event.id })) });
    }
    return clubs;
  }
  const Report = deps.Report || EventReport;
  const router = express.Router();
  router.use(async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!databaseReady()) return res.status(503).json({ message: 'Download database is temporarily unavailable.' });
      const account = await getAccount(req);
      if (!account) return res.status(401).json({ message: 'Sign in before downloading.' });
      if (!['president', 'supervisor', 'pr', 'sso', 'dean', 'admin', 'software_development', 'miu_events'].includes(account.role)) return res.status(403).json({ message: 'Download access denied.' });
      req.downloadAccount = account; next();
    } catch { res.status(503).json({ message: 'Could not verify download access.' }); }
  });
  router.get('/clubs', async (req, res) => {
    try {
      const clubs = req.downloadAccount.role === 'miu_events' ? [] : await Club.find(scope(req.downloadAccount)).select('id name').lean();
      if (await canReadMiu(req.downloadAccount)) clubs.push({ id: 0, name: 'MIU events' });
      const eventManager = req.downloadAccount.role === 'miu_events';
      res.json({ clubs, reports: eventManager || ['president', 'supervisor', 'dean', 'admin', 'software_development'].includes(req.downloadAccount.role),
        attendance: eventManager || ['president', 'supervisor', 'pr', 'sso', 'dean', 'admin', 'software_development'].includes(req.downloadAccount.role) });
    } catch { res.status(503).json({ message: 'Could not load authorized clubs.' }); }
  });
  router.get(['/events', '/event-sheet.csv', '/event-sheet.xlsx'], async (req, res) => {
    if (!['president', 'supervisor', 'pr', 'sso', 'dean', 'admin', 'software_development', 'miu_events'].includes(req.downloadAccount.role)) return res.status(403).json({ message: 'Attendance sheet access denied.' });
    if (req.downloadAccount.role === 'miu_events' && req.query.clubId !== '0') return res.status(403).json({ message: 'MIU Events accounts can download MIU event attendance only.' });
    const audience = req.query.audience === 'all_students' ? 'all_students' : 'members';
    if (req.query.audience !== undefined && !['members', 'all_students'].includes(req.query.audience)) return res.status(400).json({ message: 'Choose a valid attendance sheet.' });
    const allDates = req.query.period === 'all' && req.query.start === undefined && req.query.end === undefined && req.query.year === undefined;
    const range = boundaries(req.query), clubId = req.query.clubId;
    if ((req.query.period !== undefined && !allDates) || (!allDates && !range) || typeof clubId !== 'string' || (clubId !== 'all' && !/^\d+$/.test(clubId))) return res.status(400).json({ message: 'Choose valid dates and a club.' });
    try {
      const clubs = await authorizedSources(req.downloadAccount, clubId);
      if (clubId !== 'all' && !clubs.some(c => c.id === Number(clubId))) return res.status(403).json({ message: 'Club access denied.' });
      const selectedClubs = clubs.filter(c => clubId === 'all' || c.id === Number(clubId));
      const events = selectedClubs.flatMap(club =>
        reportingEvents(club).filter(e => allDates || period(e.date, e.date) && e.date >= range.start && e.date <= range.end)
          .map(e => ({ ...e, clubId: club.id, clubName: club.name, itemType: 'event', verifiedCount: 0 })));
      const ids = selectedClubs.map(c => c.id);
      const audienceFilter = audience === 'all_students' ? { attendanceAudience: 'all_students' }
        : { $or: [{ attendanceAudience: 'members' }, { attendanceAudience: { $exists: false } }] };
      const records = await AttendanceRecord.find({ clubId: { $in: ids }, ...audienceFilter }).select('clubId itemType eventRequestId eventTitle eventDate eventTime attendanceAudience').lean();
      for (const record of records) {
        if (!ids.includes(record.clubId) || !Number.isSafeInteger(record.eventRequestId)) continue;
        if (!allDates && !(period(record.eventDate, record.eventDate) && record.eventDate >= range.start && record.eventDate <= range.end)) continue;
        const type = record.itemType || 'event';
        let event = events.find(e => e.clubId === record.clubId && e.itemType === type && e.attendanceId === record.eventRequestId);
        if (!event) {
          event = { key: `attendance:${type}:${record.eventRequestId}`, attendanceId: record.eventRequestId, index: -1,
            title: record.eventTitle, date: record.eventDate, startTime: record.eventTime || '', endTime: '',
            clubId: record.clubId, clubName: selectedClubs.find(c => c.id === record.clubId).name,
            itemType: type, source: 'attendance', verifiedCount: 0 };
          events.push(event);
        }
        event.verifiedCount++;
      }
      events.sort((a, b) => b.verifiedCount - a.verifiedCount || String(b.date).localeCompare(String(a.date)));
      if (req.path === '/events') return res.json({ events, message: events.length ? '' : clubId === '0'
        ? allDates ? 'MIU has no published events in the connected database. Add an Event under MIU Posts; announcements are not events.' : 'MIU has no published events within the selected dates.'
        : 'No published events match this club and period.' });
      const event = events.find(e => e.clubId === Number(clubId) && e.key === req.query.eventKey);
      if (!event) return res.status(404).json({ message: 'Event not found in the selected club and period.' });
      if (event.source === 'attendance' && ContentRequest && event.attendanceId > 0 && event.clubId > 0) {
        const original = await ContentRequest.findOne({ clubId: event.clubId, id: event.attendanceId, type: event.itemType })
          .select('description location boothDescription boothLocation').lean();
        event.description = original?.description || original?.boothDescription || '';
        event.location = original?.location || original?.boothLocation || '';
      }
      const sheet = req.query.sheet;
      if (!['registered', 'verified'].includes(sheet)) return res.status(400).json({ message: 'Choose registered attendees or verified check-ins.' });
      let people;
      if (sheet === 'registered') {
        const records = await EventRegistration.find({ clubId: event.clubId, eventIndex: event.index, eventTitle: event.title }).select('name email eventIndex eventTitle').lean();
        people = records.filter(r => r.eventIndex === event.index && r.eventTitle === event.title);
      } else {
        const audienceFilter = audience === 'all_students' ? { attendanceAudience: 'all_students' }
          : { attendanceAudience: { $in: ['members', null] } };
        const records = await AttendanceRecord.find({ clubId: event.clubId, eventRequestId: event.attendanceId, ...audienceFilter,
          ...(event.itemType === 'booth' ? { itemType: 'booth' } : { $or: [{ itemType: 'event' }, { itemType: { $exists: false } }] }) })
          .select('name email universityId major itemType eventRequestId eventTitle eventDate attendedAt approvalStatus approvalHistory note attendanceAudience membershipStatus memberClubNames eventParticipation').lean();
        people = records.filter(r => r.eventRequestId === event.attendanceId && (r.itemType || 'event') === event.itemType && (event.attendanceId > 0 || r.eventTitle === event.title && r.eventDate === event.date));
      }
      if (!people.length) return res.status(404).json({ message: sheet === 'registered'
        ? 'No registrations are recorded for this event. To download people who checked in, choose Download attendance sheet.'
        : 'No verified check-ins were found for this event. Check that you selected the same event and club used for attendance.' });
      const emails = [...new Set(people.map(p => String(p.email || '').trim().toLowerCase()).filter(Boolean))];
      const students = emails.length ? await StudentAccount.find({ email: { $in: emails } }).select('name email universityId major').lean() : [];
      const profiles = new Map(students.map(s => [s.email.toLowerCase(), s]));
      const rows = [['Club', 'Event', 'Event date', 'From time', 'To time', 'Type', 'Full name', 'MIU ID', 'MIU email', 'Major', 'Membership', 'Member clubs', 'Event role', 'Sheet type', 'Checked in at', 'Approval status', 'Attendance category']];
      people.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      for (const person of people) {
        const profile = profiles.get(String(person.email || '').trim().toLowerCase());
        const membership = person.membershipStatus === 'member' ? 'Member' : person.membershipStatus === 'non_member' ? 'Non-member' : '';
        rows.push([event.clubName, event.title, event.date, event.startTime, event.endTime, event.itemType, profile?.name || person.name, person.universityId || profile?.universityId || '', person.email, person.major || profile?.major || '', membership, (person.memberClubNames || []).join('; '), sheet === 'registered' ? '' : require('./attendance-participation').eventRoleLabel(person), sheet === 'registered' ? 'Registered (not proof of attendance)' : 'Verified check-in', person.attendedAt ? new Date(person.attendedAt).toISOString() : '', person.approvalStatus || '', sheet === 'registered' ? '' : require('./attendance-participation').attendanceCategory(person)]);
      }
      if (req.path.endsWith('.xlsx')) {
        const buffer = await require('./attendance-workbook').attendanceWorkbook(rows, { event, sheet, people, period: range, attendanceAudience: audience });
        const filenamePrefix = audience === 'all_students' ? 'open-event-attendance' : `${sheet}-club-attendance`;
        res.setHeader('Content-Disposition', `attachment; filename="${filenamePrefix}-${event.clubId}-${event.key.replace(/[^a-zA-Z0-9-]/g, '-')}.xlsx"`);
        return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer));
      }
      const filenamePrefix = audience === 'all_students' ? 'open-event-attendance' : `${sheet}-club-attendance`;
      res.setHeader('Content-Disposition', `attachment; filename="${filenamePrefix}-${event.clubId}-${event.key.replace(/[^a-zA-Z0-9-]/g, '-')}.csv"`);
      res.type('text/csv; charset=utf-8').send(csv(rows));
    } catch { res.status(503).json({ message: 'Could not prepare the event sheet. Please retry.' }); }
  });
  router.get('/:kind.:format', async (req, res) => {
    const kind = req.params.kind, account = req.downloadAccount;
    if (!['csv', 'xlsx'].includes(req.params.format)) return res.status(400).json({ message: 'Unsupported download format.' });
    const permitted = kind === 'reports' ? ['president', 'supervisor', 'dean', 'admin', 'software_development', 'miu_events'] : kind === 'attendance' ? ['president', 'supervisor', 'pr', 'sso', 'dean', 'admin', 'software_development', 'miu_events'] : [];
    if (!permitted.includes(account.role)) return res.status(403).json({ message: 'You cannot download this data.' });
    const range = boundaries(req.query);
    if (!range) return res.status(400).json({ message: 'Choose a valid calendar year or explicit start/end dates.' });
    const clubId = req.query.clubId;
    if (account.role === 'miu_events' && clubId !== '0') return res.status(403).json({ message: 'MIU Events accounts can download MIU event data only.' });
    if (clubId !== undefined && (typeof clubId !== 'string' || clubId !== 'all' && (!/^\d+$/.test(clubId) || !Number.isSafeInteger(Number(clubId)) || Number(clubId) < 0))) return res.status(400).json({ message: 'Invalid club selection.' });
    try {
      const clubs = await authorizedSources(account, clubId);
      if (clubId && clubId !== 'all' && !clubs.some(c => c.id === Number(clubId))) return res.status(403).json({ message: 'Club download access denied.' });
      const selected = clubs.filter(c => !clubId || clubId === 'all' || c.id === Number(clubId));
      const ids = selected.map(c => c.id), names = new Map(selected.map(c => [c.id, c.name]));
      let rows;
      if (kind === 'attendance') {
        const records = await AttendanceRecord.find({ clubId: { $in: ids }, eventDate: { $gte: range.start, $lte: range.end },
          $or: [{ attendanceAudience: 'members' }, { attendanceAudience: { $exists: false } }] })
          .select('clubId itemType eventRequestId eventTitle eventDate eventTime name email universityId major attendedAt approvalStatus membershipStatus memberClubNames eventParticipation').lean();
        const attendance = records.filter(r => period(r.eventDate, r.eventDate));
        const emails = [...new Set(attendance.map(r => String(r.email || '').trim().toLowerCase()).filter(Boolean))];
        const students = emails.length ? await StudentAccount.find({ email: { $in: emails } }).select('email name universityId major').lean() : [];
        const profiles = new Map(students.map(s => [s.email.toLowerCase(), s]));
        rows = [['Club', 'Event', 'Event date', 'From time', 'To time', 'Type', 'Full name', 'MIU ID', 'MIU email', 'Major', 'Checked in at', 'Approval status', 'Profile data status', 'Membership', 'Member clubs', 'Event role', 'Attendance category']];
        attendance.sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)) || String(a.eventTitle).localeCompare(String(b.eventTitle)) || String(a.name).localeCompare(String(b.name)));
        for (const record of attendance) {
          const profile = profiles.get(String(record.email || '').trim().toLowerCase());
          const club = selected.find(c => c.id === record.clubId);
          const type = record.itemType || 'event';
          const activity = (type === 'booth' ? club?.booths || [] : club?.events || []).find((item, index) => {
            const id = Number(item.requestId) > 0 ? Number(item.requestId) : -((type === 'booth' ? 1000000 : 0) + index + 1);
            return id === record.eventRequestId && (id > 0 || (item.title || item.boothName) === record.eventTitle);
          });
          rows.push([names.get(record.clubId), record.eventTitle, record.eventDate,
            activity?.startTime || activity?.time || activity?.boothOpenTime || record.eventTime || '', activity?.endTime || activity?.boothCloseTime || '', type,
            profile?.name || record.name, record.universityId || profile?.universityId || '', record.email, record.major || profile?.major || '',
            record.attendedAt ? new Date(record.attendedAt).toISOString() : '', record.approvalStatus,
            (record.universityId || profile?.universityId) && (record.major || profile?.major) ? 'Available (attendance record or student profile)' : 'Missing ID or major in student profile',
            record.membershipStatus === 'member' ? 'Member' : record.membershipStatus === 'non_member' ? 'Non-member' : '',
            (record.memberClubNames || []).join('; '), require('./attendance-participation').eventRoleLabel(record), require('./attendance-participation').attendanceCategory(record)]);
        }
      } else {
        const [reports, registrations, attendance] = await Promise.all([
          Report.find({ clubId: { $in: ids } }).lean(),
          EventRegistration.find({ clubId: { $in: ids } }).select('clubId eventIndex eventTitle').lean(),
          AttendanceRecord.find({ clubId: { $in: ids }, itemType: 'event' }).select('clubId eventRequestId itemType eventTitle eventDate').lean()
        ]);
        rows = [['Period start', 'Period end', 'Club', 'Event key', 'Event', 'Event date', 'Report status', ...fields, 'Registered attendees', 'Verified check-ins', 'Submitted at', 'Updated at', 'Revision', 'Report history']];
        for (const club of selected) for (const event of reportingEvents(club).filter(e => period(e.date, e.date) && e.date >= range.start && e.date <= range.end)) {
          const report = reports.find(r => r.clubId === club.id && r.eventKey === event.key);
          const stats = statistics(event, registrations.filter(r => r.clubId === club.id), attendance.filter(r => r.clubId === club.id));
          rows.push([range.start, range.end, club.name, event.key, event.title, event.date, report?.status || 'No report',
            ...fields.map(f => report?.[f] || ''), stats.registered === null ? 'Unavailable' : stats.registered,
            stats.verified === null ? 'Unavailable' : stats.verified,
            report?.submittedAt ? new Date(report.submittedAt).toISOString() : '', report?.updatedAt ? new Date(report.updatedAt).toISOString() : '', report?.revision || '',
            report ? JSON.stringify(report.history || []) : '']);
        }
      }
      if (req.params.format === 'xlsx') {
        if (kind === 'attendance') {
          const buffer = await require('./attendance-workbook').attendanceWorkbook(rows, { period: range });
          res.setHeader('Content-Disposition', `attachment; filename="attendance-${range.start}-to-${range.end}.xlsx"`);
          return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer));
        }
        const undated = selected.reduce((n, club) => n + eventsFor(club).filter(e => !period(e.date, e.date)).length, 0);
        const buffer = await require('./event-report-workbook').eventReportWorkbook(rows, range, undated);
        res.setHeader('Content-Disposition', `attachment; filename="event-reports-${range.start}-to-${range.end}.xlsx"`);
        return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer));
      }
      res.setHeader('Content-Disposition', `attachment; filename="${kind}-${range.start}-to-${range.end}.csv"`);
      res.type('text/csv; charset=utf-8').send(csv(rows));
    } catch { res.status(503).json({ message: 'Download failed. No complete file could be generated; please retry.' }); }
  });
  app.use('/api/report-downloads', router);
}
module.exports = { registerReportDownloads, csv, boundaries, scope };
