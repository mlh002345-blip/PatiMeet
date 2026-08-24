import { config } from '../config';
import { getDb, nowMs, type Db } from '../db';
import { logger } from '../logger';
import { newId } from '../ids';

/**
 * Bildirim kategorileri.
 *
 * `care`   — aşı, ilaç ve bakım hatırlatmaları
 * `invites`— hızlı yürüyüş davetleri
 * `safety` kullanıcı tercihiyle kapatılamaz (bkz. notifyUser).
 */
export type NotificationCategory = 'messages' | 'events' | 'safety' | 'care' | 'invites';

/** Aynı (kullanıcı, kategori, anahtar) bu pencere içinde yalnız bir kez bildirim üretir. */
const PUSH_DEDUPE_WINDOW_MS = 24 * 3600_000;

export interface PushMessage {
  title: string;
  body: string;
  /** İstemcinin bildirime dokunulduğunda açacağı derin bağlantı verisi. */
  data?: Record<string, string>;
  /** Uygulama simgesindeki okunmamış sayacı (iOS). */
  badge?: number;
}

export interface PushTicket {
  token: string;
  ok: boolean;
  /** `DeviceNotRegistered` gibi kalıcı hatalarda token iptal edilir. */
  shouldRevoke: boolean;
  error?: string;
  /**
   * Expo "ticket" kimliği. Gönderim anında `ok` dönse bile teslimat asıl
   * olarak bu kimlikle sorgulanan "receipt" ile doğrulanır — bazı kalıcı
   * hatalar (ör. `DeviceNotRegistered`) yalnızca receipt aşamasında ortaya
   * çıkar (bkz. `reconcilePushReceipts`).
   */
  receiptId?: string;
}

export interface PushSender {
  readonly driver: 'expo' | 'none';
  send(tokens: string[], message: PushMessage): Promise<PushTicket[]>;
}

/** Bildirim kapalıyken kullanılır; token'lar yine kaydedilir. */
export class NoopPushSender implements PushSender {
  readonly driver = 'none' as const;

  async send(tokens: string[]): Promise<PushTicket[]> {
    return tokens.map((token) => ({ token, ok: true, shouldRevoke: false }));
  }
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Expo Push API üzerinden gönderim.
 *
 * Tek uçtan hem APNs (iOS) hem FCM (Android) hedeflenir; böylece iki ayrı
 * sağlayıcı kimlik bilgisi yönetmeye gerek kalmaz. Kalıcı sertifikalar Expo
 * tarafında (EAS credentials) tutulur.
 */
export class ExpoPushSender implements PushSender {
  readonly driver = 'expo' as const;

  constructor(private readonly accessToken: string | null) {}

  async send(tokens: string[], message: PushMessage): Promise<PushTicket[]> {
    if (tokens.length === 0) return [];

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    // "Enhanced Security" açıksa zorunlu; kapalıysa gönderim yine çalışır.
    if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;

    const payload = tokens.map((token) => ({
      to: token,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
      badge: message.badge,
      sound: 'default',
      // Android'de bildirim kanalı; istemci bu kanalı oluşturur.
      channelId: 'default',
    }));

    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      // Ağ hatası kalıcı değil; token'ları iptal etmiyoruz.
      logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'push gönderimi başarısız'
      );
      return tokens.map((token) => ({ token, ok: false, shouldRevoke: false, error: 'network' }));
    }

    if (!response.ok) {
      logger.warn({ status: response.status }, 'push servisi hata döndü');
      return tokens.map((token) => ({
        token,
        ok: false,
        shouldRevoke: false,
        error: `http_${response.status}`,
      }));
    }

    const parsed = (await response.json().catch(() => null)) as {
      data?: Array<{ id?: string; status: string; message?: string; details?: { error?: string } }>;
    } | null;

    const results = parsed?.data ?? [];

    return tokens.map((token, index) => {
      const entry = results[index];
      if (!entry) return { token, ok: false, shouldRevoke: false, error: 'no_receipt' };

      if (entry.status === 'ok') return { token, ok: true, shouldRevoke: false, receiptId: entry.id };

      // Cihaz uygulamayı kaldırmış veya token geçersiz → kalıcı olarak iptal et.
      const code = entry.details?.error;
      const shouldRevoke = code === 'DeviceNotRegistered' || code === 'InvalidCredentials';

      return { token, ok: false, shouldRevoke, error: code ?? entry.message ?? 'unknown' };
    });
  }
}

