import pg from 'pg';
import type { Db } from './types';

/**
 * `pg`, 64 bit tamsayıları (int8/BIGINT) varsayılan olarak **string** döndürür;
 * bunun nedeni JS sayılarının 2^53'ten büyük değerleri kaybetmesidir. Bizim
 * BIGINT kullanımımız yalnızca epoch milisaniye zaman damgaları (yaklaşık
 * 1.7e12) ve bunlar güvenli aralıkta. PGlite bunları sayı olarak döndürdüğü
 * için iki sürücünün aynı tipi vermesi adına burada da sayıya çeviriyoruz.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

function needsSsl(connectionString: string): boolean {
  // Yönetilen sağlayıcılar (Neon, Supabase, RDS) TLS ister; yerel sunucu istemez.
  if (/sslmode=disable/.test(connectionString)) return false;
  if (/sslmode=/.test(connectionString)) return true;
  return !/@(localhost|127\.0\.0\.1|\[::1\])/.test(connectionString);
}

export function createPostgresDb(connectionString: string, maxConnections = 10): Db {
  const pool = new pg.Pool({
    connectionString,
    max: maxConnections,
    // Sunucu tarafı boşta kalan bağlantıları kapatabildiği için kısa tutuyoruz.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  });

  // Havuzdaki boşta bağlantı hatası süreç çökertmesin.
  pool.on('error', (error) => {
    console.error('[patimeet] postgres havuz hatası:', error.message);
  });

  function wrap(runner: pg.Pool | pg.PoolClient): Db {
    const self: Db = {
      driver: 'postgres',

      async query<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
        const result = await runner.query(sql, params as unknown[]);
        return result.rows as T[];
      },

      async one<T>(sql: string, params: readonly unknown[] = []): Promise<T | undefined> {
        const result = await runner.query(sql, params as unknown[]);
        return result.rows[0] as T | undefined;
      },

      async exec(sql: string, params: readonly unknown[] = []) {
        const result = await runner.query(sql, params as unknown[]);
        return { rowCount: result.rowCount ?? 0 };
      },

      async script(sql: string) {
        await runner.query(sql);
      },

      async tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
        // İç içe çağrıda yeni bağlantı almıyoruz; mevcut işleme katılıyoruz.
        if ('release' in runner) return fn(self);

        const client = await (runner as pg.Pool).connect();
        try {
          await client.query('BEGIN');
          const result = await fn(wrap(client));
          await client.query('COMMIT');
          return result;
        } catch (error) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // Bağlantı zaten kopmuşsa geri alma da başarısız olur; asıl hatayı koru.
          }
          throw error;
        } finally {
          client.release();
        }
      },

      async ping() {
        await runner.query('SELECT 1');
      },

      async close() {
        if (!('release' in runner)) await (runner as pg.Pool).end();
      },
    };

    return self;
  }

  return wrap(pool);
}
