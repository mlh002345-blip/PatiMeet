# Claude Görevi — PatiMeet Privé Faz 1

## Amaç

Mevcut çalışan özellikleri ve API sözleşmelerini bozmadan mobil uygulamanın görsel temelini kullanıcı tarafından onaylanan **PatiMeet Privé 11/10** tasarım yönüne taşı.

Bu fazın odağı kodlanabilir, tekrar kullanılabilir tasarım sistemi ile ana navigasyon ve ilk üç amiral gemisi ekrandır. Forum ve veteriner/B2B özellikleri bu görevin kesinlikle dışındadır.

## Başlamadan önce zorunlu kontroller

1. Çalışma dalı `claude/bu-mvp-mobile-design-4qt3zc` ve başlangıç commit'i en az `d998cdf` olmalı.
2. Çalışma ağacındaki kullanıcıya ait takip edilmeyen dosyaları silme veya ezme:
   - `DEVAM_NOTU.md`
   - `design/`
   - bu görev belgesi
3. `apps/mobile/AGENTS.md` talimatına uy ve kod yazmadan önce Expo SDK 57'nin kesin sürüm belgelerini oku: `https://docs.expo.dev/versions/v57.0.0/`.
4. Mevcut API davranışlarını, route adreslerini, veri modellerini ve güvenlik kontrollerini değiştirme.
5. Büyük bir bağımlılık ekleme. Yeni bağımlılık gerçekten gerekliyse önce mevcut Expo 57 paketleriyle çözüm olmadığını kanıtla.

## Görsel kaynaklar

- Ana ve bağlayıcı hedef: `design/patimeet-prive-flagship-11of10-v1.png`
- Önceki yardımcı referans: `design/patimeet-premium-ui-reference-v1.png`

Ana referans, ekran görüntüsünün birebir kopyası değil; tasarım sisteminin yönüdür. Gerçek uygulama erişilebilir, performanslı ve küçük ekranlarda kullanılabilir kalmalı.

## Tasarım ilkeleri

- Marka: şehirli köpek sahiplerine özel, güvenilir dijital kulüp ve kişisel köpek concierge'i.
- Palet: kemik beyazı, sıcak fildişi, koyu botanik/orman yeşili, obsidyen ve ölçülü oksitlenmiş bakır.
- PatiLine: ince bakır rota çizgisi; dekorasyon olarak değil, ilerleme/rota/zaman çizgisi anlatımı için kullan.
- Tek ekranda tek ana odak ve tek baskın eylem.
- Emoji ikonları profesyonel `expo-symbols` ikonlarıyla değiştir.
- Büyük ve kaliteli gerçek köpek fotoğrafı; fotoğraf yoksa zarif, tutarlı fallback.
- Kart kalabalığını azalt; güçlü hiyerarşi, 16–24 px boşluk ve ince sınırlar kullan.
- Aşırı glassmorphism, yüksek gölgeler, parlak gradient, çocukça pati süsleri ve genel SaaS görünümünden kaçın.
- Türkçe metinleri kısa, doğal ve doğru yaz.
- iOS, Android ve web'de okunabilir kontrast; sistem font ölçekleme ve en az 44 px dokunma alanı.

## Teknik kapsam

### 1. Tasarım sistemi

`apps/mobile/src/theme.ts` ve ortak UI bileşenlerini geriye uyumlu biçimde geliştir:

- Gündüz teması tokenları: ivory/background/surface/forest/obsidian/copper.
- Gece teması tokenları için ileride kullanılabilir yapı; bu fazda kullanıcı tema seçimi zorunlu değil.
- Tipografi rolleri: editorial display, title, heading, body, label, caption ve metric.
- Tutarlı spacing, radius, border, shadow/elevation ve overlay tokenları.
- Ortak bileşenler: premium button, editorial section header, icon action, metric/progress, image hero, subtle badge, surface/card.
- Mevcut bileşen çağrılarını kırma; gerekirse eski prop'ları destekleyen uyumluluk katmanı kullan.

Harici font dosyası eklemeden önce lisans ve Expo 57 uyumluluğunu doğrula. Uygun font yoksa platform serif + sistem sans kombinasyonuyla güvenli fallback oluştur.

### 2. Alt navigasyon

Mevcut beş ana route'u koru; işlev kaybı veya derin bağlantı kırılması olmasın.

- Görsel etiketleri tasarım yönüne yaklaştır: `Bugün`, `Keşfet`, `Etkinlikler/Kulüp`, `Mesajlar`, `Pati/Profil`.
- Hangi label seçilirse seçilsin mevcut route adları değişmemeli.
- Obsidyen/ivory yüzey, ölçülü bakır aktif durum ve profesyonel semboller.
- Okunmamış mesaj rozeti çalışmaya devam etmeli.
- Güvenli alan ve küçük Android ekranları test edilmeli.

