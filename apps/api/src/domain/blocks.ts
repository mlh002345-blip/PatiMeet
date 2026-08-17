import { getDb, type CountRow, type Db } from '../db';

/**
 * Engelleme MVP'de simetrik davranır: A, B'yi engellediğinde iki taraf da
 * birbirini göremez ve mesaj gönderemez. Bu yüzden sorgular her iki yönü
 * birlikte kontrol eder.
 */
export async function isBlockedBetween(
  userA: string,
  userB: string,
  db: Db = getDb()
): Promise<boolean> {
  const row = await db.one<CountRow>(
    `SELECT COUNT(*)::int AS c FROM blocks
      WHERE (blocker_id = $1 AND blocked_id = $2)
         OR (blocker_id = $2 AND blocked_id = $1)`,
    [userA, userB]
  );
  return (row?.c ?? 0) > 0;
}

/** Verilen kullanıcının göremeyeceği kullanıcı kimlikleri (her iki yön). */
export async function hiddenUserIds(userId: string, db: Db = getDb()): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `SELECT blocked_id AS id FROM blocks WHERE blocker_id = $1
     UNION
     SELECT blocker_id AS id FROM blocks WHERE blocked_id = $1`,
    [userId]
  );
  return rows.map((row) => row.id);
}
