import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { getDb, nowMs, type CountRow, type Db } from '../db';
import { track } from '../domain/analytics';
import { isBlockedBetween } from '../domain/blocks';
import { notifyUser } from '../domain/push';
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

async function findOrCreateConversation(
  db: Db,
  userId: string,
  otherId: string
): Promise<ConversationRow> {
  const [a, b] = pairKey(userId, otherId);

  const existing = await db.one<ConversationRow>(
    'SELECT * FROM conversations WHERE user_a_id = $1 AND user_b_id = $2',
    [a, b]
  );
  if (existing) return existing;

  const id = newId();
  /**
   * Eşzamanlı iki istek aynı konuşmayı açmaya çalışabilir; tekil kısıt
   * ihlalinde mevcut kaydı okuyup devam ediyoruz.
   */
  await db.exec(
    `INSERT INTO conversations (id, user_a_id, user_b_id, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_a_id, user_b_id) DO NOTHING`,
    [id, a, b, nowMs()]
  );

  const row = await db.one<ConversationRow>(
    'SELECT * FROM conversations WHERE user_a_id = $1 AND user_b_id = $2',
    [a, b]
  );
  if (!row) throw new Error('Konuşma oluşturulamadı.');
  return row;
}

function otherParticipant(conversation: ConversationRow, userId: string): string {
  return conversation.user_a_id === userId ? conversation.user_b_id : conversation.user_a_id;
}

/**
 * Mesajlaşma önkoşulları: hedef hesap aktif olmalı ve iki taraf arasında
 * engelleme bulunmamalı.
 */
async function assertCanMessage(db: Db, userId: string, otherId: string): Promise<UserRow> {
  if (userId === otherId) {
    throw badRequest('Kendinize mesaj gönderemezsiniz.', 'self_message');
  }

  const other = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [otherId]);
  if (!other || other.status !== 'active') throw notFound('Kullanıcı bulunamadı.');

  if (await isBlockedBetween(userId, otherId, db)) {
    throw forbidden('Bu kullanıcıyla mesajlaşamazsınız.');
  }

  return other;
}

/** Konuşma listesi: son mesaj ve okunmamış sayısı ile birlikte. */
messagesRouter.get(
  '/conversations',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);

    /**
     * Konuşma listesi tek sorguda toplanır: karşı taraf, son mesaj ve
     * okunmamış sayısı yan sorgularla getirilir. Böylece konuşma başına
     * ayrı sorgu atmıyoruz (N+1 sorgu sorunu).
     */
    const rows = await db.query<{
      id: string;
      other_id: string;
      other_name: string;
      other_district: string | null;
      other_bio: string;
      other_purpose: string | null;
      other_purposes: string[] | null;
      other_photo_url: string | null;
      last_body: string | null;
      last_created_at: number | null;
      last_sender_id: string | null;
      unread_count: number;
      updated_at: number;
    }>(
      `SELECT c.id,
              o.id            AS other_id,
              o.name          AS other_name,
              o.district      AS other_district,
              o.bio           AS other_bio,
              o.purpose       AS other_purpose,
              o.purposes      AS other_purposes,
              o.photo_url     AS other_photo_url,
              last.body       AS last_body,
              last.created_at AS last_created_at,
              last.sender_id  AS last_sender_id,
              COALESCE(unread.c, 0)::int AS unread_count,
              COALESCE(c.last_message_at, c.created_at) AS updated_at
         FROM conversations c
         JOIN users o
           ON o.id = CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END
    LEFT JOIN LATERAL (
              SELECT m.body, m.created_at, m.sender_id
                FROM messages m
               WHERE m.conversation_id = c.id
               ORDER BY m.created_at DESC
               LIMIT 1
         ) last ON TRUE
    LEFT JOIN LATERAL (
              SELECT COUNT(*) AS c
                FROM messages m
               WHERE m.conversation_id = c.id
                 AND m.sender_id <> $1
                 AND m.read_at IS NULL
         ) unread ON TRUE
        WHERE (c.user_a_id = $1 OR c.user_b_id = $1)
          AND o.status = 'active'
          -- Engellenen kullanıcılar listede görünmez (her iki yön).
          AND NOT EXISTS (
                SELECT 1 FROM blocks b
                 WHERE (b.blocker_id = $1 AND b.blocked_id = o.id)
                    OR (b.blocker_id = o.id AND b.blocked_id = $1)
              )
        ORDER BY updated_at DESC`,
      [me.id]
    );

    const conversations = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        user: await publicUser({
          id: row.other_id,
          name: row.other_name,
          district: row.other_district,
          bio: row.other_bio,
          purpose: row.other_purpose,
          purposes: row.other_purposes,
          photo_url: row.other_photo_url,
        } as UserRow),
        lastMessage: row.last_created_at
          ? {
              body: row.last_body ?? '',
              createdAt: row.last_created_at,
              isMine: row.last_sender_id === me.id,
            }
          : null,
        unreadCount: row.unread_count,
        updatedAt: row.updated_at,
      }))
    );

    const totalUnread = conversations.reduce((sum, item) => sum + item.unreadCount, 0);
    res.json({ conversations, totalUnread });
  })
);

