import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { db, nowMs } from '../db';
import { isBlockedBetween } from '../domain/blocks';
import { privateUser, publicDog, publicUser, type DogRow, type UserRow } from '../domain/serialize';
import { asyncRoute, notFound, parseBody } from '../http';

export const usersRouter = Router();

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı.').max(60).optional(),
  district: z.string().trim().min(2, 'Semt seçin.').max(80).nullable().optional(),
  bio: z.string().trim().max(300, 'Açıklama en fazla 300 karakter olabilir.').optional(),
  purpose: z.enum(['yuruyus', 'oyun', 'sosyal', 'egitim']).nullable().optional(),
  photoUrl: z.string().trim().max(2000).nullable().optional(),
});

/** Kullanıcı profili oluşturma ve düzenleme aynı uç üzerinden yürür. */
usersRouter.patch(
  '/me',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const input = parseBody(profileSchema, req.body);

    const columns: Record<string, string> = {
      name: 'name',
      district: 'district',
      bio: 'bio',
      purpose: 'purpose',
      photoUrl: 'photo_url',
    };

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(columns)) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        params.push(value);
      }
    }

    if (sets.length > 0) {
      sets.push('updated_at = ?');
      params.push(nowMs(), me.id);
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }

    const row = db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?').get(me.id)!;
    res.json({ user: privateUser(row) });
  })
);

/**
 * Başka bir kullanıcının profil detayı. Engelli ilişkiler ve pasif hesaplar
 * 404 döner — varlığını doğrulamamak için "bulunamadı" mesajı kullanılır.
 */
usersRouter.get(
  '/:id',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const targetId = req.params.id;

    const row = db
      .prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?')
      .get(targetId);

    if (!row || row.status !== 'active') throw notFound('Profil bulunamadı.');
    if (targetId !== me.id && isBlockedBetween(me.id, targetId)) {
      throw notFound('Profil bulunamadı.');
    }

    const dogs = db
      .prepare<[string], DogRow>(
        `SELECT * FROM dogs WHERE owner_id = ? AND status = 'active' ORDER BY created_at`
      )
      .all(targetId);

    res.json({
      user: publicUser(row),
      dogs: dogs.map(publicDog),
      isSelf: targetId === me.id,
    });
  })
);
