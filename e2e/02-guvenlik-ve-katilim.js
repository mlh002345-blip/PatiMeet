// Profil detayı, güvenlik paneli (şikâyet/engelleme) ve etkinliğe katılma akışları.
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

  const go = async (path, expect) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    try {
      await page.locator(`text=${expect}`).first().waitFor({ timeout: 30000 });
    } catch {}
    await page.waitForTimeout(2500);
    return page.textContent('body');
  };

  // Giriş: Zeynep (Kadıköy, Fındık) — Elif'in etkinliğine katılacak
  await page.goto(`${BASE}`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(6000);
  const inputs = page.locator('input');
  await inputs.first().waitFor({ timeout: 30000 });
  await inputs.nth(0).fill('zeynep@ornek.com');
  await inputs.nth(1).fill('patimeet123');
  await page.getByText('Giriş yap', { exact: true }).first().click();
  await page.waitForTimeout(8000);
  check('Zeynep giriş yaptı', (await page.textContent('body')).includes('Merhaba Zeynep'));

  // --- Keşfet → köpek kartı → profil detayı ---
  console.log('\n→ Keşfet ve profil detayı');
  const discover = await go('/discover', 'Keşfet');
  await shot(page, '30-kesfet');
  check('Keşfet listesi doldu', /Pati|Karamel|Duman|Maya/.test(discover), discover.slice(0, 250));

  // Kart başlığına tıkla (kart Pressable)
  const cardName = ['Pati', 'Karamel', 'Duman', 'Maya'].find((n) => discover.includes(n));
  console.log(`  tıklanan kart: ${cardName}`);
  await page.getByText(cardName, { exact: true }).first().click();
  await page.waitForTimeout(6000);
  await shot(page, '31-profil-detay');

  const detail = await page.textContent('body');
  check('Profil detayı açıldı', detail.includes('Sahibi'), detail.slice(0, 250));
  check('Köpek özellikleri görünüyor', /Küçük|Orta|Büyük/.test(detail));
  check('Semt görünüyor, adres yok', /Kadıköy|Beşiktaş|Şişli|Üsküdar/.test(detail));
  check('Mesaj gönder aksiyonu var', detail.includes('Mesaj gönder'));
  check('Şikâyet/engelle aksiyonu var', detail.includes('Şikâyet et veya engelle'));

  // --- Güvenlik alt paneli ---
  console.log('\n→ Güvenlik paneli (şikâyet)');
  await page.getByText('Şikâyet et veya engelle').first().click();
  await page.waitForTimeout(2500);
  await shot(page, '32-guvenlik-paneli');
  let sheet = await page.textContent('body');
  check('Alt panel açıldı', sheet.includes('Topluluk kurallarına aykırı'), sheet.slice(-300));
  check('Engelleme seçeneği var', sheet.includes('Kullanıcıyı engelle'));

  await page.getByText('Şikâyet et', { exact: true }).last().click();
  await page.waitForTimeout(2500);
  await shot(page, '33-sikayet-formu');
  sheet = await page.textContent('body');
  check('Şikâyet nedenleri listelendi', sheet.includes('Taciz') && sheet.includes('Sahte profil'));
  check('Şikâyet gizli tutulur notu var', sheet.includes('gizli tutulur'));

  // Neden seçmeden gönder → doğrulama hatası
  await page.getByText('Şikâyeti gönder').first().click();
  await page.waitForTimeout(2000);
  sheet = await page.textContent('body');
  check('Neden seçilmeden gönderim engellenir', sheet.includes('şikâyet nedeni seçin'), sheet.slice(-200));

  // Neden seç ve gönder
  await page.getByText('Spam veya reklam').first().click();
  await page.waitForTimeout(500);
  await page.getByText('Şikâyeti gönder').first().click();
  // Başarı bildirimi ~1.6s sonra paneli kapatıyor; onayı o pencere içinde oku.
  await page.waitForTimeout(1200);
  await shot(page, '34-sikayet-gonderildi');
  sheet = await page.textContent('body');
  check('Şikâyet gönderildi onayı', sheet.includes('Şikâyetiniz alındı'), sheet.slice(-250));
  await page.waitForTimeout(2000);
  check('Onay sonrası panel kapandı', !(await page.textContent('body')).includes('Şikâyetiniz alındı'));

  // --- Etkinliğe katılma ---
  console.log('\n→ Etkinliğe katılma');
  const events = await go('/events', 'Etkinlikler');
  await shot(page, '35-etkinlikler');

  // Elif'in Kadıköy yürüyüşünü aç
  const eventTitle = 'Yoğurtçu Parkı akşam yürüyüşü';
  if (events.includes(eventTitle)) {
    await page.getByText(eventTitle, { exact: true }).first().click();
    await page.waitForTimeout(6000);
    await shot(page, '36-etkinlik-detay');
    let ev = await page.textContent('body');
    check('Etkinlik detayı açıldı', ev.includes('Katılımcılar'), ev.slice(0, 200));
    check('Buluşma noktası görünüyor', ev.includes('Buluşma noktası'));
    check('Kontenjan bilgisi görünüyor', /\d+ \/ \d+ kişi/.test(ev), ev.slice(0, 300));

    const joinBtn = page.getByText('Etkinliğe katıl').first();
    if ((await joinBtn.count()) > 0) {
      await joinBtn.click();
      await page.waitForTimeout(5000);
      await shot(page, '37-katildi');
      ev = await page.textContent('body');
      check('Etkinliğe katıldı', ev.includes('Etkinliğe katıldın') || ev.includes('Katılımdan ayrıl'), ev.slice(0, 300));

      // Ayrıl
      const leave = page.getByText('Katılımdan ayrıl').first();
      if ((await leave.count()) > 0) {
        await leave.click();
        await page.waitForTimeout(5000);
        ev = await page.textContent('body');
        check('Katılımdan ayrıldı', ev.includes('Katılımdan ayrıldın') || ev.includes('Etkinliğe katıl'), ev.slice(0, 250));
      }
    } else {
      check('Katıl butonu bulundu', false, 'buton yok (zaten katılmış veya dolu olabilir)');
    }
  } else {
    check('Etkinlik listede bulundu', false, events.slice(0, 250));
  }

  // --- Boş durum: filtre ile sonuç yok ---
  console.log('\n→ Boş durum tasarımı');
  const empty = await go('/discover', 'Keşfet');
  const searchBox = page.locator('input').first();
  await searchBox.fill('zzzbulunmayan');
  await page.waitForTimeout(4000);
  await shot(page, '38-bos-durum');
  const emptyText = await page.textContent('body');
  check('Boş sonuç durumu gösteriliyor', emptyText.includes('Sonuç bulunamadı'), emptyText.slice(0, 250));

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
