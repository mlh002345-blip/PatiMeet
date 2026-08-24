# PatiMeet — Yayın Rehberi

Bu belge, PatiMeet'i gerçek kullanıcılara açmak için gereken adımları sırayla
anlatır: veritabanı, obje depolama, kimlik sağlayıcıları, bildirimler,
moderasyon paneli ve mağaza gönderimi.

Gereksinim: Node 22+.

---

## 1. Genel mimari

```
┌──────────────────────┐        ┌────────────────────────┐
│  Mobil uygulama      │  HTTPS │  API (Node/Express)    │
│  iOS + Android       ├───────►│  /api/*                │
│  Expo / React Native │        │  /admin  (moderasyon)  │
└──────────────────────┘        │  /legal  (yasal metin) │
         │                      └───────┬────────────────┘
         │ Expo Push                    │
         ▼                              ├──► PostgreSQL (yönetilen)
   APNs / FCM                           └──► S3 uyumlu obje deposu
```

Tek API süreci hem mobil uygulamaya, hem moderasyon paneline, hem de herkese
açık yasal metinlere hizmet eder. Yatay ölçeklenebilir (durum veritabanında).

---

## 2. PostgreSQL

### 2.1 Sağlayıcı seçimi

Yönetilen bir PostgreSQL kullanın; yedekleme ve yükseltmeyi sağlayıcı üstlenir.

| Sağlayıcı | Not |
|---|---|
| Neon | Sunucusuz, otomatik ölçekleme. Havuzlanmış bağlantı adresi kullanın. |
| Supabase | PostgreSQL + hazır yönetim arayüzü. |
| AWS RDS / Aurora | Kurumsal; VPC ve yedekleme politikası tam kontrol. |
| Railway / Render | Basit kurulum, küçük ölçek için yeterli. |

`DATABASE_URL` değerini `.env` dosyasına yazın:

```
DATABASE_URL=postgresql://kullanici:sifre@host:5432/patimeet?sslmode=require
```

TLS: adres `sslmode=` içeriyorsa veya host yerel değilse sürücü TLS kullanır.

### 2.2 Havuz boyutu

Sunucusuz veya pgbouncer arkasındaki bağlantılarda `DATABASE_POOL_SIZE` düşük
tutulmalı (2–5). Kendi sunucunuz varsa 10–20 uygundur.

### 2.3 Migration

Şema, sürüm izlemeli migration'larla yönetilir (`schema_migrations` tablosu).
Her migration bir kez çalışır ve kendi işlemi içindedir.

```bash
cd apps/api
npm run migrate     # bekleyen migration'ları uygular
```

Sunucu açılışta da aynı işi yapar (`MIGRATE_ON_BOOT=true`, varsayılan).
**Birden fazla sunucu örneği çalıştırıyorsanız** `MIGRATE_ON_BOOT=false` yapın
ve migration'ı deployment akışında tek adımda çalıştırın; aksi halde örnekler
aynı anda migration uygulamaya çalışır.

Yeni migration eklerken: `apps/api/src/db/migrations.ts` dizisine yeni bir
kayıt ekleyin. **Yayınlanmış bir migration'ı asla değiştirmeyin** — mevcut
veritabanları onu yeniden uygulamaz.

`0006_multi_purpose_and_community_alerts` mevcut veri üzerinde çalışır:
tek seçimli `users.purpose` değerleri yeni `users.purposes` dizisine kopyalanır.
Eski kolon **silinmez** ve yazma sırasında ilk seçimle güncellenmeye devam eder;
sürümü geri almanız gerekirse veri yerinde durur. Geçiş `cardinality` kontrolü
sayesinde tekrar çalıştırılsa bile sonradan yapılmış çoklu seçimleri ezmez.

`0009_merge_lost_dog_posts_into_alerts` eski `lost_dog_posts` kayıtlarını
birleşik `community_alerts` yapısına taşır: köpeğin adı, semt, son görülen
yaklaşık bölge, açıklama, sahibi ve zaman damgaları korunur; köpeğin profil
fotoğrafı ilanın ilk fotoğrafı olur; `found` kayıtları `resolved` olur.
Taşınan her kayıt `source_lost_dog_id` ile işaretlendiği ve ekleme
`NOT EXISTS` koşuluyla yapıldığı için geçiş **tekrar çalıştırılabilir** —
ikinci kez çalışsa da çift kayıt üretmez. Kaynak tablo silinmez.

