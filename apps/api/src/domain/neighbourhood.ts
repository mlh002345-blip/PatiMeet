import { getDb, nowMs, type Db } from '../db';
import { badRequest, conflict, forbidden, notFound } from '../http';
import { newId } from '../ids';
import { hiddenUserIds } from './blocks';
import { assertApproximateLocation } from './alerts';
import { notifyUser } from './push';
import { publicUser, type UserRow } from './serialize';
import { resolveMediaUrl } from '../storage';

/**
 * Mahalle Akışı ve Hızlı Yürüyüş Daveti.
 *
 * Akış mevcut kayıtların ikinci bir kopyasını TUTMAZ: etkinlikler, güvenli
 * topluluk bildirimleri ve davetler istek anında tek listede birleştirilir.
 * Böylece tek doğruluk kaynağı korunur ve silinen kayıt akışta kalmaz.
 *
 * Konum kuralı her yerde aynı: yalnızca semt ve yaklaşık bölge tarifi.
 */

export const PACE_OPTIONS = [
  { value: 'sakin', label: 'Sakin' },
  { value: 'normal', label: 'Normal' },
  { value: 'hareketli', label: 'Hareketli' },
] as const;

/** Bir kullanıcı aynı anda bu kadar aktif davet açabilir. */
export const MAX_ACTIVE_INVITES = 3;
/** Davet en fazla bu kadar ileriye planlanabilir. */
const MAX_LEAD_MINUTES = 180;

