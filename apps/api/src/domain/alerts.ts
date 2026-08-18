import { getDb, nowMs, type Db } from '../db';
import { badRequest, forbidden, notFound } from '../http';
import { newId } from '../ids';
import { resolveMediaUrl } from '../storage';
import { hiddenUserIds } from './blocks';
import { assertOwnedMediaKey } from './media';
import { notifyUser } from './push';
import { publicUser, type UserRow } from './serialize';

/**
 * Güvenli Topluluk bildirimleri.
 *
 * Kayıp hayvan ilanı bu yapının bir türü; diğer türler aynı alanları
 * paylaşır, yalnızca hangi alanların zorunlu olduğu değişir.
 *
 * KONUM KURALI: Kesin konum veya açık adres toplanmaz. Yalnızca semt ve
 * serbest metin bir "yaklaşık bölge" tarifi saklanır; koordinat ve adres
 * benzeri girdiler doğrulama katmanında reddedilir.
 */
export const ALERT_TYPES = [
  'kayip_hayvan',
  'bulunan_hayvan',
  'zehirli_yem',
  'yarali_hayvan',
  'salgin_hastalik',
  'acil_kan',
  'gecici_yuva',
  'destek',
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export interface AlertTypeInfo {
  value: AlertType;
  label: string;
  /** Listede ve bildirimde kullanılan kısa açıklama. */
  description: string;
  /** Hayvanın adı zorunlu mu? */
  requiresAnimalName: boolean;
  /** En az bir fotoğraf zorunlu mu? */
  requiresPhoto: boolean;
  /** Olay/son görülme zamanı zorunlu mu? */
  requiresOccurredAt: boolean;
}

export const ALERT_TYPE_INFO: AlertTypeInfo[] = [
  {
    value: 'kayip_hayvan',
    label: 'Kayıp hayvan',
    description: 'Kaybolan hayvanı tarif edin; komşularınız görürse haber verir.',
    requiresAnimalName: true,
    requiresPhoto: true,
    requiresOccurredAt: true,
  },
  {
    value: 'bulunan_hayvan',
    label: 'Bulunan hayvan',
    description: 'Bulduğunuz hayvanı bildirin; sahibi arıyor olabilir.',
    requiresAnimalName: false,
    requiresPhoto: true,
    requiresOccurredAt: true,
  },
  {
    value: 'zehirli_yem',
    label: 'Zehirli yem / tehlikeli bölge',
    description: 'Zehirli yem veya tehlikeli bir alan gördüyseniz çevrenizi uyarın.',
    requiresAnimalName: false,
    requiresPhoto: false,
    requiresOccurredAt: true,
  },
  {
    value: 'yarali_hayvan',
    label: 'Yaralı veya başıboş hayvan',
    description: 'Yardıma ihtiyacı olan bir hayvan gördüyseniz bildirin.',
    requiresAnimalName: false,
    requiresPhoto: false,
    requiresOccurredAt: true,
  },
  {
    value: 'salgin_hastalik',
    label: 'Salgın hastalık uyarısı',
    description: 'Bölgenizde yayılan bir hastalık varsa diğer sahipleri uyarın.',
    requiresAnimalName: false,
    requiresPhoto: false,
    requiresOccurredAt: false,
  },
  {
    value: 'acil_kan',
    label: 'Acil kan ihtiyacı',
    description: 'Kan bağışı gereken acil bir durum için çağrı yapın.',
    requiresAnimalName: true,
    requiresPhoto: false,
    requiresOccurredAt: false,
  },
  {
    value: 'gecici_yuva',
    label: 'Geçici yuva / sahiplendirme',
    description: 'Geçici bakım veya kalıcı yuva arayan bir hayvan için ilan açın.',
    requiresAnimalName: false,
    requiresPhoto: true,
    requiresOccurredAt: false,
  },
  {
    value: 'destek',
    label: 'Mama veya ulaşım desteği',
    description: 'Mama, veteriner ulaşımı gibi somut bir destek çağrısı yapın.',
    requiresAnimalName: false,
    requiresPhoto: false,
    requiresOccurredAt: false,
  },
];

const TYPE_INFO = new Map<string, AlertTypeInfo>(ALERT_TYPE_INFO.map((info) => [info.value, info]));

export function alertTypeInfo(type: AlertType): AlertTypeInfo {
  const info = TYPE_INFO.get(type);
  if (!info) throw badRequest('Geçersiz bildirim türü.', 'invalid_alert_type');
  return info;
}

export const MAX_ALERT_PHOTOS = 5;
/** Son görülme zamanı bu kadar geriye kadar kabul edilir. */
export const MAX_OCCURRED_AGE_MS = 90 * 24 * 60 * 60 * 1000;
/** Saat farkı ve cihaz saat sapması için küçük bir tolerans. */
const FUTURE_TOLERANCE_MS = 60 * 60 * 1000;

/**
 * Kesin konum sızmasını engelleyen desenler.
 *
 * Amaç mükemmel bir filtre değil — kullanıcının yanlışlıkla ev adresini
 * yazmasını zorlaştırmak ve ürünün "yaklaşık bölge" sözünü teknik olarak da
 * arkasında durur hâle getirmek.
 */
const LOCATION_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  {
    // 41.0082, 28.9784 gibi koordinat çiftleri
    re: /-?\d{1,3}[.,]\d{3,}\s*[,;]\s*-?\d{1,3}[.,]\d{3,}/,
    hint: 'koordinat',
  },
  {
    re: /\b(maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl|google\.com\/maps|yandex\.com\.tr\/harita)\b/i,
    hint: 'harita bağlantısı',
  },
  {
    // "No 12", "Daire 4", "Kat 3", "Blok B", "Apt 7", "Sokak No:5"
    re: /\b(no|nu|numara|daire|kat|blok|apt|apartman[ıi]|site|kap[ıi])\s*[:.]?\s*\d+/i,
    hint: 'kapı, daire veya blok bilgisi',
  },
];

