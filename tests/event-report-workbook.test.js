const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { eventReportWorkbook } = require('../services/event-report-workbook');
test('Excel workbook contains readable sheets, filters, safe text and correct partial totals', async () => {
  const rows = [[],
    ['2026-01-01', '2026-12-31', 'MUN', 'request:10', 'Opening', '2026-02-01', 'submitted', '=SUM(1,2)', 'Objective', 'Activity', 'Outcome', 'Lesson', 5, 3, '2026-02-02T10:00:00Z', '', 1, JSON.stringify([{ action: 'submitted', actor: 'staff@example.edu', at: '2026-02-02T10:00:00Z', note: 'Good' }])],
    ['2026-01-01', '2026-12-31', 'MUN', 'request:11', 'No data', '2026-03-01', 'No report', '', '', '', '', '', 'Unavailable', 'Unavailable', '', '', '', '']];
  const bytes = await eventReportWorkbook(rows, { start: '2026-01-01', end: '2026-12-31' }, 2);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes);
  assert.deepEqual(workbook.worksheets.map(w => w.name), ['Summary', 'Events', 'Report details', 'Review history']);
  const events = workbook.getWorksheet('Events');
  assert.equal(events.getCell('E2').value, 5); assert.equal(events.getCell('F2').value, 3);
  assert.equal(events.getCell('F3').value, 'Unavailable'); assert.equal(events.getCell('C2').value, '2026-02-01');
  assert.ok(events.getColumn(3).width >= 18); assert.equal(events.views[0].ySplit, 1); assert.ok(events.autoFilter);
  const summary = workbook.getWorksheet('Summary');
  const values = new Map(); summary.eachRow(row => values.set(row.getCell(1).value, row.getCell(2).value));
  assert.equal(values.get('Events'), 2); assert.equal(values.get('Verified check-ins (available data)'), 3);
  assert.equal(values.get('Events missing attendance data'), 1); assert.equal(values.get('Club events with invalid/missing dates'), 2);
  assert.equal(workbook.getWorksheet('Report details').getCell('E2').value, '=SUM(1,2)');
  assert.equal(workbook.getWorksheet('Report details').getCell('E2').type, ExcelJS.ValueType.String);
  assert.equal(workbook.getWorksheet('Review history').getCell('F2').value, 'Good');
});
test('empty periods generate a valid workbook with zero events', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await eventReportWorkbook([[]], { start: '2026-01-01', end: '2026-01-31' }));
  assert.equal(workbook.getWorksheet('Events').rowCount, 1);
  assert.equal(workbook.getWorksheet('Summary').getCell('B4').value, 0);
});
