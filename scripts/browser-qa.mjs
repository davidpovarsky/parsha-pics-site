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
  const widths = [360, 390, 414, 768, 1024, 1440, 1920];
  await mkdir(join(root, 'screenshots'), { recursive: true });
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: width <= 414 ? 844 : 900 }, deviceScaleFactor: 1 });
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

    // Verify 8 distinct worksheet images are present and fully visible
    const worksheetImgs = page.locator('.worksheet-trigger img');
    assert.equal(await worksheetImgs.count(), 8, `Expected 8 worksheet images at ${width}px, found ${await worksheetImgs.count()}`);
    for (let w = 0; w < 8; w++) {
      const wImg = worksheetImgs.nth(w);
      assert.ok(await wImg.isVisible(), `Worksheet image ${w + 1} must be visible at ${width}px`);
      const wBox = await wImg.boundingBox();
      assert.ok(wBox && wBox.width > 0 && wBox.height > 0, `Worksheet image ${w + 1} must have non-zero bounds at ${width}px`);
    }

    // Verify sequence number badges do NOT have outer rectangular plaque ::before
    const seqBadgeBeforeContent = await page.locator('.number-badge').first().evaluate((el) => {
      const pseudo = window.getComputedStyle(el, '::before');
      return pseudo.content;
    });
    assert.ok(seqBadgeBeforeContent === 'none' || seqBadgeBeforeContent === 'normal', `Sequence number badge must not have outer plaque at ${width}px, got ${seqBadgeBeforeContent}`);

    // Verify Research point 5 copy
    const card5Text = await page.locator('.annotation-desc').nth(4).textContent();
    assert.ok(card5Text.includes('fallen horse'), `Research card 5 must say "fallen horse", got: ${card5Text}`);
    assert.ok(!card5Text.includes('soldier'), `Research card 5 must not say "soldier"`);

    // Verify trial band has no follow-up sentence
    const trialBandText = await page.locator('.trial-band').textContent();
    assert.ok(!trialBandText.includes('follow up'), `Trial band must not contain follow up text`);

    if (width <= 760) {
      // Mobile-only content assertions
      const mobileElements = [
        { name: 'Hero mobile description', locator: page.locator('.hero-desc.mobile-only') },
        { name: 'Sequence mobile intro', locator: page.locator('.sequence .section-intro p.mobile-only') },
        { name: 'Research mobile heading', locator: page.locator('.research-mobile-header h2') },
        { name: 'Research mobile bold statement', locator: page.locator('.research-mobile-bold') },
        { name: 'Research mobile intro', locator: page.locator('.research-mobile-intro') },
        { name: 'Trial mobile heading', locator: page.locator('#try-heading .mobile-only') },
        { name: 'Trial mobile description', locator: page.locator('.trial-layout p.mobile-only') },
        { name: 'Worksheets mobile heading', locator: page.locator('#worksheets-title .mobile-only') },
        { name: 'Worksheets mobile description', locator: page.locator('.worksheet-copy p.mobile-only') },
        { name: 'Collection mobile intro', locator: page.locator('.collection .section-intro p.mobile-only') },
        { name: 'Included mobile title', locator: page.locator('#included-title .mobile-only') },
        { name: 'Included mobile intro', locator: page.locator('.included-copy p.mobile-only') },
        { name: 'FAQ mobile intro', locator: page.locator('.faq .section-intro p.mobile-only') },
        { name: 'Closing mobile heading', locator: page.locator('#closing-title .mobile-only') },
        { name: 'Closing mobile pricing button label', locator: page.locator('.closing-actions [data-open="pricing"] .mobile-only') },
        { name: 'Proof stat "the UK"', locator: page.locator('.proof-stat .mobile-only') }
      ];

      for (const item of mobileElements) {
        assert.ok(await item.locator.isVisible(), `${item.name} must be visible at ${width}px`);
        const box = await item.locator.boundingBox();
        assert.ok(box && box.width > 0 && box.height > 0, `${item.name} must have substantive nonzero bounds at ${width}px`);
      }

      // Desktop-only content must NOT be visible on mobile
      const desktopElements = [
        page.locator('.hero-desc.desktop-only'),
        page.locator('.sequence .section-intro p.desktop-only'),
        page.locator('.research-copy.desktop-only'),
        page.locator('#try-heading .desktop-only'),
        page.locator('.trial-layout p.desktop-only'),
        page.locator('#worksheets-title .desktop-only'),
        page.locator('.worksheet-copy p.desktop-only'),
        page.locator('.collection .section-intro p.desktop-only'),
        page.locator('#included-title .desktop-only'),
        page.locator('.included-copy p.desktop-only'),
        page.locator('.faq .section-intro p.desktop-only'),
        page.locator('#closing-title .desktop-only'),
        page.locator('.closing-actions [data-open="pricing"] .desktop-only')
      ];

      for (const loc of desktopElements) {
        const visible = await loc.isVisible();
        assert.ok(!visible, `Desktop element should be hidden at ${width}px mobile view`);
      }

      // Hotspots on mobile
      const markers = page.locator('.research-marker');
      assert.equal(await markers.count(), 5, `Expected 5 research markers at ${width}px`);
      const imgBox = await page.locator('.research-art-wrapper img').boundingBox();
      assert.ok(imgBox && imgBox.width > 0, `Research image must have nonzero bounds at ${width}px`);

      const targetCoords = [
        { x: 0.406, y: 0.200 },
        { x: 0.222, y: 0.472 },
        { x: 0.748, y: 0.489 },
        { x: 0.417, y: 0.598 },
        { x: 0.695, y: 0.719 }
      ];

      for (let i = 0; i < 5; i++) {
        const marker = markers.nth(i);
        assert.ok(await marker.isVisible(), `Marker ${i + 1} must be visible`);
        const mBox = await marker.boundingBox();
        assert.ok(mBox, `Marker ${i + 1} bounding box must exist`);
        const bg = await marker.evaluate((el) => window.getComputedStyle(el).backgroundColor);
        assert.equal(bg, 'rgb(255, 255, 255)', `Marker ${i + 1} must have white background`);
        assert.ok(mBox.width >= 24 && mBox.width <= 36, `Marker ${i + 1} width ~29px, got ${mBox.width}`);

        const markerCenterX = (mBox.x + mBox.width / 2 - imgBox.x) / imgBox.width;
        const markerCenterY = (mBox.y + mBox.height / 2 - imgBox.y) / imgBox.height;
        assert.ok(Math.abs(markerCenterX - targetCoords[i].x) < 0.05, `Marker ${i + 1} x position error: ${markerCenterX} vs target ${targetCoords[i].x}`);
        assert.ok(Math.abs(markerCenterY - targetCoords[i].y) < 0.05, `Marker ${i + 1} y position error: ${markerCenterY} vs target ${targetCoords[i].y}`);
      }

      // FAQ controls on mobile
      const faqIcon = page.locator('.faq-list summary span.faq-icon').first();
      const faqIconBox = await faqIcon.boundingBox();
      assert.ok(faqIconBox && Math.abs(faqIconBox.width - 32) <= 2, `FAQ icon width should be ~32px, got ${faqIconBox?.width}`);
      assert.ok(faqIconBox && Math.abs(faqIconBox.height - 32) <= 2, `FAQ icon height should be ~32px, got ${faqIconBox?.height}`);
      const summaryBox = await page.locator('.faq-list summary').first().boundingBox();
      assert.ok(summaryBox && summaryBox.height >= 56, `FAQ summary row height should be >= 56px, got ${summaryBox?.height}`);

      // Pricing icons hidden on mobile
      const pricingImgs = page.locator('.licensing-options img');
      const pricingImgsVisible = await pricingImgs.first().isVisible();
      assert.ok(!pricingImgsVisible, `Pricing option icons must be hidden on mobile`);

      // Feature icons ~42px
      const featureImg = page.locator('.feature > img').first();
      const featBox = await featureImg.boundingBox();
      assert.ok(featBox && Math.abs(featBox.width - 42) <= 4, `Feature icon width should be ~42px, got ${featBox?.width}`);

      // Testimonial card size on 390px
      if (width === 390) {
        const testCard = page.locator('.testimonial-grid blockquote').first();
        const testBox = await testCard.boundingBox();
        assert.ok(testBox && Math.abs(testBox.width - 294) <= 4, `Testimonial card width should be ~294px, got ${testBox?.width}`);
        assert.ok(testBox && testBox.height >= 330, `Testimonial card height should be >= 330px, got ${testBox?.height}`);
        assert.ok(await page.locator('.swipe-hint').isVisible(), `Swipe hint should be visible on 390px`);
      }
    } else {
      // Desktop content assertions
      const desktopElements = [
        { name: 'Hero desktop description', locator: page.locator('.hero-desc.desktop-only') },
        { name: 'Sequence desktop intro', locator: page.locator('.sequence .section-intro p.desktop-only') },
        { name: 'Research desktop copy', locator: page.locator('.research-copy.desktop-only') },
        { name: 'Trial desktop heading', locator: page.locator('#try-heading .desktop-only') },
        { name: 'Trial desktop description', locator: page.locator('.trial-layout p.desktop-only') },
        { name: 'Worksheets desktop heading', locator: page.locator('#worksheets-title .desktop-only') },
        { name: 'Worksheets desktop description', locator: page.locator('.worksheet-copy p.desktop-only') },
        { name: 'Collection desktop intro', locator: page.locator('.collection .section-intro p.desktop-only') },
        { name: 'Included desktop title', locator: page.locator('#included-title .desktop-only') },
        { name: 'Included desktop intro', locator: page.locator('.included-copy p.desktop-only') },
        { name: 'FAQ desktop intro', locator: page.locator('.faq .section-intro p.desktop-only') },
        { name: 'Closing desktop heading', locator: page.locator('#closing-title .desktop-only') },
        { name: 'Closing desktop pricing button label', locator: page.locator('.closing-actions [data-open="pricing"] .desktop-only') }
      ];

      for (const item of desktopElements) {
        assert.ok(await item.locator.isVisible(), `${item.name} must be visible at ${width}px`);
        const box = await item.locator.boundingBox();
        assert.ok(box && box.width > 0 && box.height > 0, `${item.name} must have substantive nonzero bounds at ${width}px`);
      }

      // Mobile elements must NOT be visible on desktop
      const mobileElements = [
        page.locator('.hero-desc.mobile-only'),
        page.locator('.sequence .section-intro p.mobile-only'),
        page.locator('.research-mobile-header'),
        page.locator('#try-heading .mobile-only'),
        page.locator('.trial-layout p.mobile-only'),
        page.locator('#worksheets-title .mobile-only'),
        page.locator('.worksheet-copy p.mobile-only'),
        page.locator('.collection .section-intro p.mobile-only'),
        page.locator('#included-title .mobile-only'),
        page.locator('.included-copy p.mobile-only'),
        page.locator('.faq .section-intro p.mobile-only'),
        page.locator('#closing-title .mobile-only'),
        page.locator('.closing-actions [data-open="pricing"] .mobile-only')
      ];

      for (const loc of mobileElements) {
        const visible = await loc.isVisible();
        assert.ok(!visible, `Mobile element should be hidden at ${width}px desktop view`);
      }

      // On 1440px desktop: leader lines
      if (width === 1440) {
        const leaderLines = page.locator('.research-leaders path.leader-line');
        assert.equal(await leaderLines.count(), 5, `Expected 5 desktop leader lines at 1440px`);
        const pricingImgs = page.locator('.licensing-options img');
        assert.ok(await pricingImgs.first().isVisible(), `Pricing option icons must be visible on 1440px`);
      }
    }

    // Annotation card numbers use POV marker on all viewports
    const annotNum = page.locator('.annotation-num').first();
    const annotNumBg = await annotNum.evaluate((el) => window.getComputedStyle(el).backgroundImage);
    assert.ok(annotNumBg.includes('pov-marker'), `Annotation number must use pov-marker asset`);

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
  const plusOpacityBefore = await firstDetails.locator('.faq-icon-plus').evaluate((el) => window.getComputedStyle(el).opacity);
  assert.equal(plusOpacityBefore, '1', 'Plus must be fully opaque when closed');

  await summaries.nth(0).click();
  assert.equal(await firstDetails.evaluate((d) => d.open), true);
  await page.waitForTimeout(350); // allow morph transition
  const plusOpacityAfter = await firstDetails.locator('.faq-icon-plus').evaluate((el) => window.getComputedStyle(el).opacity);
  const minusOpacityAfter = await firstDetails.locator('.faq-icon-minus').evaluate((el) => window.getComputedStyle(el).opacity);
  assert.equal(plusOpacityAfter, '0', 'Plus must be fully retracted and transparent when open');
  assert.equal(minusOpacityAfter, '1', 'Minus must be visible when open');
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

  // Lightbox: Gallery 3 (Worksheets 8 items)
  const worksheetTriggers = page.locator('[data-lightbox="worksheets"]');
  assert.equal(await worksheetTriggers.count(), 8, 'All 8 worksheets must have triggers');

  for (let idx = 0; idx < 8; idx++) {
    const triggerEl = worksheetTriggers.nth(idx);
    await triggerEl.click();
    assert.equal(await lightbox.evaluate((d) => d.open), true, `Lightbox must open for worksheet ${idx + 1}`);
    assert.equal(await page.locator('#lightboxCounter').textContent(), `${idx + 1} / 8`);
    await page.waitForFunction(() => {
      const img = document.getElementById('lightboxImg');
      return img && img.complete && img.naturalWidth > 0;
    }, null, { timeout: 5000 });
    const naturalWidth = await page.locator('#lightboxImg').evaluate((img) => img.naturalWidth);
    assert.ok(naturalWidth > 0, `Worksheet ${idx + 1} must load in lightbox`);
    await page.locator('[data-lightbox-close]').click();
    assert.equal(await lightbox.evaluate((d) => d.open), false, `Lightbox must close after worksheet ${idx + 1}`);
    assert.equal(await triggerEl.evaluate((el) => document.activeElement === el), true, `Focus must restore to worksheet ${idx + 1} trigger`);
  }

  // Worksheets Gallery Next/Prev cycling
  await worksheetTriggers.nth(0).click();
  assert.equal(await page.locator('#lightboxCounter').textContent(), '1 / 8');
  await page.locator('[data-lightbox-next]').click();
  assert.equal(await page.locator('#lightboxCounter').textContent(), '2 / 8');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#lightboxCounter').textContent(), '3 / 8');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#lightboxCounter').textContent(), '2 / 8');
  await page.keyboard.press('Escape');
  assert.equal(await lightbox.evaluate((d) => d.open), false);

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
