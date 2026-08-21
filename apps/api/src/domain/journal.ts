import { getDb, nowMs, type Db } from '../db';
import { badRequest, forbidden, notFound } from '../http';
import { newId } from '../ids';
import { assertOwnedMediaKey } from './media';
import { resolveMediaUrl } from '../storage';

/**
 * Köpeğimin Günlüğü.
 *
 * Her kayıt bir köpeğe bağlıdır ve yalnızca köpeğin sahibine açıktır.
 * Sağlık belgeleri hiçbir zaman herkese açık adresle sunulmaz; adresler
 * obje deposundan istek anında (imzalı) üretilir.
 */

export interface JournalTypeInfo {
  value: string;
  label: string;
  /** Bu türde sayısal alan anlamlı mı ve birimi ne? */
  numeric?: { label: string; unit: string; min: number; max: number };
  /** Tekrarlayan bakım için önerilen gün aralıkları. */
  repeatDays?: number[];
  /** Hatırlatma bu türde öne çıkar. */
  remindable?: boolean;
}

export const JOURNAL_TYPES: JournalTypeInfo[] = [
  { value: 'asi', label: 'Aşı', remindable: true, repeatDays: [180, 365] },
  { value: 'ic_parazit', label: 'İç parazit', remindable: true, repeatDays: [30, 90] },
  { value: 'dis_parazit', label: 'Dış parazit', remindable: true, repeatDays: [30, 90] },
  { value: 'ilac', label: 'İlaç', remindable: true, repeatDays: [1, 7, 30] },
  { value: 'veteriner', label: 'Veteriner randevusu', remindable: true },
  { value: 'saglik_notu', label: 'Sağlık notu' },
  {
    value: 'kilo',
    label: 'Kilo',
    numeric: { label: 'Kilo', unit: 'kg', min: 0.3, max: 120 },
  },
  { value: 'mama', label: 'Mama değişikliği' },
  {
    value: 'su',
    label: 'Su takibi',
    numeric: { label: 'Su', unit: 'ml', min: 10, max: 5000 },
  },
  { value: 'alerji', label: 'Alerji' },
  {
    value: 'uyku',
    label: 'Uyku',
    numeric: { label: 'Uyku', unit: 'dk', min: 5, max: 1440 },
  },
  { value: 'tuvalet', label: 'Tuvalet' },
  { value: 'davranis', label: 'Davranış notu' },
  { value: 'banyo', label: 'Banyo', remindable: true, repeatDays: [30, 60] },
  { value: 'tirnak', label: 'Tırnak bakımı', remindable: true, repeatDays: [21, 30] },
  { value: 'dis', label: 'Diş bakımı', remindable: true, repeatDays: [7, 30] },
  { value: 'tuy', label: 'Tüy bakımı', remindable: true, repeatDays: [30, 90] },
];

const TYPE_MAP = new Map(JOURNAL_TYPES.map((t) => [t.value, t]));

export function journalType(value: string): JournalTypeInfo {
  const info = TYPE_MAP.get(value);
  if (!info) throw badRequest('Geçersiz kayıt türü.', 'invalid_journal_type');
  return info;
}

export const DOCUMENT_TYPES = [
  { value: 'asi_karnesi', label: 'Aşı karnesi' },
  { value: 'recete', label: 'Reçete' },
  { value: 'tahlil', label: 'Tahlil' },
  { value: 'pasaport', label: 'Pasaport' },
  { value: 'cip', label: 'Çip belgesi' },
  { value: 'diger', label: 'Diğer sağlık belgesi' },
] as const;

export interface JournalRow {
  id: string;
  dog_id: string;
  owner_id: string;
  type: string;
  title: string;
  note: string;
  occurred_at: number;
  remind_at: number | null;
  reminder_status: string | null;
  repeat_interval_days: number | null;
  value_numeric: number | null;
  value_unit: string | null;
  created_at: number;
  updated_at: number;
}

/** Köpeğin gerçekten bu kullanıcıya ait olduğunu doğrular. */
export async function assertOwnedDog(userId: string, dogId: string, db: Db): Promise<void> {
  const dog = await db.one<{ id: string }>(
    `SELECT id FROM dogs WHERE id = $1 AND owner_id = $2 AND status = 'active'`,
    [dogId, userId]
  );
  if (!dog) throw notFound('Köpek profili bulunamadı.');
}

export interface JournalInput {
  dogId: string;
  type: string;
  title?: string;
  note?: string;
  occurredAt: number;
  remindAt?: number | null;
  repeatIntervalDays?: number | null;
  value?: number | null;
}