/**
 * Yaklaşık bölge tarifini doğrular. Adres benzeri girdiyi reddeder.
 */
export function assertApproximateLocation(value: string, field: string): void {
  for (const pattern of LOCATION_PATTERNS) {
    if (pattern.re.test(value)) {
      throw badRequest(
        `${field} alanına kesin konum yazmayın (${pattern.hint} algılandı). Yalnızca "Yoğurtçu Parkı civarı" gibi yaklaşık bir tarif yazın.`,
        'exact_location_not_allowed'
      );
    }
  }
}

export interface AlertRow {
  id: string;
  author_id: string;
  type: string;
  animal_name: string | null;
  district: string;
  area_note: string;
  occurred_at: number | null;
  description: string;
  status: string;
  created_at: number;
  updated_at: number;
}

interface PhotoRow {
  storage_key: string;
  position: number;
}

export interface CreateAlertInput {
  type: AlertType;
  animalName?: string | null;
  district: string;
  areaNote?: string;
  occurredAt?: number | null;
  description: string;
  photoKeys?: string[];
}

/**
 * Girdi doğrulaması. Zod şeması alan biçimlerini kontrol eder; buradaki
 * kurallar türe göre değişen zorunlulukları ve konum güvenliğini uygular.
 */
export function validateAlertInput(input: CreateAlertInput, now = nowMs()): void {
  const info = alertTypeInfo(input.type);
  const photos = input.photoKeys ?? [];

  if (photos.length > MAX_ALERT_PHOTOS) {
    throw badRequest(`En fazla ${MAX_ALERT_PHOTOS} fotoğraf ekleyebilirsiniz.`, 'too_many_photos');
  }
  if (info.requiresPhoto && photos.length === 0) {
    throw badRequest(
      `${info.label} ilanı için en az 1 fotoğraf gerekiyor.`,
      'photo_required'
    );
  }
  if (new Set(photos).size !== photos.length) {
    throw badRequest('Aynı fotoğrafı birden fazla ekleyemezsiniz.', 'duplicate_photo');
  }

  if (info.requiresAnimalName && !input.animalName?.trim()) {
    throw badRequest('Hayvanın adını yazın.', 'animal_name_required');
  }

  if (info.requiresOccurredAt) {
    if (input.occurredAt === undefined || input.occurredAt === null) {
      throw badRequest('Son görülme tarihi ve saatini seçin.', 'occurred_at_required');
    }
    if (input.occurredAt > now + FUTURE_TOLERANCE_MS) {
      throw badRequest('Son görülme zamanı gelecekte olamaz.', 'occurred_at_future');
    }
    if (input.occurredAt < now - MAX_OCCURRED_AGE_MS) {
      throw badRequest('Son görülme zamanı en fazla 90 gün öncesi olabilir.', 'occurred_at_old');
    }
  }

  assertApproximateLocation(input.areaNote ?? '', 'Yaklaşık bölge');
  assertApproximateLocation(input.description, 'Açıklama');
}

