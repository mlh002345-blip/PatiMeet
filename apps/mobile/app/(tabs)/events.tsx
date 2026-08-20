import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '../../src/api';
import { EventCard } from '../../src/components/cards';
import {
  AppText,
  AppHeader,
  Banner,
  ChoiceGroup,
  IconAction,
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

/**
 * Etiketler 320 px genişlikte üç sütuna sığacak kadar kısa tutuldu;
 * "Oluşturduklarım" küçük Android ekranlarında kesiliyordu.
 */
const SCOPES: Array<{ value: Scope; label: string }> = [
  { value: 'upcoming', label: 'Yakınımda' },
  { value: 'joined', label: 'Katıldığım' },
  { value: 'mine', label: 'Oluşturduğum' },
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
      <AppHeader
        onNotifications={() => router.push('/settings/notifications')}
        action={
          <IconAction
            label="Yürüyüş planla"
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            tone="copper"
            onPress={() => router.push('/event/create')}
          />
        }
      />
      <AppText variant="kicker" color={colors.copper}>PATIMEET BULUŞMALARI</AppText>
      <AppText variant="title" style={{ marginTop: spacing.xs }}>Kulüp</AppText>
      <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
        İyi eşleşmelerin gerçek dostluğa dönüştüğü seçkin buluşmalar.
      </AppText>

      {actionError ? <Banner tone="error" message={actionError} /> : null}

      {/**
        * Kapsam sekmeleri. "Yaklaşan" ile "kayıtlı olduklarım" ayrımı net
        * kalsın diye seçili sekme bakır alt çizgiyle işaretleniyor.
        */}
      <View style={styles.scopeRow}>
        {SCOPES.map((item) => {
          const active = item.value === scope;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              aria-selected={active}
              onPress={() => setScope(item.value)}
              style={styles.scopeTab}
            >
              <AppText
                variant="label"
                color={active ? colors.primary : colors.textSubtle}
                numberOfLines={1}
                center
              >
                {item.label}
              </AppText>
              <View style={[styles.scopeUnderline, active && { backgroundColor: colors.copper }]} />
            </Pressable>
          );
        })}
      </View>

      {scope === 'upcoming' && user?.district ? (
        <View style={styles.districtToggle}>
          <AppText
            variant="label"
            color={onlyMyDistrict ? colors.copperDeep : colors.textMuted}
            onPress={() => setOnlyMyDistrict(true)}
          >
            {user.district}
          </AppText>
          <AppText
            variant="label"
            color={!onlyMyDistrict ? colors.copperDeep : colors.textMuted}
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
          <View style={styles.resultHeader}>
            <View>
              <AppText variant="kicker" color={colors.copper}>AJANDA</AppText>
              <AppText variant="title" style={{ marginTop: 2 }}>
                {loader.data.events.length} buluşma seni bekliyor
              </AppText>
            </View>
          </View>
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
          icon={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
          title={emptyCopy[scope].title}
          description={emptyCopy[scope].description}
          actionLabel="Yürüyüş planla"
          onAction={() => router.push('/event/create')}
        />
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  scopeRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: spacing.xs,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  scopeTab: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scopeUnderline: {
    marginTop: spacing.sm,
    height: 2,
    alignSelf: 'stretch',
    marginHorizontal: spacing.lg,
    backgroundColor: 'transparent',
  },
  districtToggle: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  resultHeader: {
    marginBottom: spacing.lg,
  },
});
