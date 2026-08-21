import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError, type JournalEntry } from '../../src/api';
import { AppText, Banner, DetailHeader, ErrorState, LoadingState } from '../../src/components/ui';
import { formatEventDate, formatShortDate } from '../../src/labels';
import { useSession } from '../../src/session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';
import { formatClock, formatDistance } from '../../src/walkTracker';

/**
 * Köpeğimin Günlüğü.
 *
 * Bireysel bakım merkezi: sosyal etkileşim olmasa da kullanıcının uygulamaya
 * dönmesini sağlayan yaklaşan bakım, gecikmiş kayıt, son yürüyüş, haftalık
 * hedef, kilo ve anı özeti. Her veri seçili köpeğe bağlıdır.
 */
export default function JournalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useSession();
  const dogs = user?.dogs ?? [];
  const [dogId, setDogId] = useState<string | null>(dogs[0]?.id ?? null);

  const activeDog = dogs.find((d) => d.id === dogId) ?? dogs[0];

  const loader = useLoader(async () => {
    if (!activeDog) throw new ApiError(400, 'no_dog', 'Önce bir köpek profili ekle.');
    const [overview, walks, summary, memories] = await Promise.all([
      api.journalOverview(activeDog.id),
      api.walks().catch(() => ({ walks: [] })),
      api.walkSummary().catch(() => ({
        weeklySeconds: 0,
        weeklyMeters: 0,
        weeklyWalks: 0,
        todaySeconds: 0,
      })),
      api.memories(activeDog.id).catch(() => ({ memories: [] })),
    ]);
    return { overview, walks: walks.walks, summary, memories: memories.memories };
  }, [activeDog?.id]);

  if (!activeDog) {
    return (
      <View style={s.screen}>
        <Banner tone="info" message="Günlüğü kullanmak için önce bir köpek profili ekle." />
      </View>
    );
  }

  const weeklyGoalSeconds = 150 * 60; // haftada 150 dk
  const progress = Math.min(1, (loader.data?.summary.weeklySeconds ?? 0) / weeklyGoalSeconds);

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl }}
    >
      <DetailHeader label="Köpeğimin Günlüğü" onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }}>
      {/* Köpek seçimi — her veri seçili köpeğe bağlı */}
      {dogs.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
          <View style={s.dogRow}>
            {dogs.map((d) => {
              const active = d.id === activeDog.id;
              return (
                <Pressable
                  key={d.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setDogId(d.id)}
                  style={[s.dogChip, active && s.dogChipActive]}
                >
                  <View style={s.dogAvatar}>
                    {d.photoUrl ? (
                      <Image source={{ uri: d.photoUrl }} style={s.fill} />
                    ) : (
                      <AppText variant="label" color={colors.textOnDark}>
                        {d.name[0]}
                      </AppText>
                    )}
                  </View>
                  <AppText variant="label" color={active ? colors.textOnDark : colors.textOnDarkMuted}>
                    {d.name}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      <AppText variant="heading" color={colors.textOnDark}>
        {activeDog.name} günlüğü
      </AppText>

      {/* Hızlı kayıt ve acil durum kartı */}
      <View style={s.quickRow}>
        <QuickTile
          label="Kayıt ekle"
          icon={{ ios: 'plus', android: 'add', web: 'add' }}
          onPress={() => router.push(`/journal/add?dogId=${activeDog.id}`)}
        />
        <QuickTile
          label="Belgeler"
          icon={{ ios: 'doc.text', android: 'description', web: 'description' }}
          onPress={() => router.push(`/journal/documents?dogId=${activeDog.id}`)}
        />
        <QuickTile
          label="Acil kart"
          icon={{ ios: 'cross.case', android: 'medical_services', web: 'medical_services' }}
          onPress={() => router.push(`/journal/emergency?dogId=${activeDog.id}`)}
        />
      </View>

      {loader.loading ? (
        <LoadingState />
      ) : loader.error ? (
        <ErrorState message={loader.error} onRetry={loader.reload} />
      ) : loader.data ? (
        <>
          {/* Haftalık aktivite hedefi — gerçek yürüyüş verisinden */}
          <Section title="Haftalık aktivite" />
          <View style={s.card}>
            <View style={s.goalRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" color={colors.textOnDark}>
                  {formatClock(loader.data.summary.weeklySeconds)} yürüyüş
                </AppText>
                <AppText variant="caption" color={colors.textOnDarkMuted} style={{ marginTop: 2 }}>
                  {loader.data.summary.weeklyWalks} yürüyüş ·{' '}
                  {formatDistance(loader.data.summary.weeklyMeters)} · hedef 150 dk
                </AppText>
              </View>
              <AppText variant="heading" color={colors.copperPale}>
                %{Math.round(progress * 100)}
              </AppText>
            </View>
            <View style={s.track}>
              <View style={[s.fillBar, { width: `${progress * 100}%` }]} />
            </View>
          </View>

          {/* Gecikmiş kayıtlar önce */}
          {loader.data.overview.overdue.length > 0 ? (
            <>
              <Section title="Gecikmiş" />
              {loader.data.overview.overdue.map((entry) => (
                <ReminderCard key={entry.id} entry={entry} overdue onDone={loader.reload} />
              ))}
            </>
          ) : null}

          <Section title="Yaklaşan bakım" />
          {loader.data.overview.upcoming.length > 0 ? (
            loader.data.overview.upcoming.map((entry) => (
              <ReminderCard key={entry.id} entry={entry} onDone={loader.reload} />
            ))
          ) : (
            <EmptyLine text="Yaklaşan bakım kaydı yok." />
          )}

          {/* Son kilo ve değişim */}
          {loader.data.overview.weightSeries.length > 0 ? (
            <>
              <Section title="Kilo takibi" />
              <WeightCard series={loader.data.overview.weightSeries} />
            </>
          ) : null}

          <Section
            title="Son yürüyüşler"
            actionLabel="Tümü"
            onAction={() => router.push('/(tabs)/live-walk')}
          />
          {loader.data.walks.length > 0 ? (
            loader.data.walks.slice(0, 3).map((walk) => (
              <Pressable
                key={walk.id}
                accessibilityRole="button"
                onPress={() => router.push(`/walk/${walk.id}`)}
                style={({ pressed }) => [s.card, s.row, pressed && { opacity: 0.85 }]}
              >
                <SymbolView
                  name={{ ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' }}
                  size={22}
                  tintColor={colors.copperPale}
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" color={colors.textOnDark}>
                    {formatDistance(walk.distanceMeters)} · {formatClock(walk.durationSeconds)}
                  </AppText>
                  <AppText variant="caption" color={colors.textOnDarkMuted}>
                    {formatEventDate(walk.startedAt)}
                  </AppText>
                </View>
              </Pressable>
            ))
          ) : (
            <EmptyLine text="Henüz kaydedilmiş yürüyüş yok." />
          )}

          <Section title="Son anılar" />
          {loader.data.memories.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.memoryRow}>
                {loader.data.memories.slice(0, 8).map((memory) => (
                  <View key={memory.id} style={s.memory}>
                    {memory.photoUrl ? (
                      <Image source={{ uri: memory.photoUrl }} style={s.fill} />
                    ) : (
                      <SymbolView
                        name={{ ios: 'photo', android: 'photo', web: 'photo' }}
                        size={20}
                        tintColor={colors.textOnDarkMuted}
                      />
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : (
            <EmptyLine text="Henüz anı eklenmedi." />
          )}

          <Section title="Son kayıtlar" />
          {loader.data.overview.recent.length > 0 ? (
            loader.data.overview.recent.map((entry) => (
              <View key={entry.id} style={[s.card, s.row]}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" color={colors.textOnDark}>
                    {entry.typeLabel}
                    {entry.value !== null ? ` · ${entry.value} ${entry.valueUnit ?? ''}` : ''}
                  </AppText>
                  <AppText variant="caption" color={colors.textOnDarkMuted}>
                    {formatShortDate(entry.occurredAt)}
                    {entry.title ? ` · ${entry.title}` : ''}
                  </AppText>
                </View>
              </View>
            ))
          ) : (
            <EmptyLine text="Henüz kayıt yok." />
          )}
        </>
      ) : null}
      </View>
    </ScrollView>
  );
}

function Section({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.sectionHead}>
      <AppText variant="label" color={colors.copper}>
        {title.toLocaleUpperCase('tr-TR')}
      </AppText>
      {actionLabel && onAction ? (
        <AppText variant="label" color={colors.copperPale} onPress={onAction}>
          {actionLabel}
        </AppText>
      ) : null}
    </View>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <View style={[s.card, { paddingVertical: spacing.md }]}>
      <AppText variant="caption" color={colors.textOnDarkMuted}>
        {text}
      </AppText>
    </View>
  );
}

function QuickTile({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.quickTile, pressed && { opacity: 0.8 }]}
    >
      <SymbolView name={icon} size={24} tintColor={colors.textOnDark} />
      <AppText variant="label" color={colors.textOnDark} center numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

function ReminderCard({
  entry,
  overdue,
  onDone,
}: {
  entry: JournalEntry;
  overdue?: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function complete() {
    setBusy(true);
    try {
      await api.updateReminder(entry.id, { status: 'done' });
      onDone();
    } catch {
      setBusy(false);
    }
  }

  return (
    <View style={[s.card, s.row, overdue && { borderColor: colors.danger }]}>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" color={colors.textOnDark}>
          {entry.typeLabel}
          {entry.title ? ` · ${entry.title}` : ''}
        </AppText>
        <AppText
          variant="caption"
          color={overdue ? '#F0A79C' : colors.textOnDarkMuted}
          style={{ marginTop: 2 }}
        >
          {entry.remindAt ? formatEventDate(entry.remindAt) : ''}
          {overdue ? ' · gecikti' : ''}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.typeLabel} tamamlandı`}
        onPress={complete}
        disabled={busy}
        style={({ pressed }) => [s.doneButton, (pressed || busy) && { opacity: 0.7 }]}
      >
        <SymbolView
          name={{ ios: 'checkmark', android: 'check', web: 'check' }}
          size={18}
          tintColor={colors.textOnDark}
        />
      </Pressable>
    </View>
  );
}

function WeightCard({ series }: { series: Array<{ occurredAt: number; value: number | null }> }) {
  const values = series.map((p) => p.value ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.5);
  const latest = values[values.length - 1];
  const previous = values.length > 1 ? values[values.length - 2] : null;
  const delta = previous !== null ? latest - previous : null;

  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading" color={colors.textOnDark}>
            {latest.toFixed(1).replace('.', ',')} kg
          </AppText>
          {delta !== null ? (
            <AppText
              variant="caption"
              color={delta === 0 ? colors.textOnDarkMuted : delta > 0 ? '#F0C48C' : '#9BD3AE'}
            >
              {delta > 0 ? '+' : ''}
              {delta.toFixed(1).replace('.', ',')} kg · önceki ölçüme göre
            </AppText>
          ) : null}
        </View>
      </View>

      {/* Basit sütun grafiği — veteriner teşhisi yerine geçmez. */}
      <View style={s.chart}>
        {series.map((point, index) => {
          const height = 8 + (((point.value ?? min) - min) / span) * 46;
          return (
            <View
              key={`${point.occurredAt}-${index}`}
              style={[s.bar, { height, backgroundColor: index === series.length - 1 ? colors.copperPale : colors.forestSoft }]}
            />
          );
        })}
      </View>

      <AppText variant="caption" color={colors.textOnDarkMuted}>
        Bilgi amaçlıdır; veteriner değerlendirmesi yerine geçmez.
      </AppText>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.primaryDark },
  dogRow: { flexDirection: 'row', gap: spacing.sm },
  dogChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  dogChipActive: { backgroundColor: colors.forestSoft, borderColor: colors.copperPale },
  dogAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forestSoft,
  },
  fill: { width: '100%', height: '100%' },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  quickTile: {
    flex: 1,
    minHeight: 88,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#294F3D',
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.obsidianSoft,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  track: {
    height: 6,
    borderRadius: 3,
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,.12)',
    overflow: 'hidden',
  },
  fillBar: { height: '100%', borderRadius: 3, backgroundColor: colors.copperPale },
  doneButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.copperAction,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    height: 60,
    marginVertical: spacing.md,
  },
  bar: { flex: 1, borderRadius: 3, minWidth: 6 },
  memoryRow: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.sm },
  memory: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.obsidianSoft,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
});