/** Bildirimi ve fotoğraflarını tek işlemde oluşturur. */
export async function createAlert(
  authorId: string,
  input: CreateAlertInput,
  db: Db = getDb()
): Promise<AlertRow> {
  validateAlertInput(input);

  const photos = input.photoKeys ?? [];
  // Fotoğraflar yalnızca ilanı açan kullanıcının kendi yüklediği görseller olabilir.
  for (const key of photos) {
    await assertOwnedMediaKey(authorId, key, db);
  }

  const ts = nowMs();
  const id = newId();

  await db.tx(async (t) => {
    await t.exec(
      `INSERT INTO community_alerts
         (id, author_id, type, animal_name, district, area_note, occurred_at,
          description, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $9)`,
      [
        id,
        authorId,
        input.type,
        input.animalName?.trim() || null,
        input.district,
        input.areaNote?.trim() ?? '',
        input.occurredAt ?? null,
        input.description.trim(),
        ts,
      ]
    );

    for (const [index, key] of photos.entries()) {
      await t.exec(
        `INSERT INTO community_alert_photos (id, alert_id, storage_key, position, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [newId(), id, key, index, ts]
      );
    }
  });

  const row = await db.one<AlertRow>('SELECT * FROM community_alerts WHERE id = $1', [id]);
  return row!;
}

async function photosFor(alertIds: string[], db: Db): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (alertIds.length === 0) return map;

  const rows = await db.query<PhotoRow & { alert_id: string }>(
    `SELECT alert_id, storage_key, position FROM community_alert_photos
      WHERE alert_id = ANY($1) ORDER BY alert_id, position`,
    [alertIds]
  );

  for (const row of rows) {
    const list = map.get(row.alert_id) ?? [];
    list.push(row.storage_key);
    map.set(row.alert_id, list);
  }
  return map;
}

/** İstemciye dönen görünüm. Yazarın kimliği mesajlaşma için gerekli. */
export async function publicAlert(
  row: AlertRow,
  viewerId: string | null,
  photoKeys: string[],
  author: UserRow | null | undefined
) {
  const info = TYPE_INFO.get(row.type);
  return {
    id: row.id,
    type: row.type,
    typeLabel: info?.label ?? row.type,
    animalName: row.animal_name,
    district: row.district,
    areaNote: row.area_note,
    occurredAt: row.occurred_at,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photos: (await Promise.all(photoKeys.map(resolveMediaUrl))).filter(
      (url): url is string => url !== null
    ),
    isOwner: viewerId === row.author_id,
    author: author ? await publicUser(author) : null,
  };
}

export interface ListAlertsQuery {
  type?: AlertType;
  district?: string;
  scope?: 'all' | 'mine';
  status?: 'active' | 'resolved';
  limit: number;
  offset: number;
}

export async function listAlerts(viewerId: string, q: ListAlertsQuery, db: Db = getDb()) {
  const hidden = await hiddenUserIds(viewerId, db);

  const where: string[] = [`a.status = $1`];
  const params: unknown[] = [q.status ?? 'active'];

  const push = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (q.scope === 'mine') {
    where.push(`a.author_id = ${push(viewerId)}`);
  } else if (hidden.length > 0) {
    // Engellenen kullanıcıların ilanları listede görünmez.
    where.push(`a.author_id != ALL(${push(hidden)})`);
  }

  if (q.type) where.push(`a.type = ${push(q.type)}`);
  if (q.district) where.push(`a.district = ${push(q.district)}`);

  const limit = push(q.limit);
  const offset = push(q.offset);

  const rows = await db.query<AlertRow>(
    `SELECT a.* FROM community_alerts a
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const photos = await photosFor(
    rows.map((row) => row.id),
    db
  );

  const authors = new Map<string, UserRow>();
  if (rows.length > 0) {
    const authorRows = await db.query<UserRow>('SELECT * FROM users WHERE id = ANY($1)', [
      [...new Set(rows.map((row) => row.author_id))],
    ]);
    for (const author of authorRows) authors.set(author.id, author);
  }

  return Promise.all(
    rows.map((row) =>
      publicAlert(row, viewerId, photos.get(row.id) ?? [], authors.get(row.author_id) ?? null)
    )
  );
}

export async function getAlert(viewerId: string, alertId: string, db: Db = getDb()) {
  const row = await db.one<AlertRow>('SELECT * FROM community_alerts WHERE id = $1', [alertId]);
  if (!row || row.status === 'removed') throw notFound('Bildirim bulunamadı.');

  // Engelli ilişkide ilan gizlenir; varlığını doğrulamamak için 404.
  if (row.author_id !== viewerId) {
    const hidden = await hiddenUserIds(viewerId, db);
    if (hidden.includes(row.author_id)) throw notFound('Bildirim bulunamadı.');
  }

  const photos = await photosFor([row.id], db);
  const author = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [row.author_id]);
  return publicAlert(row, viewerId, photos.get(row.id) ?? [], author);
}

/** İlanı çözüldü olarak işaretler (kayıp hayvan bulundu gibi). */
export async function updateAlertStatus(
  userId: string,
  alertId: string,
  status: 'active' | 'resolved',
  db: Db = getDb()
) {
  const row = await db.one<AlertRow>('SELECT * FROM community_alerts WHERE id = $1', [alertId]);
  if (!row || row.status === 'removed') throw notFound('Bildirim bulunamadı.');
  if (row.author_id !== userId) throw forbidden('Bu bildirimi düzenleme yetkiniz yok.');

  await db.exec('UPDATE community_alerts SET status = $1, updated_at = $2 WHERE id = $3', [
    status,
    nowMs(),
    alertId,
  ]);

  return getAlert(userId, alertId, db);
}

/**
 * İlanı kaldırır. Fotoğraf kayıtları da silinir; depodaki dosyalar
 * media_objects üzerinden kullanıcının kendi galerisinde kalır ve hesap
 * silmede temizlenir.
 */
export async function removeAlert(userId: string, alertId: string, db: Db = getDb()) {
  const row = await db.one<AlertRow>('SELECT * FROM community_alerts WHERE id = $1', [alertId]);
  if (!row || row.status === 'removed') throw notFound('Bildirim bulunamadı.');
  if (row.author_id !== userId) throw forbidden('Bu bildirimi silme yetkiniz yok.');

  await db.tx(async (t) => {
    await t.exec('DELETE FROM community_alert_photos WHERE alert_id = $1', [alertId]);
    await t.exec(`UPDATE community_alerts SET status = 'removed', updated_at = $1 WHERE id = $2`, [
      nowMs(),
      alertId,
    ]);
  });
}

/**
 * Aynı semtteki kullanıcılara bildirim gönderir.
 *
 * Güvenlik kategorisinde olduğu için kullanıcı tercihleri bu bildirimi
 * kapatmaz (bkz. domain/push.ts). Gönderim hataları ilan oluşturmayı
 * engellemez.
 */
export async function notifyDistrictOfAlert(
  alert: AlertRow,
  db: Db = getDb()
): Promise<{ notified: number }> {
  const info = TYPE_INFO.get(alert.type);
  const hidden = await hiddenUserIds(alert.author_id, db);

  const rows = await db.query<{ id: string }>(
    `SELECT id FROM users
      WHERE status = 'active'
        AND district = $1
        AND id != $2
        AND id != ALL($3)`,
    [alert.district, alert.author_id, hidden]
  );

  const title = `${info?.label ?? 'Topluluk bildirimi'} · ${alert.district}`;
  const body = alert.animal_name
    ? `${alert.animal_name}: ${alert.description}`.slice(0, 140)
    : alert.description.slice(0, 140);

  let notified = 0;
  for (const row of rows) {
    const result = await notifyUser(row.id, 'safety', {
      title,
      body,
      data: { type: 'alert', alertId: alert.id },
    });
    if (result.sent > 0) notified += 1;
  }

  return { notified };
}
