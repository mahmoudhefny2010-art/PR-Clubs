'use strict';

const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';

class OneSignalApiError extends Error {
  constructor(status, code = '') {
    super(`OneSignal API request failed (${status}).`);
    this.name = 'OneSignalApiError';
    this.status = status;
    this.code = code;
  }
}

async function claimOneSignalDispatch(eventKey, insertDispatch) {
  try {
    await insertDispatch(eventKey);
    return true;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

function resolveExternalIds(externalId, externalIds) {
  const values = Array.isArray(externalIds) ? externalIds : externalId ? [externalId] : [];
  const unique = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  if (!unique.length || unique.length > 20000) throw new Error('ONESIGNAL_INVALID_RECIPIENTS');
  return unique;
}

async function sendOneSignalPush({ appId, apiKey, externalId, externalIds, title, message, url, fetchImpl = fetch }) {
  if (!appId || !apiKey) throw new Error('ONESIGNAL_NOT_CONFIGURED');
  if (!title || !message || !url) throw new Error('ONESIGNAL_INVALID_MESSAGE');
  const recipients = resolveExternalIds(externalId, externalIds);

  const response = await fetchImpl(ONESIGNAL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app_id: appId,
      target_channel: 'push',
      include_aliases: { external_id: recipients },
      headings: { en: title },
      contents: { en: message },
      url
    }),
    signal: AbortSignal.timeout(8000)
  });

  let result = {};
  try { result = await response.json(); } catch { /* Provider may return an empty body. */ }
  if (!response.ok) {
    const providerCode = String(result.errors?.[0]?.code || result.errors?.[0] || '').slice(0, 60);
    throw new OneSignalApiError(response.status, providerCode);
  }
  return { messageId: typeof result.id === 'string' ? result.id : '' };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function sendOneSignalEmail({ appId, apiKey, externalId, externalIds, subject, message, url, fetchImpl = fetch }) {
  if (!appId || !apiKey) throw new Error('ONESIGNAL_NOT_CONFIGURED');
  if (!subject || !message || !url) throw new Error('ONESIGNAL_INVALID_MESSAGE');
  const recipients = resolveExternalIds(externalId, externalIds);

  const response = await fetchImpl(ONESIGNAL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app_id: appId,
      target_channel: 'email',
      include_aliases: { external_id: recipients },
      email_subject: subject,
      email_body: `<p>${escapeHtml(message)}</p><p><a href="${escapeHtml(url)}">Open the club feed</a></p>`
    }),
    signal: AbortSignal.timeout(8000)
  });

  let result = {};
  try { result = await response.json(); } catch { /* Provider may return an empty body. */ }
  if (!response.ok) {
    const providerCode = String(result.errors?.[0]?.code || result.errors?.[0] || '').slice(0, 60);
    throw new OneSignalApiError(response.status, providerCode);
  }
  return { messageId: typeof result.id === 'string' ? result.id : '' };
}

module.exports = { ONESIGNAL_API_URL, OneSignalApiError, claimOneSignalDispatch, sendOneSignalPush, sendOneSignalEmail };
