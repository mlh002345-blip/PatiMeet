import { Router } from 'express';
import { z } from 'zod';
import { signToken } from '../auth';
import { getDb, nowMs, type Db } from '../db';
import { privateUser, type UserRow } from './serialize';
import { ApiError, asyncRoute, badRequest, parseBody, unauthorized } from '../http';
import { newId } from '../ids';

export type SocialProvider = 'google' | 'apple';

/** Doğrulanmış sağlayıcı kimliği. Her iki sağlayıcı bu biçime indirgenir. */
export interface SocialIdentity {
  provider: SocialProvider;
  /** Sağlayıcının kalıcı kullanıcı kimliği (`sub`). E-posta değişse bile sabit. */
  subject: string;
  /**
   * E-posta. Apple, tekrar girişlerde token'da e-posta göndermeyebilir; bu
   * durumda `null` gelir ve eşleştirme yalnızca `subject` üzerinden yapılır.
   */
  email: string | null;
  emailVerified: boolean;
  name?: string | null;
  picture?: string | null;
  /** Apple "Mail'imi Gizle" ile üretilmiş özel yönlendirme adresi mi? */
  isPrivateEmail?: boolean;
}

export interface SocialVerifier {
  readonly provider: SocialProvider;
  verify(idToken: string): Promise<SocialIdentity>;
}

/** Yapılandırma eksikse istemciye anlaşılır bir mesaj dönmek için. */
export class SocialNotConfiguredError extends ApiError {
  constructor(provider: SocialProvider) {
    const label = provider === 'google' ? 'Google' : 'Apple';
    super(
      503,
      `${provider}_not_configured`,
      `${label} ile giriş bu sunucuda yapılandırılmamış. Lütfen e-posta ile giriş yapın.`
    );
  }
}

/** Sağlayıcı başına hesap eşleştirme kolonu. */
const SUBJECT_COLUMN: Record<SocialProvider, 'google_id' | 'apple_id'> = {
  google: 'google_id',
  apple: 'apple_id',
};

export interface SocialAuthResult {
  token: string;
  user: Awaited<ReturnType<typeof privateUser>>;
  isNewUser: boolean;
  /** Mevcut bir e-posta hesabı bu sağlayıcıya bağlandıysa true. */
  linkedExistingAccount: boolean;
  /** Eşleştirme sırasında şifre girişi kapatıldıysa true. */
  passwordLoginDisabled: boolean;
}

function assertUsable(user: UserRow): void {
  if (user.status !== 'active') {
    throw unauthorized('Hesabınız aktif değil. Destek ile iletişime geçin.');
  }
}

async function reload(db: Db, userId: string): Promise<UserRow> {
  const row = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!row) throw new ApiError(500, 'user_reload_failed', 'Hesap okunamadı.');
  return row;
}

/**
 * Doğrulanmış sağlayıcı kimliğini bir PatiMeet hesabına çevirir.
 *
 * Sıra önemli:
 *   1. Sağlayıcı kimliğiyle (`google_id` / `apple_id`) bağlı hesap
 *   2. E-posta ile eşleştirme (mevcut hesabı sağlayıcıya bağlar)
 *   3. Yeni hesap
 *
 * Google ve Apple aynı fonksiyonu kullanır; hesap ele geçirme kuralları tek
 * yerde durur.
 */