`0010_walks_journal_and_neighbourhood` yalnızca yeni tablo ve kolon ekler
(yürüyüşler ve rota noktaları, günlük kayıtları, sağlık belgeleri, anılar,
acil durum kartı, hızlı yürüyüş davetleri, oyun grupları, analitik olayları ve
`notification_preferences` için `care`/`invites` kolonları). Mevcut hiçbir
tabloyu değiştirmez; `IF NOT EXISTS` kullandığı için tekrar çalıştırılabilir.

**Yeni izinler:** mobil uygulama konum iznini yalnızca kullanıcı yürüyüş
başlattığında ister. Mağaza gönderiminde iOS için `NSLocationWhenInUseUsageDescription`
ve Android için `ACCESS_FINE_LOCATION` açıklamalarının Expo yapılandırmasında
bulunması gerekir.

### 2.4 Yedekleme

- **Sağlayıcı yedeği:** günlük otomatik yedek + noktaya dönüş (PITR) açın.
  Neon ve Supabase bunu varsayılan sunar; RDS'de `backup_retention_period`
  en az 7 gün olmalı.
- **Kendi yedeğiniz:** kritik veri için sağlayıcıdan bağımsız bir kopya
  bulundurmak iyi bir alışkanlıktır:

  ```bash
  pg_dump "$DATABASE_URL" --format=custom --file=patimeet-$(date +%F).dump
  ```

  Bunu günlük çalışan bir görevle nesne depolamaya yükleyin ve **geri yüklemeyi
  en az bir kez deneyin** — test edilmemiş yedek yedek değildir:

  ```bash
  pg_restore --clean --if-exists --dbname="$TEST_DATABASE_URL" patimeet-2026-08-17.dump
  ```

- **Saklama:** KVKK veri minimizasyonu gereği yedekleri süresiz tutmayın;
  30–90 gün makul bir aralıktır. Hesap silme talepleri yedeklerden de
  temizlenmelidir (yedek döngüsü tamamlandığında doğal olarak düşer; gizlilik
  politikasında bu süre belirtilmelidir).

---

## 3. Obje depolama (fotoğraflar)

Profil, köpek ve Güvenli Topluluk bildirimi fotoğrafları S3 uyumlu bir depoda
tutulur (`user_photo`, `dog_photo`, `alert_photo` anahtar önekleri). `local`
sürücü yalnızca geliştirme içindir (birden fazla sunucuda paylaşılmaz).

Bir kayıp hayvan ilanı 5 fotoğrafa kadar taşıyabildiği için kova boyutu
tahmininde ilan başına ~5 görsel hesaplayın.

### 3.1 Kova oluşturma

Cloudflare R2 örneği (yumurta maliyeti düşük, çıkış ücreti yok):

1. R2 > Create bucket → `patimeet-media`
2. R2 API token oluştur (Object Read & Write)
3. `.env`:

```
STORAGE_DRIVER=s3
S3_BUCKET=patimeet-media
S3_ENDPOINT=https://<hesap-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

AWS S3 için `S3_ENDPOINT` boş bırakılır ve `S3_REGION` gerçek bölge olur
(`eu-central-1`).

### 3.2 Erişim modeli — iki seçenek

| | Kova özel (önerilen) | Genel + CDN |
|---|---|---|
| Ayar | `S3_PUBLIC_BASE_URL` boş | `S3_PUBLIC_BASE_URL=https://cdn...` |
| Adres | Süreli imzalı (varsayılan 1 saat) | Kalıcı |
| Gizlilik | Adres sızsa bile süre dolar | Adres bilen herkes erişir |
| Maliyet | Her görüntülemede imza üretimi | CDN önbelleği, daha hızlı |

Kova **asla dizin listelemeye açık olmamalı**. Anahtarlar rastgele UUID
içerir, tahmin edilemez.

### 3.3 Güvenlik notları

