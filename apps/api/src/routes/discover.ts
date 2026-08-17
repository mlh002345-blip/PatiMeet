import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { getDb } from '../db';
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

/** Keşfet satırı: köpek kolonları + sahibin profil kolonları. */
type DiscoverRow = DogRow & {
  u_id: string;
  u_name: string;
  u_district: string | null;
  u_bio: string;
  u_purpose: string | null;
  u_photo_url: string | null;
};

/**
 * Keşfet listesi: aktif köpek profillerini sahibinin semtine göre listeler.
 * Kendi profilleri, engelli ilişkiler ve pasif hesaplar sonuçlardan düşülür.
 * Konum olarak yalnızca semt kullanılır — koordinat ya da adres dönmez.
 */
discoverRouter.get(
  '/',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const q = parseBody(querySchema, req.query);

    const excluded = [me.id, ...(await hiddenUserIds(me.id, db))];

    const where: string[] = [
      `d.status = 'active'`,
      `u.status = 'active'`,
      `d.owner_id != ALL($1)`,
    ];
    const params: unknown[] = [excluded];

    const push = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (q.district) where.push(`u.district = ${push(q.district)}`);
    if (q.size) where.push(`d.size = ${push(q.size)}`);
    if (q.energy) where.push(`d.energy = ${push(q.energy)}`);
    if (q.search) {
      // ILIKE: Türkçe karakterlerde de büyük/küçük harf duyarsız arama.
      const needle = push(`%${q.search}%`);
      where.push(`(d.name ILIKE ${needle} OR d.breed ILIKE ${needle})`);
    }

    const limit = push(q.limit);
    const offset = push(q.offset);

    const rows = await db.query<DiscoverRow>(
      `SELECT d.*, u.id AS u_id, u.name AS u_name, u.district AS u_district,
              u.bio AS u_bio, u.purpose AS u_purpose, u.photo_url AS u_photo_url
         FROM dogs d
         JOIN users u ON u.id = d.owner_id
        WHERE ${where.join(' AND ')}
        ORDER BY d.created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const items = await Promise.all(
      rows.map(async (row) => ({
        dog: await publicDog(row),
        owner: await publicUser({
          id: row.u_id,
          name: row.u_name,
          district: row.u_district,
          bio: row.u_bio,
          purpose: row.u_purpose,
          photo_url: row.u_photo_url,
        } as UserRow),
      }))
    );

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
  asyncRoute(async (_req, res) => {
    const rows = await getDb().query<{ district: string }>(
      `SELECT DISTINCT district FROM users
        WHERE district IS NOT NULL AND district != '' AND status = 'active'`
    );

    const merged = Array.from(new Set([...SEED_DISTRICTS, ...rows.map((r) => r.district)])).sort(
      (a, b) => a.localeCompare(b, 'tr')
    );

    res.json({ districts: merged });
  })
);
