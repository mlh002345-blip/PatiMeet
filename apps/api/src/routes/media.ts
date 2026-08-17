import express, { Router } from 'express';
import path from 'node:path';
import { currentUser, requireAuth } from '../auth';
import { config } from '../config';
import {
  ALLOWED_CONTENT_TYPES,
  deleteMedia,
  storeImage,
  type MediaPurpose,
} from '../domain/media';
import { asyncRoute, badRequest } from '../http';

export const mediaRouter = Router();

/**
 * Görsel yükleme.
 *
 * Gövde `application/octet-stream` olarak ham bayt alır (multipart yerine):
 * mobil istemcinin tek bir dosya göndermesi için en az hareketli yol ve ek
 * ayrıştırma bağımlılığı gerektirmez. Tür ve boyut doğrulaması bayt
 * içeriğinden yapılır (bkz. domain/media.ts).
 */
const PURPOSES: MediaPurpose[] = ['user_photo', 'dog_photo', 'event_photo'];

mediaRouter.post(
  '/:purpose',
  requireAuth,
  // Sınırı yapılandırılan üst değerin biraz üstüne koyuyoruz; asıl kontrol ve
  // anlaşılır hata mesajı doğrulama katmanında veriliyor.
  express.raw({
    type: () => true,
    limit: config.storage.maxUploadBytes + 1024,
  }),
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const purpose = req.params.purpose as MediaPurpose;

    if (!PURPOSES.includes(purpose)) {
      throw badRequest('Geçersiz yükleme türü.', 'invalid_purpose');
    }

    const body = req.body;
    if (!Buffer.isBuffer(body)) {
      throw badRequest('Dosya alınamadı.', 'missing_file');
    }

    const result = await storeImage(me.id, purpose, body, config.storage.maxUploadBytes);

    res.status(201).json({
      /** Profil güncellemesinde `photoUrl` alanına bu anahtar yazılır. */
      key: result.key,
      url: result.url,
      mediaId: result.id,
    });
  })
);

mediaRouter.get(
  '/allowed-types',
  asyncRoute((_req, res) => {
    res.json({
      contentTypes: ALLOWED_CONTENT_TYPES,
      maxBytes: config.storage.maxUploadBytes,
    });
  })
);

mediaRouter.delete(
  '/:mediaId',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    await deleteMedia(me.id, req.params.mediaId);
    res.json({ ok: true });
  })
);

/**
 * Yerel depo sürücüsü için dosya sunumu — yalnızca geliştirmede kullanılır.
 * Production'da görseller S3/CDN üzerinden sunulur ve bu router bağlanmaz.
 */
export function createLocalMediaRouter(): Router {
  const router = Router();

  router.use(
    express.static(config.storage.localDir, {
      // Anahtarlar içeriğe özel üretildiği için uzun önbellek güvenli.
      maxAge: '1y',
      immutable: true,
      index: false,
      // Dizin listelemesi ve gizli dosya sunumu kapalı.
      dotfiles: 'deny',
      setHeaders: (res, filePath) => {
        // Yüklenen içeriğin tarayıcıda çalıştırılmasını engelle.
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
      },
    })
  );

  return router;
}