export function validateJournalInput(input: JournalInput, now = nowMs()): JournalTypeInfo {
  const info = journalType(input.type);

  // Gerçek dışı tarihleri engelle: 20 yıl öncesi ve 5 yıl sonrası dışı.
  const twentyYears = 20 * 365 * 24 * 60 * 60 * 1000;
  const fiveYears = 5 * 365 * 24 * 60 * 60 * 1000;
  if (input.occurredAt < now - twentyYears || input.occurredAt > now + fiveYears) {
    throw badRequest('Tarih geçerli aralıkta olmalı.', 'invalid_date');
  }

  if (input.remindAt !== undefined && input.remindAt !== null) {
    if (input.remindAt < now - 24 * 60 * 60 * 1000) {
      throw badRequest('Hatırlatma zamanı geçmişte olamaz.', 'reminder_in_past');
    }
    if (input.remindAt > now + fiveYears) {
      throw badRequest('Hatırlatma zamanı çok ileride.', 'reminder_too_far');
    }
  }

  if (input.value !== undefined && input.value !== null) {
    if (!info.numeric) {
      throw badRequest(`${info.label} kaydında sayısal değer kullanılmaz.`, 'value_not_supported');
    }
    if (input.value < info.numeric.min || input.value > info.numeric.max) {
      throw badRequest(
        `${info.numeric.label} ${info.numeric.min}–${info.numeric.max} ${info.numeric.unit} aralığında olmalı.`,
        'value_out_of_range'
      );
    }
  }

  if (input.repeatIntervalDays !== undefined && input.repeatIntervalDays !== null) {
    if (input.repeatIntervalDays < 1 || input.repeatIntervalDays > 730) {
      throw badRequest('Tekrar aralığı 1–730 gün olabilir.', 'invalid_repeat');
    }
  }

  return info;
}

export async function createJournalEntry(
  userId: string,
  input: JournalInput,
  db: Db = getDb()
): Promise<JournalRow> {
  await assertOwnedDog(userId, input.dogId, db);
  const info = validateJournalInput(input);

  const ts = nowMs();
  const id = newId();
  await db.exec(
    `INSERT INTO dog_journal_entries
       (id, dog_id, owner_id, type, title, note, occurred_at, remind_at, reminder_status,
        repeat_interval_days, value_numeric, value_unit, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
    [
      id,
      input.dogId,
      userId,
      input.type,
      input.title?.trim() ?? '',
      input.note?.trim() ?? '',
      input.occurredAt,
      input.remindAt ?? null,
      input.remindAt ? 'pending' : null,
      input.repeatIntervalDays ?? null,
      input.value ?? null,
      input.value !== undefined && input.value !== null ? (info.numeric?.unit ?? null) : null,
      ts,
    ]
  );

  const row = await db.one<JournalRow>('SELECT * FROM dog_journal_entries WHERE id = $1', [id]);
  return row!;
}

export function publicJournalEntry(row: JournalRow) {
  return {
    id: row.id,
    dogId: row.dog_id,
    type: row.type,
    typeLabel: TYPE_MAP.get(row.type)?.label ?? row.type,
    title: row.title,
    note: row.note,
    occurredAt: row.occurred_at,
    remindAt: row.remind_at,
    reminderStatus: row.reminder_status,
    repeatIntervalDays: row.repeat_interval_days,
    value: row.value_numeric,
    valueUnit: row.value_unit,
    createdAt: row.created_at,
  };
}

export async function updateReminder(
  userId: string,
  entryId: string,
  status: 'done' | 'snoozed' | 'cancelled' | 'pending',
  snoozeUntil: number | null,
  db: Db = getDb()
): Promise<JournalRow> {
  const row = await db.one<JournalRow>('SELECT * FROM dog_journal_entries WHERE id = $1', [entryId]);
  if (!row) throw notFound('Kayıt bulunamadı.');
  if (row.owner_id !== userId) throw forbidden('Bu kaydı düzenleme yetkiniz yok.');

  const ts = nowMs();
  let remindAt = row.remind_at;

  if (status === 'snoozed') {
    if (!snoozeUntil || snoozeUntil <= ts) {
      throw badRequest('Erteleme zamanı gelecekte olmalı.', 'invalid_snooze');
    }
    remindAt = snoozeUntil;
  }

  await db.exec(
    `UPDATE dog_journal_entries
        SET reminder_status = $1, remind_at = $2, updated_at = $3
      WHERE id = $4`,
    [status, remindAt, ts, entryId]
  );

  /**
   * Tamamlanan tekrarlı bakım için bir sonraki kaydı otomatik açıyoruz;
   * böylece kullanıcı takvimi elle yeniden kurmuyor.
   */
  if (status === 'done' && row.repeat_interval_days && row.remind_at) {
    const nextAt = row.remind_at + row.repeat_interval_days * 24 * 60 * 60 * 1000;
    await db.exec(
      `INSERT INTO dog_journal_entries
         (id, dog_id, owner_id, type, title, note, occurred_at, remind_at, reminder_status,
          repeat_interval_days, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, '', $6, $6, 'pending', $7, $8, $8)`,
      [
        newId(),
        row.dog_id,
        row.owner_id,
        row.type,
        row.title,
        nextAt,
        row.repeat_interval_days,
        ts,
      ]
    );
  }

  const updated = await db.one<JournalRow>('SELECT * FROM dog_journal_entries WHERE id = $1', [
    entryId,
  ]);
  return updated!;
}

export async function deleteJournalEntry(userId: string, entryId: string, db: Db = getDb()) {
  const row = await db.one<JournalRow>('SELECT owner_id FROM dog_journal_entries WHERE id = $1', [
    entryId,
  ]);
  if (!row) throw notFound('Kayıt bulunamadı.');
  if (row.owner_id !== userId) throw forbidden('Bu kaydı silme yetkiniz yok.');
  await db.exec('DELETE FROM dog_journal_entries WHERE id = $1', [entryId]);
}

// ---------------------------------------------------------------------------
// Belgeler
// ---------------------------------------------------------------------------

export async function addDocument(
  userId: string,
  input: { dogId: string; type: string; title?: string; storageKey: string },
  db: Db = getDb()
) {
  await assertOwnedDog(userId, input.dogId, db);
  if (!DOCUMENT_TYPES.some((t) => t.value === input.type)) {
    throw badRequest('Geçersiz belge türü.', 'invalid_document_type');
  }
  // Belge yalnızca kullanıcının kendi yüklediği dosya olabilir.
  await assertOwnedMediaKey(userId, input.storageKey, db);

  const id = newId();
  await db.exec(
    `INSERT INTO dog_documents (id, dog_id, owner_id, type, title, storage_key, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, input.dogId, userId, input.type, input.title?.trim() ?? '', input.storageKey, nowMs()]
  );
  return id;
}

