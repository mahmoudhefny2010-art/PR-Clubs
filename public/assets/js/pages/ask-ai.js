(() => {
  const form = document.getElementById('askAiForm');
  const input = document.getElementById('askAiInput');
  const messages = document.getElementById('askAiMessages');
  const sendButton = document.getElementById('askAiSend');
  const clearButton = document.getElementById('clearChatButton');
  const modeLabel = document.getElementById('askAiMode');
  const suggestions = document.getElementById('askAiSuggestions');
  if (!form || !input || !messages) return;

  let previousQuestions = [];
  let pending = false;
  let lastFailedQuestion = '';
  const escapePath = (value) => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/pages/help.html';

  fetch('/api/ask-ai/status', { cache: 'no-store' })
    .then((response) => response.ok ? response.json() : null)
    .then((status) => { modeLabel.textContent = status?.aiConfigured ? 'AI assisted · published site data' : 'Website data mode · no API key needed'; })
    .catch(() => { modeLabel.textContent = 'Website data mode'; });

  function appendMessage(role, message, options = {}) {
    const article = document.createElement('article');
    article.className = `ask-message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
    if (role !== 'user') {
      const avatar = document.createElement('span');
      avatar.className = 'message-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = '✦';
      article.append(avatar);
    }
    const body = document.createElement('div');
    body.className = 'message-body';
    if (role !== 'user' && options.meta) {
      const meta = document.createElement('p');
      meta.className = 'message-meta';
      meta.textContent = options.meta;
      body.append(meta);
    }
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    body.append(paragraph);
    if (options.notice) {
      const notice = document.createElement('p');
      notice.className = 'message-notice';
      notice.textContent = options.notice;
      body.append(notice);
    }
    if (Array.isArray(options.sources) && options.sources.length) {
      const links = document.createElement('nav');
      links.className = 'message-sources';
      links.setAttribute('aria-label', 'Related pages');
      for (const source of options.sources.slice(0, 5)) {
        const anchor = document.createElement('a');
        anchor.href = escapePath(source.url);
        anchor.textContent = source.label || 'Related page';
        links.append(anchor);
      }
      body.append(links);
    }
    if (options.retry) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'message-retry';
      retry.textContent = 'Try again';
      retry.addEventListener('click', () => sendQuestion(lastFailedQuestion, false));
      body.append(retry);
    }
    article.append(body);
    messages.append(article);
    messages.scrollTop = messages.scrollHeight;
    clearButton.disabled = pending || messages.querySelectorAll('.user-message').length === 0;
    return article;
  }

  function addTyping() {
    const article = document.createElement('article');
    article.className = 'ask-message assistant-message';
    article.setAttribute('aria-label', 'Assistant is responding');
    article.innerHTML = '<span class="message-avatar" aria-hidden="true">✦</span><div class="message-body"><p class="message-meta">Thinking</p><span class="ask-ai-typing" aria-hidden="true"><span></span><span></span><span></span></span></div>';
    messages.append(article);
    messages.scrollTop = messages.scrollHeight;
    return article;
  }

  async function sendQuestion(question, addToChat = true) {
    const value = String(question || '').trim();
    if (!value || pending) return;
    const context = previousQuestions.slice(-6);
    if (addToChat) {
      appendMessage('user', value);
      previousQuestions.push(value);
      previousQuestions = previousQuestions.slice(-6);
    }
    lastFailedQuestion = value;
    pending = true;
    sendButton.disabled = true;
    input.disabled = true;
    clearButton.disabled = true;
    suggestions.hidden = true;
    const typing = addTyping();
    try {
      const response = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: value, context })
      });
      const result = await response.json().catch(() => ({}));
      typing.remove();
      if (!response.ok) {
        const errorMessage = result.message || 'I could not send that question right now. Please try again.';
        appendMessage('assistant', errorMessage, { retry: true });
        throw new Error('ASK_AI_HANDLED');
      }
      const mode = result.mode === 'ai' ? 'AI answer' : 'Website data answer';
      modeLabel.textContent = result.mode === 'ai' ? 'AI assisted · published site data' : 'Website data mode';
      appendMessage('assistant', result.answer || 'I could not find a verified answer in the published website information.', {
        meta: mode,
        notice: result.notice,
        sources: result.sources
      });
    } catch (error) {
      typing.remove();
      if (error.message !== 'ASK_AI_HANDLED') appendMessage('assistant', 'I could not connect just now. Check your connection and try again.', { retry: true });
    } finally {
      pending = false;
      sendButton.disabled = false;
      input.disabled = false;
      clearButton.disabled = messages.querySelectorAll('.user-message').length === 0;
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value;
    input.value = '';
    input.style.height = 'auto';
    sendQuestion(question);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  });
  suggestions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-question]');
    if (button) sendQuestion(button.dataset.question);
  });
  clearButton.addEventListener('click', () => {
    if (pending) return;
    previousQuestions = [];
    lastFailedQuestion = '';
    messages.replaceChildren();
    suggestions.hidden = false;
    appendMessage('assistant', 'Hi! I can help you explore the clubs website. Ask me about joining a club, upcoming events, recent announcements, or finding an application.');
    clearButton.disabled = true;
    input.focus();
  });
})();
