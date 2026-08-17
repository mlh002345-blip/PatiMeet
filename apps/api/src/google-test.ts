/**
 * Google ile giriş testleri.
 *
 *   npm run test:google
 *
 * Doğrulayıcı enjekte edilir: gerçek Google servisine çıkmadan tüm hesap
 * eşleştirme ve güvenlik kuralları sınanır. Ayrıca token payload kurallarını
 * (`normalizeGooglePayload`) doğrudan test ediyoruz — imza doğrulaması
 * google-auth-library'nin sorumluluğunda, iş kuralları bizim.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDb = path.join(os.tmpdir(), `patimeet-google-${Date.now()}.sqlite`);
process.env.DB_FILE = tmpDb;
process.env.JWT_SECRET = 'google-test-secret';
process.env.ADMIN_TOKEN = 'google-test-admin';

import type { GoogleIdentity, GoogleVerifier } from './domain/google';

const { createApp } = require('./app') as typeof import('./app');
const googleDomain = require('./domain/google') as typeof import('./domain/google');
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

/** Testlerin kontrol ettiği sahte doğrulayıcı. */
class FakeVerifier implements GoogleVerifier {
  identities = new Map<string, GoogleIdentity>();
  /** Bu token'lar geçersiz sayılır (imza/süre hatası taklidi). */
  invalid = new Set<string>();

  register(token: string, identity: GoogleIdentity): void {
    this.identities.set(token, identity);
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (this.invalid.has(idToken)) {
      throw new ApiError(401, 'invalid_google_token', 'Google oturumu doğrulanamadı.');
    }
    const identity = this.identities.get(idToken);
    if (!identity) {
      throw new ApiError(401, 'invalid_google_token', 'Google oturumu doğrulanamadı.');
    }
    return identity;
  }
}

