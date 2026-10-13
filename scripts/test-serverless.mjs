import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/lead.js';

const req = (data, contentType = 'application/json') => new Request('https://example.com/api/lead', {
  method: 'POST', headers: { 'content-type': contentType }, body: JSON.stringify(data)
});
const call = (data, env = { LEAD_CAPTURE_ENABLED: 'true' }) => onRequestPost({ request: req(data), env });
let response = await call({ type: 'trial', name: 'Teacher Example', email: 'teacher@example.com' }, {});
assert.equal(response.status, 503);
response = await call({ type: 'trial', name: 'A', email: 'invalid' });
assert.equal(response.status, 400);
response = await call({ type: 'trial', name: 'Teacher Example', email: 'teacher@example.com' });
assert.equal(response.status, 503);
response = await call({ type: 'pricing', name: 'Teacher Example', email: 'teacher@example.com', sefarim: [] });
assert.equal(response.status, 400);
response = await call({ type: 'pricing', name: 'Teacher Example', email: 'teacher@example.com', sefarim: ['Bereishis', 'Invalid'] });
assert.equal(response.status, 400);
response = await call({ type: 'pricing', name: 'Teacher Example', email: 'teacher@example.com', sefarim: ['Full collection', 'Bereishis'] });
assert.equal(response.status, 400);
response = await call({ type: 'trial', name: 'Bot', email: 'bot@example.com', website: 'spambot' });
assert.equal(response.status, 200);
const before = globalThis.fetch;
let outgoing;
globalThis.fetch = async (url, options) => { outgoing = {url, options}; return new Response('{}', { status: 200 }); };
try {
  response = await call({ type: 'pricing', name: 'Teacher Example', email: 'teacher@example.com', school: 'Example School', sefarim: ['Shemos'] }, {
    LEAD_CAPTURE_ENABLED: 'true', RESEND_API_KEY: 'fake-secret', FROM_EMAIL: 'forms@example.com', CONTACT_EMAIL: 'owner@example.com'
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(outgoing.url, 'https://api.resend.com/emails');
  const body = JSON.parse(outgoing.options.body);
  assert.equal(body.reply_to, 'teacher@example.com');
  assert.equal(body.to[0], 'owner@example.com');
  assert.match(body.html, /Shemos/);
} finally {
  globalThis.fetch = before;
}
console.log('Serverless form checks passed (validation, configuration, anti-spam, email send mock).');
