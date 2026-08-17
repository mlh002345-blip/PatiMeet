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
};

export type Config = typeof config;
