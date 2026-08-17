import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { db, nowMs } from '../db';
import { isBlockedBetween } from '../domain/blocks';
import { publicUser, type UserRow } from '../domain/serialize';
import { asyncRoute, badRequest, forbidden, notFound, parseBody } from '../http';
import { newId } from '../ids';

export const messagesRouter = Router();

interface ConversationRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  last_message_at: number | null;
  created_at: number;
}

/** Konuşma anahtarını yönden bağımsız kılmak için kimlikleri sıralıyoruz. */
function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function findOrCreateConversation(userId: string, otherId: string): ConversationRow {
  const [a, b] = pairKey(userId, otherId);

  const existing = db
    .prepare<[string, string], ConversationRow>(
      'SELECT * FROM conversations WHERE user_a_id = ? AND user_b_id = ?'
    )
    .get(a, b);
  if (existing) return existing;

  const id = newId();
  db.prepare(
    'INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)'
  ).run(id, a, b, nowMs());

  return db.prepare<[string], ConversationRow>('SELECT * FROM conversations WHERE id = ?').get(id)!;
}

function otherParticipant(conversation: ConversationRow, userId: string): string {
  return conversation.user_a_id === userId ? conversation.user_b_id : conversation.user_a_id;
}

/**
 * Mesajlaşma önkoşulları: hedef hesap aktif olmalı ve iki taraf arasında
 * engelleme bulunmamalı.
 */
function assertCanMessage(userId: string, otherId: string): UserRow {
  if (userId === otherId) {
    throw badRequest('Kendinize mesaj gönderemezsiniz.', 'self_message');
  }

  const other = db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?').get(otherId);
  if (!other || other.status !== 'active') throw notFound('Kullanıcı bulunamadı.');

  if (isBlockedBetween(userId, otherId)) {
    throw forbidden('Bu kullanıcıyla mesajlaşamazsınız.');
  }

  return other;
}

/** Konuşma listesi: son mesaj ve okunmamış sayısı ile birlikte. */
messagesRouter.get(
  '/conversations',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);

    const rows = db
      .prepare<[string, string], ConversationRow>(
        `SELECT * FROM conversations
          WHERE user_a_id = ? OR user_b_id = ?
          ORDER BY COALESCE(last_message_at, created_at) DESC`
      )
      .all(me.id, me.id);

    const items = rows
      .map((row) => {
        const otherId = otherParticipant(row, me.id);
        const other = db
          .prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?')
          .get(otherId);

        // Pasif hesaplar ve engellenen kullanıcılar listede görünmez.
        if (!other || other.status !== 'active') return null;
        if (isBlockedBetween(me.id, otherId)) return null;

        const last = db
          .prepare<[string], { body: string; created_at: number; sender_id: string }>(
            `SELECT body, created_at, sender_id FROM messages
              WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`
          )
          .get(row.id);

        const unread = db
          .prepare<[string, string], { c: number }>(
            `SELECT COUNT(*) AS c FROM messages
              WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL`
          )
          .get(row.id, me.id);

        return {
          id: row.id,
          user: publicUser(other),
          lastMessage: last
            ? { body: last.body, createdAt: last.created_at, isMine: last.sender_id === me.id }
            : null,
          unreadCount: unread?.c ?? 0,
          updatedAt: row.last_message_at ?? row.created_at,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const totalUnread = items.reduce((sum, item) => sum + item.unreadCount, 0);
    res.json({ conversations: items, totalUnread });
  })
);

/** Bir kullanıcıyla konuşmayı açar (yoksa oluşturur). Sohbet ekranının girişi. */
messagesRouter.post(
  '/conversations',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const input = parseBody(z.object({ userId: z.string().trim().min(1) }), req.body);

    const other = assertCanMessage(me.id, input.userId);
    const conversation = findOrCreateConversation(me.id, input.userId);

    res.json({ conversation: { id: conversation.id, user: publicUser(other) } });
  })
);

function ownedConversation(conversationId: string, userId: string): ConversationRow {
  const row = db
    .prepare<[string], ConversationRow>('SELECT * FROM conversations WHERE id = ?')
    .get(conversationId);
  if (!row) throw notFound('Konuşma bulunamadı.');
  if (row.user_a_id !== userId && row.user_b_id !== userId) {
    throw forbidden('Bu konuşmaya erişiminiz yok.');
  }
  return row;
}

/** Mesajları getirir ve karşı tarafın mesajlarını okundu olarak işaretler. */
messagesRouter.get(
  '/conversations/:id/messages',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const conversation = ownedConversation(req.params.id, me.id);
    const otherId = otherParticipant(conversation, me.id);

    const other = db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?').get(otherId);
    if (!other || other.status !== 'active') throw notFound('Kullanıcı bulunamadı.');

    const blocked = isBlockedBetween(me.id, otherId);

    const rows = db
      .prepare<[string], { id: string; sender_id: string; body: string; created_at: number }>(
        `SELECT id, sender_id, body, created_at FROM messages
          WHERE conversation_id = ? ORDER BY created_at ASC`
      )
      .all(conversation.id);

    db.prepare(
      `UPDATE messages SET read_at = ?
        WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL`
    ).run(nowMs(), conversation.id, me.id);

    res.json({
      conversation: { id: conversation.id, user: publicUser(other) },
      // Engelli durumda geçmiş okunabilir ama yeni mesaj gönderilemez.
      canSend: !blocked,
      blocked,
      messages: rows.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.created_at,
        isMine: row.sender_id === me.id,
      })),
    });
  })
);

const sendSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Mesaj boş olamaz.')
    .max(1000, 'Mesaj en fazla 1000 karakter olabilir.'),
});

messagesRouter.post(
  '/conversations/:id/messages',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const conversation = ownedConversation(req.params.id, me.id);
    const otherId = otherParticipant(conversation, me.id);
    assertCanMessage(me.id, otherId);

    const input = parseBody(sendSchema, req.body);
    const ts = nowMs();
    const id = newId();

    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, conversation.id, me.id, input.body, ts);
      db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(
        ts,
        conversation.id
      );
    });
    tx();

    res.status(201).json({
      message: { id, body: input.body, createdAt: ts, isMine: true },
    });
  })
);

/** Okunmamış toplamı — alt menüdeki göstergeyi beslemek için hafif bir uç. */
messagesRouter.get(
  '/unread-count',
  requireAuth,
  asyncRoute((req, res) => {
    const me = currentUser(req);
    const row = db
      .prepare<[string, string, string], { c: number }>(
        `SELECT COUNT(*) AS c FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
          WHERE m.read_at IS NULL AND m.sender_id != ?
            AND (c.user_a_id = ? OR c.user_b_id = ?)`
      )
      .get(me.id, me.id, me.id);
    res.json({ unreadCount: row?.c ?? 0 });
  })
);