export async function listDocuments(userId: string, dogId: string, db: Db = getDb()) {
  await assertOwnedDog(userId, dogId, db);
  const rows = await db.query<{
    id: string;
    type: string;
    title: string;
    storage_key: string;
    created_at: number;
  }>(
    'SELECT id, type, title, storage_key, created_at FROM dog_documents WHERE dog_id = $1 ORDER BY created_at DESC',
    [dogId]
  );

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      type: row.type,
      typeLabel: DOCUMENT_TYPES.find((t) => t.value === row.type)?.label ?? row.type,
      title: row.title,
      /** Adres istek anında üretilir; kalıcı herkese açık bağlantı verilmez. */
      url: await resolveMediaUrl(row.storage_key),
      createdAt: row.created_at,
    }))
  );
}

export async function deleteDocument(userId: string, documentId: string, db: Db = getDb()) {
  const row = await db.one<{ owner_id: string }>(
    'SELECT owner_id FROM dog_documents WHERE id = $1',
    [documentId]
  );
  if (!row) throw notFound('Belge bulunamadı.');
  if (row.owner_id !== userId) throw forbidden('Bu belgeyi silme yetkiniz yok.');
  await db.exec('DELETE FROM dog_documents WHERE id = $1', [documentId]);
}

// ---------------------------------------------------------------------------
// Anılar ve acil durum kartı
// ---------------------------------------------------------------------------

