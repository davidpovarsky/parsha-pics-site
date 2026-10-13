// Cloudflare Pages Function. No client-side API key or email address is exposed.
// Required environment secrets: RESEND_API_KEY, CONTACT_EMAIL, FROM_EMAIL.
const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};
const answer = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const clean = (v, limit = 180) => String(v || '').trim().slice(0, limit);
const escapeHtml = (v) => clean(v, 4100).replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

export async function onRequestPost({ request, env }) {
  if (env.LEAD_CAPTURE_ENABLED !== 'true') return answer({ error: 'Forms are disabled while launch details are being reviewed.' }, 503);
  if (!(request.headers.get('content-type') || '').includes('application/json')) return answer({ error: 'Expected JSON.' }, 415);
  if (Number(request.headers.get('content-length') || 0) > 12000) return answer({ error: 'Request too large.' }, 413);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return answer({ error: 'Invalid request origin.' }, 403);
  let data;
  try { data = await request.json(); } catch { return answer({ error: 'Invalid JSON.' }, 400); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return answer({ error: 'Invalid request.' }, 400);
  if (data.website) return answer({ success: true }); // Honeypot anti-spam, intentionally silent.
  const type = clean(data.type, 30);
  if (!['trial', 'pricing', 'contact'].includes(type)) return answer({ error: 'Invalid request type.' }, 400);
  const name = clean(data.name, 100);
  const school = clean(data.school, 180);
  const email = clean(data.email, 180);
  const message = clean(data.message, 4000);
  const sefarim = Array.isArray(data.sefarim) ? data.sefarim.map((x) => clean(x, 30)) : [];
  const allowedSefarim = ['Bereishis', 'Shemos', 'Vayikra', 'Bamidbar', 'Devarim', 'Full collection'];
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return answer({ error: 'Please enter your name and a valid email address.' }, 400);
  if (type === 'contact' && !message) return answer({ error: 'Please enter a message.' }, 400);
  if (type === 'pricing' && (!sefarim.length || sefarim.some((x) => !allowedSefarim.includes(x)) || (sefarim.includes('Full collection') && sefarim.length > 1))) return answer({ error: 'Please select valid, mutually exclusive pricing options.' }, 400);
  if (!env.RESEND_API_KEY || !env.CONTACT_EMAIL || !env.FROM_EMAIL) {
    return answer({ error: 'The contact form is not configured yet. Please contact the site owner.' }, 503);
  }
  const title = { trial: 'Lech Lecha sample request', pricing: 'School pricing request', contact: 'Parsha Pics contact message' }[type];
  const lines = [
    ['Name', name], ['Email', email], ['School', school],
    ...(type === 'pricing' ? [['Sefarim', sefarim.join(', ')]] : []),
    ...(type === 'contact' ? [['Message', message]] : [])
  ];
  const html = `<h2>${escapeHtml(title)}</h2><dl>${lines.map(([k, v]) => `<dt><strong>${escapeHtml(k)}</strong></dt><dd style="margin-bottom:12px;white-space:pre-wrap">${escapeHtml(v)}</dd>`).join('')}</dl>`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: [env.CONTACT_EMAIL],
        reply_to: email,
        subject: `Parsha Pics: ${title}`,
        html
      })
    });
    if (!response.ok) {
      console.error('Email provider request failed with status:', response.status);
      return answer({ error: 'Sorry, your message could not be sent. Please try again later.' }, 502);
    }
    return answer({ success: true });
  } catch (err) {
    console.error('Email provider unavailable:', err instanceof Error ? err.name : 'unknown error');
    return answer({ error: 'Sorry, your message could not be sent. Please try again later.' }, 502);
  }
}
export function onRequestGet() { return answer({ error: 'Method not allowed.' }, 405); }