Uygulama tarafında zaten sağlanan korumalar:

- Dosya türü, istemcinin bildirdiği `content-type` değil **gerçek dosya
  imzası** ile doğrulanır (JPEG/PNG/WebP/HEIC)
- Boyut sınırı (`MAX_UPLOAD_BYTES`, varsayılan 5 MB)
- Bir kullanıcı başkasının görselini profiline bağlayamaz veya silemez
- İstemciden rastgele bir adres `photoUrl` olarak yazılamaz
- Hesap silmede kullanıcının tüm görselleri depodan kaldırılır

---

## 4. Kimlik sağlayıcıları

### 4.1 Google ile Giriş

Google Cloud Console > APIs & Services > Credentials:

| İstemci türü | Ayar |
|---|---|
| iOS | Bundle ID `com.patimeet.app` |
| Android | Package `com.patimeet.app` + imzalama sertifikası SHA-1 |
| Web | Yalnızca `expo start --web` önizlemesi için |

Sunucu (`apps/api/.env`):
```
GOOGLE_IOS_CLIENT_ID=...
GOOGLE_ANDROID_CLIENT_ID=...
```
İstemci (`apps/mobile/.env`): aynı değerler `EXPO_PUBLIC_` ön ekiyle.

Hepsi boşsa Google ile giriş kapalıdır ve düğme gösterilmez.

### 4.2 Apple ile Giriş — iOS gönderimi için zorunlu

Apple, üçüncü taraf girişi (Google) sunan uygulamalardan Apple ile Giriş'i de
sunmasını ister. Eksikse App Store incelemesi reddedilir.

1. Apple Developer > Certificates, Identifiers & Profiles > Identifiers
2. App ID `com.patimeet.app` > Capabilities > **Sign In with Apple** işaretle
3. Sunucu: `APPLE_BUNDLE_ID=com.patimeet.app`
4. İstemcide ek anahtar gerekmez (`app.json` içinde `usesAppleSignIn: true`)

Android'de Apple düğmesi gösterilmez (platform desteklemez); orada Google ve
e-posta seçenekleri yeterlidir.

---

## 5. Push bildirimleri

Expo Push kullanılıyor: tek uçtan hem APNs hem FCM.

### 5.1 EAS projesi

```bash
cd apps/mobile
npx eas init          # app.json içine extra.eas.projectId yazar
```

Bu kimlik olmadan cihaz jetonu üretilemez ve uygulama sessizce bildirimsiz
çalışır.

### 5.2 Sağlayıcı kimlik bilgileri

```bash
npx eas credentials
```

- **iOS:** EAS, APNs anahtarını sizin için oluşturup yönetebilir.
- **Android:** Firebase projesi açın, **FCM V1 servis hesabı anahtarını**
  indirip EAS'a yükleyin. Bu adım yapılmazsa Android'e bildirim gitmez.

### 5.3 Sunucu

```
PUSH_DRIVER=expo
EXPO_ACCESS_TOKEN=      # Expo'da "Enhanced Security" açıksa zorunlu
```

`PUSH_DRIVER=none` gönderimi kapatır; cihaz jetonları yine kaydedilir.

### 5.4 Davranış

- Bildirim izni verilmezse uygulama normal çalışır
- Jeton her açılışta yenilenir; sunucu aynı jetonu günceller
- Gönderim anında `DeviceNotRegistered` dönen jeton hemen iptal edilir; bazı
  kalıcı hatalar yalnızca **receipt** aşamasında ortaya çıkar — sunucu, süreç
  içinde 15 dakikada bir bekleyen receipt'leri Expo'dan sorgulayıp aynı
  şekilde iptal eder (`domain/push.ts#reconcilePushReceipts`)
- Aynı olayı yeniden tetikleyen bir istek (ör. istemcinin bir güncellemeyi
  tekrar göndermesi) kısa bir pencerede tekilleştirilir; katılımcıya iki kez
  bildirim gitmez
- Oturum kapatmada jeton silinir (bildirim eski hesaba gitmez)
- Kullanıcı kategori tercihlerini uygulama içinden yönetir; güvenlik
  bildirimleri tercihten bağımsız gönderilir

---

## 6. Moderasyon paneli

