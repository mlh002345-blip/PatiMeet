import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { getDb, nowMs, type CountRow, type Db } from '../db';
import { hiddenUserIds, isBlockedBetween } from '../domain/blocks';
import { notifyUser } from '../domain/push';
import {
  publicDog,
  publicEvent,
  publicEvents,
  publicUser,
  type DogRow,
  type EventRow,
  type UserRow,
} from '../domain/serialize';
import { asyncRoute, badRequest, conflict, forbidden, notFound, parseBody } from '../http';
import { newId } from '../ids';
import { normalizePhotoInput } from '../domain/media';

export const eventsRouter = Router();

const eventTypes = ['yuruyus', 'park', 'oyun', 'egitim', 'sosyal'] as const;
const dogSizes = ['hepsi', 'kucuk', 'orta', 'buyuk'] as const;

const createEventSchema = z.object({
  title: z.string().trim().min(3, 'Başlık en az 3 karakter olmalı.').max(80),
  type: z.enum(eventTypes, { errorMap: () => ({ message: 'Etkinlik türü seçin.' }) }),
  startsAt: z.number().int('Tarih ve saat geçersiz.'),
  district: z.string().trim().min(2, 'Semt seçin.').max(80),
  meetingPoint: z
    .string()
    .trim()
    .min(3, 'Buluşma noktasını kısaca açıklayın.')
    .max(160, 'Buluşma noktası açıklaması en fazla 160 karakter olabilir.'),
  capacity: z
    .number()
    .int()
    .min(2, 'Katılımcı sınırı en az 2 olmalı.')
    .max(50, 'Katılımcı sınırı en fazla 50 olabilir.'),
  dogSize: z.enum(dogSizes).default('hepsi'),
  description: z.string().trim().max(600).optional(),
  rules: z.string().trim().max(600).optional(),
  coverPhotoUrl: z.string().trim().max(500).nullable().optional(),
});

/** İş kuralı: geçmiş tarihli etkinlik oluşturulamaz. */
function assertFutureDate(startsAt: number): void {
  if (startsAt <= nowMs()) {
    throw badRequest('Geçmiş bir tarih için etkinlik oluşturamazsınız.', 'past_date');
  }
}

