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

# Tip denetimi
cd apps/api && npm run typecheck
cd apps/mobile && npx tsc --noEmit

# Uçtan uca akışlar (API + web hedefi çalışırken)
cd e2e && npm install && npm test
```

`npm test` (API) geçici bir veritabanı kullanır; geliştirme verinize dokunmaz.

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
- [ ] Yasal metinler (`apps/api/src/routes/legal.ts`) hukuk onayından geçti
- [ ] SQLite yerine yönetilen bir veritabanı değerlendirildi (aşağıya bakın)

---

## Bilinen sınırlar

Bunlar MVP kapsamı dışında bırakıldı veya bilinçli olarak basit tutuldu:

- **Fotoğraf yükleme sunucusu yok.** Belge 11. bölümde fotoğraf gönderme kapsam
  dışı olduğu için seçilen görselin yalnızca cihaz üzerindeki URI'si saklanır ve
  o cihazda görünür. Yükleme altyapısı eklendiğinde `PhotoPicker` içinde dönen
  kalıcı URL kaydedilecek.
- **Google / Apple ile giriş** için sunucu tarafı uç (`POST /api/auth/social`)
  hazır, ancak sağlayıcı imza doğrulaması eklenmedi. Yayın öncesi
  `expo-auth-session` ile istemci akışı ve sunucuda token doğrulaması
  tamamlanmalı.
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
