import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { config } from '../config';
import {
  getPreferences,
  registerPushToken,
  revokePushToken,
  setPreferences,
} from '../domain/push';
import { asyncRoute, parseBody } from '../http';

export const pushRouter = Router();

const registerSchema = z.object({
  /** Expo push token: `ExponentPushToken[...]` veya `ExpoPushToken[...]`. */
  token: z.string().trim().min(10).max(200),
  platform: z.enum(['ios', 'android']),
});

/**
 * Cihaz token'ını kaydeder.
 *
 * İstemci bunu her açılışta çağırır: Expo token'ı uygulama güncellemesi veya
 * yeniden kurulumda değişebilir, bu yüzden "yenileme" ayrı bir uç değil —
 * aynı çağrı token'ı günceller (bkz. domain/push.ts ON CONFLICT).
 */
pushRouter.post(
  '/tokens',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(registerSchema, req.body);
    await registerPushToken(me.id, input.token, input.platform);
    res.status(201).json({ ok: true, pushEnabled: config.push.driver !== 'none' });
  })
);

/**
 * Token'ı siler. İstemci bunu iki durumda çağırır:
 *   - kullanıcı oturumu kapatırken (cihaz artık bu hesaba ait değil)
 *   - kullanıcı sistem bildirim iznini geri çektiğinde
 */
pushRouter.delete(
  '/tokens',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(z.object({ token: z.string().trim().min(10).max(200) }), req.body);
    await revokePushToken(me.id, input.token);
    res.json({ ok: true });
  })
);

pushRouter.get(
  '/preferences',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    res.json({
      preferences: await getPreferences(me.id),
      pushEnabled: config.push.driver !== 'none',
    });
  })
);

const preferencesSchema = z.object({
  messages: z.boolean().optional(),
  care: z.boolean().optional(),
  invites: z.boolean().optional(),
  events: z.boolean().optional(),
  /**
   * Güvenlik bildirimleri kapatılabilir ancak sunucu tarafında yine gönderilir:
   * engellenme/şikâyet sonucu gibi bilgiler kullanıcıyı korur. Tercih yalnızca
   * arayüzde gösterilir.
   */
  safety: z.boolean().optional(),
});

pushRouter.patch(
  '/preferences',
  requireAuth,
  asyncRoute(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(preferencesSchema, req.body);
    res.json({ preferences: await setPreferences(me.id, input) });
  })
);
