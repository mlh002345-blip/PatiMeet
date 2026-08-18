import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { api, type EventSummary } from '../../src/api';
import { ActionCard, AlertCard, EventCard } from '../../src/components/cards';
import {
  AppText,
  AppHeader,
  Banner,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  ScrollScreen,
  SectionHeader,
  Tag,
} from '../../src/components/ui';
import { useSession } from '../../src/session';
import { colors, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

/**
 * Ana sayfa (6/14).
 *
 * MVP 6. bölüm: kullanıcıyı doğrudan temel aksiyonlara yönlendirir ve
 * yaklaşan etkinlikleri ile profil tamamlama durumunu gösterir. Her ana
 * aksiyona en fazla üç dokunuşta ulaşılır.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { user } = useSession();

  const loader = useLoader(async () => {
    const [joined, nearby, alerts] = await Promise.all([
      api.events({ scope: 'joined' }),
      api.events({ district: user?.district ?? undefined }),
      /**
       * Güvenli Topluluk bildirimleri kritik değil: sunucu eski bir sürümde
       * olsa veya uç geçici olarak hata verse bile ana sayfa açılmalı.
       */
      api.alerts({ district: user?.district ?? undefined }).catch(() => ({ alerts: [] })),
    ]);
    return { joined: joined.events, nearby: nearby.events, alerts: alerts.alerts };
  }, [user?.district]);

  const dog = user?.dogs?.[0];

  // Profil tamamlama uyarısı: eksik olan isteğe bağlı alanları hatırlatır.
  const missing: string[] = [];
  if (dog && !dog.breed) missing.push('köpeğinin cinsi');
  if (dog && dog.birthYear === null) missing.push('köpeğinin yaşı');
  if (!user?.bio) missing.push('kendi açıklaman');

  return (
    <ScrollScreen refreshing={loader.refreshing} onRefresh={loader.refresh}>
      <AppHeader onNotifications={() => router.push('/settings/notifications')} />
      {/* Selamlama */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color={colors.textMuted}>
            Merhaba {user?.name} 👋
          </AppText>
          <AppText variant="display" style={{ marginTop: 2 }}>
            {dog ? `${dog.name} bugün ne yapmak ister?` : 'Hoş geldin'}
          </AppText>
          {user?.district ? (
            <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
              <Tag label={`📍 ${user.district}`} tone="primary" />
            </View>
          ) : null}
        </View>
      </View>

      {missing.length > 0 ? (
        <Banner
          tone="info"
          message={`Profilini güçlendir: ${missing.join(', ')} eksik. Profil sekmesinden tamamlayabilirsin.`}
        />
      ) : null}

      {/* Temel aksiyonlar */}
      <SectionHeader title="Ne yapmak istersin?" />

      <ActionCard
        emoji="🐕"
        title="Yakındaki köpekleri keşfet"
        description={`${user?.district ?? 'Semtindeki'} köpek sahiplerini gör`}
        onPress={() => router.push('/(tabs)/discover')}
      />
      <ActionCard
        emoji="📅"
        title="Yakındaki etkinliklere katıl"
        description="Yürüyüş ve park buluşmalarına göz at"
        onPress={() => router.push('/(tabs)/events')}
      />
      <ActionCard
        emoji="➕"
        title="Yürüyüş oluştur"
        description="Kendi buluşmanı planla, komşuların katılsın"
        onPress={() => router.push('/event/create')}
      />

      {/* Yaklaşan etkinliklerim */}
      <SectionHeader
        title="Yaklaşan etkinliklerim"
        actionLabel={loader.data?.joined.length ? 'Tümü' : undefined}
        onAction={() => router.push('/(tabs)/events')}
      />

      {loader.loading ? (
        <LoadingState />
      ) : loader.error ? (
        <ErrorState message={loader.error} onRetry={loader.reload} />
      ) : loader.data && loader.data.joined.length > 0 ? (
        loader.data.joined
          .slice(0, 3)
          .map((event: EventSummary) => (
            <EventCard
              key={event.id}
              event={event}
              compact
              onPress={() => router.push(`/event/${event.id}`)}
            />
          ))
      ) : (
        <Card>
          <AppText variant="bodyStrong">Henüz bir etkinliğe katılmadın</AppText>
          <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
            Yakındaki bir yürüyüşe katılabilir veya kendi buluşmanı oluşturabilirsin.
          </AppText>
        </Card>
      )}

      {/* Yakındaki etkinlikler */}
      {!loader.loading && !loader.error ? (
        <>
          <SectionHeader
            title={`${user?.district ?? 'Yakınımdaki'} etkinlikleri`}
            actionLabel="Tümü"
            onAction={() => router.push('/(tabs)/events')}
          />

          {loader.data && loader.data.nearby.length > 0 ? (
            loader.data.nearby
              .slice(0, 3)
              .map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onPress={() => router.push(`/event/${event.id}`)}
                />
              ))
          ) : (
            <EmptyState
              emoji="🌳"
              title="Semtinde henüz etkinlik yok"
              description="İlk yürüyüşü sen başlat, çevrendeki köpek sahipleri katılsın."
              actionLabel="Yürüyüş oluştur"
              onAction={() => router.push('/event/create')}
            />
          )}
        </>
      ) : null}

      {/* Güvenli Topluluk */}
      <SectionHeader
        title="Güvenli Topluluk"
        actionLabel="Tümü"
        onAction={() => router.push('/alerts')}
      />

      {loader.data && loader.data.alerts.length > 0 ? (
        loader.data.alerts
          .slice(0, 3)
          .map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onPress={() => router.push(`/alerts/${alert.id}`)}
            />
          ))
      ) : (
        <ActionCard
          emoji="🛡️"
          title="Kayıp hayvan, tehlike veya yardım çağrısı"
          description="Kayıp ve bulunan hayvan, zehirli yem, yaralı hayvan, salgın, acil kan, geçici yuva ve mama desteği bildirimleri"
          onPress={() => router.push('/alerts')}
        />
      )}

      {/* Güvenlik hatırlatması */}
      <Card style={{ marginTop: spacing.xl, backgroundColor: colors.warningLight, borderColor: colors.warningLight }}>
        <AppText variant="bodyStrong" color={colors.warning}>
          🛡️ İlk buluşma öncesi
        </AppText>
        <AppText variant="body" color={colors.warning} style={{ marginTop: spacing.xs }}>
          Kalabalık ve açık alanları seç, adresini paylaşma, yakınına nerede olduğunu haber ver.
        </AppText>
        <AppText
          variant="label"
          color={colors.warning}
          style={{ marginTop: spacing.md, textDecorationLine: 'underline' }}
          onPress={() => router.push('/legal/safety')}
        >
          Güvenlik önerilerini oku
        </AppText>
      </Card>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
});
