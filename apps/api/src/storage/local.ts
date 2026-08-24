import fs from 'node:fs/promises';
import path from 'node:path';
import type { ObjectStorage } from './types';

/**
 * Dosya sistemi tabanlı depo — geliştirme ve testler için.
 *
 * Dosyalar `/media/<key>` altından API tarafından sunulur (bkz. routes/media.ts).
 * Production'da kullanılmamalı: birden fazla sunucu örneği arasında paylaşılmaz
 * ve kalıcı disk gerektirir. `config.storage.driver` production'da `s3`'e
 * sabitlenir.
 */
export function createLocalStorage(baseDir: string, publicBaseUrl: string): ObjectStorage {
  /** Anahtardan dosya yolu üretir; `..` ile dizin dışına çıkışı engeller. */
  function resolve(key: string): string {
    const target = path.resolve(baseDir, key);
    const root = path.resolve(baseDir);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`Geçersiz depo anahtarı: ${key}`);
    }
    return target;
  }

  return {
    driver: 'local',

    async put(key, body) {
      const target = resolve(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, body);
    },

    async remove(key) {
      await fs.rm(resolve(key), { force: true });
    },

    async urlFor(key) {
      return `${publicBaseUrl.replace(/\/$/, '')}/media/${key}`;
    },

    async exists(key) {
      try {
        await fs.access(resolve(key));
        return true;
      } catch {
        return false;
      }
    },

    async ping() {
      await fs.mkdir(baseDir, { recursive: true });
      await fs.access(baseDir);
    },
  };
}
