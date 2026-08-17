/**
 * Migration çalıştırıcı.
 *
 *   npm run migrate
 *
 * Deployment akışında sunucu başlatılmadan önce çalıştırılır. Sunucu da
 * açılışta aynı işi yapar (`MIGRATE_ON_BOOT=true`); ayrı komut, birden fazla
 * sunucu örneği çalıştıran kurulumlarda migration'ı tek bir adımda yapmak
 * içindir.
 */
import { getDb, runMigrations } from '../db';
import { logger } from '../logger';

async function main(): Promise<void> {
  const db = getDb();
  logger.info({ driver: db.driver }, 'migration başlıyor');

  const result = await runMigrations(db);

  if (result.applied.length === 0) {
    logger.info({ existing: result.alreadyApplied.length }, 'şema güncel, uygulanacak migration yok');
  } else {
    logger.info({ applied: result.applied }, 'migration tamamlandı');
  }

  await db.close();
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.stack : String(error) }, 'migration başarısız');
  process.exit(1);
});
