import { Router } from 'express';
import { z } from 'zod';
import { signToken } from '../auth';
import { config } from '../config';
import { db, nowMs } from '../db';
import {
  GoogleNotConfiguredError,
  type GoogleIdentity,
  type GoogleVerifier,
} from '../domain/google';
import { privateUser, type UserRow } from '../domain/serialize';
import { ApiError, asyncRoute, parseBody, unauthorized } from '../http';
import { newId } from '../ids';

const googleSchema = z.object({
  idToken: z.string().trim().min(1, 'Google kimlik bilgisi eksik.'),
  /**
   * Yeni hesap oluşturulacaksa sözleşme onayları zorunludur. Mevcut hesaba
   * girişte gönderilmesi gerekmez.
   */
  acceptTerms: z.boolean().optional(),
  acceptPrivacy: z.boolean().optional(),
});

interface GoogleAuthResult {
  token: string;
  user: ReturnType<typeof privateUser>;
  isNewUser: boolean;
  /** Mevcut bir e-posta hesabı bu Google hesabına bağlandıysa true. */
  linkedExistingAccount: boolean;
  /** Eşleştirme sırasında şifre girişi kapatıldıysa true. */
  passwordLoginDisabled: boolean;
}

/**
 * Doğrulanmış Google kimliğini bir PatiMeet hesabına çevirir.
 *
 * Sıra önemli: önce Google kimliğiyle (`google_id`) bağlı hesap aranır, sonra
 * e-posta ile eşleştirme yapılır, en son yeni hesap açılır.
 */
function resolveAccount(
  identity: GoogleIdentity,
  consents: { acceptTerms?: boolean; acceptPrivacy?: boolean }
): GoogleAuthResult {
  const ts = nowMs();

  const byGoogleId = db
    .prepare<[string], UserRow>('SELECT * FROM users WHERE google_id = ?')
    .get(identity.googleId);

  if (byGoogleId) {
    assertUsable(byGoogleId);
    // E-posta Google tarafında değişmiş olabilir; kalıcı kimlik `sub` olduğu
    // için hesabı koruyup e-postayı güncelliyoruz.
    if (byGoogleId.email !== identity.email) {
      const emailOwner = db
        .prepare<[string, string], { id: string }>(
          'SELECT id FROM users WHERE email = ? AND id != ?'
        )
        .get(identity.email, byGoogleId.id);

      // Yeni e-posta başka bir hesapta kullanılıyorsa dokunmuyoruz; kullanıcı
      // eski e-postasıyla çalışmaya devam eder.
      if (!emailOwner) {
        db.prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?').run(
          identity.email,
          ts,
          byGoogleId.id
        );
      }
    }

    return {
      token: signToken(byGoogleId.id),
      user: privateUser(reload(byGoogleId.id)),
      isNewUser: false,
      linkedExistingAccount: false,
      passwordLoginDisabled: byGoogleId.password_disabled_at !== null,
    };
  }

  const byEmail = db
    .prepare<[string], UserRow>('SELECT * FROM users WHERE email = ?')
    .get(identity.email);

  if (byEmail) {
    assertUsable(byEmail);

    /**
     * Hesap eşleştirme güvenliği.
     *
     * E-posta ile kayıtta e-posta sahipliği doğrulanmıyor (MVP'de doğrulama
     * akışı yok). Bu yüzden biri başkasının adresiyle şifreli hesap açmış
     * olabilir. Google ise e-postayı doğrulamış durumda, yani gerçek sahip
     * Google ile gelen kişidir.
     *
     * Hesabı ona bağlıyoruz ve önceden belirlenmiş şifre girişini kapatıyoruz;
     * aksi halde adresi önceden kaydeden kişi hesaba erişmeye devam ederdi.
     * Hesabın e-postası zaten doğrulanmışsa şifre korunur.
     */
    const alreadyVerified = byEmail.email_verified_at !== null;
    const hasPassword = byEmail.password_hash !== null;
    const disablePassword = hasPassword && !alreadyVerified;

    db.prepare(
      `UPDATE users
          SET google_id = ?,
              email_verified_at = COALESCE(email_verified_at, ?),
              password_hash = CASE WHEN ? THEN NULL ELSE password_hash END,
              password_disabled_at = CASE WHEN ? THEN ? ELSE password_disabled_at END,
              name = CASE WHEN name = '' THEN ? ELSE name END,
              photo_url = COALESCE(photo_url, ?),
              updated_at = ?
        WHERE id = ?`
    ).run(
      identity.googleId,
      ts,
      disablePassword ? 1 : 0,
      disablePassword ? 1 : 0,
      ts,
      identity.name ?? '',
      identity.picture ?? null,
      ts,
      byEmail.id
    );

    return {
      token: signToken(byEmail.id),
      user: privateUser(reload(byEmail.id)),
      isNewUser: false,
      linkedExistingAccount: true,
      passwordLoginDisabled: disablePassword,
    };
  }

  // Yeni hesap: sözleşme ve KVKK onayı zorunlu.
  if (consents.acceptTerms !== true || consents.acceptPrivacy !== true) {
    throw new ApiError(
      409,
      'consent_required',
      'Devam etmek için Kullanıcı Sözleşmesi ve KVKK Aydınlatma Metni onayı gerekiyor.'
    );
  }

  const id = newId();
  db.prepare(
    `INSERT INTO users
       (id, email, password_hash, provider, provider_id, google_id, name, photo_url,
        email_verified_at, terms_accepted_at, privacy_accepted_at, created_at, updated_at)
     VALUES (?, ?, NULL, 'google', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    identity.email,
    identity.googleId,
    identity.googleId,
    identity.name ?? '',
    identity.picture ?? null,
    ts,
    ts,
    ts,
    ts,
    ts
  );

  return {
    token: signToken(id),
    user: privateUser(reload(id)),
    isNewUser: true,
    linkedExistingAccount: false,
    passwordLoginDisabled: false,
  };
}

function reload(userId: string): UserRow {
  return db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?').get(userId)!;
}

function assertUsable(user: UserRow): void {
  if (user.status !== 'active') {
    throw unauthorized('Hesabınız aktif değil. Destek ile iletişime geçin.');
  }
}

/**
 * Google ile giriş uçları. Doğrulayıcı dışarıdan verilir; böylece testler
 * gerçek Google servisine çıkmadan tüm iş kurallarını sınayabilir ve
 * production yolunda hiçbir atlama (bypass) bulunmaz.
 */
export function createGoogleRouter(verifier: GoogleVerifier | null): Router {
  const router = Router();

  /** İstemci, Google butonunu göstermeden önce yapılandırmayı sorar. */
  router.get(
    '/config',
    asyncRoute((_req, res) => {
      res.json({
        enabled: verifier !== null,
        // İstemci kendi platform kimliğini .env'den okur; burada yalnızca
        // özelliğin açık olup olmadığını bildiriyoruz.
        configuredClientCount: config.googleClientIds.length,
      });
    })
  );

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      if (!verifier) throw new GoogleNotConfiguredError();

      const input = parseBody(googleSchema, req.body);
      const identity = await verifier.verify(input.idToken);

      const result = resolveAccount(identity, {
        acceptTerms: input.acceptTerms,
        acceptPrivacy: input.acceptPrivacy,
      });

      res.status(result.isNewUser ? 201 : 200).json(result);
    })
  );

  return router;
}
