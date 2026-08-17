import { Router } from 'express';
import { asyncRoute, notFound } from '../http';

/**
 * Yasal metinler ve topluluk kuralları. Uygulama içinden erişilebilir olmaları
 * yayına hazır kabul kriterlerinden biri. Metinler taslaktır; yayın öncesi
 * hukuk onayından geçmelidir.
 */
const DOCUMENTS: Record<string, { title: string; updatedAt: string; body: string }> = {
  terms: {
    title: 'Kullanıcı Sözleşmesi',
    updatedAt: '2026-01-01',
    body: `PatiMeet, köpek sahiplerinin birbirini bulmasını ve yürüyüş buluşmaları düzenlemesini sağlayan bir topluluk uygulamasıdır.

1. Hesap
Uygulamayı kullanmak için 18 yaşından büyük olmanız ve verdiğiniz bilgilerin doğru olması gerekir. Hesabınızın güvenliğinden siz sorumlusunuz.

2. Kullanım kuralları
Uygulama flört veya arkadaşlık uygulaması değildir. Rahatsız edici davranış, taciz, reklam, sahte profil ve hayvana kötü muamele yasaktır. Bu kurallara aykırı hesaplar uyarı yapılmadan kapatılabilir.

3. Buluşmalar
Etkinlikler kullanıcılar tarafından oluşturulur. PatiMeet buluşmaların düzenleyicisi değildir; buluşmalara katılım kendi sorumluluğunuzdadır. Köpeğinizin sağlık ve aşı durumundan siz sorumlusunuz.

4. İçerik
Yüklediğiniz fotoğraf ve metinlerin haklarına sahip olduğunuzu beyan edersiniz. Kurallara aykırı içerikler kaldırılabilir.

5. Sorumluluğun sınırı
PatiMeet, kullanıcılar arasındaki etkileşimlerden ve buluşmalarda yaşanabilecek olaylardan sorumlu tutulamaz.

6. Sözleşme değişiklikleri
Sözleşme güncellenebilir. Önemli değişiklikler uygulama içinden bildirilir.`,
  },
  privacy: {
    title: 'KVKK Aydınlatma Metni ve Gizlilik Politikası',
    updatedAt: '2026-01-01',
    body: `Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında hazırlanmıştır.

1. İşlenen veriler
E-posta adresi, ad, semt, profil fotoğrafı, kısa açıklama, kullanım amacı, köpek profili bilgileri, oluşturduğunuz ve katıldığınız etkinlikler, mesaj içerikleri ve şikâyet kayıtları.

2. İşleme amaçları
Hesabınızı oluşturmak, yakınınızdaki kullanıcıları ve etkinlikleri göstermek, mesajlaşmayı sağlamak, topluluk güvenliğini korumak ve şikâyetleri incelemek.

3. Konum
Tam konumunuz veya açık adresiniz diğer kullanıcılarla paylaşılmaz. Keşif ve etkinlik listeleri yalnızca sizin seçtiğiniz semt bilgisine dayanır.

4. Paylaşım
Verileriniz, hizmetin çalışması için kullanılan altyapı sağlayıcıları dışında üçüncü taraflarla paylaşılmaz, reklam amacıyla satılmaz.

5. Saklama
Verileriniz hesabınız aktif olduğu sürece saklanır. Hesap silme talebinde bulunduğunuzda hesabınız kapatılır ve içerikleriniz diğer kullanıcılara gösterilmez.

6. Haklarınız
Verilerinize erişme, düzeltilmesini veya silinmesini isteme haklarınız vardır. Talepleriniz için uygulama içindeki hesap silme akışını kullanabilir veya destek adresimize yazabilirsiniz.`,
  },
  community: {
    title: 'Topluluk Kuralları',
    updatedAt: '2026-01-01',
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
Ürün, hizmet veya işletme tanıtımı MVP kapsamında değildir.

6. Bildir
Kural ihlali gördüğünde şikâyet et veya kullanıcıyı engelle. Şikâyetler gizli tutulur.`,
  },
  safety: {
    title: 'İlk Buluşma Güvenlik Önerileri',
    updatedAt: '2026-01-01',
    body: `İlk kez tanıştığın biriyle buluşurken:

• Kalabalık ve açık alanları seç. Park, sahil veya bilinen bir yürüyüş rotası iyi bir başlangıçtır.
• Adresini paylaşma. Buluşma noktası olarak evinin önünü değil, ortak bir kamusal noktayı öner.
• Yakınına haber ver. Nerede, kiminle ve kaça kadar buluşacağını bir arkadaşına söyle.
• Köpekleri ilk anda serbest bırakma. Tanışmayı tasmalı ve kontrollü başlat.
• Rahatsız olursan ayrıl. Açıklama yapmak zorunda değilsin; kullanıcıyı engelleyip şikâyet edebilirsin.
• Aşı ve sağlık beyanları kullanıcı beyanıdır; PatiMeet tarafından doğrulanmaz.`,
  },
};

export const legalRouter = Router();

legalRouter.get(
  '/',
  asyncRoute((_req, res) => {
    res.json({
      documents: Object.entries(DOCUMENTS).map(([slug, doc]) => ({
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
    const doc = DOCUMENTS[req.params.slug];
    if (!doc) throw notFound('Belge bulunamadı.');
    res.json({ slug: req.params.slug, ...doc });
  })
);
