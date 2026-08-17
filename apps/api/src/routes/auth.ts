import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, signToken } from '../auth';
import { db, nowMs } from '../db';
import { privateUser, type UserRow } from '../domain/serialize';
import { asyncRoute, badRequest, conflict, parseBody, unauthorized } from '../http';
import { newId } from '../ids';

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
  asyncRoute((req, res) => {
    const input = parseBody(registerSchema, req.body);

    const existing = db
      .prepare<[string], { id: string }>('SELECT id FROM users WHERE email = ?')
      .get(input.email);
    if (existing) {
      throw conflict('Bu e-posta adresi ile bir hesap zaten var.', 'email_taken');
    }

    const ts = nowMs();
    const id = newId();
    db.prepare(
      `INSERT INTO users
         (id, email, password_hash, provider, terms_accepted_at, privacy_accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, 'email', ?, ?, ?, ?)`
    ).run(id, input.email, bcrypt.hashSync(input.password, 10), ts, ts, ts, ts);

    const row = db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?').get(id)!;
    res.status(201).json({ token: signToken(id), user: privateUser(row) });
  })
);

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Şifre gerekli.'),
});

authRouter.post(
  '/login',
  asyncRoute((req, res) => {
    const input = parseBody(loginSchema, req.body);

    const row = db
      .prepare<[string], UserRow & { password_hash: string | null }>(
        'SELECT * FROM users WHERE email = ?'
      )
      .get(input.email);

    // Hesabın var olup olmadığını sızdırmamak için tek bir genel mesaj kullanıyoruz.
    const invalid = unauthorized('E-posta veya şifre hatalı.');
    if (!row || !row.password_hash) throw invalid;
    if (!bcrypt.compareSync(input.password, row.password_hash)) throw invalid;
    if (row.status !== 'active') {
      throw unauthorized('Hesabınız aktif değil. Destek ile iletişime geçin.');
    }

    res.json({ token: signToken(row.id), user: privateUser(row) });
  })
);

/**
 * Google / Apple ile giriş. MVP'de doğrulanmış kimlik bilgisi mobil SDK
 * tarafından alınır ve buraya iletilir; sunucu tarafında hesap eşleştirme
 * yapılır. Sağlayıcı imza doğrulaması yayın öncesi eklenecek adımdır.
 */
const socialSchema = z.object({
  provider: z.enum(['google', 'apple']),
  providerId: z.string().trim().min(1, 'Sağlayıcı kimliği gerekli.'),
  email: emailSchema,
  name: z.string().trim().max(80).optional(),
});

authRouter.post(
  '/social',
  asyncRoute((req, res) => {
    const input = parseBody(socialSchema, req.body);
    const ts = nowMs();

    let row = db
      .prepare<[string], UserRow>('SELECT * FROM users WHERE email = ?')
      .get(input.email);

    if (!row) {
      const id = newId();
      db.prepare(
        `INSERT INTO users
           (id, email, provider, provider_id, name, terms_accepted_at, privacy_accepted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, input.email, input.provider, input.providerId, input.name ?? '', ts, ts, ts, ts);
      row = db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?').get(id)!;
    } else if (row.status !== 'active') {
      throw unauthorized('Hesabınız aktif değil. Destek ile iletişime geçin.');
    }

    res.json({ token: signToken(row.id), user: privateUser(row) });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const row = db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?').get(me.id)!;
    res.json({ user: privateUser(row) });
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
 * Hesap silme talebi. KVKK gereği kullanıcı uygulama içinden talep
 * oluşturabilmeli; hesap anında pasife alınır ve içerikleri gizlenir.
 */
authRouter.post(
  '/delete-account',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const confirm = z.object({ confirm: z.literal(true) });
    const parsed = confirm.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Hesap silme işlemi için onay gerekli.', 'confirmation_required');
    }

    const ts = nowMs();
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE users SET status = 'deleted', deletion_requested_at = ?, updated_at = ? WHERE id = ?`
      ).run(ts, ts, me.id);
      db.prepare(`UPDATE dogs SET status = 'deleted', updated_at = ? WHERE owner_id = ?`).run(
        ts,
        me.id
      );
      db.prepare(
        `UPDATE events SET status = 'cancelled', updated_at = ? WHERE owner_id = ? AND status = 'active'`
      ).run(ts, me.id);
      db.prepare('DELETE FROM event_participants WHERE user_id = ?').run(me.id);
    });
    tx();

    res.json({ ok: true, message: 'Hesabınız silinmek üzere kapatıldı.' });
  })
);
