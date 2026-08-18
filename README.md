# PatiMeet

Köpek sahiplerinin yakınlarındaki köpekleri keşfetmesini, yürüyüş buluşmaları
oluşturmasını ve güvenli biçimde iletişim kurmasını sağlayan mobil öncelikli
topluluk uygulaması.

**Ana vaat:** Köpeğine yakınında oyun ve yürüyüş arkadaşı bul.

Bu depo, `PatiMeet_MVP.md` belgesinde tanımlanan MVP'nin **çalışan** bir
uygulamasıdır: iOS ve Android için tek kod tabanlı mobil uygulama ve onu
besleyen bir REST API.

---

## Ne var?

| Paket | Teknoloji | Açıklama |
|---|---|---|
| `apps/mobile` | Expo SDK 57 · React Native 0.86 · expo-router · TypeScript | iOS + Android uygulaması, 14 ekran |
| `apps/api` | Node · Express · **PostgreSQL** · JWT · zod · TypeScript | REST API, iş kuralları, moderasyon paneli, yasal metinler |
| `e2e` | Playwright | Uçtan uca akış testleri (mobil ölçüde tarayıcı) |

Tek kod tabanı hem iOS hem Android'e derlenir; ayrı Swift/Kotlin projesi yoktur.

### Öne çıkan özellikler

- **Açıklanabilir uyum skoru** — boyut, enerji, sosyallik, yaş, semt ve kullanım
  amacına dayanan 0–100 skor. Kullanıcı yalnızca sayıyı değil, her etkenin
  puanını ve gerekçesini görür. Sağlık veya güvenlik garantisi olarak
  sunulmaz; bu uyarı kartın içinde her zaman yer alır.
- **Çoklu köpek profili** — bir kullanıcı en fazla 5 köpek ekleyebilir; keşfet
  skoru en uyumlu köpeğe göre hesaplanır, etkinliğe hangi köpekle katılacağı
  seçilir.
- **Üç giriş yöntemi** — e-posta, Google ve Apple. Sağlayıcı yapılandırılmamışsa
  ilgili düğme hiç gösterilmez.
- **Güvenli Topluluk** — sekiz bildirim türü (kayıp hayvan, bulunan hayvan,
  zehirli yem / tehlikeli bölge, yaralı veya başıboş hayvan, salgın hastalık
  uyarısı, acil kan ihtiyacı, geçici yuva / sahiplendirme, mama veya ulaşım
  desteği). Kayıp hayvan ilanı 1–5 fotoğraf, hayvanın adı, son görüldüğü
  yaklaşık bölge ve son görülme zamanı ister; iletişim uygulama içi mesajla
  kurulur. **Kesin konum veya açık adres hiç toplanmaz** — koordinat, harita
  bağlantısı ve kapı/daire numarası sunucu tarafından reddedilir.
  Aynı ekran yaklaşık bölge özetini ve etkinlik sonrası güven değerlendirmesi
  girişini de barındırır; tek kalıcı adres `/alerts`, eski `/community` yolu
  buraya yönlenir.
- **Çoklu seçimli "Ne arıyorsun?"** — yürüyüş arkadaşı, oyun buluşması,
  sosyalleşme ve etkinlik birlikte seçilebilir; uyum skoru ortak beklentilere
  göre hesaplanır. Tek seçimli dönemden kalan "eğitim ve çalışma" değeri veride
  korunur ve profilde gösterilir, ancak yeni seçenek olarak sunulmaz.
- **Push bildirimleri** — mesaj, etkinlik ve güvenlik olayları; kategori
  tercihleri kullanıcıda. Yeni bir topluluk bildirimi aynı semtteki
  kullanıcılara güvenlik kategorisinden iletilir.
- **Moderasyon paneli** — şikâyet inceleme, hesap ve içerik yönetimi, denetim kaydı.

---

## Hızlı başlangıç

Gereksinim: Node 22+.

