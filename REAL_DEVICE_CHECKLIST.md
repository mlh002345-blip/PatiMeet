# Gerçek Cihaz Doğrulama Kontrol Listesi

Bu belge, web tabanlı E2E testleriyle **tam doğrulanamayan** özellikler için
gerçek Android/iOS cihazında yapılması gereken kontrolleri listeler. Gerçek
GPS, arka plan konumu, push bildirimi dokunma davranışı, kamera ve dosya
seçici gibi yetenekler tarayıcı ortamında taklit edilemez; bu kalemlerin
"E2E'den geçti" diye tamamlanmış sayılmaması gerekir.

Her madde işaretlendiğinde tarih ve cihaz (model + OS sürümü) not düşün.

## 1. Canlı Yürüyüş — ön plan GPS

- [ ] Gerçek bir yürüyüşte rota, mesafe ve tempo makul değerler üretiyor
- [ ] Uygulama arka plana alınıp geri getirildiğinde kuyruklanan noktalar
      gönderiliyor (bkz. `FLUSH_MS` toplu gönderim, `apps/mobile/app/(tabs)/live-walk.tsx`)
- [ ] Uçak modu açılıp kapatıldığında yürüyüş bozulmuyor, noktalar birikip
      bağlantı gelince gönderiliyor
- [ ] Aynı toplu gönderim (batch) ağ hatası sonrası tekrar denendiğinde
      sunucuda çift kayıt oluşmuyor (idempotency; bkz. migration `0011`)
- [ ] Duraklat/devam et gerçek cihazda beklendiği gibi çalışıyor

**Bilinen sınır — bu turda kapsam dışı bırakıldı:** Uygulama tamamen arka
plandayken (ekran kapalı, uygulama askıya alınmış) GPS takibinin devam etmesi
için `expo-task-manager` + Android foreground service + iOS arka plan konum
yetkilendirmesi gerekir. Bu, mevcut ön-plan `watchPositionAsync` akışının
kapsamlı bir native yeniden yapılandırmasını gerektirir ve gerçek cihazda
denenmeden (bu ortamda EAS/cihaz erişimi yok) güvenle uygulanamaz — yanlış
yapılırsa bugün çalışan yürüyüş takibini bozma riski taşır. Uygulanmadı;
ayrı bir görev olarak ele alınmalı.

## 2. Canlı Yürüyüş — sosyal/paylaşım

- [ ] `Süreli canlı konum paylaşımı` (walk share) gerçek iki cihaz arasında
      denendi; paylaşılan kişi yalnızca son konumu görüyor, tam rotayı değil
- [ ] Paylaşım süresi dolunca gerçekten kapanıyor

**Bilinen sınır:** "Yakındaki uygun yürüyüş arkadaşlarını yaklaşık bölge
seviyesinde gösterme" ve "davet kabul edilince süreli birlikte yürüyüş
oturumu" akışı bu turda **uygulanmadı**. Mevcut `walk_invites` (Hızlı Yürüyüş
Daveti) modeli önceden planlanmış/zamanlı bir buluşmayı temsil ediyor; "şu an
yürüyorum, canlı konumumu bir yabancıyla eşleştir" farklı bir ürün akışı ve
ayrı bir tasarım kararı gerektiriyor. Yanlış varsayımla yarım uygulanması,
mahremiyet kurallarını (kesin koordinatların hiçbir listede dönmemesi) riske
atabileceğinden bilinçli olarak ertelendi.

## 3. Sağlık belgeleri — PDF seçimi

- [ ] iOS'ta "PDF seç" gerçek Dosyalar (Files) uygulamasından bir PDF açıyor
- [ ] Android'de sistem dosya seçicisinden PDF seçilebiliyor
- [ ] Seçilen PDF yükleniyor, listede görünüyor, açılabiliyor
- [ ] Silme onay penceresi gerçek cihazda doğru görünüyor
- [ ] Büyük bir PDF (birkaç MB) yüklenirken makul sürede tamamlanıyor veya
      anlaşılır bir hata veriyor

### 3.1 Belge önizleme (uygulama içi, `/journal/document/[id]`)

- [ ] Belge kartına dokununca tarayıcıya veya başka bir uygulamaya
      çıkılmadan uygulama içinde açılıyor
- [ ] Görsel belge (JPEG/PNG/WebP/HEIC) yakınlaştırılıp kaydırılabiliyor;
      çift dokunuşla yakınlaştırma/eski hâline dönüş çalışıyor
