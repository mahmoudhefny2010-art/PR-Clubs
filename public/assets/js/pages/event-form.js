
      let currentImage = '';
      const imageInput = document.getElementById('imageInput');
      imageInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) currentImage = await ContentStudio.fileToDataUrl(file);
      });

      ContentStudio.init({
        type: 'event',
        pageTitle: 'Event Studio',
        formTitle: 'New event',
        collect: () => ({
          title: document.getElementById('titleInput').value,
          date: document.getElementById('dateInput').value,
          time: document.getElementById('timeInput').value,
          location: document.getElementById('locationInput').value,
          registrationEnabled: document.getElementById('registrationEnabledInput').value === 'true',
          budget: document.getElementById('budgetInput').value,
          description: document.getElementById('descInput').value,
          image: currentImage
        }),
        fill: (item) => {
          document.getElementById('titleInput').value = item.title || '';
          document.getElementById('dateInput').value = item.date || '';
          document.getElementById('timeInput').value = item.time || '';
          document.getElementById('locationInput').value = item.location || '';
          document.getElementById('registrationEnabledInput').value = item.registrationEnabled === false ? 'false' : 'true';
          document.getElementById('budgetInput').value = item.budget || '';
          document.getElementById('descInput').value = item.description || '';
          currentImage = item.image || '';
        },
        resetExtras: () => {
          currentImage = '';
          imageInput.value = '';
        }
      });
