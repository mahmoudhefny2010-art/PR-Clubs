(() => {
  const icons = {
    date: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"></rect><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01"></path></svg>',
    time: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3.5 2"></path></svg>'
  };

  function openPicker(button) {
    const input = document.getElementById(button.dataset.openPicker);
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else { input.focus(); input.click(); }
    } catch {
      input.focus();
      input.click();
    }
  }

  document.querySelectorAll('input[type="date"], input[type="time"]').forEach((input) => {
    let button = input.parentElement?.querySelector(`button[data-open-picker="${CSS.escape(input.id)}"]`);
    if (!button) {
      const wrapper = document.createElement('div');
      wrapper.className = 'date-time-picker';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.append(input);
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.openPicker = input.id;
      button.setAttribute('aria-label', `Choose ${input.type === 'date' ? 'date' : 'time'}${input.labels?.[0]?.textContent ? ` for ${input.labels[0].textContent.trim()}` : ''}`);
      button.title = `Choose ${input.type === 'date' ? 'date' : 'time'}`;
      button.innerHTML = icons[input.type];
      wrapper.append(button);
    }

    if (button.dataset.pickerReady) return;
    button.dataset.pickerReady = 'true';
    button.addEventListener('click', () => openPicker(button));
    input.addEventListener('keydown', (event) => {
      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        openPicker({ dataset: { openPicker: input.id } });
      }
    });
  });
})();
