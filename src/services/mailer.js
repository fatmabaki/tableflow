// Resend adapter. Uses Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
// Throws on any failure so the worker can record the error and retry.
const config = require('../config');

async function sendViaResend({ to, subject, html, text }, fetchImpl = fetch) {
  if (!config.email.resendApiKey) throw new Error('RESEND_API_KEY is not configured');
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.email.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.email.from, to: [to], subject, html, text: text || undefined }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message || body.name || 'request failed'}`);
  return { id: body.id };
}

module.exports = { sendViaResend };
