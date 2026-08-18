import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { getDb, nowMs, type CountRow } from '../db';
import {
  createAlert,
  getAlert,
  updateAlertStatus,
  type AlertRow,
} from '../domain/alerts';
import { notifyDistrictOfAlert } from '../domain/alerts';
import type { DogRow, UserRow } from '../domain/serialize';
import { asyncRoute, badRequest, notFound, parseBody } from '../http';
import { newId } from '../ids';

export const communityRouter = Router();

/**
 * Yaklaşık bölge özeti.
 *
 * Semt düzeyinde sayılar döner — koordinat, adres veya anlık konum yok.
 * Arayüzdeki "yaklaşık bölge haritası" bu sayılarla çizilir; harita gerçek
 * bir konum katmanı değil, semt yoğunluğunun soyut gösterimidir.
 */
communityRouter.get(
  '/area-summary',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const user = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [me.id]);
    const district = user?.district ?? '';

    if (!district) {
      res.json({
        district: '',
        nearbyDogs: 0,
        upcomingEvents: 0,
        activeAlerts: 0,
        lostDogAlerts: 0,
      });
      return;
    }

    const [dogs, events, alerts, lost] = await Promise.all([
      db.one<CountRow>(
        `SELECT COUNT(*)::int AS c FROM dogs d
           JOIN users u ON u.id = d.owner_id
          WHERE d.status = 'active' AND u.status = 'active'
            AND u.district = $1 AND u.id != $2`,
        [district, me.id]
      ),
      db.one<CountRow>(
        `SELECT COUNT(*)::int AS c FROM events
          WHERE status = 'active' AND starts_at > $1 AND district = $2`,
        [nowMs(), district]
      ),
      db.one<CountRow>(
        `SELECT COUNT(*)::int AS c FROM community_alerts
          WHERE status = 'active' AND district = $1`,
        [district]
      ),
      db.one<CountRow>(
        `SELECT COUNT(*)::int AS c FROM community_alerts
          WHERE status = 'active' AND district = $1 AND type = 'kayip_hayvan'`,
        [district]
      ),
    ]);

    res.json({
      district,
      nearbyDogs: dogs?.c ?? 0,
      upcomingEvents: events?.c ?? 0,
      activeAlerts: alerts?.c ?? 0,
      lostDogAlerts: lost?.c ?? 0,
    });
  })
);

// ---------------------------------------------------------------------------
// Eski kayıp köpek uçları — KULLANIMDAN KALDIRILDI
//
// Kayıp ilanları artık Güvenli Topluluk bildirimlerinin bir türü
// (`kayip_hayvan`) olarak `community_alerts` tablosunda tutuluyor; eski
// `lost_dog_posts` tablosuna yazılmıyor. Bu uçlar yalnızca eski istemciler
// 404 almasın diye duruyor ve birleşik yapıya köprü kuruyor. Yeni istemci
// `/api/safety/alerts` uçlarını kullanır.
// ---------------------------------------------------------------------------

/** Eski yanıt biçimi, birleşik veriden üretilir. */
async function legacyPost(row: AlertRow, viewerId: string, photos: string[]) {
  return {
    id: row.id,
    district: row.district,
    lastSeenArea: row.area_note,
    details: row.description,
    status: row.status === 'resolved' ? 'found' : row.status,
    createdAt: row.created_at,
    isOwner: row.author_id === viewerId,
    /** Eski yapıdaki köpek nesnesi yerine ilanın kendi alanları. */
    animalName: row.animal_name,
    photos,
    deprecated: true,
  };
}

communityRouter.get(
  '/lost-dogs',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const district = typeof req.query.district === 'string' ? req.query.district.trim() : '';

    const rows = await db.query<AlertRow>(
      `SELECT * FROM community_alerts
        WHERE type = 'kayip_hayvan' AND status = 'active'
          ${district ? 'AND district = $1' : ''}
        ORDER BY created_at DESC LIMIT 50`,
      district ? [district] : []
    );

    const posts = await Promise.all(
      rows.map(async (row) => {
        const photoRows = await db.query<{ storage_key: string }>(
          'SELECT storage_key FROM community_alert_photos WHERE alert_id = $1 ORDER BY position',
          [row.id]
        );
        const full = await getAlert(me.id, row.id, db).catch(() => null);
        return legacyPost(row, me.id, full?.photos ?? photoRows.map((p) => p.storage_key));
      })
    );

    res.json({ posts, deprecated: true });
  })
);

/**
 * Eski oluşturma ucu. Köpeğin profilinden ad ve fotoğraf alınarak birleşik
 * yapıda bir `kayip_hayvan` bildirimi açar; eski tabloya yazmaz.
 */
