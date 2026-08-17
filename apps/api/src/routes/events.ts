import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { db, nowMs } from '../db';
import { hiddenUserIds, isBlockedBetween } from '../domain/blocks';
import { publicDog, publicEvent, publicUser, type DogRow, type EventRow, type UserRow } from '../domain/serialize';
import { asyncRoute, badRequest, conflict, forbidden, notFound, parseBody } from '../http';
import { newId } from '../ids';

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
  scope: z.enum(['upcoming', 'mine', 'joined']).default('upcoming'),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

eventsRouter.get(
  '/',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const q = parseBody(listQuerySchema, req.query);

    const hidden = hiddenUserIds(me.id);
    const where: string[] = [`e.status = 'active'`];
    const params: unknown[] = [];

    if (hidden.length > 0) {
      where.push(`e.owner_id NOT IN (${hidden.map(() => '?').join(', ')})`);
      params.push(...hidden);
    }

    if (q.scope === 'mine') {
      where.push('e.owner_id = ?');
      params.push(me.id);
    } else if (q.scope === 'joined') {
      where.push('EXISTS (SELECT 1 FROM event_participants p WHERE p.event_id = e.id AND p.user_id = ?)');
      params.push(me.id);
    }

    // Liste her zaman gelecekteki etkinlikleri gösterir; geçmiş kayıtlar düşer.
    where.push('e.starts_at > ?');
    params.push(nowMs());

    if (q.district) {
      where.push('e.district = ?');
      params.push(q.district);
    }
    if (q.type) {
      where.push('e.type = ?');
      params.push(q.type);
    }
    if (q.dogSize) {
      // 'hepsi' etkinlikleri her boyut filtresinde görünür.
      where.push(`(e.dog_size = ? OR e.dog_size = 'hepsi')`);
      params.push(q.dogSize);
    }

    const rows = db
      .prepare(
        `SELECT e.* FROM events e
          WHERE ${where.join(' AND ')}
          ORDER BY e.starts_at ASC
          LIMIT ? OFFSET ?`
      )
      .all(...params, q.limit, q.offset) as EventRow[];

    res.json({
      events: rows.map((row) => publicEvent(row, me.id)),
      limit: q.limit,
      offset: q.offset,
      hasMore: rows.length === q.limit,
    });
  })
);

eventsRouter.post(
  '/',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const input = parseBody(createEventSchema, req.body);
    assertFutureDate(input.startsAt);

    // İş kuralı: etkinlik oluşturmak için en az bir köpek profili gerekir.
    const dogCount = db
      .prepare<[string], { c: number }>(
        `SELECT COUNT(*) AS c FROM dogs WHERE owner_id = ? AND status = 'active'`
      )
      .get(me.id);
    if ((dogCount?.c ?? 0) === 0) {
      throw badRequest('Etkinlik oluşturmak için önce köpek profilinizi tamamlayın.', 'dog_required');
    }

    const ts = nowMs();
    const id = newId();

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO events
           (id, owner_id, title, type, starts_at, district, meeting_point, capacity, dog_size, description, rules, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
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
        ts,
        ts
      );
      // Etkinlik sahibi otomatik katılımcıdır; kontenjan hesabı buna göre işler.
      db.prepare(
        'INSERT INTO event_participants (id, event_id, user_id, created_at) VALUES (?, ?, ?, ?)'
      ).run(newId(), id, me.id, ts);
    });
    tx();

    const row = db.prepare<[string], EventRow>('SELECT * FROM events WHERE id = ?').get(id)!;
    res.status(201).json({ event: publicEvent(row, me.id) });
  })
);

function visibleEvent(eventId: string, viewerId: string): EventRow {
  const row = db.prepare<[string], EventRow>('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!row || row.status === 'removed') throw notFound('Etkinlik bulunamadı.');
  if (row.owner_id !== viewerId && isBlockedBetween(viewerId, row.owner_id)) {
    throw notFound('Etkinlik bulunamadı.');
  }
  return row;
}

eventsRouter.get(
  '/:id',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const row = visibleEvent(req.params.id, me.id);

    const hidden = hiddenUserIds(me.id);
    const participants = db
      .prepare<[string], UserRow & { dog_id: string | null }>(
        `SELECT u.*, p.dog_id FROM event_participants p
           JOIN users u ON u.id = p.user_id
          WHERE p.event_id = ? AND u.status = 'active'
          ORDER BY p.created_at`
      )
      .all(req.params.id);

    const visibleParticipants = participants
      .filter((p) => !hidden.includes(p.id))
      .map((p) => {
        const dog = p.dog_id
          ? db.prepare<[string], DogRow>('SELECT * FROM dogs WHERE id = ?').get(p.dog_id)
          : undefined;
        return {
          user: publicUser(p),
          dog: dog && dog.status === 'active' ? publicDog(dog) : null,
        };
      });

    res.json({ event: publicEvent(row, me.id), participants: visibleParticipants });
  })
);