async function main(): Promise<void> {
  // ---------------------------------------------------------------------
  // 1. Token payload kuralları (saf fonksiyon, ağ gerektirmez)
  // ---------------------------------------------------------------------
  section('1. Google token payload kuralları');

  const validPayload = {
    iss: 'https://accounts.google.com',
    sub: '1234567890',
    email: 'Kullanici@Gmail.com',
    email_verified: true,
    name: 'Deniz Yılmaz',
    picture: 'https://lh3.googleusercontent.com/foto',
  };

  const normalized = googleDomain.normalizeGooglePayload(validPayload);
  check('Geçerli payload kabul edilir', normalized.googleId === '1234567890');
  check('E-posta küçük harfe çevrilir', normalized.email === 'kullanici@gmail.com', normalized.email);
  check('Ad ve fotoğraf taşınır', normalized.name === 'Deniz Yılmaz' && Boolean(normalized.picture));

  function expectReject(label: string, payload: Record<string, unknown>, code: string): void {
    try {
      googleDomain.normalizeGooglePayload(payload as never);
      check(label, false, 'hata beklenirken kabul edildi');
    } catch (error) {
      const actual = error instanceof ApiError ? error.code : 'bilinmeyen';
      check(label, actual === code, { beklenen: code, gelen: actual });
    }
  }

  expectReject(
    'Doğrulanmamış e-posta reddedilir',
    { ...validPayload, email_verified: false },
    'google_email_unverified'
  );
  expectReject(
    'email_verified eksikse reddedilir',
    { ...validPayload, email_verified: undefined },
    'google_email_unverified'
  );
  expectReject(
    'Yanlış issuer reddedilir',
    { ...validPayload, iss: 'https://kotu-site.example' },
    'invalid_google_token'
  );
  expectReject('sub eksikse reddedilir', { ...validPayload, sub: undefined }, 'invalid_google_token');
  expectReject(
    'E-posta yoksa reddedilir',
    { ...validPayload, email: undefined },
    'google_email_missing'
  );
  check(
    'accounts.google.com (şemasız) issuer kabul edilir',
    googleDomain.normalizeGooglePayload({ ...validPayload, iss: 'accounts.google.com' }).googleId ===
      '1234567890'
  );

  // ---------------------------------------------------------------------
  // 2. Yapılandırma eksik
  // ---------------------------------------------------------------------
  section('2. Yapılandırma eksik durumu');

  const disabledApp = createApp({ googleVerifier: null });
  const disabledServer = disabledApp.listen(0);
  await new Promise<void>((r) => disabledServer.once('listening', () => r()));
  const disabledAddress = disabledServer.address();
  if (!disabledAddress || typeof disabledAddress === 'string') throw new Error('adres alınamadı');
  const disabledBase = `http://127.0.0.1:${disabledAddress.port}`;

  const disabledConfig = (await fetch(`${disabledBase}/api/auth/google/config`).then((r) =>
    r.json()
  )) as { enabled: boolean };
  check('Yapılandırma yoksa enabled=false', disabledConfig.enabled === false, disabledConfig);

  const disabledAttempt = await fetch(`${disabledBase}/api/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: 'herhangi' }),
  });
  const disabledBody = (await disabledAttempt.json()) as { error: { code: string } };
  check(
    'Yapılandırma yoksa 503 ve anlaşılır mesaj',
    disabledAttempt.status === 503 && disabledBody.error.code === 'google_not_configured',
    disabledBody
  );

  disabledServer.close();

  // ---------------------------------------------------------------------
  // 3. Hesap akışları
  // ---------------------------------------------------------------------
  const verifier = new FakeVerifier();
  const app = createApp({ googleVerifier: verifier });
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('adres alınamadı');
  const base = `http://127.0.0.1:${address.port}`;

  async function req(
    method: string,
    url: string,
    options: { body?: unknown; token?: string; adminToken?: string } = {}
  ) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.adminToken) headers['x-admin-token'] = options.adminToken;
    const response = await fetch(`${base}${url}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  section('3. Yeni kullanıcı Google ile kayıt');

  const enabledConfig = await req('GET', '/api/auth/google/config');
  check('Yapılandırma varsa enabled=true', enabledConfig.body.enabled === true);

  verifier.register('token-deniz', {
    googleId: 'google-deniz',
    email: 'deniz@gmail.com',
    emailVerified: true,
    name: 'Deniz',
    picture: 'https://example.com/deniz.jpg',
  });

  const noConsent = await req('POST', '/api/auth/google', { body: { idToken: 'token-deniz' } });
  check(
    'Onay olmadan yeni hesap açılmaz (409 consent_required)',
    noConsent.status === 409 && noConsent.body.error.code === 'consent_required',
    noConsent.body
  );

  const created = await req('POST', '/api/auth/google', {
    body: { idToken: 'token-deniz', acceptTerms: true, acceptPrivacy: true },
  });
  check('Onayla yeni hesap oluşturulur (201)', created.status === 201, created.body);
  check('isNewUser=true döner', created.body.isNewUser === true);
  check('Token döner', typeof created.body.token === 'string' && created.body.token.length > 20);
  check('Google adı profile taşınır', created.body.user.name === 'Deniz', created.body.user);
  check('Google fotoğrafı taşınır', Boolean(created.body.user.photoUrl));
  check('googleLinked=true', created.body.user.googleLinked === true);
  check('Şifresi yok', created.body.user.hasPassword === false);
  check(
    'Onboarding gerekiyor (semt ve köpek yok)',
    created.body.user.profileComplete === false && created.body.user.hasDog === false,
    created.body.user
  );
  check(
    'Sözleşme onayları kaydedildi',
    created.body.user.termsAcceptedAt !== null && created.body.user.privacyAcceptedAt !== null
  );

  const denizToken = created.body.token as string;

  section('4. Mevcut Google kullanıcısı tekrar giriş');

  const again = await req('POST', '/api/auth/google', { body: { idToken: 'token-deniz' } });
  check('İkinci girişte 200 döner', again.status === 200, again.body);
  check('isNewUser=false', again.body.isNewUser === false);
  check('Aynı hesap kullanılır', again.body.user.id === created.body.user.id);
  check('Onay tekrar istenmez', again.body.error === undefined);

  // Onboarding tamamlanınca ana sayfaya yönlendirme sinyali
  await req('PATCH', '/api/users/me', {
    token: denizToken,
    body: { name: 'Deniz', district: 'Kadıköy' },
  });
  await req('POST', '/api/dogs', {
    token: denizToken,
    body: { name: 'Bulut', size: 'orta', energy: 'enerjik', sociability: 'sosyal' },
  });

  const complete = await req('POST', '/api/auth/google', { body: { idToken: 'token-deniz' } });
  check(
    'Profili tamam kullanıcı ana sayfaya yönlendirilir (profileComplete=true)',
    complete.body.user.profileComplete === true && complete.body.user.hasDog === true,
    complete.body.user
  );

  section('5. E-posta çakışması ve hesap eşleştirme');

  // Şifre ile açılmış, e-postası doğrulanmamış hesap.
  const emailAccount = await req('POST', '/api/auth/register', {
    body: {
      email: 'ortak@gmail.com',
      password: 'eskisifre123',
      acceptTerms: true,
      acceptPrivacy: true,
    },
  });
  check('Şifreli hesap oluşturuldu', emailAccount.status === 201, emailAccount.body);
  const emailAccountId = emailAccount.body.user.id;

  await req('PATCH', '/api/users/me', {
    token: emailAccount.body.token,
    body: { name: 'Ortak Kullanıcı', district: 'Beşiktaş' },
  });

  verifier.register('token-ortak', {
    googleId: 'google-ortak',
    email: 'ortak@gmail.com',
    emailVerified: true,
    name: 'Ortak Google',
  });

  const linked = await req('POST', '/api/auth/google', { body: { idToken: 'token-ortak' } });
  check('Aynı e-posta mevcut hesaba bağlanır', linked.status === 200, linked.body);
  check('Yeni hesap açılmaz', linked.body.user.id === emailAccountId, {
    beklenen: emailAccountId,
    gelen: linked.body.user.id,
  });
  check('linkedExistingAccount=true', linked.body.linkedExistingAccount === true);
  check('Mevcut ad korunur (Google adı ezmez)', linked.body.user.name === 'Ortak Kullanıcı');
  check('Semt korunur', linked.body.user.district === 'Beşiktaş');
  check('googleLinked=true', linked.body.user.googleLinked === true);

  // Güvenlik: doğrulanmamış e-posta ile açılmış şifre girişi kapatılır.
  check('Şifre girişi kapatıldı (passwordLoginDisabled)', linked.body.passwordLoginDisabled === true);
  check('Hesapta şifre kalmadı', linked.body.user.hasPassword === false);

  const oldPasswordLogin = await req('POST', '/api/auth/login', {
    body: { email: 'ortak@gmail.com', password: 'eskisifre123' },
  });
  check(
    'Eski şifre ile giriş artık çalışmaz',
    oldPasswordLogin.status === 401,
    oldPasswordLogin.body
  );
  check(
    'Kullanıcıya Google ile girmesi söylenir',
    String(oldPasswordLogin.body.error.message).includes('Google'),
    oldPasswordLogin.body.error.message
  );

  const relink = await req('POST', '/api/auth/google', { body: { idToken: 'token-ortak' } });
  check('Bağlı hesapla tekrar giriş çalışır', relink.status === 200 && relink.body.user.id === emailAccountId);
  check('İkinci girişte linkedExistingAccount=false', relink.body.linkedExistingAccount === false);

  section('6. Google tarafında e-posta değişimi');

  verifier.register('token-deniz-yeni-eposta', {
    googleId: 'google-deniz',
    email: 'deniz.yeni@gmail.com',
    emailVerified: true,
    name: 'Deniz',
  });

  const emailChanged = await req('POST', '/api/auth/google', {
    body: { idToken: 'token-deniz-yeni-eposta' },
  });
  check('E-posta değişse de aynı hesap kullanılır', emailChanged.body.user.id === created.body.user.id);
  check('Yeni e-posta kaydedilir', emailChanged.body.user.email === 'deniz.yeni@gmail.com', emailChanged.body.user.email);

  // Yeni e-posta başkasına aitse hesabın e-postası değiştirilmez.
  verifier.register('token-deniz-cakisan', {
    googleId: 'google-deniz',
    email: 'ortak@gmail.com',
    emailVerified: true,
    name: 'Deniz',
  });
  const collision = await req('POST', '/api/auth/google', { body: { idToken: 'token-deniz-cakisan' } });
  check(
    'Başkasına ait e-postaya geçiş engellenir',
    collision.body.user.email === 'deniz.yeni@gmail.com',
    collision.body.user.email
  );
  check('Hesap yine doğru kullanıcıdır', collision.body.user.id === created.body.user.id);

  section('7. Geçersiz ve kötü niyetli istekler');

  verifier.invalid.add('bozuk-token');
  const invalidToken = await req('POST', '/api/auth/google', { body: { idToken: 'bozuk-token' } });
  check(
    'Geçersiz token 401 döner',
    invalidToken.status === 401 && invalidToken.body.error.code === 'invalid_google_token',
    invalidToken.body
  );

  const unknownToken = await req('POST', '/api/auth/google', { body: { idToken: 'hic-bilinmeyen' } });
  check('Bilinmeyen token 401 döner', unknownToken.status === 401);

  const emptyToken = await req('POST', '/api/auth/google', { body: { idToken: '' } });
  check('Boş token 400 döner', emptyToken.status === 400, emptyToken.body);

  const noBody = await req('POST', '/api/auth/google', { body: {} });
  check('idToken eksikse 400 döner', noBody.status === 400);

  // Eski güvensiz uç kaldırıldı mı? (imza doğrulamadan hesap açıyordu)
  const oldSocial = await req('POST', '/api/auth/social', {
    body: { provider: 'google', providerId: 'x', email: 'kurban@gmail.com', name: 'Saldırgan' },
  });
  check(
    'Doğrulamasız /auth/social ucu kaldırıldı',
    oldSocial.status === 404,
    { status: oldSocial.status, body: oldSocial.body }
  );

  section('8. Pasife alınmış hesap');

  await req('PATCH', `/api/admin/users/${emailAccountId}`, {
    adminToken: 'google-test-admin',
    body: { status: 'suspended' },
  });

  const suspended = await req('POST', '/api/auth/google', { body: { idToken: 'token-ortak' } });
  check('Pasif hesap Google ile giriş yapamaz', suspended.status === 401, suspended.body);

  section('9. Hesap silme sonrası');

  const deleted = await req('POST', '/api/auth/delete-account', {
    token: denizToken,
    body: { confirm: true },
  });
  check('Hesap silindi', deleted.status === 200);

  const deletedGoogle = await req('POST', '/api/auth/google', { body: { idToken: 'token-deniz' } });
  check('Silinen hesap Google ile giriş yapamaz', deletedGoogle.status === 401, deletedGoogle.body);

  server.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${tmpDb}${suffix}`, { force: true });

  console.log(`\n${'='.repeat(52)}`);
  console.log(`Toplam: ${passed + failed}  |  Geçen: ${passed}  |  Başarısız: ${failed}`);
  console.log('='.repeat(52));

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Google testleri çöktü:', error);
  process.exit(1);
});
