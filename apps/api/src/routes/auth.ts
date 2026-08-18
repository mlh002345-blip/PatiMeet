import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, signToken } from '../auth';
import { getDb, nowMs } from '../db';
import { privateUser, type UserRow } from '../domain/serialize';
import { asyncRoute, badRequest, conflict, parseBody, unauthorized } from '../http';
import { newId } from '../ids';
import { deleteAllUserMedia } from '../domain/media';

export const authRouter = Router();

const emailSchema = z
  .string()
  .trim()
  .min(1, 'E-posta adresi gerekli.')
  .email('Geçerli bir e-posta adresi girin.')
  .transform((v) => v.toLowerCase());

const passwordSchema = z.string().min(8, 'Şifre en az 8 karakter olmalı.').max(128);

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Kullanıcı Sözleşmesi onayı zorunludur.' }),
  }),
  acceptPrivacy: z.literal(true, {
    errorMap: () => ({ message: 'KVKK Aydınlatma Metni onayı zorunludur.' }),
  }),
});

authRouter.post(
  '/register',
  asyncRoute(async (req, res) => {
    const db = getDb();
    const input = parseBody(registerSchema, req.body);

    const existing = await db.one<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      input.email,
    ]);
    if (existing) {
      throw conflict('Bu e-posta adresi ile bir hesap zaten var.', 'email_taken');
    }

    const ts = nowMs();
    const id = newId();
    await db.exec(
      `INSERT INTO users
         (id, email, password_hash, provider, terms_accepted_at, privacy_accepted_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'email', $4, $4, $4, $4)`,
      [id, input.email, bcrypt.hashSync(input.password, 10), ts]
    );

    const row = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    res.status(201).json({ token: signToken(id), user: await privateUser(row!) });
  })
);

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Şifre gerekli.'),
});

authRouter.post(
  '/login',
  asyncRoute(async (req, res) => {
    const input = parseBody(loginSchema, req.body);

    const row = await getDb().one<UserRow>('SELECT * FROM users WHERE email = $1', [input.email]);

    // Hesabın var olup olmadığını sızdırmamak için tek bir genel mesaj kullanıyoruz.
    const invalid = unauthorized('E-posta veya şifre hatalı.');
    if (!row) throw invalid;

    /**
     * Şifresi olmayan hesaplar: ya bir sağlayıcı ile açılmış ya da hesap
     * eşleştirmede şifre girişi kapatılmış. Kullanıcıyı boşuna uğraştırmamak
     * için doğru yöntemi söylüyoruz — hesabın varlığı sağlayıcı butonuyla
     * zaten belli.
     */
    if (!row.password_hash) {
      if (row.google_id) {
        throw unauthorized('Bu hesap Google ile bağlı. "Google ile devam et" ile giriş yapın.');
      }
      if (row.apple_id) {
        throw unauthorized('Bu hesap Apple ile bağlı. "Apple ile devam et" ile giriş yapın.');
      }
      throw invalid;
    }
    if (!bcrypt.compareSync(input.password, row.password_hash)) throw invalid;
    if (row.status !== 'active') {
      throw unauthorized('Hesabınız aktif değil. Destek ile iletişime geçin.');
    }

    res.json({ token: signToken(row.id), user: await privateUser(row) });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const row = await getDb().one<UserRow>('SELECT * FROM users WHERE id = $1', [me.id]);
    res.json({ user: await privateUser(row!) });
  })
);

/**
 * Oturum kapatma. Token'lar durumsuz olduğu için sunucu tarafında yapılacak bir
 * iş yok; istemci token'ı siler. Uç, istemci akışını basit tutmak için var.
 */
authRouter.post(
  '/logout',
  requireAuth,
  asyncRoute((_req, res) => {
    res.json({ ok: true });
  })
);

/**
 * Kullanıcının verilerinin bir özetini döner (KVKK / GDPR erişim hakkı).
 *
 * Mağaza incelemelerinde "kullanıcı verilerine erişim" maddesi için de
 * gereklidir. Yalnızca kendi verisini içerir.
 */
