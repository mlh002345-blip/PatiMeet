import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';
import { ApiError, badRequest } from '../http';

/**
 * Google ID token doğrulama.
 *
 * İstemci (mobil uygulama) Google ile oturum açtıktan sonra aldığı ID token'ı
 * buraya gönderir. Token'a asla güvenmeyiz: imzası Google'ın açık anahtarlarıyla
 * doğrulanır, `aud` bizim istemci kimliklerimizden biri olmalı ve `iss`
 * Google olmalıdır. Bu doğrulama olmadan herhangi biri istediği e-posta ile
 * oturum açabilirdi.
 */
export interface GoogleIdentity {
  /** Google'ın kalıcı kullanıcı kimliği (`sub`). E-posta değişse bile sabit. */
  googleId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export interface GoogleVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
}

/** Yapılandırma eksikse istemciye anlaşılır bir mesaj dönmek için. */
export class GoogleNotConfiguredError extends ApiError {
  constructor() {
    super(
      503,
      'google_not_configured',
      'Google ile giriş bu sunucuda yapılandırılmamış. Lütfen e-posta ile giriş yapın.'
    );
  }
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/**
 * Gerçek doğrulayıcı. `google-auth-library` Google'ın imza sertifikalarını
 * çekip önbellekler ve süre/imza kontrollerini yapar.
 */
export class LiveGoogleVerifier implements GoogleVerifier {
  private readonly client: OAuth2Client;

  constructor(private readonly audiences: string[]) {
    if (audiences.length === 0) throw new GoogleNotConfiguredError();
    this.client = new OAuth2Client();
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        // Birden fazla istemci kimliği: iOS, Android ve Web ayrı kimlikler alır.
        audience: this.audiences,
      });
      payload = ticket.getPayload();
    } catch (error) {
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
}): GoogleIdentity {
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
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: true,
    name: payload.name,
    picture: payload.picture,
  };
}

/** Yapılandırılmış istemci kimlikleri. Boşsa Google ile giriş kapalıdır. */
export function googleAudiences(): string[] {
  return config.googleClientIds;
}

export function createGoogleVerifier(): GoogleVerifier | null {
  const audiences = googleAudiences();
  if (audiences.length === 0) return null;
  return new LiveGoogleVerifier(audiences);
}
