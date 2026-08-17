import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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
      <Text style={styles.logo}>🐾</Text>
      <Text style={styles.title}>PatiMeet</Text>
      <Text style={styles.tagline}>Köpeğine yakınında oyun ve yürüyüş arkadaşı bul</Text>
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
  logo: {
    fontSize: 72,
    marginBottom: spacing.lg,
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
