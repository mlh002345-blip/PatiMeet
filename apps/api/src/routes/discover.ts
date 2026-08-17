import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { db } from '../db';
import { hiddenUserIds } from '../domain/blocks';
import { publicDog, publicUser, type DogRow, type UserRow } from '../domain/serialize';
import { asyncRoute, parseBody } from '../http';

export const discoverRouter = Router();

const querySchema = z.object({
  district: z.string().trim().max(80).optional(),
  size: z.enum(['kucuk', 'orta', 'buyuk']).optional(),
  energy: z.enum(['sakin', 'dengeli', 'enerjik']).optional(),
  search: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Keşfet listesi: aktif köpek profillerini sahibinin semtine göre listeler.
 * Kendi profilleri, engelli ilişkiler ve pasif hesaplar sonuçlardan düşülür.
 * Konum olarak yalnızca semt kullanılır — koordinat ya da adres dönmez.
 */
discoverRouter.get(
  '/',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const q = parseBody(querySchema, req.query);

    const excluded = [me.id, ...hiddenUserIds(me.id)];
    const placeholders = excluded.map(() => '?').join(', ');

    const where: string[] = [
      `d.status = 'active'`,
      `u.status = 'active'`,
      `d.owner_id NOT IN (${placeholders})`,
    ];
    const params: unknown[] = [...excluded];

    if (q.district) {
      where.push('u.district = ?');
      params.push(q.district);
    }
    if (q.size) {
      where.push('d.size = ?');
      params.push(q.size);
    }
    if (q.energy) {
      where.push('d.energy = ?');
      params.push(q.energy);
    }
    if (q.search) {
      where.push('(d.name LIKE ? OR d.breed LIKE ?)');
      params.push(`%${q.search}%`, `%${q.search}%`);
    }

    const rows = db
      .prepare(
        `SELECT d.*, u.id AS u_id, u.name AS u_name, u.district AS u_district,
                u.bio AS u_bio, u.purpose AS u_purpose, u.photo_url AS u_photo_url
           FROM dogs d
           JOIN users u ON u.id = d.owner_id
          WHERE ${where.join(' AND ')}
          ORDER BY d.created_at DESC
          LIMIT ? OFFSET ?`
      )
      .all(...params, q.limit, q.offset) as Array<
      DogRow & {
        u_id: string;
        u_name: string;
        u_district: string | null;
        u_bio: string;
        u_purpose: string | null;
        u_photo_url: string | null;
      }
    >;

    const items = rows.map((row) => ({
      dog: publicDog(row),
      owner: publicUser({
        id: row.u_id,
        name: row.u_name,
        district: row.u_district,
        bio: row.u_bio,
        purpose: row.u_purpose,
        photo_url: row.u_photo_url,
      } as UserRow),
    }));

    res.json({ items, limit: q.limit, offset: q.offset, hasMore: items.length === q.limit });
  })
);

/** Semt listesi. MVP'de sabit İstanbul semtleri + veritabanındaki değerler. */
const SEED_DISTRICTS = [
  'Kadıköy',
  'Beşiktaş',
  'Şişli',
  'Üsküdar',
  'Maltepe',
  'Ataşehir',
  'Bakırköy',
  'Beylikdüzü',
  'Sarıyer',
  'Kartal',
  'Beyoğlu',
  'Zeytinburnu',
];

discoverRouter.get(
  '/districts',
  asyncRoute((_req, res) => {
    const rows = db
      .prepare<[], { district: string }>(
        `SELECT DISTINCT district FROM users
          WHERE district IS NOT NULL AND district != '' AND status = 'active'`
      )
      .all();

    const merged = Array.from(new Set([...SEED_DISTRICTS, ...rows.map((r) => r.district)])).sort(
      (a, b) => a.localeCompare(b, 'tr')
    );

    res.json({ districts: merged });
  })
);
