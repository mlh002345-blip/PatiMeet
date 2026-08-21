import cors from 'cors';
import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { createAdminPanelRouter } from './admin/router';
import { config } from './config';
import { getDb } from './db';
import { createAppleVerifier } from './domain/apple';
import { createGoogleVerifier } from './domain/google';
import { createSocialRouter, type SocialVerifier } from './domain/social';
import { errorHandler } from './http';
import { logger } from './logger';
import { adminRouter } from './routes/admin';
import { walksRouter } from './routes/walks';
import { journalRouter } from './routes/journal';
import { neighbourhoodRouter } from './routes/neighbourhood';
import { authRouter } from './routes/auth';
import { discoverRouter } from './routes/discover';
import { dogsRouter } from './routes/dogs';
import { eventsRouter } from './routes/events';
import { communityRouter } from './routes/community';
import { legalRouter } from './routes/legal';
import { createLocalMediaRouter, mediaRouter } from './routes/media';
import { messagesRouter } from './routes/messages';
import { pushRouter } from './routes/push';
import { safetyRouter } from './routes/safety';
import { usersRouter } from './routes/users';

export interface AppDependencies {
  /**
   * Sağlayıcı doğrulayıcıları. Belirtilmezse ortam değişkenlerinden gerçek
   * doğrulayıcılar kurulur (yapılandırma yoksa o sağlayıcı kapalı olur).
   * Testler burayı kendi doğrulayıcılarıyla değiştirir.
   */
  googleVerifier?: SocialVerifier | null;
  appleVerifier?: SocialVerifier | null;
}

/**
 * Hız sınırı.
 *
 * Anahtar olarak oturum açmış kullanıcının kimliğini, yoksa IP'yi kullanıyoruz:
 * ortak ağ arkasındaki kullanıcılar (üniversite, iş yeri) birbirinin limitini
 * tüketmesin. IPv6 adresleri `ipKeyGenerator` ile alt ağa normalize edilir —
 * aksi halde tek bir kullanıcı /64 bloğundaki adresleri dolaşarak limiti aşabilir.
 */
function createLimiter(windowMs: number, max: number, name: string) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => (req.user ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`),
    handler: (req, res) => {
      logger.warn({ path: req.path, limiter: name }, 'hız sınırı aşıldı');
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyip tekrar deneyin.',
        },
      });
    },
  });
}

export function createApp(deps: AppDependencies = {}): express.Express {
  const googleVerifier =
    deps.googleVerifier !== undefined ? deps.googleVerifier : createGoogleVerifier();
  const appleVerifier =
    deps.appleVerifier !== undefined ? deps.appleVerifier : createAppleVerifier();

  const app = express();

  // Ters vekil arkasında gerçek istemci IP'si (hız sınırı ve günlükler için).
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      // Sağlık kontrolü her birkaç saniyede bir çağrılır; günlüğü boğmasın.
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
    })
  );

  app.use(cors({ origin: config.corsOrigin }));

  // Güvenlik başlıkları. Uygulama bir JSON API + küçük HTML paneli olduğu için
  // tam bir helmet bağımlılığı yerine gereken başlıkları elle veriyoruz.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (config.isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // --- Sağlık kontrolleri ---

  /** Canlılık: süreç ayakta mı? Yük dengeleyici bunu kullanır. */
  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'patimeet-api', time: new Date().toISOString() });
  });

  /**
   * Hazır olma: bağımlılıklar gerçekten çalışıyor mu? Deployment sırasında
   * yeni sürüm trafiğe alınmadan önce bunun 200 dönmesi beklenir.
   */
  app.get('/ready', async (_req, res) => {
    const checks: Record<string, string> = {};
    let ok = true;

    try {
      await getDb().ping();
      checks.database = 'ok';
    } catch (error) {
      ok = false;
      checks.database = error instanceof Error ? error.message : 'hata';
    }

    checks.storage = config.storage.driver;
    checks.push = config.push.driver;
    checks.googleSignIn = googleVerifier ? 'enabled' : 'disabled';
    checks.appleSignIn = appleVerifier ? 'enabled' : 'disabled';

    res.status(ok ? 200 : 503).json({ ok, checks, time: new Date().toISOString() });
  });

  // --- Moderasyon paneli (HTML) ---
  // JSON gövde ayrıştırıcısından önce bağlanır; kendi form ayrıştırıcısını kullanır.
  app.use('/admin', createAdminPanelRouter());

  // Yerel depo sürücüsünde yüklenen görselleri sunar (yalnızca geliştirme).
  if (config.storage.driver === 'local') {
    app.use('/media', createLocalMediaRouter());
  }

  const limiters = config.rateLimit.enabled
    ? {
        general: createLimiter(config.rateLimit.windowMs, config.rateLimit.max, 'general'),
        auth: createLimiter(config.rateLimit.authWindowMs, config.rateLimit.authMax, 'auth'),
        write: createLimiter(config.rateLimit.writeWindowMs, config.rateLimit.writeMax, 'write'),
      }
    : null;

  const noop: express.RequestHandler = (_req, _res, next) => next();
  const generalLimit = limiters?.general ?? noop;
  const authLimit = limiters?.auth ?? noop;
  const writeLimit = limiters?.write ?? noop;

  app.use('/api', generalLimit);

  /**
   * Görsel yükleme gövdesi JSON değil ham bayttır ve kendi boyut sınırını
   * kullanır; bu yüzden JSON ayrıştırıcısından önce bağlanır.
   */
  app.use('/api/media', writeLimit, mediaRouter);

  app.use(express.json({ limit: '1mb' }));

  // Kimlik uçları kaba kuvvet denemelerine karşı daha sıkı sınırlanır.
  app.use('/api/auth/login', authLimit);
  app.use('/api/auth/register', authLimit);
  app.use('/api/auth/google', authLimit);
  app.use('/api/auth/apple', authLimit);

  app.use('/api/auth', authRouter);
  app.use(
    '/api/auth/google',
    createSocialRouter(googleVerifier, 'google', config.googleClientIds.length)
  );
  app.use(
    '/api/auth/apple',
    createSocialRouter(appleVerifier, 'apple', config.appleClientIds.length)
  );

  app.use('/api/users', usersRouter);
  app.use('/api/dogs', dogsRouter);
  app.use('/api/discover', discoverRouter);
  app.use('/api/events', writeLimit, eventsRouter);
  app.use('/api/community', writeLimit, communityRouter);
  app.use('/api/messages', writeLimit, messagesRouter);
  app.use('/api/safety', writeLimit, safetyRouter);
  app.use('/api/walks', writeLimit, walksRouter);
  app.use('/api/journal', writeLimit, journalRouter);
  app.use('/api/neighbourhood', writeLimit, neighbourhoodRouter);
  app.use('/api/push', pushRouter);
  app.use('/api/legal', legalRouter);
  app.use('/api/admin', adminRouter);

  // Yasal metinlerin herkese açık web sürümü (mağaza formları için).
  app.use('/legal', legalRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Uç bulunamadı.' } });
  });

  app.use(errorHandler);
  return app;
}