const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo bir bileti bu süre sonra receipt sorgusundan düşürür; daha uzun beklemenin anlamı yok. */
const RECEIPT_MAX_AGE_MS = 20 * 3600_000;
const RECEIPT_BATCH_SIZE = 300;

/**
 * Bekleyen "ticket" kimliklerinin gerçek teslimat sonucunu Expo'dan sorgular.
 *
 * `send()` anındaki `ok` yalnız Expo'nun bileti kabul ettiğini gösterir;
 * cihazın uygulamayı kaldırmış olması gibi kalıcı hatalar çoğu zaman yalnızca
 * bu ikinci aşamada (receipt) ortaya çıkar. Bu fonksiyon periyodik olarak
 * çağrılmalı (bkz. `server.ts` içindeki zamanlayıcı); Expo push kapalıysa
 * (`config.push.driver !== 'expo'`) çağıran taraf hiç tetiklememelidir.
 */
export async function reconcilePushReceipts(db: Db = getDb()): Promise<{
  checked: number;
  revoked: number;
}> {
  const now = nowMs();
  // Expo'nun artık receipt döndürmeyeceği kadar eski bekleyen kayıtları temizle.
  await db.exec('DELETE FROM push_receipts WHERE created_at < $1', [now - RECEIPT_MAX_AGE_MS]);

  const pending = await db.query<{ receipt_id: string; token: string }>(
    'SELECT receipt_id, token FROM push_receipts ORDER BY created_at ASC LIMIT $1',
    [RECEIPT_BATCH_SIZE]
  );
  if (pending.length === 0) return { checked: 0, revoked: 0 };

  let response: Response;
  try {
    response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ ids: pending.map((row) => row.receipt_id) }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      'push receipt sorgusu başarısız'
    );
    return { checked: 0, revoked: 0 };
  }

  if (!response.ok) {
    logger.warn({ status: response.status }, 'push receipt servisi hata döndü');
    return { checked: 0, revoked: 0 };
  }

  const parsed = (await response.json().catch(() => null)) as {
    data?: Record<string, { status: string; details?: { error?: string } }>;
  } | null;
  const results = parsed?.data ?? {};

  const toRevoke: string[] = [];
  const resolvedIds: string[] = [];

  for (const row of pending) {
    const entry = results[row.receipt_id];
    // Henüz hazır değilse (Expo bazen gecikmeli işler) bir sonraki turda tekrar denenir.
    if (!entry) continue;

    resolvedIds.push(row.receipt_id);
    if (entry.status !== 'ok') {
      const code = entry.details?.error;
      if (code === 'DeviceNotRegistered' || code === 'InvalidCredentials') {
        toRevoke.push(row.token);
      }
    }
  }

  if (toRevoke.length > 0) await revokeTokens(toRevoke, db);
  if (resolvedIds.length > 0) {
    await db.exec('DELETE FROM push_receipts WHERE receipt_id = ANY($1)', [resolvedIds]);
  }

  return { checked: resolvedIds.length, revoked: toRevoke.length };
}

let sender: PushSender | null = null;

export function getPushSender(): PushSender {
  if (sender) return sender;
  sender =
    config.push.driver === 'expo'
      ? new ExpoPushSender(config.push.expoAccessToken)
      : new NoopPushSender();
  return sender;
}

/** Testlerin gönderimi yakalaması için. */
export function setPushSender(next: PushSender | null): void {
  sender = next;
}

interface TokenRow {
  id: string;
  token: string;
  platform: string;
}

/**
 * Cihaz token'ını kaydeder.
 *
 * Aynı token başka bir hesapta kayıtlıysa sahibi güncellenir: paylaşılan bir
 * cihazda kullanıcı değiştiğinde bildirimlerin eski hesaba gitmesini önler.
 */
export async function registerPushToken(
  userId: string,
  token: string,
  platform: 'ios' | 'android',
  db: Db = getDb()
): Promise<void> {
  const ts = nowMs();
  await db.exec(
    `INSERT INTO push_tokens (id, user_id, token, platform, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'active', $5, $5)
     ON CONFLICT (token) DO UPDATE
        SET user_id = $2, platform = $4, status = 'active', updated_at = $5`,
    [newId(), userId, token, platform, ts]
  );
}

export async function revokePushToken(
  userId: string,
  token: string,
  db: Db = getDb()
): Promise<void> {
  await db.exec(`DELETE FROM push_tokens WHERE user_id = $1 AND token = $2`, [userId, token]);
}

