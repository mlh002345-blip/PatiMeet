import { db } from '../db';

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
  vaccinated: number;
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
  purpose: string | null;
  photo_url: string | null;
  status: string;
  terms_accepted_at: number | null;
  privacy_accepted_at: number | null;
  deletion_requested_at: number | null;
  /** Google ile bağlanmış hesabın sağlayıcı kimliği. */
  google_id: string | null;
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

export function publicDog(row: DogRow) {
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
    vaccinated: row.vaccinated === 1,
    photoUrl: row.photo_url,
  };
}

/**
 * Diğer kullanıcılara açık profil. Tam konum, e-posta ve hesap durumu gibi
 * alanlar bilinçli olarak dışarıda bırakıldı — yalnızca semt paylaşılır.
 */
export function publicUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    district: row.district,
    bio: row.bio,
    purpose: row.purpose,
    photoUrl: row.photo_url,
  };
}

/** Kullanıcının kendi hesabı için dönen genişletilmiş görünüm. */
export function privateUser(row: UserRow) {
  const dogs = db
    .prepare<[string], DogRow>(
      `SELECT * FROM dogs WHERE owner_id = ? AND status = 'active' ORDER BY created_at`
    )
    .all(row.id);

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    district: row.district,
    bio: row.bio,
    purpose: row.purpose,
    photoUrl: row.photo_url,
    status: row.status,
    termsAcceptedAt: row.terms_accepted_at,
    privacyAcceptedAt: row.privacy_accepted_at,
    deletionRequestedAt: row.deletion_requested_at,
    /** Ayarlarda "Google ile bağlı" durumunu göstermek için. */
    googleLinked: row.google_id !== null,
    hasPassword: row.password_hash !== null,
    passwordLoginDisabled: row.password_disabled_at !== null,
    dogs: dogs.map(publicDog),
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
  status: string;
  created_at: number;
}

export function publicEvent(row: EventRow, viewerId: string | null) {
  const owner = db
    .prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?')
    .get(row.owner_id);

  const count = db
    .prepare<[string], { c: number }>(
      'SELECT COUNT(*) AS c FROM event_participants WHERE event_id = ?'
    )
    .get(row.id);

  const joined = viewerId
    ? db
        .prepare<[string, string], { c: number }>(
          'SELECT COUNT(*) AS c FROM event_participants WHERE event_id = ? AND user_id = ?'
        )
        .get(row.id, viewerId)
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
    status: row.status,
    participantCount,
    spotsLeft: Math.max(0, row.capacity - participantCount),
    isFull: participantCount >= row.capacity,
    isOwner: viewerId === row.owner_id,
    hasJoined: (joined?.c ?? 0) > 0,
    owner: owner ? publicUser(owner) : null,
  };
}
