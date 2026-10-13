# Production readiness record

Recorded 13–14 October 2026 before any DNS or production-service change. No DNS record, nameserver, mailbox setting, Cloudflare project, Resend identity or secret was changed during this audit.

## Public DNS before state

| Name | Type | Observed value | Preservation rule |
|---|---|---|---|
| `goldypov.com` | NS | `salvador.ns.porkbun.com`, `fortaleza.ns.porkbun.com`, `maceio.ns.porkbun.com`, `curitiba.ns.porkbun.com` | Do not change |
| `goldypov.com` | A | `207.207.210.23`, `207.207.210.36`, `207.207.210.50` | Do not change for this launch |
| `goldypov.com` | MX | `mx.zoho.com` (10), `mx2.zoho.com` (20), `mx3.zoho.com` (50) | Do not change |
| `goldypov.com` | TXT | `v=spf1 include:zohomail.com include:_spf.porkbun.com ~all` | Preserve; do not create a second SPF record |
| `goldypov.com` | TXT | Zoho verification present | Preserve |
| `zoho._domainkey.goldypov.com` | TXT | Zoho DKIM public key present | Preserve |
| `_dmarc.goldypov.com` | lookup result | resolves to Porkbun parking `uixie.porkbun.com`; no explicit DMARC TXT observed | Inspect Porkbun DNS UI before adding or replacing anything |
| `www.goldypov.com` | CNAME lookup | `uixie.porkbun.com` | Do not change |
| `parshapics.goldypov.com` | CNAME lookup | `uixie.porkbun.com` | Treat as occupied until the Porkbun DNS UI confirms whether this is an explicit record or wildcard parking |
| `send.goldypov.com` | CNAME lookup | `uixie.porkbun.com` | Treat as occupied until inspected; use only for Resend records after confirmation |
| `goldypov.com` | CAA | none observed | No change required for safe staging |

The public DNS is hosted at Porkbun, not in a Cloudflare zone. Connecting a Pages custom hostname will therefore require an authorised, narrowly scoped Porkbun DNS change. The apex, `www`, nameservers and every Zoho mail record are outside that change.

## Verified build/runtime state

- Source assets: 41/41 valid approved originals.
- Dependency audit: zero known vulnerabilities.
- Safe build: no-index, forms disabled, legal drafts excluded.
- Lead-enabled test build: three Turnstile widgets render; exact legal approval ID required; public site key required.
- Pages Function: compiles with Wrangler 4.150.0.
- Local Pages runtime: `POST /api/lead` returned the deliberate HTTP 503 disabled response; `GET /api/lead` returned 405. This proves the route is a Function rather than a static 404.
- Responsive browser QA: passed at 360, 390, 768, 1024 and 1440 pixels for the safe build and for the mocked lead-enabled client path.
- API tests: malformed JSON, actual oversized body, wrong types, foreign origin, unknown fields, pricing rules, honeypot, missing/invalid Turnstile, action mismatch, hostname mismatch, Turnstile outage, Resend outage, HTML escaping and successful mocked delivery.

## Gates still closed

- `APPROVED_LEGAL=false`
- `LEAD_CAPTURE_ENABLED=false`
- `PUBLIC_LAUNCH=false`
- Current legal approval ID: `484331c963b5` (changes automatically when either draft changes)

The current deployment state is **safe staging only**. Real Cloudflare Pages deployment, Turnstile creation, Resend verification, real inbox delivery, legal approval and custom-domain DNS remain unverified until the relevant account authentication or owner approval is supplied.
