# PatiMeet — Devam Notu

Son güncelleme: 20 Ağustos 2026

## 21 Ağustos 2026 — bilgisayar sıfırlama öncesi kurtarma noktası

- Kanonik GitHub deposu: `https://github.com/mlh002345-blip/PatiMeet`
- Kanonik dal: `claude/bu-mvp-mobile-design-4qt3zc`
- Son ürün commit'i: `188b99d` (`apply rich PatiMeet product experience`)
- Bu commit; fotoğraf merkezli premium Ana Sayfa, zengin Keşfet, çalışan Canlı
  Yürüyüş arayüzü ve koyu dört sekmeli navigasyonu içerir.
- Son Android test paketi: Expo/EAS build `7c6aa681-2c30-41d2-8db5-bbbaaf81ed68`,
  Android `versionCode: 7`.
- Canlı servisler bilgisayarda değil, sağlayıcı hesaplarında durur:
  Railway API/PostgreSQL, Cloudflare R2 ve Expo/EAS projesi.
- Gizli anahtarlar GitHub'a yazılmadı. Railway değişkenleri ve Cloudflare R2
  anahtarları ilgili sağlayıcı hesaplarında korunmalıdır.

### Onaylanmış fakat henüz uygulanmamış kullanıcı notu

- Güvenli Topluluk'ta fotoğraf yükleme seçeneği korunacak fakat **hiçbir
  bildirim türünde zorunlu olmayacak**.
- Kayıp hayvan ilanı dahil kullanıcı fotoğrafsız bildirim yayımlayabilecek.
- Form metni `Fotoğraf ekle — isteğe bağlı` olacak; kayıp hayvan ilanında
  fotoğraf eklemenin bulunmayı kolaylaştırdığı tavsiye olarak belirtilecek.
- Değişiklik yalnızca mobil formda değil, API doğrulaması ve testlerde de
  birlikte uygulanacak.

### Yeni bilgisayarda geri yükleme

1. GitHub hesabına ve `mlh002345-blip/PatiMeet` deposuna erişimi doğrula.
2. Kanonik dalı klonla/çek: `claude/bu-mvp-mobile-design-4qt3zc`.
3. Railway, Cloudflare ve Expo hesaplarına giriş yap; proje erişimlerini
   doğrula. Gizli değerleri sohbet veya GitHub'a kopyalama.
4. Gerekirse Expo erişim tokenını yeniden üret; eski yerel token dosyasına
   bağımlı kalma ve tokenı GitHub'a ekleme.
5. `DEVAM_NOTU.md` dosyasını okuyup yalnızca bu kanonik daldan devam et.

## 21 Ağustos 2026 — beş ürün paketi tamamlandı

Kanonik dal ve tek doğruluk kaynağı değişmedi: `claude/bu-mvp-mobile-design-4qt3zc`.
`188b99d` ile gelen koyu orman yeşili ürün kimliği, fotoğraf merkezli ana ekran,
zengin Keşfet, Canlı Yürüyüş sekmesi ve dört sekmeli koyu navigasyon korundu;
yeni özellikler bu tasarımın üzerine eklendi.

### Paket 1 — Güvenli Topluluk fotoğrafı isteğe bağlı
- Fotoğraf artık hiçbir bildirim türünde zorunlu değil; kayıp hayvan dahil.
- Form alanı: `Fotoğraf ekle — isteğe bağlı`.
- Kayıp hayvanda tavsiye: `Fotoğraf eklemek bulunmasını kolaylaştırır.`
- Fotoğrafsız ilanlarda türe uygun premium sembol gösteriliyor.
- Eski fotoğraflı ilanlar ve R2 kayıtları olduğu gibi korundu.

### Paket 2 — Gerçek GPS Canlı Yürüyüş
- Sahte harita ve zamana göre uydurulmuş mesafe kaldırıldı.
- `expo-location` ile gerçek rota; izin yalnızca yürüyüş başlatılırken istenir.
- Düşük doğruluk, mantıksız sıçrama ve duruş titremesi sunucuda süzülür.
- Süre, geçen gerçek zamanla sınırlanır; geriye dönük şişirilemez.
- Aktif yürüyüş kurtarılabilir; aynı anda tek aktif yürüyüş kuralı veritabanında.
- Ham rota yalnızca sahibine açık; özette uçlar gizlenebilir.
- Canlı konum yalnızca seçilen kişiyle, seçilen süre boyunca; süre dolunca kapanır.
- Tamamlanan yürüyüş özet kartı, cihaz paylaşımı ve günlüğe anı olarak eklenebilir.
- Haftalık hedef ve ana ekrandaki günlük hedef artık gerçek veriden hesaplanıyor.

