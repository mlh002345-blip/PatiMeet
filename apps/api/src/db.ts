import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

/**
 * Tek bir SQLite bağlantısı üzerinden çalışıyoruz. MVP için yeterli; ölçeklenirken
 * aynı şema Postgres'e taşınabilecek biçimde (UUID metin anahtarlar, epoch ms
 * zaman damgaları) tutuldu.
 */
const dbDir = path.dirname(config.dbFile);
if (config.dbFile !== ':memory:' && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.dbFile);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  provider      TEXT NOT NULL DEFAULT 'email',   -- email | google | apple
  provider_id   TEXT,
  name          TEXT NOT NULL DEFAULT '',
  district      TEXT,
  bio           TEXT NOT NULL DEFAULT '',
  purpose       TEXT,                            -- yuruyus | oyun | sosyal | egitim
  photo_url     TEXT,
  terms_accepted_at   INTEGER,
  privacy_accepted_at INTEGER,
  status        TEXT NOT NULL DEFAULT 'active',  -- active | suspended | deleted
  deletion_requested_at INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_district ON users(district);

CREATE TABLE IF NOT EXISTS dogs (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  breed       TEXT,
  birth_year  INTEGER,
  size        TEXT NOT NULL,                     -- kucuk | orta | buyuk
  energy      TEXT NOT NULL,                     -- sakin | dengeli | enerjik
  sociability TEXT NOT NULL,                     -- cekingen | secici | sosyal
  bio         TEXT NOT NULL DEFAULT '',
  vaccinated  INTEGER NOT NULL DEFAULT 0,        -- kullanıcı beyanı
  photo_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'active',    -- active | hidden | deleted
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dogs_owner ON dogs(owner_id);
CREATE INDEX IF NOT EXISTS idx_dogs_filters ON dogs(status, size, energy);

CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL,                   -- yuruyus | park | oyun | egitim | sosyal
  starts_at     INTEGER NOT NULL,
  district      TEXT NOT NULL,
  meeting_point TEXT NOT NULL,                   -- serbest metin, açık adres beklenmez
  capacity      INTEGER NOT NULL,
  dog_size      TEXT NOT NULL DEFAULT 'hepsi',   -- hepsi | kucuk | orta | buyuk
  description   TEXT NOT NULL DEFAULT '',
  rules         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active',  -- active | cancelled | removed
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_browse ON events(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_district ON events(district);

CREATE TABLE IF NOT EXISTS event_participants (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dog_id     TEXT REFERENCES dogs(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_participants_user ON event_participants(user_id);

CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  user_a_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_at INTEGER,
  created_at    INTEGER NOT NULL,
  UNIQUE(user_a_id, user_b_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  read_at         INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  reporter_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL,                    -- user | event
  target_id    TEXT NOT NULL,
  reason       TEXT NOT NULL,
  details      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open',     -- open | reviewing | resolved
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);

CREATE TABLE IF NOT EXISTS blocks (
  id           TEXT PRIMARY KEY,
  blocker_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  UNIQUE(blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);
`;

/**
 * Sonradan eklenen kolonlar. `CREATE TABLE IF NOT EXISTS` mevcut tabloları
 * değiştirmediği için, önceki sürümden gelen veritabanlarını da güncellemek
 * üzere kolonları tek tek kontrol edip ekliyoruz.
 */
const ADDED_COLUMNS: Array<{ table: string; column: string; definition: string }> = [
  // Google ile giriş: sağlayıcının kalıcı kullanıcı kimliği (`sub`).
  { table: 'users', column: 'google_id', definition: 'TEXT' },
  // E-postanın sahipliği kanıtlandığı an (Google doğrulaması veya ileride
  // eklenecek e-posta doğrulama akışı).
  { table: 'users', column: 'email_verified_at', definition: 'INTEGER' },
  // Şifre ile girişin kapatıldığı an — hesap eşleştirmede güvenlik gereği.
  { table: 'users', column: 'password_disabled_at', definition: 'INTEGER' },
];

function addMissingColumns(): void {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

export function migrate(): void {
  db.exec(SCHEMA);
  addMissingColumns();
  // Bir Google hesabı yalnızca tek bir PatiMeet hesabına bağlanabilir.
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL'
  );
}

export function nowMs(): number {
  return Date.now();
}
