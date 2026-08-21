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

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/shot-${name}.png` });
}

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
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(`${BASE}`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(6000);

  // --- Giriş ---
  const inputs = page.locator('input');
  await inputs.first().waitFor({ timeout: 30000 });
  await inputs.nth(0).fill('elif@ornek.com');
  await inputs.nth(1).fill('patimeet123');
  await page.getByText('Giriş yap', { exact: true }).first().click();
  await page.waitForTimeout(7000);
  const homeBody = await page.textContent('body');
  // Selamlama saate göre değişiyor; üçünden biri + kullanıcı adı beklenir.
  check(
    'Giriş yapıldı ve Bugün ekranı açıldı',
    /Günaydın|İyi günler|İyi akşamlar/.test(homeBody) && homeBody.includes('Elif'),
    homeBody.slice(0, 160)
  );

  // Sekme yapısını incele
  const tabInfo = await page.evaluate(() => {
    const results = [];
    for (const el of document.querySelectorAll('a,[role="tab"],[role="button"],[href]')) {
      const text = (el.textContent || '').trim();
      if (['Bugün', 'Keşfet', 'Kulüp', 'Mesajlar', 'Pati'].includes(text)) {
        results.push({ tag: el.tagName, role: el.getAttribute('role'), href: el.getAttribute('href'), text });
      }
    }
    return results;
  });
  console.log('  sekme DOM:', JSON.stringify(tabInfo));

  // --- Sekme gezinmesi: expo-router web'de sekmeler <a href> üretir ---
  // Sekme gezinmesi URL üzerinden yapılır: sohbet/etkinlik gibi yığın
  // ekranlarında sekme çubuğu gizli olduğu için tıklama güvenilir değil.
  // Etiketler Privé diline taşındı, route adresleri değişmedi.
  const TAB_URLS = {
    'Bugün': '/home',
    'Keşfet': '/discover',
    'Kulüp': '/events',
    'Mesajlar': '/messages',
    'Pati': '/profile',
  };

  async function goTab(label, expect) {
    await page.goto(`${BASE}${TAB_URLS[label]}`, { waitUntil: 'domcontentloaded' });
    // Dev modda ilk yükleme yavaş; beklenen metin görünene kadar bekle.
    try {
      await page.locator(`text=${expect}`).first().waitFor({ timeout: 30000 });
    } catch {}
    await page.waitForTimeout(2500);
    const text = await page.textContent('body');
    check(`${label} sekmesi açıldı`, text.includes(expect), text.slice(0, 120));
    return text;
  }

  const discover = await goTab('Keşfet', 'Keşfet');
  await shot(page, '10-kesfet');
  check('Keşfet listesinde köpek var', /Karamel|Fındık|Duman|Maya/.test(discover), discover.slice(0, 200));
  check('Keşfet e-posta göstermiyor', !discover.includes('@ornek.com'));

  const events = await goTab('Kulüp', 'Kulüp');
  await shot(page, '11-etkinlikler');
  check('Etkinlik listesinde etkinlik var', /Yoğurtçu|yürüyüş|Yürüyüş/.test(events));

  const messages = await goTab('Mesajlar', 'Mesajlar');
  await shot(page, '12-mesajlar');
  check('Konuşma listesi görünüyor', /Mert|Cumartesi|okunmamış/.test(messages), messages.slice(0, 250));

  const profile = await goTab('Pati', 'Profil');
  await shot(page, '13-profil');
  check('Profilde kullanıcı adı var', profile.includes('Elif'));
  check('Profilde köpek var', profile.includes('Pati'));
  check('Yasal metin bağlantıları var', profile.includes('Kullanıcı Sözleşmesi'));
  check('Hesap silme mevcut', profile.includes('Hesabımı sil'));

  // --- Sohbet akışı ---
  console.log('\n→ Sohbet akışı');
  await goTab('Mesajlar', 'Mesajlar');
  const convo = page.locator('text=Mert').first();
  if ((await convo.count()) > 0) {
    await convo.click();
    await page.waitForTimeout(5000);
    await shot(page, '14-sohbet');
    const chat = await page.textContent('body');
    check('Sohbet açıldı', /Mesaj yaz|Cumartesi|Merhaba/.test(chat), chat.slice(0, 200));

    // Mesaj gönder
    const composer = page.locator('textarea, input').last();
    await composer.fill('Playwright testinden merhaba! Cumartesi 10:00 uygun.');
    await page.waitForTimeout(500);
    await shot(page, '15-sohbet-yazildi');
    // Gönder butonu
    // Simge değişse de kırılmasın diye erişilebilir ada göre hedefliyoruz.
    await page.getByRole('button', { name: 'Gönder' }).first().click();
    await page.waitForTimeout(4000);
    await shot(page, '16-sohbet-gonderildi');
    const after = await page.textContent('body');
    check('Mesaj gönderildi ve listede göründü', after.includes('Playwright testinden merhaba'), after.slice(-300));
  } else {
    check('Sohbet açılabildi', false, 'konuşma bulunamadı');
  }

  // --- Etkinlik oluşturma akışı ---
  console.log('\n→ Etkinlik oluşturma');
  await goTab('Kulüp', 'Kulüp');
  /**
   * Etkinlik oluşturma girişi Privé düzeninde üst başlıktaki ikon eylemi.
   * Erişilebilir ada göre hedefliyoruz; böylece ikon değişse de test kırılmaz
   * ama eylem tamamen kaybolursa yüksek sesle hata verir.
   *
   * DİKKAT: burada koşullu atlama YOK. Eskiden `if (count > 0)` vardı ve
   * düğme kaybolduğunda akışın tamamı sessizce atlanıyordu.
   */
  const createBtn = page.getByRole('button', { name: 'Yürüyüş planla' }).first();
  check('Yürüyüş planlama girişi var', (await createBtn.count()) > 0);
  {
    await createBtn.click();
    await page.waitForTimeout(5000);
    await shot(page, '17-etkinlik-olustur');
    const form = await page.textContent('body');
    check('Etkinlik oluşturma formu açıldı', form.includes('Buluşma noktası'), form.slice(0, 200));

    // Formu doldur
    const formInputs = page.locator('input, textarea');
    const count = await formInputs.count();
    console.log(`  form alanı sayısı: ${count}`);

    await formInputs.nth(0).fill('Playwright test yürüyüşü');
    // Buluşma noktası ve kontenjan alanlarını bul
    for (let i = 0; i < count; i++) {
      const ph = await formInputs.nth(i).getAttribute('placeholder');
      if (ph && ph.includes('ana girişi')) await formInputs.nth(i).fill('Parkın ana girişi, bilgi panosu önü');
    }
    await page.waitForTimeout(500);
    await shot(page, '18-form-dolu');

    await page.getByText('Etkinliği oluştur').first().click();
    await page.waitForTimeout(6000);
    await shot(page, '19-etkinlik-detay');
    const detail = await page.textContent('body');
    check(
      'Etkinlik oluşturuldu ve detay açıldı',
      detail.includes('Playwright test yürüyüşü') && detail.includes('Katılımcılar'),
      detail.slice(0, 250)
    );
    check('Detayda güvenlik uyarısı var', detail.includes('Güvenli buluşma'));
  }

  // --- Keşfet → profil detayı ---
  console.log('\n→ Profil detayı ve güvenlik paneli');
  await goTab('Keşfet', 'Keşfet');
  const dogCard = page.locator('text=Karamel').first();
  if ((await dogCard.count()) > 0) {
    await dogCard.click();
    await page.waitForTimeout(5000);
    await shot(page, '20-profil-detay');
    const detail = await page.textContent('body');
    check('Profil detayı açıldı', detail.includes('Sahibi'), detail.slice(0, 200));
    check('Mesaj gönder aksiyonu var', detail.includes('Mesaj gönder'));

    // Güvenlik paneli
    const safety = page.getByText('Şikâyet et veya engelle').first();
    if ((await safety.count()) > 0) {
      await safety.click();
      await page.waitForTimeout(2500);
      await shot(page, '21-guvenlik-paneli');
      const sheet = await page.textContent('body');
      check('Güvenlik alt paneli açıldı', sheet.includes('Şikâyet et') && sheet.includes('engelle'));

      await page.getByText('Şikâyet et', { exact: true }).last().click();
      await page.waitForTimeout(2000);
      await shot(page, '22-sikayet-formu');
      const report = await page.textContent('body');
      check('Şikâyet nedenleri listelendi', report.includes('Taciz') || report.includes('Sahte profil'));
    }
  }

  // --- Yasal metin ---
  console.log('\n→ Yasal metinler');
  await goTab('Pati', 'Profil');
  const terms = page.getByText('Kullanıcı Sözleşmesi', { exact: true }).first();
  if ((await terms.count()) > 0) {
    await terms.click();
    await page.waitForTimeout(4000);
    await shot(page, '23-sozlesme');
    const doc = await page.textContent('body');
    check('Kullanıcı Sözleşmesi açıldı', doc.includes('Hesap') && doc.length > 500, doc.slice(0, 150));
  }

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
