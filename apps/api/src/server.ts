import { createApp } from './app';
import { config } from './config';
import { getDb, runMigrations } from './db';
import { ensureBootstrapAdmin } from './domain/moderation';
import { logger } from './logger';

async function main(): Promise<void> {
  const db = getDb();

  // Bağlantıyı açılışta doğrula: yanlış DATABASE_URL ile sessizce açılıp ilk
  // istekte patlamak yerine hemen anlaşılır bir hata verelim.
  try {
    await db.ping();
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error), driver: db.driver },
      'veritabanına bağlanılamadı'
    );
    process.exit(1);
  }

  if (config.migrateOnBoot) {
    const result = await runMigrations(db);
    if (result.applied.length > 0) {
      logger.info({ applied: result.applied }, 'migration uygulandı');
    } else {
      logger.info({ count: result.alreadyApplied.length }, 'şema güncel');
    }
  }

  await ensureBootstrapAdmin(config.adminBootstrapEmail, config.adminBootstrapPassword);

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info(
      {
        host: config.host,
        port: config.port,
        env: config.env,
        db: db.driver,
        storage: config.storage.driver,
        push: config.push.driver,
      },
      'PatiMeet API çalışıyor'
    );
  });

  /**
   * Düzgün kapanma. Deployment sırasında konteyner SIGTERM alır; süren
   * istekleri bitirip veritabanı havuzunu kapatıyoruz ki yarım işlem kalmasın.
   */
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'kapatma başladı');

    // Kapanma takılırsa süreci zorla bitir; deployment sonsuz beklemesin.
    const force = setTimeout(() => {
      logger.warn('düzgün kapanma zaman aşımına uğradı, süreç sonlandırılıyor');
      process.exit(1);
    }, 10_000);
    force.unref();

    server.close(async () => {
      try {
        await db.close();
      } catch {
        // Havuz zaten kapalıysa sorun değil.
      }
      logger.info('kapatma tamamlandı');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.stack : String(error) }, 'sunucu başlatılamadı');
  process.exit(1);
});