### Paket 3 — Köpeğimin Günlüğü
- 17 kayıt türü; her türde yalnızca anlamlı alanlar gösteriliyor.
- Hatırlatmalar: tamamlandı/ertelendi/iptal, tekrarlayan bakımda otomatik sıradaki kayıt.
- Push kapalıyken de uygulama içi hatırlatma çalışıyor; kayıt kaybolmuyor.
- Sağlık belgeleri (PDF dahil) yalnızca sahibine açık, adresler süreli imzalı.
- Kilo grafiği, fotoğraflı anılar ve varsayılan olarak özel acil durum kartı.

### Paket 4 — Mahalle Akışı ve Hızlı Yürüyüş Daveti
- Akış etkinlik, bildirim ve daveti tek listede birleştiriyor; kopya tablo yok.
- Davetler otomatik sona eriyor; süresi dolana katılım reddediliyor.
- Aynı anda en fazla 3 açık davet; engellenen kullanıcıların davetleri görünmüyor.
- Kesin buluşma noktası davette yok; mesajlaşmayla paylaşılıyor.
- Basit oyun grupları: katılma/ayrılma, mevcut etkinlik sistemi yeniden kullanılıyor.

### Paket 5 — Yayın güvenliği
- Oturum jetonu `expo-secure-store` içine taşındı; eski AsyncStorage kaydı
  başarılı taşımadan sonra siliniyor, oturum kaybolmuyor. Jeton loglanmıyor.
- Yeni bildirim kategorileri: bakım hatırlatmaları ve yürüyüş davetleri.
- Gizlilik odaklı analitik: yalnızca sayı/boolean; serbest metin ve kişisel veri
  temizleyici tarafından atılıyor. Harici sağlayıcı yok, adaptör arayüzü hazır.

### Doğrulama
- API: `513/513` hem gömülü hem gerçek PostgreSQL 16 üzerinde.
- E2E: `152/152`.
- Mobil ve API tip denetimi temiz.
- Production export: web 995, iOS 1287, Android 1423 modül.
- 390×844, 320×568 ve %130 yazı ölçeğinde yatay taşma ve kesik buton yok.

### Gerçek cihazda doğrulanması gerekenler
- Konum izni akışı, arka plana geçiş ve gerçek rota doğruluğu.
- Uygulama kapanıp açıldığında aktif yürüyüşün kurtarılması.
- Galeri/kamera ile belge ve anı yükleme.
- Push bildirimleriyle davet ve bakım hatırlatması derin bağlantıları.

## 21 Ağustos 2026 — APK öncesi yapılandırma hazırlığı

APK bu konteynerde ÜRETİLEMEDİ. İki bağımsız engel var:

1. Expo erişim tokenı yok (önceki turda bilinçli olarak silinmişti) ve gizli
   değer istenmedi/eklenmedi.
2. `api.expo.dev` çıkış vekili tarafından engelli (403 CONNECT); yalnızca npm
   kayıt defterine erişim var. EAS bulut derlemesi bu ortamdan başlatılamıyor.

Bunun yerine derlemenin doğru çıkması için gereken yapılandırma tamamlandı:

- **Konum izni eklendi.** `expo-location` eklentisi, Android
  `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` ve iOS
  `NSLocationWhenInUseUsageDescription`. Bunlar olmadan üretilecek APK'da
  Canlı Yürüyüş çalışmazdı. Arka plan konumu kapalı; istenmiyor.
- **Gereksiz mikrofon izni engellendi.** `expo-image-picker` `RECORD_AUDIO`
  ekliyordu; video kaydı yapmadığımız için `blockedPermissions` ile
  kaldırılıyor (manifestte `tools:node="remove"`).
- **Eski açık tema renkleri kimliğe alındı.** Açılış ekranı ve adaptif ikon
  zemini `#16281F`, bildirim vurgusu eski lila `#5B3E8E` yerine bakır
  `#A6602F`. `userInterfaceStyle: dark` ve bunun etkili olması için
  `expo-system-ui` eklendi.