export async function resolveSocialAccount(
  identity: SocialIdentity,
  consents: { acceptTerms?: boolean; acceptPrivacy?: boolean },
  db: Db = getDb()
): Promise<SocialAuthResult> {
  const column = SUBJECT_COLUMN[identity.provider];

  return db.tx(async (t) => {
    const ts = nowMs();

    // --- 1. Sağlayıcı kimliğiyle bağlı hesap ---
    const bySubject = await t.one<UserRow>(`SELECT * FROM users WHERE ${column} = $1`, [
      identity.subject,
    ]);

    if (bySubject) {
      assertUsable(bySubject);

      // E-posta sağlayıcı tarafında değişmiş olabilir; kalıcı kimlik `sub`
      // olduğu için hesabı koruyup e-postayı güncelliyoruz.
      if (identity.email && bySubject.email !== identity.email) {
        const emailOwner = await t.one<{ id: string }>(
          'SELECT id FROM users WHERE email = $1 AND id != $2',
          [identity.email, bySubject.id]
        );

        // Yeni e-posta başka bir hesapta kullanılıyorsa dokunmuyoruz; kullanıcı
        // eski e-postasıyla çalışmaya devam eder.
        if (!emailOwner) {
          await t.exec('UPDATE users SET email = $1, updated_at = $2 WHERE id = $3', [
            identity.email,
            ts,
            bySubject.id,
          ]);
        }
      }

      return {
        token: signToken(bySubject.id),
        user: await privateUser(await reload(t, bySubject.id), t),
        isNewUser: false,
        linkedExistingAccount: false,
        passwordLoginDisabled: bySubject.password_disabled_at !== null,
      };
    }

    // --- 2. E-posta ile eşleştirme ---
    const byEmail = identity.email
      ? await t.one<UserRow>('SELECT * FROM users WHERE email = $1', [identity.email])
      : undefined;

    if (byEmail) {
      assertUsable(byEmail);

      /**
       * Hesap eşleştirme güvenliği.
       *
       * E-posta ile kayıtta e-posta sahipliği doğrulanmıyor (MVP'de doğrulama
       * akışı yok). Bu yüzden biri başkasının adresiyle şifreli hesap açmış
       * olabilir. Sağlayıcı ise e-postayı doğrulamış durumda, yani gerçek sahip
       * sağlayıcı ile gelen kişidir.
       *
       * Hesabı ona bağlıyoruz ve önceden belirlenmiş şifre girişini kapatıyoruz;
       * aksi halde adresi önceden kaydeden kişi hesaba erişmeye devam ederdi.
       * Hesabın e-postası zaten doğrulanmışsa şifre korunur.
       */
      const alreadyVerified = byEmail.email_verified_at !== null;
      const hasPassword = byEmail.password_hash !== null;
      const disablePassword = hasPassword && !alreadyVerified;

      await t.exec(
        `UPDATE users
            SET ${column} = $1,
                email_verified_at = COALESCE(email_verified_at, $2),
                password_hash = CASE WHEN $3 THEN NULL ELSE password_hash END,
                password_disabled_at = CASE WHEN $3 THEN $2 ELSE password_disabled_at END,
                name = CASE WHEN name = '' THEN $4 ELSE name END,
                photo_url = COALESCE(photo_url, $5),
                updated_at = $2
          WHERE id = $6`,
        [
          identity.subject,
          ts,
          disablePassword,
          identity.name ?? '',
          identity.picture ?? null,
          byEmail.id,
        ]
      );

      return {
        token: signToken(byEmail.id),
        user: await privateUser(await reload(t, byEmail.id), t),
        isNewUser: false,
        linkedExistingAccount: true,
        passwordLoginDisabled: disablePassword,
      };
    }

    // --- 3. Yeni hesap ---
    /**
     * Apple, ilk yetkilendirmede e-postayı token'a koyar; sonraki girişlerde
     * koymayabilir. Eşleşen hesap da yoksa yeni hesabı e-postasız açamayız
     * (e-posta zorunlu ve tekil bir alan). Kullanıcıya ne yapacağını söylüyoruz.
     */
    if (!identity.email) {
      throw new ApiError(
        409,
        'social_email_missing',
        'Hesap oluşturmak için e-posta bilgisi alınamadı. iOS Ayarlar > Apple Kimliği > ' +
          'Şifre ve Güvenlik > Apple ile Oturum Açma bölümünden PatiMeet iznini kaldırıp ' +
          'tekrar deneyin.'
      );
    }

    if (consents.acceptTerms !== true || consents.acceptPrivacy !== true) {
      throw new ApiError(
        409,
        'consent_required',
        'Devam etmek için Kullanıcı Sözleşmesi ve KVKK Aydınlatma Metni onayı gerekiyor.'
      );
    }

    const id = newId();
    await t.exec(
      `INSERT INTO users
         (id, email, password_hash, provider, provider_id, ${column}, name, photo_url,
          email_verified_at, terms_accepted_at, privacy_accepted_at, created_at, updated_at)
       VALUES ($1, $2, NULL, $3, $4, $4, $5, $6, $7, $7, $7, $7, $7)`,
      [
        id,
        identity.email,
        identity.provider,
        identity.subject,
        identity.name ?? '',
        identity.picture ?? null,
        ts,
      ]
    );

    return {
      token: signToken(id),
      user: await privateUser(await reload(t, id), t),
      isNewUser: true,
      linkedExistingAccount: false,
      passwordLoginDisabled: false,
    };
  });
}

const socialSchema = z.object({
  idToken: z.string().trim().min(1, 'Kimlik bilgisi eksik.'),
  /**
   * Yeni hesap oluşturulacaksa sözleşme onayları zorunludur. Mevcut hesaba
   * girişte gönderilmesi gerekmez.
   */
  acceptTerms: z.boolean().optional(),
  acceptPrivacy: z.boolean().optional(),
  /**
   * Apple, adı yalnızca ilk yetkilendirmede ve token dışında (istek gövdesinde)
   * verir. İstemci varsa iletir; token'daki bilgiye göre önceliği düşüktür.
   */
  fullName: z.string().trim().max(80).optional(),
});

/**
 * Sosyal giriş uçları. Doğrulayıcı dışarıdan verilir; böylece testler gerçek
 * sağlayıcı servisine çıkmadan tüm iş kurallarını sınayabilir ve production
 * yolunda hiçbir atlama (bypass) bulunmaz.
 */
export function createSocialRouter(
  verifier: SocialVerifier | null,
  provider: SocialProvider,
  configuredClientCount: number
): Router {
  const router = Router();

  /** İstemci, sağlayıcı butonunu göstermeden önce yapılandırmayı sorar. */
  router.get(
    '/config',
    asyncRoute((_req, res) => {
      res.json({ enabled: verifier !== null, configuredClientCount });
    })
  );

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      if (!verifier) throw new SocialNotConfiguredError(provider);

      const input = parseBody(socialSchema, req.body);
      const identity = await verifier.verify(input.idToken);

      const result = await resolveSocialAccount(
        {
          ...identity,
          // Token'da ad yoksa istemcinin ilettiği adı kullan (Apple akışı).
          name: identity.name ?? input.fullName ?? null,
        },
        { acceptTerms: input.acceptTerms, acceptPrivacy: input.acceptPrivacy }
      );

      res.status(result.isNewUser ? 201 : 200).json(result);
    })
  );

  return router;
}

export { badRequest };
