/**
 * Tüm uçtan uca akışları sırayla çalıştırır.
 *
 * Önkoşullar:
 *   1. API çalışıyor       → cd apps/api && npm run dev
 *   2. Demo veri yüklendi  → cd apps/api && npm run seed
 *   3. Web hedefi çalışıyor → cd apps/mobile && npx expo start --web
 *
 * Ortam değişkenleri:
 *   APP_URL        Uygulama adresi (varsayılan http://127.0.0.1:8081)
 *   CHROMIUM_PATH  Hazır bir Chromium ikilisinin yolu (isteğe bağlı)
 *   SHOT_DIR       Ekran görüntüsü dizini (varsayılan ./screenshots)
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SUITES = [
  ['Temel akışlar (giriş, sekmeler, mesaj, etkinlik oluşturma)', '01-temel-akislar.js'],
  ['Güvenlik ve katılım (şikâyet, engelleme, katıl/ayrıl)', '02-guvenlik-ve-katilim.js'],
  ['Yeni kullanıcı yolculuğu (kayıt → onboarding)', '03-yeni-kullanici.js'],
  // Google akışı: beklenen durum GOOGLE_EXPECTED ile verilir. Varsayılan
  // 'absent' — yapılandırma olmadan düğmenin gizlendiğini doğrular.
  ['Google ile giriş arayüzü', '04-google-giris.js'],
];

let failed = 0;

for (const [title, file] of SUITES) {
  console.log(`\n${'█'.repeat(60)}`);
  console.log(`█ ${title}`);
  console.log('█'.repeat(60));

  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) failed += 1;
}

console.log(`\n${'='.repeat(60)}`);
if (failed === 0) {
  console.log('Tüm uçtan uca akışlar geçti.');
} else {
  console.log(`${failed} akış başarısız.`);
}
console.log('='.repeat(60));

process.exit(failed === 0 ? 0 : 1);
