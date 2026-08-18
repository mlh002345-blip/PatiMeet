import { getDb, nowMs, type Db } from '../db';
import { badRequest, forbidden, notFound } from '../http';
import { newId } from '../ids';
import { getStorage, isMediaKey, MEDIA_KEY_PREFIX } from '../storage';

export type MediaPurpose = 'user_photo' | 'dog_photo' | 'event_photo' | 'alert_photo';

export interface MediaRow {
  id: string;
  owner_id: string;
  storage_key: string;
  content_type: string;
  size_bytes: number;
  purpose: string;
  status: string;
  created_at: number;
}

/**
 * Kabul edilen görsel türleri ve dosya imzaları.
 *
 * Yalnızca istemcinin bildirdiği `content-type`'a güvenmiyoruz: gerçek dosya
 * baytlarının başındaki imzayı (magic number) da doğruluyoruz. Aksi halde
 * `image/jpeg` etiketiyle çalıştırılabilir bir dosya yüklenebilirdi.
 */
const ALLOWED: Array<{
  contentType: string;
  extension: string;
  matches: (buffer: Buffer) => boolean;
}> = [
  {
    contentType: 'image/jpeg',
    extension: 'jpg',
    matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    contentType: 'image/png',
    extension: 'png',
    matches: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    contentType: 'image/webp',
    extension: 'webp',
    // RIFF....WEBP
    matches: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    contentType: 'image/heic',
    extension: 'heic',
    // ISO temel medya kabı: 4..8 = 'ftyp', ardından heic/heix/mif1 markası.
    matches: (b) =>
      b.length > 12 &&
      b.subarray(4, 8).toString('ascii') === 'ftyp' &&
      ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(b.subarray(8, 12).toString('ascii')),
  },
];

export const ALLOWED_CONTENT_TYPES = ALLOWED.map((entry) => entry.contentType);

export interface ValidatedImage {
  contentType: string;
  extension: string;
}

/**
 * Yüklenen baytları doğrular.
 *
 * Dosya türü gerçek içeriğe göre belirlenir; istemcinin gönderdiği tür yalnızca
 * ipucu olarak kullanılır.
 */
export function validateImage(buffer: Buffer, maxBytes: number): ValidatedImage {
  if (buffer.length === 0) {
    throw badRequest('Dosya boş.', 'empty_file');
  }
  if (buffer.length > maxBytes) {
    const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    throw badRequest(`Dosya çok büyük. En fazla ${mb} MB yükleyebilirsiniz.`, 'file_too_large');
  }

  const match = ALLOWED.find((entry) => entry.matches(buffer));
  if (!match) {
    throw badRequest(
      'Yalnızca JPEG, PNG, WebP veya HEIC görseli yükleyebilirsiniz.',
      'unsupported_file_type'
    );
  }

  return { contentType: match.contentType, extension: match.extension };
}

/**
 * Görseli depoya yazar ve kayıt defterine ekler.
 *
 * Anahtar rastgele üretilir; kullanıcı adı veya sıralı sayı içermez, böylece
 * başkasının fotoğrafının adresi tahmin edilemez.
 */
