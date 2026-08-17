import type { Db } from './types';

/**
 * Migration'lar.
 *
 * Kod içinde tutuluyorlar ki derlenmiş `dist/` çıktısında ayrı SQL dosyası
 * kopyalamaya gerek kalmasın (deployment adımı azalır). Her migration bir kez
 * çalışır ve `schema_migrations` tablosuna yazılır.
 *
 * KURAL: Yayınlanmış bir migration'ı **değiştirmeyin**; yeni bir tane ekleyin.
 * Aksi halde mevcut veritabanları yeni sürümü hiç uygulamaz.
 */
interface Migration {
  id: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    id: '0001_initial_schema',
    sql: `
CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE,
  password_hash         TEXT,
  provider              TEXT NOT NULL DEFAULT 'email',
  -- Hesabın ilk açıldığı sağlayıcıdaki kimliği (bilgi amaçlı).
  provider_id           TEXT,
  google_id             TEXT UNIQUE,
  -- E-posta sahipliğinin kanıtlandığı an (sağlayıcıdan doğrulanmış geldiğinde).
  email_verified_at     BIGINT,
  -- Hesap eşleştirme güvenliği: doğrulanmamış e-postayla açılmış şifreli hesap
  -- bir sağlayıcıya bağlanırsa şifre girişi kapatılır.
  password_disabled_at  BIGINT,
  name                  TEXT NOT NULL DEFAULT '',
  district              TEXT,
  bio                   TEXT NOT NULL DEFAULT '',
  purpose               TEXT,
  photo_url             TEXT,
  terms_accepted_at     BIGINT,
  privacy_accepted_at   BIGINT,
  status                TEXT NOT NULL DEFAULT 'active',
  deletion_requested_at BIGINT,
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_district ON users(district);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS dogs (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  breed       TEXT,
  birth_year  INTEGER,
  size        TEXT NOT NULL,
  energy      TEXT NOT NULL,
  sociability TEXT NOT NULL,
  bio         TEXT NOT NULL DEFAULT '',
  vaccinated  BOOLEAN NOT NULL DEFAULT FALSE,
  photo_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dogs_owner ON dogs(owner_id);
CREATE INDEX IF NOT EXISTS idx_dogs_filters ON dogs(status, size, energy);

CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL,
  starts_at     BIGINT NOT NULL,
  district      TEXT NOT NULL,
  meeting_point TEXT NOT NULL,
  capacity      INTEGER NOT NULL,
  dog_size      TEXT NOT NULL DEFAULT 'hepsi',
  description   TEXT NOT NULL DEFAULT '',
  rules         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_browse ON events(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_district ON events(district);

CREATE TABLE IF NOT EXISTS event_participants (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dog_id     TEXT REFERENCES dogs(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_participants_user ON event_participants(user_id);

CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  user_a_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_at BIGINT,
  created_at      BIGINT NOT NULL,
  UNIQUE(user_a_id, user_b_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  read_at         BIGINT,
  created_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id, sender_id, read_at);

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);

CREATE TABLE IF NOT EXISTS blocks (
  id         TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  UNIQUE(blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);
`,
  },

  {
    id: '0002_apple_sign_in',
    sql: `
-- Apple, kullanıcı kimliğini (sub) sabit tutar ama e-postayı gizleyebilir
-- ("Hide My Email"), bu yüzden eşleştirme apple_id üzerinden yapılmalı.
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id) WHERE apple_id IS NOT NULL;
`,
  },

  {
    id: '0003_media_uploads',
    sql: `
-- Yüklenen görsellerin kayıt defteri. Obje deposundaki anahtar ile sahibi
-- burada eşleşir; yetkisiz silme ve sahipsiz dosya takibi bunu gerektirir.
CREATE TABLE IF NOT EXISTS media_objects (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key  TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  purpose      TEXT NOT NULL,          -- user_photo | dog_photo
  status       TEXT NOT NULL DEFAULT 'active',  -- active | deleted
  created_at   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_owner ON media_objects(owner_id, status);
`,
  },

  {
    id: '0004_push_notifications',
    sql: `
-- Cihaz push token'ları. Aynı kullanıcı birden fazla cihaz kullanabilir;
-- token cihaz başına tekildir ve başka bir hesaba geçerse sahibi güncellenir.
CREATE TABLE IF NOT EXISTS push_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL,           -- ios | android
  status      TEXT NOT NULL DEFAULT 'active',  -- active | revoked
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id, status);

-- Kullanıcının bildirim tercihleri. Satır yoksa varsayılan olarak hepsi açık.
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  messages    BOOLEAN NOT NULL DEFAULT TRUE,
  events      BOOLEAN NOT NULL DEFAULT TRUE,
  safety      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  BIGINT NOT NULL
);
`,
  },

  {
    id: '0005_admin_users',
    sql: `
-- Moderasyon arayüzü için ayrı yönetici hesapları. Uygulama kullanıcılarından
-- bağımsızdır; böylece bir moderatörün uygulama hesabı ele geçse bile panel
-- erişimi etkilenmez.
CREATE TABLE IF NOT EXISTS admin_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    BIGINT NOT NULL,
  last_login_at BIGINT
);

-- Moderasyon işlemlerinin denetim kaydı. Kim, neyi, ne zaman değiştirdi.
-- admin_id bilinçli olarak yabancı anahtar DEĞİL: panel yöneticilerinin
-- yanında API anahtarı gibi sistem aktörlerini de kaydediyoruz ve bir yönetici
-- hesabı silinse bile denetim izi korunmalı.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC);
`,
  },
  {
    id: '0006_community_safety_features',
    sql: `
CREATE TABLE IF NOT EXISTS lost_dog_posts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dog_id TEXT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  district TEXT NOT NULL,
  last_seen_area TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lost_dogs_active ON lost_dog_posts(status, district, created_at DESC);

CREATE TABLE IF NOT EXISTS event_reviews (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  felt_safe BOOLEAN NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  UNIQUE(event_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_event_reviews_event ON event_reviews(event_id, created_at DESC);
`,
  },
];

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

/**
 * Bekleyen migration'ları sırayla uygular. Her biri kendi işlemi içinde
 * çalışır; biri başarısız olursa o migration geri alınır ve süreç durur.
 */
export async function runMigrations(db: Db): Promise<MigrationResult> {
  await db.script(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    );
  `);

  const rows = await db.query<{ id: string }>('SELECT id FROM schema_migrations');
  const done = new Set(rows.map((row) => row.id));

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) {
      alreadyApplied.push(migration.id);
      continue;
    }

    await db.tx(async (t) => {
      await t.script(migration.sql);
      await t.exec('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)', [
        migration.id,
        Date.now(),
      ]);
    });

    applied.push(migration.id);
  }

  return { applied, alreadyApplied };
}

export const migrationIds = MIGRATIONS.map((m) => m.id);
