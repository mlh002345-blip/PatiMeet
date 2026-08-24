import { getDb, nowMs, type Db } from '../db';
import { badRequest, conflict, forbidden, notFound } from '../http';
import { newId } from '../ids';
import { resolveMediaUrl } from '../storage';

/**
 * Canlı Yürüyüş — gerçek GPS takibi.
 *
 * MAHREMİYET KURALLARI
 * 1. Ham rota noktalarına YALNIZCA yürüyüşün sahibi erişebilir.
 * 2. Sosyal yüzeylerde yalnızca semt ve özet (süre/mesafe/tempo) görünür.
 * 3. Kullanıcı isterse özetin başlangıç ve bitiş bölümü gizlenir; bu ev
 *    konumunun rotanın uçlarından çıkarılmasını engeller.
 * 4. Canlı konum yalnızca kullanıcının açık eylemiyle, seçtiği kişiyle ve
 *    belirlediği süre boyunca paylaşılır; süre dolunca kendiliğinden kapanır.
 */

export type WalkStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface WalkRow {
  id: string;
  user_id: string;
  dog_id: string | null;
  status: string;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number;
  distance_meters: number;
  pace_seconds_per_km: number | null;
  hide_endpoints: boolean;
  district: string | null;
  note: string;
  photo_key: string | null;
  created_at: number;
  updated_at: number;
}

export interface WalkPointRow {
  id: string;
  walk_id: string;
  seq: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  recorded_at: number;
}

export interface WalkPointInput {
  lat: number;
  lng: number;
  accuracy?: number | null;
  recordedAt: number;
}

/** Kabul edilen en düşük GPS doğruluğu (metre). Üstü gürültü sayılır. */
export const MAX_ACCURACY_METERS = 50;
/** İki nokta arası mantıklı en yüksek hız (m/s). ~54 km/sa üstü sıçramadır. */
const MAX_SPEED_MPS = 15;
/** Bu mesafenin altındaki hareket GPS titremesi kabul edilir (metre). */
const MIN_STEP_METERS = 3;
/** Uçları gizlerken rotanın her iki ucundan kırpılan oran. */
const ENDPOINT_TRIM_RATIO = 0.12;

/** İki koordinat arası mesafe (metre) — haversine. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface FilterResult {
  accepted: WalkPointInput[];
  /** Kaç nokta hangi nedenle atıldı — istemciye geri bildirilir. */
  rejected: { accuracy: number; jump: number; jitter: number };
  addedMeters: number;
}

/**
 * Ham GPS noktalarını süzer.
 *
 * Üç tür gürültü atılır: doğruluğu düşük noktalar, fiziksel olarak imkânsız
 * sıçramalar ve duruşta oluşan mikro titremeler. Böylece kullanıcı yerinde
 * dururken mesafe artmaz.
 */
export function filterPoints(
  previous: { lat: number; lng: number; recordedAt: number } | null,
  points: WalkPointInput[]
): FilterResult {
  const accepted: WalkPointInput[] = [];
  const rejected = { accuracy: 0, jump: 0, jitter: 0 };
  let addedMeters = 0;
  let last = previous;

  for (const point of [...points].sort((a, b) => a.recordedAt - b.recordedAt)) {
    if (point.accuracy !== null && point.accuracy !== undefined && point.accuracy > MAX_ACCURACY_METERS) {
      rejected.accuracy += 1;
      continue;
    }

    if (!last) {
      accepted.push(point);
      last = { lat: point.lat, lng: point.lng, recordedAt: point.recordedAt };
      continue;
    }

    const meters = distanceMeters(last, point);
    const seconds = Math.max(1, (point.recordedAt - last.recordedAt) / 1000);

    if (meters / seconds > MAX_SPEED_MPS) {
      rejected.jump += 1;
      continue;
    }
    if (meters < MIN_STEP_METERS) {
      rejected.jitter += 1;
      continue;
    }

    accepted.push(point);
    addedMeters += meters;
    last = { lat: point.lat, lng: point.lng, recordedAt: point.recordedAt };
  }

  return { accepted, rejected, addedMeters };
}

