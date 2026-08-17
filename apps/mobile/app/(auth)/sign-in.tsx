import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../../src/api';
import { GoogleAuthSection } from '../../src/components/GoogleSignIn';
import { AppText, Banner, Button, Field, Screen } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { colors, spacing, typography } from '../../src/theme';

/** Kayıt/giriş ekranı (2/14) — giriş sekmesi. */
export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useSession();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'E-posta adresinizi girin.';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Geçerli bir e-posta adresi girin.';
    if (!password) next.password = 'Şifrenizi girin.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit() {
    setFormError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await api.login({ email: email.trim(), password });
      await signIn(res.token, res.user);
      router.replace('/');
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Giriş yapılamadı. Tekrar deneyin.'
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
        <View style={{ paddingTop: insets.top + spacing.xxl }}>
          <Text style={styles.logo}>🐾</Text>
          <AppText variant="display" color={colors.primary}>
            Tekrar hoş geldin
          </AppText>
          <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
            Köpeğinin yürüyüş arkadaşları seni bekliyor.
          </AppText>
        </View>

        <View style={{ marginTop: spacing.xxl }}>
          {formError ? <Banner tone="error" message={formError} /> : null}

          <Field
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            placeholder="ornek@eposta.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />

          <Field
            label="Şifre"
            value={password}
            onChangeText={setPassword}
            placeholder="Şifreniz"
            secureTextEntry
            autoCapitalize="none"
            error={errors.password}
          />

          <Button label="Giriş yap" onPress={onSubmit} loading={loading} />

          {/* Google ile giriş — yapılandırılmamışsa bu blok hiç görünmez. */}
          <GoogleAuthSection onError={setFormError} />

          <View style={styles.footer}>
            <AppText variant="body" color={colors.textMuted}>
              Hesabın yok mu?{' '}
            </AppText>
            <Link href="/(auth)/sign-up" replace>
              <Text style={[typography.bodyStrong, { color: colors.primary }]}>Kayıt ol</Text>
            </Link>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logo: {
    fontSize: 56,
    marginBottom: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
});
