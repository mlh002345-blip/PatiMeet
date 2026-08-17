import { Redirect, Tabs } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { api } from '../../src/api';
import { LoadingState } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { colors } from '../../src/theme';

/**
 * Alt menü (MVP 6. bölüm): Ana Sayfa, Keşfet, Etkinlikler, Mesajlar, Profil.
 *
 * Bu düzen aynı zamanda koruma katmanı: oturumu olmayan veya profili
 * tamamlanmamış kullanıcılar korumalı sekmelere erişemez.
 */
export default function TabsLayout() {
  const { initializing, user } = useSession();
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(() => {
    api
      .unreadCount()
      .then((res) => setUnread(res.unreadCount))
      .catch(() => {
        // Sayaç kritik değil; hata durumunda sessizce geçiyoruz.
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    loadUnread();
    // Okunmamış mesaj göstergesini düzenli olarak tazeler (MVP'de anlık
    // bildirim yok, bu yüzden hafif bir yoklama yeterli).
    const timer = setInterval(loadUnread, 20000);
    return () => clearInterval(timer);
  }, [user, loadUnread]);

  if (initializing) return <LoadingState />;
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (!user.name || !user.district) return <Redirect href="/(onboarding)/create-profile" />;
  if (!user.hasDog) return <Redirect href="/(onboarding)/create-dog" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Ana Sayfa',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Keşfet',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🐕" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Etkinlikler',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mesajlar',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

/**
 * Sekme ikonları emoji ile çizildi — MVP'de ek ikon paketi bağımlılığı
 * getirmemek için bilinçli bir tercih. Aktif sekmede opaklık artar.
 */
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
}
