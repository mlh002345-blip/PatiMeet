import { getDb, nowMs, type Db } from '../db';
import { logger } from '../logger';
import { newId } from '../ids';

/**
 * Gizlilik odaklı ürün analitiği.
 *
 * KESİN KURAL: Olaylara kişisel veri yazılmaz. Mesaj içeriği, sağlık notu,
 * belge adı, tam konum, e-posta, kullanıcı adı ve serbest metin ASLA
 * gönderilmez. `props` yalnızca sayı, boolean ve kapalı küme değerleri
 * taşıyabilir; aşağıdaki temizleyici bunu zorunlu kılar.
 *
 * Harici bir sağlayıcıya gönderim bu fazda yok: olaylar yerel tabloda tutulur
 * ve `AnalyticsSink` arayüzü ileride bir sağlayıcı adaptörüyle değiştirilebilir.
 */

export const ANALYTICS_EVENTS = [
  'signup_completed',
  'dog_profile_completed',
  'discover_profile_opened',
  'message_started',
  'event_created',
  'event_joined',
  'walk_started',
  'walk_completed',
  'journal_entry_added',
  'invite_created',
  'invite_joined',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsProps = Record<string, number | boolean | null>;

/** Serbest metin ve uzun değerleri eleyen temizleyici. */
export function sanitizeProps(props: Record<string, unknown> | undefined): AnalyticsProps {
  const out: AnalyticsProps = {};
  if (!props) return out;

  for (const [key, value] of Object.entries(props)) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else if (value === null) out[key] = null;
    // Metin bilinçli olarak atılır — serbest metin kişisel veri taşıyabilir.
  }
  return out;
}

export interface AnalyticsSink {
  readonly driver: string;
  track(event: {
    name: AnalyticsEventName;
    userId: string | null;
    props: AnalyticsProps;
    at: number;
  }): Promise<void>;
}

/** Varsayılan: olayları kendi veritabanımızda tutar, dışarı veri göndermez. */
class LocalAnalyticsSink implements AnalyticsSink {
  readonly driver = 'local';

  constructor(private readonly db?: Db) {}

  async track(event: {
    name: AnalyticsEventName;
    userId: string | null;
    props: AnalyticsProps;
    at: number;
  }): Promise<void> {
    const db = this.db ?? getDb();
    await db.exec(
      'INSERT INTO analytics_events (id, user_id, name, props, created_at) VALUES ($1, $2, $3, $4, $5)',
      [newId(), event.userId, event.name, JSON.stringify(event.props), event.at]
    );
  }
}

let sink: AnalyticsSink | null = null;

export function getAnalyticsSink(): AnalyticsSink {
  if (!sink) sink = new LocalAnalyticsSink();
  return sink;
}

/** Testler ve ileride eklenecek sağlayıcı adaptörü için. */
export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
}

/**
 * Olayı kaydeder. Analitik asla ana işlemi başarısız yapmaz.
 */
export async function track(
  name: AnalyticsEventName,
  userId: string | null,
  props?: Record<string, unknown>
): Promise<void> {
  try {
    await getAnalyticsSink().track({
      name,
      userId,
      props: sanitizeProps(props),
      at: nowMs(),
    });
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error), event: name },
      'analitik olayı kaydedilemedi'
    );
  }
}
