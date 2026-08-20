import { useRouter } from 'expo-router';
import React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { api, type EventSummary } from '../../src/api';
import { AlertCard, EventCard } from '../../src/components/cards';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconAction,
  LoadingState,
  PatiLine,
  ScrollScreen,
  SectionHeader,
  SubtleBadge,
} from '../../src/components/ui';
import { formatEventDate } from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

const defaultHomeHero = require('../../assets/prive-home-sunrise-v1.png');

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
    <ScrollScreen
      padded={false}
      refreshing={loader.refreshing}
      onRefresh={loader.refresh}
    >
      {/*
       * Onaylı 11/10 referansın ana kompozisyonu: tek, tam genişlikte
       * sinematik sahne; marka, selamlama, günlük özet ve tek CTA fotoğrafın
       * üzerinde yaşar. Fotoğraf yoksa markaya ait gün doğumu görseli gelir.
       */}
      <ImageBackground
        source={dog?.photoUrl ? { uri: dog.photoUrl } : defaultHomeHero}
        resizeMode="cover"
        style={styles.flagshipHero}
        imageStyle={styles.flagshipHeroImage}
      >
        <View style={styles.topWash} />
        <View style={styles.bottomScrimSoft} />
        <View style={styles.bottomScrimStrong} />

        <View style={styles.flagshipContent}>
          <View style={styles.flagshipHeader}>
            <View>
              <AppText variant="title" color={colors.primary}>PatiMeet</AppText>
              <AppText variant="kicker" color={colors.copperDeep}>PRIVÉ</AppText>
            </View>
            <IconAction
              label="Bildirimler"
              name={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
              onPress={() => router.push('/settings/notifications')}
            />
          </View>

          <View style={styles.greetingBlock}>
            <AppText variant="editorial" color={colors.primary}>
              {greeting()},{'\n'}{user?.name}
            </AppText>
            <AppText variant="body" color={colors.textMuted} style={styles.greetingCaption}>
              {dog ? `${dog.name}'nin günü hazır` : 'Bugün birlikte güzel bir gün olacak'}
            </AppText>
            <View style={styles.signatureLine} />
          </View>

          <View style={styles.heroBottom}>
            {!dog?.photoUrl ? (
              <View style={styles.photoHintRow}>
                <AppText variant="caption" color={colors.textOnDarkMuted}>
                  Bu sinematik görünümü {dog?.name ?? 'köpeğinin'} fotoğrafıyla kişiselleştir
                </AppText>
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
              </View>
            ) : null}

            <View style={styles.glassRow}>
              <View style={styles.glassCard}>
                <AppText variant="metric" color={colors.textOnDark}>
                  {loader.data?.nearby.length ?? 0}
                </AppText>
                <AppText variant="caption" color={colors.textOnDarkMuted}>
                  Yakındaki buluşma{user?.district ? `\n${user.district}` : ''}
                </AppText>
              </View>
              <View style={styles.glassCard}>
                <AppText variant="metric" color={colors.textOnDark}>
                  {nextEvent ? 'Hazır' : `%${Math.round(completion * 100)}`}
                </AppText>
                <AppText variant="caption" color={colors.textOnDarkMuted}>
                  {nextEvent ? `${formatEventDate(nextEvent.startsAt)}\n${nextEvent.district}` : 'Profil tamamlanma\ndurumu'}
                </AppText>
              </View>
            </View>

            <Button
              label={nextEvent ? 'Planımı aç' : 'Günü başlat'}
              onPress={() =>
                nextEvent ? router.push(`/event/${nextEvent.id}`) : router.push('/event/create')
              }
              style={styles.heroButton}
            />
          </View>
        </View>
      </ImageBackground>

      <View style={styles.pageBody}>

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
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  flagshipHero: {
    height: 670,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  flagshipHeroImage: {
    backgroundColor: colors.background,
  },
  topWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: '52%',
    backgroundColor: 'rgba(243, 237, 227, 0.56)',
  },
  bottomScrimSoft: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '48%',
    backgroundColor: 'rgba(18, 20, 16, 0.30)',
  },
  bottomScrimStrong: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '28%',
    backgroundColor: 'rgba(18, 20, 16, 0.58)',
  },
  flagshipContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  flagshipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greetingBlock: {
    marginTop: 30,
  },
  greetingCaption: {
    marginTop: spacing.sm,
  },
  signatureLine: {
    marginTop: spacing.sm,
    width: 88,
    height: 1,
    backgroundColor: colors.copper,
    transform: [{ rotate: '4deg' }],
  },
  heroBottom: {
    marginTop: 'auto',
  },
  photoHintRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  glassRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  glassCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 14,
    padding: spacing.md,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(18, 20, 16, 0.58)',
    borderWidth: 1,
    borderColor: 'rgba(243, 237, 227, 0.24)',
  },
  heroButton: {
    marginTop: spacing.md,
    minHeight: 50,
    borderRadius: 22,
  },
  pageBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
