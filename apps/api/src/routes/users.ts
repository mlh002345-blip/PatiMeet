import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { getDb, nowMs } from '../db';
import { isBlockedBetween } from '../domain/blocks';
import { computeMatchScore } from '../domain/matching';
import { normalizePhotoInput } from '../domain/media';
import {
  privateUser,
  publicDogs,
  publicUser,
  type DogRow,
  type UserRow,
} from '../domain/serialize';
import { asyncRoute, notFound, parseBody } from '../http';

export const usersRouter = Router();

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı.').max(60).optional(),
  district: z.string().trim().min(2, 'Semt seçin.').max(80).nullable().optional(),
  bio: z.string().trim().max(300, 'Açıklama en fazla 300 karakter olabilir.').optional(),
  purpose: z.enum(['yuruyus', 'oyun', 'sosyal', 'egitim']).nullable().optional(),
  /** Yüklenmiş görselin depo anahtarı (`media/...`) veya kaldırmak için null. */
  photoUrl: z.string().trim().max(2000).nullable().optional(),
});

/** Kullanıcı profili oluşturma ve düzenleme aynı uç üzerinden yürür. */
usersRouter.patch(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(profileSchema, req.body);

    // Fotoğraf alanı yalnızca kullanıcının kendi yüklediği görseli işaret edebilir.
    const photo = await normalizePhotoInput(me.id, input.photoUrl, db);

    const columns: Array<[string, unknown]> = [];
    if (input.name !== undefined) columns.push(['name', input.name]);
    if (input.district !== undefined) columns.push(['district', input.district]);
    if (input.bio !== undefined) columns.push(['bio', input.bio]);
    if (input.purpose !== undefined) columns.push(['purpose', input.purpose]);
    if (photo !== undefined) columns.push(['photo_url', photo]);

    if (columns.length > 0) {
      const sets = columns.map(([column], index) => `${column} = $${index + 1}`);
      const params = columns.map(([, value]) => value);
      sets.push(`updated_at = $${params.length + 1}`);
      params.push(nowMs(), me.id);

      await db.exec(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    const row = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [me.id]);
    res.json({ user: await privateUser(row!, db) });
  })
);

/**
 * Başka bir kullanıcının profil detayı. Engelli ilişkiler ve pasif hesaplar
 * 404 döner — varlığını doğrulamamak için "bulunamadı" mesajı kullanılır.
 */
usersRouter.get(
  '/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const targetId = req.params.id;

    const row = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [targetId]);

    if (!row || row.status !== 'active') throw notFound('Profil bulunamadı.');
    if (targetId !== me.id && (await isBlockedBetween(me.id, targetId, db))) {
      throw notFound('Profil bulunamadı.');
    }

    const dogs = await db.query<DogRow>(
      `SELECT * FROM dogs WHERE owner_id = $1 AND status = 'active' ORDER BY created_at`,
      [targetId]
    );

    /**
     * Uyum skoru kırılımları.
     *
     * Profil detayında hangi köpeğin öne çıkarıldığı istemciden `dogId` ile
     * gelebilir; skoru o köpek için hesaplıyoruz. İzleyenin her köpeği için
     * ayrı skor döneriz ki çoklu köpek durumunda hangi köpeğinin daha uyumlu
     * olduğunu görebilsin.
     */
    let matches: Array<{ viewerDogId: string; viewerDogName: string; targetDogId: string } & ReturnType<typeof computeMatchScore>> = [];

    if (targetId !== me.id) {
      const [viewer, viewerDogs] = await Promise.all([
        db.one<UserRow>('SELECT * FROM users WHERE id = $1', [me.id]),
        db.query<DogRow>(
          `SELECT * FROM dogs WHERE owner_id = $1 AND status = 'active' ORDER BY created_at`,
          [me.id]
        ),
      ]);

      const focused = dogs.find((dog) => dog.id === req.query.dogId) ?? dogs[0];

      if (viewer && focused) {
        matches = viewerDogs
          .map((viewerDog) => {
            const result = computeMatchScore(
              { user: viewer, dog: viewerDog },
              { user: row, dog: focused }
            );
            return result
              ? {
                  viewerDogId: viewerDog.id,
                  viewerDogName: viewerDog.name,
                  targetDogId: focused.id,
                  ...result,
                }
              : null;
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((a, b) => b.score - a.score);
      }
    }

    res.json({
      user: await publicUser(row),
      dogs: await publicDogs(dogs),
      isSelf: targetId === me.id,
      matches,
    });
  })
);
