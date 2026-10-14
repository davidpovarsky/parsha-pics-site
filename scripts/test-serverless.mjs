import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/lead.js';
import { onRequestPost as onDownloadPost, onRequestGet as onDownloadGet } from '../functions/api/trial-download.js';

const GITHUB_DOWNLOAD_URL = 'https://github.com/davidpovarsky/parsha-pics-site/releases/download/v1.0.0/Lech-Lecha-Parsha-Pics-Sample.zip';

const BASE_ENV = {
  APPROVED_LEGAL: 'true',
  LEAD_CAPTURE_ENABLED: 'true',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  TURNSTILE_ALLOWED_HOSTNAMES: 'example.com',
  RESEND_API_KEY: 'resend-secret',
  FROM_EMAIL: 'Parsha Pics <forms@example.com>',
  CONTACT_EMAIL: 'owner@example.com',
  SAMPLE_DOWNLOAD_URL: GITHUB_DOWNLOAD_URL
};

const request = (body, headers = {}) => new Request('https://example.com/api/lead', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://example.com', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});
const downloadRequest = (body, headers = {}) => new Request('https://example.com/api/trial-download', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://example.com', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});

const valid = (overrides = {}) => ({
  type: 'trial', name: 'Teacher Example', email: 'teacher@example.com', school: '', message: '',
  website: '', sefarim: [], turnstileToken: 'valid-token', ...overrides
});
const invoke = (body, env = BASE_ENV, headers) => onRequestPost({ request: request(body, headers), env });
const invokeDownload = (body, env = BASE_ENV, headers) => onDownloadPost({ request: downloadRequest(body, headers), env });

// 1. Basic validation and security gates
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

// Honeypot: must return success: true but NEVER return a download link
response = await invoke(valid({ website: 'spambot' }));
assert.equal(response.status, 200, 'honeypot submissions are silently accepted without providers');
const honeypotJson = await response.json();
assert.equal(honeypotJson.success, true);
assert.equal(honeypotJson.download, undefined, 'honeypot submissions must NEVER return a download link');

const originalFetch = globalThis.fetch;
const withFetch = async (implementation, callback) => {
  globalThis.fetch = implementation;
  try { await callback(); } finally { globalThis.fetch = originalFetch; }
};

await withFetch(async () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 }), async () => {
  response = await invoke(valid());
  assert.equal(response.status, 403, 'invalid Turnstile result is rejected');
  const json = await response.json().catch(() => ({}));
  assert.equal(json.download, undefined, 'failed Turnstile must not issue download link');
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

// Pricing submission: sends mail, escapes HTML, does NOT return download link
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
  const json = await response.json();
  assert.equal(json.success, true);
  assert.equal(json.download, undefined, 'pricing requests must not issue download link');
  assert.equal(outgoingEmail.url, 'https://api.resend.com/emails');
  const body = JSON.parse(outgoingEmail.options.body);
  assert.equal(body.reply_to, 'teacher@example.com');
  assert.equal(body.to[0], 'owner@example.com');
  assert.match(body.html, /Shemos/);
  assert.match(body.html, /&lt;Teacher&gt;/, 'email HTML is escaped');
});

// Email failure: fails safely, no download link
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
    const json = await response.json();
    assert.equal(json.download, undefined, 'failed email must not issue download link');
  } finally {
    console.error = originalConsoleError;
  }
});

// Trial submission: legitimate, Turnstile pass, email sent -> returns GitHub release download URL
await withFetch(async (url) => {
  if (String(url).includes('/turnstile/')) {
    return new Response(JSON.stringify({ success: true, action: 'lead_trial', hostname: 'example.com' }), { status: 200 });
  }
  return new Response('{}', { status: 200 });
}, async () => {
  response = await invoke(valid());
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.ok(json.download, 'trial success must return download info');
  assert.equal(json.download.url, GITHUB_DOWNLOAD_URL);
  assert.equal(json.download.filename, 'Lech-Lecha-Parsha-Pics-Sample.zip');
  assert.equal(json.download.sizeBytes, 110466805);
});

// Endpoint tests for /api/trial-download
const dlGet = onDownloadGet({ env: BASE_ENV });
assert.equal(dlGet.status, 302, 'GET /api/trial-download redirects to release asset');
assert.equal(dlGet.headers.get('location'), GITHUB_DOWNLOAD_URL);

const dlPost = onDownloadPost({ env: BASE_ENV });
assert.equal(dlPost.status, 302, 'POST /api/trial-download redirects to release asset');
assert.equal(dlPost.headers.get('location'), GITHUB_DOWNLOAD_URL);

console.log('Serverless form checks passed (gates, actual body limit, strict schema, origin, honeypot, Turnstile action/hostname, provider failures, email delivery, and GitHub release download link).');