- **`edgeToEdgeEnabled` kaldırıldı** — Android 16'da zorunlu olduğu için
  desteklenmiyordu ve prebuild uyarısı veriyordu.
- `expo prebuild --platform android` uyarısız tamamlanıyor ve manifestte konum
  izinleri doğrulandı. Üretilen `android/`–`ios/` klasörleri depoya
  girmiyor; `.gitignore`'a eklendi (yönetilen iş akışı korunuyor).

### APK'yı üretmek için (kullanıcı tarafında)

```
cd apps/mobile
npx eas-cli@latest login          # veya EXPO_TOKEN ortam değişkeni
npx eas-cli@latest build --platform android --profile preview
```

`eas.json` içindeki `preview` profili APK üretir ve `autoIncrement` ile
`versionCode` otomatik artar (uzak sürüm kaynağı). Önceki paket
`versionCode: 7` idi; yeni derleme 8 olmalı.

Derlemeden önce Railway'e dağıtım yapılıp `0010` migration'ının uygulandığı
loglardan doğrulanmalı; APK canlı API'ye bağlanıyor.

## Kaynak ve çalışma durumu

- GitHub: `mlh002345-blip/PatiMeet`
- Çalışma dalı: `claude/bu-mvp-mobile-design-4qt3zc`
- Uzak daldaki son doğrulanmış sürüm: bu belgenin bulunduğu commit.
- Yerel ve uzak dal eşit: önde/geride commit yok.
- Tek kanonik çalışma dalı bu daldır; paralel Claude uygulaması veya ikinci özellik kaydı oluşturulmayacak.
- `b7fa1d8`: Telefonda görülen kart yazısı çakışmaları, Android alt menü güvenli alanı ve aşırı yazı ölçekleme sorunları düzeltildi.
- `8520e69`: Yeni Android önizleme paketlerinde sürüm numarasının otomatik artırılması etkinleştirildi.
- `53afd2c`: Privé görsel dilini mobil uygulamanın kalan ana ekranlarına yaydı.
- `796a80d`: Premium Keşfet deneyimini yeniden tasarladı.
- `516603f`: Premium mobil deneyimin ilk iyileştirmelerini yaptı.
- `534fa11`: PatiMeet Privé Faz 1 — tasarım sistemi, alt navigasyon ve Bugün/Keşfet/Kulüp amiral ekranları.
- `2489a0a`: Faz 1 görev belgesi ile iki onaylı tasarım referansını dala ekledi.
- `d998cdf`: İki Güvenli Topluluk yapısını tek ekranda birleştirdi.
- Önceki önemli commitler:
  - `0fcc5f5`: Codex ve Claude topluluk/etkinlik çalışmalarını birleştirdi.
  - `019622b`: Çoklu kullanım amacı ve Güvenli Topluluk bildirimleri.
  - `9821e07`: Mobil uygulamayı Expo projesine bağladı.
  - `8a5e28e`: Mobil uygulamayı canlı API'ye bağladı.
- Yerel dal şu anda uzak dalın gerisinde olabilir. Devam ederken önce `fetch` yapılmalı ve çalışma ağacı temizse yalnızca fast-forward ile güncellenmeli.

## PatiMeet Privé Faz 1 — tamamlandı

- Yeni ivory/forest/obsidian/copper tasarım tokenları ve ileriye hazır gece paleti.
- Geriye uyumlu ortak premium UI bileşenleri.
- Alt navigasyon: Bugün, Keşfet, Kulüp, Mesajlar, Pati; route adları korunuyor.
- Bugün, Keşfet ve Etkinlikler/Kulüp ekranları Privé tasarımına dönüştürüldü.
- Sahte GPS veya tamamlanmamış özellik çalışıyor gibi gösterilmedi.
- Yeni bağımlılık eklenmedi.
- Claude'un bildirdiği doğrulama: API `392/392` (iki sürücü), E2E `107/107`, mobil/API tip denetimi temiz, web/iOS/Android production export başarılı.
- Bilinen görsel doğrulama ihtiyacı: uzak fotoğraf kaynağı konteynerde engelli olduğundan gerçek fotoğraflı görünüm yeni Android paketiyle cihazda kontrol edilmeli.

## Canlı altyapı

