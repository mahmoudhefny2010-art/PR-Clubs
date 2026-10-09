
      ContentStudio.init({
        type: 'booth',
        pageTitle: 'Booth Studio',
        formTitle: 'New booth request',
        collect: () => ({
          boothName: document.getElementById('boothNameInput').value,
          boothPurpose: document.getElementById('boothPurposeInput').value,
          boothDescription: document.getElementById('boothDescInput').value,
          boothLocation: document.getElementById('boothLocationInput').value,
          boothSize: document.getElementById('boothSizeInput').value,
          boothEquipment: document.getElementById('boothEquipmentInput').value,
          boothSetupDate: document.getElementById('boothSetupDateInput').value,
          boothOpenDate: document.getElementById('boothOpenDateInput').value,
          boothCloseDate: document.getElementById('boothCloseDateInput').value,
          boothContact: document.getElementById('boothContactInput').value,
          boothNotes: document.getElementById('boothNotesInput').value
        }),
        fill: (item) => {
          document.getElementById('boothNameInput').value = item.boothName || '';
          document.getElementById('boothPurposeInput').value = item.boothPurpose || '';
          document.getElementById('boothDescInput').value = item.boothDescription || '';
          document.getElementById('boothLocationInput').value = item.boothLocation || '';
          document.getElementById('boothSizeInput').value = item.boothSize || '';
          document.getElementById('boothEquipmentInput').value = item.boothEquipment || '';
          document.getElementById('boothSetupDateInput').value = item.boothSetupDate || '';
          document.getElementById('boothOpenDateInput').value = item.boothOpenDate || '';
          document.getElementById('boothCloseDateInput').value = item.boothCloseDate || '';
          document.getElementById('boothContactInput').value = item.boothContact || '';
          document.getElementById('boothNotesInput').value = item.boothNotes || '';
        }
      });
