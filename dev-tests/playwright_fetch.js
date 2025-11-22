const fs = require('fs');
const path = require('path');
// Attempt to require 'playwright' first; fall back to 'playwright-core' if needed
let playwright = null;
try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }
const { chromium } = playwright;

const url = process.argv[2];
if (!url) {
  console.error('Usage: node playwright_fetch.js <URL>');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultNavigationTimeout(30_000);
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    let text = await page.content();
    const preExists = await page.$('pre');
    if (preExists) {
      const preText = await page.$eval('pre', el => el.innerText);
      text = preText;
    } else {
      const bodyText = await page.$eval('body', el => el.innerText || el.innerHTML);
      text = bodyText;
    }
    fs.writeFileSync(path.resolve('/tmp', 'playwright_body'), text);
    const status = response ? response.status() : 599;
    console.log('Playwright status', status);
    await browser.close();
    // 0 success, 2 non-200 status (but body captured), 3 error
    process.exit(status === 200 ? 0 : 2);
  } catch (e) {
    console.error('Playwright fetch error', e && e.stack || e);
    await browser.close();
    process.exit(3);
  }
})();
