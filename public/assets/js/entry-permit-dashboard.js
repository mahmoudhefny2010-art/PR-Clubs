(() => {
  const dialog = document.getElementById('entryPermitDialog');
  const openButton = document.getElementById('openEntryPermitDialogBtn');
  const closeButton = document.getElementById('closeEntryPermitDialogBtn');
  const form = document.getElementById('dashboardEntryPermitForm');
  const rowsBody = document.getElementById('dashboardPermitItemsBody');
  const addButton = document.getElementById('addPermitItemRowBtn');
  const feedback = document.getElementById('dashboardEntryPermitFeedback');
  const submitButton = document.getElementById('submitEntryPermitBtn');
  if (!dialog || !openButton || !form || !rowsBody) return;

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

  function addRow(values = {}) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input name="quantity" type="number" min="1" max="10000" step="1" value="${Number(values.quantity) || 1}" required aria-label="Quantity"></td>
      <td><input name="number" maxlength="80" value="" required aria-label="Number or ID"></td>
      <td><input name="details" maxlength="1000" value="" required aria-label="Item or person details" placeholder="Name, equipment, or item details"></td>
      <td><button class="entry-permit-row-remove" type="button" aria-label="Remove row">&times;</button></td>`;
    row.querySelector('[name="number"]').value = values.number || '';
    row.querySelector('[name="details"]').value = values.details || '';
    row.querySelector('.entry-permit-row-remove').addEventListener('click', () => {
      if (rowsBody.rows.length > 1) row.remove();
      else {
        row.querySelectorAll('input').forEach((input) => { if (input.name !== 'quantity') input.value = ''; });
        row.querySelector('[name="quantity"]').value = '1';
      }
    });
    rowsBody.append(row);
  }

  openButton.addEventListener('click', () => {
    feedback.textContent = '';
    if (!rowsBody.rows.length) addRow();
    dialog.showModal();
  });
  closeButton?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  addButton?.addEventListener('click', () => addRow());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    feedback.textContent = '';
    submitButton.disabled = true;
    const formData = new FormData(form);
    const permitItems = Array.from(rowsBody.rows, (row) => ({
      quantity: Number(row.querySelector('[name="quantity"]').value),
      number: row.querySelector('[name="number"]').value.trim(),
      details: row.querySelector('[name="details"]').value.trim()
    }));
    const payload = {
      title: formData.get('title'),
      date: formData.get('date'),
      time: formData.get('time'),
      location: formData.get('location'),
      permitItems,
      submit: true
    };
    try {
      const response = await fetch('/api/club/content/entry_permit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not submit this permit.');
      form.reset();
      rowsBody.replaceChildren();
      addRow();
      feedback.textContent = 'Entry permit submitted to PR. You can follow its progress in Approval checkpoints.';
      window.dispatchEvent(new CustomEvent('club:entry-permit-submitted', { detail: result }));
    } catch (error) {
      feedback.textContent = error.message || 'Could not submit this permit.';
    } finally {
      submitButton.disabled = false;
    }
  });
})();
