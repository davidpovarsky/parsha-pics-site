import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/lead.js';

const BASE_ENV = {
  APPROVED_LEGAL: 'true',
  LEAD_CAPTURE_ENABLED: 'true',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  TURNSTILE_ALLOWED_HOSTNAMES: 'example.com',
  RESEND_API_KEY: 'resend-secret',
  FROM_EMAIL: 'Parsha Pics <forms@example.com>',
  CONTACT_EMAIL: 'owner@example.com'
};
const request = (body, headers = {}) => new Request('https://example.com/api/lead', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://example.com', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});
const valid = (overrides = {}) => ({
  type: 'trial', name: 'Teacher Example', email: 'teacher@example.com', school: '', message: '',
  website: '', sefarim: [], turnstileToken: 'valid-token', ...overrides
});
const invoke = (body, env = BASE_ENV, headers) => onRequestPost({ request: request(body, headers), env });

let response = await invoke(valid(), {});
assert.equal(response.status, 503, 'both runtime launch gates are mandatory');
response = await invoke(valid(), { LEAD_CAPTURE_ENABLED: 'true' });
assert.equal(response.status, 503, 'legal approval runtime gate is mandatory');
response = await invoke(valid(), BASE_ENV, { 'content-type': 'text/plain' });
assert.equal(response.status, 415);
response = await invoke('{not-json', BASE_ENV);
assert.equal(response.status, 400);
response = await invoke(`{"padding":"${'x'.repeat(12_100)}"}`, BASE_ENV);
assert.equal(response.status, 413, 'actual streamed bytes are bounded without trusting Content-Length');
response = await invoke(valid(), BASE_ENV, { origin: 'https://attacker.example' });
assert.equal(response.status, 403);
response = await invoke(valid({ name: 42 }));
assert.equal(response.status, 400, 'wrong field types are rejected instead of coerced');
response = await invoke(valid({ extra: 'unexpected' }));
assert.equal(response.status, 400);
response = await invoke(valid({ name: 'A' }));
assert.equal(response.status, 400);
response = await invoke(valid({ type: 'pricing', sefarim: [] }));
assert.equal(response.status, 400);
response = await invoke(valid({ type: 'pricing', sefarim: ['Bereishis', 'Invalid'] }));
assert.equal(response.status, 400);
response = await invoke(valid({ type: 'pricing', sefarim: ['Full collection', 'Bereishis'] }));
assert.equal(response.status, 400);
response = await invoke(valid({ type: 'pricing', sefarim: ['Shemos', 'Shemos'] }));
assert.equal(response.status, 400);
response = await invoke(valid({ message: 'not valid for this form' }));
assert.equal(response.status, 400);
response = await invoke(valid({ sefarim: ['Shemos'] }));
assert.equal(response.status, 400);
response = await invoke(valid({ turnstileToken: '' }));
assert.equal(response.status, 400, 'Turnstile token is mandatory');
response = await invoke(valid({ website: 'spambot' }));
assert.equal(response.status, 200, 'honeypot submissions are silently accepted without providers');

const originalFetch = globalThis.fetch;
const withFetch = async (implementation, callback) => {
  globalThis.fetch = implementation;
  try { await callback(); } finally { globalThis.fetch = originalFetch; }
};

await withFetch(async () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 }), async () => {
  response = await invoke(valid());
  assert.equal(response.status, 403, 'invalid Turnstile result is rejected');
});
await withFetch(async () => new Response(JSON.stringify({ success: true, action: 'lead_contact', hostname: 'example.com' }), { status: 200 }), async () => {
  response = await invoke(valid());
  assert.equal(response.status, 403, 'Turnstile action must match the form type');
});
await withFetch(async () => new Response(JSON.stringify({ success: true, action: 'lead_trial', hostname: 'evil.example' }), { status: 200 }), async () => {
  response = await invoke(valid());
  assert.equal(response.status, 403, 'Turnstile hostname must be allow-listed');
});
await withFetch(async () => new Response('unavailable', { status: 503 }), async () => {
  response = await invoke(valid());
  assert.equal(response.status, 502, 'Turnstile provider errors fail closed');
});

let outgoingEmail;
await withFetch(async (url, options) => {
  if (String(url).includes('/turnstile/')) {
    return new Response(JSON.stringify({ success: true, action: 'lead_pricing', hostname: 'example.com' }), { status: 200 });
  }
  outgoingEmail = { url: String(url), options };
  return new Response('{}', { status: 200 });
}, async () => {
  response = await invoke(valid({
    type: 'pricing', name: '<Teacher>', school: 'Example School', sefarim: ['Shemos']
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(outgoingEmail.url, 'https://api.resend.com/emails');
  const body = JSON.parse(outgoingEmail.options.body);
  assert.equal(body.reply_to, 'teacher@example.com');
  assert.equal(body.to[0], 'owner@example.com');
  assert.match(body.html, /Shemos/);
  assert.match(body.html, /&lt;Teacher&gt;/, 'email HTML is escaped');
});

await withFetch(async (url) => {
  if (String(url).includes('/turnstile/')) {
    return new Response(JSON.stringify({ success: true, action: 'lead_trial', hostname: 'example.com' }), { status: 200 });
  }
  return new Response('{}', { status: 500 });
}, async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    response = await invoke(valid());
    assert.equal(response.status, 502, 'email provider failure is reported safely');
  } finally {
    console.error = originalConsoleError;
  }
});

console.log('Serverless form checks passed (gates, actual body limit, strict schema, origin, honeypot, Turnstile action/hostname, provider failures and email mock).');
