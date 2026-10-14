# Production readiness record

Recorded 13–14 October 2026. The table below preserves the DNS state observed before any launch-related change. Since that audit, a safe Cloudflare Pages project and Turnstile widgets have been created; no Porkbun DNS record, nameserver, mailbox setting, Resend identity or provider secret has been changed.

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

## Cloudflare staging state

- Pages project: `parsha-pics`, connected through Cloudflare's GitHub integration to `davidpovarsky/parsha-pics-site` with `main` as the production branch.
- Safe production URL: `https://parsha-pics.pages.dev` (deployment `7a178d99-7e4b-496a-9c1b-56d928aac2d7`, source `c060d2c`).
- Stable hardened branch preview: `https://agent-cloudflare-production.parsha-pics.pages.dev` (tracks the pull-request branch; immutable deployment IDs are recorded in release reports rather than committed here).
- Both the GitHub CI check and Cloudflare Pages check pass on pull request #1.
- The deployed preview passed responsive browser QA at 360, 390, 768, 1024 and 1440 pixels. Its real Pages Function returns the deliberate 503 response for disabled submissions and 405 for unsupported methods.
- Security headers include the restrictive CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and `X-Robots-Tag: noindex`.
- Separate managed Turnstile widgets exist for preview (`parsha-pics.pages.dev`, `localhost`) and production (`parshapics.goldypov.com`). Their secrets are not present in source or client output.
- `parshapics.goldypov.com` is registered as a pending Pages custom domain. Cloudflare requires an explicit Porkbun CNAME named `parshapics` targeting `parsha-pics.pages.dev` before TLS and routing can complete.

## Gates still closed

- `APPROVED_LEGAL=false`
- `LEAD_CAPTURE_ENABLED=false`
- `PUBLIC_LAUNCH=false`
- Current legal approval ID: `484331c963b5` (changes automatically when either draft changes)

The current deployment state is **safe staging only**. Cloudflare Pages and Turnstile setup are complete at the infrastructure level. Porkbun DNS, Resend verification/API configuration, real inbox delivery, legal approval and the final gated launch remain blocked on owner-controlled authentication or approval.
