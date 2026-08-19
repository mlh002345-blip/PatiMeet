import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BrandMark } from '../src/components/ui';
import { useSession } from '../src/session';
import { colors, spacing, typography } from '../src/theme';

/**
 * Açılış ekranı (1/14).
 *
 * Kaydedilmiş oturum okunurken markayı gösterir, ardından kullanıcıyı doğru
 * akışa yönlendirir:
 *   oturum yok            → kayıt/giriş
 *   profil tamamlanmamış  → onboarding
 *   hazır                 → ana sayfa
 */
export default function SplashScreen() {
  const { initializing, user } = useSession();

  if (!initializing) {
    if (!user) return <Redirect href="/(auth)/sign-in" />;

    // İş kuralı: kullanıcı en az bir köpek profiline sahip olmalı.
    if (!user.name || !user.district) return <Redirect href="/(onboarding)/create-profile" />;
    if (!user.hasDog) return <Redirect href="/(onboarding)/create-dog" />;

    return <Redirect href="/(tabs)/home" />;
  }

  return (
    <View style={styles.container}>
      <BrandMark size={82} />
      <Text style={styles.kicker}>PATIMEET PRIVÉ</Text>
      <Text style={styles.title}>PatiMeet</Text>
      <Text style={styles.tagline}>Seçkin dostluklar. Güvenli yürüyüşler.</Text>
      <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  kicker: {
    ...typography.kicker,
    color: colors.copper,
    marginTop: spacing.lg,
    letterSpacing: 2.4,
  },
  title: {
    ...typography.display,
    color: colors.primary,
    fontSize: 34,
  },
  tagline: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 280,
  },
});