/** Bir kullanıcıyla konuşmayı açar (yoksa oluşturur). Sohbet ekranının girişi. */
messagesRouter.post(
  '/conversations',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const input = parseBody(z.object({ userId: z.string().trim().min(1) }), req.body);

    const other = await assertCanMessage(db, me.id, input.userId);
    const conversation = await findOrCreateConversation(db, me.id, input.userId);

    await track('message_started', me.id);
    res.json({ conversation: { id: conversation.id, user: await publicUser(other) } });
  })
);

async function ownedConversation(
  db: Db,
  conversationId: string,
  userId: string
): Promise<ConversationRow> {
  const row = await db.one<ConversationRow>('SELECT * FROM conversations WHERE id = $1', [
    conversationId,
  ]);
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
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const conversation = await ownedConversation(db, req.params.id, me.id);
    const otherId = otherParticipant(conversation, me.id);

    const other = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [otherId]);
    if (!other || other.status !== 'active') throw notFound('Kullanıcı bulunamadı.');

    const blocked = await isBlockedBetween(me.id, otherId, db);

    const rows = await db.query<{
      id: string;
      sender_id: string;
      body: string;
      created_at: number;
    }>(
      `SELECT id, sender_id, body, created_at FROM messages
        WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversation.id]
    );

    await db.exec(
      `UPDATE messages SET read_at = $1
        WHERE conversation_id = $2 AND sender_id <> $3 AND read_at IS NULL`,
      [nowMs(), conversation.id, me.id]
    );

    res.json({
      conversation: { id: conversation.id, user: await publicUser(other) },
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
  asyncRoute(async (req, res) => {
    const db = getDb();
    const me = currentUser(req);
    const conversation = await ownedConversation(db, req.params.id, me.id);
    const otherId = otherParticipant(conversation, me.id);
    await assertCanMessage(db, me.id, otherId);

    const input = parseBody(sendSchema, req.body);
    const ts = nowMs();
    const id = newId();

    await db.tx(async (t) => {
      await t.exec(
        'INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES ($1, $2, $3, $4, $5)',
        [id, conversation.id, me.id, input.body, ts]
      );
      await t.exec('UPDATE conversations SET last_message_at = $1 WHERE id = $2', [
        ts,
        conversation.id,
      ]);
    });

    // Alıcıya bildirim: okunmamış toplamı simge sayacına yazılır.
    const sender = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [me.id]);
    const unread = await db.one<CountRow>(
      `SELECT COUNT(*)::int AS c FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE m.read_at IS NULL AND m.sender_id <> $1
          AND (c.user_a_id = $1 OR c.user_b_id = $1)`,
      [otherId]
    );

    await notifyUser(otherId, 'messages', {
      title: sender?.name || 'Yeni mesaj',
      body: input.body.length > 120 ? `${input.body.slice(0, 117)}…` : input.body,
      data: { type: 'chat', conversationId: conversation.id },
      badge: unread?.c ?? undefined,
    });

    res.status(201).json({
      message: { id, body: input.body, createdAt: ts, isMine: true },
    });
  })
);

/** Okunmamış toplamı — alt menüdeki göstergeyi beslemek için hafif bir uç. */
messagesRouter.get(
  '/unread-count',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const row = await getDb().one<CountRow>(
      `SELECT COUNT(*)::int AS c FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE m.read_at IS NULL AND m.sender_id <> $1
          AND (c.user_a_id = $1 OR c.user_b_id = $1)`,
      [me.id]
    );
    res.json({ unreadCount: row?.c ?? 0 });
  })
);
