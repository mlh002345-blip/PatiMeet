import { Router } from 'express';
import { z } from 'zod';
import { requireAdminToken } from '../auth';
import {
  listEvents,
  listReports,
  listUsers,
  recentAudit,
  setDogStatus,
  setEventStatus,
  setReportStatus,
  setUserStatus,
  stats,
  type UserStatus,
} from '../domain/moderation';
import { asyncRoute, parseBody } from '../http';

/**
 * Makineden makineye moderasyon API'si (`x-admin-token`).
 *
 * İnsanlar için oturum korumalı web paneli vardır (`/admin`); bu uçlar komut
 * satırı ve otomasyon içindir. İşlemler denetim kaydına `api` yöneticisi
 * altında yazılır.
 */
export const adminRouter = Router();

adminRouter.use(requireAdminToken);

/** Denetim kaydında API üzerinden yapılan işlemleri ayırt etmek için. */
const API_ACTOR = 'api-token';

adminRouter.get(
  '/stats',
  asyncRoute(async (_req, res) => {
    res.json(await stats());
  })
);

adminRouter.get(
  '/reports',
  asyncRoute(async (req, res) => {
    const q = parseBody(
      z.object({
        status: z.enum(['open', 'reviewing', 'resolved']).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
      req.query
    );
    res.json({ reports: await listReports(q.status ?? null, q.limit) });
  })
);

adminRouter.patch(
  '/reports/:id',
  asyncRoute(async (req, res) => {
    const input = parseBody(
      z.object({
        status: z.enum(['open', 'reviewing', 'resolved']),
        note: z.string().max(500).optional(),
      }),
      req.body
    );
    await setReportStatus(API_ACTOR, req.params.id, input.status, input.note ?? '');
    res.json({ ok: true });
  })
);

adminRouter.get(
  '/users',
  asyncRoute(async (req, res) => {
    const q = parseBody(
      z.object({
        q: z.string().trim().max(80).optional(),
        status: z.enum(['active', 'suspended', 'deleted']).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
      req.query
    );
    res.json({ users: await listUsers(q.q ?? null, q.status ?? null, q.limit) });
  })
);

/** Kullanıcıyı pasife alma / geri açma / verilerini silme. */
adminRouter.patch(
  '/users/:id',
  asyncRoute(async (req, res) => {
    const input = parseBody(
      z.object({
        status: z.enum(['active', 'suspended', 'deleted']),
        note: z.string().max(500).optional(),
      }),
      req.body
    );
    await setUserStatus(API_ACTOR, req.params.id, input.status as UserStatus, input.note ?? '');
    res.json({ ok: true });
  })
);

adminRouter.get(
  '/events',
  asyncRoute(async (req, res) => {
    const q = parseBody(
      z.object({
        q: z.string().trim().max(80).optional(),
        status: z.enum(['active', 'cancelled', 'removed']).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
      req.query
    );
    res.json({ events: await listEvents(q.q ?? null, q.status ?? null, q.limit) });
  })
);

/** Etkinliği kaldırma — kullanıcı tarafında görünmez olur. */
adminRouter.patch(
  '/events/:id',
  asyncRoute(async (req, res) => {
    const input = parseBody(
      z.object({
        status: z.enum(['active', 'cancelled', 'removed']),
        note: z.string().max(500).optional(),
      }),
      req.body
    );
    await setEventStatus(API_ACTOR, req.params.id, input.status, input.note ?? '');
    res.json({ ok: true });
  })
);

/** Köpek profilini gizleme veya silme. */
adminRouter.patch(
  '/dogs/:id',
  asyncRoute(async (req, res) => {
    const input = parseBody(
      z.object({
        status: z.enum(['active', 'hidden', 'deleted']),
        note: z.string().max(500).optional(),
      }),
      req.body
    );
    await setDogStatus(API_ACTOR, req.params.id, input.status, input.note ?? '');
    res.json({ ok: true });
  })
);

adminRouter.get(
  '/audit',
  asyncRoute(async (req, res) => {
    const q = parseBody(
      z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }),
      req.query
    );
    res.json({ entries: await recentAudit(q.limit) });
  })
);
