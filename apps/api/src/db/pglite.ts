import { PGlite } from '@electric-sql/pglite';
import type { Db } from './types';

/**
 * Gömülü PostgreSQL (WASM). Geliştirme ve testler için kullanılır; ayrı bir
 * veritabanı sunucusu kurmaya gerek kalmaz ve SQL diyalekti production ile
 * birebir aynıdır.
 *
 * `dataDir` verilmezse veri bellekte tutulur (testler için ideal).
 */
export function createPgliteDb(dataDir?: string): Db {
  const client = new PGlite(dataDir);

  /**
   * PGlite tek bağlantılıdır ve eşzamanlı sorgularda ifadeler birbirine
   * karışabilir. Sorguları sıraya alarak hem bunu hem de `tx` içindeki
   * BEGIN/COMMIT bloklarının araya sorgu almasını engelliyoruz.
   */
  let queue: Promise<unknown> = Promise.resolve();

  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(fn, fn);
    // Sıradaki hata zincirini kırmasın; sonucu çağırana bırakıyoruz.
    queue = result.catch(() => undefined);
    return result;
  }

  /** İşlem içindeyken sorgular sıraya alınmaz — zaten sıradaki işin parçası. */
  function build(inTransaction: boolean): Db {
    const run = <T>(fn: () => Promise<T>): Promise<T> =>
      inTransaction ? fn() : serialize(fn);

    const self: Db = {
      driver: 'pglite',

      query<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
        return run(async () => {
          const result = await client.query(sql, params as unknown[]);
          return result.rows as T[];
        });
      },

      one<T>(sql: string, params: readonly unknown[] = []): Promise<T | undefined> {
        return run(async () => {
          const result = await client.query(sql, params as unknown[]);
          return result.rows[0] as T | undefined;
        });
      },

      exec(sql: string, params: readonly unknown[] = []) {
        return run(async () => {
          const result = await client.query(sql, params as unknown[]);
          return { rowCount: result.affectedRows ?? result.rows.length ?? 0 };
        });
      },

      script(sql: string) {
        return run(async () => {
          await client.exec(sql);
        });
      },

      tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
        if (inTransaction) return fn(self);

        return serialize(async () => {
          const scoped = build(true);
          await client.query('BEGIN');
          try {
            const result = await fn(scoped);
            await client.query('COMMIT');
            return result;
          } catch (error) {
            try {
              await client.query('ROLLBACK');
            } catch {
              // Asıl hatayı gizlememek için geri alma hatasını yutuyoruz.
            }
            throw error;
          }
        });
      },

      ping() {
        return run(async () => {
          await client.query('SELECT 1');
        });
      },

      async close() {
        await client.close();
      },
    };

    return self;
  }

  return build(false);
}
