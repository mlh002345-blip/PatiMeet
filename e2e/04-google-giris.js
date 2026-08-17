/**
 * Google ile giriş arayüz akışları.
 *
 * `GOOGLE_EXPECTED` ortam değişkeni ile iki durum sınanır:
 *   absent  → Google istemci kimliği tanımlı DEĞİL: düğme hiç görünmemeli
 *   present → Kimlik tanımlı: düğme görünmeli, tıklanabilmeli ve ağ
 *             engellendiğinde çökmeden hata bildirimi vermeli
 *
 * Gerçek Google OAuth turu (kullanıcı hesap seçip izin verir) otomatik
 * sürülemez: geçerli istemci kimliği ve insan etkileşimi gerekir. Sunucu
 * tarafındaki token doğrulama ve hesap eşleştirme kuralları
 * `apps/api` içindeki `npm run test:google` ile ayrıca test edilir.
 */
const { chromium } = require('playwright');

const BASE = process.env.APP_URL || 'http://127.0.0.1:8081';
const EXPECTED = process.env.GOOGLE_EXPECTED || 'absent';
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
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  console.log(`\n→ Beklenen durum: Google düğmesi ${EXPECTED === 'present' ? 'GÖRÜNÜR' : 'GİZLİ'}`);

  // --- Giriş ekranı ---
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(7000);
  await shot(page, `60-giris-google-${EXPECTED}`);

  let body = await page.textContent('body');
  check('Giriş ekranı yüklendi', body.includes('Tekrar hoş geldin'), body.slice(0, 150));

  const buttonOnSignIn = page.getByText('Google ile devam et');
  const countSignIn = await buttonOnSignIn.count();

  if (EXPECTED === 'present') {
    check('Giriş ekranında Google düğmesi var', countSignIn > 0);
    check('Ayırıcı "veya" görünüyor', body.includes('veya'), body.slice(0, 200));
  } else {
    check('Yapılandırma yokken Google düğmesi gizli', countSignIn === 0);
    check('Yapılandırma yokken "veya" ayırıcısı da gizli', !body.includes('veya'));
  }

  // --- Kayıt ekranı ---
  await page.getByText('Kayıt ol', { exact: true }).locator('visible=true').first().click();
  await page.waitForTimeout(4000);
  await shot(page, `61-kayit-google-${EXPECTED}`);

  body = await page.textContent('body');
  check('Kayıt ekranı yüklendi', body.includes("PatiMeet'e katıl"));

  const countSignUp = await page.getByText('Google ile devam et').count();
  if (EXPECTED === 'present') {
    check('Kayıt ekranında Google düğmesi var', countSignUp > 0);
  } else {
    check('Kayıt ekranında Google düğmesi gizli', countSignUp === 0);
  }

  // --- Yapılandırma varsa: tıklama ve hata yönetimi ---
  if (EXPECTED === 'present') {
    console.log('\n→ Düğmeye tıklama ve hata yönetimi');

    // E-posta ile kayıt hâlâ çalışıyor mu? (Google eklenmesi bozmamalı)
    const inputs = page.locator('input').locator('visible=true');
    await inputs.nth(0).fill(`google-yanyana${Date.now()}@test.com`);
    await inputs.nth(1).fill('sifre12345');
    const boxes = page.locator('[role="checkbox"]').locator('visible=true');
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).click();
    await page.waitForTimeout(400);
    await shot(page, '62-eposta-kayit-hazir');

    await page.getByText('Hesap oluştur').locator('visible=true').first().click();
    await page.waitForTimeout(8000);
    body = await page.textContent('body');
    check(
      'Google eklenmesine rağmen e-posta ile kayıt çalışıyor',
      body.includes('Kendini tanıt'),
      body.slice(0, 200)
    );

    // Google düğmesine tıklama: bu ortamda accounts.google.com engelli.
    // Beklenen davranış: uygulama çökmesin, kullanıcıya hata bildirilsin
    // veya sekme açılmaya çalışılsın — her hâlükârda sayfa ayakta kalmalı.
    //
    // Önce oturumu temizle: yukarıdaki kayıt sonrası uygulama giriş yapmış
    // durumda ve giriş ekranı gösterilmiyor.
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    await shot(page, '63a-oturum-temiz');

    const googleButton = page.getByText('Google ile devam et').locator('visible=true').first();
    const btnCount = await googleButton.count();
    check('Oturum temizlendikten sonra Google düğmesi görünür', btnCount > 0,
      (await page.textContent('body')).slice(0, 200));
    if (btnCount > 0) {
      await googleButton.click().catch(() => {});
      await page.waitForTimeout(6000);
      await shot(page, '63-google-tiklama-sonrasi');

      // Uygulama hâlâ yanıt veriyor mu?
      const stillAlive = await page.textContent('body');
      check(
        'Google tıklaması sonrası uygulama ayakta',
        stillAlive.length > 50,
        stillAlive.slice(0, 120)
      );
      check(
        'Beyaz ekran / çökme yok',
        stillAlive.includes('PatiMeet') ||
          stillAlive.includes('hoş geldin') ||
          stillAlive.includes('Google'),
        stillAlive.slice(0, 200)
      );
    }
  }

  // Yapılandırma eksikken bile e-posta akışı bozulmamalı
  if (EXPECTED === 'absent') {
    console.log('\n→ Google kapalıyken e-posta girişi');
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(7000);

    const inputs = page.locator('input').locator('visible=true');
    await inputs.nth(0).fill('elif@ornek.com');
    await inputs.nth(1).fill('patimeet123');
    await page.getByText('Giriş yap', { exact: true }).locator('visible=true').first().click();
    await page.waitForTimeout(8000);
    await shot(page, '64-google-kapali-eposta-giris');

    body = await page.textContent('body');
    check('Google kapalıyken e-posta ile giriş çalışıyor', body.includes('Merhaba Elif'), body.slice(0, 200));
  }

  console.log(`\n=== Konsol/sayfa hataları: ${errors.length} ===`);
  for (const e of errors.slice(0, 8)) console.log('  !', e.slice(0, 220));

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