```bash
# 1) API
cd apps/api
cp .env.example .env          # geliştirmede boş bırakabilirsiniz
npm install
npm run migrate               # şemayı oluştur
npm run seed                  # demo veri (5 kullanıcı, 5 köpek, 4 etkinlik)
npm run dev                   # http://localhost:4000

# 2) Mobil uygulama (yeni bir terminalde)
cd apps/mobile
npm install
npx expo start
```

> **Veritabanı:** geliştirmede ek kurulum gerekmez. `DATABASE_URL` boşsa
> gömülü PostgreSQL (PGlite) kullanılır — production ile **aynı SQL diyalekti**,
> ama sunucu kurmaya gerek yok. Production'da `DATABASE_URL` zorunludur;
> ayrıntılar için [DEPLOYMENT.md](DEPLOYMENT.md).

Ardından:

- **iOS:** terminalde `i` (macOS + Xcode gerekir) veya iPhone'da Expo Go ile QR kod
- **Android:** terminalde `a` (Android Studio emülatörü) veya Expo Go ile QR kod
- **Tarayıcıda hızlı bakış:** `w`

### Demo hesaplar

`npm run seed` sonrası tüm hesapların şifresi `patimeet123`:

| E-posta | Ad | Semt | Köpek |
|---|---|---|---|
| `elif@ornek.com` | Elif | Kadıköy | Pati (Golden Retriever) |
| `mert@ornek.com` | Mert | Beşiktaş | Karamel (Border Collie) |
| `zeynep@ornek.com` | Zeynep | Kadıköy | Fındık (Terrier karışık) |
| `can@ornek.com` | Can | Şişli | Duman (Husky) |
| `selin@ornek.com` | Selin | Üsküdar | Maya (Cocker Spaniel) |

Boş başlangıç durumlarını görmek için: `npm run seed -- --reset` ile veriyi
temizleyip yeni bir hesapla kayıt olun.

### Google ile giriş

Google ile giriş **isteğe bağlı olarak devreye girer**: istemci kimlikleri
tanımlı değilse düğme hiç gösterilmez ve uygulama e-posta ile girişle sorunsuz
çalışır. Kurmak için aşağıdaki "Google OAuth kurulumu" bölümüne bakın.

Akış:

1. Uygulama `expo-auth-session` ile Google'ın oturum sayfasını **sistem
   tarayıcısında** açar (iOS'ta `ASWebAuthenticationSession`, Android'de Chrome
   Custom Tabs). Google, WebView içinde oturum açmayı yasakladığı için gereken
   yöntem budur.
2. Google bir **ID token** döner.
3. Uygulama token'ı `POST /api/auth/google` ucuna gönderir.
4. **Sunucu token'ı doğrular**: imza Google'ın açık anahtarlarıyla kontrol
   edilir, `aud` yapılandırılmış istemci kimliklerinden biri olmalı, `iss`
   Google olmalı ve `email_verified` true olmalıdır. İstemciden gelen hiçbir
   kimlik bilgisine güvenilmez.
5. Yeni kullanıcı onboarding'e, mevcut kullanıcı ana sayfaya yönlendirilir.

### Google OAuth kurulumu

[Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
**APIs & Services → Credentials** altında **her platform için ayrı** bir OAuth
istemcisi oluşturun:

| Platform | Application type | Gereken bilgi |
|---|---|---|
| iOS | iOS | Bundle ID: `com.patimeet.app` |
| Android | Android | Package name: `com.patimeet.app` + imzalama sertifikasının **SHA-1** parmak izi |
| Web | Web application | Yalnızca `expo start --web` önizlemesi için |

Ayrıca **OAuth consent screen** ekranını doldurun (uygulama adı, destek
e-postası, gizlilik politikası ve kullanım koşulları bağlantıları). `email` ve
`profile` kapsamları yeterlidir; ek kapsam istemeyin.

Android SHA-1 parmak izini almak için:

```bash
# EAS ile derliyorsanız
npx eas credentials          # Android → keystore → SHA-1 değerini kopyalayın
```

Aldığınız kimlikleri iki yere yazın:

```bash
# apps/mobile/.env  — uygulamanın hangi istemciyle Google'a gideceği
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...apps.googleusercontent.com

# apps/api/.env  — sunucunun hangi token'ları kabul edeceği
GOOGLE_IOS_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_ANDROID_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_WEB_CLIENT_ID=...apps.googleusercontent.com
```

Notlar:

- **Client secret gerekmez ve yazılmamalıdır.** Mobil akış PKCE kullanır;
  istemci kimlikleri gizli değil, herkese açık değerlerdir.
- iOS'un ihtiyaç duyduğu "ters çevrilmiş istemci kimliği" geri dönüş şeması
  (`com.googleusercontent.apps.<id>`) `app.config.ts` tarafından
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` değerinden **otomatik** üretilir.
- Bu değişkenler derleme anında paketlenir. Değiştirdikten sonra
  `npx expo start --clear` çalıştırın ve yeni bir derleme alın.
- Google ile giriş **Expo Go'da çalışmaz**; geliştirme derlemesi
  (`npx expo run:ios` / `run:android`) veya EAS derlemesi gerekir.

#### Hesap eşleştirme ve güvenlik kararı

Bir kullanıcı, daha önce **e-posta ve şifre ile** açtığı hesabın adresiyle
Google'a girerse hesaplar birleştirilir — yeni bir kopya hesap açılmaz.

Bu birleştirmede şifre girişi **kapatılır** ve kullanıcıya bildirilir. Nedeni:
MVP'de e-posta doğrulama akışı yok, yani biri başkasının adresiyle şifreli
hesap açmış olabilir. Google e-postayı doğruladığı için gerçek sahip Google ile
gelen kişidir; önceden belirlenmiş şifre bırakılırsa adresi kaydeden kişi
hesaba erişmeye devam ederdi. Hesabın e-postası zaten doğrulanmışsa şifre
korunur — ileride e-posta doğrulama eklendiğinde bu durum kendiliğinden geçerli
olur.

### Gerçek cihazda API'ye bağlanmak

Telefonda `localhost` cihazın kendisini gösterir. Uygulama bunu otomatik çözer:
Expo geliştirme sunucusunun ana makine IP'sini alıp `http://<ip>:4000` adresini
kullanır. Elle ayarlamak isterseniz `apps/mobile/.env` içine yazın:

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000
```

---

## Ekranlar

MVP belgesindeki 14 ekranın tamamı uygulandı:

| # | Ekran | Dosya |
|---|---|---|
| 1 | Açılış | `app/index.tsx` |
| 2 | Kayıt / giriş | `app/(auth)/sign-up.tsx`, `sign-in.tsx` |
| 3 | Kullanıcı profili oluşturma | `app/(onboarding)/create-profile.tsx` |
| 4 | Köpek profili oluşturma | `app/(onboarding)/create-dog.tsx` |
| 5 | Semt seçimi | `app/(onboarding)/select-district.tsx` |
| 6 | Ana sayfa | `app/(tabs)/home.tsx` |
| 7 | Keşfet | `app/(tabs)/discover.tsx` |
| 8 | Köpek ve sahip profil detayı | `app/user/[id].tsx` |
| 9 | Etkinlik listesi | `app/(tabs)/events.tsx` |
| 10 | Etkinlik detayı | `app/event/[id].tsx` |
| 11 | Etkinlik oluşturma | `app/event/create.tsx` |
| 12 | Mesaj listesi | `app/(tabs)/messages.tsx` |
| 13 | Sohbet | `app/chat/[id].tsx` |
| 14 | Profil ve ayarlar | `app/(tabs)/profile.tsx` |

Şikâyet ve engelleme, belgede belirtildiği gibi ayrı tam ekran değil **alt panel**
olarak uygulandı: `src/components/SafetySheet.tsx`.

Ek ekranlar: Güvenli Topluluk listesi, bildirim oluşturma ve bildirim detayı
(`app/alerts/index.tsx`, `app/alerts/create.tsx`, `app/alerts/[id].tsx` — eski
`app/community.tsx` yalnızca buraya yönlendirir), yasal
metin görüntüleyici (`app/legal/[slug].tsx`), engellenen kullanıcılar
(`app/settings/blocked.tsx`), profil ve köpek düzenleme.

Alt menü: Ana Sayfa · Keşfet · Etkinlikler · Mesajlar · Profil (okunmamış mesaj
göstergesi ile).

---

## Tasarım dili

`src/theme.ts` içinde tek yerde tanımlı:

- Açık krem arka plan (`#FBF6EF`), koyu lila vurgu (`#5B3E8E`), sıcak turuncu ikincil ton
- Yuvarlak köşeler ve kart tabanlı arayüz
- Flört uygulaması izlenimi vermemek için doygun pembe/kırmızı tonlarından kaçınıldı
- Köpekler görsel olarak ön planda (kartlarda büyük köpek görseli, profil detayında hero)
- Az adımlı formlar, güçlü CTA butonları, Türkçe arayüz
- Boş / yükleniyor / hata / başarı durumları ayrı bileşenler olarak tasarlandı
  (`EmptyState`, `LoadingState`, `ErrorState`, `Banner`)

---

## Uygulanan iş kuralları

MVP belgesi 9. bölümdeki kuralların tamamı sunucu tarafında zorlanır:

- Kullanıcının en az bir köpek profili olmalı (son köpek silinemez, onboarding atlanamaz)
- Yalnızca aktif ve engellenmemiş profiller görünür
- Engelleme karşılıklıdır: iki taraf mesajlaşamaz ve profilleri göremez
- Etkinlik katılımcı sayısı sınırı aşamaz (kontenjan kontrolü tek işlemde)
- Geçmiş tarihli etkinlik oluşturulamaz
- Yalnızca etkinlik sahibi düzenler veya iptal eder
- Tam konum paylaşılmaz — keşif, etkinlikler ve topluluk bildirimleri yalnızca
  **semt** ve serbest metin bir *yaklaşık bölge* tarifine dayanır; koordinat,
  harita bağlantısı ve kapı/daire numarası içeren girdiler reddedilir
- Kayıp hayvan ilanı en az 1, en fazla 5 fotoğraf ve hayvanın adı ister; son
  görülme zamanı gelecekte veya 90 günden eski olamaz
- İlan fotoğrafları yalnızca ilanı açan kullanıcının kendi yüklediği görseller
  olabilir (obje deposu sahiplik doğrulaması)
- Silinen veya pasife alınan içerik diğer kullanıcılara gösterilmez

Ek olarak: etkinliğin uygun köpek boyutu kısıtı, kontenjanın mevcut katılımcı
sayısının altına düşürülememesi, etkinlik sahibinin katılımdan ayrılamaması.

---

## Moderasyon

### Web paneli

Oturum korumalı moderasyon arayüzü API ile aynı adreste çalışır:

```
http://localhost:4000/admin
```

İlk yöneticiyi oluşturun:

```bash
cd apps/api
npm run create-admin -- moderator@patimeet.app "GucluSifre123" "Moderatör"
```

Panel yapabildikleri:

- Bekleyen şikâyetleri inceleme (açık / inceleniyor / çözüldü)
- Kullanıcı arama; pasife alma, geri açma, verilerini silme
- Etkinlik arama; kaldırma ve geri alma
- Köpek profilini gizleme
- Tüm işlemlerin denetim kaydı (kim, ne zaman, hangi kayıt)

Hakkında şikâyet olan kullanıcı ve etkinlikler listelerin en üstünde gösterilir.

### Otomasyon API'si

İnsan olmayan erişim için `x-admin-token` başlığıyla korunan uçlar:

```bash
TOKEN=<ADMIN_TOKEN degeri>

curl -H "x-admin-token: $TOKEN" localhost:4000/api/admin/stats
curl -H "x-admin-token: $TOKEN" "localhost:4000/api/admin/reports?status=open"
curl -H "x-admin-token: $TOKEN" localhost:4000/api/admin/audit

# Şikâyeti çözüldü olarak işaretle
curl -X PATCH -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"status":"resolved","note":"incelendi"}' localhost:4000/api/admin/reports/<id>

# Kullanıcıyı pasife al
curl -X PATCH -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"status":"suspended","note":"kural ihlali"}' localhost:4000/api/admin/users/<id>

# Etkinliği kaldır
curl -X PATCH -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"status":"removed"}' localhost:4000/api/admin/events/<id>
```

Her iki yol da denetim kaydına yazar.

## Test

```bash
# Sunucu — beş paket, 392 kontrol
cd apps/api
npm run test            # iş kuralları (89)
npm run test:google     # Google ile giriş (54)
npm run test:platform   # yayın altyapısı (102)
npm run test:matching   # uyum skoru ve çoklu köpek (34)
npm run test:alerts     # çoklu seçim + Güvenli Topluluk + veri geçişi (113)
npm run test:all        # hepsi

# Tip denetimi
cd apps/api && npm run typecheck
cd apps/mobile && npx tsc --noEmit

# Uçtan uca akışlar (API + web hedefi çalışırken) — 106 kontrol
cd e2e && npm install && npm test
```

Testler varsayılan olarak **gömülü PostgreSQL** (bellekte) kullanır; ayrı bir
sunucu gerekmez ve geliştirme verinize dokunulmaz.

Production sürücüsünü (`pg`) de aynı testlerle doğrulamak için gerçek bir
PostgreSQL verin:

```bash
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/patimeet_test npm run test:all
```

> `test:platform` tüm migration'ların **boş** bir veritabanına uygulandığını
> doğrular. Gerçek PostgreSQL ile çalışırken her paketi kendi taze
> veritabanında çalıştırın, yoksa bu kontrol sırayla ikinci çalıştığında
> başarısız olur.

> Bu depodaki tüm sunucu testleri hem gömülü hem gerçek PostgreSQL 16 üzerinde
> geçer. Verdiğiniz test veritabanı değiştirilir — ayrı bir veritabanı kullanın.

Kapsam:

| Paket | Ne doğrulanıyor |
|---|---|
| `test` | Kayıt, profil, keşfet, etkinlik, mesaj, şikâyet/engelleme, hesap silme iş kuralları |
| `test:google` | Token doğrulama kuralları, hesap eşleştirme, ele geçirme senaryoları |
| `test:platform` | Migration'lar, sağlık kontrolleri, görsel yükleme ve yetkilendirme, Apple girişi, push altyapısı, moderasyon paneli, hız sınırı |
| `test:matching` | Skor kuralları, eksik bilgi davranışı, keşfet sıralaması, çoklu köpek iş kuralları |
| `test:alerts` | Çoklu seçimli "Ne arıyorsun?" ve veri geçişi, Güvenli Topluluk bildirimleri, fotoğraf sahipliği, kesin konum reddi, moderasyon, eski kayıp ilanlarının birleştirilmesi (veri kaybı / çift kayıt / geriye uyumluluk), etkinlik değerlendirmesi |
| `e2e` | Gerçek tarayıcıda telefon ölçüsünde kullanıcı yolculukları |

Uçtan uca testler Google düğmesinin görünürlüğünü de sınar. Beklenti, web
sunucusunun başlatıldığı ortamla uyumlu olmalı:

```bash
# Google yapılandırılmamış (varsayılan)
cd apps/mobile && npx expo start --web
cd e2e && npm test

# Google yapılandırılmış
cd apps/mobile && EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=... npx expo start --web
cd e2e && GOOGLE_EXPECTED=present npm test
```

## Production derlemesi

```bash
cd apps/mobile

# JS paketlerini derle (her iki platform)
npx expo export --platform ios --platform android

# Mağaza derlemeleri (EAS hesabı gerekir)
npx eas build --platform ios
npx eas build --platform android
```

Uygulama kimlikleri `app.json` içinde tanımlı: `com.patimeet.app` (iOS bundle
identifier ve Android package). Fotoğraf izinleri için Türkçe açıklama
metinleri `infoPlist` ve Android `permissions` altında ayarlandı.

### Yayın öncesi kontrol listesi

Ayrıntılı adımlar ve mağaza gereklilikleri için: **[DEPLOYMENT.md](DEPLOYMENT.md)**

Kısa özet:

- [ ] `DATABASE_URL` yönetilen bir PostgreSQL'e ayarlandı, yedekleme açık
- [ ] `JWT_SECRET`, `ADMIN_TOKEN`, `ADMIN_SESSION_SECRET` rastgele değerlerle dolu
      (production'da boş bırakılırsa sunucu açılmaz)
- [ ] `STORAGE_DRIVER=s3` ve kova kimlik bilgileri tanımlı
- [ ] `EXPO_PUBLIC_API_URL` yayın API adresine ayarlandı
- [ ] `CORS_ORIGIN` daraltıldı, `TRUST_PROXY` ters vekile göre ayarlandı
- [ ] Apple ile Giriş etkin (iOS'ta Google sunuluyorsa **zorunlu**)
- [ ] EAS projesi oluşturuldu; APNs ve FCM kimlik bilgileri yüklendi
- [ ] İlk moderatör hesabı oluşturuldu (`npm run create-admin`)
- [ ] Gizlilik politikası herkese açık adreste (`/legal/privacy.html`)
- [ ] Yasal metinler hukuk onayından geçti
- [ ] Google'ın marka kılavuzuna uygun resmî "G" görseli eklendi
      (`src/components/GoogleSignIn.tsx` içindeki `GoogleMark`)
- [ ] Gerçek cihaz testleri yapıldı (DEPLOYMENT.md bölüm 10)

---

## Bilinen sınırlar

- **Oturum token'ı** `AsyncStorage`'da tutuluyor. Yayın öncesi
  `expo-secure-store`'a taşınması önerilir (cihaz anahtar zinciri).
- **Google düğmesindeki "G" işareti** bir yer tutucudur; mağaza gönderimi
  öncesi Google'ın marka kılavuzuna uygun resmî görsel eklenmelidir.
- **Anlık mesaj iletimi yok.** Bildirimler push ile gerçek zamanlı gider, ancak
  sohbet ekranı açıkken yeni mesajlar için düzenli yoklama yapılır; websocket
  bağlantısı yoktur.
- **Apple ile Giriş yalnızca iOS'ta** gösterilir (platform kısıtı). Android ve
  web'de Google ve e-posta seçenekleri kullanılır.
- **Push jetonu gerçek cihaz gerektirir**; simülatör/emülatörde uygulama
  bildirim olmadan sorunsuz çalışır.
- **Moderasyon paneli** temel işlemleri kapsar; toplu işlem, ekip rolleri ve
  gelişmiş filtreler yok.

---

## Proje yapısı

```
apps/
  api/
    src/
      db/            sürücü soyutlaması (pg + PGlite), migration'lar
      storage/       obje deposu (S3 uyumlu + yerel geliştirme sürücüsü)
      admin/         moderasyon paneli (router, oturum, şablonlar)
      cli/           migrate, create-admin
      routes/        auth, users, dogs, discover, events, messages,
                     safety, media, push, legal, admin
      domain/        sosyal giriş, google, apple, medya, push, moderasyon,
                     engelleme, topluluk bildirimleri, kullanım amaçları,
                     API çıktı biçimleri
      config.ts      ortam değişkenleri
      logger.ts      yapılandırılmış günlükleme
      seed.ts        demo veri
      smoke-test.ts    iş kuralı testleri
      google-test.ts   Google ile giriş testleri
      platform-test.ts yayın altyapısı testleri
      matching-test.ts uyum skoru testleri
      alerts-test.ts   çoklu seçim ve Güvenli Topluluk testleri
  mobile/
    app/             expo-router ekranları (dosya tabanlı yönlendirme)
    src/
      components/    ui, kartlar, formlar, güvenlik paneli, sağlayıcı düğmeleri
      api.ts         API istemcisi ve tipler
      session.tsx    oturum yönetimi
      googleAuth.ts  Google ile giriş akışı
      appleAuth.ts   Apple ile giriş akışı
      push.ts        bildirim kaydı ve derin bağlantı
      theme.ts       tasarım dili
      labels.ts      Türkçe etiketler ve tarih biçimlendirme
e2e/                 Playwright akış testleri

DEPLOYMENT.md        yayın rehberi ve mağaza kontrol listesi
```
