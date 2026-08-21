import { config } from '../config';
import { createLocalStorage } from './local';
import { createS3Storage } from './s3';
import type { ObjectStorage } from './types';

export type { ObjectStorage, StoredObject } from './types';

let instance: ObjectStorage | null = null;

/**
 * Yapılandırmaya göre obje deposunu kurar.
 *
 * `s3` seçiliyken kimlik bilgileri eksikse hata atıyoruz: sessizce yerel diske
 * yazmak, production'da fotoğrafların ilk yeniden başlatmada kaybolması
 * anlamına gelirdi.
 */
export function getStorage(): ObjectStorage {
  if (instance) return instance;

  if (config.storage.driver === 's3') {
    const { bucket, accessKeyId, secretAccessKey } = config.storage;
    const missing = [
      !bucket && 'S3_BUCKET',
      !accessKeyId && 'S3_ACCESS_KEY_ID',
      !secretAccessKey && 'S3_SECRET_ACCESS_KEY',
    ].filter(Boolean);

    if (missing.length > 0) {
      throw new Error(
        `STORAGE_DRIVER=s3 için şu ortam değişkenleri gerekli: ${missing.join(', ')}. ` +
          `Geliştirmede STORAGE_DRIVER=local kullanabilirsiniz.`
      );
    }

    instance = createS3Storage({
      bucket: bucket!,
      region: config.storage.region,
      endpoint: config.storage.endpoint,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      publicBaseUrl: config.storage.publicBaseUrl,
      signedUrlTtlSeconds: config.storage.signedUrlTtlSeconds,
    });
  } else {
    instance = createLocalStorage(
      config.storage.localDir,
      config.storage.publicBaseUrl ?? `http://localhost:${config.port}`
    );
  }

  return instance;
}

/** Testlerin kendi deposunu enjekte etmesi için. */
export function setStorage(storage: ObjectStorage | null): void {
  instance = storage;
}

/** Depo anahtarları bu ön ekle saklanır; düz adreslerden ayırt etmek için. */
export const MEDIA_KEY_PREFIX = 'media/';

export function isMediaKey(value: string): boolean {
  return value.startsWith(MEDIA_KEY_PREFIX);
}

/**
 * Veritabanındaki fotoğraf alanını istemciye gösterilecek adrese çevirir.
 *
 * Alan iki biçimde olabilir:
 *   - depo anahtarı (`media/...`) → depodan adres üretilir
 *   - düz adres (`https://...`)  → olduğu gibi döner
 *
 * İkinci durum, cihaz üzerindeki geçici URI'lerle çalışan eski kayıtların
 * bozulmaması için korundu.
 */
/**
 * Kalıcı herkese açık adres verilmeyecek amaçlar.
 *
 * Sağlık belgesi ve kişisel anı, CDN tabanı tanımlı olsa bile yalnızca süreli
 * imzalı adresle sunulur; adres sızsa bile süresi dolar.
 */
const PRIVATE_PURPOSES = ['document', 'memory_photo'];

function isPrivateKey(key: string): boolean {
  const purpose = key.slice(MEDIA_KEY_PREFIX.length).split('/')[0];
  return PRIVATE_PURPOSES.includes(purpose);
}

export async function resolveMediaUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  if (!isMediaKey(stored)) return stored;

  try {
    return await getStorage().urlFor(stored, { forcePrivate: isPrivateKey(stored) });
  } catch {
    // Depo yapılandırması bozuksa profil ekranı tamamen çökmesin.
    return null;
  }
}
