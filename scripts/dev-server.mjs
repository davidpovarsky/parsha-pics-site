import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]+$/, '');
const configuredRoot = process.env.SITE_ROOT || projectRoot;
const root = (isAbsolute(configuredRoot) ? resolve(configuredRoot) : resolve(projectRoot, configuredRoot)).replace(/[\\/]+$/, '');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  if (pathname === '/api/lead') {
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forms work after deploying to Cloudflare Pages and setting the email secrets. The local preview does not send emails.' }));
    return;
  }
  const safe = normalize(pathname).replace(/^([\\/])+/, '');
  const path = join(root, safe || 'index.html');
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  try {
    const info = await stat(path);
    const file = info.isDirectory() ? join(path, 'index.html') : path;
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Parsha Pics preview (${root}): http://127.0.0.1:${port}`));