- Railway API: `https://patimeet-githup-production.up.railway.app`
- Railway'de PatiMeet'e ait ayrı PostgreSQL servisi: `patimeet`
- Cloudflare R2 bucket: `patimeet-media`
- R2 erişim bilgileri Railway değişkenlerinde saklanıyor; bu dosyada gizli anahtar yoktur.
- Expo hesabı: `mlhoznnn`
- Expo projesi: `patimeet`
- Expo proje kimliği: `1089a8fd-73f6-4c3b-a91f-ed4dd05f1d0b`
- Önceki Android test APK'sı başarıyla oluşturuldu ve telefonda temel akışlar çalıştı.
- Geçici Expo token dosyası APK tamamlandıktan sonra silindi.
- Google/Apple girişleri henüz yapılandırılmadı.

## Telefonda doğrulanan mevcut durum

- Uygulama Android telefona kuruldu.
- E-posta/şifre ile kayıt ve temel uygulama akışları çalıştı.
- Kullanıcı ilk incelemede genel olarak uygulamanın hatasız çalıştığını bildirdi.

## Tamamlanan ilk geliştirme paketi

### 1. “Ne arıyorsun?” çoklu seçim

- Seçilebilir dört başlık: yürüyüş arkadaşı, oyun buluşması, sosyalleşme, etkinlik.
- Eski `egitim` verisi API'de ve profilde korunuyor ancak yeni seçim listesinde gösterilmiyor.
- Eski tek seçimli veri geriye uyumlu biçimde korunuyor.
- Uyum skoru ortak seçimlere göre hesaplanıyor.

### 2. Fotoğraflı kayıp hayvan ilanı

- 1–5 fotoğraf.
- Hayvan adı, yaklaşık bölge, tarih/saat ve açıklama.
- İletişim uygulama içi mesajlaşma üzerinden.
- Fotoğraflar mevcut R2/S3 altyapısını kullanıyor.
- Kesin konum, koordinat, harita bağlantısı ve belirgin kapı/daire kalıpları reddediliyor.

### 3. Güvenli Topluluk

- Kayıp hayvan.
- Bulunan hayvan.
- Zehirli yem / tehlikeli bölge.
- Yaralı veya başıboş hayvan.
- Salgın hastalık uyarısı.
- Acil kan ihtiyacı.
- Geçici yuva / sahiplendirme.
- Mama veya ulaşım desteği.

### Birleştirme sonucu

- Kalıcı ekran `/alerts`.
- Eski `/community` bağlantısı `/alerts` ekranına yönleniyor.
- Ana sayfada yalnızca bir Güvenli Topluluk girişi var.
- Yaklaşık bölge haritası ve etkinlik sonrası güven değerlendirmesi `/alerts` içine taşındı.
- `0009_merge_lost_dog_posts_into_alerts` migration'ı eski `lost_dog_posts` verilerini kayıpsız ve tekrar çalıştırılabilir biçimde `community_alerts` yapısına taşıyor.
- Eski topluluk API uçları geriye uyumluluk için çalışıyor fakat eski tabloya yeni kayıt yazmıyor.
- Eski ilan sahibinin mesajlaşma bağlantısı ve köpek profil fotoğrafı korunuyor.

## Claude'un bildirdiği son test sonuçları

- API, gömülü PostgreSQL: `392/392`
- API, gerçek PostgreSQL 16: `392/392`
- E2E: `106/106`
- API ve mobil tip denetimi: temiz
- Production export: web, iOS ve Android başarılı

Codex, `d998cdf` commit'inin GitHub'a ulaştığını ve temel kod yapısını doğruladı. Tam test paketi henüz Codex tarafından yerelde yeniden çalıştırılmadı.

## Devam edildiğinde ilk yapılacaklar

1. Uzak daldaki `d998cdf` commit'ini yerel çalışma alanına güvenli fast-forward ile al.
2. Bağımlılıkları ve çalışma ağacını kontrol et.
3. API testlerini, mobil tip denetimini ve mümkünse E2E paketini yerelde yeniden çalıştır.
4. Railway dağıtımını yap ve migration `0008`/`0009` uygulamasını loglardan doğrula.
5. Canlı API sağlık ve hazır olma uçlarını kontrol et.
6. Yeni Android test APK'sı oluştur.
7. Gerçek telefonda özellikle şunları test et:
   - çoklu “Ne arıyorsun?” seçimi ve tekrar açıldığında korunması,
   - kayıp ilanına galeriden/kameradan 1–5 fotoğraf yükleme,
   - R2'de saklanan fotoğrafların ilan listesi ve detayında görüntülenmesi,
   - sekiz bildirim türünün oluşturulması,
   - `/community` eski bağlantısının `/alerts` ekranına yönlenmesi,
   - tek Güvenli Topluluk ana sayfa girişi,
   - ilan sahibine mesaj gönderme,
   - etkinlik sonrası güven değerlendirmesi.

