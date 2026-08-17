export interface StoredObject {
  /** Depodaki anahtar, örn. `media/user_photo/<uuid>.jpg`. */
  key: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Obje deposu arayüzü. İki sürücü uygular:
 *   - `s3`   : S3 uyumlu depo (AWS S3, Cloudflare R2, Backblaze B2, MinIO)
 *   - `local`: dosya sistemi, yalnızca geliştirme için
 *
 * Testler `local` sürücüyü geçici bir dizinle kullanır; gerçek bir bulut
 * hesabı gerekmeden yükleme, adres üretme ve silme akışları doğrulanabilir.
 */
export interface ObjectStorage {
  readonly driver: 's3' | 'local';

  put(key: string, body: Buffer, contentType: string): Promise<void>;

  remove(key: string): Promise<void>;

  /**
   * Görüntüleme adresi.
   *
   * Genel bir CDN adresi tanımlıysa kalıcı adres döner; tanımlı değilse
   * süreli imzalı adres üretilir. İmzalı adres, kovanın herkese açık
   * olmasını gerektirmediği için varsayılan güvenli seçenektir.
   */
  urlFor(key: string): Promise<string>;

  exists(key: string): Promise<boolean>;
}
