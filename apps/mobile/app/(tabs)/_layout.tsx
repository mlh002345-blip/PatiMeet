import { Redirect, Tabs, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { api } from '../../src/api';
import { LoadingState } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { usePushRegistration } from '../../src/push';
import { colors } from '../../src/theme';

/**
 * Alt menü (MVP 6. bölüm): Ana Sayfa, Keşfet, Etkinlikler, Mesajlar, Profil.
 *
 * Bu düzen aynı zamanda koruma katmanı: oturumu olmayan veya profili
 * tamamlanmamış kullanıcılar korumalı sekmelere erişemez.
 */
export default function TabsLayout() {
  const { initializing, user } = useSession();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  /**
   * Cihazı bildirimlere kaydeder ve bildirime dokunulduğunda ilgili ekrana
   * götürür. İzin verilmezse uygulama normal çalışmaya devam eder.
   */
  usePushRegistration(Boolean(user), (data) => {
    if (data.type === 'chat' && typeof data.conversationId === 'string') {
      router.push(`/chat/${data.conversationId}`);
    } else if (data.type === 'event' && typeof data.eventId === 'string') {
      router.push(`/event/${data.eventId}`);
    } else if (data.type === 'alert' && typeof data.alertId === 'string') {
      router.push(`/alerts/${data.alertId}`);
    } else if (data.type === 'safety') {
      router.push('/(tabs)/profile');
    }
  });

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
          tabBarIcon: ({ focused }) => <TabIcon name={{ ios: 'house', android: 'home', web: 'home' }} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Keşfet',
          tabBarIcon: ({ focused }) => <TabIcon name={{ ios: 'pawprint', android: 'pets', web: 'pets' }} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Etkinlikler',
          tabBarIcon: ({ focused }) => <TabIcon name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mesajlar',
          tabBarIcon: ({ focused }) => <TabIcon name={{ ios: 'bubble.left.and.bubble.right', android: 'chat_bubble', web: 'chat_bubble' }} focused={focused} />,
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused }) => <TabIcon name={{ ios: 'person', android: 'person', web: 'person' }} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

/**
 * Expo'nun platformlar arası profesyonel çizgi sembolleri.
 */
function TabIcon({ name, focused }: { name: SymbolViewProps['name']; focused: boolean }) {
  const color = focused ? colors.primary : colors.textSubtle;
  return <SymbolView name={name} size={22} tintColor={color} />;
}
