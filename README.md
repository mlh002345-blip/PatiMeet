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
| `apps/api` | Node · Express · SQLite · JWT · zod · TypeScript | REST API, iş kuralları ve moderasyon uçları |
| `e2e` | Playwright | Uçtan uca akış testleri (mobil ölçüde tarayıcı) |

Tek kod tabanı hem iOS hem Android'e derlenir; ayrı Swift/Kotlin projesi yoktur.

---

## Hızlı başlangıç

Gereksinim: Node 22+.

```bash
# 1) API
cd apps/api
cp .env.example .env          # geliştirmede boş bırakabilirsiniz
npm install
npm run seed                  # demo veri (5 kullanıcı, 5 köpek, 4 etkinlik)
npm run dev                   # http://localhost:4000

# 2) Mobil uygulama (yeni bir terminalde)
cd apps/mobile
npm install
npx expo start
```

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

Ek ekranlar: yasal metin görüntüleyici (`app/legal/[slug].tsx`), engellenen
kullanıcılar (`app/settings/blocked.tsx`), profil ve köpek düzenleme.

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
- Tam konum paylaşılmaz — keşif ve etkinlikler yalnızca **semt** bilgisine dayanır
- Silinen veya pasife alınan içerik diğer kullanıcılara gösterilmez

Ek olarak: etkinliğin uygun köpek boyutu kısıtı, kontenjanın mevcut katılımcı
sayısının altına düşürülememesi, etkinlik sahibinin katılımdan ayrılamaması.

---

## Moderasyon

MVP'de özel admin paneli geliştirilmedi (belge 10. bölüm). Yayın öncesi gereken
işlemler `x-admin-token` başlığıyla korunan uçlardan yapılır:

```bash
TOKEN=<ADMIN_TOKEN degeri>

curl -H "x-admin-token: $TOKEN" localhost:4000/api/admin/stats
curl -H "x-admin-token: $TOKEN" "localhost:4000/api/admin/reports?status=open"

# Şikâyeti incelendi olarak işaretle
curl -X PATCH -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"status":"resolved"}' localhost:4000/api/admin/reports/<id>

# Kullanıcıyı pasife al
curl -X PATCH -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"status":"suspended"}' localhost:4000/api/admin/users/<id>

# Etkinliği kaldır
curl -X PATCH -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"status":"removed"}' localhost:4000/api/admin/events/<id>

# İçeriği gizle
curl -X PATCH -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"status":"hidden"}' localhost:4000/api/admin/dogs/<id>
```

---

## Test

```bash
# API iş kuralları — gerçek HTTP üzerinden 89 kontrol
cd apps/api && npm test

# Google ile giriş — token doğrulama ve hesap eşleştirme, 52 kontrol
cd apps/api && npm run test:google

# Tip denetimi
cd apps/api && npm run typecheck
cd apps/mobile && npx tsc --noEmit

# Uçtan uca akışlar (API + web hedefi çalışırken)
cd e2e && npm install && npm test

# Google arayüz akışı — iki durum ayrı ayrı sınanır
cd e2e && GOOGLE_EXPECTED=absent  node 04-google-giris.js   # kimlik tanımsız: düğme gizli
cd e2e && GOOGLE_EXPECTED=present node 04-google-giris.js   # kimlik tanımlı: düğme görünür
```

`npm test` (API) geçici bir veritabanı kullanır; geliştirme verinize dokunmaz.
Google testleri doğrulayıcıyı enjekte ederek çalışır — gerçek Google servisine
çıkılmaz, bu yüzden ağ erişimi veya gerçek kimlik gerekmez. Production yolunda
hiçbir atlama (bypass) yoktur; doğrulayıcı yalnızca testte değiştirilir.

Gerçek Google OAuth turu (kullanıcının hesap seçip izin verdiği adım) otomatik
sürülemez: geçerli bir istemci kimliği ve insan etkileşimi gerektirir. Bu adım
gerçek cihazda/emülatörde elle doğrulanmalıdır.

