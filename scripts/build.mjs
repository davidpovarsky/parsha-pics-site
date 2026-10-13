import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const manifest = JSON.parse(await readFile(join(root, 'figma-assets.json'), 'utf8'));
const approvedLegal = process.env.APPROVED_LEGAL === 'true';
const requestedLeadCapture = process.env.LEAD_CAPTURE_ENABLED === 'true';
const publicLaunch = process.env.PUBLIC_LAUNCH === 'true';
if (requestedLeadCapture && !approvedLegal) throw new Error('LEAD_CAPTURE_ENABLED requires APPROVED_LEGAL=true.');
if (publicLaunch && (!approvedLegal || !requestedLeadCapture)) throw new Error('PUBLIC_LAUNCH requires approved legal pages and enabled lead capture.');
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

const transformAssets = (text) => {
  for (const [from, to] of replacement) text = text.replaceAll(`assets/${from}`, `assets/${to}`);
  return text;
};

let html = transformAssets(await readFile(join(root, 'index.html'), 'utf8'));
html = html.replace('data-lead-capture="disabled"', `data-lead-capture="${leadCaptureEnabled ? 'enabled' : 'disabled'}"`);
if (!publicLaunch) html = html.replace('<meta name="description"', '<meta name="robots" content="noindex,nofollow">\n  <meta name="description"');
if (!approvedLegal) html = html.replaceAll('./terms.html', './legal-pending.html#terms').replaceAll('./privacy.html', './legal-pending.html#privacy');
await writeFile(join(dist, 'index.html'), html);
await writeFile(join(dist, 'styles.css'), transformAssets(await readFile(join(root, 'styles.css'), 'utf8')));
await cp(join(root, 'script.js'), join(dist, 'script.js'));

if (approvedLegal) {
  for (const name of ['privacy.html', 'terms.html']) {
    const text = await readFile(join(root, name), 'utf8');
    if (/Pre-launch content required|placeholder/i.test(text)) throw new Error(`${name} still contains pre-launch placeholder text.`);
    await writeFile(join(dist, name), transformAssets(text));
  }
} else {
  await cp(join(root, 'legal-pending.html'), join(dist, 'legal-pending.html'));
}

await writeFile(join(dist, 'robots.txt'), publicLaunch ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n');
await writeFile(join(dist, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }, null, 2) + '\n');
await cp(join(root, 'public', '_headers'), join(dist, '_headers'));

const builtFiles = await readFile(join(dist, 'index.html'), 'utf8');
if (/figma\.com\/api\/mcp\/asset/.test(builtFiles)) throw new Error('Build contains a temporary Figma asset URL.');
if (!builtFiles.includes(`data-lead-capture="${leadCaptureEnabled ? 'enabled' : 'disabled'}"`)) throw new Error('Lead-capture build state was not applied.');
console.log(`Built ${manifest.assets.length} validated Figma assets into dist/ (${leadCaptureEnabled ? 'lead capture enabled' : 'safe preview; lead capture disabled'}).`);
