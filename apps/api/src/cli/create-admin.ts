/**
 * Moderasyon paneli için yönetici hesabı oluşturur.
 *
 *   npm run create-admin -- ornek@patimeet.app "GucluSifre123" "Ad Soyad"
 *
 * Aynı e-posta ile tekrar çalıştırıldığında şifreyi günceller (şifre sıfırlama).
 */
import { getDb, runMigrations } from '../db';
import { createAdminUser } from '../domain/moderation';
import { logger } from '../logger';

async function main(): Promise<void> {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error(
      'Kullanım: npm run create-admin -- <e-posta> <şifre> [ad]\n' +
        'Örnek:   npm run create-admin -- moderator@patimeet.app "GucluSifre123" "Moderatör"'
    );
    process.exit(1);
  }

  if (password.length < 10) {
    console.error('Şifre en az 10 karakter olmalı.');
    process.exit(1);
  }

  const db = getDb();
  // Panel tabloları henüz yoksa oluşturulsun.
  await runMigrations(db);

  const admin = await createAdminUser(email, password, name ?? 'Moderatör', db);
  logger.info({ id: admin.id, email: admin.email }, 'yönetici hesabı hazır');
  console.log(`\nHazır. Panele giriş: /admin/login\nE-posta: ${admin.email}\n`);

  await db.close();
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.stack : String(error) }, 'yönetici oluşturulamadı');
  process.exit(1);
});
