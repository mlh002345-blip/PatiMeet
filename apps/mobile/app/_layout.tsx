import { Stack } from 'expo-router';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session';
import { colors, fontFamily } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '400', fontFamily: fontFamily.serif },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          {/* Açılış ekranı oturum durumuna göre yönlendirir. */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="event/create" options={{ title: 'Yürüyüş oluştur' }} />
          {/* Eski yol; /alerts'e yönlendirir. Başlık görünmeden geçilir. */}
          <Stack.Screen name="community" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ title: 'Sohbet' }} />
          <Stack.Screen name="alerts/index" options={{ headerShown: false }} />
          <Stack.Screen name="alerts/create" options={{ title: 'Bildirim oluştur' }} />
          <Stack.Screen name="alerts/[id]" options={{ title: 'Bildirim' }} />
          <Stack.Screen name="legal/[slug]" options={{ title: 'Belge' }} />
          <Stack.Screen name="settings/blocked" options={{ title: 'Engellenen kullanıcılar' }} />
          <Stack.Screen name="settings/notifications" options={{ title: 'Bildirimler' }} />
          <Stack.Screen name="settings/edit-profile" options={{ title: 'Profili düzenle' }} />
          <Stack.Screen name="settings/edit-dog" options={{ title: 'Köpek profilini düzenle' }} />
          <Stack.Screen name="settings/dogs" options={{ title: 'Köpeklerim' }} />
          <Stack.Screen name="settings/add-dog" options={{ title: 'Köpek ekle' }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