const listQuerySchema = z.object({
  district: z.string().trim().max(80).optional(),
  type: z.enum(eventTypes).optional(),
  dogSize: z.enum(dogSizes).optional(),
  scope: z.enum(['upcoming', 'mine', 'joined', 'history']).default('upcoming'),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

eventsRouter.get(
  '/',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const q = parseBody(listQuerySchema, req.query);

    const hidden = await hiddenUserIds(me.id, db);
    const params: unknown[] = [];
    const push = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const where: string[] = [`e.status = 'active'`];

    if (hidden.length > 0) where.push(`e.owner_id != ALL(${push(hidden)})`);

    if (q.scope === 'mine') {
      where.push(`e.owner_id = ${push(me.id)}`);
    } else if (q.scope === 'joined' || q.scope === 'history') {
      where.push(
        `EXISTS (SELECT 1 FROM event_participants p WHERE p.event_id = e.id AND p.user_id = ${push(me.id)})`
      );
    }

    // Geçmiş sekmesi yalnızca katılınan ve tamamlanmış etkinlikleri döndürür.
    where.push(q.scope === 'history' ? `e.starts_at <= ${push(nowMs())}` : `e.starts_at > ${push(nowMs())}`);

    if (q.district) where.push(`e.district = ${push(q.district)}`);
    if (q.type) where.push(`e.type = ${push(q.type)}`);
    if (q.dogSize) {
      // 'hepsi' etkinlikleri her boyut filtresinde görünür.
      where.push(`(e.dog_size = ${push(q.dogSize)} OR e.dog_size = 'hepsi')`);
    }

    const limit = push(q.limit);
    const offset = push(q.offset);

    const rows = await db.query<EventRow>(
      `SELECT e.* FROM events e
        WHERE ${where.join(' AND ')}
        ORDER BY e.starts_at ASC
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({
      events: await publicEvents(rows, me.id, db),
      limit: q.limit,
      offset: q.offset,
      hasMore: rows.length === q.limit,
    });
  })
);

const createBodySchema = createEventSchema.extend({
  /** Etkinliğe hangi köpekle katılacağı (çoklu köpek desteği). */
  dogId: z.string().trim().min(1).optional(),
});

eventsRouter.post(
  '/',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(createBodySchema, req.body);
    assertFutureDate(input.startsAt);

    // İş kuralı: etkinlik oluşturmak için en az bir köpek profili gerekir.
    const dogs = await db.query<DogRow>(
      `SELECT * FROM dogs WHERE owner_id = $1 AND status = 'active' ORDER BY created_at`,
      [me.id]
    );
    if (dogs.length === 0) {
      throw badRequest(
        'Etkinlik oluşturmak için önce köpek profilinizi tamamlayın.',
        'dog_required'
      );
    }

    const chosen = input.dogId ? dogs.find((dog) => dog.id === input.dogId) : dogs[0];
    if (!chosen) throw badRequest('Seçilen köpek profili bulunamadı.', 'dog_not_found');

    const ts = nowMs();
    const id = newId();
    const coverPhotoUrl = await normalizePhotoInput(me.id, input.coverPhotoUrl, db);

    await db.tx(async (t) => {
      await t.exec(
        `INSERT INTO events
           (id, owner_id, title, type, starts_at, district, meeting_point, capacity, dog_size, description, rules, cover_photo_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
        [
          id,
          me.id,
          input.title,
          input.type,
          input.startsAt,
          input.district,
          input.meetingPoint,
          input.capacity,
          input.dogSize,
          input.description ?? '',
          input.rules ?? '',
          coverPhotoUrl ?? null,
          ts,
        ]
      );
      // Etkinlik sahibi otomatik katılımcıdır; kontenjan hesabı buna göre işler.
      await t.exec(
        'INSERT INTO event_participants (id, event_id, user_id, dog_id, created_at) VALUES ($1, $2, $3, $4, $5)',
        [newId(), id, me.id, chosen.id, ts]
      );
    });

    const row = await db.one<EventRow>('SELECT * FROM events WHERE id = $1', [id]);
    res.status(201).json({ event: await publicEvent(row!, me.id, db) });
  })
);

async function visibleEvent(db: Db, eventId: string, viewerId: string): Promise<EventRow> {
  const row = await db.one<EventRow>('SELECT * FROM events WHERE id = $1', [eventId]);
  if (!row || row.status === 'removed') throw notFound('Etkinlik bulunamadı.');
  if (row.owner_id !== viewerId && (await isBlockedBetween(viewerId, row.owner_id, db))) {
    throw notFound('Etkinlik bulunamadı.');
  }
  return row;
}

eventsRouter.get(
  '/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const row = await visibleEvent(db, req.params.id, me.id);

    const hidden = await hiddenUserIds(me.id, db);
    const participants = await db.query<UserRow & { dog_id: string | null }>(
      `SELECT u.*, p.dog_id FROM event_participants p
         JOIN users u ON u.id = p.user_id
        WHERE p.event_id = $1 AND u.status = 'active'
        ORDER BY p.created_at`,
      [req.params.id]
    );

    const visibleParticipants = await Promise.all(
      participants
        .filter((p) => !hidden.includes(p.id))
        .map(async (p) => {
          const dog = p.dog_id
            ? await db.one<DogRow>('SELECT * FROM dogs WHERE id = $1', [p.dog_id])
            : undefined;
          return {
            user: await publicUser(p),
            dog: dog && dog.status === 'active' ? await publicDog(dog) : null,
          };
        })
    );

    res.json({
      event: await publicEvent(row!, me.id, db),
      participants: visibleParticipants,
    });
  })
);

const joinSchema = z.object({ dogId: z.string().trim().min(1).optional() });

