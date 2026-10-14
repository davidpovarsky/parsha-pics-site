import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const stage = process.argv[2] || 'baseline'; // 'baseline' or 'after'
const targetDir = join(root, 'screenshots', stage);
await mkdir(targetDir, { recursive: true });

const port = 4180;
const baseURL = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['scripts/dev-server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), SITE_ROOT: 'dist' },
  stdio: ['ignore', 'pipe', 'pipe']
});

const waitForServer = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Dev server timeout')), 10000);
  server.stdout.on('data', (chunk) => {
    if (String(chunk).includes(baseURL)) {
      clearTimeout(timeout);
      resolve();
    }
  });
  server.on('exit', (code) => reject(new Error(`Server exited with ${code}`)));
});

let browser;
try {
  await waitForServer;
  browser = await chromium.launch({ headless: true });

  const viewports = [
    { width: 1440, height: 900, name: '1440' },
    { width: 390, height: 844, name: '390' },
    { width: 360, height: 800, name: '360' },
    { width: 414, height: 896, name: '414' },
    { width: 768, height: 1024, name: '768' },
    { width: 1024, height: 900, name: '1024' }
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.locator('img').evaluateAll((images) => images.forEach((img) => { img.loading = 'eager'; }));
    await page.waitForFunction(() => [...document.querySelectorAll('img:not(.lightbox-img)')].every((img) => img.complete), null, { timeout: 15000 });

    // Full page
    await page.screenshot({ path: join(targetDir, `full-${vp.name}.png`), fullPage: true });

    // For 1440 and 390, capture sections individually
    if (vp.name === '1440' || vp.name === '390') {
      const sections = [
        { selector: '.site-header', name: 'header' },
        { selector: '.hero', name: 'hero' },
        { selector: '.sequence', name: 'sequence' },
        { selector: '.research', name: 'research' },
        { selector: '.trial-band', name: 'trial' },
        { selector: '.worksheets', name: 'worksheets' },
        { selector: '.testimonials', name: 'testimonials' },
        { selector: '.collection', name: 'collection' },
        { selector: '.included', name: 'included' },
        { selector: '.faq', name: 'faq' },
        { selector: '.closing', name: 'closing' },
        { selector: '.footer', name: 'footer' }
      ];

      for (const sec of sections) {
        const el = page.locator(sec.selector);
        if (await el.count() > 0) {
          await el.first().screenshot({ path: join(targetDir, `${sec.name}-${vp.name}.png`) });
        }
      }

      // Dialogs
      const trialBtn = page.locator('.hero-copy [data-open="trial"]');
      if (await trialBtn.count() > 0) {
        await trialBtn.click();
        await page.locator('#trialDialog').screenshot({ path: join(targetDir, `dialog-trial-${vp.name}.png`) });
        await page.locator('#trialDialog [data-close]').click();
      }

      const pricingBtn = page.locator('.licensing [data-open="pricing"]');
      if (await pricingBtn.count() > 0) {
        await pricingBtn.click();
        await page.locator('#pricingDialog').screenshot({ path: join(targetDir, `dialog-pricing-${vp.name}.png`) });
        await page.locator('#pricingDialog [data-close]').click();
      }
    }

    await page.close();
  }

  console.log(`Captured evidence for ${stage} successfully into ${targetDir}`);
} finally {
  if (browser) await browser.close();
  server?.kill();
}