## Bilinen riskler ve ertelenen işler

- Fotoğrafların gerçek cihazda görüntülenmesi henüz yeni paket için doğrulanmadı.
- Semtteki kullanıcılara push bildirimleri sırayla gönderiliyor; kullanıcı sayısı büyüyünce kuyruk sistemi gerekir.
- Konum filtresi kazayla açık adres paylaşımını azaltır ancak niyetli kullanıcıyı tamamen engelleyemez.
- Google ile giriş isteniyor fakat henüz etkin değil.
- Push sağlayıcısı tam olarak yapılandırılmadı.
- Veteriner doğrulaması, klinik profilleri, nöbetçi veteriner ve ücretli klinik üyeliği B2B aşamasına bırakıldı.

## Sonraki ürün paketleri

### Premium görsel dönüşüm — kullanıcı tarafından onaylandı

- Onaylanan tasarım yönü: sıcak, modern ve seçkin “şehirli köpek kulübü”.
- Ana renkler: sıcak krem, kömür siyahı, koyu orman yeşili, bakır ve yumuşak adaçayı.
- Emoji ikonlar yerine tutarlı profesyonel çizgi ikonları.
- Büyük, gerçek ve kaliteli köpek fotoğrafları.
- Daha güçlü editoryal başlık hiyerarşisi ve rafine tipografi.
- Daha az etiket; yalnızca karar vermeye yardımcı olan bilgiler gösterilecek.
- İnce çerçeveler, yumuşak gölgeler ve dengeli 16–24 px boşluk sistemi.
- Ana sayfa: kişiselleştirilmiş karşılama, büyük köpek görseli, günlük plan, bakım/aşı hatırlatması ve hızlı yürüyüş daveti.
- Keşfet: büyük fotoğraf kartları, belirgin uyum skoru ve sade filtreleme.
- Etkinlikler: sinematik kapak fotoğrafı, kapasite, tarih/saat ve bakır renkli güçlü katılım butonu.
- Profil, mesajlar, Güvenli Topluluk, Köpeğimin Günlüğü, giriş/onboarding ve ayarlar ekranları aynı görsel dile dönüştürülecek.
- Profesyonel açılış ekranı, uygulama ikonu, boş durum illüstrasyonları ve yükleme durumları hazırlanacak.
- Hafif geçiş animasyonları ve dokunma geri bildirimleri eklenecek.
- Erişilebilir kontrast, okunabilir yazı boyutları ve tutarlı alt navigasyon korunacak.
- Premium tasarım bütün ekranlara uygulanmadan önce ana sayfa, Keşfet ve Etkinlikler referans ekranları esas alınacak.
- Onaylanan üç ekranlı referans görsel: `design/patimeet-premium-ui-reference-v1.png`.
- Nihai amiral gemisi tasarım hedefi: PatiMeet Privé 11/10 konsepti.
- Ana referans görsel: `design/patimeet-prive-flagship-11of10-v1.png`.

### Canlı Yürüyüş ve Aktivite Takibi

#### İlk sürüm

- GPS ile gerçek zamanlı rota çizimi.
- Süre, mesafe, tempo ve yaklaşık kalori takibi.
- Yürüyüşü başlatma, duraklatma, sürdürme ve bitirme.
- Haftalık yürüyüş hedefleri ve geçmiş yürüyüşler.
- Yürüyüşe fotoğraf veya anı ekleme.
- Başlangıç ve bitiş noktalarını gizleyerek mahremiyet koruması.
- Tamamlanan yürüyüşün Pati Günlüğü'ne otomatik kaydı.
- Paylaşılabilir premium yürüyüş özet kartı.

#### İkinci aşama

- Kullanıcının açık izniyle güvenilen kişiye süreli canlı konum paylaşımı.
- Yakındaki uygun yürüyüş arkadaşlarının yalnızca yaklaşık bölgede gösterilmesi.
- Canlı arkadaş görünümü, davet ve birlikte yürüyüş oturumu.
- Arka planda konum, pil tüketimi, bağlantı kesintisi ve acil durum senaryoları için cihaz testleri.
- Kesin ev konumunun hiçbir sosyal ekranda gösterilmemesi.

