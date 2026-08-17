import { Stack } from 'expo-router';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '600' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          {/* Açılış ekranı oturum durumuna göre yönlendirir. */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="user/[id]" options={{ title: 'Profil' }} />
          <Stack.Screen name="event/[id]" options={{ title: 'Etkinlik' }} />
          <Stack.Screen name="event/create" options={{ title: 'Yürüyüş oluştur' }} />
          <Stack.Screen name="chat/[id]" options={{ title: 'Sohbet' }} />
          <Stack.Screen name="legal/[slug]" options={{ title: 'Belge' }} />
          <Stack.Screen name="settings/blocked" options={{ title: 'Engellenen kullanıcılar' }} />
          <Stack.Screen name="settings/edit-profile" options={{ title: 'Profili düzenle' }} />
          <Stack.Screen name="settings/edit-dog" options={{ title: 'Köpek profilini düzenle' }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
