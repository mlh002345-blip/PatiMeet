import { Router } from 'express';
import { config } from '../config';
import { asyncRoute, notFound } from '../http';

/**
 * Yasal metinler ve topluluk kuralları.
 *
 * Hem uygulama içinden hem de kimlik doğrulaması olmadan web üzerinden
 * erişilebilirler: App Store ve Google Play, gizlilik politikasının herkese
 * açık bir adreste yayınlanmasını ister (bkz. /legal/privacy.html).
 *
 * Metinler taslaktır; yayın öncesi hukuk onayından geçmelidir.
 */
const UPDATED_AT = '2026-08-17';

interface LegalDocument {
  title: string;
  updatedAt: string;
  body: string;
}

function documents(): Record<string, LegalDocument> {
  const support = config.supportEmail;

  return {
    terms: {
      title: 'Kullanıcı Sözleşmesi',
      updatedAt: UPDATED_AT,
      body: `PatiMeet, köpek sahiplerinin birbirini bulmasını ve yürüyüş buluşmaları düzenlemesini sağlayan bir topluluk uygulamasıdır.

1. Hesap
Uygulamayı kullanmak için 18 yaşından büyük olmanız ve verdiğiniz bilgilerin doğru olması gerekir. Hesabınızın güvenliğinden siz sorumlusunuz. E-posta, Google veya Apple ile giriş yapabilirsiniz.

2. Kullanım kuralları
Uygulama flört veya arkadaşlık uygulaması değildir. Rahatsız edici davranış, taciz, reklam, sahte profil ve hayvana kötü muamele yasaktır. Bu kurallara aykırı hesaplar uyarı yapılmadan kapatılabilir.

3. Buluşmalar
Etkinlikler kullanıcılar tarafından oluşturulur. PatiMeet buluşmaların düzenleyicisi değildir; buluşmalara katılım kendi sorumluluğunuzdadır. Köpeğinizin sağlık ve aşı durumundan siz sorumlusunuz.

4. Uyum skoru ve öneriler
Uygulamadaki uyum skoru, yalnızca sizin ve diğer kullanıcının girdiği bilgilere (boyut, enerji, sosyallik, yaş, semt, kullanım amacı) dayanan basit bir hesaplamadır. Sağlık, güvenlik, mizaç veya uyum garantisi değildir ve veterinerlik ya da eğitim tavsiyesi yerine geçmez.

5. İçerik
Yüklediğiniz fotoğraf ve metinlerin haklarına sahip olduğunuzu beyan edersiniz. Kurallara aykırı içerikler kaldırılabilir.

6. Kayıp köpek ilanları
Kayıp ilanları kullanıcı beyanına dayanır. PatiMeet ilanların doğruluğunu doğrulamaz ve bulunma garantisi vermez.

7. Sorumluluğun sınırı
PatiMeet, kullanıcılar arasındaki etkileşimlerden ve buluşmalarda yaşanabilecek olaylardan sorumlu tutulamaz.

8. Hesabın kapatılması
Hesabınızı uygulama içinden (Profil > Hesabımı sil) dilediğiniz zaman silebilirsiniz. Kurallara aykırı kullanımda hesabınızı kapatma hakkımızı saklı tutarız.

9. Sözleşme değişiklikleri
Sözleşme güncellenebilir. Önemli değişiklikler uygulama içinden bildirilir.

İletişim: ${support}`,
    },

    privacy: {
      title: 'KVKK Aydınlatma Metni ve Gizlilik Politikası',
      updatedAt: UPDATED_AT,
      body: `Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında hazırlanmıştır ve mağaza gizlilik gereklilikleri için de geçerlidir.

1. Veri sorumlusu
PatiMeet. İletişim: ${support}

2. İşlenen veriler
• Hesap: e-posta adresi, giriş yöntemi (e-posta / Google / Apple), sağlayıcı kullanıcı kimliği
• Profil: ad, semt, kısa açıklama, kullanım amacı, profil fotoğrafı
• Köpek profili: ad, cins, yaş, boyut, enerji, sosyallik, açıklama, aşı beyanı, fotoğraf
• Etkinlik: oluşturduğunuz ve katıldığınız etkinlikler, buluşma noktası açıklaması
• İletişim: mesaj içerikleri
• Güvenlik: şikâyet ve engelleme kayıtları
• Teknik: cihaz push bildirim jetonu, uygulama sürümü, hata kayıtları

3. İşleme amaçları
Hesabınızı oluşturmak, yakınınızdaki kullanıcıları ve etkinlikleri göstermek, mesajlaşmayı sağlamak, bildirim göndermek, topluluk güvenliğini korumak ve şikâyetleri incelemek.

4. Hukuki dayanak
Sözleşmenin kurulması ve ifası, açık rızanız (bildirimler ve isteğe bağlı profil alanları) ve meşru menfaat (güvenlik, kötüye kullanımın önlenmesi).

5. Konum
Tam konumunuz veya açık adresiniz toplanmaz ve paylaşılmaz. Keşif, etkinlik ve harita görünümleri yalnızca sizin seçtiğiniz semt bilgisine dayanır. Harita üzerinde semt merkezine yakın yaklaşık bir bölge gösterilir; bu bölge gerçek konumunuzu göstermez. Cihazın GPS konumu istenmez.

6. Fotoğraflar
Yüklediğiniz fotoğraflar obje depolama hizmetinde saklanır ve tahmin edilemeyen adreslerle sunulur. Fotoğrafınızı uygulama içinden kaldırabilirsiniz; kaldırdığınızda depodan da silinir.

7. Bildirimler
Push bildirimi göndermek için cihaz jetonu saklanır. Bildirim izni vermeyebilir veya sonradan kapatabilirsiniz; uygulama bildirim olmadan da çalışır. Bildirim türlerini Profil > Bildirimler bölümünden yönetebilirsiniz.

8. Paylaşım
Verileriniz, hizmetin çalışması için kullanılan altyapı sağlayıcıları (veritabanı, obje depolama, bildirim iletimi) dışında üçüncü taraflarla paylaşılmaz, reklam amacıyla satılmaz.

9. Saklama
Verileriniz hesabınız aktif olduğu sürece saklanır. Hesabınızı sildiğinizde profil bilgileriniz, fotoğraflarınız ve köpek profilleriniz silinir; mesaj gövdeleriniz kaldırılır. Konuşma iskeleti, karşı tarafın sohbet geçmişi bozulmasın ve sürmekte olan bir şikâyet incelemesi tamamlanabilsin diye kısa süre korunur.

10. Haklarınız
Verilerinize erişme, düzeltilmesini veya silinmesini isteme haklarınız vardır.
• Erişim: uygulama içinden verilerinizin bir özetini görebilirsiniz
• Düzeltme: Profil ve köpek profili ekranlarından
• Silme: Profil > Hesabımı sil
Ayrıca ${support} adresine yazabilirsiniz.

11. Çocuklar
Uygulama 18 yaşından küçüklere yönelik değildir ve bilerek onlardan veri toplamaz.`,
    },

    community: {
      title: 'Topluluk Kuralları',
      updatedAt: UPDATED_AT,
      body: `PatiMeet güvenli ve dostane bir topluluk olsun diye birkaç net kuralımız var.

1. Burası flört uygulaması değil
PatiMeet köpekler için oyun ve yürüyüş arkadaşı bulma amacıyla kullanılır. Romantik yaklaşımlar ve ısrarlı mesajlar kural ihlalidir.

2. Saygılı ol
Hakaret, ayrımcılık, taciz ve tehdit kesinlikle yasak.

3. Köpeğin önce gelir
Aşıları eksik, hasta veya saldırgan davranış gösteren köpekleri grup buluşmalarına getirme. Tasmayı buluşma kurallarına göre kullan.

4. Gerçek ol
Kendi fotoğrafını ve gerçek bilgilerini kullan. Sahte profil açmak yasak.

5. Reklam yapma
Ürün, hizmet veya işletme tanıtımı bu uygulamanın amacı dışındadır.

6. Kayıp ilanlarını doğru kullan
Kayıp köpek ilanları yalnızca gerçek kayıp durumları için açılmalı. Bulunduğunda ilanı kapat.

7. Adres paylaşma
Buluşma noktası olarak kamusal alanlar tarif et; ev adresini kimseyle paylaşma.

8. Bildir
Kural ihlali gördüğünde şikâyet et veya kullanıcıyı engelle. Şikâyetler gizli tutulur ve karşı tarafa bildirilmez.

Kuralları ihlal eden hesaplar uyarılabilir, kısıtlanabilir veya kapatılabilir.`,
    },

    safety: {
      title: 'İlk Buluşma Güvenlik Önerileri',
      updatedAt: UPDATED_AT,
      body: `İlk kez tanıştığın biriyle buluşurken:

• Kalabalık ve açık alanları seç. Park, sahil veya bilinen bir yürüyüş rotası iyi bir başlangıçtır.
• Adresini paylaşma. Buluşma noktası olarak evinin önünü değil, ortak bir kamusal noktayı öner.
• Yakınına haber ver. Nerede, kiminle ve kaça kadar buluşacağını bir arkadaşına söyle.
• Köpekleri ilk anda serbest bırakma. Tanışmayı tasmalı ve kontrollü başlat.
• Rahatsız olursan ayrıl. Açıklama yapmak zorunda değilsin; kullanıcıyı engelleyip şikâyet edebilirsin.
• Aşı ve sağlık beyanları kullanıcı beyanıdır; PatiMeet tarafından doğrulanmaz.
• Uyum skoru yalnızca profil bilgilerine dayanan bir tahmindir; köpeklerin gerçek uyumunu buluşmada gözlemle.
• Buluşma sonrası deneyimini değerlendir. Bir sorun yaşadıysan bildir; topluluğu bu geri bildirimler korur.`,
    },
  };
}