/** Saniye/km cinsinden tempo. Mesafe çok kısaysa anlamlı değildir. */
export function paceSecondsPerKm(distance: number, seconds: number): number | null {
  if (distance < 100 || seconds <= 0) return null;
  return Math.round(seconds / (distance / 1000));
}

/**
 * Yaklaşık kalori. Kaba bir TAHMİNDİR; sağlık ölçümü değildir ve arayüzde
 * bu şekilde etiketlenir. Orta boy bir köpek + sahibi yürüyüşü için
 * mesafe başına sabit bir katsayı kullanılır.
 */
export function estimateCalories(distanceMeters: number): number {
  return Math.round((distanceMeters / 1000) * 55);
}

export async function activeWalk(userId: string, db: Db = getDb()): Promise<WalkRow | null> {
  const row = await db.one<WalkRow>(
    `SELECT * FROM walks WHERE user_id = $1 AND status IN ('active', 'paused')`,
    [userId]
  );
  return row ?? null;
}

export async function startWalk(
  userId: string,
  input: { dogId?: string | null; district?: string | null; hideEndpoints?: boolean },
  db: Db = getDb()
): Promise<WalkRow> {
  const existing = await activeWalk(userId, db);
  if (existing) {
    throw conflict('Zaten süren bir yürüyüşünüz var.', 'walk_already_active');
  }

  if (input.dogId) {
    const dog = await db.one<{ id: string }>(
      `SELECT id FROM dogs WHERE id = $1 AND owner_id = $2 AND status = 'active'`,
      [input.dogId, userId]
    );
    if (!dog) throw badRequest('Köpek profili bulunamadı.', 'dog_not_found');
  }

  const ts = nowMs();
  const id = newId();
  await db.exec(
    `INSERT INTO walks
       (id, user_id, dog_id, status, started_at, hide_endpoints, district, created_at, updated_at)
     VALUES ($1, $2, $3, 'active', $4, $5, $6, $4, $4)`,
    [id, userId, input.dogId ?? null, ts, input.hideEndpoints ?? true, input.district ?? null]
  );

  const row = await db.one<WalkRow>('SELECT * FROM walks WHERE id = $1', [id]);
  return row!;
}

async function ownedWalk(userId: string, walkId: string, db: Db): Promise<WalkRow> {
  const row = await db.one<WalkRow>('SELECT * FROM walks WHERE id = $1', [walkId]);
  if (!row) throw notFound('Yürüyüş bulunamadı.');
  // Ham rota ve yürüyüş kontrolü yalnızca sahibinde.
  if (row.user_id !== userId) throw forbidden('Bu yürüyüşe erişim yetkiniz yok.');
  return row;
}

/**
 * Yeni GPS noktalarını ekler ve mesafeyi güncellenmiş toplamla yazar.
 *
 * `durationSeconds` istemcinin ölçtüğü, duraklatmalar düşülmüş hareket
 * süresidir; sunucu bunu yürüyüşün toplam süresiyle sınırlar ki geriye
 * dönük şişirilemesin.
 */
