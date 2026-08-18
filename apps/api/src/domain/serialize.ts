import { getDb, type CountRow, type Db } from '../db';
import { resolveMediaUrl } from '../storage';
import { readPurposes } from './purposes';

export interface DogRow {
  id: string;
  owner_id: string;
  name: string;
  breed: string | null;
  birth_year: number | null;
  size: string;
  energy: string;
  sociability: string;
  bio: string;
  vaccinated: boolean;
  photo_url: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  provider: string;
  name: string;
  district: string | null;
  bio: string;
  /**
   * Tek seçimli eski kolon. Yalnızca geriye dönük uyumluluk için yazılmaya
   * devam eder; okuma `purposes` üzerinden yapılır (bkz. migration 0006).
   */
  purpose: string | null;
  /** Çoklu seçim: "Ne arıyorsun?" cevapları. */
  purposes: string[] | null;
  photo_url: string | null;
  status: string;
  terms_accepted_at: number | null;
  privacy_accepted_at: number | null;
  deletion_requested_at: number | null;
  /** Google ile bağlanmış hesabın sağlayıcı kimliği. */
  google_id: string | null;
  /** Apple ile bağlanmış hesabın sağlayıcı kimliği (Apple `sub`). */
  apple_id: string | null;
  /** E-posta sahipliğinin kanıtlandığı an. */
  email_verified_at: number | null;
  /** Şifre girişinin kapatıldığı an (hesap eşleştirme güvenliği). */
  password_disabled_at: number | null;
  created_at: number;
}

function dogAge(birthYear: number | null): number | null {
  if (!birthYear) return null;
  const age = new Date().getUTCFullYear() - birthYear;
  return age >= 0 ? age : null;
}

/**
 * Fotoğraf alanları veritabanında obje deposu anahtarı (`media/...`) veya
 * doğrudan bir adres olarak durabilir. İstemciye her zaman görüntülenebilir
 * bir adres döneriz.
 */
async function photoUrl(stored: string | null): Promise<string | null> {
  return resolveMediaUrl(stored);
}

export async function publicDog(row: DogRow) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    breed: row.breed,
    birthYear: row.birth_year,
    age: dogAge(row.birth_year),
    size: row.size,
    energy: row.energy,
    sociability: row.sociability,
    bio: row.bio,
    vaccinated: row.vaccinated === true,
    photoUrl: await photoUrl(row.photo_url),
  };
}

export function publicDogs(rows: DogRow[]) {
  return Promise.all(rows.map(publicDog));
}

/**
 * Diğer kullanıcılara açık profil. Tam konum, e-posta ve hesap durumu gibi
 * alanlar bilinçli olarak dışarıda bırakıldı — yalnızca semt paylaşılır.
 */
export async function publicUser(row: UserRow) {
  const purposes = readPurposes(row.purposes, row.purpose);
  return {
    id: row.id,
    name: row.name,
    district: row.district,
    bio: row.bio,
    purposes,
    /** Eski istemciler tek değer bekliyor; ilk seçim gönderilir. */
    purpose: purposes[0] ?? null,
    photoUrl: await photoUrl(row.photo_url),
  };
}

/** Kullanıcının kendi hesabı için dönen genişletilmiş görünüm. */
export async function privateUser(row: UserRow, db: Db = getDb()) {
  const dogs = await db.query<DogRow>(
    `SELECT * FROM dogs WHERE owner_id = $1 AND status = 'active' ORDER BY created_at`,
    [row.id]
  );

  const purposes = readPurposes(row.purposes, row.purpose);

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    district: row.district,
    bio: row.bio,
    purposes,
    /** Eski istemciler tek değer bekliyor; ilk seçim gönderilir. */
    purpose: purposes[0] ?? null,
    photoUrl: await photoUrl(row.photo_url),
    status: row.status,
    termsAcceptedAt: row.terms_accepted_at,
    privacyAcceptedAt: row.privacy_accepted_at,
    deletionRequestedAt: row.deletion_requested_at,
    /** Ayarlarda "Google ile bağlı" durumunu göstermek için. */
    googleLinked: row.google_id !== null,
    appleLinked: row.apple_id !== null,
    hasPassword: row.password_hash !== null,
    passwordLoginDisabled: row.password_disabled_at !== null,
    dogs: await publicDogs(dogs),
    /** İstemci profil tamamlama uyarısını bu bayraklara göre gösterir. */
    profileComplete: Boolean(row.name && row.district) && dogs.length > 0,
    hasDog: dogs.length > 0,
  };
}

export interface EventRow {
  id: string;
  owner_id: string;
  title: string;
  type: string;
  starts_at: number;
  district: string;
  meeting_point: string;
  capacity: number;
  dog_size: string;
  description: string;
  rules: string;
  cover_photo_url: string | null;
  status: string;
  created_at: number;
}

export async function publicEvent(row: EventRow, viewerId: string | null, db: Db = getDb()) {
  const owner = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [row.owner_id]);

  const count = await db.one<CountRow>(
    'SELECT COUNT(*)::int AS c FROM event_participants WHERE event_id = $1',
    [row.id]
  );

  const joined = viewerId
    ? await db.one<CountRow>(
        'SELECT COUNT(*)::int AS c FROM event_participants WHERE event_id = $1 AND user_id = $2',
        [row.id, viewerId]
      )
    : { c: 0 };

  const participantCount = count?.c ?? 0;

  return {
    id: row.id,
    title: row.title,
    type: row.type,
    startsAt: row.starts_at,
    district: row.district,
    meetingPoint: row.meeting_point,
    capacity: row.capacity,
    dogSize: row.dog_size,
    description: row.description,
    rules: row.rules,
    coverPhotoUrl: await photoUrl(row.cover_photo_url),
    status: row.status,
    participantCount,
    spotsLeft: Math.max(0, row.capacity - participantCount),
    isFull: participantCount >= row.capacity,
    isOwner: viewerId === row.owner_id,
    hasJoined: (joined?.c ?? 0) > 0,
    owner: owner ? await publicUser(owner) : null,
  };
}

export function publicEvents(rows: EventRow[], viewerId: string | null, db: Db = getDb()) {
  return Promise.all(rows.map((row) => publicEvent(row, viewerId, db)));
}
