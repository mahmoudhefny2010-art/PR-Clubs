const ExcelJS = require('exceljs');

async function eventReportWorkbook(rows, range, undatedEvents = 0) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MIU Clubs';
  const data = rows.slice(1);
  function sheet(name, headings, widths) {
    const ws = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = headings.map((header, index) => ({ header, width: widths[index] || 24 }));
    ws.getRow(1).height = 30;
    ws.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA8202B' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    return ws;
  }
  const summary = sheet('Summary', ['Metric', 'Value', 'Meaning'], [38, 26, 85]);
  const known = index => data.filter(r => typeof r[index] === 'number');
  summary.addRows([
    ['Period start', range.start, 'Inclusive event-date boundary'],
    ['Period end', range.end, 'Inclusive event-date boundary'],
    ['Events', data.length, 'Existing published club events in this period'],
    ['Reports submitted', data.filter(r => !['No report', 'draft'].includes(r[6])).length, 'Includes reports awaiting review, returned for changes or reviewed'],
    ['Events without reports', data.filter(r => r[6] === 'No report').length, 'No report has been created'],
    ['Draft reports', data.filter(r => r[6] === 'draft').length, 'Saved but not submitted'],
    ['Verified check-ins (available data)', known(13).reduce((n, r) => n + r[13], 0), 'Event participations, not unique students; administrative approval is separate'],
    ['Registrations (available data)', known(12).reduce((n, r) => n + r[12], 0), 'Registrations do not prove attendance'],
    ['Events missing attendance data', data.length - known(13).length, 'Unavailable is not treated as a confirmed zero'],
    ['Events missing registration data', data.length - known(12).length, 'Totals above are partial when records are unavailable'],
    ['Club events with invalid/missing dates', undatedEvents, 'Excluded from this period because their event date cannot be verified']
  ]);
  summary.addRow([]);
  summary.addRow(['Club', 'Events in period', 'Reports submitted / reviewed']);
  for (const club of [...new Set(data.map(r => r[2]))]) {
    const group = data.filter(r => r[2] === club);
    summary.addRow([club, group.length, `${group.filter(r => !['No report', 'draft'].includes(r[6])).length} submitted · ${group.filter(r => r[6] === 'reviewed').length} reviewed`]);
  }
  const events = sheet('Events', ['Club', 'Event', 'Event date', 'Report status', 'Registered attendees', 'Verified check-ins', 'Submitted at (UTC)', 'Last updated (UTC)'], [26, 45, 18, 24, 23, 23, 26, 26]);
  const reports = sheet('Report details', ['Club', 'Event', 'Event date', 'Status', 'Summary', 'Objectives', 'Activities', 'Outcomes', 'Lessons learned'], [25, 38, 18, 24, 60, 60, 60, 60, 60]);
  const history = sheet('Review history', ['Club', 'Event', 'Action', 'Actor', 'Time (UTC)', 'Review note'], [25, 40, 24, 40, 26, 70]);
  const status = value => ({ draft: 'Draft', submitted: 'Submitted', changes_requested: 'Changes requested', reviewed: 'Reviewed' }[value] || value);
  for (const row of data.sort((a, b) => String(a[5]).localeCompare(String(b[5])) || String(a[2]).localeCompare(String(b[2])))) {
    events.addRow([row[2], row[4], row[5], status(row[6]), row[12], row[13], row[14], row[15]]);
    reports.addRow([row[2], row[4], row[5], status(row[6]), ...row.slice(7, 12)]);
    for (const entry of row[17] ? JSON.parse(row[17]) : []) history.addRow([row[2], row[4], status(entry.action), entry.actor, entry.at ? new Date(entry.at).toISOString() : '', entry.note || '']);
  }
  for (const ws of workbook.worksheets) {
    if (ws !== summary) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, ws.rowCount), column: ws.columnCount } };
    ws.eachRow((row, index) => {
      if (index === 1) return;
      row.height = ws === reports ? 84 : 36;
      row.eachCell({ includeEmpty: true }, cell => {
        cell.alignment = { vertical: 'top', wrapText: true, indent: 1 };
        if (typeof cell.value === 'string') cell.numFmt = '@';
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF172033' } };
        if (index % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      });
    });
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  return workbook.xlsx.writeBuffer();
}
module.exports = { eventReportWorkbook };
