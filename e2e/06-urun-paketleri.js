// Canlı Yürüyüş izni, Köpeğimin Günlüğü, Mahalle Akışı ve hızlı davet akışları.
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
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  const go = async (path, expect) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    try {
      await page.locator(`text=${expect}`).first().waitFor({ timeout: 30000 });
    } catch {}
    await page.waitForTimeout(2500);
    return page.textContent('body');
  };

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(6000);
  const inputs = page.locator('input');
  await inputs.first().waitFor({ timeout: 30000 });
  await inputs.nth(0).fill('elif@ornek.com');
  await inputs.nth(1).fill('patimeet123');
  await page.getByText('Giriş yap', { exact: true }).first().click();
  await page.waitForTimeout(8000);
  check('Giriş yapıldı', (await page.textContent('body')).includes('Elif'));

  // --- Ana ekran: gerçek veriye bağlı hedef ---
  console.log('\n→ Ana ekran hızlı işlemler');
  const home = await page.textContent('body');
  await shot(page, '60-ana-ekran');
  check('Günlük hedef gerçek veriden geliyor', home.includes('Bugün henüz yürüyüş yok') || /Bugün \d+ dk yürüdünüz/.test(home), home.slice(0, 400));
  check('Yürüyüşe çık kısayolu var', home.includes('Yürüyüşe'), home.slice(0, 400));
  check('Mahalle akışı kısayolu var', home.includes('Mahalle'), home.slice(0, 400));

  // --- Canlı Yürüyüş: konum desteklenmeyen ortamda açık boş durum ---
  console.log('\n→ Canlı Yürüyüş');
  const walk = await go('/live-walk', 'Canlı yürüyüş');
  await shot(page, '61-canli-yuruyus');
  check('Canlı yürüyüş sekmesi açılıyor', walk.includes('Canlı yürüyüş'), walk.slice(0, 200));
  check('Süre/Mesafe/Tempo göstergeleri var', walk.includes('Süre') && walk.includes('Mesafe') && walk.includes('Tempo'));
  check('Başlangıçta sayaç sıfır', walk.includes('00:00:00'), walk.slice(0, 400));
  check('Mesafe sıfırdan başlıyor', walk.includes('0,00 km'), walk.slice(0, 400));
  check('Tempo hesaplanmadan gösterilmiyor', walk.includes('--:--'), walk.slice(0, 400));

  /**
   * Web hedefinde gerçek GPS yok. Ürün bunu sahte veriyle doldurmak yerine
   * açık bir durum olarak göstermeli.
   */
  const startBtn = page.getByRole('button', { name: 'Yürüyüşü başlat' }).first();
  check('Yürüyüşü başlat düğmesi var', (await startBtn.count()) > 0);
  await startBtn.click();
  await page.waitForTimeout(3000);
  const afterStart = await page.textContent('body');
  await shot(page, '62-konum-durumu');
  check(
    'Konum yoksa sahte veri üretilmiyor, durum açıkça gösteriliyor',
    afterStart.includes('Bu cihazda konum takibi yok') || afterStart.includes('Konum izni kapalı'),
    afterStart.slice(0, 500)
  );
  check('Konum olmadan mesafe artmıyor', afterStart.includes('0,00 km'), afterStart.slice(0, 400));

  // --- Köpeğimin Günlüğü ---
  console.log('\n→ Köpeğimin Günlüğü');
  const journal = await go('/journal', 'günlüğü');
  await shot(page, '63-gunluk');
  check('Günlük ekranı açılıyor', journal.includes('günlüğü'), journal.slice(0, 200));
  check('Haftalık aktivite bölümü var', journal.includes('HAFTALIK AKTİVİTE'), journal.slice(0, 600));
  check('Hedef gerçek veriden hesaplanıyor', journal.includes('hedef 150 dk'), journal.slice(0, 800));
  check('Hızlı kayıt girişi var', journal.includes('Kayıt ekle'));
  check('Belgeler girişi var', journal.includes('Belgeler'));
  check('Acil durum kartı girişi var', journal.includes('Acil kart'));

  const addEntry = await go('/journal/add?dogId=x', 'Kayıt türü');
  await shot(page, '64-kayit-ekle');
  check('Kayıt türü listesi geliyor', addEntry.includes('Kayıt türü'), addEntry.slice(0, 200));
  check(
    'İstenen bakım türleri sunuluyor',
    ['Aşı', 'İç parazit', 'Dış parazit', 'İlaç', 'Kilo', 'Tırnak bakımı', 'Diş bakımı'].every((t) =>
      addEntry.includes(t)
    ),
    addEntry.slice(0, 900)
  );

  // Tür seçilince yalnızca o türün alanları çıkmalı (devasa tek form yok).
  await page.getByRole('radio', { name: 'Kilo' }).first().click();
  await page.waitForTimeout(1500);
  const weightForm = await page.textContent('body');
  check('Kilo türünde sayısal alan çıkıyor', weightForm.includes('Kilo (kg)'), weightForm.slice(0, 600));
  check('Kilo türünde hatırlatma alanı yok', !weightForm.includes('Hatırlatma ekle'), weightForm.slice(0, 800));

  await page.getByRole('radio', { name: 'Aşı' }).first().click();
  await page.waitForTimeout(1500);
  const vaccineForm = await page.textContent('body');
  check('Aşı türünde hatırlatma sunuluyor', vaccineForm.includes('Hatırlatma ekle'), vaccineForm.slice(0, 800));
  check('Aşı türünde sayısal alan yok', !vaccineForm.includes('Kilo (kg)'), vaccineForm.slice(0, 800));

  const emergency = await go('/journal/emergency?dogId=x', 'Acil');
  await shot(page, '65-acil-kart');
  check('Acil durum kartı varsayılan olarak özel', emergency.includes('Kart özel'), emergency.slice(0, 600));
  check(
    'Paylaşım yalnızca açık istekle üretiliyor',
    emergency.includes('Paylaşılabilir bağlantı üret'),
    emergency.slice(0, 800)
  );

  // --- Mahalle Akışı ---
  console.log('\n→ Mahalle Akışı');
  const feed = await go('/neighbourhood', 'Semtinde bugün');
  await shot(page, '66-mahalle-akisi');
  check('Akış ekranı açılıyor', feed.includes('Semtinde bugün'), feed.slice(0, 200));
  check('Oyun grupları bölümü var', feed.includes('Oyun grupları'), feed.slice(0, 900));
  check('İçerik türü filtreleri var', feed.includes('Yürüyüş daveti') && feed.includes('Etkinlik') && feed.includes('Güvenli topluluk'), feed.slice(0, 700));
  check('Hızlı davet girişi var', feed.includes('Hızlı yürüyüş daveti aç'));
  check(
    'Akışta kaynak kayıtlar birleşiyor',
    feed.includes('ETKİNLİK') || feed.includes('GÜVENLİ TOPLULUK') || feed.includes('Şu an akışta bir şey yok'),
    feed.slice(0, 900)
  );

  // --- Hızlı yürüyüş daveti oluşturma ---
  console.log('\n→ Hızlı yürüyüş daveti');
  const inviteForm = await go('/neighbourhood/create-invite', 'Ne zaman');
  await shot(page, '67-davet-formu');
  check('Davet formu açılıyor', inviteForm.includes('Ne zaman'), inviteForm.slice(0, 200));
  check('Zaman seçenekleri var', ['Şimdi', '30 dakika içinde', '1 saat içinde'].every((t) => inviteForm.includes(t)), inviteForm.slice(0, 700));
  check('Tempo seçenekleri var', inviteForm.includes('Tempo'), inviteForm.slice(0, 700));
  check('Uygun köpek boyutu sorusu var', inviteForm.includes('Uygun köpek boyutu'));
  check(
    'Kesin adres istenmiyor, yaklaşık bölge soruluyor',
    inviteForm.includes('Yaklaşık bölge') && inviteForm.includes('Kesin adres yazma'),
    inviteForm.slice(0, 900)
  );
  check('Otomatik sona erme bilgisi var', inviteForm.includes('kendiliğinden kapanır'), inviteForm.slice(-600));

  await page.getByRole('radio', { name: 'Şimdi' }).first().click();
  await page.waitForTimeout(500);
  const areaField = page.getByPlaceholder('Örn. Moda sahili civarı').first();
  await areaField.fill('Moda sahili civarı');
  await page.waitForTimeout(400);
  await page.getByText('Daveti yayınla').first().click();
  await page.waitForTimeout(6000);
  await shot(page, '68-davet-detay');
  const detail = await page.textContent('body');
  check('Davet oluşturuldu ve detay açıldı', detail.includes('Hızlı yürüyüş'), detail.slice(0, 400));
  check('Yaklaşık bölge gösteriliyor', detail.includes('Moda sahili civarı'), detail.slice(0, 600));
  check(
    'Kesin buluşma noktası paylaşılmıyor',
    detail.includes('Kesin buluşma noktası davette paylaşılmaz'),
    detail.slice(0, 900)
  );
  check('Sahibi daveti iptal edebiliyor', detail.includes('Daveti iptal et'), detail.slice(0, 900));

  /**
   * Temizlik: açık davet sınırı (3) gerçek bir kural olduğu için test kendi
   * açtığı daveti kapatmalı; yoksa ikinci çalıştırma sınıra takılır.
   */
  const cancelBtn = page.getByRole('button', { name: 'Daveti iptal et' }).first();
  if ((await cancelBtn.count()) > 0) {
    await cancelBtn.click();
    await page.waitForTimeout(4000);
  }
  const afterCancel = await go('/neighbourhood', 'Semtinde bugün');
  check(
    'İptal edilen davet akıştan düşüyor',
    !afterCancel.includes('Moda sahili civarı'),
    afterCancel.slice(0, 600)
  );

  console.log(`\n=== Konsol/sayfa hataları: ${errors.length} ===`);
  for (const e of errors.slice(0, 8)) console.log('  !', e.slice(0, 200));

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
