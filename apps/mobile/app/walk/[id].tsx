import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import { Image, Pressable, Share, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { AppText, Banner, Button, DetailHeader, ErrorState, LoadingState } from '../../src/components/ui';
import { WalkRouteMap } from '../../src/components/WalkRouteMap';
import { formatEventDate } from '../../src/labels';
import { useSession } from '../../src/session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';
import { formatClock, formatDistance, formatPace } from '../../src/walkTracker';

/**
 * Yürüyüş özet kartı.
 *
 * Rota, kullanıcının gizlilik tercihine göre uçları kırpılmış olarak gelir;
 * bu ekran ham rotayı hiç istemez. Paylaşım cihazın kendi paylaşım
 * sayfasını açar — dışarıya otomatik gönderim yapılmaz.
 */
export default function WalkSummaryScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loader = useLoader(async () => {
    const res = await api.walks();
    const walk = res.walks.find((w) => w.id === params.id);
    if (!walk) throw new ApiError(404, 'not_found', 'Yürüyüş bulunamadı.');
    const route = await api.walkRoute(walk.id).catch(() => ({ points: [] }));
    return { walk, route: route.points };
  }, [params.id]);

  if (loader.loading) return <LoadingState label="Yürüyüş yükleniyor…" />;
  if (loader.error) return <ErrorState message={loader.error} onRetry={loader.reload} />;
  if (!loader.data) return <ErrorState message="Yürüyüş bulunamadı." />;

  const { walk, route } = loader.data;
  const dog = user?.dogs?.find((d) => d.id === walk.dogId) ?? user?.dogs?.[0];

  async function saveToJournal() {
    if (!dog) return;
    setSaving(true);
    try {
      await api.addMemory({
        dogId: dog.id,
        note: walk.note || 'Yürüyüş anısı',
        occurredAt: walk.startedAt,
        walkId: walk.id,
        storageKey: null,
      });
      setMessage('Köpeğinin günlüğüne eklendi.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Günlüğe eklenemedi.');
    } finally {
      setSaving(false);
    }
  }

  async function shareSummary() {
    await Share.share({
      message: `${dog?.name ?? 'Patimiz'} ile ${formatDistance(walk.distanceMeters)} yürüdük · ${formatClock(walk.durationSeconds)} · PatiMeet`,
    }).catch(() => undefined);
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top + spacing.sm }]}>
      <DetailHeader label="Yürüyüş özeti" onBack={() => router.back()} />
      {message ? <Banner tone="success" message={message} /> : null}

      <View style={s.card}>
        <View style={s.headRow}>
          <View style={s.dogAvatar}>
            {dog?.photoUrl ? (
              <Image source={{ uri: dog.photoUrl }} style={s.fill} />
            ) : (
              <SymbolView
                name={{ ios: 'pawprint.fill', android: 'pets', web: 'pets' }}
                size={22}
                tintColor={colors.textOnDark}
              />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="heading" color={colors.textOnDark}>
              {dog?.name ?? 'Yürüyüş'}
            </AppText>
            <AppText variant="caption" color={colors.textOnDarkMuted}>
              {formatEventDate(walk.startedAt)}
              {walk.district ? ` · ${walk.district}` : ''}
            </AppText>
          </View>
        </View>

        <View style={s.metrics}>
          <Metric label="Süre" value={formatClock(walk.durationSeconds)} />
          <Metric label="Mesafe" value={formatDistance(walk.distanceMeters)} />
          <Metric label="Tempo" value={formatPace(walk.paceSecondsPerKm)} last />
        </View>

        <AppText variant="caption" color={colors.textOnDarkMuted}>
          ~{walk.estimatedCalories} kcal · tahmini değerdir, sağlık ölçümü değildir
        </AppText>
      </View>

      <WalkRouteMap points={route} dogPhotoUrl={dog?.photoUrl ?? null} height={220} />

      {walk.hideEndpoints ? (
        <AppText
          variant="caption"
          color={colors.textOnDarkMuted}
          style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}
        >
          Gizlilik için rotanın başlangıç ve bitiş bölümü özetten çıkarıldı.
        </AppText>
      ) : null}

      <View style={s.actions}>
        <Button label="Özeti paylaş" onPress={shareSummary} />
        <Button
          label="Günlüğe anı olarak ekle"
          variant="secondary"
          loading={saving}
          onPress={saveToJournal}
          style={{ marginTop: spacing.sm }}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/home')}
          style={s.doneRow}
        >
          <AppText variant="label" color={colors.copperPale}>
            Bugün ekranına dön
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function Metric({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.metric, last && { borderRightWidth: 0 }]}>
      <AppText variant="caption" color={colors.textOnDarkMuted}>
        {label}
      </AppText>
      <AppText variant="heading" color={colors.textOnDark} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.primaryDark },
  card: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.obsidianSoft,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dogAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forestSoft,
    borderWidth: 2,
    borderColor: colors.copperPale,
  },
  fill: { width: '100%', height: '100%' },
  metrics: { flexDirection: 'row', marginVertical: spacing.lg },
  metric: {
    flex: 1,
    gap: 3,
    paddingHorizontal: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: colors.borderOnDark,
  },
  actions: { padding: spacing.lg },
  doneRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
});
