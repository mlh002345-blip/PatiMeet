import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useCallback, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type DogDocument, type DogMemory, type JournalOverview, type Walk, type WalkSummary } from '../../src/api';
import { AppText, IconAction, LoadingState } from '../../src/components/ui';
import { dogAgeLabel, formatRelative, formatShortDate } from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, radius, shadow, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';
import { formatDistance, formatPace } from '../../src/walkTracker';

/**
 * Pati — köpeğin kişisel merkezi (5. sekme, route adı `profile` korunur).
 *
 * Kullanıcı ayarları, hesap ve köpek yönetimi sağ üstteki dişli simgesinden
 * `/settings`'e taşındı (bkz. app/settings/index.tsx). Bu ekran yalnız
 * gerçek günlük/yürüyüş kayıtlarından gelen bilgiyi gösterir — uydurma bir
 * "sağlık puanı" veya tıbbi değerlendirme üretmez.
 */
export default function PatiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useSession();
  const dogs = user?.dogs ?? [];
  const [selectedDogId, setSelectedDogId] = useState<string | null>(dogs[0]?.id ?? null);
  const dog = dogs.find((d) => d.id === selectedDogId) ?? dogs[0] ?? null;

  const loader = useLoader(async () => {
    if (!dog) return null;
    const [overview, walks, memories, documents, summary] = await Promise.all([
      api.journalOverview(dog.id),
      api.walks().catch(() => ({ walks: [] as Walk[] })),
      api.memories(dog.id).catch(() => ({ memories: [] as DogMemory[] })),
      api.documents(dog.id).catch(() => ({ documents: [] as DogDocument[] })),
      api.walkSummary().catch(
        () => ({ weeklySeconds: 0, weeklyMeters: 0, weeklyWalks: 0, todaySeconds: 0 }) as WalkSummary
      ),
    ]);
    const lastWalk = walks.walks.find((w) => w.dogId === dog.id) ?? walks.walks[0] ?? null;
    return { overview, lastWalk, memories: memories.memories, documents: documents.documents, summary };
  }, [dog?.id]);

  // Ekrana her dönüşte tazele — günlükten yeni eklenen bir kayıt hemen görünsün.
  useFocusEffect(
    useCallback(() => {
      loader.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dog?.id])
  );

  if (!dog) {
    return (
      <View style={[s.screen, s.centered, { paddingTop: insets.top }]}>
        <AppText variant="body" color={colors.textOnDarkMuted}>Köpek profili bulunamadı.</AppText>
      </View>
    );
  }

  const overview = loader.data?.overview as JournalOverview | undefined;
  const todayCutoff = Date.now() + 24 * 60 * 60 * 1000;
  const dueToday = (overview?.overdue ?? []).concat(
    (overview?.upcoming ?? []).filter((e) => e.remindAt !== null && e.remindAt <= todayCutoff)
  );
  const nextUpcoming = overview?.upcoming?.[0] ?? null;
  const lastWalk = loader.data?.lastWalk ?? null;
  const summary = loader.data?.summary;
  const weeklyGoalSeconds = 60 * 7 * 60; // haftada 7×60 dk — bilgilendirici referans, tıbbi değil.
  const weeklyProgress = summary ? Math.min(1, summary.weeklySeconds / weeklyGoalSeconds) : 0;
  const weightSeries = (overview?.weightSeries ?? []).filter((p) => p.value !== null);
  const lastWeight = weightSeries[weightSeries.length - 1] ?? null;
  const memories = loader.data?.memories ?? [];
  const documents = loader.data?.documents ?? [];

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={loader.refreshing} onRefresh={loader.refresh} tintColor={colors.copperPale} />}
    >
      {/* Köpek hero */}
      <View style={[s.hero, { paddingTop: insets.top + spacing.sm }]}>
        <View style={s.heroTop}>
          {dogs.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {dogs.map((d) => (
                  <Pressable
                    key={d.id}
                    onPress={() => setSelectedDogId(d.id)}
                    style={[s.dogChip, d.id === dog.id && s.dogChipActive]}
                  >
                    <AppText variant="label" color={d.id === dog.id ? colors.textOnDark : colors.textOnDarkMuted}>
                      {d.name}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <IconAction
            label="Profil ve ayarlar"
            name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
            tone="onDark"
            onPress={() => router.push('/settings')}
          />
        </View>

        <View style={s.dogPhotoWrap}>
          {dog.photoUrl ? (
            <Image source={{ uri: dog.photoUrl }} style={s.dogPhoto} />
          ) : (
            <View style={[s.dogPhoto, s.dogPhotoFallback]}>
              <SymbolView name={{ ios: 'pawprint.fill', android: 'pets', web: 'pets' }} size={48} tintColor={colors.copperPale} />
            </View>
          )}
        </View>

        <AppText variant="display" color={colors.textOnDark} center style={{ marginTop: spacing.md }}>
          {dog.name}
        </AppText>
        <AppText variant="body" color={colors.textOnDarkMuted} center>
          {dog.breed ?? 'Cins belirtilmemiş'} · {dogAgeLabel(dog.age)}
        </AppText>
      </View>

      <View style={s.body}>
        {loader.loading ? (
          <LoadingState label="Günlük yükleniyor…" />
        ) : (
          <>
            {/* Bugünkü bakım görevleri */}
            <SectionHead title="Bugünkü bakım" />
            {dueToday.length === 0 ? (
              <EmptyRow text="Bugün için bekleyen bir bakım kaydı yok." />
            ) : (
              dueToday.slice(0, 3).map((entry) => (
                <Pressable key={entry.id} onPress={() => router.push('/journal')} style={({ pressed }) => [s.row, pressed && s.pressed]}>
                  <RowIcon icon={{ ios: 'cross.case.fill', android: 'medical_services', web: 'medical_services' }} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" color={colors.textOnDark} numberOfLines={1}>{entry.typeLabel}</AppText>
                    <AppText variant="caption" color={colors.textOnDarkMuted}>
                      {entry.remindAt ? formatRelative(entry.remindAt) : 'Bugün'}
                    </AppText>
                  </View>
                  <ChevronRight />
                </Pressable>
              ))
            )}

            {/* Yaklaşan hatırlatma */}
            {nextUpcoming && !dueToday.some((e) => e.id === nextUpcoming.id) ? (
              <>
                <SectionHead title="Yaklaşan hatırlatma" />
                <Pressable onPress={() => router.push('/journal')} style={({ pressed }) => [s.row, pressed && s.pressed]}>
                  <RowIcon icon={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" color={colors.textOnDark} numberOfLines={1}>{nextUpcoming.typeLabel}</AppText>
                    <AppText variant="caption" color={colors.textOnDarkMuted}>
                      {nextUpcoming.remindAt ? formatRelative(nextUpcoming.remindAt) : '—'}
                    </AppText>
                  </View>
                  <ChevronRight />
                </Pressable>
              </>
            ) : null}

            {/* Son yürüyüş özeti */}
            <SectionHead title="Son yürüyüş" />
            {lastWalk ? (
              <Pressable onPress={() => router.push(`/walk/${lastWalk.id}`)} style={({ pressed }) => [s.row, pressed && s.pressed]}>
                <RowIcon icon={{ ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' }} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" color={colors.textOnDark}>
                    {formatDistance(lastWalk.distanceMeters)} · {formatPace(lastWalk.paceSecondsPerKm)} dk/km
                  </AppText>
                  <AppText variant="caption" color={colors.textOnDarkMuted}>{formatShortDate(lastWalk.startedAt)}</AppText>
                </View>
                <ChevronRight />
              </Pressable>
            ) : (
              <EmptyRow text="Henüz kaydedilmiş bir yürüyüş yok." action="Yürüyüşe çık" onAction={() => router.push('/(tabs)/live-walk')} />
            )}

            {/* Haftalık aktivite */}
            <SectionHead title="Bu haftaki aktivite" />
            <View style={s.progressCard}>
              <View style={{ flex: 1 }}>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${weeklyProgress * 100}%` }]} />
                </View>
                <AppText variant="caption" color={colors.textOnDarkMuted} style={{ marginTop: spacing.sm }}>
                  {summary ? `${Math.round(summary.weeklySeconds / 60)} dk · ${formatDistance(summary.weeklyMeters)} · ${summary.weeklyWalks} yürüyüş` : '—'}
                </AppText>
              </View>
            </View>

            {/* Kilo gelişimi */}
            <SectionHead title="Kilo gelişimi" />
            {weightSeries.length === 0 ? (
              <EmptyRow text="Henüz kilo kaydı yok." action="Kayıt ekle" onAction={() => router.push('/journal/add')} />
            ) : (
              <View style={s.weightCard}>
                <View style={s.sparkline}>
                  {weightSeries.slice(-10).map((point, index, arr) => {
                    const values = arr.map((p) => p.value as number);
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    const span = Math.max(max - min, 0.5);
                    const h = 8 + ((point.value as number) - min) / span * 40;
                    return <View key={point.occurredAt} style={[s.sparkBar, { height: h, marginLeft: index === 0 ? 0 : 4 }]} />;
                  })}
                </View>
                <AppText variant="bodyStrong" color={colors.textOnDark} style={{ marginTop: spacing.sm }}>
                  Son ölçüm: {lastWeight?.value} kg
                </AppText>
                <AppText variant="caption" color={colors.textOnDarkMuted}>
                  {lastWeight ? formatShortDate(lastWeight.occurredAt) : ''}
                </AppText>
              </View>
            )}

            {/* Son anılar */}
            <SectionHead title="Son anılar" action={memories.length > 0 ? 'Tümü' : undefined} onAction={() => router.push('/journal')} />
            {memories.length === 0 ? (
              <EmptyRow text="Henüz bir anı eklenmedi." />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {memories.slice(0, 8).map((m) => (
                    <View key={m.id} style={s.memoryThumb}>
                      {m.photoUrl ? (
                        <Image source={{ uri: m.photoUrl }} style={s.fill} />
                      ) : (
                        <View style={[s.fill, s.memoryFallback]}>
                          <SymbolView name={{ ios: 'photo', android: 'image', web: 'image' }} size={18} tintColor={colors.copperPale} />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* Sağlık belgeleri */}
            <SectionHead title="Sağlık belgeleri" action="Tümü" onAction={() => router.push(`/journal/documents?dogId=${dog.id}`)} />
            <Pressable onPress={() => router.push(`/journal/documents?dogId=${dog.id}`)} style={({ pressed }) => [s.row, pressed && s.pressed]}>
              <RowIcon icon={{ ios: 'doc.text.fill', android: 'description', web: 'description' }} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" color={colors.textOnDark}>
                  {documents.length > 0 ? `${documents.length} belge` : 'Henüz belge yok'}
                </AppText>
                <AppText variant="caption" color={colors.textOnDarkMuted}>Aşı karnesi, reçete, tahlil…</AppText>
              </View>
              <ChevronRight />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/journal/add')}
              style={({ pressed }) => [s.mainCta, pressed && s.pressed]}
            >
              <SymbolView name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }} size={22} tintColor={colors.textOnDark} />
              <AppText variant="bodyStrong" color={colors.textOnDark}>Günlüğe kayıt ekle</AppText>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionHead}>
      <AppText variant="heading" color={colors.textOnDark}>{title}</AppText>
      {action ? (
        <AppText variant="label" color={colors.copperPale} onPress={onAction}>{action}</AppText>
      ) : null}
    </View>
  );
}

function RowIcon({ icon }: { icon: SymbolViewProps['name'] }) {
  return (
    <View style={s.rowIcon}>
      <SymbolView name={icon} size={20} tintColor={colors.copperPale} />
    </View>
  );
}

function ChevronRight() {
  return (
    <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={18} tintColor={colors.textOnDarkMuted} />
  );
}

function EmptyRow({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.emptyRow}>
      <AppText variant="caption" color={colors.textOnDarkMuted}>{text}</AppText>
      {action ? (
        <Pressable onPress={onAction} style={{ marginTop: spacing.sm }}>
          <AppText variant="label" color={colors.copperPale}>{action}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.primaryDark },
  centered: { alignItems: 'center', justifyContent: 'center' },
  hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, alignItems: 'center' },
  heroTop: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  dogChip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  dogChipActive: { backgroundColor: colors.forestSoft, borderColor: colors.copperPale },
  dogPhotoWrap: { marginTop: spacing.md },
  dogPhoto: { width: 132, height: 132, borderRadius: 66, borderWidth: 3, borderColor: colors.copperPale },
  dogPhotoFallback: { backgroundColor: colors.forestSoft, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: spacing.lg },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.xl, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.obsidianSoft,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  pressed: { opacity: 0.85 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.07)',
  },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.obsidianSoft,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
    ...shadow.card,
  },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.12)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.copperPale },
  weightCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.obsidianSoft,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  sparkline: { flexDirection: 'row', alignItems: 'flex-end', height: 48 },
  sparkBar: { width: 6, borderRadius: 3, backgroundColor: colors.copper },
  memoryThumb: { width: 84, height: 84, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.forestSoft },
  memoryFallback: { alignItems: 'center', justifyContent: 'center' },
  fill: { width: '100%', height: '100%' },
  emptyRow: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.obsidianSoft,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  mainCta: {
    marginTop: spacing.xl,
    minHeight: 56,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.copperAction,
  },
});
