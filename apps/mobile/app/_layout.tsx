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
          <Stack.Screen name="event/create" options={{ headerShown: false }} />
          {/* Eski yol; /alerts'e yönlendirir. Başlık görünmeden geçilir. */}
          <Stack.Screen name="community" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
          {/* Yeni ürün ekranları da ortak Privé başlığını kullanır (DetailHeader). */}
          <Stack.Screen name="walk/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="walk/share" options={{ headerShown: false }} />
          <Stack.Screen name="journal/index" options={{ headerShown: false }} />
          <Stack.Screen name="journal/add" options={{ headerShown: false }} />
          <Stack.Screen name="journal/documents" options={{ headerShown: false }} />
          <Stack.Screen name="journal/emergency" options={{ headerShown: false }} />
          <Stack.Screen name="neighbourhood/index" options={{ headerShown: false }} />
          <Stack.Screen name="neighbourhood/create-invite" options={{ headerShown: false }} />
          <Stack.Screen name="neighbourhood/invite/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="alerts/index" options={{ headerShown: false }} />
          <Stack.Screen name="alerts/create" options={{ headerShown: false }} />
          <Stack.Screen name="alerts/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="legal/[slug]" options={{ headerShown: false }} />
          <Stack.Screen name="settings/blocked" options={{ headerShown: false }} />
          <Stack.Screen name="settings/notifications" options={{ headerShown: false }} />
          <Stack.Screen name="settings/edit-profile" options={{ headerShown: false }} />
          <Stack.Screen name="settings/edit-dog" options={{ headerShown: false }} />
          <Stack.Screen name="settings/dogs" options={{ headerShown: false }} />
          <Stack.Screen name="settings/add-dog" options={{ headerShown: false }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
