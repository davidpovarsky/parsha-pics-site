import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const html = await readFile('index.html', 'utf8');
const css = await readFile('styles.css', 'utf8');
const manifest = JSON.parse(await readFile('figma-assets.json', 'utf8'));
if (manifest.assets.length !== 41) throw new Error(`Expected 41 Figma assets, found ${manifest.assets.length}`);
const links = [
  ...[...html.matchAll(/(?:src|href)=["']\.\/assets\/([^"']+)["']/g)].map((x) => x[1]),
  ...[...css.matchAll(/url\(["']?\.\/assets\/([^"'\)]+)["']?\)/g)].map((x) => x[1])
];
const entries = new Set(manifest.assets.map((a) => a.file));
const unknown = [...new Set(links)].filter((name) => !entries.has(name));
if (unknown.length) throw new Error('HTML assets missing from manifest: ' + unknown.join(', '));
const unreferenced = [...entries].filter((name) => !links.includes(name));
if (unreferenced.length) throw new Error('Manifest assets are not referenced by the site: ' + unreferenced.join(', '));
if (!html.includes('data-type="trial"') || !html.includes('data-type="pricing"')) throw new Error('Forms missing');
if (manifest.assets.some((a) => !/^\d+:\d+$/.test(a.nodeId))) throw new Error('Invalid Figma node ID in manifest');
if (/figma\.com\/api\/mcp\/asset/.test(`${html}\n${css}\n${await readFile('script.js', 'utf8')}`)) {
  throw new Error('Runtime source contains an expiring Figma asset URL');
}
const failures = [];
const hashes = new Map();
for (const name of entries) {
  try {
    const path = 'assets/' + name;
    const info = await stat(path);
    if (!info.isFile() || info.size < 80) throw new Error('empty or too small');
    const bytes = await readFile(path);
    if (name.endsWith('.png')) {
      const signature = bytes.subarray(0, 8).toString('hex');
      if (signature !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error('invalid PNG');
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (width < 32 || height < 32) throw new Error(`invalid PNG dimensions ${width}x${height}`);
    } else if (/\.jpe?g$/i.test(name)) {
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error('invalid JPEG');
    } else if (name.endsWith('.svg')) {
      const text = bytes.toString('utf8');
      if (!/<svg[\s>]/i.test(text) || !/<\/svg>/i.test(text)) throw new Error('invalid SVG');
    } else throw new Error('unsupported asset format');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const duplicates = hashes.get(hash) || [];
    duplicates.push(name);
    hashes.set(hash, duplicates);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}
if (failures.length) throw new Error(`Required Figma assets failed validation:\n${failures.join('\n')}`);
const duplicateGroups = [...hashes.values()].filter((group) => group.length > 1);
console.log(`Project release gate OK. Valid original art assets: ${entries.size}/${entries.size}.`);
if (duplicateGroups.length) console.log('Intentional shared artwork: ' + duplicateGroups.map((g) => g.join(' = ')).join('; '));
