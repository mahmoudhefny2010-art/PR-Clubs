const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');

exports.install = app => {
  const state = { mode: 'success', batch: 0, undo: null };
  app.get('/api/admin/clubs/import/undo/latest', (req, res) => res.json({ available: false }));
  app.post('/api/admin/clubs/import/cleanup', (req, res) => res.json({ cleaned: true }));
  app.post('/api/admin/clubs/import/undo', (req, res) => res.json({ message: 'The import was undone.' }));
  app.post('/api/admin/clubs/import', (req, res) => {
    state.batch++;
    if (state.mode === 'uncertain') return res.status(503).json({ message: 'Commit acknowledgement unavailable.', commitUncertain: true });
    if (state.mode === 'reject' && state.batch === 2) return res.status(409).json({ message: 'Officer account is assigned to another club.', commitUncertain: false });
    const rowResults = req.body.records.map(row => ({ rowNumber: row.rowNumber, name: row.name, clubId: row.rowNumber, status: row.name === 'Science Club' ? 'updated' : 'inserted', reason: row.name === 'Science Club' ? 'Updated the existing club; no duplicate was inserted.' : 'Inserted a new club.' }));
    res.json({ imported: rowResults.length, created: rowResults.filter(row => row.status === 'inserted').length, updated: rowResults.filter(row => row.status === 'updated').length, rolesAssigned: 0, importId: req.body.importId, undoAvailable: true, rowResults });
  });
  return state;
};

exports.run = async ({ cdp, origin, until, screenshot, state, root, output }) => {
  const workbookPath = path.join(output, 'row-log-fixture.xlsx');
  const makeWorkbook = async (names, invalid = false) => {
    const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Clubs');
    sheet.addRow(['Club Name', 'Club Description']);
    const imageId = workbook.addImage({ buffer: fs.readFileSync(path.join(root, 'public/assets/img/pics/pwa-icon-192.png')), extension: 'png' });
    names.forEach((name, index) => { sheet.addRow(name ? [name, invalid && index === 0 ? '' : 'Club description'] : ['', '']); if (name) sheet.addImage(imageId, { tl: { col: 2, row: index + 1 }, ext: { width: 30, height: 30 } }); });
    await workbook.xlsx.writeFile(workbookPath);
  };
  const open = async () => {
    await cdp.send('Page.navigate', { url: origin + '/admin/excel-review' });
    await until("document.getElementById('excelReviewFile')");
    await until("!document.documentElement.classList.contains('site-startup-pending')");
    await cdp.evaluate("window.uploadImageToCloudinary=async file=>{if(window.fixtureUploadFailure&&file.name.includes('Faulty'))throw new Error('Fixture image upload failed');return {url:'https://example.test/image.png',publicId:'clubs/test-image'}}");
    state.batch = 0;
  };
  const choose = async () => {
    const { root: document } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: document.nodeId, selector: '#excelReviewFile' });
    await cdp.send('DOM.setFileInputFiles', { nodeId, files: [workbookPath] });
    await until("document.querySelector('[data-excel-log-body] tr')");
  };
  const logText = () => cdp.evaluate("document.querySelector('[data-excel-log-body]').textContent");
  await makeWorkbook(['Science Club', '', '<New club>', ...Array.from({ length: 49 }, (_, index) => 'Club ' + index)]);
  await open(); await choose();
  assert.equal(await cdp.evaluate("document.querySelectorAll('[data-excel-row]').length"), 50);
  assert.ok((await logText()).includes('Skipped'));
  await cdp.evaluate("document.getElementById('excelImportConfirm').click()");
  await until("document.getElementById('excelReviewStatus').textContent.includes('Import complete')");
  assert.equal(state.batch, 3);
  assert.equal(await cdp.evaluate("document.querySelector('[data-excel-row=\"2\"] [data-state]').dataset.state"), 'updated');
  assert.equal(await cdp.evaluate("document.querySelector('[data-excel-row=\"4\"] [data-state]').dataset.state"), 'inserted');
  assert.equal(await cdp.evaluate("document.querySelector('[data-excel-row=\"4\"]').querySelector('new')"), null, 'Workbook text is escaped');
  await cdp.evaluate("document.querySelector('[data-excel-log-next]').click()");
  assert.equal(await cdp.evaluate("document.querySelectorAll('[data-excel-row]').length"), 2);
  assert.equal(await cdp.evaluate("document.querySelector('[data-excel-row=\"53\"] [data-state]').dataset.state"), 'inserted');
  await cdp.evaluate("document.querySelector('[data-excel-log-filter]').value='saved';document.querySelector('[data-excel-log-filter]').dispatchEvent(new Event('change'))");
  assert.ok((await logText()).includes('Updated'));
  await cdp.evaluate("document.querySelector('#excelReviewUndo button').click()");
  await until("document.querySelector('[data-excel-log-summary]').textContent.includes('0 saved')");
  await cdp.evaluate("document.querySelector('[data-excel-log-filter]').value='skipped';document.querySelector('[data-excel-log-filter]').dispatchEvent(new Event('change'))");
  assert.ok((await logText()).includes('Undone'));

  await open(); await choose(); state.mode = 'reject';
  await cdp.evaluate("document.getElementById('excelImportConfirm').click()");
  await until("document.getElementById('excelReviewStatus').textContent.includes('Import stopped')");
  assert.equal(await cdp.evaluate("document.querySelector('[data-excel-row=\"2\"] [data-state]').dataset.state"), 'updated');
  assert.equal(await cdp.evaluate("document.querySelector('[data-excel-row=\"28\"] [data-state]').dataset.state"), 'not_imported');
  assert.ok((await logText()).includes('Officer account is assigned to another club'));
  await cdp.evaluate("document.querySelector('[data-excel-log-next]').click()");
  assert.ok((await logText()).includes('Not attempted'));
  for (const theme of ['light', 'dark']) for (const width of [1440, 375]) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 760 });
    await cdp.evaluate("document.querySelector('.v2-excel-row-log').scrollIntoView({behavior:'instant',block:'start'})");
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `Excel row log fits ${width}px`);
    assert.equal(await cdp.evaluate("[...document.querySelectorAll('.v2-excel-row-log, .v2-excel-log-toolbar, [data-excel-log-filter]')].every(el=>el.getBoundingClientRect().right<=innerWidth)"), true, `Row log controls stay inside ${width}px`);
    await screenshot(`excel-row-log-${theme}-${width}`);
  }
  state.mode = 'uncertain'; await makeWorkbook(['Unconfirmed Club']); await open(); await choose();
  await cdp.evaluate("document.getElementById('excelImportConfirm').click()");
  await until("document.querySelector('[data-state=unconfirmed]')");
  assert.ok((await logText()).includes('could not be confirmed'));
  state.mode = 'success'; await makeWorkbook(['Faulty Club']); await open(); await choose();
  await cdp.evaluate("window.fixtureUploadFailure=true;document.getElementById('excelImportConfirm').click()");
  await until("document.querySelector('[data-state=failed]')");
  assert.equal(state.batch, 0); assert.ok((await logText()).includes('Image upload failed'));
  await makeWorkbook(['Invalid Club'], true); await open(); await choose();
  assert.equal(await cdp.evaluate("document.getElementById('excelImportConfirm').disabled"), true);
  assert.ok((await logText()).includes('description is missing'));
};
