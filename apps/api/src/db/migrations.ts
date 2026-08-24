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
  {
    id: '0007_event_cover_photos',
    sql: `
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;
`,
  },

  {
    id: '0008_multi_purpose_and_community_alerts',
    sql: `
-- 1) "Ne arıyorsun?" alanı tek seçimden çoklu seçime geçiyor.
--
-- Eski tek değerli purpose kolonu bilinçli olarak SİLİNMİYOR: mevcut veri
-- yerinde kalır, yazma sırasında ilk seçim ile güncellenmeye devam eder ve
-- geri dönüş gerekirse veri kaybı olmaz. Okuma artık purposes dizisinden
-- yapılır.
ALTER TABLE users ADD COLUMN IF NOT EXISTS purposes TEXT[] NOT NULL DEFAULT '{}';

-- Mevcut tek seçimli değerleri kayıpsız taşı. cardinality kontrolü sayesinde
-- migration yeniden çalıştırılsa bile sonradan yapılmış çoklu seçimleri ezmez.
UPDATE users
   SET purposes = ARRAY[purpose]
 WHERE purpose IS NOT NULL
   AND purpose <> ''
   AND cardinality(purposes) = 0;

-- 2) Güvenli Topluluk bildirimleri.
--
-- Kayıp hayvan ilanı da bu tablonun bir türü. KONUM KURALI: yalnızca semt ve
-- serbest metin bir "yaklaşık bölge" tarifi saklanır; koordinat, açık adres
-- veya kapı numarası için alan YOKTUR ve doğrulama katmanı bunları reddeder.
CREATE TABLE IF NOT EXISTS community_alerts (
  id           TEXT PRIMARY KEY,
  author_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  -- Kayıp/bulunan hayvan ilanlarında hayvanın adı.
  animal_name  TEXT,
  -- Yaklaşık bölge: semt zorunlu, area_note ise "X parkı civarı" gibi tarif.
  district     TEXT NOT NULL,
  area_note    TEXT NOT NULL DEFAULT '',
  -- Son görülme (veya olayın gerçekleştiği) tarih ve saat.
  occurred_at  BIGINT,
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active',  -- active | resolved | removed
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_browse ON community_alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_district ON community_alerts(district, status);
CREATE INDEX IF NOT EXISTS idx_alerts_author ON community_alerts(author_id);

-- İlan fotoğrafları. Anahtarlar media_objects kaydına karşılık gelir; sahiplik
-- doğrulaması yükleme katmanında yapılır (bkz. domain/media.ts).
CREATE TABLE IF NOT EXISTS community_alert_photos (
  id          TEXT PRIMARY KEY,
  alert_id    TEXT NOT NULL REFERENCES community_alerts(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  position    INTEGER NOT NULL,
  created_at  BIGINT NOT NULL,
  UNIQUE(alert_id, position)
);
CREATE INDEX IF NOT EXISTS idx_alert_photos_alert ON community_alert_photos(alert_id, position);
`,
  },

  {
    id: '0009_merge_lost_dog_posts_into_alerts',
    sql: `
-- İki ayrı kayıp köpek yapısı tek yapıda birleşiyor: lost_dog_posts kayıtları
-- community_alerts içine "kayip_hayvan" türü olarak taşınır.
--
-- Kaynak tablo bilinçli olarak SİLİNMİYOR. Geri dönüş gerekirse veri yerinde
-- durur; uygulama artık ona yazmaz, yalnızca bu geçiş okur.

-- Taşınan kaydın kaynağı. Hem tekrar çalıştırmada çift kayıt oluşmasını
-- engeller hem de hangi ilanın nereden geldiğini izlenebilir kılar.
ALTER TABLE community_alerts ADD COLUMN IF NOT EXISTS source_lost_dog_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_source_lost_dog
  ON community_alerts(source_lost_dog_id) WHERE source_lost_dog_id IS NOT NULL;

-- İlanları taşı.
--
--   animal_name  ← köpeğin adı
--   area_note    ← son görülen yaklaşık bölge
--   occurred_at  ← ilan tarihi (eski yapıda ayrı bir son görülme zamanı yok)
--   status       ← found kayıtları çözüldü sayılır
--
-- NOT EXISTS koşulu geçişi tekrar çalıştırılabilir yapar: daha önce taşınmış
-- bir ilan ikinci kez eklenmez.
INSERT INTO community_alerts
  (id, author_id, type, animal_name, district, area_note, occurred_at,
   description, status, created_at, updated_at, source_lost_dog_id)
SELECT gen_random_uuid()::text,
       p.owner_id,
       'kayip_hayvan',
       d.name,
       p.district,
       p.last_seen_area,
       p.created_at,
       p.details,
       CASE WHEN p.status = 'active' THEN 'active' ELSE 'resolved' END,
       p.created_at,
       p.updated_at,
       p.id
  FROM lost_dog_posts p
  JOIN dogs d ON d.id = p.dog_id
 WHERE NOT EXISTS (
         SELECT 1 FROM community_alerts ca WHERE ca.source_lost_dog_id = p.id
       );

-- Köpeğin profil fotoğrafı ilanın fotoğrafı olur; ilan görselsiz kalmasın.
-- Alan hem obje deposu anahtarı hem düz adres taşıyabilir (bkz. storage/index.ts),
-- ikisi de olduğu gibi çözümlenir.
INSERT INTO community_alert_photos (id, alert_id, storage_key, position, created_at)
SELECT gen_random_uuid()::text, ca.id, d.photo_url, 0, ca.created_at
  FROM community_alerts ca
  JOIN lost_dog_posts p ON p.id = ca.source_lost_dog_id
  JOIN dogs d ON d.id = p.dog_id
 WHERE d.photo_url IS NOT NULL
   AND d.photo_url <> ''
   AND NOT EXISTS (
         SELECT 1 FROM community_alert_photos cp WHERE cp.alert_id = ca.id AND cp.position = 0
       );
`,
  },

  {
    id: '0010_walks_journal_and_neighbourhood',
    sql: `
-- ===========================================================================
-- Canlı Yürüyüş — gerçek GPS takibi
-- ===========================================================================
--
-- Ham rota noktaları yalnızca yürüyüş sahibine açılır (bkz. domain/walks.ts).
-- Sosyal yüzeylerde yalnızca semt ve uçları gizlenmiş özet paylaşılır.
CREATE TABLE IF NOT EXISTS walks (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dog_id              TEXT REFERENCES dogs(id) ON DELETE SET NULL,
  -- active | paused | completed | cancelled
  status              TEXT NOT NULL DEFAULT 'active',
  started_at          BIGINT NOT NULL,
  ended_at            BIGINT,
  -- Duraklatmalar düşülmüş gerçek hareket süresi.
  duration_seconds    INTEGER NOT NULL DEFAULT 0,
  distance_meters     INTEGER NOT NULL DEFAULT 0,
  pace_seconds_per_km INTEGER,
  -- Rota özetinde başlangıç/bitiş bölgesini gizle.
  hide_endpoints      BOOLEAN NOT NULL DEFAULT TRUE,
  district            TEXT,
  note                TEXT NOT NULL DEFAULT '',
  photo_key           TEXT,
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_walks_user ON walks(user_id, started_at DESC);
-- Bir kullanıcının aynı anda yalnızca bir sürmekte olan yürüyüşü olabilir.
CREATE UNIQUE INDEX IF NOT EXISTS idx_walks_single_active
  ON walks(user_id) WHERE status IN ('active', 'paused');

CREATE TABLE IF NOT EXISTS walk_points (
  id          TEXT PRIMARY KEY,
  walk_id     TEXT NOT NULL REFERENCES walks(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  accuracy    REAL,
  recorded_at BIGINT NOT NULL,
  UNIQUE(walk_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_walk_points_walk ON walk_points(walk_id, seq);

-- Süreli canlı konum paylaşımı. Süre dolunca paylaşım kendiliğinden kapanır.
CREATE TABLE IF NOT EXISTS walk_shares (
  id             TEXT PRIMARY KEY,
  walk_id        TEXT NOT NULL REFERENCES walks(id) ON DELETE CASCADE,
  shared_with_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at     BIGINT NOT NULL,
  revoked_at     BIGINT,
  created_at     BIGINT NOT NULL,
  UNIQUE(walk_id, shared_with_id)
);
CREATE INDEX IF NOT EXISTS idx_walk_shares_target ON walk_shares(shared_with_id, expires_at);

-- ===========================================================================
-- Köpeğimin Günlüğü
-- ===========================================================================
CREATE TABLE IF NOT EXISTS dog_journal_entries (
  id                   TEXT PRIMARY KEY,
  dog_id               TEXT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  owner_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL,
  title                TEXT NOT NULL DEFAULT '',
  note                 TEXT NOT NULL DEFAULT '',
  occurred_at          BIGINT NOT NULL,
  -- Hatırlatma: pending | done | snoozed | cancelled
  remind_at            BIGINT,
  reminder_status      TEXT,
  repeat_interval_days INTEGER,
  -- Türe göre anlam kazanan sayısal alan (kilo kg, su ml, uyku dk).
  value_numeric        DOUBLE PRECISION,
  value_unit           TEXT,
  created_at           BIGINT NOT NULL,
  updated_at           BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_dog ON dog_journal_entries(dog_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_reminders
  ON dog_journal_entries(owner_id, reminder_status, remind_at);

-- Sağlık belgeleri. Yalnızca sahibine açık; adresler imzalı üretilir.
CREATE TABLE IF NOT EXISTS dog_documents (
  id          TEXT PRIMARY KEY,
  dog_id      TEXT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  storage_key TEXT NOT NULL,
  created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dog_documents_dog ON dog_documents(dog_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dog_memories (
  id          TEXT PRIMARY KEY,
  dog_id      TEXT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT,
  note        TEXT NOT NULL DEFAULT '',
  occurred_at BIGINT NOT NULL,
  walk_id     TEXT REFERENCES walks(id) ON DELETE SET NULL,
  event_id    TEXT REFERENCES events(id) ON DELETE SET NULL,
  created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dog_memories_dog ON dog_memories(dog_id, occurred_at DESC);

-- Acil durum kartı varsayılan olarak özeldir; paylaşım kullanıcının açık
-- eylemiyle üretilen bir jetona bağlıdır.
CREATE TABLE IF NOT EXISTS dog_emergency_cards (
  dog_id      TEXT PRIMARY KEY REFERENCES dogs(id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  health_note TEXT NOT NULL DEFAULT '',
  allergies   TEXT NOT NULL DEFAULT '',
  medications TEXT NOT NULL DEFAULT '',
  chip_number TEXT,
  clinic_name TEXT,
  share_token TEXT,
  shared_at   BIGINT,
  updated_at  BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_emergency_share_token
  ON dog_emergency_cards(share_token) WHERE share_token IS NOT NULL;

-- ===========================================================================
-- Mahalle Akışı — Hızlı Yürüyüş Daveti ve oyun grupları
-- ===========================================================================
CREATE TABLE IF NOT EXISTS walk_invites (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dog_id           TEXT REFERENCES dogs(id) ON DELETE SET NULL,
  district         TEXT NOT NULL,
  area_note        TEXT NOT NULL DEFAULT '',
  starts_at        BIGINT NOT NULL,
  expires_at       BIGINT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  -- sakin | normal | hareketli
  pace             TEXT NOT NULL DEFAULT 'normal',
  dog_size         TEXT NOT NULL DEFAULT 'hepsi',
  note             TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_walk_invites_browse
  ON walk_invites(status, district, expires_at);

CREATE TABLE IF NOT EXISTS walk_invite_participants (
  id         TEXT PRIMARY KEY,
  invite_id  TEXT NOT NULL REFERENCES walk_invites(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dog_id     TEXT REFERENCES dogs(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(invite_id, user_id)
);

CREATE TABLE IF NOT EXISTS play_groups (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  district        TEXT NOT NULL,
  dog_size        TEXT NOT NULL DEFAULT 'hepsi',
  -- sakin | dengeli | hareketli
  play_style      TEXT NOT NULL DEFAULT 'dengeli',
  description     TEXT NOT NULL DEFAULT '',
  cover_photo_url TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_play_groups_browse ON play_groups(status, district);

CREATE TABLE IF NOT EXISTS play_group_members (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES play_groups(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  created_at BIGINT NOT NULL,
  UNIQUE(group_id, user_id)
);

-- ===========================================================================
-- Gizlilik odaklı ürün analitiği
-- ===========================================================================
--
-- KURAL: props yalnızca sayı, boolean ve kapalı küme değerleri taşır. Mesaj
-- içeriği, sağlık notu, tam konum ve serbest kullanıcı metni YAZILMAZ
-- (bkz. domain/analytics.ts).
CREATE TABLE IF NOT EXISTS analytics_events (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  props      TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_name ON analytics_events(name, created_at DESC);

-- Yeni bildirim kategorileri: bakım hatırlatmaları ve yürüyüş davetleri.
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS care BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS invites BOOLEAN NOT NULL DEFAULT TRUE;
`,
  },
  {
    id: '0011_walk_point_idempotency_and_push_reliability',
    sql: `
-- ===========================================================================
-- GPS nokta idempotency'si
-- ===========================================================================
--
-- Bağlantı kesilip aynı toplu gönderimin (batch) tekrar gönderilmesi hâlinde
-- aynı fiziksel noktanın iki kez kaydedilmesini engeller (bkz.
-- domain/walks.ts#appendPoints). Cihaz saatindeki 'recorded_at', bir yürüyüş
-- içinde her fiziksel noktayı doğal biçimde tekilleştirir.
--
-- Bu kısıt eklenmeden önce üretilmiş olabilecek kazara yinelenen satırları
-- (eski uygulama sürümü, kısıt olmadan) düşük 'seq' değeri kalacak şekilde
-- temizliyoruz; aksi hâlde tekil indeks oluşturma başarısız olabilir.
DELETE FROM walk_points wp
 WHERE EXISTS (
   SELECT 1 FROM walk_points other
    WHERE other.walk_id = wp.walk_id
      AND other.recorded_at = wp.recorded_at
      AND (other.seq < wp.seq OR (other.seq = wp.seq AND other.id < wp.id))
 );

CREATE UNIQUE INDEX IF NOT EXISTS idx_walk_points_dedupe
  ON walk_points(walk_id, recorded_at);

-- ===========================================================================
-- Push bildirimi güvenilirliği
-- ===========================================================================
--
-- Aynı olayın (ör. bir güncellemeyi tekrar tetikleyen istemci) iki kez
-- bildirim üretmesini önlemek için kısa ömürlü bir tekilleştirme kaydı.
CREATE TABLE IF NOT EXISTS push_dedupe (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(user_id, category, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_push_dedupe_created ON push_dedupe(created_at);

-- Expo "ticket" gönderiminde 'ok' yalnız kabul edildiğini gösterir; gerçek
-- teslimat durumu (ör. cihaz uygulamayı kaldırmış) bu bekleyen kayıtlar
-- üzerinden periyodik olarak "receipt" sorgusuyla doğrulanır (bkz.
-- domain/push.ts#reconcilePushReceipts).
CREATE TABLE IF NOT EXISTS push_receipts (
  receipt_id TEXT PRIMARY KEY,
  token      TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_receipts_created ON push_receipts(created_at);
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