Panel API ile aynı süreçte çalışır: `https://<api-adresi>/admin`

### 6.1 İlk yönetici

İki yol var:

```bash
# Yol 1 — komut satırı (önerilen)
cd apps/api
npm run create-admin -- moderator@patimeet.app "GucluSifre123" "Moderatör"

# Yol 2 — ilk açılışta otomatik (.env)
ADMIN_BOOTSTRAP_EMAIL=moderator@patimeet.app
ADMIN_BOOTSTRAP_PASSWORD=GucluSifre123
```

Bootstrap değişkenleri yalnızca hiç yönetici yokken çalışır; panel açıldıktan
sonra kaldırın.

### 6.2 Yetenekler

- Bekleyen şikâyetleri görme ve inceleme (açık / inceleniyor / çözüldü)
- Kullanıcı arama; pasife alma, geri açma, verilerini silme
- Etkinlik arama; kaldırma ve geri alma
- Köpek profilini gizleme
- Tüm işlemlerin denetim kaydı (kim, ne zaman, hangi kayıt)

### 6.3 Güvenlik

- Oturum: imzalı, `HttpOnly`, `SameSite=Lax` çerez; yayında `Secure`
- Panel yöneticileri uygulama kullanıcılarından ayrı tablodadır
- `noindex, nofollow` başlığı; arama motorlarına düşmez
- Otomasyon için ayrı `x-admin-token` API'si (`/api/admin/*`)

Panelin herkese açık internete çıkmasını istemiyorsanız ters vekilde `/admin`
yolunu IP ile kısıtlayın.

---

## 7. Sunucuyu çalıştırma

```bash
cd apps/api
npm ci
npm run build        # TypeScript → dist/
npm run migrate      # şemayı güncelle
npm start            # dist/server.js
```

### 7.1 Sağlık kontrolleri

| Uç | Amaç | Kullanım |
|---|---|---|
| `GET /health` | Canlılık — süreç ayakta mı | Yük dengeleyici / konteyner |
| `GET /ready`  | Hazır olma — veritabanı sorgu alıyor mu | Deployment kapısı |

`/ready` yanıtı ayrıca hangi altyapının etkin olduğunu bildirir:

```json
{"ok":true,"checks":{"database":"ok","storage":"s3","push":"expo",
 "googleSignIn":"enabled","appleSignIn":"enabled"}}
```

Yeni sürümü trafiğe almadan önce `/ready` 200 dönmesini bekleyin.

### 7.2 Düzgün kapanma

Süreç `SIGTERM` aldığında süren istekleri bitirir ve veritabanı havuzunu
kapatır (10 saniye üst sınır). Deployment sırasında yarım işlem kalmaz.

### 7.3 Ters vekil arkasında

```
TRUST_PROXY=true
```

Bu olmadan hız sınırı tüm istekleri tek IP sanır.

### 7.4 Günlükler

Production'da JSON satırları basılır; bulut sağlayıcıları doğrudan ayrıştırır.
Kişisel veri redakte edilir (e-posta, mesaj gövdesi, jetonlar). Kullanıcı
kimlikleri (UUID) tanılama için tutulur.

`LOG_LEVEL` ile ayarlanır: `debug | info | warn | error | silent`.

### 7.5 Hız sınırı

Üç pencere: genel API, kimlik uçları (kaba kuvvete karşı sıkı) ve yazma
işlemleri. Anahtar oturum açmış kullanıcının kimliği, yoksa IP'dir (IPv6 alt
ağa normalize edilir). Değerler `.env` ile ayarlanır.

---

## 8. Mobil derleme

```bash
cd apps/mobile
npm ci

# JS paketlerini doğrula (mağaza derlemesi öncesi hızlı kontrol)
npx expo export --platform ios --platform android

# Mağaza derlemeleri
npx eas build --platform ios
npx eas build --platform android
```

`apps/mobile/.env` içinde `EXPO_PUBLIC_API_URL` yayın API adresine ayarlı
olmalı; aksi halde uygulama `localhost` arar.

Sürüm artırma: `app.json` içinde `version`, iOS için `ios.buildNumber`,
Android için `android.versionCode`.

