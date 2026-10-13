import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(join(projectRoot, 'figma-assets.json'), 'utf8'));
const outputDir = join(projectRoot, 'assets');
const force = process.argv.includes('--force');
const token = process.env.FIGMA_TOKEN;
const usingApiOnly = process.argv.includes('--api-only');
await mkdir(outputDir, { recursive: true });
const assets = manifest.assets;

async function exists(path) {
  try { return (await stat(path)).size > 0; } catch { return false; }
}
async function download(url, dest) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('image/') && !type.includes('octet-stream') && !type.includes('svg')) throw new Error(`Unexpected Content-Type: ${type}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 80) throw new Error('Empty or invalid image');
  await writeFile(dest, bytes);
}
async function figmaExportUrls(items) {
  if (!token || items.length === 0) return {};
  const out = {};
  for (const format of ['png', 'jpg', 'svg']) {
    const subset = items.filter(a => a.file.toLowerCase().endsWith(`.${format}`));
    if (!subset.length) continue;
    const ids = [...new Set(subset.map(a => a.nodeId))];
    const chunks = [];
    for (let i = 0; i < ids.length; i += 40) chunks.push(ids.slice(i, i + 40));
    for (const chunk of chunks) {
      const params = new URLSearchParams({ ids: chunk.join(','), format, scale: '2' });
      const res = await fetch(`https://api.figma.com/v1/images/${manifest.fileKey}?${params}`, { headers: { 'X-Figma-Token': token } });
      if (!res.ok) throw new Error(`Figma REST API HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`);
      const json = await res.json();
      Object.assign(out, json.images || {});
    }
  }
  return out;
}

const pending = [];
for (const asset of assets) {
  if (!force && await exists(join(outputDir, asset.file))) continue;
  pending.push(asset);
}
console.log(`Assets: ${assets.length}; already downloaded: ${assets.length - pending.length}; remaining: ${pending.length}`);
if (!pending.length) process.exit(0);

const failed = [];
const succeeded = [];
for (const asset of pending) {
  let ok = false;
  if (!usingApiOnly && asset.url) {
    try {
      await download(asset.url, join(outputDir, asset.file));
      succeeded.push(asset.file);
      ok = true;
    } catch (err) {
      console.warn(`Direct asset link unavailable: ${asset.file}: ${err.message}`);
    }
  }
  if (!ok) failed.push(asset);
}
if (failed.length && token) {
  console.log('Downloading remaining assets via the Figma REST API...');
  try {
    const urls = await figmaExportUrls(failed);
    for (const asset of [...failed]) {
      try {
        if (!urls[asset.nodeId]) throw new Error('No export URL for node ' + asset.nodeId);
        await download(urls[asset.nodeId], join(outputDir, asset.file));
        succeeded.push(asset.file);
        failed.splice(failed.indexOf(asset), 1);
      } catch (err) { console.warn(`API export failed ${asset.file}: ${err.message}`); }
    }
  } catch (err) { console.error(`Figma API error: ${err.message}`); }
}
console.log(`Downloaded this run: ${succeeded.length}; missing: ${failed.length}`);
if (failed.length) {
  console.error('Missing assets: ' + failed.map(a => a.file).join(', '));
  console.error('Set a read-only FIGMA_TOKEN in your shell and run npm run sync-assets again.');
  process.exitCode = 1;
}