export interface InviteRow {
  id: string;
  owner_id: string;
  dog_id: string | null;
  district: string;
  area_note: string;
  starts_at: number;
  expires_at: number;
  duration_minutes: number;
  pace: string;
  dog_size: string;
  note: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface CreateInviteInput {
  dogId?: string | null;
  district: string;
  areaNote?: string;
  startsAt: number;
  durationMinutes: number;
  pace: string;
  dogSize?: string;
  note?: string;
}

export async function createInvite(
  userId: string,
  input: CreateInviteInput,
  db: Db = getDb()
): Promise<InviteRow> {
  const ts = nowMs();

  if (input.startsAt < ts - 5 * 60_000) {
    throw badRequest('Buluşma zamanı geçmişte olamaz.', 'starts_in_past');
  }
  if (input.startsAt > ts + MAX_LEAD_MINUTES * 60_000) {
    throw badRequest('Hızlı davet en fazla 3 saat sonrası için açılabilir.', 'starts_too_far');
  }
  if (input.durationMinutes < 15 || input.durationMinutes > 180) {
    throw badRequest('Yürüyüş süresi 15–180 dakika olabilir.', 'invalid_duration');
  }
  if (!PACE_OPTIONS.some((p) => p.value === input.pace)) {
    throw badRequest('Tempo seçin.', 'invalid_pace');
  }

  // Kesin konum/adres kalıpları burada da reddedilir.
  assertApproximateLocation(input.areaNote ?? '', 'Yaklaşık bölge');
  assertApproximateLocation(input.note ?? '', 'Not');

  const active = await db.one<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM walk_invites
      WHERE owner_id = $1 AND status = 'active' AND expires_at > $2`,
    [userId, ts]
  );
  if ((active?.c ?? 0) >= MAX_ACTIVE_INVITES) {
    throw conflict(
      `Aynı anda en fazla ${MAX_ACTIVE_INVITES} açık davetiniz olabilir.`,
      'too_many_invites'
    );
  }

  if (input.dogId) {
    const dog = await db.one<{ id: string }>(
      `SELECT id FROM dogs WHERE id = $1 AND owner_id = $2 AND status = 'active'`,
      [input.dogId, userId]
    );
    if (!dog) throw badRequest('Köpek profili bulunamadı.', 'dog_not_found');
  }

  // Davet, buluşma saatinden sonra yürüyüş süresi kadar daha geçerli kalır.
  const expiresAt = input.startsAt + input.durationMinutes * 60_000;
  const id = newId();

  await db.exec(
    `INSERT INTO walk_invites
       (id, owner_id, dog_id, district, area_note, starts_at, expires_at, duration_minutes,
        pace, dog_size, note, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12, $12)`,
    [
      id,
      userId,
      input.dogId ?? null,
      input.district,
      input.areaNote?.trim() ?? '',
      input.startsAt,
      expiresAt,
      input.durationMinutes,
      input.pace,
      input.dogSize ?? 'hepsi',
      input.note?.trim() ?? '',
      ts,
    ]
  );

  const row = await db.one<InviteRow>('SELECT * FROM walk_invites WHERE id = $1', [id]);
  return row!;
}

export async function publicInvite(
  row: InviteRow,
  viewerId: string,
  db: Db = getDb()
) {
  const [owner, participants] = await Promise.all([
    db.one<UserRow>('SELECT * FROM users WHERE id = $1', [row.owner_id]),
    db.query<{ user_id: string }>(
      'SELECT user_id FROM walk_invite_participants WHERE invite_id = $1',
      [row.id]
    ),
  ]);

  const expired = row.expires_at <= nowMs() || row.status !== 'active';

  return {
    id: row.id,
    district: row.district,
    areaNote: row.area_note,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    durationMinutes: row.duration_minutes,
    pace: row.pace,
    dogSize: row.dog_size,
    note: row.note,
    status: expired ? 'expired' : row.status,
    expired,
    participantCount: participants.length,
    isOwner: row.owner_id === viewerId,
    hasJoined: participants.some((p) => p.user_id === viewerId),
    owner: owner ? await publicUser(owner) : null,
    createdAt: row.created_at,
  };
}

export async function joinInvite(userId: string, inviteId: string, dogId: string | null, db: Db = getDb()) {
  const row = await db.one<InviteRow>('SELECT * FROM walk_invites WHERE id = $1', [inviteId]);
  if (!row) throw notFound('Davet bulunamadı.');

  // Süresi dolmuş veya iptal edilmiş davete katılım yok.
  if (row.status !== 'active' || row.expires_at <= nowMs()) {
    throw badRequest('Bu davetin süresi doldu.', 'invite_expired');
  }
  if (row.owner_id === userId) {
    throw badRequest('Kendi davetinize katılamazsınız.', 'self_join');
  }

  const hidden = await hiddenUserIds(userId, db);
  if (hidden.includes(row.owner_id)) throw notFound('Davet bulunamadı.');

  await db.exec(
    `INSERT INTO walk_invite_participants (id, invite_id, user_id, dog_id, created_at)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (invite_id, user_id) DO NOTHING`,
    [newId(), inviteId, userId, dogId, nowMs()]
  );

  await notifyUser(row.owner_id, 'invites', {
    title: 'Yürüyüş davetine katılım',
    body: 'Davetine bir komşun katıldı.',
    data: { type: 'invite', inviteId },
  }).catch(() => undefined);
}

export async function leaveInvite(userId: string, inviteId: string, db: Db = getDb()) {
  await db.exec('DELETE FROM walk_invite_participants WHERE invite_id = $1 AND user_id = $2', [
    inviteId,
    userId,
  ]);
}

export async function cancelInvite(userId: string, inviteId: string, db: Db = getDb()) {
  const row = await db.one<InviteRow>('SELECT * FROM walk_invites WHERE id = $1', [inviteId]);
  if (!row) throw notFound('Davet bulunamadı.');
  if (row.owner_id !== userId) throw forbidden('Bu daveti iptal etme yetkiniz yok.');
  await db.exec(`UPDATE walk_invites SET status = 'cancelled', updated_at = $1 WHERE id = $2`, [
    nowMs(),
    inviteId,
  ]);
}

export async function listInvites(
  viewerId: string,
  filters: { district?: string; scope?: 'all' | 'mine' },
  db: Db = getDb()
) {
  const hidden = await hiddenUserIds(viewerId, db);
  const where: string[] = [`status = 'active'`, `expires_at > $1`];
  const params: unknown[] = [nowMs()];
  const push = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.scope === 'mine') where.push(`owner_id = ${push(viewerId)}`);
  else if (hidden.length > 0) where.push(`owner_id != ALL(${push(hidden)})`);
  if (filters.district) where.push(`district = ${push(filters.district)}`);

  const rows = await db.query<InviteRow>(
    `SELECT * FROM walk_invites WHERE ${where.join(' AND ')} ORDER BY starts_at LIMIT 50`,
    params
  );
  return Promise.all(rows.map((row) => publicInvite(row, viewerId, db)));
}

/** Aynı semtteki kullanıcılara davet bildirimi. */
export async function notifyDistrictOfInvite(row: InviteRow, db: Db = getDb()) {
  const hidden = await hiddenUserIds(row.owner_id, db);
  const users = await db.query<{ id: string }>(
    `SELECT id FROM users
      WHERE status = 'active' AND district = $1 AND id != $2 AND id != ALL($3)`,
    [row.district, row.owner_id, hidden]
  );

  let notified = 0;
  for (const user of users) {
    const result = await notifyUser(user.id, 'invites', {
      title: `Hızlı yürüyüş · ${row.district}`,
      body: 'Komşun birlikte yürümek için davet açtı.',
      data: { type: 'invite', inviteId: row.id },
    });
    if (result.sent > 0) notified += 1;
  }
  return { notified };
}

// ---------------------------------------------------------------------------
// Köpek oyun grupları
// ---------------------------------------------------------------------------

export interface GroupRow {
  id: string;
  owner_id: string;
  name: string;
  district: string;
  dog_size: string;
  play_style: string;
  description: string;
  cover_photo_url: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export async function createGroup(
  userId: string,
  input: {
    name: string;
    district: string;
    dogSize?: string;
    playStyle?: string;
    description?: string;
    coverPhotoUrl?: string | null;
  },
  db: Db = getDb()
): Promise<GroupRow> {
  assertApproximateLocation(input.description ?? '', 'Açıklama');

  const ts = nowMs();
  const id = newId();
  await db.tx(async (t) => {
    await t.exec(
      `INSERT INTO play_groups
         (id, owner_id, name, district, dog_size, play_style, description, cover_photo_url,
          status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $9)`,
      [
        id,
        userId,
        input.name.trim(),
        input.district,
        input.dogSize ?? 'hepsi',
        input.playStyle ?? 'dengeli',
        input.description?.trim() ?? '',
        input.coverPhotoUrl ?? null,
        ts,
      ]
    );
    // Kurucu doğrudan üye olur.
    await t.exec(
      `INSERT INTO play_group_members (id, group_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', $4)`,
      [newId(), id, userId, ts]
    );
  });

  const row = await db.one<GroupRow>('SELECT * FROM play_groups WHERE id = $1', [id]);
  return row!;
}

