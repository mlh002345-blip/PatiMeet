import * as AppleAuthentication from 'expo-apple-authentication';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { api, ApiError, type CurrentUser } from './api';

/**
 * Apple ile Giriş.
 *
 * Apple, App Store'da başka bir üçüncü taraf girişi (Google) sunan
 * uygulamalardan Apple ile Giriş'i de sunmasını ister; bu yüzden iOS gönderimi
 * için zorunludur.
 *
 * Akış tamamen yerel bileşenle yürür (tarayıcı açılmaz): sistem iletişim
 * kutusu bir `identityToken` döner, sunucu bu token'ın imzasını Apple'ın
 * anahtarlarıyla doğrular. Token'a istemcide güvenilmez.
 */
export type AppleSignInOutcome =
  | {
      status: 'success';
      token: string;
      user: CurrentUser;
      isNewUser: boolean;
      linkedExistingAccount: boolean;
      passwordLoginDisabled: boolean;
    }
  | { status: 'cancel' }
  /** Yeni hesap: sözleşme onayı gerekiyor, aynı token ile tamamlanacak. */
  | { status: 'consent_required'; idToken: string; fullName?: string }
  | { status: 'error'; message: string };

interface UseAppleSignIn {
  /** Cihaz ve sunucu Apple ile girişi destekliyor mu? */
  available: boolean;
  inProgress: boolean;
  signIn: (presetConsents?: {
    acceptTerms: boolean;
    acceptPrivacy: boolean;
  }) => Promise<AppleSignInOutcome>;
  completeWithConsent: (
    idToken: string,
    consents: { acceptTerms: true; acceptPrivacy: true },
    fullName?: string
  ) => Promise<AppleSignInOutcome>;
}

/**
 * Apple ile girişin kullanılabilirliği.
 *
 * Üç koşul birlikte sağlanmalı:
 *   - platform iOS (Apple bileşeni yalnızca orada var)
 *   - cihaz destekliyor (iOS 13+)
 *   - sunucuda yapılandırma var (APPLE_BUNDLE_ID)
 */
export function useAppleAvailability(): { available: boolean; checked: boolean } {
  const [available, setAvailable] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (Platform.OS !== 'ios') {
          if (!cancelled) setAvailable(false);
          return;
        }

        const [deviceSupports, serverConfig] = await Promise.all([
          AppleAuthentication.isAvailableAsync(),
          api.appleConfig().catch(() => ({ enabled: false, configuredClientCount: 0 })),
        ]);

        if (!cancelled) setAvailable(deviceSupports && serverConfig.enabled);
      } catch {
        if (!cancelled) setAvailable(false);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { available, checked };
}

/** Apple'ın verdiği ad parçalarını tek bir görünen ada çevirir. */
function formatFullName(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null
): string | undefined {
  if (!fullName) return undefined;
  const parts = [fullName.givenName, fullName.familyName].filter(Boolean);
  const joined = parts.join(' ').trim();
  return joined.length > 0 ? joined : undefined;
}

export function useAppleSignIn(): UseAppleSignIn {
  const { available } = useAppleAvailability();
  const [inProgress, setInProgress] = useState(false);

  const exchange = useCallback(
    async (
      idToken: string,
      consents: { acceptTerms?: boolean; acceptPrivacy?: boolean },
      fullName?: string
    ): Promise<AppleSignInOutcome> => {
      try {
        const result = await api.appleSignIn({
          idToken,
          fullName,
          acceptTerms: consents.acceptTerms,
          acceptPrivacy: consents.acceptPrivacy,
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
          return { status: 'consent_required', idToken, fullName };
        }
        return {
          status: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Apple ile giriş tamamlanamadı. Tekrar deneyin.',
        };
      }
    },
    []
  );

  const signIn = useCallback(
    async (presetConsents?: {
      acceptTerms: boolean;
      acceptPrivacy: boolean;
    }): Promise<AppleSignInOutcome> => {
      if (!available) {
        return { status: 'error', message: 'Apple ile giriş bu cihazda kullanılamıyor.' };
      }

      setInProgress(true);
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });

        if (!credential.identityToken) {
          return {
            status: 'error',
            message: 'Apple kimlik bilgisi alınamadı. Tekrar deneyin.',
          };
        }

        /**
         * Ad yalnızca ilk yetkilendirmede gelir. Sonraki girişlerde `null`
         * olur; o durumda sunucudaki kayıtlı ad kullanılır.
         */
        const fullName = formatFullName(credential.fullName);

        return exchange(credential.identityToken, presetConsents ?? {}, fullName);
      } catch (error) {
        // Kullanıcı iletişim kutusunu kapattı — hata gösterilmez.
        const code = (error as { code?: string }).code;
        if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
          return { status: 'cancel' };
        }
        return {
          status: 'error',
          message: 'Apple ile giriş tamamlanamadı. Tekrar deneyin.',
        };
      } finally {
        setInProgress(false);
      }
    },
    [available, exchange]
  );

  const completeWithConsent = useCallback(
    (idToken: string, consents: { acceptTerms: true; acceptPrivacy: true }, fullName?: string) =>
      exchange(idToken, consents, fullName),
    [exchange]
  );

  return { available, inProgress, signIn, completeWithConsent };
}
