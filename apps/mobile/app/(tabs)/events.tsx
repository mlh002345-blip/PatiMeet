import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '../../src/api';
import { EventCard } from '../../src/components/cards';
import {
  AppText,
  AppHeader,
  Banner,
  Button,
  ChoiceGroup,
  EmptyState,
  ErrorState,
  LoadingState,
  ScrollScreen,
} from '../../src/components/ui';
import { eventTypeLabels } from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

type Scope = 'upcoming' | 'joined' | 'mine';

const SCOPES: Array<{ value: Scope; label: string }> = [
  { value: 'upcoming', label: 'Yakındakiler' },
  { value: 'joined', label: 'Katıldıklarım' },
  { value: 'mine', label: 'Oluşturduklarım' },
];

/** Etkinlik listesi (9/14). */
export default function EventsScreen() {
  const router = useRouter();
  const { user } = useSession();

  const [scope, setScope] = useState<Scope>('upcoming');
  const [type, setType] = useState<string | null>(null);
  const [onlyMyDistrict, setOnlyMyDistrict] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loader = useLoader(
    () =>
      api.events({
        scope,
        type: type ?? undefined,
        // "Yakındakiler" sekmesinde varsayılan olarak kendi semti gösterilir.
        district:
          scope === 'upcoming' && onlyMyDistrict ? user?.district ?? undefined : undefined,
      }),
    [scope, type, onlyMyDistrict, user?.district]
  );

  const emptyCopy: Record<Scope, { title: string; description: string }> = {
    upcoming: {
      title: onlyMyDistrict ? 'Semtinde etkinlik yok' : 'Yaklaşan etkinlik yok',
      description: onlyMyDistrict
        ? 'Tüm semtleri görmeyi deneyebilir veya ilk yürüyüşü sen oluşturabilirsin.'
        : 'İlk yürüyüşü sen başlat, çevrendeki köpek sahipleri katılsın.',
    },
    joined: {
      title: 'Henüz bir etkinliğe katılmadın',
      description: 'Yakındaki etkinliklere göz atıp katılabilirsin.',
    },
    mine: {
      title: 'Henüz etkinlik oluşturmadın',
      description: 'Kendi yürüyüşünü planla, katılımcıları burada takip et.',
    },
  };

  async function quickJoin(eventId: string) {
    if ((user?.dogs?.length ?? 0) !== 1) {
      router.push(`/event/${eventId}`);
      return;
    }
    setActionError(null);
    setJoiningId(eventId);
    try {
      await api.joinEvent(eventId, user?.dogs?.[0]?.id);
      await loader.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Etkinliğe katılınamadı.');
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <ScrollScreen refreshing={loader.refreshing} onRefresh={loader.refresh}>
      <AppHeader onNotifications={() => router.push('/settings/notifications')} />
      <AppText variant="display">Etkinlikler</AppText>
      <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
        Birlikte yürüyüşler ve buluşmalar.
      </AppText>

      {actionError ? <Banner tone="error" message={actionError} /> : null}

      <Button
        label="+ Yürüyüş oluştur"
        onPress={() => router.push('/event/create')}
        style={{ marginTop: spacing.lg }}
      />

      {/* Kapsam sekmeleri */}
      <View style={styles.scopeRow}>
        {SCOPES.map((item) => {
          const active = item.value === scope;
          return (
            <View
              key={item.value}
              style={[styles.scopeTab, active && styles.scopeTabActive]}
            >
              <AppText
                variant="label"
                color={active ? colors.primary : colors.textMuted}
                onPress={() => setScope(item.value)}
                center
              >
                {item.label}
              </AppText>
            </View>
          );
        })}
      </View>

      {scope === 'upcoming' && user?.district ? (
        <View style={styles.districtToggle}>
          <AppText
            variant="label"
            color={onlyMyDistrict ? colors.primary : colors.textMuted}
            onPress={() => setOnlyMyDistrict(true)}
          >
            📍 {user.district}
          </AppText>
          <AppText
            variant="label"
            color={!onlyMyDistrict ? colors.primary : colors.textMuted}
            onPress={() => setOnlyMyDistrict(false)}
          >
            Tüm semtler
          </AppText>
        </View>
      ) : null}

      <ChoiceGroup
        label="Etkinlik türü"
        options={Object.entries(eventTypeLabels).map(([value, label]) => ({ value, label }))}
        value={type}
        onChange={(value) => setType(type === value ? null : value)}
      />

      {loader.loading ? (
        <LoadingState label="Etkinlikler yükleniyor…" />
      ) : loader.error ? (
        <ErrorState message={loader.error} onRetry={loader.reload} />
      ) : loader.data && loader.data.events.length > 0 ? (
        <View>
          <AppText variant="caption" color={colors.textSubtle} style={{ marginBottom: spacing.md }}>
            {loader.data.events.length} etkinlik
          </AppText>
          {loader.data.events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onPress={() => router.push(`/event/${event.id}`)}
              onJoin={!event.hasJoined && !event.isOwner && !event.isFull ? () => quickJoin(event.id) : undefined}
              joining={joiningId === event.id}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          emoji="📅"
          title={emptyCopy[scope].title}
          description={emptyCopy[scope].description}
          actionLabel="Yürüyüş oluştur"
          onAction={() => router.push('/event/create')}
        />
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  scopeRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 4,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  scopeTab: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  scopeTabActive: {
    backgroundColor: colors.surface,
  },
  districtToggle: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginBottom: spacing.lg,
  },
});
