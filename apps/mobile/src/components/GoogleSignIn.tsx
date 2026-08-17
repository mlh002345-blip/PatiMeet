import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { googleConfigStatus, useGoogleSignIn } from '../googleAuth';
import { useSession } from '../session';
import { colors, radius, spacing, typography } from '../theme';
import { AppText } from './ui';
import { ConsentSheet } from './ConsentSheet';
import { AppleSignInButton } from './AppleSignIn';
import { useAppleAvailability } from '../appleAuth';

/**
 * "Google ile devam et" düğmesi.
 *
 * Tüm durumları kendi içinde yönetir:
 *   - yapılandırma eksik → düğme hiç gösterilmez
 *   - yükleniyor         → düğme üzerinde göstergeler
 *   - iptal              → sessizce döner, hata gösterilmez
 *   - hata               → çağıran ekranda satır içi bildirim
 *   - yeni hesap         → sözleşme onayı alt paneli açılır
 *
 * Tasarım dili: beyaz yuvarlatılmış kart yüzeyi, koyu lila metin, krem
 * arka planla uyumlu ince kenarlık.
 */
export function GoogleSignInButton({
  /** Onay kutuları zaten işaretlenmişse (kayıt ekranı) buradan geçilir. */
  presetConsents,
  onError,
}: {
  presetConsents?: { acceptTerms: boolean; acceptPrivacy: boolean };
  onError?: (message: string | null) => void;
}) {
  const router = useRouter();
  const { signIn: startSession } = useSession();
  const google = useGoogleSignIn();

  const [consentToken, setConsentToken] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Yapılandırma yoksa düğmeyi göstermiyoruz; çalışmayan bir düğme
  // kullanıcıyı yanıltır. Geliştirmede konsola uyarı düşer.
  if (!google.configured) return null;

  async function handleOutcome(
    outcome: Awaited<ReturnType<typeof google.signIn>>
  ): Promise<void> {
    if (outcome.status === 'cancel') {
      // Kullanıcı vazgeçti — sessiz.
      onError?.(null);
      return;
    }

    if (outcome.status === 'error') {
      onError?.(outcome.message);
      return;
    }

    if (outcome.status === 'consent_required') {
      // Yeni hesap: sözleşme ve KVKK onayı al, sonra aynı token ile tamamla.
      setConsentToken(outcome.idToken);
      setAcceptTerms(false);
      setAcceptPrivacy(false);
      setConsentError(null);
      return;
    }

    onError?.(null);
    await startSession(outcome.token, outcome.user);

    /**
     * Mevcut bir e-posta hesabı bu Google hesabına bağlandıysa ve güvenlik
     * gereği şifre girişi kapatıldıysa kullanıcıya söylüyoruz — bir daha
     * şifresiyle giremeyeceğini bilmesi gerekiyor.
     */
    if (outcome.linkedExistingAccount && outcome.passwordLoginDisabled) {
      Alert.alert(
        'Hesabınız Google ile bağlandı',
        'Bu e-posta adresiyle daha önce açılmış hesabınız Google hesabınıza bağlandı. ' +
          'Güvenliğiniz için şifre ile giriş kapatıldı; bundan sonra "Google ile devam et" ile giriş yapın.'
      );
    }

    // Yönlendirmeyi tek bir yere bırakıyoruz: açılış ekranı, profil durumuna
    // göre yeni kullanıcıyı onboarding'e, mevcut kullanıcıyı ana sayfaya alır.
    router.replace('/');
  }

  async function onPress() {
    setWorking(true);
    try {
      const outcome = await google.signIn(presetConsents);
      await handleOutcome(outcome);
    } finally {
      setWorking(false);
    }
  }

  async function submitConsent() {
    if (!consentToken) return;

    if (!acceptTerms || !acceptPrivacy) {
      setConsentError('Devam etmek için her iki onayı da vermeniz gerekiyor.');
      return;
    }

    setConsentError(null);
    setWorking(true);
    try {
      const outcome = await google.completeWithConsent(consentToken, {
        acceptTerms: true,
        acceptPrivacy: true,
      });

      if (outcome.status === 'error') {
        setConsentError(outcome.message);
        return;
      }
      if (outcome.status === 'consent_required') {
        setConsentError('Onaylar kaydedilemedi. Tekrar deneyin.');
        return;
      }

      setConsentToken(null);
      await handleOutcome(outcome);
    } finally {
      setWorking(false);
    }
  }

  const busy = working || google.inProgress;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Google ile devam et"
        accessibilityState={{ disabled: busy || !google.ready, busy }}
        onPress={onPress}
        disabled={busy || !google.ready}
        style={({ pressed }) => [
          styles.button,
          (busy || !google.ready) && { opacity: 0.6 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <GoogleMark />
        <Text style={styles.buttonLabel}>
          {busy ? 'Google ile bağlanılıyor…' : 'Google ile devam et'}
        </Text>
      </Pressable>

      <ConsentSheet
        visible={consentToken !== null}
        onClose={() => setConsentToken(null)}
        providerLabel="Google"
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

/**
 * Google işareti.
 *
 * NOT: Mağaza gönderimi öncesi Google'ın marka kılavuzuna uygun resmî "G"
 * varlığı (assets/google-logo.png) eklenip burada kullanılmalıdır. Uzak
 * görsel yüklemediğimiz için şimdilik harf tabanlı bir yer tutucu var.
 */
function GoogleMark() {
  return (
    <View style={styles.mark}>
      <Text style={styles.markText}>G</Text>
    </View>
  );
}

/** Giriş ekranlarında e-posta formu ile Google düğmesini ayıran çizgi. */
function AuthDivider({ label = 'veya' }: { label?: string }) {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <AppText variant="caption" color={colors.textSubtle} style={{ marginHorizontal: spacing.md }}>
        {label}
      </AppText>
      <View style={styles.dividerLine} />
    </View>
  );
}

/**
 * Ayırıcı çizgi + sağlayıcı düğmeleri.
 *
 * Hiçbir sağlayıcı kullanılabilir değilse bölüm tamamen gizlenir; aksi halde
 * ekranda anlamsız bir "veya" çizgisi kalırdı.
 *
 * Sıra bilinçli: Apple, iOS'ta kendi platformunun beklediği yerde en üstte.
 */
export function SocialAuthSection(props: {
  presetConsents?: { acceptTerms: boolean; acceptPrivacy: boolean };
  onError?: (message: string | null) => void;
}) {
  const google = googleConfigStatus();
  const apple = useAppleAvailability();

  if (!google.configured && !apple.available) return null;

  return (
    <>
      <AuthDivider />
      {apple.available ? (
        <View style={{ marginBottom: google.configured ? spacing.md : 0 }}>
          <AppleSignInButton {...props} />
        </View>
      ) : null}
      {google.configured ? <GoogleSignInButton {...props} /> : null}
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
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg,
    alignSelf: 'stretch',
  },
  buttonLabel: {
    ...typography.bodyStrong,
    color: colors.text,
    marginLeft: spacing.md,
  },
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4285F4',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  link: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
