import { config } from '../config';
import { createPgliteDb } from './pglite';
import { createPostgresDb } from './postgres';
import type { Db } from './types';

export type { Db, CountRow } from './types';
export { runMigrations, migrationIds } from './migrations';

let instance: Db | null = null;

/**
 * Uygulamanın kullandığı veritabanı.
 *
 * `DATABASE_URL` verilmişse yönetilen PostgreSQL'e bağlanır. Verilmemişse
 * gömülü PostgreSQL (PGlite) kullanılır — geliştirmede sunucu kurmaya gerek
 * kalmaz. Production'da `DATABASE_URL` zorunludur (bkz. config.ts).
 */
export function getDb(): Db {
  if (instance) return instance;

  instance = config.databaseUrl
    ? createPostgresDb(config.databaseUrl, config.databasePoolSize)
    : createPgliteDb(config.pgliteDataDir);

  return instance;
}

/** Testlerin kendi veritabanını enjekte etmesi için. */
export function setDb(db: Db | null): void {
  instance = db;
}

export function nowMs(): number {
  return Date.now();
}
