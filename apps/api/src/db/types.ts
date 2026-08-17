/**
 * Veritabanı sürücü arayüzü.
 *
 * İki sürücü aynı arayüzü uygular ve **aynı PostgreSQL diyalektini** kullanır:
 *   - `postgres` : yönetilen PostgreSQL (production)
 *   - `pglite`   : gömülü PostgreSQL (geliştirme ve testler, sunucu gerekmez)
 *
 * Tek diyalekt olması, testlerde geçip production'da patlayan SQL farklarını
 * ortadan kaldırır. Parametre yer tutucuları her zaman `$1, $2, ...` biçimindedir.
 */
export interface Db {
  /** Tüm satırları döner. */
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;

  /** İlk satırı döner, yoksa `undefined`. */
  one<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[]
  ): Promise<T | undefined>;

  /** Satır döndürmeyen ifadeler için; etkilenen satır sayısını verir. */
  exec(sql: string, params?: readonly unknown[]): Promise<{ rowCount: number }>;

  /** Birden fazla ifadeyi tek seferde çalıştırır (migration'lar için). */
  script(sql: string): Promise<void>;

  /**
   * İşlem (transaction). Geri dönen fonksiyon hata atarsa değişiklikler
   * geri alınır. İçteki `t` nesnesi aynı bağlantıyı kullanır.
   */
  tx<T>(fn: (t: Db) => Promise<T>): Promise<T>;

  /** Sağlık kontrolü — bağlantı gerçekten sorgu alabiliyor mu? */
  ping(): Promise<void>;

  close(): Promise<void>;

  readonly driver: 'postgres' | 'pglite';
}

/** Sayaç sorgularının ortak dönüş tipi. */
export interface CountRow {
  c: number;
}