async function revokeTokens(tokens: string[], db: Db): Promise<void> {
  if (tokens.length === 0) return;
  await db.exec(`UPDATE push_tokens SET status = 'revoked', updated_at = $1 WHERE token = ANY($2)`, [
    nowMs(),
    tokens,
  ]);
}

export interface NotificationPreferences {
  messages: boolean;
  events: boolean;
  safety: boolean;
  care: boolean;
  invites: boolean;
}

export async function getPreferences(
  userId: string,
  db: Db = getDb()
): Promise<NotificationPreferences> {
  const row = await db.one<NotificationPreferences>(
    'SELECT messages, events, safety, care, invites FROM notification_preferences WHERE user_id = $1',
    [userId]
  );
  // Satır yoksa varsayılan olarak hepsi açık.
  return row ?? { messages: true, events: true, safety: true, care: true, invites: true };
}

export async function setPreferences(
  userId: string,
  next: Partial<NotificationPreferences>,
  db: Db = getDb()
): Promise<NotificationPreferences> {
  const current = await getPreferences(userId, db);
  const merged = { ...current, ...next };

  await db.exec(
    `INSERT INTO notification_preferences
       (user_id, messages, events, safety, care, invites, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE
        SET messages = $2, events = $3, safety = $4, care = $5, invites = $6, updated_at = $7`,
    [userId, merged.messages, merged.events, merged.safety, merged.care, merged.invites, nowMs()]
  );

  return merged;
}

/**
 * Bir kullanıcının tüm aktif cihazlarına bildirim gönderir.
 *
 * Gönderim hataları çağıranı etkilemez: bildirim, asıl işlemin (mesaj
 * gönderme, etkinliğe katılma) yan etkisidir ve başarısız olması işlemi
 * geri almamalı. Güvenlik kategorisi kullanıcı tercihinden bağımsız gönderilir
 * — engelleme/şikâyet sonucu gibi bilgiler kullanıcıyı korur.
 */
export async function notifyUser(
  userId: string,
  category: NotificationCategory,
  message: PushMessage,
  db: Db = getDb(),
  /**
   * İşlemi tekrar tetikleyebilecek çağrı yerleri (ör. bir güncellemeyi
   * yeniden gönderen istemci) için isteğe bağlı tekilleştirme anahtarı.
   * Aynı (kullanıcı, kategori, anahtar) kısa bir pencerede yalnız bir kez
   * bildirim üretir; ikinci çağrı sessizce atlanır.
   */
  dedupeKey?: string
): Promise<{ sent: number; skipped: string | null }> {
  try {
    if (dedupeKey) {
      const ts = nowMs();
      // Eski kayıtları küçük tutmak için önce süresi geçenleri temizle.
      await db.exec('DELETE FROM push_dedupe WHERE created_at < $1', [ts - PUSH_DEDUPE_WINDOW_MS]);
      const inserted = await db.exec(
        `INSERT INTO push_dedupe (id, user_id, category, dedupe_key, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, category, dedupe_key) DO NOTHING`,
        [newId(), userId, category, dedupeKey, ts]
      );
      if (inserted.rowCount === 0) return { sent: 0, skipped: 'duplicate' };
    }

    if (category !== 'safety') {
      const prefs = await getPreferences(userId, db);
      if (!prefs[category]) return { sent: 0, skipped: 'preference_off' };
    }

    const rows = await db.query<TokenRow>(
      `SELECT id, token, platform FROM push_tokens WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    if (rows.length === 0) return { sent: 0, skipped: 'no_device' };

    const tickets = await getPushSender().send(
      rows.map((row) => row.token),
      message
    );

    await revokeTokens(
      tickets.filter((ticket) => ticket.shouldRevoke).map((ticket) => ticket.token),
      db
    );

    const withReceipt = tickets.filter((ticket) => ticket.ok && ticket.receiptId);
    if (withReceipt.length > 0) {
      const ts = nowMs();
      for (const ticket of withReceipt) {
        await db.exec(
          `INSERT INTO push_receipts (receipt_id, token, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (receipt_id) DO NOTHING`,
          [ticket.receiptId, ticket.token, ts]
        );
      }
    }

    return { sent: tickets.filter((ticket) => ticket.ok).length, skipped: null };
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error), userId, category },
      'bildirim gönderilemedi'
    );
    return { sent: 0, skipped: 'error' };
  }
}
