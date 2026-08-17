import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../../src/api';
import { AppText, Banner, Button, Checkbox, Field, Screen } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { colors, spacing, typography } from '../../src/theme';

/** Kayıt/giriş ekranı (2/14) — kayıt sekmesi. */
export default function SignUpScreen() {
  const router = useRouter();
  const { signIn } = useSession();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; consent?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'E-posta adresinizi girin.';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Geçerli bir e-posta adresi girin.';

    if (!password) next.password = 'Bir şifre belirleyin.';
    else if (password.length < 8) next.password = 'Şifre en az 8 karakter olmalı.';

    if (!acceptTerms || !acceptPrivacy) {
      next.consent = 'Devam etmek için her iki onayı da vermeniz gerekiyor.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit() {
    setFormError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await api.register({
        email: email.trim(),
        password,
        acceptTerms: true,
        acceptPrivacy: true,
      });
      await signIn(res.token, res.user);
      // Kayıt sonrası doğrudan profil oluşturmaya geçilir.
      router.replace('/(onboarding)/create-profile');
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Kayıt tamamlanamadı. Tekrar deneyin.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={{ paddingTop: insets.top + spacing.xl }}>
          <Text style={styles.logo}>🐾</Text>
          <AppText variant="display" color={colors.primary}>
            PatiMeet'e katıl
          </AppText>
          <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
            Yakınındaki köpekleri keşfet, yürüyüş buluşmaları düzenle.
          </AppText>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          {formError ? <Banner tone="error" message={formError} /> : null}

          <Field
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            placeholder="ornek@eposta.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
            required
          />

          <Field
            label="Şifre"
            value={password}
            onChangeText={setPassword}
            placeholder="En az 8 karakter"
            secureTextEntry
            autoCapitalize="none"
            error={errors.password}
            hint="En az 8 karakter kullanın."
            required
          />

          <View style={{ marginBottom: spacing.lg }}>
            <Checkbox checked={acceptTerms} onToggle={() => setAcceptTerms((v) => !v)}>
              <View style={styles.consentRow}>
                <AppText variant="caption" color={colors.textMuted}>
                  <Link href="/legal/terms">
                    <Text style={styles.link}>Kullanıcı Sözleşmesi</Text>
                  </Link>
                  'ni okudum ve onaylıyorum.
                </AppText>
              </View>
            </Checkbox>

            <Checkbox checked={acceptPrivacy} onToggle={() => setAcceptPrivacy((v) => !v)}>
              <View style={styles.consentRow}>
                <AppText variant="caption" color={colors.textMuted}>
                  <Link href="/legal/privacy">
                    <Text style={styles.link}>KVKK Aydınlatma Metni</Text>
                  </Link>
                  'ni okudum ve onaylıyorum.
                </AppText>
              </View>
            </Checkbox>

            {errors.consent ? (
              <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
                {errors.consent}
              </AppText>
            ) : null}
          </View>

          <Button label="Hesap oluştur" onPress={onSubmit} loading={loading} />

          <View style={styles.footer}>
            <AppText variant="body" color={colors.textMuted}>
              Zaten hesabın var mı?{' '}
            </AppText>
            <Link href="/(auth)/sign-in" replace>
              <Text style={[typography.bodyStrong, { color: colors.primary }]}>Giriş yap</Text>
            </Link>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logo: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  consentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  link: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
});