communityRouter.post(
  '/lost-dogs',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        dogId: z.string().min(1),
        district: z.string().trim().min(2).max(80),
        lastSeenArea: z.string().trim().min(3).max(120),
        details: z.string().trim().max(600).optional(),
      }),
      req.body
    );

    const dog = await db.one<DogRow>(
      `SELECT * FROM dogs WHERE id = $1 AND owner_id = $2 AND status = 'active'`,
      [input.dogId, me.id]
    );
    if (!dog) throw badRequest('Köpek profili bulunamadı.', 'dog_not_found');

    const row = await createAlert(
      me.id,
      {
        type: 'kayip_hayvan',
        animalName: dog.name,
        district: input.district,
        areaNote: input.lastSeenArea,
        // Eski uçta ayrı bir son görülme zamanı yok; ilan anı kullanılır.
        occurredAt: nowMs(),
        description: input.details?.trim() || `${dog.name} kayboldu.`,
        photoKeys: dog.photo_url ? [dog.photo_url] : [],
      },
      db,
      // Fotoğraf kullanıcının kendi köpeğinin profil görseli: sahiplik zaten kesin.
      // Köpeğin fotoğrafı yoksa ilan yine de açılabilmeli (eski davranış).
      { trustedPhotos: true, allowMissingPhoto: true }
    );

    await notifyDistrictOfAlert(row, db).catch(() => ({ notified: 0 }));

    res.status(201).json({
      ok: true,
      id: row.id,
      message: 'Kayıp ilanı yayınlandı.',
      deprecated: true,
    });
  })
);

/** Eski kapatma ucu. Hem yeni ilan kimliğini hem eski kayıt kimliğini kabul eder. */
communityRouter.post(
  '/lost-dogs/:id/found',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);

    const row = await db.one<AlertRow>(
      'SELECT * FROM community_alerts WHERE id = $1 OR source_lost_dog_id = $1',
      [req.params.id]
    );
    if (!row) throw notFound('İlan bulunamadı.');

    await updateAlertStatus(me.id, row.id, 'resolved', db);
    res.json({ ok: true, message: 'İlan bulundu olarak kapatıldı.', deprecated: true });
  })
);

/**
 * Etkinlik sonrası güven değerlendirmesi.
 *
 * Yalnızca katıldığınız ve bitmiş bir etkinlik değerlendirilebilir; aynı
 * kullanıcı tekrar gönderirse kaydı güncellenir (çift kayıt oluşmaz).
 */
communityRouter.post(
  '/events/:id/review',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        rating: z.number().int().min(1).max(5),
        feltSafe: z.boolean(),
        comment: z.string().trim().max(400).optional(),
      }),
      req.body
    );

    const event = await db.one<{ id: string; starts_at: number }>(
      'SELECT id, starts_at FROM events WHERE id = $1',
      [req.params.id]
    );
    if (!event) throw notFound('Etkinlik bulunamadı.');
    if (event.starts_at > nowMs()) {
      throw badRequest('Etkinlik bitmeden değerlendirme yapılamaz.', 'event_not_finished');
    }

    const joined = await db.one<{ id: string }>(
      'SELECT id FROM event_participants WHERE event_id = $1 AND user_id = $2',
      [event.id, me.id]
    );
    if (!joined) {
      throw badRequest('Yalnızca katıldığınız etkinliği değerlendirebilirsiniz.', 'not_participant');
    }

    await db.exec(
      `INSERT INTO event_reviews (id, event_id, reviewer_id, rating, felt_safe, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_id, reviewer_id) DO UPDATE
          SET rating = EXCLUDED.rating,
              felt_safe = EXCLUDED.felt_safe,
              comment = EXCLUDED.comment`,
      [newId(), event.id, me.id, input.rating, input.feltSafe, input.comment ?? '', nowMs()]
    );

    res.status(201).json({ ok: true, message: 'Değerlendirmen kaydedildi.' });
  })
);

/** Kullanıcının bir etkinliği değerlendirip değerlendirmediği. */
communityRouter.get(
  '/events/:id/review',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const row = await getDb().one<{
      rating: number;
      felt_safe: boolean;
      comment: string;
      created_at: number;
    }>('SELECT rating, felt_safe, comment, created_at FROM event_reviews WHERE event_id = $1 AND reviewer_id = $2', [
      req.params.id,
      me.id,
    ]);

    res.json({
      review: row
        ? { rating: row.rating, feltSafe: row.felt_safe === true, comment: row.comment, createdAt: row.created_at }
        : null,
    });
  })
);
