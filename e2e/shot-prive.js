// Üç amiral gemisi ekranın render kanıtı + küçük Android ekranı taşma kontrolü.
const { chromium } = require('playwright');
const BASE = process.env.APP_URL || 'http://127.0.0.1:8081';
const OUT = process.env.SHOT_DIR || require('node:path').join(__dirname, 'screenshots');
require('node:fs').mkdirSync(OUT, { recursive: true });

const SCREENS = [
  ['bugun', '/home', 'PatiMeet'],
  ['kesfet', '/discover', 'Keşfet'],
  ['kulup', '/events', 'Kulüp'],
  ['canli-yuruyus', '/live-walk', 'Canlı yürüyüş'],
  ['gunluk', '/journal', 'günlüğü'],
  ['mahalle', '/neighbourhood', 'Semtinde bugün'],
  ['davet', '/neighbourhood/create-invite', 'Ne zaman'],
  ['pati', '/profile', 'Bugünkü bakım'],
  ['ayarlar', '/settings', 'Profil ve ayarlar'],
];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // 390x844 = iPhone ölçüsü, 320x568 = küçük Android ölçüsü.
  /**
   * `buyukyazi` sistem yazı büyütmesini benzetir: kritik düğme ve bilgilerin
   * kaybolmadığını doğrular.
   */
  for (const [tag, width, height, fontScale] of [
    ['telefon', 390, 844, 1],
    ['kucuk', 320, 568, 1],
    ['buyukyazi', 390, 844, 1.3],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    if (fontScale !== 1) {
      await page.addStyleTag({ content: `html { font-size: ${16 * fontScale}px; }` }).catch(() => undefined);
    }
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
      const report = await page.evaluate(() => {
        const overflow =
          document.documentElement.scrollWidth - document.documentElement.clientWidth;
        /**
         * Görünür alanın dışına taşan buton var mı?
         *
         * Yatay kaydırılabilir bir satırın (filtre çipleri, köpek seçici)
         * içindekiler sayılmaz: kullanıcı kaydırarak erişebiliyor, bu bir
         * yerleşim hatası değil.
         */
        const inHorizontalScroller = (el) => {
          for (let n = el.parentElement; n; n = n.parentElement) {
            const overflowX = getComputedStyle(n).overflowX;
            if (overflowX === 'auto' || overflowX === 'scroll') return true;
          }
          return false;
        };

        let clipped = 0;
        for (const el of document.querySelectorAll('[role="button"]')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (inHorizontalScroller(el)) continue;
          if (r.right > window.innerWidth + 1 || r.left < -1) clipped += 1;
        }
        return { overflow, clipped };
      });
      console.log(
        `${tag}/${name}: yatay taşma ${report.overflow}px · taşan buton ${report.clipped}`
      );
      if (report.overflow > 0 || report.clipped > 0) process.exitCode = 1;
    }
    await context.close();
  }

  await browser.close();
})();
