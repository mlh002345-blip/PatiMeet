import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { db, nowMs } from '../db';
import { publicDog, type DogRow } from '../domain/serialize';
import { asyncRoute, badRequest, forbidden, notFound, parseBody } from '../http';
import { newId } from '../ids';

export const dogsRouter = Router();

const CURRENT_YEAR = new Date().getUTCFullYear();

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
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const dogs = db
      .prepare<[string], DogRow>(
        `SELECT * FROM dogs WHERE owner_id = ? AND status = 'active' ORDER BY created_at`
      )
      .all(me.id);
    res.json({ dogs: dogs.map(publicDog) });
  })
);

dogsRouter.post(
  '/',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const input = parseBody(createDogSchema, req.body);

    const ts = nowMs();
    const id = newId();
    db.prepare(
      `INSERT INTO dogs
         (id, owner_id, name, breed, birth_year, size, energy, sociability, bio, vaccinated, photo_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      me.id,
      input.name,
      input.breed ?? null,
      input.birthYear ?? null,
      input.size,
      input.energy,
      input.sociability,
      input.bio ?? '',
      input.vaccinated ? 1 : 0,
      input.photoUrl ?? null,
      ts,
      ts
    );

    const row = db.prepare<[string], DogRow>('SELECT * FROM dogs WHERE id = ?').get(id)!;
    res.status(201).json({ dog: publicDog(row) });
  })
);

function ownedDog(dogId: string, userId: string): DogRow {
  const row = db.prepare<[string], DogRow>('SELECT * FROM dogs WHERE id = ?').get(dogId);
  if (!row || row.status === 'deleted') throw notFound('Köpek profili bulunamadı.');
  if (row.owner_id !== userId) throw forbidden('Yalnızca kendi köpek profilinizi düzenleyebilirsiniz.');
  return row;
}

dogsRouter.patch(
  '/:id',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    ownedDog(req.params.id, me.id);
    const input = parseBody(updateDogSchema, req.body);

    const columns: Record<string, string> = {
      name: 'name',
      breed: 'breed',
      birthYear: 'birth_year',
      size: 'size',
      energy: 'energy',
      sociability: 'sociability',
      bio: 'bio',
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
    if (input.vaccinated !== undefined) {
      sets.push('vaccinated = ?');
      params.push(input.vaccinated ? 1 : 0);
    }

    if (sets.length > 0) {
      sets.push('updated_at = ?');
      params.push(nowMs(), req.params.id);
      db.prepare(`UPDATE dogs SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }

    const row = db.prepare<[string], DogRow>('SELECT * FROM dogs WHERE id = ?').get(req.params.id)!;
    res.json({ dog: publicDog(row) });
  })
);

/**
 * Köpek profili silme. İş kuralı: kullanıcının en az bir köpek profili
 * olmalı, bu yüzden son köpek silinemez.
 */
dogsRouter.delete(
  '/:id',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    ownedDog(req.params.id, me.id);

    const count = db
      .prepare<[string], { c: number }>(
        `SELECT COUNT(*) AS c FROM dogs WHERE owner_id = ? AND status = 'active'`
      )
      .get(me.id);

    if ((count?.c ?? 0) <= 1) {
      throw badRequest(
        'En az bir köpek profiliniz olmalı. Silmek yerine düzenleyebilirsiniz.',
        'last_dog'
      );
    }

    db.prepare(`UPDATE dogs SET status = 'deleted', updated_at = ? WHERE id = ?`).run(
      nowMs(),
      req.params.id
    );
    res.json({ ok: true });
  })
);
