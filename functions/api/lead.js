// Cloudflare Pages Function. Keep all provider credentials in server-side bindings.
const MAX_BODY_BYTES = 12_000;
const PROVIDER_TIMEOUT_MS = 8_000;
const TURNSTILE_TIMEOUT_MS = 5_000;
const ALLOWED_TYPES = new Set(['trial', 'pricing', 'contact']);
const ALLOWED_SEFARIM = new Set(['Bereishis', 'Shemos', 'Vayikra', 'Bamidbar', 'Devarim', 'Full collection']);
const ALLOWED_FIELDS = new Set(['type', 'name', 'school', 'email', 'message', 'sefarim', 'website', 'turnstileToken']);

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};
const answer = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

async function readJsonWithLimit(request) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_BODY_BYTES) {
    return { error: answer({ error: 'Request too large.' }, 413) };
  }
  if (!request.body) return { error: answer({ error: 'Invalid JSON.' }, 400) };

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return { error: answer({ error: 'Request too large.' }, 413) };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { data: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } catch {
    return { error: answer({ error: 'Invalid JSON.' }, 400) };
  }
}

function stringField(data, key, maxLength, required = false) {
  if (!(key in data)) return required ? { error: `${key} is required.` } : { value: '' };
  if (typeof data[key] !== 'string') return { error: `${key} must be text.` };
  const value = data[key].trim();
  if (value.length > maxLength) return { error: `${key} is too long.` };
  if (required && !value) return { error: `${key} is required.` };
  return { value };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyTurnstile({ token, type, request, env }) {
  const allowedHostnames = String(env.TURNSTILE_ALLOWED_HOSTNAMES || '')
    .split(',').map((hostname) => hostname.trim().toLowerCase()).filter(Boolean);
  if (!env.TURNSTILE_SECRET_KEY || !allowedHostnames.length) return { configurationError: true };

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  const remoteIp = request.headers.get('CF-Connecting-IP');
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetchWithTimeout('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    }, TURNSTILE_TIMEOUT_MS);
    if (!response.ok) return { providerError: true };
    const result = await response.json();
    const valid = result.success === true
      && result.action === `lead_${type}`
      && typeof result.hostname === 'string'
      && allowedHostnames.includes(result.hostname.toLowerCase());
    return valid ? { valid: true } : { valid: false };
  } catch (error) {
    console.error('Turnstile provider unavailable:', error instanceof Error ? error.name : 'unknown error');
    return { providerError: true };
  }
}

export async function onRequestPost({ request, env }) {
  if (env.APPROVED_LEGAL !== 'true' || env.LEAD_CAPTURE_ENABLED !== 'true') {
    return answer({ error: 'Forms are disabled while launch details are being reviewed.' }, 503);
  }
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return answer({ error: 'Expected JSON.' }, 415);
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return answer({ error: 'Invalid request origin.' }, 403);

  const parsed = await readJsonWithLimit(request);
  if (parsed.error) return parsed.error;
  const data = parsed.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return answer({ error: 'Invalid request.' }, 400);
  if (Object.keys(data).some((key) => !ALLOWED_FIELDS.has(key))) return answer({ error: 'Unexpected request field.' }, 400);

  const typeField = stringField(data, 'type', 30, true);
  const nameField = stringField(data, 'name', 100, true);
  const schoolField = stringField(data, 'school', 180);
  const emailField = stringField(data, 'email', 180, true);
  const messageField = stringField(data, 'message', 4000);
  const websiteField = stringField(data, 'website', 200);
  const tokenField = stringField(data, 'turnstileToken', 2048, true);
  const fieldError = [typeField, nameField, schoolField, emailField, messageField, websiteField, tokenField]
    .find((field) => field.error);
  if (fieldError) return answer({ error: 'Invalid form fields.' }, 400);
  if (websiteField.value) return answer({ success: true }); // Honeypot: intentionally silent and provider-free.

  const type = typeField.value;
  const name = nameField.value;
  const school = schoolField.value;
  const email = emailField.value;
  const message = messageField.value;
  if (!ALLOWED_TYPES.has(type)) return answer({ error: 'Invalid request type.' }, 400);
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return answer({ error: 'Please enter your name and a valid email address.' }, 400);
  }
  if ('sefarim' in data && (!Array.isArray(data.sefarim) || data.sefarim.some((value) => typeof value !== 'string' || value.length > 30))) {
    return answer({ error: 'Invalid pricing options.' }, 400);
  }
  const sefarim = data.sefarim || [];
  if (type === 'contact' && !message) return answer({ error: 'Please enter a message.' }, 400);
  if (type !== 'contact' && message) return answer({ error: 'Invalid form fields.' }, 400);
  if (type !== 'pricing' && sefarim.length) return answer({ error: 'Invalid pricing options.' }, 400);
  if (type === 'pricing' && (!sefarim.length || sefarim.some((value) => !ALLOWED_SEFARIM.has(value))
    || new Set(sefarim).size !== sefarim.length || (sefarim.includes('Full collection') && sefarim.length > 1))) {
    return answer({ error: 'Please select valid, mutually exclusive pricing options.' }, 400);
  }

  const turnstile = await verifyTurnstile({ token: tokenField.value, type, request, env });
  if (turnstile.configurationError) return answer({ error: 'The contact form is not configured yet.' }, 503);
  if (turnstile.providerError) return answer({ error: 'Verification is temporarily unavailable. Please try again.' }, 502);
  if (!turnstile.valid) return answer({ error: 'Verification failed. Please try again.' }, 403);

  if (!env.RESEND_API_KEY || !env.CONTACT_EMAIL || !env.FROM_EMAIL) {
    return answer({ error: 'The contact form is not configured yet. Please contact the site owner.' }, 503);
  }
  const title = { trial: 'Lech Lecha sample request', pricing: 'School pricing request', contact: 'Parsha Pics contact message' }[type];
  const lines = [
    ['Name', name], ['Email', email], ['School', school],
    ...(type === 'pricing' ? [['Sefarim', sefarim.join(', ')]] : []),
    ...(type === 'contact' ? [['Message', message]] : [])
  ];
  const html = `<h2>${escapeHtml(title)}</h2><dl>${lines.map(([key, value]) => `<dt><strong>${escapeHtml(key)}</strong></dt><dd style="margin-bottom:12px;white-space:pre-wrap">${escapeHtml(value)}</dd>`).join('')}</dl>`;
  try {
    const response = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: [env.CONTACT_EMAIL],
        reply_to: email,
        subject: `Parsha Pics: ${title}`,
        html
      })
    }, PROVIDER_TIMEOUT_MS);
    if (!response.ok) {
      console.error('Email provider request failed with status:', response.status);
      return answer({ error: 'Sorry, your message could not be sent. Please try again later.' }, 502);
    }
    return answer({ success: true });
  } catch (error) {
    console.error('Email provider unavailable:', error instanceof Error ? error.name : 'unknown error');
    return answer({ error: 'Sorry, your message could not be sent. Please try again later.' }, 502);
  }
}

export function onRequestGet() {
  return answer({ error: 'Method not allowed.' }, 405);
}
