import path from 'node:path';

function required(name: string, fallback: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${name} ortam değişkeni production ortamında zorunludur. .env.example dosyasına bakın.`
    );
  }
  return fallback;
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

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  /** Geliştirmede rastgele değil sabit bir fallback kullanıyoruz ki restart'ta oturumlar düşmesin. */
  jwtSecret: required('JWT_SECRET', 'patimeet-dev-secret-do-not-use-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  dbFile: process.env.DB_FILE ?? path.join(process.cwd(), 'data', 'patimeet.sqlite'),
  /** Moderasyon uçlarına erişim için basit paylaşılan anahtar (özel admin paneli MVP dışı). */
  adminToken: required('ADMIN_TOKEN', 'patimeet-dev-admin-token'),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  /** Boşsa Google ile giriş kapalıdır ve istemciye buton gösterilmez. */
  googleClientIds: googleClientIds(),
};

export type Config = typeof config;
