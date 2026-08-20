import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { api, type EventSummary } from '../../src/api';
import { AlertCard, EventCard } from '../../src/components/cards';
import {
  AppText,
  AppHeader,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ImageHero,
  IconAction,
  LoadingState,
  Metric,
  PatiLine,
  ScrollScreen,
  SectionHeader,
  SubtleBadge,
} from '../../src/components/ui';
import { dogAgeLabel, formatEventDate } from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

/** "Günaydın" / "İyi günler" / "İyi akşamlar" — cihaz saatine göre. */
function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 11) return 'Günaydın';
  if (hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

/**
 * Bugün (6/14).
 *
 * PatiMeet Privé ana ekranı: kişisel selamlama, köpeği merkeze alan sinematik
 * hero, günün kısa özeti ve TEK baskın eylem. Keşfet, Kulüp ve Güvenli
 * Topluluk işlevleri korunur ama editoryal ve daha sakin bir hiyerarşide
 * sunulur.
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
  const nextEvent = loader.data?.joined[0] ?? null;

  /**
   * Profil tamamlama. Yüzde, PatiLine ile gösterilir; hangi alanın eksik
   * olduğu kısa bir cümlede kalır.
   */
  const checklist = [
    Boolean(user?.district),
    Boolean(dog),
    Boolean(dog?.breed),
    dog?.birthYear !== null && dog?.birthYear !== undefined,
    Boolean(user?.bio),
    Boolean(dog?.photoUrl),
  ];
  const completion = checklist.filter(Boolean).length / checklist.length;

  const missing: string[] = [];
  if (dog && !dog.breed) missing.push('cinsi');
  if (dog && dog.birthYear === null) missing.push('yaşı');
  if (!user?.bio) missing.push('kendi açıklaman');
  if (dog && !dog.photoUrl) missing.push('fotoğrafı');

  return (
    <ScrollScreen refreshing={loader.refreshing} onRefresh={loader.refresh}>
      <AppHeader onNotifications={() => router.push('/settings/notifications')} />

      {/* Kişisel selamlama — editoryal serif */}
      <AppText variant="editorial">
        {greeting()},{'\n'}
        {user?.name}
      </AppText>
      <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
        {dog ? `${dog.name}'in günü hazır.` : 'Köpeğini ekleyince günü birlikte planlarız.'}
      </AppText>

      {/* Sinematik hero — köpek merkezde */}
      <ImageHero
        uri={dog?.photoUrl}
        height={300}
        style={{ marginTop: spacing.xl }}
        fallbackLabel={dog ? `${dog.name}'nin portresini ekle` : 'Köpek profili ekle'}
        showFallbackPromptWithChildren
        onPress={() =>
          dog ? router.push(`/settings/edit-dog?dogId=${dog.id}`) : router.push('/settings/add-dog')
        }
        topLeft={
          user?.district ? (
            <SubtleBadge
              label={user.district}
              tone="onDark"
              icon={{ ios: 'mappin', android: 'place', web: 'place' }}
            />
          ) : null
        }
        topRight={
          !dog?.photoUrl ? (
            <IconAction
              label={`${dog?.name ?? 'Köpek'} fotoğrafı ekle`}
              name={{ ios: 'camera', android: 'add_a_photo', web: 'add_a_photo' }}
              tone="onDark"
              onPress={() =>
                dog
                  ? router.push(`/settings/edit-dog?dogId=${dog.id}`)
                  : router.push('/settings/add-dog')
              }
            />
          ) : null
        }
      >
        {dog ? (
          <>
            <AppText variant="display" color={colors.textOnDark}>
              {dog.name}
            </AppText>
            <AppText variant="body" color={colors.textOnDarkMuted}>
              {dog.breed ?? 'Cins belirtilmemiş'} · {dogAgeLabel(dog.age)}
            </AppText>
          </>
        ) : (
          <AppText variant="title" color={colors.textOnDark}>
            Pati profilin eksik
          </AppText>
        )}
      </ImageHero>

      {/* Günün concierge özeti hero'nun üzerine hafifçe oturur. */}
      <Card style={styles.conciergeCard}>
        <View style={styles.conciergeHeader}>
          <SubtleBadge
            label="Bugünün planı"
            tone="copper"
            icon={{ ios: 'sun.max', android: 'wb_sunny', web: 'wb_sunny' }}
          />
          <AppText variant="caption" color={colors.textSubtle}>
            {user?.district ?? 'Yakınında'}
          </AppText>
        </View>

        <AppText variant="title" style={{ marginTop: spacing.md }}>
          {nextEvent ? 'Sıradaki buluşman hazır' : `${dog?.name ?? 'Dostun'} ile günü planla`}
        </AppText>
        <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
          {nextEvent
            ? `${formatEventDate(nextEvent.startsAt)} · ${nextEvent.district}`
            : 'Yakınındaki güvenli bir yürüyüşü seç veya kendi buluşmanı oluştur.'}
        </AppText>

        <PatiLine progress={nextEvent ? 0.68 : completion} style={{ marginTop: spacing.lg }} />

        <View style={styles.metricRow}>
          <Metric value={String(loader.data?.joined.length ?? 0)} label="Planın" />
          <View style={styles.metricDivider} />
          <Metric value={String(loader.data?.nearby.length ?? 0)} label="Yakındaki buluşma" />
        </View>

        {/**
         * Tek baskın eylem. Canlı yürüyüş takibi bu fazın kapsamı dışında
         * olduğu için CTA gerçekten çalışan bir akışa — yürüyüş planlamaya —
         * bağlanıyor; sahte bir GPS özelliği gösterilmiyor.
         */}
        <Button
          label="Yürüyüş planla"
          onPress={() => router.push('/event/create')}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      {/* Profil tamamlama — uyarı bandı yerine sessiz ilerleme */}
      {completion < 1 ? (
        <Card tone="inset" style={{ marginTop: spacing.md }}>
          <View style={styles.progressRow}>
            <AppText variant="label" color={colors.primary}>
              Profilin %{Math.round(completion * 100)} hazır
            </AppText>
            <AppText
              variant="label"
              color={colors.copperDeep}
              onPress={() => router.push('/settings/edit-profile')}
            >
              Tamamla
            </AppText>
          </View>
          <PatiLine progress={completion} style={{ marginTop: spacing.md }} />
          {missing.length > 0 ? (
            <AppText variant="caption" color={colors.textMuted} style={{ marginTop: spacing.md }}>
              Eksik: {missing.join(', ')}
            </AppText>
          ) : null}
        </Card>
      ) : null}

      {/* Güvenli Topluluk — dekor uğruna aşağı gömülmüyor, hero'nun hemen ardında */}
      <SectionHeader
        kicker="Güvenli Topluluk"
        title="Semtinde neler oluyor?"
        actionLabel="Tümü"
        onAction={() => router.push('/alerts')}
      />

      {loader.data && loader.data.alerts.length > 0 ? (
        loader.data.alerts
          .slice(0, 2)
          .map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onPress={() => router.push(`/alerts/${alert.id}`)}
            />
          ))
      ) : (
        <Card onPress={() => router.push('/alerts')}>
          <AppText variant="bodyStrong">Şu an açık bildirim yok</AppText>
          <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
            Kayıp hayvan, tehlikeli bölge veya yardım çağrısı gördüğünde komşularını buradan
            uyarabilirsin.
          </AppText>
        </Card>
      )}

      {/* Kulüp */}
      <SectionHeader
        kicker="Kulüp"
        title={nextEvent ? 'Yaklaşan buluşmaların' : 'Yakınındaki buluşmalar'}
        actionLabel="Tümü"
        onAction={() => router.push('/(tabs)/events')}
      />

      {loader.loading ? (
        <LoadingState />
      ) : loader.error ? (
        <ErrorState message={loader.error} onRetry={loader.reload} />
      ) : (
        <>
          {loader.data && loader.data.joined.length > 0 ? (
            loader.data.joined
              .slice(0, 2)
              .map((event: EventSummary) => (
                <EventCard
                  key={event.id}
                  event={event}
                  compact
                  onPress={() => router.push(`/event/${event.id}`)}
                />
              ))
          ) : loader.data && loader.data.nearby.length > 0 ? (
            /**
             * Kayıtlı etkinliği olmayan kullanıcı bunu açıkça görmeli; hemen
             * altında yakınındaki buluşmalar listeleniyor.
             */
            <AppText variant="body" color={colors.textMuted} style={{ marginBottom: spacing.lg }}>
              Henüz bir etkinliğe katılmadın. Yakınındakilere göz atabilirsin.
            </AppText>
          ) : null}

          {loader.data && loader.data.nearby.length > 0 ? (
            loader.data.nearby
              .slice(0, 2)
              .map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  compact
                  onPress={() => router.push(`/event/${event.id}`)}
                />
              ))
          ) : loader.data && loader.data.joined.length === 0 ? (
            <EmptyState
              icon={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
              title="Semtinde henüz buluşma yok"
              description="İlk yürüyüşü sen başlat, çevrendeki köpek sahipleri katılsın."
              actionLabel="Yürüyüş planla"
              onAction={() => router.push('/event/create')}
            />
          ) : null}
        </>
      )}

      {/* Keşfet girişi */}
      <SectionHeader
        kicker="Keşfet"
        title="Yakındaki köpekler"
        actionLabel="Gör"
        onAction={() => router.push('/(tabs)/discover')}
      />
      <Card onPress={() => router.push('/(tabs)/discover')}>
        <AppText variant="bodyStrong">
          {user?.district ? `${user.district} çevresindeki profiller` : 'Semtindeki profiller'}
        </AppText>
        <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
          Uyum skoruna göre sıralı; boyut, enerji ve semte göre filtreleyebilirsin.
        </AppText>
      </Card>

      {/* Güvenlik hatırlatması */}
      <Card tone="inset" style={{ marginTop: spacing.xl }}>
        <SubtleBadge
          label="İlk buluşma öncesi"
          icon={{ ios: 'shield', android: 'shield', web: 'shield' }}
        />
        <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.md }}>
          Kalabalık ve açık alanları seç, adresini paylaşma, yakınına nerede olduğunu haber ver.
        </AppText>
        <AppText
          variant="label"
          color={colors.copperDeep}
          style={{ marginTop: spacing.md }}
          onPress={() => router.push('/legal/safety')}
        >
          Güvenlik önerilerini oku
        </AppText>
      </Card>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.lg,
  },
  metricDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  conciergeCard: {
    marginTop: spacing.md,
    borderColor: colors.borderStrong,
  },
  conciergeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