### 3. Bugün ana ekranı

`apps/mobile/app/(tabs)/home.tsx` ekranını yeniden düzenle:

- Kişisel selamlama: `Günaydın/İyi günler/İyi akşamlar, {kullanıcı adı}`.
- Köpek fotoğrafını merkez alan sinematik hero; mevcut `dog.photoUrl` veya mevcut veri alanını güvenli biçimde kullan.
- `Pati'nin günü hazır` hissi: günlük kısa özet ve tek baskın CTA.
- Ana CTA bu fazda mevcut işlevlerden güvenli birine bağlanmalı; sahte GPS özelliği çalışıyormuş gibi gösterilmemeli. Canlı yürüyüş hazır değilse `Yürüyüş planla` veya açıkça `Yakında` çözümü kullan.
- Profil tamamlama, etkinlik, keşfet ve Güvenli Topluluk işlevleri korunmalı fakat editoryal, daha az kalabalık bir hiyerarşide sunulmalı.
- Acil/Güvenli Topluluk içeriği görsel dekor uğruna aşağı gömülmemeli.
- Yükleme, hata, boş ve yenileme durumları korunmalı.

### 4. Keşfet ekranı

Mevcut keşfet, filtre, uyum ve mesajlaşma davranışlarını koruyarak:

- Büyük fotoğraf odaklı editoryal kartlar.
- Uyum skoru, doğrulama ve yaklaşık mesafe/bölge güçlü ama sade gösterim.
- Yalnızca karar vermeye yardım eden 3–4 özellik etiketi.
- `Tanış`/mesaj veya mevcut güvenli aksiyon açık biçimde görünmeli.
- Fotoğrafsız kullanıcılar için premium fallback.
- Filtre erişimi kaybolmamalı; çoklu `Ne arıyorsun?` verileri korunmalı.

### 5. Etkinlikler/Kulüp ekranı

Mevcut etkinlik oluşturma, listeleme, katılma ve detay davranışlarını koruyarak:

- `Kulüp` hissi veren sinematik etkinlik kartları.
- Kapak fotoğrafı, tarih/saat, yaklaşık bölge, kapasite ve güven işaretleri.
- Tek baskın eylem: `Yerini ayır` veya mevcut katılım eyleminin doğru durumu.
- Yaklaşan/kayıtlı etkinlik ayrımı net kalmalı.
- Fotoğraf yoksa tutarlı premium fallback kullanılmalı.

## Bu fazda yapılmayacaklar

- Canlı GPS yürüyüş takibi veya sahte rota verisi.
- Köpeğimin Günlüğü veri modeli.
- Forum/soru-cevap.
- Veteriner, nöbetçi veteriner, klinik profili veya B2B.
- Google/Apple OAuth yapılandırması.
- API migration'ı veya yeni backend özelliği.
- Mevcut Güvenli Topluluk veri modelini yeniden yazma.

## Kabul kriterleri

1. Ana ekran, Keşfet ve Etkinlikler/Kulüp aynı PatiMeet Privé tasarım sistemini kullanıyor.
2. Ana referanstaki ivory/forest/obsidian/copper karakteri açık biçimde hissediliyor.
3. Emoji tabanlı ana ikonografi kaldırılmış; erişilebilir semboller kullanılıyor.
4. Mevcut işlevler, route'lar, filtreler, katılım, bildirim rozeti ve hata/boş durumları çalışıyor.
5. Ekranlarda sahte veya henüz uygulanmamış özellik çalışıyormuş gibi gösterilmiyor.
6. Android, iOS ve web export/typecheck başarılı.
7. Mevcut API ve E2E paketinde bu UI değişikliğinin etkilediği kontroller başarılı.
8. Küçük Android ekranında taşma, kesik CTA veya alt bar çakışması yok.
9. Değişiklikler odaklı commit(ler) halinde mevcut dala push edilir.

## Doğrulama ve rapor

- Önce mevcut package scriptlerini incele; uydurma komut kullanma.
- Mobil TypeScript kontrolünü çalıştır.
- Web, iOS ve Android production export doğrulamalarını çalıştır.
- İlgili E2E kontrollerini çalıştır.
- Mümkünse üç ekranın render/screenshot kanıtını üret.
- Son raporda değişen dosyaları, test sonuçlarını, bilinen sınırlamaları ve commit hash'ini yaz.
- Push reddedilirse force push yapma; önce uzak değişiklikleri incele ve kullanıcı/Codex çalışmasını ezmeden birleştir.

