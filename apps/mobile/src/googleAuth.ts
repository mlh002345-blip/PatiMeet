import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { api, ApiError, type CurrentUser } from './api';

/**
 * Google ile giriş.
 *
 * Akış:
 *   1. `expo-auth-session` Google'ın yetkilendirme sayfasını sistem tarayıcısında
 *      açar (iOS'ta ASWebAuthenticationSession, Android'de Chrome Custom Tabs).
 *      Bu, Google'ın WebView içinde oturum açmayı yasaklayan politikasına uygun
 *      olan yöntemdir.
 *   2. Google bir ID token döner.
 *   3. Token sunucuya gönderilir; sunucu imzayı Google'ın anahtarlarıyla
 *      doğrular. İstemciden gelen hiçbir kimlik bilgisine güvenilmez.
 */

// Tarayıcı oturumu kapandığında bekleyen isteğin tamamlanması için gerekli.
WebBrowser.maybeCompleteAuthSession();

interface GoogleConfig {
  iosClientId?: string;
  androidClientId?: string;
  webClientId?: string;
}

function readGoogleConfig(): GoogleConfig {
  const extra = (Constants.expoConfig?.extra as { google?: GoogleConfig } | undefined)?.google;

  // EXPO_PUBLIC_ değişkenleri derleme sırasında paketlenir; app.config.ts de
  // aynı değerleri `extra.google` altına koyar. İkisini de destekliyoruz.
  return {
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || extra?.iosClientId,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || extra?.androidClientId,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || extra?.webClientId,
  };
}

/**
 * Bu platformda Google ile girişin yapılandırılıp yapılandırılmadığı.
 * Eksik yapılandırmada buton hiç gösterilmez — kullanıcı çalışmayan bir
 * düğmeye basmasın.
 */
export function googleConfigStatus(): { configured: boolean; missingKey: string | null } {
  const config = readGoogleConfig();

  if (Platform.OS === 'ios') {
    return {
      configured: Boolean(config.iosClientId),
      missingKey: config.iosClientId ? null : 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
    };
  }
  if (Platform.OS === 'android') {
    return {
      configured: Boolean(config.androidClientId),
      missingKey: config.androidClientId ? null : 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
    };
  }
  // Web (yalnızca geliştirme önizlemesi için)
  return {
    configured: Boolean(config.webClientId),
    missingKey: config.webClientId ? null : 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  };
}

export type GoogleSignInOutcome =
  | {
      status: 'success';
      token: string;
      user: CurrentUser;
      isNewUser: boolean;
      linkedExistingAccount: boolean;
      passwordLoginDisabled: boolean;
    }
  /** Kullanıcı Google ekranını kapattı — hata gösterilmez. */
  | { status: 'cancel' }
  /** Yeni hesap için sözleşme onayı gerekiyor; aynı token ile tekrar denenir. */
  | { status: 'consent_required'; idToken: string }
  | { status: 'error'; message: string };

interface UseGoogleSignIn {
  /** Yapılandırma tamam ve istek hazır olduğunda true. */
  ready: boolean;
  configured: boolean;
  missingKey: string | null;
  inProgress: boolean;
  /** Google ekranını açar ve sunucu doğrulamasını tamamlar. */
  signIn: (consents?: { acceptTerms: boolean; acceptPrivacy: boolean }) => Promise<GoogleSignInOutcome>;
  /** Onay alındıktan sonra elde tutulan token ile tekrar dener. */
  completeWithConsent: (
    idToken: string,
    consents: { acceptTerms: boolean; acceptPrivacy: boolean }
  ) => Promise<GoogleSignInOutcome>;
}

export function useGoogleSignIn(): UseGoogleSignIn {
  const config = readGoogleConfig();
  const status = googleConfigStatus();
  const [inProgress, setInProgress] = useState(false);

  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: config.iosClientId,
    androidClientId: config.androidClientId,
    webClientId: config.webClientId,
    // Her girişte hesap seçtir; cihazda birden fazla Google hesabı olabilir.
    selectAccount: true,
  });

  // Yapılandırma eksikse hook isteği kuramaz; bunu erken fark edip
  // butonu gizliyoruz (aşağıdaki `ready`).
  useEffect(() => {
    if (!status.configured && __DEV__) {
      console.warn(
        `[patimeet] Google ile giriş kapalı: ${status.missingKey} tanımlı değil. ` +
          'apps/mobile/.env.example dosyasına bakın.'
      );
    }
  }, [status.configured, status.missingKey]);

  /** Sunucuya ID token gönderip oturumu tamamlar. */
  const exchange = useCallback(
    async (
      idToken: string,
      consents?: { acceptTerms: boolean; acceptPrivacy: boolean }
    ): Promise<GoogleSignInOutcome> => {
      try {
        const result = await api.googleSignIn({
          idToken,
          acceptTerms: consents?.acceptTerms,
          acceptPrivacy: consents?.acceptPrivacy,
        });
        return {
          status: 'success',
          token: result.token,
          user: result.user,
          isNewUser: result.isNewUser,
          linkedExistingAccount: result.linkedExistingAccount,
          passwordLoginDisabled: result.passwordLoginDisabled,
        };
      } catch (error) {
        if (error instanceof ApiError && error.code === 'consent_required') {
          return { status: 'consent_required', idToken };
        }
        return {
          status: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Google ile giriş tamamlanamadı. Tekrar deneyin.',
        };
      }
    },
    []
  );

  const signIn = useCallback(
    async (consents?: { acceptTerms: boolean; acceptPrivacy: boolean }) => {
      if (!status.configured) {
        return {
          status: 'error' as const,
          message: 'Google ile giriş bu sürümde yapılandırılmamış.',
        };
      }
      if (!request) {
        return {
          status: 'error' as const,
          message: 'Google ile giriş hazırlanıyor, bir saniye sonra tekrar deneyin.',
        };
      }

      setInProgress(true);
      try {
        const response = await promptAsync();

        // Kullanıcı vazgeçti: sessizce dön, hata gösterme.
        if (response.type === 'cancel' || response.type === 'dismiss') {
          return { status: 'cancel' as const };
        }
        if (response.type === 'locked') {
          return {
            status: 'error' as const,
            message: 'Başka bir giriş denemesi sürüyor. Lütfen bekleyin.',
          };
        }
        if (response.type === 'error') {
          return {
            status: 'error' as const,
            message:
              response.error?.message ?? 'Google ile giriş başarısız oldu. Tekrar deneyin.',
          };
        }
        if (response.type !== 'success') {
          return { status: 'error' as const, message: 'Google ile giriş tamamlanamadı.' };
        }

        const idToken = response.params?.id_token;
        if (!idToken) {
          return {
            status: 'error' as const,
            message: 'Google kimlik bilgisi alınamadı. Tekrar deneyin.',
          };
        }

        return await exchange(idToken, consents);
      } catch {
        return {
          status: 'error' as const,
          message: 'Google ile giriş sırasında beklenmeyen bir hata oluştu.',
        };
      } finally {
        setInProgress(false);
      }
    },
    [status.configured, request, promptAsync, exchange]
  );

  const completeWithConsent = useCallback(
    async (idToken: string, consents: { acceptTerms: boolean; acceptPrivacy: boolean }) => {
      setInProgress(true);
      try {
        return await exchange(idToken, consents);
      } finally {
        setInProgress(false);
      }
    },
    [exchange]
  );

  return {
    ready: status.configured && request !== null,
    configured: status.configured,
    missingKey: status.missingKey,
    inProgress,
    signIn,
    completeWithConsent,
  };
}