export async function addMemory(
  userId: string,
  input: {
    dogId: string;
    storageKey?: string | null;
    note?: string;
    occurredAt: number;
    walkId?: string | null;
    eventId?: string | null;
  },
  db: Db = getDb()
) {
  await assertOwnedDog(userId, input.dogId, db);
  if (input.storageKey) await assertOwnedMediaKey(userId, input.storageKey, db);

  const id = newId();
  await db.exec(
    `INSERT INTO dog_memories (id, dog_id, owner_id, storage_key, note, occurred_at, walk_id, event_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      input.dogId,
      userId,
      input.storageKey ?? null,
      input.note?.trim() ?? '',
      input.occurredAt,
      input.walkId ?? null,
      input.eventId ?? null,
      nowMs(),
    ]
  );
  return id;
}

export async function listMemories(userId: string, dogId: string, db: Db = getDb()) {
  await assertOwnedDog(userId, dogId, db);
  const rows = await db.query<{
    id: string;
    storage_key: string | null;
    note: string;
    occurred_at: number;
    walk_id: string | null;
    event_id: string | null;
  }>(
    'SELECT id, storage_key, note, occurred_at, walk_id, event_id FROM dog_memories WHERE dog_id = $1 ORDER BY occurred_at DESC LIMIT 100',
    [dogId]
  );

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      photoUrl: await resolveMediaUrl(row.storage_key),
      note: row.note,
      occurredAt: row.occurred_at,
      walkId: row.walk_id,
      eventId: row.event_id,
    }))
  );
}

export async function getEmergencyCard(userId: string, dogId: string, db: Db = getDb()) {
  await assertOwnedDog(userId, dogId, db);
  const row = await db.one<{
    health_note: string;
    allergies: string;
    medications: string;
    chip_number: string | null;
    clinic_name: string | null;
    share_token: string | null;
    updated_at: number;
  }>('SELECT * FROM dog_emergency_cards WHERE dog_id = $1', [dogId]);

  if (!row) return null;
  return {
    healthNote: row.health_note,
    allergies: row.allergies,
    medications: row.medications,
    chipNumber: row.chip_number,
    clinicName: row.clinic_name,
    /** Kart varsayılan olarak özeldir; jeton yalnızca kullanıcı üretirse dolu. */
    shared: row.share_token !== null,
    shareToken: row.share_token,
    updatedAt: row.updated_at,
  };
}

export async function saveEmergencyCard(
  userId: string,
  dogId: string,
  input: {
    healthNote?: string;
    allergies?: string;
    medications?: string;
    chipNumber?: string | null;
    clinicName?: string | null;
  },
  db: Db = getDb()
) {
  await assertOwnedDog(userId, dogId, db);
  const ts = nowMs();
  await db.exec(
    `INSERT INTO dog_emergency_cards
       (dog_id, owner_id, health_note, allergies, medications, chip_number, clinic_name, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (dog_id) DO UPDATE
       SET health_note = $3, allergies = $4, medications = $5,
           chip_number = $6, clinic_name = $7, updated_at = $8`,
    [
      dogId,
      userId,
      input.healthNote?.trim() ?? '',
      input.allergies?.trim() ?? '',
      input.medications?.trim() ?? '',
      input.chipNumber?.trim() || null,
      input.clinicName?.trim() || null,
      ts,
    ]
  );
}

/** Paylaşılabilir bağlantı yalnızca kullanıcının açık isteğiyle üretilir. */
export async function setEmergencySharing(
  userId: string,
  dogId: string,
  enabled: boolean,
  db: Db = getDb()
): Promise<string | null> {
  await assertOwnedDog(userId, dogId, db);
  const token = enabled ? newId().replace(/-/g, '') : null;
  const result = await db.exec(
    'UPDATE dog_emergency_cards SET share_token = $1, shared_at = $2, updated_at = $2 WHERE dog_id = $3',
    [token, nowMs(), dogId]
  );
  if (result.rowCount === 0) throw notFound('Önce acil durum kartını doldurun.');
  return token;
}

/** Özet: yaklaşan, gecikmiş ve son kayıtlar. */
export async function journalOverview(userId: string, dogId: string, db: Db = getDb()) {
  await assertOwnedDog(userId, dogId, db);
  const ts = nowMs();
  const soon = ts + 30 * 24 * 60 * 60 * 1000;

  const [upcoming, overdue, recent, weight] = await Promise.all([
    db.query<JournalRow>(
      `SELECT * FROM dog_journal_entries
        WHERE dog_id = $1 AND reminder_status = 'pending'
          AND remind_at IS NOT NULL AND remind_at >= $2 AND remind_at <= $3
        ORDER BY remind_at LIMIT 10`,
      [dogId, ts, soon]
    ),
    db.query<JournalRow>(
      `SELECT * FROM dog_journal_entries
        WHERE dog_id = $1 AND reminder_status = 'pending'
          AND remind_at IS NOT NULL AND remind_at < $2
        ORDER BY remind_at LIMIT 10`,
      [dogId, ts]
    ),
    db.query<JournalRow>(
      'SELECT * FROM dog_journal_entries WHERE dog_id = $1 ORDER BY occurred_at DESC LIMIT 10',
      [dogId]
    ),
    db.query<JournalRow>(
      `SELECT * FROM dog_journal_entries
        WHERE dog_id = $1 AND type = 'kilo' AND value_numeric IS NOT NULL
        ORDER BY occurred_at DESC LIMIT 12`,
      [dogId]
    ),
  ]);

  return {
    upcoming: upcoming.map(publicJournalEntry),
    overdue: overdue.map(publicJournalEntry),
    recent: recent.map(publicJournalEntry),
    /** Grafik için eskiden yeniye sıralı kilo serisi. */
    weightSeries: [...weight].reverse().map((row) => ({
      occurredAt: row.occurred_at,
      value: row.value_numeric,
    })),
  };
}
