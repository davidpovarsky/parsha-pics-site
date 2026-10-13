# Code-agent instructions: Parsha Pics

This repository is the standalone coded Parsha Pics website. Work here directly; do not browse-edit Figma Sites or mutate the Figma Design unless the owner explicitly requests it.

## Non-negotiable design rules

- Preserve the GOLDY POV identity, copy hierarchy, testimonials, original illustrations, section order and selective organic transitions.
- Use Bricolage Grotesque headings, DM Sans body copy and the existing cream/blush/deep-red palette.
- The 9 Lech Lecha scenes and all other artwork must remain the mapped original Figma assets. Never replace them with AI art, stock imagery or full-page screenshots.
- Keep the dependency-light HTML/CSS/JavaScript architecture unless a concrete requirement justifies a framework.

## Before a change

1. Read `README.md`, `figma-assets.json` and the affected source files.
2. Run `npm test`; missing or invalid assets are a fatal release error.
3. For visual changes, compare at 1440px and 390px, then run the five-width browser QA when available.
4. Make targeted edits and preserve unrelated owner work.

## Security and release rules

- Never put email/provider tokens in client code, files, screenshots, logs or Git history.
- Forms work only through `functions/api/lead.js`; keep `LEAD_CAPTURE_ENABLED` enforced on both client and server.
- `privacy.html` and `terms.html` are owner-review drafts. Do not enable lead capture or `PUBLIC_LAUNCH` until final text is approved.
- Keep the Lech Lecha flow described as a manual request until authorized automatic delivery is implemented and verified.
- Publish only `dist/`; never use the repository root as the Cloudflare Pages output directory.
- Keep `dist/`, `.env*`, `.dev.vars*`, `.wrangler/`, screenshots and reports out of Git.
- The public repository may contain the approved display exports in `assets/`, but never add print-master files or private sample PDFs.

## Verification commands

```powershell
npm ci
npm test
npm run test:browser
```

Cloudflare Pages uses `npm run build` and `dist`. The `functions/` directory stays at repository root so Pages Functions can deploy `/api/lead`.
