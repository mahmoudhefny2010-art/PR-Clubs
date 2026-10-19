(() => {
  'use strict';
  window.mountAdminExcelImport = ({ read, request, escape, invalidate, refresh }) => {
    const $ = id => document.getElementById(id);
    $('toolContent').innerHTML = `<section class="v2-excel-review"><p class="v2-panel-note">Upload a workbook with club name, description and one embedded logo image per row. President and Vice President email columns are optional; only supplied MIU emails are assigned dashboard roles. Existing clubs are matched by exact name or the known name variants shown in the review. Matching rows update the existing club using the workbook name and description; they do not create a duplicate. Nothing changes until you confirm the import. Up to 2,000 club rows; workbook limit 50 MB. For new clubs, missing category defaults to “Other”, committee to the club name, tagline to the start of its description, and requirements to “Contact the club for current application requirements.” These defaults are shown in the review. Social links and officers’ names, IDs, phones and faculty/year are not stored by the current website data model.</p><div id="excelReviewUndo" class="v2-panel-note" role="status"></div><label>Club workbook (.xlsx)<input id="excelReviewFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label><p id="excelReviewStatus" class="v2-panel-note" role="status">Choose the workbook to start a local review.</p><div id="excelReviewPreview"></div></section>`;
    const input = $('excelReviewFile'), status = $('excelReviewStatus'), preview = $('excelReviewPreview'), undoHost = $('excelReviewUndo');
    let activeLogRows = [], activeImportId, renderActiveLog = () => {};
    const displayUndo = (importId, count) => {
      undoHost.replaceChildren();
      const button = document.createElement('button'); button.type = 'button'; button.className = 'v2-action'; button.textContent = `Undo latest import (${count} clubs)`;
      const message = document.createElement('span'); message.className = 'v2-panel-note'; message.setAttribute('role', 'status');
      button.addEventListener('click', async () => {
        button.disabled = true; message.textContent = 'Restoring the clubs to their pre-import state…';
        try {
          const result = await request('/api/admin/clubs/import/undo', { method: 'POST', body: JSON.stringify({ importId }) });
          if (activeImportId === importId) { for (const row of activeLogRows) if (['inserted', 'updated', 'unconfirmed'].includes(row.logState)) { row.logState = 'undone'; row.logReason = 'This import was undone. The club was restored to its previous state or removed if newly created.'; } renderActiveLog(); }
          undoHost.replaceChildren(); status.textContent = result.message || 'The latest import was undone.'; invalidate(); refresh();
        } catch (error) { button.disabled = false; message.textContent = error.message || 'The import could not be safely undone.'; }
      });
      undoHost.append(button, message);
    };
    request('/api/admin/clubs/import/undo/latest').then(result => { if (result.available) displayUndo(result.importId, result.imported); }).catch(() => {});
    // Reset the native file input before opening the picker so choosing the
    // same workbook again always fires `change` (including after a retry).
    input.addEventListener('click', () => { if (!input.disabled) input.value = ''; });
    let libraryPromise;
    const loadExcel = () => {
      if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
      if (!libraryPromise) libraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script'); script.src = '/assets/vendor/exceljs.min.js'; script.async = true;
        script.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('Excel reader failed to start.'));
        script.onerror = () => { libraryPromise = null; reject(new Error('Excel reader failed to load. Check your connection.')); };
        document.head.append(script);
      });
      return libraryPromise;
    };
    const cellText = value => {
      if (value == null) return '';
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'object') {
        if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
        if (value.text !== undefined) return String(value.text);
        if (value.result !== undefined) return cellText(value.result);
        if (value.hyperlink) return String(value.hyperlink);
        return '';
      }
      return String(value);
    };
    const normalize = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
    const knownAliases = new Map([['miu theatre','theater'],['tuners','tunners'],['ieee miu sb','ieee'],['miu-munal','mun']]);
    const importKey = name => knownAliases.get(normalize(name)) || normalize(name);
    const findExisting = (clubs, name) => clubs.get(normalize(name)) || clubs.get(importKey(name)) || null;
    const validEmail = value => /^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/i.test(String(value || '').trim());
    const imageFile = (workbook, id, club) => {
      const image = workbook.getImage(id), ext = String(image?.extension || '').toLowerCase();
      const type = ({ jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp' })[ext];
      if (!image?.buffer || !type) return null;
      const bytes = image.buffer instanceof Uint8Array ? image.buffer : new Uint8Array(image.buffer);
      if (!bytes.length || bytes.length > 10 * 1024 * 1024) return null;
      const filename = `${String(club || 'club').replace(/[^a-z0-9_-]+/gi, '-')}.${ext}`;
      return new File([bytes], filename, { type });
    };

    async function review(workbook, sheet) {
      const headers = new Map();
      sheet.getRow(1).eachCell((cell, index) => headers.set(normalize(cellText(cell.value)), index));
      const getColumn = name => headers.get(normalize(name));
      const col = {
        name:getColumn('Club Name'), description:getColumn('Club Description'), category:getColumn('category') || getColumn('Club Category'),
        committee:getColumn('Club Committee'), tagline:getColumn('Tagline'), requirements:getColumn('Requirements'),
        presidentName:getColumn('President Full Name'), presidentEmail:getColumn('President MIU Email'),
        viceName:getColumn('Vice President Full Name'), viceEmail:getColumn('Vice President MIU Email')
      };
      const missing = ['name', 'description'].filter(name => !col[name]);
      if (missing.length) throw new Error(`This is not the club officers workbook. Missing columns: ${missing.join(', ')}.`);
      status.textContent = 'Matching club names with the website…';
      const [active, archived] = await Promise.all([read('/api/clubs?media=links'), read('/api/admin/clubs/archived')]);
      const websiteClubs = new Map([...active, ...archived].map(club => [normalize(club.name), club]));
      const imagesByRow = new Map(), imageCounts = new Map();
      for (const embedded of sheet.getImages()) {
        const row = embedded.range?.tl?.nativeRow + 1;
        if (!row) continue;
        imageCounts.set(row, (imageCounts.get(row) || 0) + 1);
        imagesByRow.set(row, imageFile(workbook, embedded.imageId, cellText(sheet.getRow(row).getCell(col.name).value)));
      }
      const rows = [], logRows = [], errors = [], names = new Set(), assigned = new Map();
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber), get = key => col[key] ? cellText(row.getCell(col[key]).value).trim() : '';
        const name = get('name');
        if (!name && !get('description')) { logRows.push({ rowNumber, name: '', logState: 'skipped', logReason: 'Skipped: club name and description are both blank.' }); continue; }
        const item = {
          rowNumber, name, key:normalize(name), category:get('category'), committee:get('committee'), tagline:get('tagline'), requirements:get('requirements'), description:get('description'),
          presidentName:get('presidentName'), presidentEmail:get('presidentEmail').toLowerCase(),
          vicePresidentName:get('viceName'), vicePresidentEmail:get('viceEmail').toLowerCase(),
          imageFile:imagesByRow.get(rowNumber) || null, imageCount:imageCounts.get(rowNumber) || 0,
          existing:findExisting(websiteClubs,name), errors:[], newClub:null
        };
        item.identityKey = item.existing ? `club:${item.existing.id}` : `name:${importKey(item.name)}`;
        const fail = message => item.errors.push(message);
        if (!item.name) fail('club name is missing');
        if (item.name.length > 80) fail('club name is longer than 80 characters');
        if (item.identityKey && names.has(item.identityKey)) fail('club name, including its known existing-name variant, appears more than once');
        if (item.identityKey) names.add(item.identityKey);
        if (!item.description || item.description.length > 1200) fail('description is missing or too long');
        if (item.category.length > 80) fail('category is longer than 80 characters');
        if (item.committee.length > 100 || item.tagline.length > 140 || item.requirements.length > 600) fail('optional club detail exceeds its field limit');
        if (item.presidentEmail && (!validEmail(item.presidentEmail) || item.presidentName.length > 120)) fail('President MIU email or name is invalid');
        if (item.vicePresidentEmail && (!validEmail(item.vicePresidentEmail) || item.vicePresidentName.length > 120)) fail('Vice President MIU email or name is invalid');
        if (item.presidentEmail && item.presidentEmail === item.vicePresidentEmail) fail('President and Vice President need different emails');
        if (!item.imageFile || item.imageCount !== 1) fail('add exactly one embedded JPG, PNG or WebP image (up to 10 MB)');
        if (item.existing?.archivedAt) fail('club is archived; restore it before importing');
        for (const [role,email] of [['President',item.presidentEmail],['Vice President',item.vicePresidentEmail]]) {
          if (!validEmail(email)) continue;
          const roleKey = `${role}:${email}`;
          if (assigned.has(roleKey) && assigned.get(roleKey) !== item.identityKey) fail(`${role} email appears for more than one club`);
          assigned.set(roleKey,item.identityKey);
        }
        if (item.errors.length) errors.push(`Row ${rowNumber} · ${item.name || 'Unnamed club'}: ${item.errors.join('; ')}`);
        rows.push(item);
        logRows.push(item);
      }
      if (!rows.length) throw new Error('No club rows were found below the header.');
      if (rows.length > 2000) throw new Error('The maximum is 2,000 club rows per workbook.');
      const newRows = rows.filter(item => !item.existing);
      const previewRows = rows.slice(0,20).map(item => `<tr><td>${escape(item.rowNumber)}</td><td>${escape(item.name)}</td><td>${item.existing ? `Update ${escape(item.existing.name)}${normalize(item.existing.name)!==normalize(item.name)?` · use workbook name “${escape(item.name)}”`:''}` : 'Create new'}</td><td>${escape(item.presidentEmail || 'Not assigned')}</td><td>${escape(item.vicePresidentEmail || 'Not assigned')}</td><td>${item.imageFile ? 'Ready' : 'Missing'}</td></tr>`).join('');
      const roleAssignments = rows.reduce((count, item) => count + Boolean(item.presidentEmail) + Boolean(item.vicePresidentEmail), 0);
      preview.innerHTML = `<div class="v2-excel-review-summary"><strong>${rows.length.toLocaleString()} rows checked</strong><span>${rows.length-newRows.length} existing · ${newRows.length} new clubs</span><span>${rows.filter(item=>item.imageFile).length} images</span><span>${roleAssignments} optional role assignments</span><span class="${errors.length?'is-error':''}">${errors.length} errors</span></div><p class="v2-panel-note">New clubs use the defaults shown above when optional fields are missing. Omitted officer emails leave existing role assignments unchanged.</p><div class="v2-excel-table-wrap"><table class="v2-excel-table"><thead><tr><th>Row</th><th>Club</th><th>Action</th><th>President</th><th>Vice President</th><th>Image</th></tr></thead><tbody>${previewRows}</tbody></table></div>${rows.length>20?`<p class="v2-panel-note">Showing 20 of ${rows.length.toLocaleString()}; all rows were validated.</p>`:''}${errors.length?`<details class="v2-excel-errors"><summary>Validation details</summary><ul>${errors.slice(0,100).map(error=>`<li>${escape(error)}</li>`).join('')}</ul>${errors.length>100?`<p>And ${errors.length-100} more errors.</p>`:''}</details>`:''}<div id="excelNewClubFields"></div><p id="excelImportProgress" class="v2-panel-note" role="status"></p><button id="excelImportConfirm" class="v2-action" type="button" ${errors.length?'disabled':''}>${errors.length?'Fix errors before importing':'Review and import clubs'}</button>`;
      const fieldHost = preview.querySelector('#excelNewClubFields');
       fieldHost.innerHTML = '';
      const confirm = preview.querySelector('#excelImportConfirm');
       confirm.disabled = errors.length > 0;
      const logHost = document.createElement('section'); logHost.className = 'v2-excel-row-log';
      logHost.innerHTML = `<h3>Excel row log</h3><p class="v2-panel-note">Every data row is listed, including blank rows. Results update during import. A matched club is updated instead of inserted again.</p><div class="v2-excel-log-toolbar"><label>Show rows<select data-excel-log-filter><option value="all">All rows</option><option value="saved">Inserted / updated</option><option value="issues">Not imported / needs attention</option><option value="pending">Pending</option><option value="skipped">Skipped / undone</option></select></label><p data-excel-log-summary role="status" aria-live="polite"></p></div><div class="v2-excel-table-wrap" tabindex="0" role="region" aria-label="Excel row results"><table class="v2-excel-table"><caption class="v2-sr">Import result for each Excel data row</caption><thead><tr><th scope="col">Excel row</th><th scope="col">Club</th><th scope="col">Result</th><th scope="col">Details / reason</th></tr></thead><tbody data-excel-log-body></tbody></table></div><div class="v2-excel-log-pagination"><button type="button" class="v2-action secondary" data-excel-log-previous>Previous rows</button><span data-excel-log-page></span><button type="button" class="v2-action secondary" data-excel-log-next>Next rows</button></div>`;
      preview.append(logHost);
      const labels = { ready: 'Not imported yet', invalid: 'Validation failed', uploading: 'Uploading image', uploaded: 'Image uploaded', saving: 'Saving', inserted: 'Inserted', updated: 'Updated', failed: 'Not imported', not_imported: 'Not imported', unconfirmed: 'Save not confirmed', skipped: 'Skipped', undone: 'Undone' };
      const pendingStates = ['ready', 'uploading', 'uploaded', 'saving'], issueStates = ['invalid', 'failed', 'not_imported', 'unconfirmed'];
      let logPage = 1;
      const renderLog = () => {
        const filter = logHost.querySelector('[data-excel-log-filter]').value;
        const filtered = logRows.filter(row => filter === 'all' || (filter === 'saved' ? ['inserted', 'updated'] : filter === 'issues' ? issueStates : filter === 'pending' ? pendingStates : ['skipped', 'undone']).includes(row.logState));
        const pages = Math.max(1, Math.ceil(filtered.length / 50)); logPage = Math.min(logPage, pages);
        logHost.querySelector('[data-excel-log-body]').innerHTML = filtered.slice((logPage - 1) * 50, logPage * 50).map(row => `<tr data-excel-row="${row.rowNumber}"><td>${row.rowNumber}</td><td>${escape(row.name || '(blank)')}</td><td><span class="v2-excel-row-state" data-state="${row.logState}">${labels[row.logState]}</span></td><td>${escape(row.logReason)}</td></tr>`).join('') || '<tr><td colspan="4">No rows match this filter.</td></tr>';
        const saved = logRows.filter(row => ['inserted', 'updated'].includes(row.logState)).length, issues = logRows.filter(row => issueStates.includes(row.logState)).length;
        logHost.querySelector('[data-excel-log-summary]').textContent = `${logRows.length} data rows · ${saved} saved · ${issues} need attention`;
        logHost.querySelector('[data-excel-log-page]').textContent = `${filtered.length} rows · Page ${logPage} of ${pages}`;
        logHost.querySelector('[data-excel-log-previous]').disabled = logPage <= 1;
        logHost.querySelector('[data-excel-log-next]').disabled = logPage >= pages;
      };
      const setRow = (row, state, reason) => { row.logState = state; row.logReason = reason; renderLog(); };
      for (const row of rows) { row.logState = row.errors.length ? 'invalid' : 'ready'; row.logReason = row.errors.length ? row.errors.join('; ') : errors.length ? 'Not imported: fix workbook validation errors before confirming any rows.' : 'Validation passed. Waiting for you to confirm the import.'; }
      activeLogRows = logRows; renderActiveLog = renderLog; activeImportId = null;
      logHost.querySelector('[data-excel-log-filter]').onchange = () => { logPage = 1; renderLog(); };
      logHost.querySelector('[data-excel-log-previous]').onclick = () => { logPage--; renderLog(); };
      logHost.querySelector('[data-excel-log-next]').onclick = () => { logPage++; renderLog(); };
      renderLog();
      confirm.addEventListener('click', async () => {
        if (errors.length) return;
        confirm.disabled=true; input.disabled=true;
        let done=0, undoMayExist=false;
        const importId = window.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => { const random=Math.random()*16|0; return (character==='x'?random:(random&0x3|0x8)).toString(16); });
        activeImportId = importId;
        for (const row of rows) { row.logState = 'ready'; row.logReason = 'Waiting for this batch to start.'; } renderLog();
        const progress=preview.querySelector('#excelImportProgress');
        try {
          let created=0,updated=0,rolesAssigned=0;
          const chunkSize=25;
          for(let offset=0;offset<rows.length;offset+=chunkSize){
            const batch=rows.slice(offset,offset+chunkSize), uploaded=[];let cursor=0,submitted=false;
            try{
              progress.textContent=`Uploading images for clubs ${offset+1}-${offset+batch.length} of ${rows.length}…`;
              const uploads=await Promise.allSettled(Array.from({length:Math.min(3,batch.length)},async()=>{while(cursor<batch.length){const item=batch[cursor++];setRow(item,'uploading','Uploading the embedded club image.');try { item.image=await window.uploadImageToCloudinary(item.imageFile,'club');uploaded.push(item.image.publicId);setRow(item,'uploaded','Image uploaded. Waiting for this batch to save.'); } catch(error) { setRow(item,'failed','Image upload failed: '+(error.message || 'The image could not be uploaded.')); throw error; }}}));
              const uploadFailure=uploads.find(result=>result.status==='rejected');if(uploadFailure)throw uploadFailure.reason;
              submitted=true;
              for (const item of batch) { item.logState='saving'; item.logReason='Saving club details and supplied role assignments.'; } renderLog();
               const result=await request('/api/admin/clubs/import',{method:'POST',body:JSON.stringify({importId,records:batch.map(({rowNumber,name,category,committee,tagline,requirements,description,presidentName,presidentEmail,vicePresidentName,vicePresidentEmail,image})=>({rowNumber,name,category,committee,tagline,requirements,description,presidentName,presidentEmail,vicePresidentName,vicePresidentEmail,image}))})});
               const expectedRoles=batch.reduce((count,item)=>count+Boolean(item.presidentEmail)+Boolean(item.vicePresidentEmail),0);
               if(result.imported!==batch.length||!Number.isSafeInteger(result.created)||!Number.isSafeInteger(result.updated)||result.created+result.updated!==batch.length||result.rolesAssigned!==expectedRoles||result.importId!==importId||result.undoAvailable!==true){const error=new Error('The server response did not confirm every club, supplied role assignment and undo point.');error.commitUncertain=true;throw error;}
              if (!Array.isArray(result.rowResults) || result.rowResults.length !== batch.length || batch.some(item => result.rowResults.filter(row => row.rowNumber === item.rowNumber && row.name === item.name && ['inserted','updated'].includes(row.status)).length !== 1)) { const error = new Error('The server did not confirm an individual result for every Excel row.'); error.commitUncertain = true; throw error; }
              for (const item of batch) { const resultRow=result.rowResults.find(row=>row.rowNumber===item.rowNumber); item.logState=resultRow.status; item.logReason=resultRow.reason; } renderLog();
              undoMayExist=true;
              created+=result.created;updated+=result.updated;rolesAssigned+=result.rolesAssigned;done+=batch.length;
              progress.textContent=`Saved ${done}/${rows.length} clubs…`;
            }catch(error){
              if(uploaded.length&&!submitted)request('/api/admin/clubs/import/cleanup',{method:'POST',body:JSON.stringify({publicIds:uploaded})}).catch(()=>{});
              const uncertain=submitted&&(!Number.isInteger(error.status)||error.commitUncertain);
              for (const item of batch) if (item.logState !== 'failed' || submitted) { item.logState=uncertain?'unconfirmed':'not_imported'; item.logReason=uncertain ? `The batch save could not be confirmed. Check the website or undo the latest import before retrying. ${error.message}` : submitted ? `This batch was rejected; no rows in it were imported. ${error.message}` : `This batch was not submitted because an image upload failed. ${error.message}`; }
              for (const item of rows.slice(offset+batch.length)) { item.logState='not_imported'; item.logReason='Not attempted: import stopped at an earlier batch. '+error.message; } renderLog();
              undoMayExist ||= uncertain;
              throw new Error(`Import stopped. ${done} clubs were confirmed saved before this batch. ${uncertain?'The last batch may have committed, but its response was not confirmed. ':''}${error.message}Check the website, then retrying the workbook is safe; clubs are matched by name.`);
            }
          }
          status.textContent=`Import complete · ${created} created · ${updated} updated · ${rolesAssigned} role assignments.`;
          progress.textContent=`Saved all ${done} clubs in batches of ${chunkSize}.`;confirm.textContent='Import complete';input.disabled=false;preview.querySelector('.v2-excel-review-summary')?.classList.add('is-complete');displayUndo(importId,done);invalidate();refresh();
        } catch(error) {
          status.textContent=error.message||'The import could not be completed.';confirm.disabled=false;input.disabled=false;
          progress.textContent=`Import stopped · ${done} clubs confirmed saved. See the row log for each result and reason.`;
          if (undoMayExist) displayUndo(importId, Math.max(done, 1));
        }
      });
      status.textContent=`${sheet.name}: all ${rows.length.toLocaleString()} rows checked locally. Nothing is saved until you confirm.`;
    }
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];preview.innerHTML='';
      if(!file){status.textContent='Choose the workbook to start a local review.';return;}
      if(!/\.xlsx$/i.test(file.name)){status.textContent='Choose an .xlsx workbook.';return;}
      if(file.size>50*1024*1024){status.textContent='Choose a workbook up to 50 MB.';return;}
      input.disabled=true;status.textContent='Reading and validating every row locally…';
      try{const ExcelJS=await loadExcel();const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await file.arrayBuffer());const sheets=workbook.worksheets.filter(sheet=>sheet.getRow(1).cellCount>0);if(sheets.length!==1)throw new Error('Use a workbook with exactly one data worksheet.');await review(workbook,sheets[0]);}
      catch(error){status.textContent=error.message||'Could not read this .xlsx workbook.';}
      finally{input.disabled=false;}
    });
  };
})();
