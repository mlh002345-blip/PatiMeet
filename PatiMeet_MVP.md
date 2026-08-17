# PatiMeet MVP Belgesi

## 1. Ürün Özeti

**PatiMeet**, köpek sahiplerinin yakınlarındaki köpekleri keşfetmesini, yürüyüş ve buluşma etkinlikleri oluşturmasını, etkinliklere katılmasını ve güvenli biçimde iletişim kurmasını sağlayan mobil öncelikli bir sosyal topluluk uygulamasıdır.

**Ana vaat:** Köpeğine yakınında oyun ve yürüyüş arkadaşı bul.

## 2. MVP'nin Amacı

İlk sürüm, kullanıcının aşağıdaki temel yolculuğu sorunsuz tamamlamasını sağlamalıdır:

1. Hesap oluşturmak
2. Kendisi ve köpeği için profil oluşturmak
3. Yakındaki köpekleri keşfetmek
4. Bir yürüyüş etkinliği oluşturmak veya mevcut bir etkinliğe katılmak
5. Başka bir kullanıcıyla mesajlaşmak
6. Gerektiğinde kullanıcıyı şikâyet etmek veya engellemek

## 3. Hedef Kullanıcı

- Köpeğine oyun veya yürüyüş arkadaşı arayanlar
- Yakın çevresindeki köpek sahipleriyle tanışmak isteyenler
- Grup yürüyüşlerine ve köpek buluşmalarına katılmak isteyenler
- Kendi semtinde etkinlik oluşturmak isteyenler

## 4. MVP Kapsamı

### 4.1 Kayıt ve giriş

- E-posta ile kayıt ve giriş
- Google veya Apple ile giriş seçeneklerinden, teknik olarak en hızlı uygulanabilen biri
- Kullanıcı Sözleşmesi ve KVKK Aydınlatma Metni onayı
- Oturumu kapatma
- Hesabı silme talebi

### 4.2 Kullanıcı profili

- Profil fotoğrafı
- Ad
- Semt
- Kısa açıklama
- Kullanım amacı
- Profil düzenleme

### 4.3 Köpek profili

- Fotoğraf
- Ad
- Cins
- Yaş
- Boyut
- Enerji seviyesi
- Sosyallik seviyesi
- Kısa açıklama
- Aşı durumuna ilişkin kullanıcı beyanı
- Profil düzenleme

İlk kullanımda yalnızca gerekli alanlar zorunlu tutulmalıdır. Ayrıntılar daha sonra tamamlanabilmelidir.

### 4.4 Yakındaki köpekleri keşfetme

- Kullanıcının seçtiği semte göre köpek profillerini listeleme
- Köpek ve sahibi için profil detayını görüntüleme
- Boyut, enerji seviyesi ve semte göre temel filtreleme
- Mesaj gönderme
- Etkinliğe davet etme
- Şikâyet etme ve engelleme

Tam konum veya açık adres diğer kullanıcılara gösterilmemelidir.

### 4.5 Etkinlikler

- Yakındaki etkinlikleri listeleme
- Etkinlik detayını görüntüleme
- Etkinlik oluşturma
- Etkinliğe katılma ve katılımdan ayrılma
- Katılımcı listesini görüntüleme
- Etkinlik sahibine mesaj gönderme
- Etkinliği şikâyet etme

Etkinlik alanları:

- Başlık
- Etkinlik türü
- Tarih ve saat
- Semt ve buluşma noktası açıklaması
- Katılımcı sınırı
- Uygun köpek boyutu
- Açıklama ve kurallar

### 4.6 Mesajlaşma

- Konuşma listesi
- Bire bir metin mesajı gönderme ve alma
- Okunmamış mesaj göstergesi
- Konuşmadan kullanıcı profiline geçiş
- Kullanıcıyı şikâyet etme veya engelleme

Dosya gönderme, sesli mesaj, sesli arama ve görüntülü arama MVP kapsamında değildir.

### 4.7 Güvenlik

