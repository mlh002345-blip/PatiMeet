// Üç amiral gemisi ekranın render kanıtı + küçük Android ekranı taşma kontrolü.
const { chromium } = require('playwright');
const BASE = process.env.APP_URL || 'http://127.0.0.1:8081';
const OUT = process.env.SHOT_DIR || require('node:path').join(__dirname, 'screenshots');
require('node:fs').mkdirSync(OUT, { recursive: true });

const SCREENS = [
  ['bugun', '/home', 'Bugün'],
  ['kesfet', '/discover', 'Keşfet'],
  ['kulup', '/events', 'Kulüp'],
];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // 390x844 = iPhone ölçüsü, 320x568 = küçük Android ölçüsü.
  for (const [tag, width, height] of [['telefon', 390, 844], ['kucuk', 320, 568]]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(6000);
    const inputs = page.locator('input');
    await inputs.first().waitFor({ timeout: 30000 });
    await inputs.nth(0).fill('elif@ornek.com');
    await inputs.nth(1).fill('patimeet123');
    await page.getByText('Giriş yap', { exact: true }).first().click();
    await page.waitForTimeout(8000);

    for (const [name, path, expect] of SCREENS) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      try {
        await page.locator(`text=${expect}`).first().waitFor({ timeout: 30000 });
      } catch {}
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${OUT}/prive-${tag}-${name}.png` });

      // Yatay taşma kontrolü: gövde görünen alandan geniş olmamalı.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      console.log(`${tag}/${name}: yatay taşma ${overflow}px`);
    }
    await context.close();
  }

  await browser.close();
})();