export async function appendPoints(
  userId: string,
  walkId: string,
  points: WalkPointInput[],
  durationSeconds: number,
  db: Db = getDb()
): Promise<{
  walk: WalkRow;
  rejected: FilterResult['rejected'];
  accepted: number;
  duplicate: number;
}> {
  const walk = await ownedWalk(userId, walkId, db);
  if (walk.status !== 'active') {
    throw badRequest('Yalnızca süren bir yürüyüşe nokta eklenebilir.', 'walk_not_active');
  }

  const last = await db.one<WalkPointRow>(
    'SELECT * FROM walk_points WHERE walk_id = $1 ORDER BY seq DESC LIMIT 1',
    [walkId]
  );

  /**
   * Bağlantı kesilip yeniden gönderim (retry) idempotency'si.
   *
   * İstemci bir toplu gönderimin onayını (ack) alamazsa aynı noktaları
   * tekrar gönderebilir. Cihaz saatindeki `recordedAt` her fiziksel nokta
   * için doğal ve kalıcı bir anahtardır; bu yürüyüşte zaten kayıtlı olan
   * zaman damgaları, mesafeyi ikinci kez artırmadan elenir. `walk_points`
   * üzerindeki `UNIQUE(walk_id, recorded_at)` bunu veri tabanı seviyesinde
   * de garanti eder (bkz. migration 0011).
   */
  const recordedTimes = points.map((p) => p.recordedAt);
  const already =
    recordedTimes.length === 0
      ? []
      : await db.query<{ recorded_at: number }>(
          'SELECT recorded_at FROM walk_points WHERE walk_id = $1 AND recorded_at = ANY($2)',
          [walkId, recordedTimes]
        );
  const alreadySet = new Set(already.map((row) => Number(row.recorded_at)));
  const newPoints = points.filter((point) => !alreadySet.has(point.recordedAt));
  const duplicateCount = points.length - newPoints.length;

  const filtered = filterPoints(
    last ? { lat: last.lat, lng: last.lng, recordedAt: last.recorded_at } : null,
    newPoints
  );

  const ts = nowMs();
  const elapsedCap = Math.max(0, Math.floor((ts - walk.started_at) / 1000));
  const duration = Math.min(Math.max(0, Math.round(durationSeconds)), elapsedCap);
  const distance = walk.distance_meters + Math.round(filtered.addedMeters);

  await db.tx(async (t) => {
    let seq = (last?.seq ?? -1) + 1;
    for (const point of filtered.accepted) {
      const inserted = await t.exec(
        `INSERT INTO walk_points (id, walk_id, seq, lat, lng, accuracy, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (walk_id, recorded_at) DO NOTHING`,
        [newId(), walkId, seq, point.lat, point.lng, point.accuracy ?? null, point.recordedAt]
      );
      if (inserted.rowCount > 0) seq += 1;
    }

    await t.exec(
      `UPDATE walks
          SET distance_meters = $1, duration_seconds = $2,
              pace_seconds_per_km = $3, updated_at = $4
        WHERE id = $5`,
      [distance, duration, paceSecondsPerKm(distance, duration), ts, walkId]
    );
  });

  const row = await db.one<WalkRow>('SELECT * FROM walks WHERE id = $1', [walkId]);
  return {
    walk: row!,
    rejected: filtered.rejected,
    accepted: filtered.accepted.length,
    duplicate: duplicateCount,
  };
}

export async function setWalkStatus(
  userId: string,
  walkId: string,
  status: Extract<WalkStatus, 'active' | 'paused'>,
  db: Db = getDb()
): Promise<WalkRow> {
  const walk = await ownedWalk(userId, walkId, db);
  if (walk.status === 'completed' || walk.status === 'cancelled') {
    throw badRequest('Bu yürüyüş sonlanmış.', 'walk_finished');
  }

  await db.exec('UPDATE walks SET status = $1, updated_at = $2 WHERE id = $3', [
    status,
    nowMs(),
    walkId,
  ]);
  const row = await db.one<WalkRow>('SELECT * FROM walks WHERE id = $1', [walkId]);
  return row!;
}

