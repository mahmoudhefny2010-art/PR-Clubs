
      let currentImage = '';
      const imageInput = document.getElementById('imageInput');
      imageInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) currentImage = await ContentStudio.fileToDataUrl(file);
      });

      ContentStudio.init({
        type: 'feed',
        pageTitle: 'Feed Studio',
        formTitle: 'New feed post',
        collect: () => ({
          title: document.getElementById('titleInput').value,
          date: document.getElementById('dateInput').value,
          time: document.getElementById('timeInput').value,
          description: document.getElementById('descInput').value,
          image: currentImage
        }),
        fill: (item) => {
          document.getElementById('titleInput').value = item.title || '';
          document.getElementById('dateInput').value = item.date || '';
          document.getElementById('timeInput').value = item.time || '';
          document.getElementById('descInput').value = item.description || '';
          currentImage = item.image || '';
        },
        resetExtras: () => {
          currentImage = '';
          imageInput.value = '';
        }
      });