- Kullanıcı şikâyet etme
- Kullanıcı engelleme
- Etkinlik şikâyet etme
- Şikâyet nedeni ve açıklama alanı
- Topluluk kuralları
- İlk buluşmalar için güvenlik uyarısı
- Engellenen kullanıcının mesaj göndermesini ve profili görüntülemesini önleme

## 5. Ana Ekranlar

MVP için hedef ekran sayısı 14'tür:

1. Açılış
2. Kayıt/giriş
3. Kullanıcı profili oluşturma
4. Köpek profili oluşturma
5. Semt seçimi
6. Ana sayfa
7. Keşfet
8. Köpek ve sahip profil detayı
9. Etkinlik listesi
10. Etkinlik detayı
11. Etkinlik oluşturma
12. Mesaj listesi
13. Sohbet
14. Profil ve ayarlar

Şikâyet ve engelleme işlemleri ayrı tam ekranlar yerine modal veya alt panel olarak uygulanabilir.

## 6. Ana Sayfa Yapısı

Ana sayfa kullanıcıyı doğrudan temel aksiyonlara yönlendirmelidir:

- Yakındaki köpekleri keşfet
- Yakındaki etkinliklere katıl
- Yürüyüş oluştur
- Yaklaşan etkinliklerim
- Profil tamamlama uyarısı

Alt menü:

1. Ana Sayfa
2. Keşfet
3. Etkinlikler
4. Mesajlar
5. Profil

## 7. Tasarım İlkeleri

- Mobil öncelikli ve responsive yapı
- Modern, sıcak, sade ve güven veren görünüm
- Flört uygulaması izleniminden kaçınma
- Köpekleri görsel olarak ön plana çıkarma
- Yuvarlak köşeler ve kart tabanlı arayüz
- Açık krem arka plan, koyu lila vurgu rengi ve yüksek okunabilirlik
- Az adımlı formlar ve güçlü CTA butonları
- Türkçe arayüz
- Boş, yükleniyor, hata ve başarı durumlarının tasarlanması

## 8. Temel Veri Varlıkları

- Kullanıcı
- Köpek profili
- Etkinlik
- Etkinlik katılımı
- Konuşma
- Mesaj
- Şikâyet
- Engellenen kullanıcı

## 9. Temel İş Kuralları

- Bir kullanıcı MVP'de en az bir köpek profiline sahip olmalıdır.
- Kullanıcı yalnızca aktif ve engellenmemiş profilleri görebilir.
- Engellenen kullanıcılar birbirine mesaj gönderemez ve birbirlerinin profillerini göremez.
- Etkinlik katılımcı sayısı belirlenen sınırı aşamaz.
- Geçmiş tarihli etkinlik oluşturulamaz.
- Yalnızca etkinlik sahibi etkinliği düzenleyebilir veya iptal edebilir.
- Kullanıcının tam konumu paylaşılmaz; keşif için semt veya yaklaşık bölge kullanılır.
- Silinen veya pasife alınan içerikler diğer kullanıcılara gösterilmez.

## 10. Yönetim ve Moderasyon

İlk sürüm için özel moderasyon paneli geliştirilmiştir. Kullanıcılar, etkinlikler ve şikâyetler bu panelden kontrol edilebilir.

Yayımdan önce aşağıdaki işlemler mümkün olmalıdır:

- Kullanıcıyı pasife alma
- Etkinliği kaldırma
- Şikâyeti inceleme
- İçeriği silme veya gizleme

## 11. MVP Dışında Bırakılanlar

- Harita tabanlı canlı konum
- Veteriner ve pet-friendly mekân rehberi
- İşletme hesapları ve B2B özellikleri
- Pati Topluluğu forumu
- Reklam ve sponsorlu içerik
- Ödeme ve abonelik
- Fotoğraf, dosya veya sesli mesaj gönderme
- Sesli ve görüntülü arama

## 12. MVP Başarı Ölçütleri

