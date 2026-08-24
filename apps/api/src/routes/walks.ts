import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { getDb } from '../db';
import { track } from '../domain/analytics';
import { normalizePhotoInput } from '../domain/media';
import {
  activeShares,
  activeWalk,
  appendPoints,
  finishWalk,
  MAX_ACCURACY_METERS,
  MAX_SHARE_MINUTES,
  publicWalk,
  setWalkStatus,
  sharedWalkView,
  shareWalk,
  startWalk,
  stopSharing,
  walkRoute,
  weeklySummary,
  type WalkRow,
} from '../domain/walks';
import { asyncRoute, parseBody } from '../http';

export const walksRouter = Router();

/**
 * Canlı Yürüyüş uçları.
 *
 * Ham rota yalnızca `GET /:id/route` ile ve yalnızca sahibine döner. Diğer
 * kullanıcılar bir yürüyüşün rotasına hiçbir uçtan erişemez.
 */

/** Kurtarma: uygulama kapansa bile süren yürüyüş buradan geri alınır. */
walksRouter.get(
  '/active',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const row = await activeWalk(me.id);
    if (!row) {
      res.json({ walk: null });
      return;
    }
    const route = await walkRoute(me.id, row.id);
    res.json({
      walk: await publicWalk(row, { includeRoute: route }),
      /** Kurtarmada istemci sayaçları bu noktalardan yeniden kurar. */
      pointCount: route.length,
      shares: await activeShares(me.id, row.id),
    });
  })
);

walksRouter.post(
  '/',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        dogId: z.string().trim().min(1).nullable().optional(),
        district: z.string().trim().max(80).nullable().optional(),
        hideEndpoints: z.boolean().optional(),
      }),
      req.body
    );

    const row = await startWalk(me.id, input);
    await track('walk_started', me.id, { has_dog: Boolean(input.dogId) });
    res.status(201).json({ walk: await publicWalk(row) });
  })
);

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(10000).nullable().optional(),
  recordedAt: z.number().int(),
});

walksRouter.post(
  '/:id/points',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        points: z.array(pointSchema).min(1).max(200),
        durationSeconds: z.number().int().min(0).max(86400),
      }),
      req.body
    );

    const result = await appendPoints(me.id, req.params.id, input.points, input.durationSeconds);
    res.json({
      walk: await publicWalk(result.walk),
      accepted: result.accepted,
      /** İstemci kaç noktanın neden atıldığını görebilsin. */
      rejected: result.rejected,
      /** Zaten kayıtlı zaman damgalarıyla eşleşip sessizce elenen tekrar gönderimler. */
      duplicate: result.duplicate,
      maxAccuracyMeters: MAX_ACCURACY_METERS,
    });
  })
);

walksRouter.patch(
  '/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(z.object({ status: z.enum(['active', 'paused']) }), req.body);
    const row = await setWalkStatus(me.id, req.params.id, input.status);
    res.json({ walk: await publicWalk(row) });
  })
);

walksRouter.post(
  '/:id/finish',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        durationSeconds: z.number().int().min(0).max(86400).optional(),
        note: z.string().trim().max(500).optional(),
        photoUrl: z.string().trim().max(2000).nullable().optional(),
        cancel: z.boolean().optional(),
      }),
      req.body
    );

    const photo = await normalizePhotoInput(me.id, input.photoUrl, db);
    const row = await finishWalk(
      me.id,
      req.params.id,
      { ...input, photoKey: photo ?? undefined },
      db
    );

    if (!input.cancel) {
      await track('walk_completed', me.id, {
        distance_meters: row.distance_meters,
        duration_seconds: row.duration_seconds,
      });
    }

    const route = await walkRoute(me.id, row.id, db);
    res.json({ walk: await publicWalk(row, { includeRoute: route }) });
  })
);

/** Ham rota — YALNIZCA sahibine. */
walksRouter.get(
  '/:id/route',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const points = await walkRoute(me.id, req.params.id);
    res.json({
      points: points.map((p) => ({ lat: p.lat, lng: p.lng, recordedAt: p.recorded_at })),
    });
  })
);

walksRouter.get(
  '/summary',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    res.json(await weeklySummary(me.id));
  })
);

walksRouter.get(
  '/',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const q = parseBody(
      z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }),
      req.query
    );
    const rows = await getDb().query<WalkRow>(
      `SELECT * FROM walks WHERE user_id = $1 AND status = 'completed'
        ORDER BY started_at DESC LIMIT $2`,
      [me.id, q.limit ?? 20]
    );
    res.json({ walks: await Promise.all(rows.map((row) => publicWalk(row))) });
  })
);

// --- Süreli canlı konum paylaşımı ---

walksRouter.post(
  '/:id/share',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        userId: z.string().trim().min(1),
        minutes: z.number().int().min(1).max(MAX_SHARE_MINUTES),
      }),
      req.body
    );
    const result = await shareWalk(me.id, req.params.id, input.userId, input.minutes);
    res.status(201).json({ ok: true, ...result });
  })
);

walksRouter.delete(
  '/:id/share',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    await stopSharing(me.id, req.params.id);
    res.json({ ok: true, message: 'Konum paylaşımı durduruldu.' });
  })
);

/** Paylaşılan canlı konum — yalnızca süresi dolmamış paylaşımın hedefi görür. */
walksRouter.get(
  '/:id/shared',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    res.json(await sharedWalkView(me.id, req.params.id));
  })
);