export const legalRouter = Router();

legalRouter.get(
  '/',
  asyncRoute((_req, res) => {
    res.json({
      documents: Object.entries(documents()).map(([slug, doc]) => ({
        slug,
        title: doc.title,
        updatedAt: doc.updatedAt,
      })),
    });
  })
);

legalRouter.get(
  '/:slug',
  asyncRoute((req, res) => {
    const slug = req.params.slug.replace(/\.html$/, '');
    const doc = documents()[slug];
    if (!doc) throw notFound('Belge bulunamadı.');

    /**
     * `.html` uzantısı ile çağrıldığında tarayıcıda okunabilir sayfa döner.
     * Mağaza formlarına verilecek herkese açık gizlilik politikası adresi budur.
     */
    if (req.params.slug.endsWith('.html')) {
      res.type('html').send(renderHtml(doc));
      return;
    }

    res.json({ slug, ...doc });
  })
);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(doc: LegalDocument): string {
  const paragraphs = doc.body
    .split('\n\n')
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)} · PatiMeet</title>
<style>
  body { margin:0; background:#FBF6EF; color:#2A2430;
    font:16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 40px 24px 80px; }
  h1 { color:#5B3E8E; font-size:28px; margin:0 0 4px; }
  .updated { color:#9A93A2; font-size:14px; margin:0 0 32px; }
  p { margin:0 0 18px; }
  a { color:#5B3E8E; }
  .brand { font-size:15px; font-weight:700; color:#5B3E8E; margin-bottom:24px; }
</style>
</head>
<body>
<main>
  <div class="brand">🐾 PatiMeet</div>
  <h1>${escapeHtml(doc.title)}</h1>
  <p class="updated">Son güncelleme: ${escapeHtml(doc.updatedAt)}</p>
  ${paragraphs}
</main>
</body>
</html>`;
}
