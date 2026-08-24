/**
 * Yayın altyapısı testleri (Öncelik 1).
 *
 *   npm run test:platform
 *
 * Kapsam: migration'lar, sağlık kontrolleri, görsel yükleme ve yetkilendirme,
 * Apple ile giriş, push bildirim altyapısı, moderasyon paneli ve hız sınırı.
 * Hiçbir dış servise çıkılmaz — depolama geçici dizine, bildirimler belleğe,
 * Apple doğrulayıcısı ise enjekte edilen sahte doğrulayıcıya yönlendirilir.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patimeet-platform-'));

/**
 * Varsayılan: gömülü PostgreSQL (bellekte) — sunucu gerekmez.
 * TEST_DATABASE_URL verilirse gerçek PostgreSQL'e bağlanır; böylece production
 * sürücüsü (`pg`) de aynı testlerle doğrulanabilir:
 *
 *   TEST_DATABASE_URL=postgresql://... npm test
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  delete process.env.DATABASE_URL;
  process.env.PGLITE_DATA_DIR = 'memory';
}
process.env.JWT_SECRET = 'platform-test-secret';
process.env.ADMIN_TOKEN = 'platform-admin-token';
process.env.ADMIN_SESSION_SECRET = 'platform-session-secret';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = uploadDir;
process.env.PUSH_DRIVER = 'none';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.MAX_UPLOAD_BYTES = String(1024 * 1024);

import type { SocialIdentity, SocialVerifier } from './domain/social';
import type { PushMessage, PushTicket } from './domain/push';

const { createApp } = require('./app') as typeof import('./app');
const { getDb, runMigrations, migrationIds } = require('./db') as typeof import('./db');
const pushDomain = require('./domain/push') as typeof import('./domain/push');
const appleDomain = require('./domain/apple') as typeof import('./domain/apple');
const mediaDomain = require('./domain/media') as typeof import('./domain/media');
const storageDomain = require('./storage') as typeof import('./storage');
const { createAdminUser } = require('./domain/moderation') as typeof import('./domain/moderation');
const { ApiError } = require('./http') as typeof import('./http');

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, extra?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
    if (extra !== undefined) console.error('    →', JSON.stringify(extra));
  }
}

const section = (title: string) => console.log(`\n${title}`);

/** Gönderilen bildirimleri yakalar; gerçek push servisine çıkılmaz. */
interface Captured {
  tokens: string[];
  message: PushMessage;
}
const sent: Captured[] = [];
/** Bu token'lar "cihaz kayıtlı değil" hatası döndürür (iptal senaryosu). */
const deadTokens = new Set<string>();

pushDomain.setPushSender({
  driver: 'expo',
  async send(tokens: string[], message: PushMessage): Promise<PushTicket[]> {
    sent.push({ tokens, message });
    return tokens.map((token) => ({
      token,
      ok: !deadTokens.has(token),
      shouldRevoke: deadTokens.has(token),
      error: deadTokens.has(token) ? 'DeviceNotRegistered' : undefined,
      receiptId: deadTokens.has(token) ? undefined : `receipt-${token}-${sent.length}`,
    }));
  },
});

/** Apple doğrulayıcısı taklidi. */
class FakeAppleVerifier implements SocialVerifier {
  readonly provider = 'apple' as const;
  identities = new Map<string, SocialIdentity>();
  invalid = new Set<string>();

  register(token: string, identity: SocialIdentity): void {
    this.identities.set(token, identity);
  }

  async verify(idToken: string): Promise<SocialIdentity> {
    if (this.invalid.has(idToken)) {
      throw new ApiError(401, 'invalid_apple_token', 'Apple oturumu doğrulanamadı.');
    }
    const identity = this.identities.get(idToken);
    if (!identity) {
      throw new ApiError(401, 'invalid_apple_token', 'Apple oturumu doğrulanamadı.');
    }
    return identity;
  }
}

// ---------------------------------------------------------------------------
// Test görselleri (gerçek dosya imzalarıyla)
// ---------------------------------------------------------------------------

function jpeg(sizeBytes = 512): Buffer {
  const buffer = Buffer.alloc(sizeBytes, 0x20);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  buffer[3] = 0xe0;
  return buffer;
}

function png(): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([header, Buffer.alloc(256, 0x11)]);
}

function webp(): Buffer {
  const buffer = Buffer.alloc(64, 0);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  return buffer;
}

