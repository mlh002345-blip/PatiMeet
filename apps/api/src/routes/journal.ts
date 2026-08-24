import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { getDb } from '../db';
import { track } from '../domain/analytics';
import {
  addDocument,
  addMemory,
  assertOwnedDog,
  createJournalEntry,
  deleteDocument,
  deleteJournalEntry,
  DOCUMENT_TYPES,
  getDocument,
  getEmergencyCard,
  journalOverview,
  JOURNAL_TYPES,
  listDocuments,
  listMemories,
  publicJournalEntry,
  saveEmergencyCard,
  setEmergencySharing,
  updateReminder,
  type JournalRow,
} from '../domain/journal';
import { asyncRoute, parseBody } from '../http';

export const journalRouter = Router();

const TYPE_VALUES = JOURNAL_TYPES.map((t) => t.value) as [string, ...string[]];
const DOC_VALUES = DOCUMENT_TYPES.map((t) => t.value) as [string, ...string[]];

/** Form yapısı sunucudan gelir; istemci devasa tek form kurmaz. */
journalRouter.get(
  '/types',
  asyncRoute((_req, res) => {
    res.json({ types: JOURNAL_TYPES, documentTypes: DOCUMENT_TYPES });
  })
);

journalRouter.get(
  '/:dogId/overview',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    res.json(await journalOverview(me.id, req.params.dogId));
  })
);

journalRouter.get(
  '/:dogId/entries',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    await assertOwnedDog(me.id, req.params.dogId, db);

    const q = parseBody(
      z.object({
        type: z.enum(TYPE_VALUES).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      req.query
    );

    const params: unknown[] = [req.params.dogId];
    let where = 'dog_id = $1';
    if (q.type) {
      params.push(q.type);
      where += ` AND type = $${params.length}`;
    }
    params.push(q.limit ?? 50);

    const rows = await db.query<JournalRow>(
      `SELECT * FROM dog_journal_entries WHERE ${where} ORDER BY occurred_at DESC LIMIT $${params.length}`,
      params
    );
    res.json({ entries: rows.map(publicJournalEntry) });
  })
);

journalRouter.post(
  '/entries',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        dogId: z.string().trim().min(1),
        type: z.enum(TYPE_VALUES),
        title: z.string().trim().max(120).optional(),
        note: z.string().trim().max(1000).optional(),
        occurredAt: z.number().int(),
        remindAt: z.number().int().nullable().optional(),
        repeatIntervalDays: z.number().int().min(1).max(730).nullable().optional(),
        value: z.number().nullable().optional(),
      }),
      req.body
    );

    const row = await createJournalEntry(me.id, input);
    await track('journal_entry_added', me.id, { has_reminder: Boolean(input.remindAt) });
    res.status(201).json({ entry: publicJournalEntry(row) });
  })
);

journalRouter.patch(
  '/entries/:id/reminder',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        status: z.enum(['pending', 'done', 'snoozed', 'cancelled']),
        snoozeUntil: z.number().int().nullable().optional(),
      }),
      req.body
    );
    const row = await updateReminder(me.id, req.params.id, input.status, input.snoozeUntil ?? null);
    res.json({ entry: publicJournalEntry(row) });
  })
);

journalRouter.delete(
  '/entries/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    await deleteJournalEntry(me.id, req.params.id);
    res.json({ ok: true });
  })
);

/**
 * Yaklaşan hatırlatmalar (tüm köpekler).
 *
 * Push yapılandırılmamış olsa bile uygulama içi hatırlatma buradan çalışır;
 * kayıt hiçbir koşulda kaybolmaz.
 */
journalRouter.get(
  '/reminders',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const rows = await getDb().query<JournalRow & { dog_name: string }>(
      `SELECT e.*, d.name AS dog_name
         FROM dog_journal_entries e
         JOIN dogs d ON d.id = e.dog_id
        WHERE e.owner_id = $1 AND e.reminder_status = 'pending' AND e.remind_at IS NOT NULL
        ORDER BY e.remind_at LIMIT 50`,
      [me.id]
    );
    res.json({
      reminders: rows.map((row) => ({ ...publicJournalEntry(row), dogName: row.dog_name })),
    });
  })
);

// --- Belgeler ---

journalRouter.get(
  '/:dogId/documents',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    res.json({ documents: await listDocuments(me.id, req.params.dogId) });
  })
);

journalRouter.get(
  '/documents/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    res.json({ document: await getDocument(me.id, req.params.id) });
  })
);

journalRouter.post(
  '/documents',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        dogId: z.string().trim().min(1),
        type: z.enum(DOC_VALUES),
        title: z.string().trim().max(120).optional(),
        storageKey: z.string().trim().min(1).max(2000),
      }),
      req.body
    );
    const id = await addDocument(me.id, input);
    res.status(201).json({ id, ok: true });
  })
);

journalRouter.delete(
  '/documents/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    await deleteDocument(me.id, req.params.id);
    res.json({ ok: true });
  })
);

// --- Anılar ---

journalRouter.get(
  '/:dogId/memories',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    res.json({ memories: await listMemories(me.id, req.params.dogId) });
  })
);

journalRouter.post(
  '/memories',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        dogId: z.string().trim().min(1),
        storageKey: z.string().trim().max(2000).nullable().optional(),
        note: z.string().trim().max(500).optional(),
        occurredAt: z.number().int(),
        walkId: z.string().trim().min(1).nullable().optional(),
        eventId: z.string().trim().min(1).nullable().optional(),
      }),
      req.body
    );
    const id = await addMemory(me.id, input);
    res.status(201).json({ id, ok: true });
  })
);

// --- Acil durum kartı ---

journalRouter.get(
  '/:dogId/emergency',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    res.json({ card: await getEmergencyCard(me.id, req.params.dogId) });
  })
);

journalRouter.put(
  '/:dogId/emergency',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(
      z.object({
        healthNote: z.string().trim().max(600).optional(),
        allergies: z.string().trim().max(300).optional(),
        medications: z.string().trim().max(300).optional(),
        chipNumber: z.string().trim().max(60).nullable().optional(),
        clinicName: z.string().trim().max(120).nullable().optional(),
      }),
      req.body
    );
    await saveEmergencyCard(me.id, req.params.dogId, input);
    res.json({ card: await getEmergencyCard(me.id, req.params.dogId) });
  })
);

/** Paylaşılabilir bağlantı açma/kapatma — varsayılan kapalı. */
journalRouter.post(
  '/:dogId/emergency/share',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(z.object({ enabled: z.boolean() }), req.body);
    const token = await setEmergencySharing(me.id, req.params.dogId, input.enabled);
    res.json({ shared: input.enabled, shareToken: token });
  })
);