- Kayıt olan kullanıcının köpek profilini tamamlayabilmesi
- Kullanıcının yakınındaki köpekleri görebilmesi
- Etkinlik oluşturma ve katılma akışlarının hatasız çalışması
- İki kullanıcının mesajlaşabilmesi
- Şikâyet ve engelleme işlemlerinin uygulanabilmesi
- Kullanıcının ana aksiyonlara en fazla üç dokunuşta ulaşabilmesi
- Mobil cihazlarda kritik görsel veya işlevsel hata bulunmaması

## 13. Yayına Hazır Kabul Kriterleri

- Tüm temel kullanıcı akışları gerçek veriyle çalışıyor
- Form doğrulamaları ve anlaşılır hata mesajları mevcut
- Yükleniyor, boş ve bağlantı hatası durumları ele alınmış
- Yetkisiz kullanıcılar korumalı sayfalara erişemiyor
- Konum bilgisi açık adres olarak paylaşılmıyor
- Şikâyet ve engelleme uçtan uca çalışıyor
- Kullanıcı Sözleşmesi, KVKK metni ve Topluluk Kuralları erişilebilir
- Gizlilik politikası ve hesap silme yöntemi mevcut
- Production build hatasız tamamlanıyor
- Kritik akışlar mobil ekranlarda test edilmiş
- Demo ve boş başlangıç durumları doğru görüntüleniyor
- Yayın ortamı değişkenleri ve kurulum bilgileri belgelenmiş

## 14. Yayın Önceliği

Geliştirme sırası:

1. Kayıt ve profil oluşturma
2. Köpek profili
3. Keşfet ve profil detayı
4. Etkinlik oluşturma ve katılım
5. Mesajlaşma
6. Şikâyet ve engelleme
7. Ayarlar ve yasal metinler
8. Mobil test, hata düzeltme ve production build

## 15. MVP Sonrası İlk Geliştirmeler

İlk kullanıcı geri bildirimlerine göre değerlendirilecek özellikler:

1. **Pati Topluluğu:** kontrollü forum; soru, deneyim paylaşımı, kategoriler, yanıt, beğeni, şikâyet ve moderasyon
2. **Veteriner B2B ağı:** doğrulanmış klinik profilleri, nöbetçi/açık durumu, randevu, arama ve yönlendirme
3. Klinikler için ücretli abonelik, bölgesel öne çıkarma ve performans istatistikleri
4. Veteriner Hekimler Odası kaydı + Google Places + klinik doğrulamasından oluşan hibrit veri modeli
5. Pet-friendly mekân rehberi

## 16. Güncel Uygulama ve Altyapı Durumu

- Kayıp köpek ilanı, yaklaşık bölge özeti ve etkinlik sonrası güvenlik değerlendirmesi tamamlandı.
- Açıklanabilir uyum skoru, anlık bildirimler, çoklu köpek profili ve moderasyon paneli tamamlandı.
- Etkinlik kapak fotoğrafları dış bağlantı yerine PatiMeet obje deposuna yükleniyor.
- Cloudflare R2 üzerinde özel `patimeet-media` kovası oluşturuldu; public access kapalı ve Standard sınıfında.
- R2 erişim anahtarları kullanıcı tarafından güvenli biçimde saklandı; **anahtarlar repoya veya bu belgeye yazılmadı**.
- Canlı sunucuda kullanılması gereken değişkenler: `STORAGE_DRIVER=s3`, `S3_BUCKET=patimeet-media`, `S3_REGION=auto`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; `S3_PUBLIC_BASE_URL` şimdilik boş kalacak.
- Sıradaki adım: canlı API sunucusu ve PostgreSQL veritabanı kurulumu, ardından R2 anahtarlarının sunucunun gizli ayarlarına girilmesi.

---

**MVP'nin temel hedefi:** Kullanıcının güvenli biçimde köpek profili oluşturması, yakınındaki topluluğu keşfetmesi ve gerçek bir yürüyüş buluşmasına katılmasıdır.
