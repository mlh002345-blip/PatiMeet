import { config } from '../config';
import { logger } from '../logger';
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

    /**
     * `S3_REGION=auto` yalnızca Cloudflare R2 ve benzeri S3-uyumlu
     * servislerin kuralıdır — gerçek bir AWS bölgesi asla "auto" olamaz.
     * Bu değer verilmiş ama `S3_ENDPOINT` boşsa istemci sessizce gerçek
     * AWS S3'e bağlanmaya çalışır; R2 kimlik bilgileriyle bu her zaman
     * başarısız olur ("yapılandırma var ama işe yaramıyor" durumu). Yanlış
     * sağlayıcıya sessizce bağlanmak yerine açıkça durduruyoruz.
     */
    if (config.storage.region === 'auto' && !config.storage.endpoint) {
      throw new Error(
        'S3_REGION=auto ayarlanmış ama S3_ENDPOINT boş. Bu genelde Cloudflare R2 ' +
          '(veya başka bir S3-uyumlu servis) kullanıldığını gösterir ve S3_ENDPOINT ' +
          'zorunludur (örn. https://<hesap-id>.r2.cloudflarestorage.com). Gerçek AWS ' +
          "S3 kullanıyorsanız S3_REGION'ı gerçek bölgeyle değiştirin (örn. eu-central-1)."
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
  storageCheckCache = null;
}

interface StorageCheckResult {
  ok: boolean;
  /** Sağlayıcıya özgü ayrıntı içermez — yalnızca yapılandırma/erişim durumu. */
  detail: string;
}

let storageCheckCache: { at: number; result: StorageCheckResult } | null = null;
/** `/ready` sık çağrılabildiği için depoyu bu aralıktan daha sık sorgulamayız. */
const STORAGE_CHECK_TTL_MS = 30_000;

/**
 * Depoya gerçekten erişilebildiğini doğrular ve sonucu kısa süre önbellekler.
 *
 * `config.storage.driver` yalnızca yapılandırılan sürücü adını verir; bir
 * kova adının yanlış olması, kimlik bilgilerinin geçersiz olması veya yanlış
 * uç adresine bağlanılması gibi "yapılandırma var ama işe yaramıyor"
 * durumlarını yakalamaz. Bu fonksiyon gerçek bir erişim denemesi yapar
 * (bkz. `ObjectStorage.ping`).
 */
export async function checkStorage(): Promise<StorageCheckResult> {
  const now = Date.now();
  if (storageCheckCache && now - storageCheckCache.at < STORAGE_CHECK_TTL_MS) {
    return storageCheckCache.result;
  }

  let result: StorageCheckResult;
  try {
    await getStorage().ping();
    result = { ok: true, detail: `${config.storage.driver} erişilebilir` };
  } catch (error) {
    // Sağlayıcı hata mesajı (host, kova adı vb. içerebilir) yalnız sunucu
    // günlüğüne yazılır; istemciye veya /ready yanıtına asla sızdırılmaz.
    logger.error(
      { err: error instanceof Error ? error.message : String(error), driver: config.storage.driver },
      'depo erişim kontrolü başarısız'
    );
    result = { ok: false, detail: `${config.storage.driver} erişilemiyor` };
  }

  storageCheckCache = { at: now, result };
  return result;
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
