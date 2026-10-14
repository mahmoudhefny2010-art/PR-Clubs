const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { attendanceWorkbook } = require('../services/attendance-workbook');
test('attendance Excel preserves dates, leading-zero IDs and full text with readable spacing', async () => {
  const rows = [['Club', 'Event date', 'From time', 'Full name', 'MIU ID', 'MIU email', 'Major'],
    ['MUN', '2026-10-11', '17:53', 'A long student full name', '001234', 'student@miuegypt.edu.eg', 'Electronics and Communication Engineering']];
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await attendanceWorkbook(rows));
  const sheet = workbook.getWorksheet('Attendance');
  assert.equal(sheet.getCell('B2').value, '2026-10-11'); assert.equal(sheet.getCell('B2').numFmt, '@');
  assert.equal(sheet.getCell('D2').value, '001234'); assert.equal(sheet.getCell('D2').numFmt, '@');
  assert.ok(sheet.getColumn(2).width >= 22); assert.ok(sheet.getColumn(5).width >= 38);
  assert.equal(sheet.getCell('F2').alignment.wrapText, true);
  assert.ok(!sheet.getRow(1).values.includes('From time'));
  assert.ok(!sheet.getRow(1).values.includes('To time'));
  assert.ok(!sheet.getRow(1).values.includes('Type'));
  assert.ok(sheet.getRow(2).height >= 42); assert.equal(sheet.views[0].ySplit, 1); assert.ok(sheet.autoFilter);
});
test('attendance workbook includes summary, event details and review history without fabricated data', async () => {
  const rows = [['Club', 'Event', 'Event date', 'Type', 'Full name', 'MIU ID', 'MIU email', 'Major', 'Approval status'],
    ['MUN', 'miu', '2026-10-11', 'event', 'Student', '001', 'student@miuegypt.edu.eg', '', 'pending_pr']];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await attendanceWorkbook(rows, { event: { location: 'Main hall', description: 'Club workshop' },
    sheet: 'verified', people: [{ name: 'Student', email: 'student@miuegypt.edu.eg', approvalHistory: [{ role: 'supervisor', action: 'approved', note: 'Checked', createdAt: '2026-10-12T10:00:00Z' }] }] }));
  assert.deepEqual(workbook.worksheets.map(s => s.name), ['Summary', 'Event details', 'Attendance', 'Review history']);
  assert.equal(workbook.getWorksheet('Summary').getCell('B3').value, 1);
  assert.equal(workbook.getWorksheet('Event details').getCell('D2').value, 'Main hall');
  assert.equal(workbook.getWorksheet('Event details').getCell('E2').value, 'Club workshop');
  assert.equal(workbook.getWorksheet('Review history').getCell('F2').value, 'Checked');
});
