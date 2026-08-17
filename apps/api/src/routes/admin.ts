import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../auth';
import { db, nowMs } from '../db';
import { asyncRoute, notFound, parseBody } from '../http';

/**
 * MVP'de özel bir admin paneli geliştirilmiyor. Bu uçlar, yayın öncesi
 * gereken moderasyon işlemlerinin (pasife alma, etkinlik kaldırma, şikâyet
 * inceleme, içerik gizleme) API üzerinden yapılabilmesi için var.
 * `x-admin-token` başlığı ile korunur.
 */
export const adminRouter = Router();

adminRouter.use(requireAdmin);

adminRouter.get(
  '/reports',
  asyncRoute((req, res) => {
    const q = parseBody(
      z.object({
        status: z.enum(['open', 'reviewing', 'resolved']).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      req.query
    );

    const rows = q.status
      ? db
          .prepare('SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT ?')
          .all(q.status, q.limit)
      : db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT ?').all(q.limit);

    res.json({ reports: rows });
  })
);

adminRouter.patch(
  '/reports/:id',
  asyncRoute((req, res) => {
    const input = parseBody(
      z.object({ status: z.enum(['open', 'reviewing', 'resolved']) }),
      req.body
    );
    const result = db
      .prepare('UPDATE reports SET status = ? WHERE id = ?')
      .run(input.status, req.params.id);
    if (result.changes === 0) throw notFound('Şikâyet bulunamadı.');
    res.json({ ok: true });
  })
);

/** Kullanıcıyı pasife alma / geri açma. */
adminRouter.patch(
  '/users/:id',
  asyncRoute((req, res) => {
    const input = parseBody(
      z.object({ status: z.enum(['active', 'suspended', 'deleted']) }),
      req.body
    );
    const result = db
      .prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
      .run(input.status, nowMs(), req.params.id);
    if (result.changes === 0) throw notFound('Kullanıcı bulunamadı.');
    res.json({ ok: true });
  })
);

/** Etkinliği kaldırma — kullanıcı tarafında görünmez olur. */
adminRouter.patch(
  '/events/:id',
  asyncRoute((req, res) => {
    const input = parseBody(
      z.object({ status: z.enum(['active', 'cancelled', 'removed']) }),
      req.body
    );
    const result = db
      .prepare('UPDATE events SET status = ?, updated_at = ? WHERE id = ?')
      .run(input.status, nowMs(), req.params.id);
    if (result.changes === 0) throw notFound('Etkinlik bulunamadı.');
    res.json({ ok: true });
  })
);

/** Köpek profilini gizleme veya silme. */
adminRouter.patch(
  '/dogs/:id',
  asyncRoute((req, res) => {
    const input = parseBody(z.object({ status: z.enum(['active', 'hidden', 'deleted']) }), req.body);
    const result = db
      .prepare('UPDATE dogs SET status = ?, updated_at = ? WHERE id = ?')
      .run(input.status, nowMs(), req.params.id);
    if (result.changes === 0) throw notFound('Köpek profili bulunamadı.');
    res.json({ ok: true });
  })
);

adminRouter.get(
  '/stats',
  asyncRoute((_req, res) => {
    const one = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
    res.json({
      users: one(`SELECT COUNT(*) AS c FROM users WHERE status = 'active'`),
      dogs: one(`SELECT COUNT(*) AS c FROM dogs WHERE status = 'active'`),
      events: one(`SELECT COUNT(*) AS c FROM events WHERE status = 'active'`),
      messages: one('SELECT COUNT(*) AS c FROM messages'),
      openReports: one(`SELECT COUNT(*) AS c FROM reports WHERE status = 'open'`),
    });
  })
);