### 8.1 EAS olmadan Android — GitHub Actions (`.github/workflows/android-apk.yml`)

Ağ politikası EAS'a (`api.expo.dev`) veya Android SDK dağıtımına
(`dl.google.com`) erişimi kapattığında Android derlemesi GitHub
çalıştırıcısında yapılır. Çalıştırıcıda Android SDK hazır geldiği için ek
kimlik bilgisi veya bulut servisi gerekmez. İş akışı dört işten oluşur:

| İş | Ne zaman çalışır | Ne yapar |
|---|---|---|
| `checks` | her push, her pull request | API typecheck, `npm run test:all` (tüm API test paketleri), mobil typecheck, sürüm/versionCode tutarlılık kontrolü |
| `e2e` | her push, her pull request (`checks` sonrası) | API'yi ve web hedefini arka planda başlatıp `e2e/` altındaki uçtan uca akışları çalıştırır |
| `build-apk` | yalnız elle (`workflow_dispatch`) veya `android-v*` etiketiyle | iç test APK'sı — `checks` **ve** `e2e` başarılı olmadan çalışmaz |
| `build-aab` | yalnız `android-v*` etiketiyle, yükleme anahtarı secrets'ta varsa | imzalı Play Store AAB'si |

**Önemli:** `checks` veya `e2e` başarısız olursa hiçbir derleme işi çalışmaz —
testlerden biri kırmızıysa APK/AAB üretilmez. Sıradan bir dal push'u yalnızca
testleri çalıştırır; APK/AAB üretmek için Actions sekmesinden iş akışını elle
tetiklemek veya `android-v1.0.1` gibi bir etiket push etmek gerekir. Bu, her
küçük commit'te gereksiz ~15 dakikalık Gradle derlemesi yapılmasını önler.

Akış (her iki derleme işi için): `npm ci` → `expo prebuild --platform android`
→ `gradlew assembleRelease` / `bundleRelease`. `android/` klasörü depoda
tutulmaz, her derlemede yeniden üretilir. Üretilen dosyanın yanına bir
`.sha256` özet dosyası da eklenir; dosya adı sürüm ve commit SHA'sını taşır:
`PatiMeet-<sürüm>-vc<versionCode>-<commit>.apk` (30 gün saklanır) veya
`...aab` (90 gün saklanır).

#### İç test APK'sı — mağaza sürümü değildir

`build-apk` işi React Native şablonunun debug anahtarıyla imzalar; yalnızca
yan yükleme (sideload) ve iç test içindir:

- Cihazda farklı bir anahtarla imzalanmış eski bir PatiMeet varsa, imza
  uyuşmadığı için önce onu kaldırmak gerekir.

#### Play Store AAB'si — imzalı, yalnız secrets varsa üretilir

`build-aab` işi yalnızca aşağıdaki dört GitHub Actions secret'ı **hepsi**
tanımlıysa çalışır; biri bile eksikse iş uyarı bırakıp atlanır — debug
anahtarıyla mağaza paketi hiçbir koşulda üretilmez:

| Secret adı | İçerik |
|---|---|
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | Yükleme keystore dosyasının (`.jks`) base64 kodlanmış hâli (`base64 -w0 upload-keystore.jks`) |
| `ANDROID_UPLOAD_STORE_PASSWORD` | Keystore parolası |
| `ANDROID_UPLOAD_KEY_ALIAS` | Anahtar takma adı |
| `ANDROID_UPLOAD_KEY_PASSWORD` | Anahtar parolası |

Yükleme keystore'unu oluşturma (bir kez, yerel makinede):

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Bu dosyayı ve parolalarını güvenli bir yerde saklayın — kaybedilirse aynı
uygulamaya güncelleme yayınlanamaz. Secrets, repo Settings → Secrets and
variables → Actions altından eklenir; değerleri hiçbir zaman koda veya bu
dokümana yazılmaz.

`build.gradle` release imzasını yükleme anahtarına yönlendirme işlemi
`apps/mobile/scripts/patch-android-release-signing.js` betiğiyle yapılır;
beklenen Expo şablonu bulunamazsa (ör. Expo bir SDK sürümünde şablonu
değiştirirse) betik sessizce geçmez, açık hata ile durur.

