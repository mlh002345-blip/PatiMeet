import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { getDb, nowMs } from '../db';
import {
  ALERT_TYPES,
  ALERT_TYPE_INFO,
  createAlert,
  getAlert,
  listAlerts,
  MAX_ALERT_PHOTOS,
  notifyDistrictOfAlert,
  removeAlert,
  updateAlertStatus,
} from '../domain/alerts';
import { notifyUser } from '../domain/push';
import { publicUser, type UserRow } from '../domain/serialize';
import { asyncRoute, badRequest, notFound, parseBody } from '../http';
import { newId } from '../ids';

export const safetyRouter = Router();

const REPORT_REASONS = [
  'taciz',
  'uygunsuz_icerik',
  'sahte_profil',
  'hayvana_kotu_muamele',
  'spam',
  'diger',
] as const;

const reportSchema = z.object({
  targetType: z.enum(['user', 'event', 'alert']),
  targetId: z.string().trim().min(1, 'Şikâyet edilen kayıt gerekli.'),
  reason: z.enum(REPORT_REASONS, { errorMap: () => ({ message: 'Şikâyet nedeni seçin.' }) }),
  details: z.string().trim().max(600, 'Açıklama en fazla 600 karakter olabilir.').optional(),
});

safetyRouter.get(
  '/report-reasons',
  asyncRoute((_req, res) => {
    res.json({
      reasons: [
        { value: 'taciz', label: 'Taciz veya rahatsız edici davranış' },
        { value: 'uygunsuz_icerik', label: 'Uygunsuz içerik' },
        { value: 'sahte_profil', label: 'Sahte profil' },
        { value: 'hayvana_kotu_muamele', label: 'Hayvana kötü muamele' },
        { value: 'spam', label: 'Spam veya reklam' },
        { value: 'diger', label: 'Diğer' },
      ],
    });
  })
);

safetyRouter.post(
  '/reports',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(reportSchema, req.body);

    if (input.targetType === 'user') {
      if (input.targetId === me.id) {
        throw badRequest('Kendinizi şikâyet edemezsiniz.', 'self_report');
      }
      const exists = await db.one<{ id: string }>('SELECT id FROM users WHERE id = $1', [
        input.targetId,
      ]);
      if (!exists) throw notFound('Kullanıcı bulunamadı.');
    } else if (input.targetType === 'event') {
      const exists = await db.one<{ id: string }>('SELECT id FROM events WHERE id = $1', [
        input.targetId,
      ]);
      if (!exists) throw notFound('Etkinlik bulunamadı.');
    } else {
      const exists = await db.one<{ id: string }>(
        'SELECT id FROM community_alerts WHERE id = $1',
        [input.targetId]
      );
      if (!exists) throw notFound('Bildirim bulunamadı.');
    }

    const id = newId();
    await db.exec(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, me.id, input.targetType, input.targetId, input.reason, input.details ?? '', nowMs()]
    );

    res.status(201).json({
      ok: true,
      reportId: id,
      message: 'Şikâyetiniz alındı. En kısa sürede inceleyeceğiz.',
    });
  })
);

/**
 * Kullanıcı engelleme. Engelleme sonrası iki taraf birbirinin profilini
 * göremez ve mesaj gönderemez.
 */
safetyRouter.post(
  '/blocks',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(z.object({ userId: z.string().trim().min(1) }), req.body);

    if (input.userId === me.id) {
      throw badRequest('Kendinizi engelleyemezsiniz.', 'self_block');
    }

    const target = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [input.userId]);
    if (!target) throw notFound('Kullanıcı bulunamadı.');

    await db.exec(
      `INSERT INTO blocks (id, blocker_id, blocked_id, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [newId(), me.id, input.userId, nowMs()]
    );

    res.status(201).json({ ok: true, message: 'Kullanıcı engellendi.' });
  })
);

safetyRouter.delete(
  '/blocks/:userId',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    await getDb().exec('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [
      me.id,
      req.params.userId,
    ]);
    res.json({ ok: true, message: 'Engel kaldırıldı.' });
  })
);

safetyRouter.get(
  '/blocks',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const rows = await getDb().query<UserRow>(
      `SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id
        WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
      [me.id]
    );
    res.json({ blocked: await Promise.all(rows.map(publicUser)) });
  })
);


