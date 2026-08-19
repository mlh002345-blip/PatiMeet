// Yeni kullanıcı yolculuğu: kayıt → profil → semt → köpek profili → ana sayfa
const { chromium } = require('playwright');

const BASE = process.env.APP_URL || 'http://127.0.0.1:8081';

const OUT = process.env.SHOT_DIR || require('node:path').join(__dirname, 'screenshots');
require('node:fs').mkdirSync(OUT, { recursive: true });
const errors = [];
let pass = 0;
let fail = 0;

function check(label, ok, extra) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${extra ? ` → ${extra}` : ''}`);
  }
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/shot-${name}.png` });

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // Yığın gezinmesinde önceki ekranların düğümleri DOM'da kalabiliyor;
  // yalnızca görünür olana tıkla.
  const tap = async (text, exact = true) => {
    const loc = page.getByText(text, { exact }).locator('visible=true');
    await loc.first().click({ timeout: 30000 });
  };

  const email = `yeni${Date.now()}@test.com`;

  await page.goto(`${BASE}`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(6000);
  await shot(page, '40-giris-ekrani');

  // --- Kayıt ekranına geç ---
  console.log('→ Kayıt ekranı');
  await tap('Kayıt ol');
  await page.waitForTimeout(4000);
  await shot(page, '41-kayit');
  let body = await page.textContent('body');
  check('Kayıt ekranı açıldı', body.includes("PatiMeet'e katıl"), body.slice(0, 150));
  check('Sözleşme onayları görünüyor', body.includes('Kullanıcı Sözleşmesi') && body.includes('KVKK'));

  // --- Doğrulama: onay olmadan kayıt ---
  console.log('→ Form doğrulaması');
  const inputs = page.locator('input').locator('visible=true');
  await inputs.nth(0).fill(email);
  await inputs.nth(1).fill('kisa');
  await tap('Hesap oluştur', false);
  await page.waitForTimeout(2000);
  body = await page.textContent('body');
  check('Kısa şifre hatası gösterildi', body.includes('en az 8 karakter'), body.slice(0, 200));
  check('Onay zorunluluğu hatası gösterildi', body.includes('her iki onayı da'), body.slice(0, 250));
  await shot(page, '42-dogrulama-hatalari');

  // --- Geçerli kayıt ---
  await inputs.nth(1).fill('sifre12345');
  // Onay kutularını işaretle (checkbox rolü)
  const boxes = page.locator('[role="checkbox"]').locator('visible=true');
  const boxCount = await boxes.count();
  console.log(`  onay kutusu sayısı: ${boxCount}`);
  for (let i = 0; i < boxCount; i++) await boxes.nth(i).click();
  await page.waitForTimeout(500);
  await shot(page, '43-kayit-hazir');

  await tap('Hesap oluştur', false);
  await page.waitForTimeout(8000);
  await shot(page, '44-onboarding-profil');
  body = await page.textContent('body');
  check('Kayıt başarılı, onboarding açıldı', body.includes('Kendini tanıt'), body.slice(0, 200));
  check('Adım göstergesi var (1/3)', body.includes('Adım 1 / 3'));

  // --- Adım 1: profil ---
  console.log('→ Adım 1: profil');
  await tap('Devam et', false);
  await page.waitForTimeout(2000);
  body = await page.textContent('body');
  check('Ad zorunluluğu doğrulandı', body.includes('en az 2 karakter'), body.slice(0, 200));

  const nameInput = page.locator('input').locator('visible=true').first();
  await nameInput.fill('Deniz');
  await tap('Yürüyüş arkadaşı', false);
  await page.waitForTimeout(300);
  const bioBox = page.locator('textarea').locator('visible=true').first();
  if ((await bioBox.count()) > 0) await bioBox.fill('Sabah yürüyüşlerini seviyoruz.');
  await shot(page, '45-profil-dolu');

  await tap('Devam et', false);
  await page.waitForTimeout(6000);
  await shot(page, '46-semt-secimi');
  body = await page.textContent('body');
  check('Semt seçimi ekranı açıldı', body.includes('Hangi semtte'), body.slice(0, 200));
  check('Gizlilik notu var', body.includes('Tam adresin hiçbir zaman paylaşılmaz'));
  check('Adım 2/3 gösteriliyor', body.includes('Adım 2 / 3'));

  // --- Adım 2: semt ---
  console.log('→ Adım 2: semt');
  await tap('Kadıköy');
  await page.waitForTimeout(800);
  await shot(page, '47-semt-secildi');
  await tap('Devam et', false);
  await page.waitForTimeout(7000);
  await shot(page, '48-kopek-profili');
  body = await page.textContent('body');
  check('Köpek profili ekranı açıldı', body.includes('Köpeğini tanıt'), body.slice(0, 200));
  check('Adım 3/3 gösteriliyor', body.includes('Adım 3 / 3'));

  // --- Adım 3: köpek — zorunlu alan doğrulaması ---
  console.log('→ Adım 3: köpek profili');
  await tap('Profili tamamla', false);
  await page.waitForTimeout(2000);
  body = await page.textContent('body');
  check('Köpek adı zorunlu', body.includes('Köpeğinizin adını girin'), body.slice(0, 250));
  check('Boyut zorunlu', body.includes('Boyut seçin'));
  check('Enerji zorunlu', body.includes('Enerji seviyesi seçin'));
  await shot(page, '49-kopek-dogrulama');

  const dogInputs = page.locator('input').locator('visible=true');
  await dogInputs.nth(0).fill('Bulut');
  await tap('Orta');
  await tap('Enerjik');
  await tap('Sosyal');
  await page.waitForTimeout(400);

  // Cins ve yaş
  const count = await dogInputs.count();
  for (let i = 0; i < count; i++) {
    const ph = await dogInputs.nth(i).getAttribute('placeholder');
    if (ph && ph.includes('Golden')) await dogInputs.nth(i).fill('Karışık');
    if (ph === 'Örn. 3') await dogInputs.nth(i).fill('4');
  }
  // Aşı beyanı
  const vaccineBox = page.locator('[role="checkbox"]').locator('visible=true').first();
  if ((await vaccineBox.count()) > 0) await vaccineBox.click();
  await page.waitForTimeout(400);
  await shot(page, '50-kopek-dolu');

  await tap('Profili tamamla', false);
  await page.waitForTimeout(9000);
  await shot(page, '51-ana-sayfa-yeni');
  body = await page.textContent('body');
  check(
    'Onboarding tamamlandı, Bugün ekranı açıldı',
    /Günaydın|İyi günler|İyi akşamlar/.test(body) && body.includes('Deniz'),
    body.slice(0, 250)
  );
  check('Köpek adı ana sayfada görünüyor', body.includes('Bulut'), body.slice(0, 250));
  check('Semt gösteriliyor', body.includes('Kadıköy'));

  // --- Yeni kullanıcı için boş durumlar ---
  console.log('→ Yeni kullanıcı boş durumları');
  check('Etkinlik yok mesajı var', body.includes('Henüz bir etkinliğe katılmadın'), body.slice(0, 400));

  await page.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await shot(page, '52-mesajlar-bos');
  body = await page.textContent('body');
  check('Mesaj boş durumu tasarlanmış', body.includes('Henüz mesajın yok'), body.slice(0, 250));

  console.log(`\n=== Konsol/sayfa hataları: ${errors.length} ===`);
  for (const e of errors.slice(0, 10)) console.log('  !', e.slice(0, 250));

  console.log(`\n${'='.repeat(46)}`);
  console.log(`Geçen: ${pass}  |  Başarısız: ${fail}`);
  console.log('='.repeat(46));

  await browser.close();
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('ÇÖKTÜ:', e.message);
  process.exit(1);
});
