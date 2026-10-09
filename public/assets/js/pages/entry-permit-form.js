let currentEntryPermitImage = '';
const entryPermitRows = document.getElementById('entryPermitItemsBody');
document.querySelectorAll('[data-open-picker]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.openPicker);
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else { input.focus(); input.click(); }
    } catch {
      input.focus();
      input.click();
    }
  });
});
function addEntryPermitRow(values = {}) {
  const row = document.createElement('tr');
  row.innerHTML = '<td><input name="quantity" type="number" min="1" max="10000" step="1" required aria-label="Quantity"></td><td><input name="number" maxlength="80" required aria-label="Number or ID"></td><td><input name="details" maxlength="1000" required aria-label="Item or person details" placeholder="Name, equipment, or item details"></td><td><button class="entry-permit-row-remove" type="button" aria-label="Remove row">&times;</button></td>';
  row.querySelector('[name="quantity"]').value = Number(values.quantity) || 1;
  row.querySelector('[name="number"]').value = values.number || '';
  row.querySelector('[name="details"]').value = values.details || '';
  row.querySelector('button').addEventListener('click', () => {
    if (entryPermitRows.rows.length > 1) row.remove();
    else { row.querySelectorAll('input').forEach((input) => { if (input.name !== 'quantity') input.value = ''; }); }
  });
  entryPermitRows.append(row);
}
document.getElementById('addEntryPermitRowBtn').addEventListener('click', () => addEntryPermitRow());
addEntryPermitRow();
const entryPermitImageInput = document.getElementById('imageInput');
entryPermitImageInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (file) currentEntryPermitImage = await ContentStudio.fileToDataUrl(file);
});

ContentStudio.init({
  type: 'entry_permit',
  pageTitle: 'Entry Permit',
  formTitle: 'New Entry Permit',
  collect: () => ({
    title: document.getElementById('titleInput').value,
    date: document.getElementById('dateInput').value,
    time: document.getElementById('timeInput').value,
    location: document.getElementById('locationInput').value,
    permitItems: Array.from(entryPermitRows.rows, (row) => ({
      quantity: Number(row.querySelector('[name="quantity"]').value),
      number: row.querySelector('[name="number"]').value.trim(),
      details: row.querySelector('[name="details"]').value.trim()
    })),
    image: currentEntryPermitImage
  }),
  fill: (item) => {
    document.getElementById('titleInput').value = item.title || '';
    document.getElementById('dateInput').value = item.date || '';
    document.getElementById('timeInput').value = item.time || '';
    document.getElementById('locationInput').value = item.location || '';
    entryPermitRows.replaceChildren();
    (item.permitItems?.length ? item.permitItems : [{}]).forEach(addEntryPermitRow);
    currentEntryPermitImage = item.image || '';
  },
  resetExtras: () => {
    currentEntryPermitImage = '';
    entryPermitImageInput.value = '';
    entryPermitRows.replaceChildren();
    addEntryPermitRow();
  }
});