Uçtan uca testler uygulamayı 390×844 (telefon) ölçüsünde gerçek bir tarayıcıda
sürer ve kayıt, onboarding, keşfet, etkinlik oluşturma/katılma, mesajlaşma,
şikâyet ve engelleme akışlarını doğrular.

---

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

- [ ] `apps/api/.env` içinde `JWT_SECRET` ve `ADMIN_TOKEN` rastgele değerlerle dolu
      (production'da boş bırakılırsa sunucu açılmaz)
- [ ] `CORS_ORIGIN` daraltıldı
- [ ] `EXPO_PUBLIC_API_URL` yayın API adresine ayarlandı
- [ ] Google OAuth istemcileri oluşturuldu ve iki `.env` dosyasına yazıldı
      (bkz. "Google OAuth kurulumu"); OAuth consent screen dolduruldu
- [ ] Google ile giriş gerçek cihazda iOS ve Android'de elle denendi
- [ ] Google'ın marka kılavuzuna uygun resmî "G" görseli eklendi
      (`src/components/GoogleSignIn.tsx` içindeki `GoogleMark`)
- [ ] Yasal metinler (`apps/api/src/routes/legal.ts`) hukuk onayından geçti
- [ ] SQLite yerine yönetilen bir veritabanı değerlendirildi (aşağıya bakın)

---

## Bilinen sınırlar

Bunlar MVP kapsamı dışında bırakıldı veya bilinçli olarak basit tutuldu:

- **Fotoğraf yükleme sunucusu yok.** Belge 11. bölümde fotoğraf gönderme kapsam
  dışı olduğu için seçilen görselin yalnızca cihaz üzerindeki URI'si saklanır ve
  o cihazda görünür. Yükleme altyapısı eklendiğinde `PhotoPicker` içinde dönen
  kalıcı URL kaydedilecek.
- **Apple ile giriş** henüz yok. Google akışı (`POST /api/auth/google`) tam
  doğrulamalı olarak çalışıyor; Apple aynı desenle eklenebilir. Not: iOS
  uygulaması üçüncü taraf girişi sunduğu için App Store, Apple ile girişi de
  şart koşabilir — mağaza gönderiminden önce değerlendirilmeli.
- **Google düğmesindeki "G" işareti** bir yer tutucudur; mağaza gönderimi
  öncesi Google'ın marka kılavuzuna uygun resmî görsel eklenmelidir.
- **Oturum token'ı** `AsyncStorage`'da tutuluyor. Yayın öncesi
  `expo-secure-store`'a taşınması önerilir (cihaz anahtar zinciri).
- **Anlık bildirim yok** (belge 11. bölüm). Okunmamış mesaj göstergesi ve sohbet
  ekranı düzenli aralıklarla yoklama yapar; websocket bağlantısı yoktur.
- **SQLite** tek sunucu için uygundur. Şema, Postgres'e taşınabilecek biçimde
  (metin UUID anahtarlar, epoch ms zaman damgaları) yazıldı.
- **Çoklu köpek yönetimi** kapsam dışı: veri modeli birden fazla köpeği destekler,
  arayüz ilk köpeği düzenler.

---

## Proje yapısı

```
apps/
  api/
    src/
      routes/        auth, users, dogs, discover, events, messages, safety, legal, admin
      domain/        engelleme mantığı ve API çıktı biçimleri
      db.ts          şema ve göç
      config.ts      ortam değişkenleri
      seed.ts        demo veri
      smoke-test.ts  uçtan uca API testleri
  mobile/
    app/             expo-router ekranları (dosya tabanlı yönlendirme)
    src/
      components/    ui, kartlar, formlar, güvenlik paneli
      api.ts         API istemcisi ve tipler
      session.tsx    oturum yönetimi
      theme.ts       tasarım dili
      labels.ts      Türkçe etiketler ve tarih biçimlendirme
e2e/                 Playwright akış testleri
```
