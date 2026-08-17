import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { getDb, nowMs } from '../db';
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
  targetType: z.enum(['user', 'event']),
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
    } else {
      const exists = await db.one<{ id: string }>('SELECT id FROM events WHERE id = $1', [
        input.targetId,
      ]);
      if (!exists) throw notFound('Etkinlik bulunamadı.');
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