- [ ] PDF belge sayfa sayfa görüntüleniyor; sayfa ileri/geri düğmeleri ve
      "Sayfa X / Y" göstergesi doğru
- [ ] PDF içinde de sıkıştırma (pinch) ile yakınlaştırma çalışıyor
- [ ] Büyük bir PDF açılırken "Belge indiriliyor…" durumu görünüyor, sonra
      görüntüleyiciye geçiyor
- [ ] Uçak modunda belge açmayı denemek anlaşılır bir hata veriyor (deponun
      adı/uç bilgisi görünmüyor)
- [ ] Ekrandan geri çıkıldığında indirilen PDF cihazdan siliniyor — bir dosya
      yöneticisiyle uygulamanın önbellek dizini kontrol edilerek doğrulanabilir
- [ ] Art arda birden fazla farklı PDF belge açılıp kapatıldığında cihazda
      belge biriktirmiyor (yalnızca en son açılanın geçici kopyası kalıyor)
- [ ] Belgenin süreli adresi ağ isteklerinde (ör. bir proxy/inceleme aracıyla)
      yalnızca PatiMeet API'sine ve doğrudan depo sağlayıcısına gidiyor; Google
      Docs Viewer gibi üçüncü bir servise hiçbir istek gitmiyor

## 4. Google / Apple ile giriş

- [ ] Gerçek bir Google hesabıyla giriş tamamlanıyor (iOS + Android)
- [ ] Gerçek Apple ID ile giriş tamamlanıyor (yalnız iOS)
- [ ] "Mail'imi Gizle" ile oluşturulmuş özel Apple e-postası kabul ediliyor
- [ ] Google/Apple istemci kimlikleri tanımlı değilken düğmeler hiç
      görünmüyor (teknik hata göstermiyor)

## 5. Push bildirimleri

- [ ] Uygulama açıkken bildirime dokununca doğru ekrana yönleniyor
      (mesaj, etkinlik, bakım hatırlatması, yürüyüş daveti, güvenlik, topluluk)
- [ ] Uygulama arka plandayken bildirime dokunma aynı şekilde çalışıyor
- [ ] Uygulama tamamen kapalıyken bildirime dokunma uygulamayı doğru ekrana
      açıyor
- [ ] Bildirim izni reddedildiğinde uygulama içi hatırlatmalar (ör. günlük
      sayfasındaki bekleyen bakım listesi) hâlâ çalışıyor
- [ ] Uygulamayı cihazdan kaldırıp tekrar kurunca eski jeton geçersiz
      sayılıyor, yeni jetonla bildirim devam ediyor

## 6. Genel

- [ ] Küçük Android ekranında (ör. 5") yeni/değişen ekranlarda taşma yok
- [ ] Büyük sistem yazı tipi ölçeğinde (Ayarlar → Erişilebilirlik) metinler
      kesilmiyor
- [ ] iOS ve Android'de güvenli alan (safe area) çentik/çentiksiz cihazlarda
      doğru

## Bu turda uygulanmayan kapsamlar (bilinçli erteleme)

Aşağıdakiler `CLAUDE_TASK...` isteğinde yer alıyordu ancak zaman ve risk
dengesi gözetilerek bu pakette **uygulanmadı** — mevcut, çalışan ürünü
bozmamak önceliğiyle bilinçli olarak dışarıda bırakıldı:

- **Arka plan GPS takibi** (foreground service + `expo-task-manager`) — §1
- **Canlı yürüyüş arkadaşı eşleştirme/oturumu** — §2
- **Paket 5 — Mahalle Akışı genişletmeleri**: düzenli/tekrarlayan topluluk
  etkinlikleri, gönüllülük görevleri, köpek dostu mekân önerileri, içerik
  şikâyeti. Mevcut `/alerts`, `/neighbourhood` ve etkinlik sistemleri
  bozulmadan üç yeni alt özelliğin şema + API + mobil ekran tasarımını
  gerektiriyor; bu turda güvenle tamamlanamayacak kadar geniş kapsamlı
  olduğu için ayrı bir görev olarak bırakıldı.
- **CI E2E işinin ilk canlı çalıştırması**: `.github/workflows/android-apk.yml`
  içindeki `e2e` işi bu pakette eklendi ve mantığı yerel olarak gözden
  geçirildi, ancak GitHub Actions çalıştırıcısında gerçek bir çalıştırması bu
  oturumda henüz izlenmedi. İlk gerçek çalıştırmayı izlemek gerekir.