export async function publicGroup(row: GroupRow, viewerId: string, db: Db = getDb()) {
  const members = await db.query<{ user_id: string }>(
    'SELECT user_id FROM play_group_members WHERE group_id = $1',
    [row.id]
  );
  const upcoming = await db.one<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM events
      WHERE status = 'active' AND district = $1 AND starts_at > $2`,
    [row.district, nowMs()]
  );

  return {
    id: row.id,
    name: row.name,
    district: row.district,
    dogSize: row.dog_size,
    playStyle: row.play_style,
    description: row.description,
    coverPhotoUrl: await resolveMediaUrl(row.cover_photo_url),
    memberCount: members.length,
    isMember: members.some((m) => m.user_id === viewerId),
    isOwner: row.owner_id === viewerId,
    /** Grubun semtindeki yaklaşan etkinlikler — ayrı bir etkinlik sistemi yok. */
    upcomingEventCount: upcoming?.c ?? 0,
    createdAt: row.created_at,
  };
}

export async function joinGroup(userId: string, groupId: string, db: Db = getDb()) {
  const row = await db.one<GroupRow>('SELECT * FROM play_groups WHERE id = $1', [groupId]);
  if (!row || row.status !== 'active') throw notFound('Grup bulunamadı.');

  await db.exec(
    `INSERT INTO play_group_members (id, group_id, user_id, role, created_at)
     VALUES ($1, $2, $3, 'member', $4) ON CONFLICT (group_id, user_id) DO NOTHING`,
    [newId(), groupId, userId, nowMs()]
  );
}

export async function leaveGroup(userId: string, groupId: string, db: Db = getDb()) {
  const row = await db.one<GroupRow>('SELECT * FROM play_groups WHERE id = $1', [groupId]);
  if (!row) throw notFound('Grup bulunamadı.');
  if (row.owner_id === userId) {
    throw badRequest('Grup yöneticisi gruptan ayrılamaz.', 'owner_cannot_leave');
  }
  await db.exec('DELETE FROM play_group_members WHERE group_id = $1 AND user_id = $2', [
    groupId,
    userId,
  ]);
}

export async function listGroups(
  viewerId: string,
  filters: { district?: string; scope?: 'all' | 'mine' },
  db: Db = getDb()
) {
  const where: string[] = [`g.status = 'active'`];
  const params: unknown[] = [];
  const push = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.district) where.push(`g.district = ${push(filters.district)}`);
  if (filters.scope === 'mine') {
    where.push(
      `EXISTS (SELECT 1 FROM play_group_members m WHERE m.group_id = g.id AND m.user_id = ${push(viewerId)})`
    );
  }

  const rows = await db.query<GroupRow>(
    `SELECT g.* FROM play_groups g WHERE ${where.join(' AND ')} ORDER BY g.created_at DESC LIMIT 50`,
    params
  );
  return Promise.all(rows.map((row) => publicGroup(row, viewerId, db)));
}

// ---------------------------------------------------------------------------
// Mahalle Akışı
// ---------------------------------------------------------------------------

export type FeedKind = 'event' | 'alert' | 'invite';

export interface FeedItem {
  kind: FeedKind;
  id: string;
  title: string;
  subtitle: string;
  district: string;
  /** Sıralama anahtarı: olayın gerçekleşeceği/olduğu an. */
  sortAt: number;
  photoUrl: string | null;
  meta: Record<string, string | number | boolean | null>;
}

/**
 * Semt akışı.
 *
 * Kaynak kayıtlar tek listede birleştirilir; kopya tablo yoktur. Engellenen
 * kullanıcıların içerikleri ve süresi dolmuş davetler listelenmez.
 */
export async function neighbourhoodFeed(
  viewerId: string,
  filters: { district?: string; kinds?: FeedKind[]; limit?: number },
  db: Db = getDb()
): Promise<FeedItem[]> {
  const hidden = await hiddenUserIds(viewerId, db);
  const excluded = hidden.length > 0 ? hidden : ['__none__'];
  const ts = nowMs();
  const limit = Math.min(Math.max(filters.limit ?? 40, 1), 60);
  const kinds = filters.kinds?.length ? filters.kinds : (['event', 'alert', 'invite'] as FeedKind[]);
  const items: FeedItem[] = [];

  if (kinds.includes('event')) {
    const rows = await db.query<{
      id: string;
      title: string;
      district: string;
      starts_at: number;
      type: string;
      cover_photo_url: string | null;
      capacity: number;
      participants: number;
    }>(
      `SELECT e.id, e.title, e.district, e.starts_at, e.type, e.cover_photo_url, e.capacity,
              (SELECT COUNT(*)::int FROM event_participants p WHERE p.event_id = e.id) AS participants
         FROM events e
        WHERE e.status = 'active' AND e.starts_at > $1 AND e.owner_id != ALL($2)
          ${filters.district ? 'AND e.district = $3' : ''}
        ORDER BY e.starts_at LIMIT ${limit}`,
      filters.district ? [ts, excluded, filters.district] : [ts, excluded]
    );

    for (const row of rows) {
      items.push({
        kind: 'event',
        id: row.id,
        title: row.title,
        subtitle: `${row.participants}/${row.capacity} kişi`,
        district: row.district,
        sortAt: row.starts_at,
        photoUrl: await resolveMediaUrl(row.cover_photo_url),
        meta: { startsAt: row.starts_at, type: row.type },
      });
    }
  }

  if (kinds.includes('alert')) {
    const rows = await db.query<{
      id: string;
      type: string;
      animal_name: string | null;
      district: string;
      area_note: string;
      description: string;
      created_at: number;
      photo: string | null;
    }>(
      `SELECT a.id, a.type, a.animal_name, a.district, a.area_note, a.description, a.created_at,
              (SELECT p.storage_key FROM community_alert_photos p
                WHERE p.alert_id = a.id ORDER BY p.position LIMIT 1) AS photo
         FROM community_alerts a
        WHERE a.status = 'active' AND a.author_id != ALL($1)
          ${filters.district ? 'AND a.district = $2' : ''}
        ORDER BY a.created_at DESC LIMIT ${limit}`,
      filters.district ? [excluded, filters.district] : [excluded]
    );

    for (const row of rows) {
      items.push({
        kind: 'alert',
        id: row.id,
        title: row.animal_name ?? row.description.slice(0, 60),
        subtitle: row.area_note || row.district,
        district: row.district,
        sortAt: row.created_at,
        photoUrl: await resolveMediaUrl(row.photo),
        meta: { alertType: row.type },
      });
    }
  }

  if (kinds.includes('invite')) {
    const rows = await db.query<InviteRow & { participants: number }>(
      `SELECT i.*, (SELECT COUNT(*)::int FROM walk_invite_participants p WHERE p.invite_id = i.id) AS participants
         FROM walk_invites i
        WHERE i.status = 'active' AND i.expires_at > $1 AND i.owner_id != ALL($2)
          ${filters.district ? 'AND i.district = $3' : ''}
        ORDER BY i.starts_at LIMIT ${limit}`,
      filters.district ? [ts, excluded, filters.district] : [ts, excluded]
    );

    for (const row of rows) {
      items.push({
        kind: 'invite',
        id: row.id,
        title: 'Hızlı yürüyüş daveti',
        subtitle: row.area_note || row.district,
        district: row.district,
        sortAt: row.starts_at,
        photoUrl: null,
        meta: {
          startsAt: row.starts_at,
          pace: row.pace,
          durationMinutes: row.duration_minutes,
          participantCount: row.participants,
        },
      });
    }
  }

  // Yakın zamanlı olan üstte.
  return items.sort((a, b) => a.sortAt - b.sortAt).slice(0, limit);
}
