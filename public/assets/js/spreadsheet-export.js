(function (root) {
  function formatSheet(workbook, rows, name = 'Data') {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    const headers = rows[0] || [];
    sheet.columns = headers.map((header, index) => {
      const length = Math.max(String(header).length, ...rows.slice(1, 301).map(row => String(row[index] ?? '').split('\n').reduce((max, part) => Math.max(max, part.length), 0)));
      return { header, width: /email|mail/i.test(header) ? 38 : /date|time|checked|submitted|updated/i.test(header) ? Math.max(22, Math.min(length + 4, 30)) : Math.min(55, Math.max(18, length + 4)) };
    });
    for (const row of rows.slice(1)) sheet.addRow(row.map(value => value instanceof Date ? value.toISOString() : value ?? ''));
    sheet.eachRow((row, index) => {
      const lines = Math.max(1, ...row.values.slice(1).map((value, column) => String(value ?? '').split('\n').reduce((count, text) => count + Math.max(1, Math.ceil(text.length / Math.max(12, sheet.getColumn(column + 1).width - 3))), 0)));
      row.height = index === 1 ? 34 : Math.min(409, Math.max(42, lines * 15 + 14));
      row.eachCell({ includeEmpty: true }, cell => {
        cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
        cell.font = { name: 'Calibri', size: 11, bold: index === 1, color: { argb: index === 1 ? 'FFFFFFFF' : 'FF172033' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index === 1 ? 'FFA8202B' : index % 2 === 0 ? 'FFF1F5F9' : 'FFFFFFFF' } };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFDCE3EB' } } };
        // Keep date/time strings and university IDs literal: no locale guessing,
        // lost leading zeros, formulas, scientific notation or #### display.
        if (typeof cell.value === 'string') cell.numFmt = '@';
      });
    });
    if (headers.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: headers.length } };
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return sheet;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { formatSheet };
  else root.formatSpreadsheetSheet = formatSheet;
})(typeof window === 'undefined' ? globalThis : window);
