import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppleSignIn } from '../appleAuth';
import { useSession } from '../session';
import { colors, radius, spacing, typography } from '../theme';
import { ConsentSheet } from './ConsentSheet';

/**
 * "Apple ile devam et" düğmesi.
 *
 * Apple'ın marka kılavuzu düğmenin siyah/beyaz zeminde,  simgesiyle ve
 * "Apple ile devam et" metniyle gösterilmesini ister. Kılavuza uygun kalırken
 * uygulamanın yuvarlak köşe diline uyum sağlıyoruz.
 *
 * Tüm durumlar ele alınır:
 *   - cihaz/sunucu desteklemiyor → düğme hiç gösterilmez
 *   - yükleniyor                  → düğme üzerinde gösterge
 *   - iptal                       → sessizce döner
 *   - hata                        → çağıran ekranda satır içi bildirim
 *   - yeni hesap                  → sözleşme onayı alt paneli
 */
export function AppleSignInButton({
  /** Onay kutuları zaten işaretlenmişse (kayıt ekranı) buradan geçilir. */
  presetConsents,
  onError,
}: {
  presetConsents?: { acceptTerms: boolean; acceptPrivacy: boolean };
  onError?: (message: string | null) => void;
}) {
  const router = useRouter();
  const { signIn: startSession } = useSession();
  const apple = useAppleSignIn();

  const [consent, setConsent] = useState<{ idToken: string; fullName?: string } | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Desteklenmiyorsa düğmeyi göstermiyoruz; çalışmayan düğme kullanıcıyı yanıltır.
  if (!apple.available) return null;

  async function handleOutcome(
    outcome: Awaited<ReturnType<typeof apple.signIn>>
  ): Promise<void> {
    if (outcome.status === 'cancel') {
      onError?.(null);
      return;
    }

    if (outcome.status === 'error') {
      onError?.(outcome.message);
      return;
    }

    if (outcome.status === 'consent_required') {
      setConsent({ idToken: outcome.idToken, fullName: outcome.fullName });
      setAcceptTerms(false);
      setAcceptPrivacy(false);
      setConsentError(null);
      return;
    }

    onError?.(null);
    await startSession(outcome.token, outcome.user);

    /**
     * Mevcut bir e-posta hesabı bu Apple hesabına bağlandıysa ve güvenlik
     * gereği şifre girişi kapatıldıysa kullanıcıya söylüyoruz.
     */
    if (outcome.linkedExistingAccount && outcome.passwordLoginDisabled) {
      Alert.alert(
        'Hesabınız Apple ile bağlandı',
        'Bu e-posta adresiyle daha önce açılmış hesabınız Apple hesabınıza bağlandı. ' +
          'Güvenliğiniz için şifre ile giriş kapatıldı; bundan sonra "Apple ile devam et" ile giriş yapın.'
      );
    }

    // Yönlendirme tek yerden: açılış ekranı profil durumuna göre karar verir.
    router.replace('/');
  }

  async function onPress() {
    setWorking(true);
    try {
      const outcome = await apple.signIn(presetConsents);
      await handleOutcome(outcome);
    } finally {
      setWorking(false);
    }
  }

  async function submitConsent() {
    if (!consent) return;

    if (!acceptTerms || !acceptPrivacy) {
      setConsentError('Devam etmek için her iki onayı da vermeniz gerekiyor.');
      return;
    }

    setConsentError(null);
    setWorking(true);
    try {
      const outcome = await apple.completeWithConsent(
        consent.idToken,
        { acceptTerms: true, acceptPrivacy: true },
        consent.fullName
      );

      if (outcome.status === 'error') {
        setConsentError(outcome.message);
        return;
      }
      if (outcome.status === 'consent_required') {
        setConsentError('Onaylar kaydedilemedi. Tekrar deneyin.');
        return;
      }

      setConsent(null);
      await handleOutcome(outcome);
    } finally {
      setWorking(false);
    }
  }

  const busy = working || apple.inProgress;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Apple ile devam et"
        accessibilityState={{ disabled: busy, busy }}
        onPress={onPress}
        disabled={busy}
        style={({ pressed }) => [
          styles.button,
          busy && { opacity: 0.6 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.mark}></Text>
        <Text style={styles.label}>
          {busy ? 'Apple ile bağlanılıyor…' : 'Apple ile devam et'}
        </Text>
      </Pressable>

      <ConsentSheet
        visible={consent !== null}
        onClose={() => setConsent(null)}
        providerLabel="Apple"
        acceptTerms={acceptTerms}
        acceptPrivacy={acceptPrivacy}
        onToggleTerms={() => setAcceptTerms((v) => !v)}
        onTogglePrivacy={() => setAcceptPrivacy((v) => !v)}
        error={consentError}
        busy={busy}
        onSubmit={submitConsent}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: radius.md,
    // Apple marka kılavuzu: siyah zemin üzerine beyaz simge ve metin.
    backgroundColor: '#000000',
    paddingHorizontal: spacing.lg,
    alignSelf: 'stretch',
  },
  mark: {
    color: '#FFFFFF',
    fontSize: 19,
    // Apple simgesi optik olarak biraz yukarıda durur; hizayı düzeltiyoruz.
    marginTop: -2,
  },
  label: {
    ...typography.bodyStrong,
    color: '#FFFFFF',
    marginLeft: spacing.md,
  },
});

/** Ekranlarda kullanılan boşluk ölçüsünü paylaşmak için. */
export const appleButtonSpacing = spacing.md;
