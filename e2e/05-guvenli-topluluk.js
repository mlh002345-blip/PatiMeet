// Çoklu seçim "Ne arıyorsun?" ve Güvenli Topluluk bildirimleri akışı.
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

  // Giriş: Mert (Beşiktaş) — Elif'in Kadıköy bildirimlerini görmemeli.
  await page.goto(`${BASE}`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(6000);
  const inputs = page.locator('input');
  await inputs.first().waitFor({ timeout: 30000 });
  await inputs.nth(0).fill('mert@ornek.com');
  await inputs.nth(1).fill('patimeet123');
  await page.getByText('Giriş yap', { exact: true }).first().click();
  await page.waitForTimeout(8000);
  const mertHome = await page.textContent('body');
  check(
    'Mert giriş yaptı',
    /Günaydın|İyi günler|İyi akşamlar/.test(mertHome) && mertHome.includes('Mert'),
    mertHome.slice(0, 160)
  );

  // --- Ana sayfada Güvenli Topluluk bölümü ---
  console.log('\n→ Ana sayfa Güvenli Topluluk bölümü');
  const home = await page.textContent('body');
  await shot(page, '50-ana-sayfa');
  /**
   * Ana ekran hızlı işlem kartlarından biri Güvenli Topluluk'a götürür.
   * Ekranda ikinci bir kopya giriş olmamalı.
   */
  check(
    'Güvenli Topluluk hızlı işlem kartı var',
    home.includes('Güvenli') && home.includes('topluluk'),
    home.slice(0, 400)
  );
  const entryCount = await page.evaluate(() =>
    [...document.querySelectorAll('div')].filter((el) =>
      /^güvenli\s*topluluk$/i.test((el.textContent || '').trim())
    ).length
  );
  check('Ana sayfada tek Güvenli Topluluk girişi var', entryCount === 1, `bulunan: ${entryCount}`);

  // --- Çoklu seçim: "Ne arıyorsun?" ---
  console.log('\n→ Profil düzenleme: çoklu seçim');
  const edit = await go('/settings/edit-profile', 'Ne arıyorsun?');
  await shot(page, '51-profil-duzenle');
  check('"Ne arıyorsun?" alanı var', edit.includes('Ne arıyorsun?'), edit.slice(0, 250));
  check('Etkinlik seçeneği eklendi', edit.includes('Etkinlik'));
  const offered = await page.evaluate(() =>
    [...document.querySelectorAll('[role="checkbox"]')].map((el) =>
      (el.getAttribute('aria-label') || '').trim()
    )
  );
  check(
    'Yeni seçim listesinde tam olarak dört başlık var',
    offered.length === 4,
    offered
  );
  check(
    '"Eğitim ve çalışma" yeni seçenek olarak sunulmuyor',
    !offered.includes('Eğitim ve çalışma'),
    offered
  );
  check('Çoklu seçim ipucu gösteriliyor', edit.includes('Birden fazla seçebilirsin'));

  const checkboxes = page.locator('[role="checkbox"]');
  const boxCount = await checkboxes.count();
  check('Seçenekler checkbox rolüyle sunuluyor', boxCount >= 4, `sayı: ${boxCount}`);

  /**
   * Seçim aç/kapa olduğu için test tekrar çalıştırıldığında durumu ezmemeli:
   * "Sosyalleşme" yalnızca seçili değilse işaretlenir. Sonrasında "Oyun
   * buluşması" ile birlikte en az iki seçim kayıtlı olmalı.
   */
  const social = page.getByRole('checkbox', { name: 'Sosyalleşme' }).first();
  if ((await social.getAttribute('aria-checked')) !== 'true') {
    await social.click();
    await page.waitForTimeout(600);
  }

  const play = page.getByRole('checkbox', { name: 'Oyun buluşması' }).first();
  if ((await play.getAttribute('aria-checked')) !== 'true') {
    await play.click();
    await page.waitForTimeout(600);
  }

  const checkedCount = await page.locator('[role="checkbox"][aria-checked="true"]').count();
  check('Aynı anda birden fazla seçim yapılabiliyor', checkedCount >= 2, `seçili: ${checkedCount}`);

  await page.getByText('Değişiklikleri kaydet').first().click();
  await page.waitForTimeout(4000);
  await shot(page, '52-profil-kaydedildi');
  const saved = await page.textContent('body');
  check('Profil kaydedildi', saved.includes('Profilin güncellendi'), saved.slice(0, 250));

  // Kullanıcının seçim etiketleri artık üye kartıyla birlikte /settings altında.
  const settingsProfile = await go('/settings', 'Profil ve ayarlar');
  await shot(page, '53-profil');
  check(
    'Ayarlarda birden fazla seçim etiketi görünüyor',
    settingsProfile.includes('Oyun buluşması') && settingsProfile.includes('Sosyalleşme'),
    settingsProfile.slice(0, 400)
  );

  // --- Bildirim listesi ---
  console.log('\n→ Güvenli Topluluk listesi');
  const list = await go('/alerts', 'Güvenli Topluluk');
  await shot(page, '54-bildirim-listesi');
  check('Bildirim listesi açıldı', list.includes('Güvenli Topluluk'), list.slice(0, 250));
  check('Sekiz tür filtresi listeleniyor', [
    'Kayıp hayvan',
    'Bulunan hayvan',
    'Zehirli yem',
    'Yaralı veya başıboş hayvan',
    'Salgın hastalık uyarısı',
    'Acil kan ihtiyacı',
    'Geçici yuva',
    'Mama veya ulaşım desteği',
  ].every((label) => list.includes(label)), list.slice(0, 600));
  check('Seed bildirimleri görünüyor', list.includes('şüpheli yem') || list.includes('mama desteği'), list.slice(0, 400));
  check('Yaklaşık bölge bölümü taşındı', list.includes('Yaklaşık bölge'), list.slice(0, 600));
  check(
    'Harita kesin konum olmadığını söylüyor',
    list.includes('gerçek adres veya anlık konum değildir'),
    list.slice(0, 900)
  );
  check(
    'Etkinlik sonrası güven bölümü taşındı',
    list.includes('Etkinlik sonrası güven'),
    list.slice(-900)
  );

  // Eski /community bağlantısı yeni ekrana yönlenmeli.
  console.log('\n→ Eski /community bağlantısı');
  await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await shot(page, '54b-community-yonlendirme');
  const redirected = await page.textContent('body');
  check(
    'Eski /community ekranı yeni Güvenli Topluluk ekranına yönlendiriyor',
    redirected.includes('Yaklaşık bölge') && redirected.includes('Bildirim oluştur'),
    redirected.slice(0, 500)
  );
  check(
    'Yönlendirme sonrası eski kayıp ilanı formu görünmüyor',
    !redirected.includes('Kayıp köpek ilanı ver'),
    redirected.slice(0, 500)
  );
  await go('/alerts', 'Güvenli Topluluk');

  // --- Bildirim oluşturma formu ---
  console.log('\n→ Bildirim oluşturma');
  await page.getByText('Bildirim oluştur').first().click();
  await page.waitForTimeout(5000);
  await shot(page, '55-bildirim-formu');
  let form = await page.textContent('body');
  check('Form açıldı', form.includes('Bildirim türü'), form.slice(0, 250));
  check('Kesin konum uyarısı gösteriliyor', form.includes('Kesin konum paylaşma'), form.slice(0, 400));
  check('Yaklaşık bölge alanı var', form.includes('Yaklaşık bölge'));
  check(
    'Uygulama içi mesaj notu var',
    form.includes('uygulama içi mesajla'),
    form.slice(-400)
  );

  // Kayıp hayvan seçilince ad, fotoğraf ve son görülme alanları çıkar.
  /**
   * Rol ile hedefliyoruz: aynı metin bir önceki ekranın (bildirim listesi)
   * filtre çipinde de var ve o ekran gezinme sonrası DOM'da kalıyor. Form
   * seçenekleri `radio`, filtre çipleri `button` rolünde.
   */
  const lostOption = page.getByRole('radio', { name: 'Kayıp hayvan' }).first();
  await lostOption.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await lostOption.click();
  await page.waitForTimeout(2000);
  await shot(page, '56-kayip-hayvan-secildi');
  form = await page.textContent('body');
  check('Hayvanın adı alanı çıktı', form.includes('Hayvanın adı'), form.slice(0, 400));
  check(
    'Fotoğraf alanı isteğe bağlı olarak sunuluyor',
    form.includes('Fotoğraf ekle — isteğe bağlı'),
    form.slice(0, 600)
  );
  check(
    'Kayıp hayvanda fotoğraf tavsiyesi gösteriliyor',
    form.includes('Fotoğraf eklemek bulunmasını kolaylaştırır.'),
    form.slice(0, 800)
  );
  check('Son görülme tarihi alanı çıktı', form.includes('Son görülme tarihi ve saati'), form.slice(0, 500));
  check('Son görüldüğü semt soruluyor', form.includes('Son görüldüğü semt'));

  // Zorunlu alanlar boşken yayınlama engellenir.
  await page.getByText('Bildirimi yayınla').first().click();
  await page.waitForTimeout(2500);
  form = await page.textContent('body');
  check(
    'Eksik zorunlu alanlarla yayınlanamaz',
    form.includes('Hayvanın adını yazın.'),
    form.slice(0, 500)
  );
  check(
    'Fotoğraf eksikliği hata olarak gösterilmiyor',
    !form.includes('En az 1 fotoğraf ekleyin.'),
    form.slice(0, 500)
  );

  // Fotoğraf gerektirmeyen bir tür ile gerçek bir bildirim yayınla.
  console.log('\n→ Fotoğrafsız tür ile yayınlama');
  const supportOption = page.getByRole('radio', { name: 'Mama veya ulaşım desteği' }).first();
  await supportOption.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await supportOption.click();
  await page.waitForTimeout(1500);
  const fields = page.locator('input, textarea');
  const areaField = page.getByPlaceholder('Örn. Yoğurtçu Parkı civarı').first();
  await areaField.fill('Sahil yolu çevresi');
  const descField = page
    .getByPlaceholder('Tasması, tüy rengi, davranışı gibi tanınmasını kolaylaştıran ayrıntıları yaz.')
    .first();
  await descField.fill('Sokak köpekleri için mama topluyoruz, ulaşım desteği de gerekiyor.');
  await page.waitForTimeout(500);
  await shot(page, '57-destek-formu');
  await page.getByText('Bildirimi yayınla').first().click();
  await page.waitForTimeout(6000);
  await shot(page, '58-bildirim-detay');
  const detail = await page.textContent('body');
  check('Bildirim yayınlandı ve detaya gidildi', detail.includes('Sahil yolu çevresi'), detail.slice(0, 500));
  check('Yaklaşık bölge gösteriliyor', detail.includes('Yaklaşık bölge'));
  check(
    'Kesin konum toplanmadığı bilgisi var',
    detail.includes('kesin konum toplanmıyor'),
    detail.slice(0, 600)
  );
  check('Sahibi için çözüldü aksiyonu var', detail.includes('Çözüldü olarak işaretle'), detail.slice(0, 600));

  // --- Başka kullanıcının ilanında mesaj gönder ---
  console.log('\n→ Başka kullanıcının bildiriminde iletişim');
  await go('/alerts', 'Güvenli Topluluk');
  await page.waitForTimeout(1500);
  const canSupport = page.getByText('Sokak köpekleri için mama desteği', { exact: false }).first();
  if ((await canSupport.count()) > 0) {
    await canSupport.click();
    await page.waitForTimeout(5000);
    await shot(page, '59-baskasinin-ilani');
    const other = await page.textContent('body');
    check('Paylaşan bilgisi görünüyor', other.includes('Paylaşan'), other.slice(0, 400));
    check('Mesaj gönder aksiyonu var', other.includes('Mesaj gönder'));
    check('Şikâyet/engelle aksiyonu var', other.includes('Şikâyet et veya engelle'));
    check('Sahibi olmadığı için kaldırma aksiyonu yok', !other.includes('Bildirimi kaldır'));
  } else {
    check('Can’ın destek ilanı listede bulundu', false, 'ilan bulunamadı');
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