### Bireysel kullanım — Köpeğimin Günlüğü

- Aşı ve sonraki doz takibi.
- İç/dış parazit ve ilaç takvimi.
- Veteriner randevuları ve sağlık notları.
- Kilo ve gelişim grafiği.
- Mama, su ve alerji kayıtları.
- Yürüyüş/aktivite hedefleri.
- Uyku, tuvalet ve davranış günlüğü.
- Banyo, tırnak, diş ve tüy bakım takvimi.
- Aşı karnesi, reçete, tahlil, pasaport ve çip belgeleri.
- Fotoğraflı anılar, acil durum kartı ve aylık bakım özeti.

### Sosyal/topluluk

- Mahalle Akışı.
- Hızlı Yürüyüş Daveti.
- Köpek Oyun Grupları.
- Düzenli topluluk etkinlikleri.
- Yardımlaşma ilanları.
- Soru-cevap/forum.
- Köpek dostu mekân önerileri.
- Kullanıcı değerlendirmesi, şikâyet ve engelleme.
- Topluluk görevleri ve gönüllülük etkinlikleri.

## Çalışma ilkesi

- Kullanıcı yeni inceleme notlarını tamamladıktan sonra ilgili paket topluca uygulanır.
- Canlıya dağıtım ve yeni APK, kod incelemesi ve test doğrulamasından sonra yapılır.
- Gizli anahtarlar, tokenlar ve parolalar hiçbir dokümana veya GitHub commit'ine eklenmez.

## 19 Ağustos 2026 — duraklatma noktası

- Kullanıcı isteğiyle geliştirme burada durduruldu.
- Kodun tek doğrulanmış referansı: `claude/bu-mvp-mobile-design-4qt3zc` dalındaki `b7fa1d8` commit'i.
- Claude'a paralel görev verilmedi; aynı özelliğin ikinci ekranı, tablosu veya kaydı oluşturulmadı.
- Telefonda kurulu APK, `53afd2c` sürümünden üretildi; `b7fa1d8` telefon yerleşimi düzeltmelerini henüz içermez.
- Yeni APK başlatılmadı. Sonraki kullanıcı inceleme notları tamamlanınca tüm düzeltmeler tek pakette toplanacak ve yalnızca bir yeni APK üretilecek.
- Devam ederken önce bu dosya ve uzak dal kontrol edilecek; başka bir çalışma dalından doğrudan özellik kopyalanmayacak.

## 20 Ağustos 2026 — bütün ekranların Privé dönüşümü

- Telefon görüntüleri ile mobil uygulamadaki tüm ana, detay, form, ayar, sohbet, yasal belge ve topluluk ekranları yeniden denetlendi.
- Yerel başlıkla uygulama içi başlığın üst üste binmesi kaldırıldı; sekme dışındaki ekranlar tek bir ortak Privé geri başlığı kullanıyor.
- Gizli başlıklı ekranlara Android ve iOS güvenli üst alanı eklendi.
- Profil, köpek, etkinlik ve topluluk formlarında ortak editoryal giriş hiyerarşisi uygulandı.
- Fotoğraf seçimi; orman yeşili sinematik boş durum, profesyonel semboller, ince bakır ayrıntı ve tutarlı kart yüzeyiyle yenilendi.
- Kullanıcı arayüzündeki kalan dekoratif emojiler profesyonel sembol veya sade tipografik ayrıntıyla değiştirildi.
- Sohbet başlığı, mesaj güvenlik eylemi, tarih seçici, köpek yönetimi, engellenenler, bildirim ayarları ve yasal metin ekranları aynı görsel sisteme alındı.
- Mobil TypeScript denetimi temiz geçti.
- API test paketleri başarıyla geçti; mevcut ürün davranışında gerileme görülmedi.
- Expo üretim exportları başarılı: web 972 modül, Android 1400 modül, iOS 1264 modül.
- Playwright görsel otomasyonu yerel tarayıcı sürüm uyumsuzluğu nedeniyle çalıştırılamadı; cihazdaki eski ekran görüntülerinde bulunan sistemik sorunlar doğrudan kodda giderildi.
- Yeni APK bu turda oluşturulmadı. Sonraki cihaz paketi bu ekran dönüşümünü ve önceki telefon yerleşimi düzeltmelerini birlikte içerecek.