const joinSchema = z.object({ dogId: z.string().trim().min(1).optional() });

eventsRouter.post(
  '/:id/join',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const input = parseBody(joinSchema, req.body ?? {});
    const row = visibleEvent(req.params.id, me.id);

    if (row.status !== 'active') throw badRequest('Bu etkinlik iptal edilmiş.', 'event_inactive');
    if (row.starts_at <= nowMs()) {
      throw badRequest('Bu etkinliğin tarihi geçmiş.', 'event_past');
    }

    if (input.dogId) {
      const dog = db.prepare<[string], DogRow>('SELECT * FROM dogs WHERE id = ?').get(input.dogId);
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
    }

    const ts = nowMs();

    // Kontenjan kontrolü ve ekleme aynı işlemde yapılır ki eşzamanlı
    // katılımlarda sınır aşılmasın.
    const tx = db.transaction(() => {
      const already = db
        .prepare<[string, string], { c: number }>(
          'SELECT COUNT(*) AS c FROM event_participants WHERE event_id = ? AND user_id = ?'
        )
        .get(row.id, me.id);
      if ((already?.c ?? 0) > 0) {
        throw conflict('Bu etkinliğe zaten katıldınız.', 'already_joined');
      }

      const count = db
        .prepare<[string], { c: number }>(
          'SELECT COUNT(*) AS c FROM event_participants WHERE event_id = ?'
        )
        .get(row.id);
      if ((count?.c ?? 0) >= row.capacity) {
        throw conflict('Etkinlik kontenjanı doldu.', 'event_full');
      }

      db.prepare(
        'INSERT INTO event_participants (id, event_id, user_id, dog_id, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(newId(), row.id, me.id, input.dogId ?? null, ts);
    });
    tx();

    const updated = db.prepare<[string], EventRow>('SELECT * FROM events WHERE id = ?').get(row.id)!;
    res.json({ event: publicEvent(updated, me.id) });
  })
);

eventsRouter.post(
  '/:id/leave',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const row = visibleEvent(req.params.id, me.id);

    if (row.owner_id === me.id) {
      throw badRequest(
        'Etkinlik sahibi katılımdan ayrılamaz. Etkinliği iptal edebilirsiniz.',
        'owner_cannot_leave'
      );
    }

    const result = db
      .prepare('DELETE FROM event_participants WHERE event_id = ? AND user_id = ?')
      .run(row.id, me.id);

    if (result.changes === 0) throw badRequest('Bu etkinliğe katılmamışsınız.', 'not_joined');

    const updated = db.prepare<[string], EventRow>('SELECT * FROM events WHERE id = ?').get(row.id)!;
    res.json({ event: publicEvent(updated, me.id) });
  })
);

const updateEventSchema = createEventSchema.partial();

/** İş kuralı: yalnızca etkinlik sahibi düzenleyebilir veya iptal edebilir. */
function ownedEvent(eventId: string, userId: string): EventRow {
  const row = db.prepare<[string], EventRow>('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!row || row.status === 'removed') throw notFound('Etkinlik bulunamadı.');
  if (row.owner_id !== userId) {
    throw forbidden('Yalnızca etkinlik sahibi bu işlemi yapabilir.');
  }
  return row;
}

eventsRouter.patch(
  '/:id',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    ownedEvent(req.params.id, me.id);
    const input = parseBody(updateEventSchema, req.body);
    if (input.startsAt !== undefined) assertFutureDate(input.startsAt);

    if (input.capacity !== undefined) {
      const count = db
        .prepare<[string], { c: number }>(
          'SELECT COUNT(*) AS c FROM event_participants WHERE event_id = ?'
        )
        .get(req.params.id);
      if ((count?.c ?? 0) > input.capacity) {
        throw badRequest(
          'Katılımcı sınırı mevcut katılımcı sayısından az olamaz.',
          'capacity_below_participants'
        );
      }
    }

    const columns: Record<string, string> = {
      title: 'title',
      type: 'type',
      startsAt: 'starts_at',
      district: 'district',
      meetingPoint: 'meeting_point',
      capacity: 'capacity',
      dogSize: 'dog_size',
      description: 'description',
      rules: 'rules',
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
      params.push(nowMs(), req.params.id);
      db.prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }

    const row = db
      .prepare<[string], EventRow>('SELECT * FROM events WHERE id = ?')
      .get(req.params.id)!;
    res.json({ event: publicEvent(row, me.id) });
  })
);

eventsRouter.post(
  '/:id/cancel',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    ownedEvent(req.params.id, me.id);

    db.prepare(`UPDATE events SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(
      nowMs(),
      req.params.id
    );

    const row = db
      .prepare<[string], EventRow>('SELECT * FROM events WHERE id = ?')
      .get(req.params.id)!;
    res.json({ event: publicEvent(row, me.id) });
  })
);
