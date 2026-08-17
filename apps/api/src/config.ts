import path from 'node:path';

const isProduction = process.env.NODE_ENV === 'production';

function required(name: string, fallback: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (isProduction) {
    throw new Error(
      `${name} ortam değişkeni production ortamında zorunludur. .env.example dosyasına bakın.`
    );
  }
  return fallback;
}

/** Production'da mutlaka verilmesi gereken, geliştirmede boş kalabilen değerler. */
function requiredInProduction(name: string): string | null {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isProduction) {
    throw new Error(
      `${name} ortam değişkeni production ortamında zorunludur. .env.example dosyasına bakın.`
    );
  }
  return null;
}

function optional(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === '') return fallback;
  return value === '1' || value === 'true' || value === 'yes';
}

/**
 * Google ID token'ının `aud` alanı, token'ı isteyen istemcinin kimliğidir.
 * iOS, Android ve Web ayrı istemci kimliği aldığı için hepsini kabul
 * listesine alıyoruz. Virgülle ayrılmış tek bir değişken de desteklenir.
 */
function googleClientIds(): string[] {
  const values = [
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_WEB_CLIENT_ID,
    ...(process.env.GOOGLE_CLIENT_IDS ?? '').split(','),
  ];

  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  );
}

/**
 * Apple ile giriş için kabul edilecek `aud` değerleri.
 *
 * Native uygulamada bu, uygulamanın bundle identifier'ıdır
 * (`com.patimeet.app`). Web akışı eklenirse Services ID de buraya girer.
 */
function appleClientIds(): string[] {
  const values = [
    process.env.APPLE_BUNDLE_ID,
    process.env.APPLE_SERVICES_ID,
    ...(process.env.APPLE_CLIENT_IDS ?? '').split(','),
  ];

  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  );
}

function pgliteDataDir(): string | undefined {
  const value = process.env.PGLITE_DATA_DIR?.trim();
  if (value === 'memory' || value === ':memory:') return undefined;
  return value && value.length > 0 ? value : path.join(process.cwd(), 'data', 'pglite');
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',

  /** Geliştirmede rastgele değil sabit bir fallback kullanıyoruz ki restart'ta oturumlar düşmesin. */
  jwtSecret: required('JWT_SECRET', 'patimeet-dev-secret-do-not-use-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',

  // --- Veritabanı ---
  /** Boşsa gömülü PostgreSQL (PGlite) kullanılır. Production'da zorunlu. */
  databaseUrl: requiredInProduction('DATABASE_URL'),
  databasePoolSize: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  /**
   * PGlite verisinin diske yazılacağı dizin. `memory` verilirse veri bellekte
   * tutulur ve süreç kapanınca kaybolur — testler bunu kullanır.
   */
  pgliteDataDir: pgliteDataDir(),
  /** Sunucu açılışında bekleyen migration'ları uygula. */
  migrateOnBoot: bool('MIGRATE_ON_BOOT', true),

  // --- Kimlik doğrulama sağlayıcıları ---
  /** Boşsa Google ile giriş kapalıdır ve istemciye buton gösterilmez. */
  googleClientIds: googleClientIds(),
  /** Boşsa Apple ile giriş kapalıdır. iOS mağaza gönderimi için zorunludur. */
  appleClientIds: appleClientIds(),

  // --- Obje deposu (profil ve köpek fotoğrafları) ---
  storage: {
    /**
     * `s3`   : S3 uyumlu obje deposu (AWS S3, Cloudflare R2, Backblaze B2, MinIO)
     * `local`: dosya sistemi — yalnızca geliştirme için
     */
    driver: (process.env.STORAGE_DRIVER ?? (isProduction ? 's3' : 'local')) as 's3' | 'local',
    bucket: optional('S3_BUCKET'),
    region: process.env.S3_REGION ?? 'auto',
    endpoint: optional('S3_ENDPOINT'),
    accessKeyId: optional('S3_ACCESS_KEY_ID'),
    secretAccessKey: optional('S3_SECRET_ACCESS_KEY'),
    /**
     * Kalıcı görsellerin sunulduğu genel adres (CDN). Verilirse görseller bu
     * adresten sunulur; verilmezse süreli imzalı indirme adresi üretilir.
     */
    publicBaseUrl: optional('S3_PUBLIC_BASE_URL'),
    /** Geliştirmede yerel dosyaların yazılacağı dizin. */
    localDir: process.env.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), 'data', 'uploads'),
    /** İmzalı adreslerin geçerlilik süresi (saniye). */
    signedUrlTtlSeconds: Number(process.env.S3_SIGNED_URL_TTL ?? 3600),
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024),
  },

  // --- Push bildirimleri ---
  push: {
    /**
     * `expo`: Expo Push API (tek uçtan iOS ve Android)
     * `none`: bildirim gönderilmez — token'lar yine kaydedilir
     */
    driver: (process.env.PUSH_DRIVER ?? 'expo') as 'expo' | 'none',
    /**
     * Expo erişim jetonu. "Enhanced Security" açıksa zorunludur; kapalıysa
     * gönderim jeton olmadan da çalışır.
     */
    expoAccessToken: optional('EXPO_ACCESS_TOKEN'),
  },

  // --- Yayın adresleri (mağaza gereklilikleri ve e-postalar için) ---
  publicWebUrl: process.env.PUBLIC_WEB_URL ?? 'https://patimeet.app',
  supportEmail: process.env.SUPPORT_EMAIL ?? 'destek@patimeet.app',

  // --- Moderasyon paneli ---
  /**
   * Kod ile ilk yönetici hesabı oluşturmak için. Panel açıldıktan sonra
   * kaldırılabilir; `npm run create-admin` de aynı işi yapar.
   */
  adminBootstrapEmail: optional('ADMIN_BOOTSTRAP_EMAIL'),
  adminBootstrapPassword: optional('ADMIN_BOOTSTRAP_PASSWORD'),
  /** Panel oturum çerezinin imzalanması için. */
  adminSessionSecret: required('ADMIN_SESSION_SECRET', 'patimeet-dev-admin-session-secret'),
  /** Panel oturumu süresi (saniye). */
  adminSessionTtlSeconds: Number(process.env.ADMIN_SESSION_TTL ?? 8 * 3600),
  /**
   * Makineden makineye moderasyon erişimi için paylaşılan anahtar
   * (`x-admin-token`). Panelden bağımsız olarak korunuyor.
   */
  adminToken: required('ADMIN_TOKEN', 'patimeet-dev-admin-token'),

  // --- Ağ ve gözlemlenebilirlik ---
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  /** Ters vekil (reverse proxy) arkasında gerçek istemci IP'sini almak için. */
  trustProxy: bool('TRUST_PROXY', isProduction),
  logLevel: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  rateLimit: {
    enabled: bool('RATE_LIMIT_ENABLED', true),
    /** Genel API penceresi. */
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    /** Giriş/kayıt gibi kimlik uçları için daha sıkı pencere. */
    authWindowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS ?? 15 * 60_000),
    authMax: Number(process.env.RATE_LIMIT_AUTH_MAX ?? 20),
    /** Yazma işlemleri (mesaj, etkinlik, şikâyet, yükleme). */
    writeWindowMs: Number(process.env.RATE_LIMIT_WRITE_WINDOW_MS ?? 60_000),
    writeMax: Number(process.env.RATE_LIMIT_WRITE_MAX ?? 60),
  },
};

export type Config = typeof config;
