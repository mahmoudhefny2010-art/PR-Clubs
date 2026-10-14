const controllers = new WeakMap();
window.unmountStudentEventRegistration = form => {
  controllers.get(form)?.abort();
  form.classList.remove('student-event-registration-active');
  form.querySelector('[data-student-cancel]')?.remove();
  form.querySelectorAll('input').forEach(input => { input.required = true; const field = input.closest('.field-group'); if (field) { field.hidden = false; field.style.display = ''; } });
  const submit = form.querySelector('[type="submit"]'); submit.disabled = false; submit.textContent = 'Register for event';
};
window.mountStudentEventRegistration = async (form, feedback, endpoint) => {
  controllers.get(form)?.abort();
  form.classList.add('student-event-registration-active');
  const controller = new AbortController(); controllers.set(form, controller);
  const signal = controller.signal, submit = form.querySelector('[type="submit"]');
  form.hidden = false;
  form.querySelectorAll('input').forEach(input => { input.required = false; const field = input.closest('.field-group'); if (field) { field.hidden = true; field.style.display = 'none'; } });
  form.querySelector('[data-student-cancel]')?.remove();
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary-btn'; cancel.dataset.studentCancel = ''; cancel.textContent = 'Cancel registration'; cancel.hidden = true; form.append(cancel);
  submit.disabled = true; feedback.textContent = 'Checking registration status…';
  let busy = false;
  async function status() {
    const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', signal });
    const data = await response.json();
    if (response.status === 401) {
      feedback.replaceChildren(document.createTextNode('Sign in with your university student account to register. '));
      const link = document.createElement('a'); link.href = '/pages/applicant-login.html'; link.textContent = 'Sign in'; feedback.append(link); submit.disabled = true; return;
    }
    if (!response.ok) throw new Error(data.message || 'Could not check registration.');
    feedback.textContent = data.message; submit.textContent = data.registered ? 'Already registered' : 'Register for event';
    submit.disabled = data.registered || !data.eligible; cancel.hidden = !data.cancellationAllowed;
  }
  async function write(method) {
    if (busy) return; busy = true; submit.disabled = true; cancel.disabled = true; feedback.textContent = method === 'POST' ? 'Registering…' : 'Cancelling…';
    try {
      const response = await fetch(endpoint, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}', signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.message);
      await status();
    } catch (error) { if (error.name !== 'AbortError') { feedback.textContent = error.message || 'Could not confirm registration. Reload to check your status.'; submit.disabled = false; } }
    finally { busy = false; cancel.disabled = false; }
  }
  form.addEventListener('submit', event => { event.preventDefault(); void write('POST'); }, { signal });
  cancel.addEventListener('click', () => { if (window.confirm('Cancel your registration for this event?')) void write('DELETE'); }, { signal });
  try { await status(); } catch (error) { if (error.name !== 'AbortError') feedback.textContent = error.message || 'Registration is temporarily unavailable. Reload to retry.'; }
};
