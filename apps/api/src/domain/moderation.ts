import bcrypt from 'bcryptjs';
import { getDb, nowMs, type CountRow, type Db } from '../db';
import { notFound } from '../http';
import { newId } from '../ids';
import { logger } from '../logger';
import { deleteAllUserMedia } from './media';
import { notifyUser } from './push';

export interface AdminUserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  status: string;
  created_at: number;
  last_login_at: number | null;
}

/** Denetim kaydı: her moderasyon işlemi kim tarafından yapıldı. */
export async function recordAudit(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  note = '',
  db: Db = getDb()
): Promise<void> {
  await db.exec(
    `INSERT INTO admin_audit_log (id, admin_id, action, target_type, target_id, note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [newId(), adminId, action, targetType, targetId, note, nowMs()]
  );
}

export async function createAdminUser(
  email: string,
  password: string,
  name: string,
  db: Db = getDb()
): Promise<AdminUserRow> {
  const normalized = email.trim().toLowerCase();
  const id = newId();

  await db.exec(
    `INSERT INTO admin_users (id, email, password_hash, name, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET password_hash = $3, name = $4`,
    [id, normalized, bcrypt.hashSync(password, 10), name, nowMs()]
  );

  const row = await db.one<AdminUserRow>('SELECT * FROM admin_users WHERE email = $1', [normalized]);
  return row!;
}

export async function verifyAdminCredentials(
  email: string,
  password: string,
  db: Db = getDb()
): Promise<AdminUserRow | null> {
  const row = await db.one<AdminUserRow>('SELECT * FROM admin_users WHERE email = $1', [
    email.trim().toLowerCase(),
  ]);

  if (!row || row.status !== 'active') return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;

  await db.exec('UPDATE admin_users SET last_login_at = $1 WHERE id = $2', [nowMs(), row.id]);
  return row;
}

/**
 * Yapılandırmada bootstrap bilgileri varsa ilk yönetici hesabını oluşturur.
 * Panel açıldıktan sonra bu değişkenler kaldırılabilir.
 */
export async function ensureBootstrapAdmin(
  email: string | null,
  password: string | null,
  db: Db = getDb()
): Promise<void> {
  if (!email || !password) return;

  const existing = await db.one<CountRow>('SELECT COUNT(*)::int AS c FROM admin_users');
  if ((existing?.c ?? 0) > 0) return;

  await createAdminUser(email, password, 'Kurucu yönetici', db);
  logger.info({ email }, 'ilk yönetici hesabı oluşturuldu');
}

// ---------------------------------------------------------------------------
// Moderasyon işlemleri
// ---------------------------------------------------------------------------

export type UserStatus = 'active' | 'suspended' | 'deleted';

/**
 * Kullanıcı durumunu değiştirir.
 *
 * Pasife alma kullanıcıyı tüm listelerden düşürür ve oturumunu geçersiz kılar
 * (requireAuth aktif olmayan hesabı reddeder). `deleted` durumunda kişisel
 * içerik ve yüklenen görseller de temizlenir.
 */
export async function setUserStatus(
  adminId: string,
  userId: string,
  status: UserStatus,
  note: string,
  db: Db = getDb()
): Promise<void> {
  const user = await db.one<{ id: string }>('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user) throw notFound('Kullanıcı bulunamadı.');

  const ts = nowMs();

  if (status === 'deleted') {
    await deleteAllUserMedia(userId, db);
  }

  await db.tx(async (t) => {
    await t.exec('UPDATE users SET status = $1, updated_at = $2 WHERE id = $3', [
      status,
      ts,
      userId,
    ]);

    if (status !== 'active') {
      // Pasif hesabın içeriği diğer kullanıcılara gösterilmez.
      await t.exec(
        `UPDATE events SET status = 'cancelled', updated_at = $1 WHERE owner_id = $2 AND status = 'active'`,
        [ts, userId]
      );
      await t.exec('DELETE FROM push_tokens WHERE user_id = $1', [userId]);
    }
  });

  await recordAudit(adminId, `user_${status}`, 'user', userId, note, db);
}

export async function setEventStatus(
  adminId: string,
  eventId: string,
  status: 'active' | 'cancelled' | 'removed',
  note: string,
  db: Db = getDb()
): Promise<void> {
  const result = await db.exec('UPDATE events SET status = $1, updated_at = $2 WHERE id = $3', [
    status,
    nowMs(),
    eventId,
  ]);
  if (result.rowCount === 0) throw notFound('Etkinlik bulunamadı.');

  if (status === 'removed' || status === 'cancelled') {
    const participants = await db.query<{ user_id: string }>(
      'SELECT user_id FROM event_participants WHERE event_id = $1',
      [eventId]
    );
    for (const participant of participants) {
      await notifyUser(participant.user_id, 'safety', {
        title: 'Etkinlik kaldırıldı',
        body: 'Katıldığınız bir etkinlik topluluk kuralları gereği kaldırıldı.',
        data: { type: 'safety' },
      });
    }
  }

  await recordAudit(adminId, `event_${status}`, 'event', eventId, note, db);
}

export async function setDogStatus(
  adminId: string,
  dogId: string,
  status: 'active' | 'hidden' | 'deleted',
  note: string,
  db: Db = getDb()
): Promise<void> {
  const result = await db.exec('UPDATE dogs SET status = $1, updated_at = $2 WHERE id = $3', [
    status,
    nowMs(),
    dogId,
  ]);
  if (result.rowCount === 0) throw notFound('Köpek profili bulunamadı.');
  await recordAudit(adminId, `dog_${status}`, 'dog', dogId, note, db);
}

/**
 * Güvenli Topluluk bildirimini moderasyondan kaldırır veya geri alır.
 *
 * Kaldırılan bildirim listede ve detayda 404 döner; fotoğraf kayıtları
 * silinir. İlan sahibi neden bilgisiyle uyarılır.
 */
export async function setAlertStatus(
  adminId: string,
  alertId: string,
  status: 'active' | 'removed',
  note: string,
  db: Db = getDb()
): Promise<void> {
  const row = await db.one<{ author_id: string }>(
    'SELECT author_id FROM community_alerts WHERE id = $1',
    [alertId]
  );
  if (!row) throw notFound('Bildirim bulunamadı.');

  await db.tx(async (t) => {
    await t.exec('UPDATE community_alerts SET status = $1, updated_at = $2 WHERE id = $3', [
      status,
      nowMs(),
      alertId,
    ]);
    if (status === 'removed') {
      await t.exec('DELETE FROM community_alert_photos WHERE alert_id = $1', [alertId]);
    }
  });

  if (status === 'removed') {
    await notifyUser(row.author_id, 'safety', {
      title: 'Bildiriminiz kaldırıldı',
      body: 'Paylaştığınız bir Güvenli Topluluk bildirimi topluluk kuralları gereği kaldırıldı.',
      data: { type: 'safety' },
    });
  }

  await recordAudit(adminId, `alert_${status}`, 'alert', alertId, note, db);
}

export async function setReportStatus(
  adminId: string,
  reportId: string,
  status: 'open' | 'reviewing' | 'resolved',
  note: string,
  db: Db = getDb()
): Promise<void> {
  const report = await db.one<{ reporter_id: string }>(
    'SELECT reporter_id FROM reports WHERE id = $1',
    [reportId]
  );
  if (!report) throw notFound('Şikâyet bulunamadı.');

  await db.exec('UPDATE reports SET status = $1 WHERE id = $2', [status, reportId]);

  // Şikâyet edeni sonuçtan haberdar et — güvenlik hissi için önemli.
  if (status === 'resolved') {
    await notifyUser(report.reporter_id, 'safety', {
      title: 'Şikâyetiniz incelendi',
      body: 'Bildiriminiz için teşekkürler. Gerekli işlem yapıldı.',
      data: { type: 'safety' },
    });
  }

  await recordAudit(adminId, `report_${status}`, 'report', reportId, note, db);
}

// ---------------------------------------------------------------------------
// Panel için listeler
// ---------------------------------------------------------------------------

export interface ReportListItem {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string;
  status: string;
  created_at: number;
  reporter_name: string;
  reporter_id: string;
  /** Şikâyet edilen kullanıcının, etkinliğin veya bildirimin adı. */
  target_label: string | null;
  target_status: string | null;
}

export async function listReports(
  status: string | null,
  limit = 100,
  db: Db = getDb()
): Promise<ReportListItem[]> {
  return db.query<ReportListItem>(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at,
            r.reporter_id,
            reporter.name AS reporter_name,
            COALESCE(tu.name, te.title, ta.animal_name, ta.type) AS target_label,
            COALESCE(tu.status, te.status, ta.status) AS target_status
       FROM reports r
       JOIN users reporter ON reporter.id = r.reporter_id
  LEFT JOIN users  tu ON r.target_type = 'user'  AND tu.id = r.target_id
  LEFT JOIN events te ON r.target_type = 'event' AND te.id = r.target_id
  LEFT JOIN community_alerts ta ON r.target_type = 'alert' AND ta.id = r.target_id
      WHERE ($1::text IS NULL OR r.status = $1)
      ORDER BY
        -- Açık şikâyetler önce, sonra en yeni.
        CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
        r.created_at DESC
      LIMIT $2`,
    [status, limit]
  );
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string;
  district: string | null;
  status: string;
  created_at: number;
  dog_count: number;
  report_count: number;
}

export async function listUsers(
  search: string | null,
  status: string | null,
  limit = 100,
  db: Db = getDb()
): Promise<AdminUserListItem[]> {
  return db.query<AdminUserListItem>(
    `SELECT u.id, u.email, u.name, u.district, u.status, u.created_at,
            (SELECT COUNT(*) FROM dogs d WHERE d.owner_id = u.id AND d.status = 'active')::int AS dog_count,
            (SELECT COUNT(*) FROM reports r WHERE r.target_type = 'user' AND r.target_id = u.id)::int AS report_count
       FROM users u
      WHERE ($1::text IS NULL OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR u.status = $2)
      ORDER BY report_count DESC, u.created_at DESC
      LIMIT $3`,
    [search, status, limit]
  );
}

export interface AdminEventListItem {
  id: string;
  title: string;
  type: string;
  starts_at: number;
  district: string;
  status: string;
  owner_name: string;
  owner_id: string;
  participant_count: number;
  report_count: number;
}

export async function listEvents(
  search: string | null,
  status: string | null,
  limit = 100,
  db: Db = getDb()
): Promise<AdminEventListItem[]> {
  return db.query<AdminEventListItem>(
    `SELECT e.id, e.title, e.type, e.starts_at, e.district, e.status,
            e.owner_id, o.name AS owner_name,
            (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id)::int AS participant_count,
            (SELECT COUNT(*) FROM reports r WHERE r.target_type = 'event' AND r.target_id = e.id)::int AS report_count
       FROM events e
       JOIN users o ON o.id = e.owner_id
      WHERE ($1::text IS NULL OR e.title ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR e.status = $2)
      ORDER BY report_count DESC, e.starts_at DESC
      LIMIT $3`,
    [search, status, limit]
  );
}

export async function stats(db: Db = getDb()) {
  const one = async (sql: string): Promise<number> => {
    const row = await db.one<CountRow>(sql);
    return row?.c ?? 0;
  };

  const [users, suspended, dogs, events, messages, openReports, devices] = await Promise.all([
    one(`SELECT COUNT(*)::int AS c FROM users WHERE status = 'active'`),
    one(`SELECT COUNT(*)::int AS c FROM users WHERE status = 'suspended'`),
    one(`SELECT COUNT(*)::int AS c FROM dogs WHERE status = 'active'`),
    one(`SELECT COUNT(*)::int AS c FROM events WHERE status = 'active'`),
    one('SELECT COUNT(*)::int AS c FROM messages'),
    one(`SELECT COUNT(*)::int AS c FROM reports WHERE status = 'open'`),
    one(`SELECT COUNT(*)::int AS c FROM push_tokens WHERE status = 'active'`),
  ]);

  return { users, suspended, dogs, events, messages, openReports, devices };
}

export async function recentAudit(limit = 50, db: Db = getDb()) {
  return db.query<{
    action: string;
    target_type: string;
    target_id: string;
    note: string;
    created_at: number;
    admin_name: string;
  }>(
    // Sistem aktörleri (API anahtarı) admin_users içinde bulunmaz; adı
    // kimliğinden türetiyoruz.
    `SELECT l.action, l.target_type, l.target_id, l.note, l.created_at,
            COALESCE(a.name, NULLIF(a.email, ''), l.admin_id) AS admin_name
       FROM admin_audit_log l
  LEFT JOIN admin_users a ON a.id = l.admin_id
      ORDER BY l.created_at DESC
      LIMIT $1`,
    [limit]
  );
}
