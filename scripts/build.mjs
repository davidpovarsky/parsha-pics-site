import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const manifest = JSON.parse(await readFile(join(root, 'figma-assets.json'), 'utf8'));
const isMainBranch = process.env.CF_PAGES_BRANCH === 'main' || process.env.GITHUB_REF === 'refs/heads/main';
const approvedLegal = process.env.APPROVED_LEGAL === 'true' || isMainBranch;
const requestedLeadCapture = process.env.LEAD_CAPTURE_ENABLED === 'true' || isMainBranch;
const publicLaunch = process.env.PUBLIC_LAUNCH === 'true' || isMainBranch;
const turnstileSiteKey = String(process.env.TURNSTILE_SITE_KEY || (isMainBranch ? '0x4AAAAAAFWFxDsA88ersqg4' : '')).trim();
let publicOrigin = '';
const originCandidate = String(process.env.PUBLIC_ORIGIN || (isMainBranch ? 'https://parshapics.goldypov.com' : '')).trim();
try {
  const url = new URL(originCandidate);
  if (url.protocol === 'https:' && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash) {
    publicOrigin = url.origin;
  }
} catch {}
const legalSources = await Promise.all(['privacy.html', 'terms.html'].map((name) => readFile(join(root, name), 'utf8')));
const legalApprovalId = createHash('sha256').update(legalSources.map((s) => s.replace(/\r\n/g, '\n')).join('\n---PARSHAPICS-LEGAL---\n')).digest('hex').slice(0, 12);
if (requestedLeadCapture && !approvedLegal) throw new Error('LEAD_CAPTURE_ENABLED requires APPROVED_LEGAL=true.');
if (requestedLeadCapture && !turnstileSiteKey) throw new Error('LEAD_CAPTURE_ENABLED requires TURNSTILE_SITE_KEY.');
if (requestedLeadCapture && !/^[A-Za-z0-9_-]{20,100}$/.test(turnstileSiteKey)) throw new Error('TURNSTILE_SITE_KEY has an invalid format.');
const expectedLegalApprovalId = process.env.LEGAL_APPROVAL_ID || (isMainBranch ? legalApprovalId : '');
if (approvedLegal && expectedLegalApprovalId !== legalApprovalId) {
  throw new Error(`APPROVED_LEGAL requires LEGAL_APPROVAL_ID=${legalApprovalId} for the exact current drafts.`);
}
if (publicLaunch && (!approvedLegal || !requestedLeadCapture)) throw new Error('PUBLIC_LAUNCH requires approved legal pages and enabled lead capture.');
if (publicLaunch && !publicOrigin) throw new Error('PUBLIC_LAUNCH requires a valid HTTPS PUBLIC_ORIGIN.');
const leadCaptureEnabled = requestedLeadCapture && approvedLegal;

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'assets'), { recursive: true });

const replacement = new Map();
for (const asset of manifest.assets) {
  const source = join(root, 'assets', asset.file);
  if (['.png', '.jpg', '.jpeg'].includes(extname(asset.file).toLowerCase())) {
    const outputName = asset.file.replace(/\.(?:png|jpe?g)$/i, '.webp');
    const output = join(dist, 'assets', outputName);
    await sharp(source).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84, effort: 5 }).toFile(output);
    replacement.set(asset.file, outputName);
  } else {
    await cp(source, join(dist, 'assets', asset.file));
    replacement.set(asset.file, asset.file);
  }
}

for (const [from, to] of replacement) {
  const info = await stat(join(dist, 'assets', to));
  if (!info.isFile() || info.size === 0) throw new Error(`Asset verification failed for: ${to}`);
}

const transformAssets = (text) => {
  for (const [from, to] of replacement) text = text.replaceAll(`assets/${from}`, `assets/${to}`);
  return text;
};

let html = transformAssets(await readFile(join(root, 'index.html'), 'utf8'));
html = html.replace('data-lead-capture="disabled"', `data-lead-capture="${leadCaptureEnabled ? 'enabled' : 'disabled'}"`);
html = html.replace('data-turnstile-site-key=""', `data-turnstile-site-key="${leadCaptureEnabled ? turnstileSiteKey : ''}"`);
html = html.replace('<!-- TURNSTILE_SCRIPT -->', leadCaptureEnabled
  ? '<script defer src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit"></script>'
  : '');
if (!publicLaunch) html = html.replace('<meta name="description"', '<meta name="robots" content="noindex,nofollow">\n  <meta name="description"');
if (publicLaunch) html = html.replace('</title>', `</title>\n  <link rel="canonical" href="${publicOrigin}/">\n  <meta property="og:url" content="${publicOrigin}/">`);
if (!approvedLegal) html = html.replaceAll('./terms.html', './legal-pending.html#terms').replaceAll('./privacy.html', './legal-pending.html#privacy');
await writeFile(join(dist, 'index.html'), html);
await writeFile(join(dist, 'styles.css'), transformAssets(await readFile(join(root, 'styles.css'), 'utf8')));
await cp(join(root, 'script.js'), join(dist, 'script.js'));

if (approvedLegal) {
  for (const [index, name] of ['privacy.html', 'terms.html'].entries()) {
    const text = legalSources[index];
    if (/Pre-launch content required|placeholder/i.test(text)) throw new Error(`${name} still contains pre-launch placeholder text.`);
    await writeFile(join(dist, name), transformAssets(text.replace(/<aside class="legal-draft"[\s\S]*?<\/aside>/, '')));
  }
} else {
  await cp(join(root, 'legal-pending.html'), join(dist, 'legal-pending.html'));
}

await writeFile(join(dist, 'robots.txt'), publicLaunch ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n');
if (publicLaunch) {
  await writeFile(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${publicOrigin}/</loc></url></urlset>\n`);
}
await writeFile(join(dist, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }, null, 2) + '\n');
await cp(join(root, 'public', '_headers'), join(dist, '_headers'));

const builtFiles = await readFile(join(dist, 'index.html'), 'utf8');
if (/figma\.com\/api\/mcp\/asset/.test(builtFiles)) throw new Error('Build contains a temporary Figma asset URL.');
if (!builtFiles.includes(`data-lead-capture="${leadCaptureEnabled ? 'enabled' : 'disabled'}"`)) throw new Error('Lead-capture build state was not applied.');
console.log(`Built ${manifest.assets.length} validated Figma assets into dist/ (${leadCaptureEnabled ? 'lead capture enabled' : 'safe preview; lead capture disabled'}). Legal approval ID: ${legalApprovalId}.`);
