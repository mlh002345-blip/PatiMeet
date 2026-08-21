import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { getDb, nowMs, type CountRow, type Db } from '../db';
import { track } from '../domain/analytics';
import { normalizePhotoInput } from '../domain/media';
import { publicDog, publicDogs, type DogRow } from '../domain/serialize';
import { asyncRoute, badRequest, forbidden, notFound, parseBody } from '../http';
import { newId } from '../ids';

export const dogsRouter = Router();

const CURRENT_YEAR = new Date().getUTCFullYear();

/**
 * MVP sonrası: bir kullanıcı birden fazla köpek profiline sahip olabilir.
 * Sınır, kötüye kullanımı önlemek için makul bir üst değerde tutuluyor.
 */
const MAX_DOGS_PER_USER = 5;

/**
 * İlk kullanımda yalnızca gerekli alanlar zorunlu: ad, boyut, enerji ve
 * sosyallik. Cins, yaş, açıklama ve fotoğraf sonradan tamamlanabilir.
 */
const createDogSchema = z.object({
  name: z.string().trim().min(1, 'Köpeğinizin adını girin.').max(40),
  size: z.enum(['kucuk', 'orta', 'buyuk'], {
    errorMap: () => ({ message: 'Boyut seçin.' }),
  }),
  energy: z.enum(['sakin', 'dengeli', 'enerjik'], {
    errorMap: () => ({ message: 'Enerji seviyesi seçin.' }),
  }),
  sociability: z.enum(['cekingen', 'secici', 'sosyal'], {
    errorMap: () => ({ message: 'Sosyallik seviyesi seçin.' }),
  }),
  breed: z.string().trim().max(60).nullable().optional(),
  birthYear: z
    .number()
    .int()
    .min(CURRENT_YEAR - 25, 'Doğum yılı geçerli aralıkta olmalı.')
    .max(CURRENT_YEAR, 'Doğum yılı gelecekte olamaz.')
    .nullable()
    .optional(),
  bio: z.string().trim().max(300, 'Açıklama en fazla 300 karakter olabilir.').optional(),
  vaccinated: z.boolean().optional(),
  photoUrl: z.string().trim().max(2000).nullable().optional(),
});

const updateDogSchema = createDogSchema.partial();

dogsRouter.get(
  '/',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const dogs = await getDb().query<DogRow>(
      `SELECT * FROM dogs WHERE owner_id = $1 AND status = 'active' ORDER BY created_at`,
      [me.id]
    );
    res.json({ dogs: await publicDogs(dogs) });
  })
);

dogsRouter.post(
  '/',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(createDogSchema, req.body);

    const count = await db.one<CountRow>(
      `SELECT COUNT(*)::int AS c FROM dogs WHERE owner_id = $1 AND status = 'active'`,
      [me.id]
    );
    if ((count?.c ?? 0) >= MAX_DOGS_PER_USER) {
      throw badRequest(
        `En fazla ${MAX_DOGS_PER_USER} köpek profili ekleyebilirsiniz.`,
        'dog_limit_reached'
      );
    }

    const photo = await normalizePhotoInput(me.id, input.photoUrl, db);

    const ts = nowMs();
    const id = newId();
    await db.exec(
      `INSERT INTO dogs
         (id, owner_id, name, breed, birth_year, size, energy, sociability, bio, vaccinated, photo_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
      [
        id,
        me.id,
        input.name,
        input.breed ?? null,
        input.birthYear ?? null,
        input.size,
        input.energy,
        input.sociability,
        input.bio ?? '',
        input.vaccinated === true,
        photo ?? null,
        ts,
      ]
    );

    const row = await db.one<DogRow>('SELECT * FROM dogs WHERE id = $1', [id]);
    await track('dog_profile_completed', me.id, { has_photo: Boolean(photo) });
    res.status(201).json({ dog: await publicDog(row!) });
  })
);

async function ownedDog(db: Db, dogId: string, userId: string): Promise<DogRow> {
  const row = await db.one<DogRow>('SELECT * FROM dogs WHERE id = $1', [dogId]);
  if (!row || row.status === 'deleted') throw notFound('Köpek profili bulunamadı.');
  if (row.owner_id !== userId) {
    throw forbidden('Yalnızca kendi köpek profilinizi düzenleyebilirsiniz.');
  }
  return row;
}

dogsRouter.patch(
  '/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    await ownedDog(db, req.params.id, me.id);
    const input = parseBody(updateDogSchema, req.body);

    const photo = await normalizePhotoInput(me.id, input.photoUrl, db);

    const columns: Array<[string, unknown]> = [];
    if (input.name !== undefined) columns.push(['name', input.name]);
    if (input.breed !== undefined) columns.push(['breed', input.breed]);
    if (input.birthYear !== undefined) columns.push(['birth_year', input.birthYear]);
    if (input.size !== undefined) columns.push(['size', input.size]);
    if (input.energy !== undefined) columns.push(['energy', input.energy]);
    if (input.sociability !== undefined) columns.push(['sociability', input.sociability]);
    if (input.bio !== undefined) columns.push(['bio', input.bio]);
    if (input.vaccinated !== undefined) columns.push(['vaccinated', input.vaccinated]);
    if (photo !== undefined) columns.push(['photo_url', photo]);

    if (columns.length > 0) {
      const sets = columns.map(([column], index) => `${column} = $${index + 1}`);
      const params = columns.map(([, value]) => value);
      sets.push(`updated_at = $${params.length + 1}`);
      params.push(nowMs(), req.params.id);

      await db.exec(`UPDATE dogs SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    }

    const row = await db.one<DogRow>('SELECT * FROM dogs WHERE id = $1', [req.params.id]);
    res.json({ dog: await publicDog(row!) });
  })
);

/**
 * Köpek profili silme. İş kuralı: kullanıcının en az bir köpek profili
 * olmalı, bu yüzden son köpek silinemez.
 */
dogsRouter.delete(
  '/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    await ownedDog(db, req.params.id, me.id);

    const count = await db.one<CountRow>(
      `SELECT COUNT(*)::int AS c FROM dogs WHERE owner_id = $1 AND status = 'active'`,
      [me.id]
    );

    if ((count?.c ?? 0) <= 1) {
      throw badRequest(
        'En az bir köpek profiliniz olmalı. Silmek yerine düzenleyebilirsiniz.',
        'last_dog'
      );
    }

    await db.exec(`UPDATE dogs SET status = 'deleted', updated_at = $1 WHERE id = $2`, [
      nowMs(),
      req.params.id,
    ]);
    res.json({ ok: true });
  })
);
