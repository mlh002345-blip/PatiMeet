import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { db, nowMs } from '../db';
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
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const input = parseBody(reportSchema, req.body);

    if (input.targetType === 'user') {
      if (input.targetId === me.id) {
        throw badRequest('Kendinizi şikâyet edemezsiniz.', 'self_report');
      }
      const exists = db
        .prepare<[string], { id: string }>('SELECT id FROM users WHERE id = ?')
        .get(input.targetId);
      if (!exists) throw notFound('Kullanıcı bulunamadı.');
    } else {
      const exists = db
        .prepare<[string], { id: string }>('SELECT id FROM events WHERE id = ?')
        .get(input.targetId);
      if (!exists) throw notFound('Etkinlik bulunamadı.');
    }

    const id = newId();
    db.prepare(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, me.id, input.targetType, input.targetId, input.reason, input.details ?? '', nowMs());

    res.status(201).json({
      ok: true,
      reportId: id,
      message: 'Şikâyetiniz alındı. En kısa sürede inceleyeceğiz.',
    });
  })
);

/**
 * Kullanıcı engelleme. Engelleme sonrası iki taraf birbirinin profilini
 * göremez ve mesaj gönderemez; ayrıca ortak etkinlik katılımı temizlenmez
 * ancak katılımcı listelerinde birbirlerini görmezler.
 */
safetyRouter.post(
  '/blocks',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const input = parseBody(z.object({ userId: z.string().trim().min(1) }), req.body);

    if (input.userId === me.id) {
      throw badRequest('Kendinizi engelleyemezsiniz.', 'self_block');
    }

    const target = db
      .prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?')
      .get(input.userId);
    if (!target) throw notFound('Kullanıcı bulunamadı.');

    db.prepare(
      `INSERT OR IGNORE INTO blocks (id, blocker_id, blocked_id, created_at) VALUES (?, ?, ?, ?)`
    ).run(newId(), me.id, input.userId, nowMs());

    res.status(201).json({ ok: true, message: 'Kullanıcı engellendi.' });
  })
);

safetyRouter.delete(
  '/blocks/:userId',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(
      me.id,
      req.params.userId
    );
    res.json({ ok: true, message: 'Engel kaldırıldı.' });
  })
);

safetyRouter.get(
  '/blocks',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const rows = db
      .prepare<[string], UserRow>(
        `SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id
          WHERE b.blocker_id = ? ORDER BY b.created_at DESC`
      )
      .all(me.id);
    res.json({ blocked: rows.map(publicUser) });
  })
);
