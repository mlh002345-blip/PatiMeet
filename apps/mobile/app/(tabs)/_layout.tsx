import { Redirect, Tabs, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { api } from '../../src/api';
import { LoadingState } from '../../src/components/ui';
import { getNeighbourhoodLastSeen } from '../../src/neighbourhoodBadge';
import { useSession } from '../../src/session';
import { usePushRegistration } from '../../src/push';
import { colors } from '../../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Ana navigasyon: Bugün, Keşfet, Yürüyüş, Mahalle, Pati.
 *
 * Etkinlikler (`events`) ve Mesajlar (`messages`) artık alt menüde ayrı
 * sekme değil — Mahalle/Keşfet içinden ve üstteki gelen kutusu/bildirim
 * simgelerinden erişiliyor (`href: null` ile rota canlı kalır, deep link
 * kırılmaz, yalnızca alt bar sekmesi gizlenir).
 *
 * Bu düzen aynı zamanda koruma katmanı: oturumu olmayan veya profili
 * tamamlanmamış kullanıcılar korumalı sekmelere erişemez.
 */
export default function TabsLayout() {
  const { initializing, user } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [unread, setUnread] = useState(0);
  const [neighbourhoodNew, setNeighbourhoodNew] = useState(0);

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
    } else if (data.type === 'invite' && typeof data.inviteId === 'string') {
      router.push(`/neighbourhood/invite/${data.inviteId}`);
    } else if (data.type === 'care') {
      router.push('/journal');
    } else if (data.type === 'safety') {
      // Güvenlik/moderasyon bildirimleri hesapla ilgilidir — Pati (köpek
      // merkezi) değil, hesap ve güvenlik ayarlarının taşındığı /settings.
      router.push('/settings');
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

  /**
   * Mahalle sekmesindeki ölçülü "yeni içerik" göstergesi.
   *
   * Sahte bir sayı üretmez: gerçek akıştan (`api.feed`), kullanıcının son
   * ziyaretinden (`neighbourhoodBadge.ts`) sonra eklenmiş kayıt sayısını
   * sayar.
   */
  const loadNeighbourhoodBadge = useCallback(async () => {
    try {
      const [lastSeen, feed] = await Promise.all([
        getNeighbourhoodLastSeen(),
        api.feed({ district: user?.district ?? undefined }),
      ]);
      setNeighbourhoodNew(feed.items.filter((item) => item.sortAt > lastSeen).length);
    } catch {
      // Rozet kritik değil.
    }
  }, [user?.district]);

  useEffect(() => {
    if (!user) return;
    loadUnread();
    loadNeighbourhoodBadge();
    // Okunmamış mesaj ve mahalle göstergesini düzenli olarak tazeler (MVP'de
    // anlık bildirim yok, bu yüzden hafif bir yoklama yeterli).
    const timer = setInterval(() => {
      loadUnread();
      loadNeighbourhoodBadge();
    }, 20000);
    return () => clearInterval(timer);
  }, [user, loadUnread, loadNeighbourhoodBadge]);

  if (initializing) return <LoadingState />;
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (!user.name || !user.district) return <Redirect href="/(onboarding)/create-profile" />;
  if (!user.hasDog) return <Redirect href="/(onboarding)/create-dog" />;

  return (
    <>
    <StatusBar style="light" />
    <Tabs
      screenOptions={{
        headerShown: false,
        /**
         * Aktif durum ölçülü bakır, pasif durum sessiz yeşil-gri. Yüzey
         * fildişi ve üstte tek bir ince çizgi var — Privé dilinde alt bar
         * kendini öne çıkarmaz, içeriği taşır.
         */
        tabBarActiveTintColor: colors.copperPale,
        tabBarInactiveTintColor: colors.textOnDarkMuted,
        tabBarStyle: {
          backgroundColor: colors.primaryDark,
          borderTopColor: colors.borderOnDark,
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
        sceneStyle: { backgroundColor: colors.primaryDark },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
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
        name="live-walk"
        options={{
          title: 'Yürüyüş',
          // Alt menünün ortasındaki bu sekme kasıtlı olarak öne çıkar:
          // dolu bakır daire, diğer sekmelerden büyük ikon. Bu, "canlı
          // yürüyüş" uygulamanın ana aksiyonu olduğu için tasarım kararı.
          tabBarIcon: ({ focused }) => (
            <PrimaryTabIcon name={{ ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' }} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="neighbourhood"
        options={{
          title: 'Mahalle',
          tabBarIcon: ({ focused }) => <TabIcon name={{ ios: 'person.2.fill', android: 'groups', web: 'groups' }} focused={focused} />,
          tabBarBadge: neighbourhoodNew > 0 ? neighbourhoodNew : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          // Route adı `events`; alt menüde ayrı sekme değil — Mahalle ve
          // Keşfet içinden erişilir. Deep link kırılmasın diye `href: null`
          // ile rota canlı kalır, yalnızca alt bar öğesi gizlenir.
          title: 'Kulüp',
          href: null,
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
          // Alt menüde ayrı sekme değil — üstteki gelen kutusu simgesinden
          // erişilir (bkz. home.tsx AppHeader). `href: null` ile eski deep
          // link'ler ve okunmamış rozet mantığı bozulmadan kalır.
          href: null,
          title: 'Mesajlar',
          tabBarIcon: ({ focused }) => <TabIcon name={{ ios: 'bubble.left.and.bubble.right', android: 'chat_bubble', web: 'chat_bubble' }} focused={focused} />,
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          // Route adı `profile`; görünen etiket "Pati" — köpeğin kişisel merkezi.
          title: 'Pati',
          tabBarIcon: ({ focused }) => <TabIcon name={{ ios: 'pawprint.fill', android: 'pets', web: 'pets' }} focused={focused} />,
        }}
      />
    </Tabs>
    </>
  );
}

/**
 * Sekme ikonu.
 *
 * Aktif durum yalnızca bakır renkle anlatılıyor. Referanstaki alt çizgiyi
 * ikonun içine koymayı denedik ama ikon yuvasını büyütüp etiketi sabit
 * yükseklikli alt barda kesiyordu; okunabilirlik süslemeden önce gelir.
 */
function TabIcon({ name, focused }: { name: SymbolViewProps['name']; focused: boolean }) {
  return (
    <View
      style={{
        width: 34,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.forestSoft : 'transparent',
      }}
    >
      <SymbolView name={name} size={21} tintColor={focused ? colors.copperPale : colors.textOnDarkMuted} />
    </View>
  );
}

/**
 * Yürüyüş sekmesinin öne çıkan ikonu — dolu bakır daire.
 *
 * Boyut, sabit 56 yükseklikli sekme öğesinin (`tabBarItemStyle`) ve alt
 * güvenli alanın içine sığacak şekilde ölçüldü; etiket hiçbir cihazda
 * kesilmez (bkz. tabBarLabelStyle satır yüksekliği).
 */
function PrimaryTabIcon({ name, focused }: { name: SymbolViewProps['name']; focused: boolean }) {
  return (
    <View
      style={{
        width: 44,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.copperAction : colors.copperDeep,
        borderWidth: 1,
        borderColor: colors.copperPale,
      }}
    >
      <SymbolView name={name} size={22} tintColor={colors.textOnDark} />
    </View>
  );
}