---

## 9. Mağaza gönderim kontrol listesi

### 9.1 Her iki mağaza

- [ ] `EXPO_PUBLIC_API_URL` yayın adresine ayarlı
- [ ] Gizlilik politikası herkese açık bir adreste:
      `https://<api-adresi>/legal/privacy.html`
- [ ] Kullanım koşulları erişilebilir: `/legal/terms.html`
- [ ] Topluluk kuralları erişilebilir: `/legal/community.html`
- [ ] Uygulama içinden hesap silme çalışıyor (Profil > Hesabımı sil)
- [ ] Yasal metinler hukuk onayından geçti
- [ ] Destek e-postası (`SUPPORT_EMAIL`) izleniyor
- [ ] Uygulama simgesi ve açılış görselleri son hâlinde
- [ ] Ekran görüntüleri gerçek veriyle hazırlandı
- [ ] Yaş sınırı 18+ olarak işaretlendi (uygulama yetişkinlere yönelik)

### 9.2 App Store (iOS)

- [ ] **Apple ile Giriş çalışıyor** — Google sunuluyorsa zorunlu
- [ ] `ITSAppUsesNonExemptEncryption: false` (ayarlı)
- [ ] Fotoğraf ve bildirim izin metinleri Türkçe ve açıklayıcı (ayarlı)
- [ ] App Privacy formu dolduruldu. Toplanan veriler:
      e-posta (hesap), ad, kabaca konum yok — **yalnızca kullanıcının
      seçtiği semt**, fotoğraflar, kullanıcı içeriği (mesajlar), tanımlayıcılar
      (cihaz push jetonu). Reklam veya izleme amacı yok.
- [ ] "Account Deletion" gereği karşılanıyor (uygulama içinden silme var)
- [ ] Kullanıcı içeriği barındıran uygulamalar için moderasyon yöntemi
      açıklandı (şikâyet, engelleme, moderasyon paneli)
- [ ] İnceleme notuna demo hesap bilgisi eklendi

### 9.3 Google Play (Android)

- [ ] Data safety formu dolduruldu (App Privacy ile tutarlı)
- [ ] Gizlilik politikası adresi girildi
- [ ] `POST_NOTIFICATIONS` izni gerekçesi (Android 13+) — bildirimler
- [ ] Hedef API seviyesi Play'in güncel gereksinimini karşılıyor
- [ ] FCM V1 kimlik bilgisi EAS'a yüklendi (bildirimler için)
- [ ] Kullanıcı verisi silme yolu beyan edildi

### 9.4 Yayın öncesi son doğrulama

```bash
# Sunucu
cd apps/api
npm run typecheck
npm run test:all                                    # gömülü PostgreSQL
TEST_DATABASE_URL=postgresql://... npm run test:all # gerçek PostgreSQL

# Mobil
cd apps/mobile
npx tsc --noEmit
npx expo export --platform ios --platform android

# Uçtan uca (API + web hedefi çalışırken)
cd e2e && npm test
```

---

## 10. Gerçek cihazda test edilmesi gerekenler

Aşağıdakiler tarayıcıda veya otomatik testte doğrulanamaz; en az bir gerçek
iOS ve bir gerçek Android cihazda elle test edilmelidir:

| Konu | Neden cihaz gerekiyor |
|---|---|
| Apple ile Giriş | Yerel sistem iletişim kutusu ve gerçek Apple Kimliği |
| Google ile Giriş | Sistem tarayıcısı akışı (ASWebAuthenticationSession / Custom Tabs) |
| Push bildirimi | Jeton yalnızca gerçek cihazda üretilir; APNs/FCM iletimi |
| Bildirime dokunma | Uygulama kapalıyken açılıp doğru ekrana gitmesi |
| Fotoğraf yükleme | Kamera/galeri izinleri ve HEIC dosyaları (iOS) |
| Tarih-saat seçici | iOS ve Android yerel bileşenleri farklı davranır |
| Klavye davranışı | Form ekranlarında alan kapanmaması |
| Bildirim izni reddi | Sistem ayarlarına yönlendirmenin çalışması |
