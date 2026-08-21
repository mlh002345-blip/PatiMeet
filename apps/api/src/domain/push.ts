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
      data?: Array<{ status: string; message?: string; details?: { error?: string } }>;
    } | null;

    const results = parsed?.data ?? [];

    return tokens.map((token, index) => {
      const entry = results[index];
      if (!entry) return { token, ok: false, shouldRevoke: false, error: 'no_receipt' };

      if (entry.status === 'ok') return { token, ok: true, shouldRevoke: false };

      // Cihaz uygulamayı kaldırmış veya token geçersiz → kalıcı olarak iptal et.
      const code = entry.details?.error;
      const shouldRevoke = code === 'DeviceNotRegistered' || code === 'InvalidCredentials';

      return { token, ok: false, shouldRevoke, error: code ?? entry.message ?? 'unknown' };
    });
  }
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
  db: Db = getDb()
): Promise<{ sent: number; skipped: string | null }> {
  try {
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

    return { sent: tickets.filter((ticket) => ticket.ok).length, skipped: null };
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error), userId, category },
      'bildirim gönderilemedi'
    );
    return { sent: 0, skipped: 'error' };
  }
}
