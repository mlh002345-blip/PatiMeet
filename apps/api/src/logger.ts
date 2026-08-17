import pino from 'pino';
import { config } from './config';

/**
 * Yapılandırılmış günlükleme.
 *
 * Production'da JSON satırları basar; bulut sağlayıcıları (Fly, Render, Railway,
 * CloudWatch) bunu doğrudan ayrıştırır. Geliştirmede okunabilir tek satır.
 *
 * Kişisel veri günlüğe yazılmaz: e-posta, mesaj gövdesi ve token'lar redaksiyona
 * uğrar. Kullanıcı kimlikleri (UUID) tanılama için tutulur.
 */
export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-admin-token"]',
      'res.headers["set-cookie"]',
      'password',
      'idToken',
      'token',
      'email',
      'body',
    ],
    censor: '[gizlendi]',
  },
  transport: config.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});