export async function finishWalk(
  userId: string,
  walkId: string,
  input: { durationSeconds?: number; note?: string; photoKey?: string | null; cancel?: boolean },
  db: Db = getDb()
): Promise<WalkRow> {
  const walk = await ownedWalk(userId, walkId, db);
  if (walk.status === 'completed' || walk.status === 'cancelled') {
    throw badRequest('Bu yürüyüş zaten sonlanmış.', 'walk_finished');
  }

  const ts = nowMs();
  const elapsedCap = Math.max(0, Math.floor((ts - walk.started_at) / 1000));
  const duration = Math.min(
    Math.max(0, Math.round(input.durationSeconds ?? walk.duration_seconds)),
    elapsedCap
  );

  await db.exec(
    `UPDATE walks
        SET status = $1, ended_at = $2, duration_seconds = $3,
            pace_seconds_per_km = $4, note = $5, photo_key = $6, updated_at = $2
      WHERE id = $7`,
    [
      input.cancel ? 'cancelled' : 'completed',
      ts,
      duration,
      paceSecondsPerKm(walk.distance_meters, duration),
      input.note?.trim() ?? walk.note,
      input.photoKey ?? walk.photo_key,
      walkId,
    ]
  );

  // Paylaşım yürüyüş bitince kapanır.
  await db.exec('UPDATE walk_shares SET revoked_at = $1 WHERE walk_id = $2 AND revoked_at IS NULL', [
    ts,
    walkId,
  ]);

  const row = await db.one<WalkRow>('SELECT * FROM walks WHERE id = $1', [walkId]);
  return row!;
}

/**
 * Rota özeti.
 *
 * `hide_endpoints` açıkken rotanın her iki ucundan bir dilim atılır; kalan
 * orta bölüm gösterilir. Böylece ev ve varış noktası rotadan okunamaz.
 */
export function trimRoute<T>(points: T[], hideEndpoints: boolean): T[] {
  if (!hideEndpoints || points.length < 8) return hideEndpoints ? [] : points;
  const cut = Math.max(1, Math.floor(points.length * ENDPOINT_TRIM_RATIO));
  return points.slice(cut, points.length - cut);
}

export async function walkRoute(
  userId: string,
  walkId: string,
  db: Db = getDb()
): Promise<WalkPointRow[]> {
  await ownedWalk(userId, walkId, db);
  return db.query<WalkPointRow>(
    'SELECT * FROM walk_points WHERE walk_id = $1 ORDER BY seq',
    [walkId]
  );
}

export async function publicWalk(row: WalkRow, options: { includeRoute?: WalkPointRow[] } = {}) {
  const route = options.includeRoute
    ? trimRoute(options.includeRoute, row.hide_endpoints).map((p) => ({
        lat: p.lat,
        lng: p.lng,
        recordedAt: p.recorded_at,
      }))
    : undefined;

  return {
    id: row.id,
    dogId: row.dog_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    distanceMeters: row.distance_meters,
    paceSecondsPerKm: row.pace_seconds_per_km,
    /** TAHMİNDİR — sağlık ölçümü değildir. */
    estimatedCalories: estimateCalories(row.distance_meters),
    hideEndpoints: row.hide_endpoints === true,
    district: row.district,
    note: row.note,
    photoUrl: await resolveMediaUrl(row.photo_key),
    createdAt: row.created_at,
    ...(route ? { route } : {}),
  };
}

// ---------------------------------------------------------------------------
// Süreli canlı konum paylaşımı
// ---------------------------------------------------------------------------

export const MAX_SHARE_MINUTES = 240;