eventsRouter.post(
  '/:id/join',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(joinSchema, req.body ?? {});
    const row = await visibleEvent(db, req.params.id, me.id);

    if (row.status !== 'active') throw badRequest('Bu etkinlik iptal edilmiş.', 'event_inactive');
    if (row.starts_at <= nowMs()) {
      throw badRequest('Bu etkinliğin tarihi geçmiş.', 'event_past');
    }

    let dogId: string | null = null;
    if (input.dogId) {
      const dog = await db.one<DogRow>('SELECT * FROM dogs WHERE id = $1', [input.dogId]);
      if (!dog || dog.owner_id !== me.id || dog.status !== 'active') {
        throw badRequest('Seçilen köpek profili bulunamadı.', 'dog_not_found');
      }
      // İş kuralı: etkinliğin uygun köpek boyutu kısıtı varsa uyulmalı.
      if (row.dog_size !== 'hepsi' && dog.size !== row.dog_size) {
        throw badRequest(
          'Bu etkinlik farklı bir köpek boyutu için planlanmış.',
          'dog_size_mismatch'
        );
      }
      dogId = dog.id;
    }

    const ts = nowMs();

    // Kontenjan kontrolü ve ekleme aynı işlemde yapılır ki eşzamanlı
    // katılımlarda sınır aşılmasın.
    await db.tx(async (t) => {
      const already = await t.one<CountRow>(
        'SELECT COUNT(*)::int AS c FROM event_participants WHERE event_id = $1 AND user_id = $2',
        [row.id, me.id]
      );
      if ((already?.c ?? 0) > 0) {
        throw conflict('Bu etkinliğe zaten katıldınız.', 'already_joined');
      }

      /**
       * `FOR UPDATE` etkinlik satırını kilitler: iki kişi aynı anda son
       * kontenjana katılmaya çalıştığında ikincisi ilkini bekler ve sayımı
       * güncel görür. Kilit olmadan kontenjan aşılabilirdi.
       */
      await t.one('SELECT id FROM events WHERE id = $1 FOR UPDATE', [row.id]);

      const count = await t.one<CountRow>(
        'SELECT COUNT(*)::int AS c FROM event_participants WHERE event_id = $1',
        [row.id]
      );
      if ((count?.c ?? 0) >= row.capacity) {
        throw conflict('Etkinlik kontenjanı doldu.', 'event_full');
      }

      await t.exec(
        'INSERT INTO event_participants (id, event_id, user_id, dog_id, created_at) VALUES ($1, $2, $3, $4, $5)',
        [newId(), row.id, me.id, dogId, ts]
      );
    });

    // Etkinlik sahibine haber ver (kendi etkinliğine katılıyorsa gerek yok).
    if (row.owner_id !== me.id) {
      const joiner = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [me.id]);
      await notifyUser(row.owner_id, 'events', {
        title: 'Etkinliğine yeni katılım',
        body: `${joiner?.name ?? 'Bir kullanıcı'}, "${row.title}" etkinliğine katıldı.`,
        data: { type: 'event', eventId: row.id },
      });
    }

    const updated = await db.one<EventRow>('SELECT * FROM events WHERE id = $1', [row.id]);
    res.json({ event: await publicEvent(updated!, me.id, db) });
  })
);

eventsRouter.post(
  '/:id/leave',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const row = await visibleEvent(db, req.params.id, me.id);

    if (row.owner_id === me.id) {
      throw badRequest(
        'Etkinlik sahibi katılımdan ayrılamaz. Etkinliği iptal edebilirsiniz.',
        'owner_cannot_leave'
      );
    }

    const result = await db.exec(
      'DELETE FROM event_participants WHERE event_id = $1 AND user_id = $2',
      [row.id, me.id]
    );

    if (result.rowCount === 0) throw badRequest('Bu etkinliğe katılmamışsınız.', 'not_joined');

    const updated = await db.one<EventRow>('SELECT * FROM events WHERE id = $1', [row.id]);
    res.json({ event: await publicEvent(updated!, me.id, db) });
  })
);

const updateEventSchema = createEventSchema.partial();

