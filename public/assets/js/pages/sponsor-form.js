
      let currentLogo = '';
      let currentAttachment = '';
      const logoInput = document.getElementById('sponsorLogoInput');
      const attachmentInput = document.getElementById('sponsorAttachmentInput');
      logoInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) currentLogo = await ContentStudio.fileToDataUrl(file);
      });
      attachmentInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) currentAttachment = await ContentStudio.fileToDataUrl(file);
      });

      ContentStudio.init({
        type: 'sponsor',
        pageTitle: 'Sponsor Studio',
        formTitle: 'New sponsor request',
        collect: () => ({
          sponsorName: document.getElementById('sponsorNameInput').value,
          sponsorCompany: document.getElementById('sponsorCompanyInput').value,
          sponsorContact: document.getElementById('sponsorContactInput').value,
          sponsorEmail: document.getElementById('sponsorEmailInput').value,
          sponsorPhone: document.getElementById('sponsorPhoneInput').value,
          sponsorType: document.getElementById('sponsorTypeInput').value,
          sponsorAmount: document.getElementById('sponsorAmountInput').value,
          sponsorBenefits: document.getElementById('sponsorBenefitsInput').value,
          sponsorDescription: document.getElementById('sponsorDescInput').value,
          sponsorLogo: currentLogo,
          sponsorAttachment: currentAttachment,
          sponsorNotes: document.getElementById('sponsorNotesInput').value
        }),
        fill: (item) => {
          document.getElementById('sponsorNameInput').value = item.sponsorName || '';
          document.getElementById('sponsorCompanyInput').value = item.sponsorCompany || '';
          document.getElementById('sponsorContactInput').value = item.sponsorContact || '';
          document.getElementById('sponsorEmailInput').value = item.sponsorEmail || '';
          document.getElementById('sponsorPhoneInput').value = item.sponsorPhone || '';
          document.getElementById('sponsorTypeInput').value = item.sponsorType || 'bronze';
          document.getElementById('sponsorAmountInput').value = item.sponsorAmount || '';
          document.getElementById('sponsorBenefitsInput').value = item.sponsorBenefits || '';
          document.getElementById('sponsorDescInput').value = item.sponsorDescription || '';
          document.getElementById('sponsorNotesInput').value = item.sponsorNotes || '';
          currentLogo = item.sponsorLogo || '';
          currentAttachment = item.sponsorAttachment || '';
        },
        resetExtras: () => {
          currentLogo = '';
          currentAttachment = '';
          logoInput.value = '';
          attachmentInput.value = '';
        }
      });
