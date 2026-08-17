import { db } from '../db';

/**
 * Engelleme MVP'de simetrik davranır: A, B'yi engellediğinde iki taraf da
 * birbirini göremez ve mesaj gönderemez. Bu yüzden sorgular her iki yönü
 * birlikte kontrol eder.
 */
export function isBlockedBetween(userA: string, userB: string): boolean {
  const row = db
    .prepare<[string, string, string, string], { c: number }>(
      `SELECT COUNT(*) AS c FROM blocks
       WHERE (blocker_id = ? AND blocked_id = ?)
          OR (blocker_id = ? AND blocked_id = ?)`
    )
    .get(userA, userB, userB, userA);
  return (row?.c ?? 0) > 0;
}

/** Verilen kullanıcının göremeyeceği kullanıcı kimlikleri (her iki yön). */
export function hiddenUserIds(userId: string): string[] {
  const rows = db
    .prepare<[string, string], { id: string }>(
      `SELECT blocked_id AS id FROM blocks WHERE blocker_id = ?
       UNION
       SELECT blocker_id AS id FROM blocks WHERE blocked_id = ?`
    )
    .all(userId, userId);
  return rows.map((r) => r.id);
}

/**
 * SQL içinde kullanılmak üzere `(?, ?, ...)` yer tutucusu ve parametre listesi
 * üretir. Liste boşsa hiçbir satırı dışlamayan güvenli bir ifade döner.
 */
export function buildExclusion(ids: string[]): { clause: string; params: string[] } {
  if (ids.length === 0) return { clause: '1=1', params: [] };
  const placeholders = ids.map(() => '?').join(', ');
  return { clause: `NOT IN (${placeholders})`, params: ids };
}