/** İş kuralı: yalnızca etkinlik sahibi düzenleyebilir veya iptal edebilir. */
async function ownedEvent(db: Db, eventId: string, userId: string): Promise<EventRow> {
  const row = await db.one<EventRow>('SELECT * FROM events WHERE id = $1', [eventId]);
  if (!row || row.status === 'removed') throw notFound('Etkinlik bulunamadı.');
  if (row.owner_id !== userId) {
    throw forbidden('Yalnızca etkinlik sahibi bu işlemi yapabilir.');
  }
  return row;
}

eventsRouter.patch(
  '/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    await ownedEvent(db, req.params.id, me.id);
    const input = parseBody(updateEventSchema, req.body);
    if (input.startsAt !== undefined) assertFutureDate(input.startsAt);
    if (input.coverPhotoUrl !== undefined) {
      input.coverPhotoUrl = await normalizePhotoInput(me.id, input.coverPhotoUrl, db);
    }

    if (input.capacity !== undefined) {
      const count = await db.one<CountRow>(
        'SELECT COUNT(*)::int AS c FROM event_participants WHERE event_id = $1',
        [req.params.id]
      );
      if ((count?.c ?? 0) > input.capacity) {
        throw badRequest(
          'Katılımcı sınırı mevcut katılımcı sayısından az olamaz.',
          'capacity_below_participants'
        );
      }
    }

    const mapping: Array<[keyof typeof input, string]> = [
      ['title', 'title'],
      ['type', 'type'],
      ['startsAt', 'starts_at'],
      ['district', 'district'],
      ['meetingPoint', 'meeting_point'],
      ['capacity', 'capacity'],
      ['dogSize', 'dog_size'],
      ['description', 'description'],
      ['rules', 'rules'],
      ['coverPhotoUrl', 'cover_photo_url'],
    ];

    const columns: Array<[string, unknown]> = [];
    for (const [key, column] of mapping) {
      const value = input[key];
      if (value !== undefined) columns.push([column, value]);
    }

    if (columns.length > 0) {
      const sets = columns.map(([column], index) => `${column} = $${index + 1}`);
      const params = columns.map(([, value]) => value);
      sets.push(`updated_at = $${params.length + 1}`);
      params.push(nowMs(), req.params.id);

      await db.exec(`UPDATE events SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

      // Katılımcılara değişikliği bildir — saat/yer değişimi kritik bilgi.
      const participants = await db.query<{ user_id: string }>(
        'SELECT user_id FROM event_participants WHERE event_id = $1 AND user_id != $2',
        [req.params.id, me.id]
      );
      const updatedRow = await db.one<EventRow>('SELECT * FROM events WHERE id = $1', [
        req.params.id,
      ]);
      for (const participant of participants) {
        await notifyUser(participant.user_id, 'events', {
          title: 'Etkinlik güncellendi',
          body: `"${updatedRow?.title ?? 'Etkinlik'}" bilgileri değişti. Detayları kontrol edin.`,
          data: { type: 'event', eventId: req.params.id },
        });
      }
    }

    const row = await db.one<EventRow>('SELECT * FROM events WHERE id = $1', [req.params.id]);
    res.json({ event: await publicEvent(row!, me.id, db) });
  })
);

eventsRouter.post(
  '/:id/cancel',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const existing = await ownedEvent(db, req.params.id, me.id);

    await db.exec(`UPDATE events SET status = 'cancelled', updated_at = $1 WHERE id = $2`, [
      nowMs(),
      req.params.id,
    ]);

    // Katılımcıların boşa gitmemesi için iptal bildirimi önemlidir.
    const participants = await db.query<{ user_id: string }>(
      'SELECT user_id FROM event_participants WHERE event_id = $1 AND user_id != $2',
      [req.params.id, me.id]
    );
    for (const participant of participants) {
      await notifyUser(participant.user_id, 'events', {
        title: 'Etkinlik iptal edildi',
        body: `"${existing.title}" etkinliği iptal edildi.`,
        data: { type: 'event', eventId: req.params.id },
      });
    }

    const row = await db.one<EventRow>('SELECT * FROM events WHERE id = $1', [req.params.id]);
    res.json({ event: await publicEvent(row!, me.id, db) });
  })
);
