import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = 4174;
const externalBaseURL = process.env.BASE_URL?.replace(/\/$/, '');
const expectLeadCapture = process.env.EXPECT_LEAD_CAPTURE === 'true';
const baseURL = externalBaseURL || `http://127.0.0.1:${port}`;
const installTurnstileStub = async (page) => {
  if (!expectLeadCapture) return;
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.turnstile={render:(slot)=>{const frame=document.createElement('iframe');frame.title='Turnstile test widget';slot.append(frame);return slot.dataset.type||Math.random()},getResponse:()=> 'browser-test-token',reset:()=>{}};window.onTurnstileLoad?.();`
  }));
};
const server = externalBaseURL ? null : spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), SITE_ROOT: 'dist' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

const waitForServer = externalBaseURL ? Promise.resolve() : new Promise((resolve, reject) => {
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
  const widths = [360, 390, 768, 1024, 1440, 1920];
  await mkdir(join(root, 'screenshots'), { recursive: true });
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: width <= 390 ? 844 : 900 }, deviceScaleFactor: 1 });
    await installTurnstileStub(page);
    const errors = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(baseURL, { waitUntil: expectLeadCapture ? 'domcontentloaded' : 'networkidle' });
    assert.equal(response.status(), 200);
    await page.locator('img').evaluateAll((images) => images.forEach((img) => { img.loading = 'eager'; }));
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForFunction(() => [...document.querySelectorAll('img:not(.lightbox-img)')].every((img) => img.complete), null, { timeout: 15000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${width}px viewport has ${overflow}px horizontal overflow`);
    const broken = await page.locator('img:not(.lightbox-img)').evaluateAll((images) => images.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.getAttribute('src')));
    assert.deepEqual(broken, [], `${width}px viewport has broken images`);

    // Verify 7 accent color matches 300+ accent color
    const sevenAccent = page.locator('.proof-stat').first().locator('strong .accent');
    assert.equal(await sevenAccent.textContent(), '7');
    const sevenColor = await sevenAccent.evaluate((el) => window.getComputedStyle(el).color);
    const threeHundredAccent = page.locator('.proof-stat').nth(1).locator('.accent');
    const threeHundredColor = await threeHundredAccent.evaluate((el) => window.getComputedStyle(el).color);
    assert.equal(sevenColor, threeHundredColor, 'Accent colors for 7 and 300+ must match exactly');

    if (expectLeadCapture) {
      assert.equal(await page.locator('body').getAttribute('data-lead-capture'), 'enabled');
      assert.equal(await page.locator('.lead-form button[type="submit"]:disabled').count(), 0, 'Enabled build must make all forms available');
    } else {
      assert.equal(await page.locator('.lead-form button[type="submit"]:disabled').count(), 3, 'Safe preview must keep all forms disabled');
      assert.equal(await page.locator('.turnstile-slot iframe').count(), 0, 'Safe preview must not load Turnstile');
    }

    await page.screenshot({ path: join(root, 'screenshots', `parsha-pics-${width}.png`), fullPage: true });
    assert.deepEqual(errors, [], `${width}px viewport logged browser errors`);
    await page.close();
  }

  // Interactive Tests: Dialog focus and reset
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await installTurnstileStub(page);
  await page.goto(baseURL, { waitUntil: expectLeadCapture ? 'domcontentloaded' : 'networkidle' });
  const trigger = page.locator('.hero-copy [data-open="trial"]');
  await trigger.focus();
  await trigger.click();
  assert.equal(await page.locator('#trialDialog').evaluate((dialog) => dialog.open), true);
  if (expectLeadCapture) {
    await page.locator('#trialDialog .turnstile-slot iframe').waitFor({ state: 'attached', timeout: 5000 });
    assert.equal(await page.locator('#trialDialog .turnstile-slot iframe').count(), 1, 'Opening trial dialog must render its Turnstile widget');
  }
  await page.locator('#trialDialog [data-close]').click();
  assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, 'Dialog must restore focus');

  // FAQ Test: Plus and true minus (not rotated X), single open item
  const summaries = page.locator('.faq-list summary');
  const firstDetails = page.locator('.faq-list details').nth(0);
  assert.equal(await firstDetails.evaluate((d) => d.open), false);
  const plusVisibleBefore = await firstDetails.locator('.faq-icon-plus').evaluate((el) => window.getComputedStyle(el).display);
  assert.notEqual(plusVisibleBefore, 'none', 'Plus must be visible when closed');

  await summaries.nth(0).click();
  assert.equal(await firstDetails.evaluate((d) => d.open), true);
  const minusVisibleAfter = await firstDetails.locator('.faq-icon-minus').evaluate((el) => window.getComputedStyle(el).display);
  assert.notEqual(minusVisibleAfter, 'none', 'Minus must be visible when open');
  const spanTransform = await firstDetails.locator('.faq-icon').evaluate((el) => window.getComputedStyle(el).transform);
  assert.ok(!spanTransform.includes('matrix(0.707'), 'FAQ icon must NOT rotate into an X');

  await summaries.nth(1).click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.faq-list details[open]').count(), 1, 'Only one FAQ item should stay open');

  // Pricing dialog checkbox exclusivity
  await page.locator('.licensing [data-open="pricing"]').click();
  const bereishis = page.locator('#pricingDialog input[value="Bereishis"]');
  const full = page.locator('#pricingDialog input[value="Full collection"]');
  await bereishis.check();
  await full.check();
  assert.equal(await bereishis.isChecked(), false, 'Full collection must clear individual choices');
  await page.locator('#pricingDialog [data-close]').click();

  // Lightbox: Gallery 1 (Sequence 9 images)
  const seqTriggers = page.locator('.sequence-trigger');
  assert.equal(await seqTriggers.count(), 9, 'All 9 sequence images must have triggers');
  await seqTriggers.nth(0).click();
  const lightbox = page.locator('#lightboxDialog');
  assert.equal(await lightbox.evaluate((d) => d.open), true, 'Lightbox must open');
  assert.equal(await page.locator('#lightboxCounter').textContent(), '1 / 9');
  let currentImgSrc = await page.locator('#lightboxImg').getAttribute('src');
  assert.ok(currentImgSrc.includes('lech-01'), 'First sequence image must display');

  // Navigate through all 9 images with next button
  for (let i = 2; i <= 9; i++) {
    await page.locator('[data-lightbox-next]').click();
    assert.equal(await page.locator('#lightboxCounter').textContent(), `${i} / 9`);
    const naturalWidth = await page.locator('#lightboxImg').evaluate((img) => img.naturalWidth);
    assert.ok(naturalWidth > 0, `Image ${i} must load in lightbox`);
  }

  // Keyboard navigation: ArrowLeft back to image 8
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#lightboxCounter').textContent(), '8 / 9');

  // Escape to close and verify focus restoration
  await page.keyboard.press('Escape');
  assert.equal(await lightbox.evaluate((d) => d.open), false, 'Lightbox must close on Escape');
  assert.equal(await seqTriggers.nth(0).evaluate((el) => document.activeElement === el), true, 'Lightbox must restore focus');

  // Lightbox: Gallery 2 (Collection 12 images: 3 Parshiyos x 4 scenes)
  for (const parsha of ['vayeishev', 'mishpatim', 'kedoshim']) {
    const mainTrigger = page.locator(`[data-lightbox="${parsha}"][data-index="0"]`);
    await mainTrigger.click();
    assert.equal(await lightbox.evaluate((d) => d.open), true);
    assert.equal(await page.locator('#lightboxCounter').textContent(), '1 / 4');

    // Verify all 4 images can be viewed in the mini-gallery
    for (let s = 2; s <= 4; s++) {
      await page.locator('[data-lightbox-next]').click();
      assert.equal(await page.locator('#lightboxCounter').textContent(), `${s} / 4`);
      await page.waitForFunction(() => {
        const img = document.getElementById('lightboxImg');
        return img && img.complete && img.naturalWidth > 0;
      }, null, { timeout: 5000 });
      const naturalWidth = await page.locator('#lightboxImg').evaluate((img) => img.naturalWidth);
      assert.ok(naturalWidth > 0, `${parsha} scene ${s} must load in lightbox`);
    }
    await page.locator('[data-lightbox-close]').click();
    assert.equal(await lightbox.evaluate((d) => d.open), false);
  }

  // Mobile check: Collection thumbnails hidden in DOM layout, but extra pictures accessible via lightbox
  const thumbsVisible = await page.locator('.collection-thumbs').first().evaluate((el) => window.getComputedStyle(el).display);
  assert.equal(thumbsVisible, 'none', 'Collection thumbs must be hidden on 390px mobile view');

  await page.close();

  // Desktop check (1440px): collection thumbnails are visible and clickable directly
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktopPage.goto(baseURL, { waitUntil: 'networkidle' });
  const desktopThumbs = desktopPage.locator('.collection-thumbs').first();
  const desktopThumbsDisplay = await desktopThumbs.evaluate((el) => window.getComputedStyle(el).display);
  assert.notEqual(desktopThumbsDisplay, 'none', 'Collection thumbs must be visible on 1440px');

  // Click thumb 2 of Vayeishev directly (index 2) -> should open at 3 / 4
  await desktopPage.locator('[data-lightbox="vayeishev"][data-index="2"]').click();
  const desktopLightbox = desktopPage.locator('#lightboxDialog');
  assert.equal(await desktopLightbox.evaluate((d) => d.open), true);
  assert.equal(await desktopPage.locator('#lightboxCounter').textContent(), '3 / 4');
  await desktopPage.locator('[data-lightbox-close]').click();
  await desktopPage.close();

  console.log(`Browser QA passed for ${expectLeadCapture ? 'lead-enabled' : 'safe-preview'} build at 360, 390, 768, 1024, 1440 and 1920px; all interactive and lightbox tests passed.`);
} finally {
  if (browser) await browser.close();
  server?.kill();
}