authRouter.get(
  '/my-data',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);

    const [user, dogs, events, participations, messages, reports, blocks] = await Promise.all([
      db.one('SELECT id, email, name, district, bio, purpose, purposes, created_at FROM users WHERE id = $1', [
        me.id,
      ]),
      db.query('SELECT id, name, breed, size, energy, sociability, bio FROM dogs WHERE owner_id = $1', [
        me.id,
      ]),
      db.query('SELECT id, title, starts_at, district, status FROM events WHERE owner_id = $1', [
        me.id,
      ]),
      db.query(
        `SELECT e.id, e.title, e.starts_at FROM event_participants p
           JOIN events e ON e.id = p.event_id
          WHERE p.user_id = $1`,
        [me.id]
      ),
      db.query(
        `SELECT m.id, m.body, m.created_at FROM messages m
          WHERE m.sender_id = $1 ORDER BY m.created_at`,
        [me.id]
      ),
      db.query('SELECT id, target_type, reason, status, created_at FROM reports WHERE reporter_id = $1', [
        me.id,
      ]),
      db.query('SELECT blocked_id, created_at FROM blocks WHERE blocker_id = $1', [me.id]),
    ]);

    res.json({
      exportedAt: nowMs(),
      user,
      dogs,
      eventsCreated: events,
      eventsJoined: participations,
      messagesSent: messages,
      reportsFiled: reports,
      blockedUsers: blocks,
    });
  })
);

/**
 * Hesap ve veri silme.
 *
 * KVKK ve mağaza gerekliliği: kullanıcı uygulama içinden hesabını
 * silebilmelidir. İki aşamalı davranıyoruz:
 *   - Kişisel içerik hemen silinir veya anonimleştirilir
 *   - Hesap kapatılır ve diğer kullanıcılara görünmez olur
 *
 * Mesaj gövdeleri silinir ancak konuşma iskeleti korunur: karşı tarafın
 * sohbeti tamamen kaybolmasın ve bir şikâyet incelemesi sürüyorsa bağlam
 * kopmasın diye. Bu davranış gizlilik politikasında da açıklanıyor.
 */
authRouter.post(
  '/delete-account',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);

    const confirm = z.object({ confirm: z.literal(true) });
    const parsed = confirm.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Hesap silme işlemi için onay gerekli.', 'confirmation_required');
    }

    // Obje deposundaki fotoğraflar veritabanı dışında; ayrıca silinmeli.
    await deleteAllUserMedia(me.id);

    const ts = nowMs();
    await db.tx(async (t) => {
      await t.exec(
        `UPDATE users
            SET status = 'deleted',
                deletion_requested_at = $1,
                -- Kişisel alanlar temizlenir; e-posta tekilliği için yer tutucuya çevrilir.
                email = 'deleted+' || id || '@patimeet.invalid',
                password_hash = NULL,
                google_id = NULL,
                apple_id = NULL,
                name = 'Silinmiş kullanıcı',
                bio = '',
                district = NULL,
                purpose = NULL,
                purposes = '{}',
                photo_url = NULL,
                updated_at = $1
          WHERE id = $2`,
        [ts, me.id]
      );

      await t.exec(`UPDATE dogs SET status = 'deleted', photo_url = NULL, updated_at = $1 WHERE owner_id = $2`, [
        ts,
        me.id,
      ]);
      await t.exec(
        `UPDATE events SET status = 'cancelled', updated_at = $1 WHERE owner_id = $2 AND status = 'active'`,
        [ts, me.id]
      );
      await t.exec('DELETE FROM event_participants WHERE user_id = $1', [me.id]);
      await t.exec(
        `UPDATE messages SET body = '(silinmiş mesaj)' WHERE sender_id = $1`,
        [me.id]
      );
      // Cihaz token'ları hemen iptal edilir; silinen hesaba bildirim gitmez.
      await t.exec('DELETE FROM push_tokens WHERE user_id = $1', [me.id]);
    });

    res.json({
      ok: true,
      message:
        'Hesabınız kapatıldı ve kişisel bilgileriniz silindi. Sizi aramızda görmekten mutluluk duyardık.',
    });
  })
);
