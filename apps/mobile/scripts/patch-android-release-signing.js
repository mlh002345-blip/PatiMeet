#!/usr/bin/env node
/**
 * `expo prebuild` sonrası üretilen android/app/build.gradle dosyasını,
 * release derlemesini debug anahtarı yerine yükleme (upload) anahtarıyla
 * imzalayacak şekilde yamalar.
 *
 * Yalnızca CI'de, Play Store AAB'si için yükleme anahtarı secrets'ta
 * mevcutsa çalıştırılır (bkz. .github/workflows/android-apk.yml → build-aab
 * işi). Beklenen kalıp bulunamazsa (ör. Expo prebuild şablonu değişmişse)
 * sessizce devam etmek yerine hata ile durur — debug anahtarıyla imzalanmış
 * bir mağaza paketi asla sessizce üretilmemeli.
 *
 * gradle.properties içine önceden şu değerler yazılmış olmalı:
 *   MYAPP_UPLOAD_STORE_FILE, MYAPP_UPLOAD_STORE_PASSWORD,
 *   MYAPP_UPLOAD_KEY_ALIAS, MYAPP_UPLOAD_KEY_PASSWORD
 */
const fs = require('node:fs');
const path = require('node:path');

const buildGradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
let source = fs.readFileSync(buildGradlePath, 'utf8');

const debugSigningBlock = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`;

const releaseSigningBlock = `${debugSigningBlock}
        release {
            storeFile file(MYAPP_UPLOAD_STORE_FILE)
            storePassword MYAPP_UPLOAD_STORE_PASSWORD
            keyAlias MYAPP_UPLOAD_KEY_ALIAS
            keyPassword MYAPP_UPLOAD_KEY_PASSWORD
        }`;

if (!source.includes(debugSigningBlock)) {
  console.error(
    'signingConfigs.debug bloğu beklenen biçimde bulunamadı — Expo prebuild şablonu ' +
      'değişmiş olabilir. Yamalanmadı; mağaza paketi güvenlik gereği üretilmeyecek.'
  );
  process.exit(1);
}
source = source.replace(debugSigningBlock, releaseSigningBlock);

// buildTypes.release içindeki `signingConfig signingConfigs.debug` satırını,
// yukarıda eklenen `release` imza yapılandırmasına yönlendir. Yalnızca
// buildTypes.release bloğu içindeki (signingConfigs bloğu içindeki değil)
// ilgili satırı hedeflemek için "release {" işaretinden sonrasını ararız.
const buildTypesReleaseMarker = 'release {\n            // Caution!';
const releaseBlockStart = source.indexOf(buildTypesReleaseMarker);
if (releaseBlockStart === -1) {
  console.error('buildTypes.release bloğu beklenen biçimde bulunamadı.');
  process.exit(1);
}

const debugSigningUsage = 'signingConfig signingConfigs.debug';
const usageIndex = source.indexOf(debugSigningUsage, releaseBlockStart);
if (usageIndex === -1) {
  console.error('buildTypes.release içinde "signingConfig signingConfigs.debug" satırı bulunamadı.');
  process.exit(1);
}

source =
  source.slice(0, usageIndex) +
  'signingConfig signingConfigs.release' +
  source.slice(usageIndex + debugSigningUsage.length);

fs.writeFileSync(buildGradlePath, source);
console.log('build.gradle: release derlemesi yükleme anahtarına yönlendirildi.');
