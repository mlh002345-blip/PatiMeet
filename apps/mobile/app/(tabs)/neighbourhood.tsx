import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api, type FeedItem, type PlayGroup } from '../../src/api';
import { AppHeader, AppText, ErrorState, LoadingState, ScrollScreen } from '../../src/components/ui';
import { dogSizeLabels, formatEventDate, formatRelative, playStyleLabels } from '../../src/labels';
import { markNeighbourhoodSeen } from '../../src/neighbourhoodBadge';
import { useSession } from '../../src/session';
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
 * Mahalle — ana navigasyonun 4. sekmesi.
 *
 * Semtteki etkinlikleri, hızlı yürüyüş davetlerini, Güvenli Topluluk
 * bildirimlerini ve oyun gruplarını TEK ekranda gösterir. İçerikler kaynak
 * kayıtlardan gelir; ikinci bir kopya tutulmaz. Tam adres veya kesin konum
 * hiçbir kartta yok. Engellenen kullanıcıların içerikleri sunucu tarafında
 * zaten filtrelenir (bkz. api/domain/neighbourhood.ts#hiddenUserIds).
 *
 * Bu ekran aynı zamanda eski `/neighbourhood` derin bağlantısının kanonik
 * hedefidir — URL değişmedi, yalnızca ekran artık bir sekme.
 */
export default function NeighbourhoodScreen() {
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

  const groupsLoader = useLoader(
    () => api.groups({ district: user?.district ?? undefined }),
    [user?.district]
  );

  // Sekmeye her girişte "yeni içerik" göstergesi temizlenir.
  useFocusEffect(
    useCallback(() => {
      void markNeighbourhoodSeen();
    }, [])
  );

  const items = loader.data?.items ?? [];
  const groups = groupsLoader.data?.groups ?? [];

  function open(item: FeedItem) {
    if (item.kind === 'event') router.push(`/event/${item.id}`);
    else if (item.kind === 'alert') router.push(`/alerts/${item.id}`);
    else router.push(`/neighbourhood/invite/${item.id}`);
  }

  async function toggleGroup(group: PlayGroup) {
    try {
      if (group.isMember) await api.leaveGroup(group.id);
      else await api.joinGroup(group.id);
      groupsLoader.reload();
    } catch {
      // Sessizce geç; kullanıcı tekrar dokunabilir.
    }
  }

  return (
    <ScrollScreen refreshing={loader.refreshing || groupsLoader.refreshing} onRefresh={() => { loader.refresh(); groupsLoader.refresh(); }}>
      <AppHeader onNotifications={() => router.push('/settings/notifications')} />
      <AppText variant="kicker" color={colors.copper}>MAHALLE</AppText>
      <AppText variant="title" style={{ marginTop: spacing.xs }}>Semtinde bugün</AppText>
      <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}>
        Yürüyüş davetleri, etkinlikler, Güvenli Topluluk bildirimleri ve oyun grupları — hepsi
        burada.
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

      {/* Oyun grupları */}
      <View style={s.sectionHead}>
        <AppText variant="heading">Oyun grupları</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.push('/neighbourhood/create-group')}>
          <AppText variant="label" color={colors.copper}>+ Grup oluştur</AppText>
        </Pressable>
      </View>
      {groupsLoader.loading ? (
        <LoadingState label="Gruplar yükleniyor…" />
      ) : groups.length === 0 ? (
        <AppText variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.lg }}>
          Semtinde henüz bir oyun grubu yok — ilkini sen kur.
        </AppText>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {groups.map((group) => (
              <View key={group.id} style={s.groupCard}>
                {group.coverPhotoUrl ? (
                  <Image source={{ uri: group.coverPhotoUrl }} style={s.groupCover} />
                ) : (
                  <View style={[s.groupCover, s.groupCoverFallback]}>
                    <SymbolView
                      name={{ ios: 'pawprint.fill', android: 'pets', web: 'pets' }}
                      size={20}
                      tintColor={colors.copperPale}
                    />
                  </View>
                )}
                <AppText variant="bodyStrong" color={colors.textOnDark} numberOfLines={1} style={{ marginTop: spacing.sm }}>
                  {group.name}
                </AppText>
                <AppText variant="caption" color={colors.textOnDarkMuted} numberOfLines={1}>
                  {dogSizeLabels[group.dogSize] ?? group.dogSize} ·{' '}
                  {playStyleLabels[group.playStyle] ?? group.playStyle}
                </AppText>
                <AppText variant="caption" color={colors.textOnDarkMuted}>
                  {group.memberCount} üye
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: group.isMember }}
                  onPress={() => toggleGroup(group)}
                  style={[s.groupJoinBtn, group.isMember && s.groupJoinBtnActive]}
                >
                  <AppText variant="label" color={group.isMember ? colors.copperPale : colors.textOnDark}>
                    {group.isMember ? 'Üyesin' : 'Katıl'}
                  </AppText>
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Akış filtreleri */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.md }}>
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
                <AppText variant="label" color={active ? colors.textOnDark : colors.textOnDarkMuted}>
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
              <AppText variant="label" color={onlyMyDistrict ? colors.textOnDark : colors.textOnDarkMuted}>
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
    </ScrollScreen>
  );
}

const s = StyleSheet.create({
  cta: {
    marginTop: spacing.sm,
    minHeight: 56,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.copperAction,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  groupCard: {
    width: 148,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.obsidianSoft,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  groupCover: { width: '100%', height: 72, borderRadius: radius.md, backgroundColor: colors.forestSoft },
  groupCoverFallback: { alignItems: 'center', justifyContent: 'center' },
  groupJoinBtn: {
    marginTop: spacing.sm,
    minHeight: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.copperAction,
  },
  groupJoinBtnActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.copperPale },
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
