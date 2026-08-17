import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';
import { ApiError, badRequest } from '../http';
import { SocialNotConfiguredError, type SocialIdentity, type SocialVerifier } from './social';

/**
 * Google ID token doğrulama.
 *
 * İstemci (mobil uygulama) Google ile oturum açtıktan sonra aldığı ID token'ı
 * buraya gönderir. Token'a asla güvenmeyiz: imzası Google'ın açık anahtarlarıyla
 * doğrulanır, `aud` bizim istemci kimliklerimizden biri olmalı ve `iss`
 * Google olmalıdır. Bu doğrulama olmadan herhangi biri istediği e-posta ile
 * oturum açabilirdi.
 */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/**
 * Gerçek doğrulayıcı. `google-auth-library` Google'ın imza sertifikalarını
 * çekip önbellekler ve süre/imza kontrollerini yapar.
 */
export class LiveGoogleVerifier implements SocialVerifier {
  readonly provider = 'google' as const;
  private readonly client: OAuth2Client;

  constructor(private readonly audiences: string[]) {
    if (audiences.length === 0) throw new SocialNotConfiguredError('google');
    this.client = new OAuth2Client();
  }

  async verify(idToken: string): Promise<SocialIdentity> {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        // Birden fazla istemci kimliği: iOS, Android ve Web ayrı kimlikler alır.
        audience: this.audiences,
      });
      payload = ticket.getPayload();
    } catch {
      // İmza, süre veya audience uyuşmazlığı — hepsi geçersiz token demektir.
      throw new ApiError(
        401,
        'invalid_google_token',
        'Google oturumu doğrulanamadı. Lütfen tekrar deneyin.'
      );
    }

    if (!payload) {
      throw new ApiError(401, 'invalid_google_token', 'Google oturumu doğrulanamadı.');
    }

    return normalizeGooglePayload(payload);
  }
}

/**
 * Doğrulanmış payload'ı iç modele çevirir ve iş kurallarını uygular.
 * Ayrı bir fonksiyon: testler bu kuralları doğrulayıcıdan bağımsız sınayabilir.
 */
export function normalizeGooglePayload(payload: {
  iss?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}): SocialIdentity {
  if (!payload.iss || !GOOGLE_ISSUERS.includes(payload.iss)) {
    throw new ApiError(401, 'invalid_google_token', 'Google oturumu doğrulanamadı.');
  }
  if (!payload.sub) {
    throw new ApiError(401, 'invalid_google_token', 'Google hesap kimliği alınamadı.');
  }
  if (!payload.email) {
    throw badRequest(
      'Google hesabınızda e-posta adresi bulunamadı. E-posta ile kayıt olabilirsiniz.',
      'google_email_missing'
    );
  }

  /**
   * Doğrulanmamış e-posta kabul edilmez. Aksi halde biri Google'da sahte bir
   * e-posta ile hesap açıp, o e-postaya ait mevcut PatiMeet hesabını ele
   * geçirebilirdi (hesap eşleştirme e-posta üzerinden yapılıyor).
   */
  if (payload.email_verified !== true) {
    throw new ApiError(
      403,
      'google_email_unverified',
      'Google hesabınızdaki e-posta adresi doğrulanmamış. Bu nedenle giriş yapılamadı.'
    );
  }

  return {
    provider: 'google',
    subject: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: true,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

/** Yapılandırılmış istemci kimlikleri. Boşsa Google ile giriş kapalıdır. */
export function googleAudiences(): string[] {
  return config.googleClientIds;
}

export function createGoogleVerifier(): SocialVerifier | null {
  const audiences = googleAudiences();
  if (audiences.length === 0) return null;
  return new LiveGoogleVerifier(audiences);
}
