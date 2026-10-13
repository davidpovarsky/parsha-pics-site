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

Open <http://127.0.0.1:4173>. The lightweight local server does not send email.

Useful commands:

```powershell
npm run build         # creates a safe, no-index dist/ preview
npm run test:browser  # QA at 360, 390, 768, 1024 and 1440px
npm run sync-assets   # no-op when all source assets exist
```

Set `BASE_URL` when the same browser QA should verify a deployed preview instead of the local `dist/` build.

If a source asset is missing, set a read-only `FIGMA_TOKEN` locally and run `npm run sync-assets`. Never commit the token.

## Release gates and build output

`npm test` fails unless all 41 mapped assets are present, non-empty, and valid PNG/JPEG/SVG binaries. It also checks references, Figma node IDs, client/server syntax, form validation, mocked Resend delivery, and a clean production build.

`npm run build` creates `dist/` containing only the public pages, CSS, JavaScript, security headers, an API-only Functions route policy, robots policy and web-optimized assets. Raster art is resized only when larger than 1600px and converted to WebP. The current build reduces approximately 104.8MB of source exports to about 5.1MB of public assets. Source manifests, tooling, legal drafts, secrets and `.env` files are not served.

Default builds are safe staging previews:

- `noindex,nofollow` plus `robots.txt` disallow indexing;
- lead capture is disabled in the UI and API;
- placeholder privacy/terms drafts are excluded and replaced by `legal-pending.html`.

Approved launch builds require explicit environment gates:

```powershell
$env:APPROVED_LEGAL='true'
$env:LEAD_CAPTURE_ENABLED='true'
$env:PUBLIC_LAUNCH='true'
npm run build
```

The build refuses to enable lead capture without approved legal pages, and refuses a public launch unless both are enabled. Replace the clearly marked `privacy.html` and `terms.html` drafts with owner-approved text first.

## Forms and Cloudflare Pages

The trial, pricing and contact forms post JSON to the Cloudflare Pages Function at `POST /api/lead`. The endpoint validates all fields, enforces mutually exclusive pricing selections, checks same-origin requests, uses a honeypot, avoids PII logging, and only reports success after Resend accepts the email.

Required Cloudflare server-side variables/secrets:

- `LEAD_CAPTURE_ENABLED=true`
- `RESEND_API_KEY`
- `FROM_EMAIL` — a Resend-verified sender/domain
- `CONTACT_EMAIL` — approved recipient address

The Lech Lecha sample is currently a **manual email fulfilment request**; the website does not expose or automatically download the high-resolution deliverables. Do not claim automatic delivery until an authorized sample and delivery flow are implemented and tested.

Cloudflare Pages settings:

- Build command: `npm run build`
- Output directory: `dist`
- Functions directory: repository `functions/` (outside `dist/`)
- Production branch: `main`

Use a preview deployment first. Keep the default safe build variables until legal text and email delivery are approved and tested. The repository's GitHub Pages workflow publishes this default safe build only as a no-index staging fallback; it does not run `/api/lead`. Do not attach or alter a custom domain without confirming the exact hostname.

## Repository structure

```text
index.html                 Landing page source
styles.css                 Responsive design and Figma-aligned tokens
script.js                  Dialogs, FAQ, pricing and form UX
assets/                    41 approved original source display assets
figma-assets.json          Durable node-ID mapping (no temporary URLs)
scripts/build.mjs          Isolated dist build + WebP optimization
scripts/check-project.mjs  Fatal release asset/reference gate
scripts/browser-qa.mjs     Responsive and interaction QA
functions/api/lead.js      Cloudflare Pages/Resend handler
privacy.html / terms.html  Owner-review drafts, excluded from preview builds
public/_headers            Security and cache headers
```

## Current launch blockers

The code and safe preview build are ready. Production personal-data collection remains intentionally disabled until the owner supplies and approves:

1. final privacy, copyright and school-licence terms;
2. the recipient email and verified Resend sender/domain plus API key;
3. confirmation that Lech Lecha samples are fulfilled manually (current wording) or an authorized automatic-delivery package;
4. Cloudflare authentication and, later, the exact custom hostname if one is desired.

The Figma Design artboards were inspected directly. The unpublished Figma Sites editor was not used or modified, so edits that exist only there are outside this implementation.
