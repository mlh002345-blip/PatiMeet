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
   *
   * `forcePrivate` verildiğinde CDN adresi tanımlı olsa bile kalıcı adres
   * ÜRETİLMEZ. Sağlık belgeleri ve özel anılar bunu kullanır.
   */
  urlFor(key: string, options?: { forcePrivate?: boolean }): Promise<string>;

  exists(key: string): Promise<boolean>;

  /**
   * Depoya gerçekten erişilebildiğini doğrular (kimlik bilgileri, uç adresi,
   * kova varlığı). Nesne yazmadan/okumadan, yalnız kovanın kendisini
   * sorgulayarak yapılır — `/ready` gibi sık çağrılan uçlarda ucuz olsun diye.
   * Başarısızsa hata mesajını değil, çağıranın günlükleyeceği bir `Error`
   * fırlatır; sağlayıcıya özgü ayrıntı istemciye asla dönmemeli.
   */
  ping(): Promise<void>;
}
