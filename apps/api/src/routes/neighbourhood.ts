import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { getDb } from '../db';
import { track } from '../domain/analytics';
import { normalizePhotoInput } from '../domain/media';
import {
  cancelInvite,
  createGroup,
  createInvite,
  joinGroup,
  joinInvite,
  leaveGroup,
  leaveInvite,
  listGroups,
  listInvites,
  MAX_ACTIVE_INVITES,
  neighbourhoodFeed,
  notifyDistrictOfInvite,
  PACE_OPTIONS,
  publicGroup,
  publicInvite,
  type FeedKind,
  type GroupRow,
  type InviteRow,
} from '../domain/neighbourhood';
import { asyncRoute, notFound, parseBody } from '../http';

export const neighbourhoodRouter = Router();

/**
 * Mahalle Akışı, Hızlı Yürüyüş Daveti ve oyun grupları.
 *
 * Akış kaynak kayıtları tek listede birleştirir; ikinci bir kopya tablo yok.
 */

neighbourhoodRouter.get(
  '/feed',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const q = parseBody(
      z.object({
        district: z.string().trim().max(80).optional(),
        kinds: z.string().trim().max(60).optional(),
        limit: z.coerce.number().int().min(1).max(60).default(40),
      }),
      req.query
    );

    const kinds = q.kinds
      ? (q.kinds.split(',').filter((k): k is FeedKind =>
          ['event', 'alert', 'invite'].includes(k)
        ))
      : undefined;

    const items = await neighbourhoodFeed(me.id, {
      district: q.district,
      kinds,
      limit: q.limit ?? 40,
    });
    res.json({ items });
  })
);

// --- Hızlı yürüyüş daveti ---

neighbourhoodRouter.get(
  '/invite-options',
  asyncRoute((_req, res) => {
    res.json({ paces: PACE_OPTIONS, maxActive: MAX_ACTIVE_INVITES });
  })
);

neighbourhoodRouter.get(
  '/invites',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const q = parseBody(
      z.object({
        district: z.string().trim().max(80).optional(),
        scope: z.enum(['all', 'mine']).optional(),
      }),
      req.query
    );
    res.json({ invites: await listInvites(me.id, q) });
  })
);

neighbourhoodRouter.post(
  '/invites',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        dogId: z.string().trim().min(1).nullable().optional(),
        district: z.string().trim().min(2).max(80),
        areaNote: z.string().trim().max(120).optional(),
        startsAt: z.number().int(),
        durationMinutes: z.number().int().min(15).max(180),
        pace: z.enum(['sakin', 'normal', 'hareketli']),
        dogSize: z.enum(['kucuk', 'orta', 'buyuk', 'hepsi']).optional(),
        note: z.string().trim().max(300).optional(),
      }),
      req.body
    );

    const row = await createInvite(me.id, input, db);
    const push = await notifyDistrictOfInvite(row, db).catch(() => ({ notified: 0 }));
    await track('invite_created', me.id, { duration_minutes: input.durationMinutes });

    res.status(201).json({
      invite: await publicInvite(row, me.id, db),
      notified: push.notified,
    });
  })
);

neighbourhoodRouter.get(
  '/invites/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const row = await db.one<InviteRow>('SELECT * FROM walk_invites WHERE id = $1', [req.params.id]);
    if (!row) throw notFound('Davet bulunamadı.');
    res.json({ invite: await publicInvite(row, me.id, db) });
  })
);

neighbourhoodRouter.post(
  '/invites/:id/join',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(
      z.object({ dogId: z.string().trim().min(1).nullable().optional() }),
      req.body
    );

    await joinInvite(me.id, req.params.id, input.dogId ?? null, db);
    await track('invite_joined', me.id);

    const row = await db.one<InviteRow>('SELECT * FROM walk_invites WHERE id = $1', [req.params.id]);
    res.json({
      invite: await publicInvite(row!, me.id, db),
      /**
       * Kesin buluşma noktası davette görünmez; katılımcı ilan sahibiyle
       * mesajlaşarak öğrenir.
       */
      message: 'Katıldın. Buluşma ayrıntısını mesajla konuşabilirsin.',
    });
  })
);

neighbourhoodRouter.post(
  '/invites/:id/leave',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    await leaveInvite(me.id, req.params.id, db);
    const row = await db.one<InviteRow>('SELECT * FROM walk_invites WHERE id = $1', [req.params.id]);
    if (!row) throw notFound('Davet bulunamadı.');
    res.json({ invite: await publicInvite(row, me.id, db) });
  })
);

neighbourhoodRouter.post(
  '/invites/:id/cancel',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    await cancelInvite(me.id, req.params.id);
    res.json({ ok: true, message: 'Davet iptal edildi.' });
  })
);

// --- Oyun grupları ---

neighbourhoodRouter.get(
  '/groups',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const q = parseBody(
      z.object({
        district: z.string().trim().max(80).optional(),
        scope: z.enum(['all', 'mine']).optional(),
      }),
      req.query
    );
    res.json({ groups: await listGroups(me.id, q) });
  })
);

neighbourhoodRouter.post(
  '/groups',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        name: z.string().trim().min(3, 'Grup adı en az 3 karakter olmalı.').max(80),
        district: z.string().trim().min(2).max(80),
        dogSize: z.enum(['kucuk', 'orta', 'buyuk', 'hepsi']).optional(),
        playStyle: z.enum(['sakin', 'dengeli', 'hareketli']).optional(),
        description: z.string().trim().max(600).optional(),
        coverPhotoUrl: z.string().trim().max(2000).nullable().optional(),
      }),
      req.body
    );

    const cover = await normalizePhotoInput(me.id, input.coverPhotoUrl, db);
    const row = await createGroup(me.id, { ...input, coverPhotoUrl: cover }, db);
    res.status(201).json({ group: await publicGroup(row, me.id, db) });
  })
);

neighbourhoodRouter.post(
  '/groups/:id/join',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    await joinGroup(me.id, req.params.id, db);
    const row = await db.one<GroupRow>('SELECT * FROM play_groups WHERE id = $1', [req.params.id]);
    res.json({ group: await publicGroup(row!, me.id, db) });
  })
);

neighbourhoodRouter.post(
  '/groups/:id/leave',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    await leaveGroup(me.id, req.params.id, db);
    const row = await db.one<GroupRow>('SELECT * FROM play_groups WHERE id = $1', [req.params.id]);
    res.json({ group: await publicGroup(row!, me.id, db) });
  })
);