// ---------------------------------------------------------------------------
// Güvenli Topluluk bildirimleri
// ---------------------------------------------------------------------------

/**
 * Bildirim türleri ve her türün hangi alanları zorunlu kıldığı. İstemci formu
 * bu listeye göre kurar; kurallar tek yerde (domain/alerts.ts) yaşar.
 */
safetyRouter.get(
  '/alert-types',
  asyncRoute((_req, res) => {
    res.json({ types: ALERT_TYPE_INFO, maxPhotos: MAX_ALERT_PHOTOS });
  })
);

const alertQuerySchema = z.object({
  type: z.enum(ALERT_TYPES).optional(),
  district: z.string().trim().max(80).optional(),
  scope: z.enum(['all', 'mine']).optional(),
  status: z.enum(['active', 'resolved']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

safetyRouter.get(
  '/alerts',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const q = parseBody(alertQuerySchema, req.query);
    const limit = q.limit ?? 30;
    const offset = q.offset ?? 0;
    const alerts = await listAlerts(me.id, { ...q, limit, offset });
    res.json({ alerts, limit, offset, hasMore: alerts.length === limit });
  })
);

/**
 * Bildirim oluşturma.
 *
 * KONUM: yalnızca semt ve yaklaşık bölge tarifi alınır. Koordinat veya açık
 * adres alanı bilinçli olarak YOK; domain katmanı adres benzeri metni de
 * reddeder.
 */
const alertSchema = z.object({
  type: z.enum(ALERT_TYPES, { errorMap: () => ({ message: 'Bildirim türü seçin.' }) }),
  animalName: z
    .string()
    .trim()
    .min(1, 'Hayvanın adını yazın.')
    .max(60, 'Ad en fazla 60 karakter olabilir.')
    .nullable()
    .optional(),
  district: z.string().trim().min(2, 'Semt seçin.').max(80),
  areaNote: z
    .string()
    .trim()
    .max(120, 'Yaklaşık bölge en fazla 120 karakter olabilir.')
    .optional(),
  occurredAt: z.number().int().nullable().optional(),
  description: z
    .string()
    .trim()
    .min(10, 'Açıklama en az 10 karakter olmalı.')
    .max(1000, 'Açıklama en fazla 1000 karakter olabilir.'),
  photoKeys: z.array(z.string().trim().min(1).max(2000)).max(MAX_ALERT_PHOTOS).optional(),
});

safetyRouter.post(
  '/alerts',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(alertSchema, req.body);

    const row = await createAlert(me.id, input, db);

    // Bildirim gönderimi ilan oluşturmayı bloke etmemeli.
    const push = await notifyDistrictOfAlert(row, db).catch(() => ({ notified: 0 }));

    res.status(201).json({
      alert: await getAlert(me.id, row.id, db),
      notified: push.notified,
    });
  })
);

safetyRouter.get(
  '/alerts/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    res.json({ alert: await getAlert(me.id, req.params.id) });
  })
);

safetyRouter.patch(
  '/alerts/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(z.object({ status: z.enum(['active', 'resolved']) }), req.body);
    res.json({ alert: await updateAlertStatus(me.id, req.params.id, input.status) });
  })
);

safetyRouter.delete(
  '/alerts/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    await removeAlert(me.id, req.params.id);
    res.json({ ok: true, message: 'Bildirim kaldırıldı.' });
  })
);

/**
 * Güvenlik olayı bildirimi.
 *
 * Şikâyet sonucunda bir hesap kapatıldığında veya içerik kaldırıldığında
 * şikâyet edeni bilgilendirmek için moderasyon panelinden kullanılır.
 */
export async function notifySafetyOutcome(
  userId: string,
  title: string,
  body: string
): Promise<void> {
  await notifyUser(userId, 'safety', { title, body, data: { type: 'safety' } });
}