export async function shareWalk(
  userId: string,
  walkId: string,
  targetUserId: string,
  minutes: number,
  db: Db = getDb()
) {
  const walk = await ownedWalk(userId, walkId, db);
  if (walk.status === 'completed' || walk.status === 'cancelled') {
    throw badRequest('Sonlanmış yürüyüş paylaşılamaz.', 'walk_finished');
  }
  if (targetUserId === userId) {
    throw badRequest('Kendinizle paylaşamazsınız.', 'self_share');
  }
  if (minutes < 1 || minutes > MAX_SHARE_MINUTES) {
    throw badRequest(`Paylaşım süresi 1–${MAX_SHARE_MINUTES} dakika olabilir.`, 'invalid_duration');
  }

  const target = await db.one<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND status = 'active'`,
    [targetUserId]
  );
  if (!target) throw notFound('Kullanıcı bulunamadı.');

  const ts = nowMs();
  const expiresAt = ts + minutes * 60_000;
  await db.exec(
    `INSERT INTO walk_shares (id, walk_id, shared_with_id, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (walk_id, shared_with_id)
       DO UPDATE SET expires_at = $4, revoked_at = NULL`,
    [newId(), walkId, targetUserId, expiresAt, ts]
  );

  return { expiresAt };
}

export async function stopSharing(userId: string, walkId: string, db: Db = getDb()) {
  await ownedWalk(userId, walkId, db);
  await db.exec('UPDATE walk_shares SET revoked_at = $1 WHERE walk_id = $2 AND revoked_at IS NULL', [
    nowMs(),
    walkId,
  ]);
}

export async function activeShares(userId: string, walkId: string, db: Db = getDb()) {
  await ownedWalk(userId, walkId, db);
  return db.query<{ shared_with_id: string; expires_at: number; name: string }>(
    `SELECT s.shared_with_id, s.expires_at, u.name
       FROM walk_shares s JOIN users u ON u.id = s.shared_with_id
      WHERE s.walk_id = $1 AND s.revoked_at IS NULL AND s.expires_at > $2`,
    [walkId, nowMs()]
  );
}

/**
 * Paylaşılan canlı konum. Yalnızca süresi dolmamış, iptal edilmemiş bir
 * paylaşımın hedefi görebilir ve yalnızca SON konumu alır — geçmiş rotanın
 * tamamı hiçbir zaman paylaşılmaz.
 */
export async function sharedWalkView(viewerId: string, walkId: string, db: Db = getDb()) {
  const share = await db.one<{ expires_at: number }>(
    `SELECT expires_at FROM walk_shares
      WHERE walk_id = $1 AND shared_with_id = $2 AND revoked_at IS NULL AND expires_at > $3`,
    [walkId, viewerId, nowMs()]
  );
  if (!share) throw notFound('Paylaşım bulunamadı veya süresi doldu.');

  const walk = await db.one<WalkRow>('SELECT * FROM walks WHERE id = $1', [walkId]);
  if (!walk || (walk.status !== 'active' && walk.status !== 'paused')) {
    throw notFound('Paylaşım bulunamadı veya süresi doldu.');
  }

  const last = await db.one<WalkPointRow>(
    'SELECT * FROM walk_points WHERE walk_id = $1 ORDER BY seq DESC LIMIT 1',
    [walkId]
  );

  return {
    walkId: walk.id,
    status: walk.status,
    expiresAt: share.expires_at,
    durationSeconds: walk.duration_seconds,
    distanceMeters: walk.distance_meters,
    lastPoint: last ? { lat: last.lat, lng: last.lng, recordedAt: last.recorded_at } : null,
  };
}

/** Haftalık toplam — hedef ilerlemesi gerçek veriden hesaplanır. */
export async function weeklySummary(userId: string, db: Db = getDb()) {
  const since = nowMs() - 7 * 24 * 60 * 60 * 1000;
  const row = await db.one<{ seconds: number; meters: number; walks: number }>(
    `SELECT COALESCE(SUM(duration_seconds), 0)::int AS seconds,
            COALESCE(SUM(distance_meters), 0)::int  AS meters,
            COUNT(*)::int                            AS walks
       FROM walks
      WHERE user_id = $1 AND status = 'completed' AND started_at >= $2`,
    [userId, since]
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRow = await db.one<{ seconds: number }>(
    `SELECT COALESCE(SUM(duration_seconds), 0)::int AS seconds
       FROM walks
      WHERE user_id = $1 AND status = 'completed' AND started_at >= $2`,
    [userId, today.getTime()]
  );

  return {
    weeklySeconds: row?.seconds ?? 0,
    weeklyMeters: row?.meters ?? 0,
    weeklyWalks: row?.walks ?? 0,
    todaySeconds: todayRow?.seconds ?? 0,
  };
}
