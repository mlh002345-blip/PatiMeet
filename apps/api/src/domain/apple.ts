import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../config';
import { ApiError } from '../http';
import { SocialNotConfiguredError, type SocialIdentity, type SocialVerifier } from './social';

/**
 * Apple ile Giriş — kimlik token doğrulama.
 *
 * iOS uygulaması `expo-apple-authentication` ile oturum açar ve aldığı
 * `identityToken`'ı buraya gönderir. Token'a asla güvenmeyiz:
 *   - imzası Apple'ın açık anahtarlarıyla (JWKS) doğrulanır
 *   - `iss` https://appleid.apple.com olmalı
 *   - `aud` uygulamanın bundle identifier'ı olmalı
 *   - süresi geçmemiş olmalı
 *
 * Apple, App Store'da üçüncü taraf girişi (Google gibi) sunan uygulamalardan
 * Apple ile Giriş'i de sunmasını ister; bu yüzden iOS gönderimi için zorunludur.
 */
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');

export class LiveAppleVerifier implements SocialVerifier {
  readonly provider = 'apple' as const;

  /**
   * JWKS uzaktan çekilir ve kütüphane tarafından önbelleklenir; Apple anahtar
   * döndürdüğünde otomatik yenilenir.
   */
  private readonly jwks = createRemoteJWKSet(APPLE_JWKS_URL, {
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  });

  constructor(private readonly audiences: string[]) {
    if (audiences.length === 0) throw new SocialNotConfiguredError('apple');
  }

  async verify(idToken: string): Promise<SocialIdentity> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(idToken, this.jwks, {
        issuer: APPLE_ISSUER,
        audience: this.audiences,
      });
      payload = result.payload;
    } catch {
      // İmza, süre veya audience uyuşmazlığı — hepsi geçersiz token demektir.
      throw new ApiError(
        401,
        'invalid_apple_token',
        'Apple oturumu doğrulanamadı. Lütfen tekrar deneyin.'
      );
    }

    return normalizeApplePayload(payload);
  }
}

/**
 * Doğrulanmış payload'ı iç modele çevirir.
 *
 * Ayrı bir fonksiyon: testler bu kuralları ağ erişimi olmadan sınayabilir.
 */
export function normalizeApplePayload(payload: JWTPayload): SocialIdentity {
  if (!payload.sub) {
    throw new ApiError(401, 'invalid_apple_token', 'Apple hesap kimliği alınamadı.');
  }

  const rawEmail = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;

  /**
   * Apple bu alanları bazen string ("true"), bazen boolean olarak gönderir.
   * İkisini de kabul ediyoruz.
   */
  const asBool = (value: unknown): boolean => value === true || value === 'true';

  const emailVerified = asBool(payload.email_verified);
  const isPrivateEmail = asBool(payload.is_private_email);

  /**
   * Doğrulanmamış e-posta ile hesap eşleştirmesi yapmıyoruz: e-posta üzerinden
   * mevcut hesaba bağlanma imkânı olduğu için, doğrulanmamış adres hesap ele
   * geçirmeye açık kapı bırakırdı. Böyle bir durumda e-postayı yok sayıp
   * yalnızca Apple kimliğiyle eşleştiriyoruz.
   *
   * Not: Apple'ın özel yönlendirme adresleri (`@privaterelay.appleid.com`)
   * her zaman doğrulanmış gelir ve geçerli birer adrestir.
   */
  const email = rawEmail && emailVerified ? rawEmail : null;

  return {
    provider: 'apple',
    subject: payload.sub,
    email,
    emailVerified,
    // Apple adı token'da göndermez; istemci ilk yetkilendirmede ayrıca iletir.
    name: null,
    picture: null,
    isPrivateEmail,
  };
}

/** Yapılandırılmış istemci kimlikleri. Boşsa Apple ile giriş kapalıdır. */
export function appleAudiences(): string[] {
  return config.appleClientIds;
}

export function createAppleVerifier(): SocialVerifier | null {
  const audiences = appleAudiences();
  if (audiences.length === 0) return null;
  return new LiveAppleVerifier(audiences);
}
