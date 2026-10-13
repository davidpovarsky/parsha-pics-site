import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = 4174;
const baseURL = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['scripts/dev-server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), SITE_ROOT: 'dist' },
  stdio: ['ignore', 'pipe', 'pipe']
});

const waitForServer = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Preview server did not start.')), 10000);
  server.stdout.on('data', (chunk) => {
    if (String(chunk).includes(baseURL)) {
      clearTimeout(timeout);
      resolve();
    }
  });
  server.on('exit', (code) => reject(new Error(`Preview server exited with ${code}`)));
});

let browser;
try {
  await waitForServer;
  browser = await chromium.launch({ headless: true });
  const widths = [360, 390, 768, 1024, 1440];
  await mkdir(join(root, 'screenshots'), { recursive: true });
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: width <= 390 ? 844 : 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(baseURL, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.locator('img').evaluateAll((images) => images.forEach((img) => { img.loading = 'eager'; }));
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 15000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${width}px viewport has ${overflow}px horizontal overflow`);
    const broken = await page.locator('img').evaluateAll((images) => images.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.getAttribute('src')));
    assert.deepEqual(broken, [], `${width}px viewport has broken images`);
    assert.equal(await page.locator('.lead-form button[type="submit"]:disabled').count(), 3, 'Safe preview must keep all forms disabled');
    if (width === 390 || width === 1440) await page.screenshot({ path: join(root, 'screenshots', `parsha-pics-${width}.png`), fullPage: true });
    assert.deepEqual(errors, [], `${width}px viewport logged browser errors`);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  const trigger = page.locator('.hero-copy [data-open="trial"]');
  await trigger.focus();
  await trigger.click();
  assert.equal(await page.locator('#trialDialog').evaluate((dialog) => dialog.open), true);
  await page.locator('#trialDialog [data-close]').click();
  assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, 'Dialog must restore focus');

  const summaries = page.locator('.faq-list summary');
  await summaries.nth(0).click();
  await summaries.nth(1).click();
  assert.equal(await page.locator('.faq-list details[open]').count(), 1, 'Only one FAQ item should stay open');

  await page.locator('.licensing [data-open="pricing"]').click();
  const bereishis = page.locator('#pricingDialog input[value="Bereishis"]');
  const full = page.locator('#pricingDialog input[value="Full collection"]');
  await bereishis.check();
  await full.check();
  assert.equal(await bereishis.isChecked(), false, 'Full collection must clear individual choices');
  await page.close();
  console.log('Browser QA passed at 360, 390, 768, 1024 and 1440px; screenshots saved for 390px and 1440px.');
} finally {
  if (browser) await browser.close();
  server.kill();
}