export async function storeImage(
  ownerId: string,
  purpose: MediaPurpose,
  buffer: Buffer,
  maxBytes: number,
  db: Db = getDb()
): Promise<{ id: string; key: string; url: string }> {
  const { contentType, extension } = validateImage(buffer, maxBytes);

  const key = `${MEDIA_KEY_PREFIX}${purpose}/${newId()}.${extension}`;
  const storage = getStorage();

  await storage.put(key, buffer, contentType);

  const id = newId();
  try {
    await db.exec(
      `INSERT INTO media_objects
         (id, owner_id, storage_key, content_type, size_bytes, purpose, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, ownerId, key, contentType, buffer.length, purpose, nowMs()]
    );
  } catch (error) {
    // Kayıt başarısızsa depoda sahipsiz dosya bırakmıyoruz.
    await storage.remove(key).catch(() => undefined);
    throw error;
  }

  return { id, key, url: await storage.urlFor(key) };
}

/**
 * Bir depo anahtarının verilen kullanıcıya ait olduğunu doğrular.
 *
 * Profil güncellemesinde `photoUrl` alanına başkasının anahtarı yazılarak
 * özel bir fotoğrafın ele geçirilmesini engeller.
 */
export async function assertOwnedMediaKey(
  ownerId: string,
  key: string,
  db: Db = getDb()
): Promise<void> {
  const row = await db.one<MediaRow>(
    `SELECT * FROM media_objects WHERE storage_key = $1 AND status = 'active'`,
    [key]
  );

  if (!row) throw notFound('Yüklenen görsel bulunamadı.');
  if (row.owner_id !== ownerId) {
    throw forbidden('Bu görseli kullanma yetkiniz yok.');
  }
}

/**
 * Profil alanına yazılacak fotoğraf değerini doğrular.
 *
 * `null`            → fotoğrafı kaldır
 * `media/...`       → sahipliği kontrol edilir
 * diğer            → reddedilir (yalnızca yüklenen görseller kabul edilir)
 */
export async function normalizePhotoInput(
  ownerId: string,
  value: string | null | undefined,
  db: Db = getDb()
): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  if (isMediaKey(value)) {
    await assertOwnedMediaKey(ownerId, value, db);
    return value;
  }

  /**
   * Sağlayıcıdan gelen profil fotoğrafı adresleri (Google) kabul edilir;
   * bunlar hesap oluşturulurken sunucu tarafında yazılır. İstemciden gelen
   * rastgele adresleri reddediyoruz ki uygulama başka sitelerden görsel
   * çekmeye zorlanamasın (SSRF ve içerik güvenliği).
   */
  if (/^https:\/\/lh[0-9]\.googleusercontent\.com\//.test(value)) return value;

  throw badRequest(
    'Fotoğrafı önce yükleyin. Doğrudan adres kabul edilmiyor.',
    'photo_upload_required'
  );
}

/** Kullanıcının bir görselini siler (kayıt + depo). */
export async function deleteMedia(
  ownerId: string,
  mediaId: string,
  db: Db = getDb()
): Promise<void> {
  const row = await db.one<MediaRow>('SELECT * FROM media_objects WHERE id = $1', [mediaId]);
  if (!row || row.status !== 'active') throw notFound('Görsel bulunamadı.');
  if (row.owner_id !== ownerId) throw forbidden('Bu görseli silme yetkiniz yok.');

  await getStorage().remove(row.storage_key).catch(() => undefined);

  await db.tx(async (t) => {
    await t.exec(`UPDATE media_objects SET status = 'deleted' WHERE id = $1`, [mediaId]);
    // Profillerde bu anahtar hâlâ kullanılıyorsa temizle; kırık görsel kalmasın.
    await t.exec('UPDATE users SET photo_url = NULL WHERE photo_url = $1', [row.storage_key]);
    await t.exec('UPDATE dogs SET photo_url = NULL WHERE photo_url = $1', [row.storage_key]);
    await t.exec('UPDATE events SET cover_photo_url = NULL WHERE cover_photo_url = $1', [
      row.storage_key,
    ]);
    // Güvenli Topluluk ilanlarında da kırık görsel kalmasın.
    await t.exec('DELETE FROM community_alert_photos WHERE storage_key = $1', [row.storage_key]);
  });
}

/**
 * Hesap silmede kullanıcının tüm görsellerini depodan kaldırır.
 * Depo hatası hesap silmeyi engellememeli; bu yüzden hatalar yutulur.
 */
export async function deleteAllUserMedia(ownerId: string, db: Db = getDb()): Promise<void> {
  const rows = await db.query<MediaRow>(
    `SELECT * FROM media_objects WHERE owner_id = $1 AND status = 'active'`,
    [ownerId]
  );

  const storage = getStorage();
  for (const row of rows) {
    await storage.remove(row.storage_key).catch(() => undefined);
  }

  await db.exec(
    `UPDATE media_objects SET status = 'deleted' WHERE owner_id = $1 AND status = 'active'`,
    [ownerId]
  );
}
