# Parsha Pics — standalone website

Responsive HTML/CSS/JavaScript implementation of the Parsha Pics landing page by GOLDY POV / Goldy Povarsky. Ongoing changes happen in this repository, with local tests and Cloudflare Pages previews; the unpublished Figma Sites editor is not part of the runtime workflow.

## Design sources

- Figma Design: <https://www.figma.com/design/yC5gDCVTVB1DSptYpWd5Y1/Parsha-Pics---Landing-Page?node-id=0-1>
- Desktop artboard: `3:4` (1440px)
- Mobile artboard: `85:62` (390px)
- Trial form: `84:55`; pricing form: `84:70`

The repository contains all 41 approved original display assets. `figma-assets.json` keeps their durable Figma node IDs and intentionally excludes expiring Figma MCP URLs. Eight source files are correctly stored as JPEG after binary-format validation; the remainder are PNG/SVG. Two intentional duplicates preserve separate semantic call sites: hero journey / Lech Lecha 1 and war scene / research scene.

## Local setup

Requirements: Node.js 20+ (Node 22 is used in CI).

```powershell
npm ci
npm test
npm run dev
```

Useful commands:

```powershell
npm run build              # safe, no-index dist/ preview
npm run test:browser       # QA at 360, 390, 768, 1024 and 1440px
npm run preview:cloudflare # local Pages runtime, including /api/lead
npm run sync-assets        # no-op when all source assets exist
```

Set `BASE_URL` when browser QA should verify a deployed preview. If a source asset is missing, set a read-only `FIGMA_TOKEN` locally and run `npm run sync-assets`. Never commit the token.

## Release gates and build output

`npm test` requires all 41 mapped assets to be present, non-empty and valid PNG/JPEG/SVG binaries. It also checks references, Figma node IDs, syntax, strict form validation, Turnstile action/hostname checks, provider failures, mocked Resend delivery and a clean build.

`npm run build` creates `dist/` with the public pages, CSS, JavaScript, security headers, API-only Functions routes, robots policy and WebP-optimised assets. Source manifests, tooling, legal drafts, secrets and `.env` files are not served.

Default builds are safe staging previews:

- `noindex,nofollow` plus `robots.txt` disallow indexing;
- lead capture is disabled in both the UI and API; and
- owner-review legal drafts are replaced by `legal-pending.html`.

Approved launch builds require explicit gates:

```powershell
$env:APPROVED_LEGAL='true'
$env:LEGAL_APPROVAL_ID='<ID printed by the safe build>'
$env:LEAD_CAPTURE_ENABLED='true'
$env:TURNSTILE_SITE_KEY='<public widget site key>'
$env:PUBLIC_LAUNCH='true'
$env:PUBLIC_ORIGIN='https://parshapics.goldypov.com'
npm run build
```

The build refuses lead capture without the public Turnstile key and the exact approved legal revision. It refuses public launch unless legal and lead capture are enabled and an HTTPS origin is supplied. Review `privacy.html`, `terms.html` and `legal/OWNER_APPROVAL.md`, then approve the exact ID printed by the safe build. A public build adds canonical metadata and a sitemap; safe builds remain no-indexed.

## Forms and Cloudflare Pages

The three forms post JSON to the Pages Function at `POST /api/lead`. The endpoint measures the streamed body against a 12KB limit, applies a strict schema and field limits, enforces valid pricing selections, checks same-origin requests, uses a honeypot, avoids PII logging, validates Turnstile server-side (including action and hostname), applies provider timeouts, and only reports success after Resend accepts the email.

Required production bindings:

- `APPROVED_LEGAL=true`
- `LEAD_CAPTURE_ENABLED=true`
- `TURNSTILE_SECRET_KEY` (secret)
- `TURNSTILE_ALLOWED_HOSTNAMES=parshapics.goldypov.com`
- `RESEND_API_KEY` (secret)
- `FROM_EMAIL` — a Resend-verified sender, preferably `Parsha Pics <forms@send.goldypov.com>`
- `CONTACT_EMAIL=goldy@goldypov.com`

The Lech Lecha sample is a **manual email fulfilment request**. The website does not expose or automatically download the high-resolution deliverables.

Cloudflare Pages settings:

- Build command: `npm run build`
- Output directory: `dist`
- Functions directory: repository `functions/` (outside `dist/`)
- Production branch: `main`

Keep the safe defaults for preview deployments. The GitHub Pages workflow is a no-index static fallback and does not execute `/api/lead`.

## Repository structure

```text
index.html                 Landing page source
styles.css                 Responsive design and Figma-aligned tokens
script.js                  Dialogs, FAQ, pricing, Turnstile and form UX
assets/                    41 approved original source display assets
figma-assets.json          Durable node-ID mapping
scripts/build.mjs          Isolated gated build + WebP optimisation
scripts/check-project.mjs  Fatal asset/reference release gate
scripts/browser-qa.mjs     Responsive and interaction QA
functions/api/lead.js      Hardened Pages/Turnstile/Resend handler
privacy.html / terms.html  Owner-review drafts, excluded from safe builds
legal/OWNER_APPROVAL.md    Required legal and operational decisions
public/_headers            Security and cache headers
wrangler.jsonc             Local and Pages deployment configuration
```

## Current launch blockers

The code and safe preview build are ready. Production data collection remains disabled until the owner supplies or approves:

1. explicit approval of the exact privacy and terms drafts and the decisions in the legal checklist;
2. a verified Resend sender/domain and API key (the recipient is confirmed as `goldy@goldypov.com`);
3. manual Lech Lecha fulfilment, or an authorised automatic-delivery package;
4. refreshed Cloudflare authentication; and
5. replacement of Porkbun's current wildcard parking CNAME at `parshapics.goldypov.com`, without changing the apex, `www`, nameservers or Zoho mail records.
