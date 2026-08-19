import { Redirect, Tabs, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { api } from '../../src/api';
import { LoadingState } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { usePushRegistration } from '../../src/push';
import { colors } from '../../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Alt menü (MVP 6. bölüm): Ana Sayfa, Keşfet, Etkinlikler, Mesajlar, Profil.
 *
 * Bu düzen aynı zamanda koruma katmanı: oturumu olmayan veya profili
 * tamamlanmamış kullanıcılar korumalı sekmelere erişemez.
 */
export default function TabsLayout() {
  const { initializing, user } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
        /**
         * Aktif durum ölçülü bakır, pasif durum sessiz yeşil-gri. Yüzey
         * fildişi ve üstte tek bir ince çizgi var — Privé dilinde alt bar
         * kendini öne çıkarmaz, içeriği taşır.
         */
        tabBarActiveTintColor: colors.copperDeep,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 62 + Math.max(insets.bottom, 10),
          paddingTop: 7,
          paddingBottom: Math.max(insets.bottom, 10),
        },
        tabBarItemStyle: { minHeight: 56 },
        tabBarIconStyle: { marginTop: 0 },
        tabBarLabelStyle: {
          fontSize: 10,
          lineHeight: 14,
          fontWeight: '600',
          letterSpacing: 0.2,
          marginTop: 1,
        },
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          // Görsel etiket tasarım yönüne taşındı; route adı `home` olarak kaldı.
          title: 'Bugün',
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
          // Route adı `events`; yalnızca görünen etiket "Kulüp".
          title: 'Kulüp',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={{ ios: 'shield.lefthalf.filled', android: 'workspace_premium', web: 'workspace_premium' }}
              focused={focused}
            />
          ),
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
          // Route adı `profile`; görünen etiket "Pati".
          title: 'Pati',
          tabBarIcon: ({ focused }) => <TabIcon name={{ ios: 'person', android: 'person', web: 'person' }} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

/**
 * Expo'nun platformlar arası profesyonel çizgi sembolleri.
 */
/**
 * Sekme ikonu.
 *
 * Aktif durum yalnızca bakır renkle anlatılıyor. Referanstaki alt çizgiyi
 * ikonun içine koymayı denedik ama ikon yuvasını büyütüp etiketi sabit
 * yükseklikli alt barda kesiyordu; okunabilirlik süslemeden önce gelir.
 */
function TabIcon({ name, focused }: { name: SymbolViewProps['name']; focused: boolean }) {
  return (
    <SymbolView name={name} size={22} tintColor={focused ? colors.copperDeep : colors.textSubtle} />
  );
}