async function main(): Promise<void> {
  // ---------------------------------------------------------------------
  section('1. Migration ve şema');

  const db = getDb();
  const first = await runMigrations(db);
  check(
    'Tüm migration\'lar uygulanır',
    first.applied.length === migrationIds.length,
    { uygulanan: first.applied.length, beklenen: migrationIds.length }
  );

  // İkinci çalıştırma hiçbir şey yapmamalı (idempotent).
  const second = await runMigrations(db);
  check(
    'Migration tekrar çalıştırılınca yeniden uygulanmaz',
    second.applied.length === 0 && second.alreadyApplied.length === migrationIds.length,
    second
  );

  const tables = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );
  const names = tables.map((t) => t.table_name);
  for (const expected of [
    'users',
    'dogs',
    'events',
    'event_participants',
    'conversations',
    'messages',
    'reports',
    'blocks',
    'media_objects',
    'push_tokens',
    'notification_preferences',
    'admin_users',
    'admin_audit_log',
    'schema_migrations',
  ]) {
    check(`Tablo var: ${expected}`, names.includes(expected), names);
  }

  // BIGINT sütunlar JS'e sayı olarak dönmeli (string değil).
  await db.exec(
    `INSERT INTO users (id, email, name, created_at, updated_at)
     VALUES ('bigint-test', 'bigint@test.com', 'Test', $1, $1)`,
    [1786967586372]
  );
  const bigintRow = await db.one<{ created_at: unknown }>(
    `SELECT created_at FROM users WHERE id = 'bigint-test'`
  );
  check(
    'BIGINT zaman damgası sayı olarak döner',
    typeof bigintRow?.created_at === 'number' && bigintRow.created_at === 1786967586372,
    { tip: typeof bigintRow?.created_at, deger: bigintRow?.created_at }
  );
  await db.exec(`DELETE FROM users WHERE id = 'bigint-test'`);

  // İşlem geri alma gerçekten çalışıyor mu?
  try {
    await db.tx(async (t) => {
      await t.exec(
        `INSERT INTO users (id, email, name, created_at, updated_at)
         VALUES ('rollback-test', 'rollback@test.com', 'Test', $1, $1)`,
        [Date.now()]
      );
      throw new Error('bilinçli hata');
    });
  } catch {
    // beklenen
  }
  const rolledBack = await db.one(`SELECT id FROM users WHERE id = 'rollback-test'`);
  check('İşlem hata durumunda geri alınır', rolledBack === undefined);

  // ---------------------------------------------------------------------
  section('2. Sunucu ve sağlık kontrolleri');

  const appleVerifier = new FakeAppleVerifier();
  const app = createApp({ googleVerifier: null, appleVerifier });
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('adres alınamadı');
  const base = `http://127.0.0.1:${address.port}`;

  interface Res<T = any> {
    status: number;
    body: T;
    headers: Headers;
  }

  async function req<T = any>(
    method: string,
    url: string,
    options: {
      token?: string;
      body?: unknown;
      adminToken?: string;
      raw?: Buffer;
      contentType?: string;
      cookie?: string;
      form?: Record<string, string>;
      redirect?: 'manual' | 'follow' | 'error';
    } = {}
  ): Promise<Res<T>> {
    const headers: Record<string, string> = {};
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.adminToken) headers['x-admin-token'] = options.adminToken;
    if (options.cookie) headers.cookie = options.cookie;

    let body: string | Uint8Array | undefined;
    if (options.raw) {
      headers['content-type'] = options.contentType ?? 'application/octet-stream';
      body = new Uint8Array(options.raw);
    } else if (options.form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(options.form).toString();
    } else if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const response = await fetch(`${base}${url}`, {
      method,
      headers,
      body,
      redirect: options.redirect ?? 'manual',
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed as T, headers: response.headers };
  }

  const health = await req('GET', '/health');
  check('/health 200 döner', health.status === 200 && health.body.ok === true, health.body);

  const ready = await req('GET', '/ready');
  check(
    '/ready veritabanını gerçekten kontrol eder',
    ready.status === 200 && ready.body.checks?.database === 'ok',
    ready.body
  );
  check(
    '/ready sağlayıcı ve altyapı durumunu bildirir',
    ready.body.checks?.appleSignIn === 'enabled' &&
      ready.body.checks?.googleSignIn === 'disabled' &&
      typeof ready.body.checks?.storage === 'string' &&
      ready.body.checks.storage.startsWith('local'),
    ready.body.checks
  );
  check(
    '/ready gerçekten depo erişimini kontrol eder (yalnız sürücü adını değil)',
    typeof ready.body.checks?.storage === 'string' && ready.body.checks.storage.includes('erişilebilir'),
    ready.body.checks?.storage
  );

  const securityHeaders = await req('GET', '/health');
  check(
    'Güvenlik başlıkları gönderilir',
    securityHeaders.headers.get('x-content-type-options') === 'nosniff' &&
      securityHeaders.headers.get('x-frame-options') === 'DENY',
    Object.fromEntries(securityHeaders.headers)
  );

  // ---------------------------------------------------------------------
  section('3. Apple ile giriş');

  const appleConfig = await req('GET', '/api/auth/apple/config');
  check('Apple yapılandırması açık', appleConfig.body.enabled === true);

  appleVerifier.register('apple-ada', {
    provider: 'apple',
    subject: 'apple-sub-ada',
    email: 'ada@privaterelay.appleid.com',
    emailVerified: true,
    name: null,
    isPrivateEmail: true,
  });

  const noConsent = await req('POST', '/api/auth/apple', { body: { idToken: 'apple-ada' } });
  check(
    'Yeni Apple hesabında onay zorunlu',
    noConsent.status === 409 && noConsent.body.error?.code === 'consent_required',
    noConsent.body
  );

  const appleSignup = await req('POST', '/api/auth/apple', {
    body: {
      idToken: 'apple-ada',
      acceptTerms: true,
      acceptPrivacy: true,
      fullName: 'Ada Yılmaz',
    },
  });
  check(
    'Apple ile yeni hesap açılır',
    appleSignup.status === 201 && appleSignup.body.isNewUser === true,
    appleSignup.body
  );
  check(
    'İstemciden gelen ad kaydedilir (Apple token\'da ad yok)',
    appleSignup.body.user?.name === 'Ada Yılmaz',
    appleSignup.body.user
  );
  check('Apple bağlantısı profilde görünür', appleSignup.body.user?.appleLinked === true);
  check(
    'Özel yönlendirme e-postası kabul edilir',
    appleSignup.body.user?.email === 'ada@privaterelay.appleid.com'
  );

  const adaToken = appleSignup.body.token as string;
  const adaId = appleSignup.body.user.id as string;

  const appleAgain = await req('POST', '/api/auth/apple', { body: { idToken: 'apple-ada' } });
  check(
    'Tekrar girişte aynı hesap kullanılır',
    appleAgain.status === 200 &&
      appleAgain.body.isNewUser === false &&
      appleAgain.body.user.id === adaId,
    appleAgain.body
  );

  /**
   * Apple tekrar girişlerde e-postayı token'a koymayabilir. Kimlik `sub`
   * üzerinden bulunmalı ve hesap korunmalı.
   */
  appleVerifier.register('apple-ada-noemail', {
    provider: 'apple',
    subject: 'apple-sub-ada',
    email: null,
    emailVerified: false,
    name: null,
  });
  const appleNoEmail = await req('POST', '/api/auth/apple', {
    body: { idToken: 'apple-ada-noemail' },
  });
  check(
    'E-posta olmadan da sub ile hesap bulunur',
    appleNoEmail.status === 200 && appleNoEmail.body.user.id === adaId,
    appleNoEmail.body
  );

  // Eşleşen hesap yok + e-posta yok → anlaşılır hata
  appleVerifier.register('apple-bilinmeyen', {
    provider: 'apple',
    subject: 'apple-sub-yeni',
    email: null,
    emailVerified: false,
    name: null,
  });
  const appleNoAccount = await req('POST', '/api/auth/apple', {
    body: { idToken: 'apple-bilinmeyen', acceptTerms: true, acceptPrivacy: true },
  });
  check(
    'E-posta alınamazsa yeni hesap açılmaz ve yol gösterilir',
    appleNoAccount.status === 409 && appleNoAccount.body.error?.code === 'social_email_missing',
    appleNoAccount.body
  );

  appleVerifier.invalid.add('apple-bozuk');
  const appleInvalid = await req('POST', '/api/auth/apple', { body: { idToken: 'apple-bozuk' } });
  check('Geçersiz Apple token 401 döner', appleInvalid.status === 401);

  // Payload normalizasyonu (ağ gerekmez)
  const applePayload = appleDomain.normalizeApplePayload({
    sub: 'sub-123',
    email: 'Kisi@Example.com',
    email_verified: 'true',
    is_private_email: 'false',
  } as never);
  check(
    'Apple payload: string "true" boolean sayılır',
    applePayload.emailVerified === true && applePayload.email === 'kisi@example.com',
    applePayload
  );

  const appleUnverified = appleDomain.normalizeApplePayload({
    sub: 'sub-456',
    email: 'dogrulanmamis@example.com',
    email_verified: false,
  } as never);
  check(
    'Doğrulanmamış e-posta hesap eşleştirmede kullanılmaz',
    appleUnverified.email === null,
    appleUnverified
  );

  try {
    appleDomain.normalizeApplePayload({ email: 'a@b.com' } as never);
    check('sub eksikse reddedilir', false);
  } catch (error) {
    check('sub eksikse reddedilir', error instanceof ApiError && error.status === 401);
  }

  // ---------------------------------------------------------------------
  section('4. Görsel yükleme ve yetkilendirme');

  // Profil tamamla (yükleme için hesap gerekiyor)
  await req('PATCH', '/api/users/me', {
    token: adaToken,
    body: { name: 'Ada', district: 'Kadıköy' },
  });

  const allowed = await req('GET', '/api/media/allowed-types');
  check(
    'İzin verilen türler listelenir',
    Array.isArray(allowed.body.contentTypes) && allowed.body.contentTypes.includes('image/jpeg'),
    allowed.body
  );
  check(
    'Normal amaçlarda PDF listelenmez',
    !allowed.body.contentTypes.includes('application/pdf'),
    allowed.body
  );

  const allowedDocument = await req('GET', '/api/media/allowed-types?purpose=document');
  check(
    'document amacında PDF de listelenir',
    Array.isArray(allowedDocument.body.contentTypes) &&
      allowedDocument.body.contentTypes.includes('application/pdf') &&
      allowedDocument.body.contentTypes.includes('image/jpeg'),
    allowedDocument.body
  );

  const noAuthUpload = await req('POST', '/api/media/user_photo', { raw: jpeg() });
  check('Yükleme oturum gerektirir', noAuthUpload.status === 401);

  const badPurpose = await req('POST', '/api/media/kotu_amac', {
    token: adaToken,
    raw: jpeg(),
  });
  check('Geçersiz yükleme türü reddedilir', badPurpose.status === 400, badPurpose.body);

  // Sahte içerik: content-type görsel diyor ama baytlar değil
  const fakeImage = await req('POST', '/api/media/user_photo', {
    token: adaToken,
    raw: Buffer.from('#!/bin/sh\necho ele-gecirildi\n'),
    contentType: 'image/jpeg',
  });
  check(
    'Görsel olmayan içerik content-type\'a rağmen reddedilir',
    fakeImage.status === 400 && fakeImage.body.error?.code === 'unsupported_file_type',
    fakeImage.body
  );

  const emptyUpload = await req('POST', '/api/media/user_photo', {
    token: adaToken,
    raw: Buffer.alloc(0),
  });
  check('Boş dosya reddedilir', emptyUpload.status === 400, emptyUpload.body);

  const tooLarge = await req('POST', '/api/media/user_photo', {
    token: adaToken,
    raw: jpeg(1024 * 1024 + 64),
  });
  check(
    'Boyut sınırı aşılırsa reddedilir',
    tooLarge.status === 400 && tooLarge.body.error?.code === 'file_too_large',
    tooLarge.body
  );

  const uploaded = await req('POST', '/api/media/user_photo', { token: adaToken, raw: jpeg() });
  check('JPEG yüklenir', uploaded.status === 201 && typeof uploaded.body.key === 'string', uploaded.body);
  check(
    'Anahtar tahmin edilemez ve doğru ön eke sahip',
    uploaded.body.key?.startsWith('media/user_photo/') && uploaded.body.key.length > 30,
    uploaded.body.key
  );

  const pngUpload = await req('POST', '/api/media/dog_photo', { token: adaToken, raw: png() });
  const webpUpload = await req('POST', '/api/media/dog_photo', { token: adaToken, raw: webp() });
  check('PNG ve WebP kabul edilir', pngUpload.status === 201 && webpUpload.status === 201);

  // Dosya gerçekten diske yazıldı mı?
  const onDisk = fs.existsSync(path.join(uploadDir, uploaded.body.key));
  check('Dosya depoya yazılır', onDisk, uploaded.body.key);

  // Profile bağlama
  const setPhoto = await req('PATCH', '/api/users/me', {
    token: adaToken,
    body: { photoUrl: uploaded.body.key },
  });
  check('Yüklenen görsel profile bağlanır', setPhoto.status === 200, setPhoto.body);
  check(
    'Profil görüntülenebilir adres döner',
    typeof setPhoto.body.user?.photoUrl === 'string' &&
      setPhoto.body.user.photoUrl.includes('/media/'),
    setPhoto.body.user?.photoUrl
  );

  // Rastgele adres yazma girişimi
  const externalUrl = await req('PATCH', '/api/users/me', {
    token: adaToken,
    body: { photoUrl: 'https://kotu-site.example/gorsel.jpg' },
  });
  check(
    'Dışarıdan adres yazılamaz',
    externalUrl.status === 400 && externalUrl.body.error?.code === 'photo_upload_required',
    externalUrl.body
  );

  // Başkasının görselini sahiplenme girişimi
  const other = await req('POST', '/api/auth/register', {
    body: {
      email: `medya${Date.now()}@test.com`,
      password: 'sifre12345',
      acceptTerms: true,
      acceptPrivacy: true,
    },
  });
  const otherToken = other.body.token as string;

  const stealAttempt = await req('PATCH', '/api/users/me', {
    token: otherToken,
    body: { photoUrl: uploaded.body.key },
  });
  check(
    'Başkasının görseli kullanılamaz',
    stealAttempt.status === 403,
    stealAttempt.body
  );

  const stealDelete = await req('DELETE', `/api/media/${uploaded.body.mediaId}`, {
    token: otherToken,
  });
  check('Başkasının görseli silinemez', stealDelete.status === 403, stealDelete.body);

  // Yerel sunumda dosya erişilebilir mi?
  const fetched = await req('GET', `/media/${uploaded.body.key}`);
  check('Yüklenen görsel sunulur', fetched.status === 200);

  // Silme
  const removed = await req('DELETE', `/api/media/${uploaded.body.mediaId}`, { token: adaToken });
  check('Sahibi görseli silebilir', removed.status === 200);
  check(
    'Dosya depodan kaldırılır',
    !fs.existsSync(path.join(uploadDir, uploaded.body.key))
  );

  const afterDelete = await req('GET', '/api/auth/me', { token: adaToken });
  check(
    'Silinen görsel profilden düşer',
    afterDelete.body.user?.photoUrl === null,
    afterDelete.body.user?.photoUrl
  );

  // Dizin dışına çıkma denemesi (depo katmanı seviyesinde)
  try {
    mediaDomain.validateImage(Buffer.from('not-an-image'), 1024);
    check('Doğrulama geçersiz içeriği reddeder', false);
  } catch (error) {
    check('Doğrulama geçersiz içeriği reddeder', error instanceof ApiError);
  }

  // ---------------------------------------------------------------------
  // Depo erişilemez olduğunda: sağlayıcıya özgü ayrıntı sızdırmadan anlamlı
  // hata kodu döner (bkz. domain/media.ts#toStorageApiError).
  {
    const realStorage = storageDomain.getStorage();

    // Bağlantı hatası → storage_unavailable (503)
    storageDomain.setStorage({
      driver: 's3',
      async put() {
        const err = new Error('connect ECONNREFUSED 10.0.0.1:443') as Error & { code: string };
        err.code = 'ECONNREFUSED';
        throw err;
      },
      async remove() {},
      async urlFor() {
        return 'https://example.invalid/x';
      },
      async exists() {
        return false;
      },
      async ping() {
        throw new Error('unreachable');
      },
    });

    const unreachable = await req('POST', '/api/media/user_photo', { token: adaToken, raw: jpeg() });
    check(
      'Depo erişilemezken storage_unavailable döner',
      unreachable.status === 503 && unreachable.body.error?.code === 'storage_unavailable',
      unreachable.body
    );
    check(
      'storage_unavailable mesajı sağlayıcı ayrıntısı içermez',
      !JSON.stringify(unreachable.body).includes('ECONNREFUSED') &&
        !JSON.stringify(unreachable.body).includes('10.0.0.1'),
      unreachable.body
    );

    const readyDown = await req('GET', '/ready');
    check(
      '/ready depo erişilemezken 503 döner',
      readyDown.status === 503 && readyDown.body.ok === false,
      readyDown.body
    );
    check(
      '/ready yanıtı sağlayıcı ayrıntısı sızdırmaz',
      !JSON.stringify(readyDown.body).includes('unreachable'),
      readyDown.body
    );

    // Bağlantı dışı bir hata (ör. yetkisiz/kova hatası) → upload_failed (502)
    storageDomain.setStorage({
      driver: 's3',
      async put() {
        const err = new Error('Access Denied') as Error & { name: string };
        err.name = 'AccessDenied';
        throw err;
      },
      async remove() {},
      async urlFor() {
        return 'https://example.invalid/x';
      },
      async exists() {
        return false;
      },
      async ping() {},
    });

    const denied = await req('POST', '/api/media/user_photo', { token: adaToken, raw: jpeg() });
    check(
      'Sağlayıcı isteği reddettiğinde upload_failed döner',
      denied.status === 502 && denied.body.error?.code === 'upload_failed',
      denied.body
    );

    storageDomain.setStorage(realStorage);
    const recovered = await req('GET', '/ready');
    check('Depo geri yüklenince /ready tekrar 200 döner', recovered.status === 200, recovered.body);
  }

  // ---------------------------------------------------------------------
  section('5. Push bildirim altyapısı');

  sent.length = 0;

  const tokenRegister = await req('POST', '/api/push/tokens', {
    token: adaToken,
    body: { token: 'ExponentPushToken[ada-iphone]', platform: 'ios' },
  });
  check('Cihaz token\'ı kaydedilir', tokenRegister.status === 201, tokenRegister.body);

  const badPlatform = await req('POST', '/api/push/tokens', {
    token: adaToken,
    body: { token: 'ExponentPushToken[x]', platform: 'windows' },
  });
  check('Geçersiz platform reddedilir', badPlatform.status === 400);

  // Aynı token tekrar → güncelleme, kopya kayıt olmamalı
  await req('POST', '/api/push/tokens', {
    token: adaToken,
    body: { token: 'ExponentPushToken[ada-iphone]', platform: 'ios' },
  });
  const tokenCount = await db.one<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM push_tokens WHERE token = 'ExponentPushToken[ada-iphone]'`
  );
  check('Token yenileme kopya kayıt oluşturmaz', tokenCount?.c === 1, tokenCount);

  const prefs = await req('GET', '/api/push/preferences', { token: adaToken });
  check(
    'Varsayılan tercihler açık',
    prefs.body.preferences?.messages === true && prefs.body.preferences?.events === true,
    prefs.body
  );

  // Mesaj bildirimi gerçekten gönderiliyor mu?
  await req('PATCH', '/api/users/me', {
    token: otherToken,
    body: { name: 'Bora', district: 'Kadıköy' },
  });
  await req('POST', '/api/dogs', {
    token: otherToken,
    body: { name: 'Kömür', size: 'orta', energy: 'dengeli', sociability: 'sosyal' },
  });

  // Bora'nın da cihazı olsun; etkinlik bildirimleri ona gidecek.
  await req('POST', '/api/push/tokens', {
    token: otherToken,
    body: { token: 'ExponentPushToken[bora-android]', platform: 'android' },
  });

  const convo = await req('POST', '/api/messages/conversations', {
    token: otherToken,
    body: { userId: adaId },
  });
  sent.length = 0;
  await req('POST', `/api/messages/conversations/${convo.body.conversation.id}/messages`, {
    token: otherToken,
    body: { body: 'Merhaba Ada, parkta buluşalım mı?' },
  });

  check(
    'Yeni mesajda alıcıya bildirim gider',
    sent.length === 1 && sent[0].tokens.includes('ExponentPushToken[ada-iphone]'),
    sent
  );
  check(
    'Bildirim gönderen adını ve mesajı taşır',
    sent[0]?.message.title === 'Bora' && sent[0]?.message.body.includes('parkta'),
    sent[0]?.message
  );
  check(
    'Bildirim derin bağlantı verisi taşır',
    sent[0]?.message.data?.type === 'chat' &&
      sent[0]?.message.data?.conversationId === convo.body.conversation.id,
    sent[0]?.message.data
  );
  check('Okunmamış sayacı bildirimde iletilir', sent[0]?.message.badge === 1, sent[0]?.message);

  // Tercih kapatılınca gönderilmemeli
  await req('PATCH', '/api/push/preferences', { token: adaToken, body: { messages: false } });
  sent.length = 0;
  await req('POST', `/api/messages/conversations/${convo.body.conversation.id}/messages`, {
    token: otherToken,
    body: { body: 'Bu mesajın bildirimi gitmemeli.' },
  });
  check('Tercih kapalıysa bildirim gönderilmez', sent.length === 0, sent);

  await req('PATCH', '/api/push/preferences', { token: adaToken, body: { messages: true } });

  // Güvenlik bildirimleri tercihten bağımsız gider
  await req('PATCH', '/api/push/preferences', {
    token: adaToken,
    body: { messages: false, events: false, safety: false },
  });
  sent.length = 0;
  await pushDomain.notifyUser(adaId, 'safety', { title: 'Güvenlik', body: 'Önemli bilgi.' });
  check('Güvenlik bildirimi tercihten bağımsız gönderilir', sent.length === 1, sent);

  await req('PATCH', '/api/push/preferences', {
    token: adaToken,
    body: { messages: true, events: true, safety: true },
  });

  // Etkinlik katılım bildirimi
  const adaEvent = await req('POST', '/api/events', {
    token: adaToken,
    body: {
      title: 'Bildirim testi yürüyüşü',
      type: 'yuruyus',
      startsAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
      district: 'Kadıköy',
      meetingPoint: 'Park girişi',
      capacity: 5,
    },
  });
  // Ada'nın köpeği yok; önce ekleyelim
  if (adaEvent.status !== 201) {
    await req('POST', '/api/dogs', {
      token: adaToken,
      body: { name: 'Bulut', size: 'orta', energy: 'dengeli', sociability: 'sosyal' },
    });
  }
  const adaEvent2 =
    adaEvent.status === 201
      ? adaEvent
      : await req('POST', '/api/events', {
          token: adaToken,
          body: {
            title: 'Bildirim testi yürüyüşü',
            type: 'yuruyus',
            startsAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
            district: 'Kadıköy',
            meetingPoint: 'Park girişi',
            capacity: 5,
          },
        });

  sent.length = 0;
  await req('POST', `/api/events/${adaEvent2.body.event.id}/join`, { token: otherToken });
  check(
    'Etkinliğe katılımda sahibine bildirim gider',
    sent.length === 1 && sent[0].message.data?.type === 'event',
    sent
  );

  // İptalde katılımcıya bildirim
  sent.length = 0;
  await req('POST', `/api/events/${adaEvent2.body.event.id}/cancel`, { token: adaToken });
  check(
    'Etkinlik iptalinde katılımcıya bildirim gider',
    sent.length === 1 && sent[0].message.title.includes('iptal'),
    sent
  );

  // Geçersiz token iptal edilmeli
  deadTokens.add('ExponentPushToken[ada-iphone]');
  sent.length = 0;
  await pushDomain.notifyUser(adaId, 'safety', { title: 'Test', body: 'Token iptal testi' });
  const revoked = await db.one<{ status: string }>(
    `SELECT status FROM push_tokens WHERE token = 'ExponentPushToken[ada-iphone]'`
  );
  check(
    'Cihaz kayıtlı değilse token iptal edilir',
    revoked?.status === 'revoked',
    revoked
  );
  deadTokens.delete('ExponentPushToken[ada-iphone]');

  // İptal edilmiş token'a gönderim yapılmaz
  sent.length = 0;
  const result = await pushDomain.notifyUser(adaId, 'safety', { title: 'X', body: 'Y' });
  check(
    'İptal edilmiş token\'a gönderim denenmez',
    sent.length === 0 && result.skipped === 'no_device',
    result
  );

  // ---------------------------------------------------------------------
  // Bildirim tekilleştirme (dedupeKey): işlemi yeniden tetikleyen bir
  // isteğin (ör. istemci PATCH'i iki kez gönderirse) ikinci kez bildirim
  // üretmemesi gerekir.
  await req('POST', '/api/push/tokens', {
    token: adaToken,
    body: { token: 'ExponentPushToken[ada-dedupe]', platform: 'ios' },
  });

  sent.length = 0;
  const firstSend = await pushDomain.notifyUser(
    adaId,
    'safety',
    { title: 'Aynı olay', body: 'İlk gönderim' },
    db,
    'test-dedupe-key-1'
  );
  const secondSend = await pushDomain.notifyUser(
    adaId,
    'safety',
    { title: 'Aynı olay', body: 'İkinci deneme (aynı anahtar)' },
    db,
    'test-dedupe-key-1'
  );
  check('Tekilleştirme anahtarıyla ilk gönderim başarılı', firstSend.sent === 1, firstSend);
  check(
    'Aynı anahtarla ikinci gönderim atlanır',
    secondSend.sent === 0 && secondSend.skipped === 'duplicate',
    secondSend
  );
  check('Tekilleştirmede yalnızca tek bildirim iletilir', sent.length === 1, sent.length);

  const thirdSend = await pushDomain.notifyUser(
    adaId,
    'safety',
    { title: 'Farklı olay', body: 'Farklı anahtar' },
    db,
    'test-dedupe-key-2'
  );
  check('Farklı anahtarla gönderim engellenmez', thirdSend.sent === 1, thirdSend);

  // Aynı olay: bir etkinlik güncellemesi PATCH'i istemci tarafından tekrar
  // gönderilirse (retry) katılımcıya iki kez bildirim gitmemeli.
  await req('POST', '/api/push/tokens', {
    token: otherToken,
    body: { token: 'ExponentPushToken[bora-retry]', platform: 'android' },
  });
  const retryEvent = await req('POST', '/api/events', {
    token: adaToken,
    body: {
      title: 'Tekrar denenen güncelleme testi',
      type: 'yuruyus',
      startsAt: Date.now() + 5 * 24 * 60 * 60 * 1000,
      district: 'Kadıköy',
      meetingPoint: 'Park girişi',
      capacity: 5,
    },
  });
  await req('POST', `/api/events/${retryEvent.body.event.id}/join`, { token: otherToken });

  sent.length = 0;
  const patchBody = { meetingPoint: 'Yeni buluşma noktası' };
  await req('PATCH', `/api/events/${retryEvent.body.event.id}`, { token: adaToken, body: patchBody });
  await req('PATCH', `/api/events/${retryEvent.body.event.id}`, { token: adaToken, body: patchBody });
  check(
    'Aynı güncellemenin tekrar gönderimi katılımcıya iki kez bildirim üretmez',
    sent.length === 1,
    sent.length
  );

  // ---------------------------------------------------------------------
  // Push receipt uzlaştırması: gönderim anında "ok" dönen bir bilet, receipt
  // aşamasında "DeviceNotRegistered" çıkarsa token kalıcı olarak iptal
  // edilmeli. Gerçek Expo servisine çıkmadan `fetch`'i geçici olarak sahteler.
  sent.length = 0;
  await pushDomain.notifyUser(adaId, 'safety', { title: 'Receipt testi', body: 'Gövde' });
  const pendingReceipt = await db.one<{ receipt_id: string; token: string }>(
    `SELECT receipt_id, token FROM push_receipts WHERE token = 'ExponentPushToken[ada-dedupe]'
      ORDER BY created_at DESC LIMIT 1`
  );
  check('Gönderim sonrası bekleyen receipt kaydedilir', Boolean(pendingReceipt), pendingReceipt);

  const originalFetch = global.fetch;
  global.fetch = (async (url: string | URL, init?: RequestInit) => {
    const href = typeof url === 'string' ? url : url.toString();
    if (href.includes('/getReceipts')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { ids: string[] };
      const data: Record<string, { status: string; details?: { error?: string } }> = {};
      for (const id of body.ids) {
        data[id] = { status: 'error', details: { error: 'DeviceNotRegistered' } };
      }
      return new Response(JSON.stringify({ data }), { status: 200 });
    }
    return originalFetch(url as never, init);
  }) as typeof fetch;

  const reconciled = await pushDomain.reconcilePushReceipts(db);
  global.fetch = originalFetch;

  check('Receipt uzlaştırması bekleyen kayıtları işler', reconciled.checked >= 1, reconciled);
  check('DeviceNotRegistered receipt sonucu token\'ı iptal eder', reconciled.revoked >= 1, reconciled);
  const revokedAfterReceipt = await db.one<{ status: string }>(
    `SELECT status FROM push_tokens WHERE token = 'ExponentPushToken[ada-dedupe]'`
  );
  check(
    'İptal edilen token veritabanında görünür',
    revokedAfterReceipt?.status === 'revoked',
    revokedAfterReceipt
  );
  const receiptsCleared = await db.one<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM push_receipts WHERE token = 'ExponentPushToken[ada-dedupe]'`
  );
  check('İşlenen receipt kaydı temizlenir', receiptsCleared?.c === 0, receiptsCleared);

  // Token silme
  await req('POST', '/api/push/tokens', {
    token: adaToken,
    body: { token: 'ExponentPushToken[ada-yeni]', platform: 'android' },
  });
  const unregister = await req('DELETE', '/api/push/tokens', {
    token: adaToken,
    body: { token: 'ExponentPushToken[ada-yeni]' },
  });
  check('Token silinebilir (oturum kapatma / izin reddi)', unregister.status === 200);
  const gone = await db.one(
    `SELECT id FROM push_tokens WHERE token = 'ExponentPushToken[ada-yeni]'`
  );
  check('Silinen token veritabanından kalkar', gone === undefined);

  // Cihaz başka hesaba geçerse sahibi güncellenir
  await req('POST', '/api/push/tokens', {
    token: adaToken,
    body: { token: 'ExponentPushToken[ortak-cihaz]', platform: 'ios' },
  });
  await req('POST', '/api/push/tokens', {
    token: otherToken,
    body: { token: 'ExponentPushToken[ortak-cihaz]', platform: 'ios' },
  });
  const owner = await db.one<{ user_id: string }>(
    `SELECT user_id FROM push_tokens WHERE token = 'ExponentPushToken[ortak-cihaz]'`
  );
  check(
    'Ortak cihazda token yeni sahibe geçer',
    owner?.user_id !== adaId,
    owner
  );

  // ---------------------------------------------------------------------
  section('6. Moderasyon paneli');

  const loginPage = await req('GET', '/admin/login');
  check('Giriş sayfası açılır', loginPage.status === 200 && String(loginPage.body).includes('Moderasyon'));

  const guarded = await req('GET', '/admin');
  check(
    'Oturumsuz panel girişe yönlendirir',
    guarded.status === 302 && guarded.headers.get('location') === '/admin/login',
    { status: guarded.status, location: guarded.headers.get('location') }
  );

  await createAdminUser('moderator@patimeet.app', 'PanelSifre123', 'Moderatör', db);

  const badLogin = await req('POST', '/admin/login', {
    form: { email: 'moderator@patimeet.app', password: 'yanlis' },
  });
  check(
    'Hatalı şifre girişi reddedilir',
    badLogin.status === 302 && badLogin.headers.get('location') === '/admin/login?error=1',
    badLogin.headers.get('location')
  );

  const goodLogin = await req('POST', '/admin/login', {
    form: { email: 'moderator@patimeet.app', password: 'PanelSifre123' },
  });
  const setCookie = goodLogin.headers.get('set-cookie') ?? '';
  check(
    'Doğru bilgiyle giriş yapılır ve çerez verilir',
    goodLogin.status === 302 && setCookie.includes('patimeet_admin='),
    { status: goodLogin.status, setCookie }
  );
  check('Oturum çerezi HttpOnly ve SameSite korumalı', setCookie.includes('HttpOnly') && setCookie.includes('SameSite=Lax'));

  const cookie = setCookie.split(';')[0];

  const dashboard = await req('GET', '/admin', { cookie });
  check('Özet sayfası açılır', dashboard.status === 200 && String(dashboard.body).includes('Özet'));

  // İmzası bozulmuş çerez kabul edilmemeli
  const tampered = await req('GET', '/admin', {
    cookie: 'patimeet_admin=baska-kullanici.9999999999999.gecersizimza',
  });
  check(
    'İmzası geçersiz çerez reddedilir',
    tampered.status === 302,
    tampered.status
  );

  // Şikâyet oluştur ve panelden işle
  await req('POST', '/api/safety/reports', {
    token: otherToken,
    body: { targetType: 'user', targetId: adaId, reason: 'spam', details: 'Panel testi' },
  });

  const reportsPage = await req('GET', '/admin/reports', { cookie });
  const reportsHtml = String(reportsPage.body);
  check(
    'Şikâyet listesi panelde görünür',
    reportsPage.status === 200 && reportsHtml.includes('Panel testi'),
    reportsHtml.slice(0, 200)
  );

  const usersPage = await req('GET', '/admin/users?q=Ada', { cookie });
  check(
    'Kullanıcı arama çalışır',
    usersPage.status === 200 && String(usersPage.body).includes('Ada'),
  );

  const eventsPage = await req('GET', '/admin/events', { cookie });
  check('Etkinlik listesi açılır', eventsPage.status === 200);

  // Panelden kullanıcıyı pasife al
  const suspend = await req('POST', `/admin/users/${adaId}/status`, {
    cookie,
    form: { status: 'suspended', note: 'Panel testi' },
  });
  check('Panelden kullanıcı pasife alınır', suspend.status === 302);

  const suspendedAccess = await req('GET', '/api/auth/me', { token: adaToken });
  check('Pasife alınan kullanıcı API kullanamaz', suspendedAccess.status === 403);

  const auditPage = await req('GET', '/admin/audit', { cookie });
  check(
    'İşlem kaydı yapılan değişikliği gösterir',
    auditPage.status === 200 &&
      String(auditPage.body).includes('user_suspended') &&
      String(auditPage.body).includes('Moderatör'),
  );

  // XSS: kullanıcı adı HTML olarak çalıştırılmamalı
  const xssUser = await req('POST', '/api/auth/register', {
    body: {
      email: `xss${Date.now()}@test.com`,
      password: 'sifre12345',
      acceptTerms: true,
      acceptPrivacy: true,
    },
  });
  await req('PATCH', '/api/users/me', {
    token: xssUser.body.token,
    body: { name: '<script>alert(1)</script>', district: 'Kadıköy' },
  });
  const xssPage = await req('GET', '/admin/users?q=script', { cookie });
  const xssHtml = String(xssPage.body);
  check(
    'Panelde kullanıcı verisi kaçırılır (XSS yok)',
    !xssHtml.includes('<script>alert(1)</script>') && xssHtml.includes('&lt;script&gt;'),
    xssHtml.includes('<script>alert(1)</script>') ? 'ham script bulundu' : 'ok'
  );

  // Geri alma
  await req('POST', `/admin/users/${adaId}/status`, {
    cookie,
    form: { status: 'active', note: 'Test bitti' },
  });
  const restored = await req('GET', '/api/auth/me', { token: adaToken });
  check('Panelden hesap yeniden aktife alınır', restored.status === 200);

  const logout = await req('POST', '/admin/logout', { cookie });
  check('Çıkış çerezi temizler', (logout.headers.get('set-cookie') ?? '').includes('Max-Age=0'));

  // ---------------------------------------------------------------------
  section('7. Moderasyon API (x-admin-token)');

  const apiStats = await req('GET', '/api/admin/stats', { adminToken: 'platform-admin-token' });
  check('API istatistik döner', apiStats.status === 200 && typeof apiStats.body.users === 'number');
  check('Cihaz sayısı raporlanır', typeof apiStats.body.devices === 'number', apiStats.body);

  const apiAudit = await req('GET', '/api/admin/audit', { adminToken: 'platform-admin-token' });
  check('API denetim kaydı döner', apiAudit.status === 200 && Array.isArray(apiAudit.body.entries));

  const wrongToken = await req('GET', '/api/admin/stats', { adminToken: 'yanlis' });
  check('Yanlış anahtar reddedilir', wrongToken.status === 403);

  // ---------------------------------------------------------------------
  section('8. Yasal metinler ve mağaza gereklilikleri');

  const privacyHtml = await req('GET', '/legal/privacy.html');
  check(
    'Gizlilik politikası herkese açık HTML olarak sunulur',
    privacyHtml.status === 200 && String(privacyHtml.body).includes('<html'),
  );
  check(
    'Gizlilik metni konum ve fotoğraf işleyişini açıklar',
    String(privacyHtml.body).includes('Tam konumunuz') &&
      String(privacyHtml.body).includes('obje depolama'),
  );

  const dataExport = await req('GET', '/api/auth/my-data', { token: adaToken });
  check(
    'Kullanıcı kendi verisini indirebilir (KVKK erişim)',
    dataExport.status === 200 && dataExport.body.user?.id === adaId,
    dataExport.body?.user
  );

  // Hesap silme: görseller de gitmeli
  const finalUpload = await req('POST', '/api/media/user_photo', { token: adaToken, raw: jpeg() });
  const finalKey = finalUpload.body.key as string;
  check('Silme öncesi görsel yüklendi', fs.existsSync(path.join(uploadDir, finalKey)));

  const deleteAccount = await req('POST', '/api/auth/delete-account', {
    token: adaToken,
    body: { confirm: true },
  });
  check('Hesap silinir', deleteAccount.status === 200);
  check(
    'Hesap silmede yüklenen görseller depodan kaldırılır',
    !fs.existsSync(path.join(uploadDir, finalKey)),
    finalKey
  );

  const deletedRow = await db.one<{ email: string; name: string; apple_id: string | null }>(
    'SELECT email, name, apple_id FROM users WHERE id = $1',
    [adaId]
  );
  check(
    'Kişisel alanlar temizlenir',
    deletedRow?.name === 'Silinmiş kullanıcı' &&
      deletedRow?.apple_id === null &&
      deletedRow?.email.includes('@patimeet.invalid'),
    deletedRow
  );

  const deletedTokens = await db.one<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM push_tokens WHERE user_id = $1',
    [adaId]
  );
  check('Silinen hesabın cihaz token\'ları kaldırılır', deletedTokens?.c === 0, deletedTokens);

  // ---------------------------------------------------------------------
  section('9. Hız sınırı');

  // Bu app hız sınırı kapalı; ayrı bir app açıp sınırı doğruluyoruz.
  process.env.RATE_LIMIT_ENABLED = 'true';
  process.env.RATE_LIMIT_AUTH_MAX = '3';
  process.env.RATE_LIMIT_AUTH_WINDOW_MS = '60000';

  // config modülü bir kez okunduğu için taze bir süreç yerine config'i
  // doğrudan değiştiriyoruz.
  const { config } = require('./config') as typeof import('./config');
  config.rateLimit.enabled = true;
  config.rateLimit.authMax = 3;

  const limitedApp = createApp({ googleVerifier: null, appleVerifier: null });
  const limitedServer = limitedApp.listen(0);
  await new Promise<void>((r) => limitedServer.once('listening', () => r()));
  const limitedAddress = limitedServer.address();
  if (!limitedAddress || typeof limitedAddress === 'string') throw new Error('adres alınamadı');
  const limitedBase = `http://127.0.0.1:${limitedAddress.port}`;

  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) {
    const response = await fetch(`${limitedBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'yok@test.com', password: 'yanlissifre' }),
    });
    statuses.push(response.status);
  }
  check(
    'Kimlik ucunda kaba kuvvet denemesi sınırlanır',
    statuses.filter((s) => s === 429).length >= 2,
    statuses
  );

  const limitedBody = await fetch(`${limitedBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'yok@test.com', password: 'x' }),
  }).then((r) => r.json() as Promise<{ error?: { code?: string } }>);
  check(
    'Sınır aşımında anlaşılır hata döner',
    limitedBody.error?.code === 'rate_limited',
    limitedBody
  );

  limitedServer.close();
  config.rateLimit.enabled = false;

  // ---------------------------------------------------------------------
  server.close();
  await db.close();
  fs.rmSync(uploadDir, { recursive: true, force: true });

  console.log(`\n${'='.repeat(56)}`);
  console.log(`Toplam: ${passed + failed}  |  Geçen: ${passed}  |  Başarısız: ${failed}`);
  console.log('='.repeat(56));

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Platform testleri çöktü:', error);
  process.exit(1);
});
