import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { api, type FeedItem } from '../../src/api';
import { AppText, DetailHeader, ErrorState, LoadingState } from '../../src/components/ui';
import { formatEventDate, formatRelative } from '../../src/labels';
import { useSession } from '../../src/session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

const KIND_FILTERS = [
  { value: '', label: 'Tümü' },
  { value: 'invite', label: 'Yürüyüş daveti' },
  { value: 'event', label: 'Etkinlik' },
  { value: 'alert', label: 'Güvenli topluluk' },
];

function kindIcon(kind: FeedItem['kind']): SymbolViewProps['name'] {
  if (kind === 'event') return { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' };
  if (kind === 'invite') return { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' };
  return { ios: 'shield.fill', android: 'shield', web: 'shield' };
}

/**
 * Mahalle Akışı.
 *
 * Semtteki etkinlikleri, hızlı yürüyüş davetlerini ve Güvenli Topluluk
 * bildirimlerini TEK listede gösterir. İçerikler kaynak kayıtlardan gelir;
 * ikinci bir kopya tutulmaz. Tam adres veya kesin konum hiçbir kartta yok.
 */
export default function NeighbourhoodScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useSession();
  const [kind, setKind] = useState('');
  const [onlyMyDistrict, setOnlyMyDistrict] = useState(true);

  const loader = useLoader(
    () =>
      api.feed({
        kinds: kind || undefined,
        district: onlyMyDistrict ? (user?.district ?? undefined) : undefined,
      }),
    [kind, onlyMyDistrict, user?.district]
  );

  const items = loader.data?.items ?? [];

  function open(item: FeedItem) {
    if (item.kind === 'event') router.push(`/event/${item.id}`);
    else if (item.kind === 'alert') router.push(`/alerts/${item.id}`);
    else router.push(`/neighbourhood/invite/${item.id}`);
  }

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={loader.refreshing}
          onRefresh={loader.refresh}
          tintColor={colors.copperPale}
        />
      }
    >
      <DetailHeader label="Mahalle akışı" onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }}>
      <AppText variant="body" color={colors.textOnDarkMuted}>
        Semtinde olup bitenler ve birlikte yürüme fırsatları.
      </AppText>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/neighbourhood/create-invite')}
        style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}
      >
        <SymbolView
          name={{ ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' }}
          size={22}
          tintColor={colors.textOnDark}
        />
        <AppText variant="bodyStrong" color={colors.textOnDark}>
          Hızlı yürüyüş daveti aç
        </AppText>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.lg }}>
        <View style={s.filterRow}>
          {KIND_FILTERS.map((filter) => {
            const active = filter.value === kind;
            return (
              <Pressable
                key={filter.value || 'all'}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setKind(filter.value)}
                style={[s.chip, active && s.chipActive]}
              >
                <AppText
                  variant="label"
                  color={active ? colors.textOnDark : colors.textOnDarkMuted}
                >
                  {filter.label}
                </AppText>
              </Pressable>
            );
          })}
          {user?.district ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: onlyMyDistrict }}
              onPress={() => setOnlyMyDistrict((v) => !v)}
              style={[s.chip, onlyMyDistrict && s.chipActive]}
            >
              <AppText
                variant="label"
                color={onlyMyDistrict ? colors.textOnDark : colors.textOnDarkMuted}
              >
                {user.district}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {loader.loading ? (
        <LoadingState label="Akış yükleniyor…" />
      ) : loader.error ? (
        <ErrorState message={loader.error} onRetry={loader.reload} />
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <SymbolView
            name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
            size={26}
            tintColor={colors.copperPale}
          />
          <AppText variant="bodyStrong" color={colors.textOnDark} center style={{ marginTop: spacing.md }}>
            Şu an akışta bir şey yok
          </AppText>
          <AppText variant="caption" color={colors.textOnDarkMuted} center style={{ marginTop: spacing.xs }}>
            İlk hareketi sen başlat: hızlı bir yürüyüş daveti aç.
          </AppText>
        </View>
      ) : (
        items.map((item) => (
          <Pressable
            key={`${item.kind}-${item.id}`}
            accessibilityRole="button"
            onPress={() => open(item)}
            style={({ pressed }) => [s.card, pressed && { opacity: 0.86 }]}
          >
            {item.photoUrl ? (
              <Image source={{ uri: item.photoUrl }} style={s.thumb} />
            ) : (
              <View style={[s.thumb, s.thumbFallback]}>
                <SymbolView name={kindIcon(item.kind)} size={22} tintColor={colors.copperPale} />
              </View>
            )}

            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={colors.copper}>
                {item.kind === 'event'
                  ? 'ETKİNLİK'
                  : item.kind === 'invite'
                    ? 'HIZLI DAVET'
                    : 'GÜVENLİ TOPLULUK'}
              </AppText>
              <AppText variant="bodyStrong" color={colors.textOnDark} numberOfLines={1}>
                {item.title}
              </AppText>
              <AppText variant="caption" color={colors.textOnDarkMuted} numberOfLines={1}>
                {item.subtitle} · {item.district}
              </AppText>
              <AppText variant="caption" color={colors.textOnDarkMuted} style={{ marginTop: 2 }}>
                {typeof item.meta.startsAt === 'number'
                  ? formatEventDate(item.meta.startsAt)
                  : formatRelative(item.sortAt)}
              </AppText>
            </View>

            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={18}
              tintColor={colors.textOnDarkMuted}
            />
          </Pressable>
        ))
      )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.primaryDark },
  cta: {
    marginTop: spacing.lg,
    minHeight: 56,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.copperAction,
  },
  filterRow: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.md },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  chipActive: { backgroundColor: colors.forestSoft, borderColor: colors.copperPale },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.obsidianSoft,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.forestSoft,
  },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  empty: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    backgroundColor: colors.obsidianSoft,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
});
