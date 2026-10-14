import { createHash } from 'node:crypto';
import { stat, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--disable-blink-features=AutomationControlled'
  ]
});

const context = await browser.newContext();

const apiResponses = [];
const setupPage = (page) => {
  page.on('response', async (res) => {
    if (res.url().includes('/api/lead')) {
      let body;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      const entry = {
        url: res.url(),
        status: res.status(),
        cfRay: res.headers()['cf-ray'],
        body
      };
      apiResponses.push(entry);
      console.log(`>>> CAPTURED /api/lead response [${entry.status}]:`, JSON.stringify(entry, null, 2));
    }
  });
};

console.log('====================================================');
console.log('TEST 1: TRIAL FORM & SAMPLE DOWNLOAD VERIFICATION');
console.log('====================================================');
{
  const page = await context.newPage();
  setupPage(page);

  console.log('1. Navigating to production site: https://parshapics.goldypov.com ...');
  await page.goto('https://parshapics.goldypov.com/', { waitUntil: 'networkidle' });

  console.log('2. Opening Trial modal...');
  await page.locator('.hero-copy [data-open="trial"]').click();

  console.log('3. Filling trial form fields...');
  await page.locator('#trialDialog input[name="name"]').fill('QA Real Live Submission');
  await page.locator('#trialDialog input[name="school"]').fill('QA Production School London');
  await page.locator('#trialDialog input[name="email"]').fill('goldy@goldypov.com');

  console.log('4. Waiting for Turnstile to verify and issue token...');
  let token = '';
  for (let i = 0; i < 20; i++) {
    token = await page.evaluate(() => {
      const widgetDiv = document.querySelector('#trialDialog [data-turnstile] iframe');
      return window.turnstile?.getResponse?.() || '';
    });
    if (token && token.length > 20) {
      console.log(`>>> Trial Turnstile verified! Token length: ${token.length}`);
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (!token) throw new Error('Turnstile did not issue a token for trial');

  console.log('5. Submitting trial form...');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(e => {
      console.log('Direct download event note:', e.message);
      return null;
    }),
    page.locator('#trialDialog button[type="submit"]').click()
  ]);

  console.log('6. Waiting 4s for UI completion...');
  await page.waitForTimeout(4000);

  await page.evaluate(() => {
    const dialog = document.getElementById('trialDialog');
    if (dialog) dialog.scrollTop = dialog.scrollHeight;
  });
  await page.screenshot({ path: 'screenshots/trial-success-scrolled.png' });

  const trialUiState = await page.evaluate(() => {
    const status = document.querySelector('#trialDialog .form-status');
    const fallback = document.querySelector('#trialDialog .trial-download-fallback');
    const fallbackLink = document.querySelector('#trialDialog .trial-download-fallback a');
    return {
      statusText: status?.innerText,
      statusState: status?.dataset.state,
      fallbackDisplay: fallback?.style.display,
      downloadHref: fallbackLink?.href,
      downloadText: fallbackLink?.innerText
    };
  });
  console.log('7. Trial UI State:', JSON.stringify(trialUiState, null, 2));

  if (download) {
    const downloadPath = 'screenshots/downloaded-sample.zip';
    await download.saveAs(downloadPath);
    console.log(`8. Saved download to ${downloadPath}`);
    const stats = await stat(downloadPath);
    const data = await readFile(downloadPath);
    const hash = createHash('sha256').update(data).digest('hex').toUpperCase();
    console.log(`Downloaded file size: ${stats.size} bytes`);
    console.log(`Downloaded file SHA-256: ${hash}`);
  }

  await page.close();
}

console.log('====================================================');
console.log('TEST 2: PRICING FORM VERIFICATION');
console.log('====================================================');
{
  const page = await context.newPage();
  setupPage(page);

  await page.goto('https://parshapics.goldypov.com/', { waitUntil: 'networkidle' });
  await page.locator('aside.licensing [data-open="pricing"]').click();
  await page.locator('#pricingDialog input[name="name"]').fill('QA Pricing Lead Verification');
  await page.locator('#pricingDialog input[name="school"]').fill('London Chinuch Academy');
  await page.locator('#pricingDialog input[name="email"]').fill('goldy@goldypov.com');
  await page.locator('#pricingDialog input[value="Full collection"]').check();

  console.log('Waiting for Turnstile on Pricing form...');
  let token = '';
  for (let i = 0; i < 20; i++) {
    token = await page.evaluate(() => window.turnstile?.getResponse?.() || '');
    if (token && token.length > 20) {
      console.log(`>>> Pricing Turnstile verified! Length: ${token.length}`);
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (!token) throw new Error('Turnstile did not issue a token for pricing');

  await page.locator('#pricingDialog button[type="submit"]').click();
  await page.waitForTimeout(4000);

  await page.evaluate(() => {
    const dialog = document.getElementById('pricingDialog');
    if (dialog) dialog.scrollTop = dialog.scrollHeight;
  });
  await page.screenshot({ path: 'screenshots/pricing-success.png' });

  const pricingUiState = await page.evaluate(() => {
    const status = document.querySelector('#pricingDialog .form-status');
    return {
      statusText: status?.innerText,
      statusState: status?.dataset.state
    };
  });
  console.log('Pricing UI State:', JSON.stringify(pricingUiState, null, 2));

  await page.close();
}

console.log('====================================================');
console.log('TEST 3: CONTACT FORM VERIFICATION');
console.log('====================================================');
{
  const page = await context.newPage();
  setupPage(page);

  await page.goto('https://parshapics.goldypov.com/', { waitUntil: 'networkidle' });
  await page.locator('footer [data-open="contact"]').click();
  await page.locator('#contactDialog input[name="name"]').fill('QA Contact Regression Test');
  await page.locator('#contactDialog input[name="email"]').fill('goldy@goldypov.com');
  await page.locator('#contactDialog textarea[name="message"]').fill('Autonomous regression test: verifying contact form delivery to goldy@goldypov.com.');

  console.log('Waiting for Turnstile on Contact form...');
  let token = '';
  for (let i = 0; i < 20; i++) {
    token = await page.evaluate(() => window.turnstile?.getResponse?.() || '');
    if (token && token.length > 20) {
      console.log(`>>> Contact Turnstile verified! Length: ${token.length}`);
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (!token) throw new Error('Turnstile did not issue a token for contact');

  await page.locator('#contactDialog button[type="submit"]').click();
  await page.waitForTimeout(4000);

  await page.evaluate(() => {
    const dialog = document.getElementById('contactDialog');
    if (dialog) dialog.scrollTop = dialog.scrollHeight;
  });
  await page.screenshot({ path: 'screenshots/contact-success.png' });

  const contactUiState = await page.evaluate(() => {
    const status = document.querySelector('#contactDialog .form-status');
    return {
      statusText: status?.innerText,
      statusState: status?.dataset.state
    };
  });
  console.log('Contact UI State:', JSON.stringify(contactUiState, null, 2));

  await page.close();
}

console.log('====================================================');
console.log('ALL TESTS FINISHED. SUMMARY OF CAPTURED API RESPONSES:');
console.log(JSON.stringify(apiResponses, null, 2));
console.log('====================================================');

await browser.close();
