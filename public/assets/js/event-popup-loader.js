// Reuse the existing event popup and registration workflow on pages without its markup.
(() => {
  let pending;
  const load = async () => {
    const response = await fetch('/components/event-popup.html', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Event details could not be loaded. Please try again.');
    const template = document.createElement('template');
    template.innerHTML = await response.text();
    if (!document.getElementById('eventModal')) document.body.append(template.content);
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/assets/js/event-modal.js?v=20261019miusync1';
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error('Event details could not be loaded. Please try again.')); };
      document.body.append(script);
    });
  };
  const open = async event => {
    if (!pending) pending = load().catch(error => { pending = null; throw error; });
    await pending;
    if (window.openEventModal === open) throw new Error('Event details could not be loaded. Please try again.');
    window.openEventModal(event);
  };
  if (!window.openEventModal) window.openEventModal = open;
})();
