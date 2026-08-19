import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api, type AreaSummary, type EventSummary } from '../../src/api';
import { AlertCard } from '../../src/components/cards';
import {
  AppText,
  AppHeader,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  ScrollScreen,
  SectionHeader,
  Tag,
} from '../../src/components/ui';
import { alertTypeLabels, formatShortDate } from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

/**
 * Güvenli Topluluk — bildirim listesi.
 *
 * Kayıp hayvan ilanları da bu listede. Konum olarak yalnızca semt ve
 * yaklaşık bölge tarifi gösterilir; kesin konum hiç toplanmaz.
 */
export default function AlertsScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [type, setType] = useState<string | null>(null);
  const [onlyMyDistrict, setOnlyMyDistrict] = useState(false);

  const loader = useLoader(
    async () => {
      const [list, summary, history] = await Promise.all([
        api.alerts({
          type: type ?? undefined,
          district: onlyMyDistrict ? (user?.district ?? undefined) : undefined,
        }),
        /**
         * Özet ve geçmiş etkinlikler yardımcı bölümler: biri hata verse de
         * bildirim listesi açılmalı.
         */
        api.areaSummary().catch(() => null),
        api.events({ scope: 'history' }).catch(() => ({ events: [] as EventSummary[] })),
      ]);
      return { alerts: list.alerts, summary, history: history.events };
    },
    [type, onlyMyDistrict, user?.district]
  );

  const alerts = loader.data?.alerts ?? [];
  // Değerlendirilebilecek etkinlikler: katıldığın, bitmiş olanlar.
  const reviewable = (loader.data?.history ?? []).filter((event) => event.hasJoined).slice(0, 3);

  return (
    <ScrollScreen refreshing={loader.refreshing} onRefresh={loader.refresh}>
      <AppHeader onNotifications={() => router.push('/settings/notifications')} />
      <AppText variant="kicker" color={colors.copper}>MAHALLE DAYANIŞMASI</AppText>
      <AppText variant="editorial" style={{ marginTop: spacing.xs }}>Güvenli Topluluk</AppText>
      <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
        Semtindeki acil durumları ve yardım çağrılarını burada paylaşırsın. İlanlar kullanıcı
        beyanıdır; PatiMeet doğrulamaz.
      </AppText>

      <Button
        label="Bildirim oluştur"
        onPress={() => router.push('/alerts/create')}
        style={{ marginTop: spacing.lg }}
      />

      {/* Yaklaşık bölge özeti */}
      <SectionHeader title="Yaklaşık bölge" />
      <AreaMapCard summary={loader.data?.summary ?? null} district={user?.district ?? null} />

      {/* Tür filtresi */}
      <View style={styles.filterRow}>
        <FilterChip label="Tümü" active={type === null} onPress={() => setType(null)} />
        {Object.entries(alertTypeLabels).map(([value, label]) => (
          <FilterChip
            key={value}
            label={label}
            active={type === value}
            onPress={() => setType(type === value ? null : value)}
          />
        ))}
      </View>

      {user?.district ? (
        <View style={styles.filterRow}>
          <FilterChip
            label={`Yalnızca ${user.district}`}
            active={onlyMyDistrict}
            onPress={() => setOnlyMyDistrict((v) => !v)}
          />
        </View>
      ) : null}

      {loader.loading ? (
        <LoadingState label="Bildirimler yükleniyor…" />
      ) : loader.error ? (
        <ErrorState message={loader.error} onRetry={loader.reload} />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={{ ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' }}
          title="Şu an açık bildirim yok"
          description="Bu iyi haber. Bir şey fark edersen komşularını buradan uyarabilirsin."
          actionLabel="Bildirim oluştur"
          onAction={() => router.push('/alerts/create')}
        />
      ) : (
        alerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onPress={() => router.push(`/alerts/${alert.id}`)}
          />
        ))
      )}

      {/* Etkinlik sonrası güven değerlendirmesi */}
      <SectionHeader title="Etkinlik sonrası güven" />
      <Card>
        <AppText variant="bodyStrong">Katıldığın etkinliği değerlendir</AppText>
        <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
          Etkinlik bittikten sonra 1–5 yıldız, "güvende hissettim" bilgisi ve isteğe bağlı bir
          yorum bırakabilirsin. Ciddi durumlarda şikâyet sistemi moderasyona iletir.
        </AppText>
      </Card>

      {reviewable.length > 0 ? (
        reviewable.map((event) => (
          <Card key={event.id} style={{ marginTop: spacing.sm }}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {event.title}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {event.district} · {formatShortDate(event.startsAt)}
            </AppText>
            <Button
              label="Değerlendir"
              variant="secondary"
              style={{ marginTop: spacing.md }}
              onPress={() => router.push(`/event/${event.id}`)}
            />
          </Card>
        ))
      ) : (
        <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>
          Değerlendirebileceğin geçmiş etkinlik yok.
        </AppText>
      )}
    </ScrollScreen>
  );
}

/**
 * Yaklaşık bölge kartı.
 *
 * Soyut bir yoğunluk görseli — gerçek bir harita katmanı, adres veya anlık
 * konum DEĞİL. Sunucu yalnızca semt düzeyinde sayı döndürür.
 */
function AreaMapCard({
  summary,
  district,
}: {
  summary: AreaSummary | null;
  district: string | null;
}) {
  return (
    <Card>
      <View style={styles.map}>
        <View style={[styles.zone, { left: '12%', top: 35, width: 120, height: 90 }]} />
        <View style={[styles.zone, { right: '8%', top: 75, width: 145, height: 110, opacity: 0.55 }]} />
        <View style={styles.pin}>
          <SymbolView
            name={{ ios: 'shield.lefthalf.filled', android: 'shield', web: 'shield' }}
            size={24}
            tintColor={colors.copper}
          />
        </View>
      </View>

      <View style={styles.summaryTags}>
        <Tag label={`${district ?? 'Semtin'} çevresi`} tone="primary" />
        <Tag label={`${summary?.nearbyDogs ?? 0} köpek`} tone="success" />
        <Tag label={`${summary?.upcomingEvents ?? 0} etkinlik`} tone="accent" />
        <Tag label={`${summary?.lostDogAlerts ?? 0} kayıp ilanı`} tone="danger" />
      </View>

      <AppText variant="caption" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
        İşaretler gerçek adres veya anlık konum değildir. Güvenlik için yalnızca yaklaşık bölge
        gösterilir.
      </AppText>
    </Card>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && { backgroundColor: colors.primary, borderColor: colors.primary },
        pressed && { opacity: 0.85 },
      ]}
    >
      <AppText variant="label" color={active ? colors.textOnPrimary : colors.textMuted}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 210,
    borderRadius: radius.lg,
    backgroundColor: colors.obsidian,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  zone: {
    position: 'absolute',
    borderRadius: 80,
    backgroundColor: 'rgba(181, 113, 60, 0.18)',
    borderWidth: 1,
    borderColor: colors.copper,
  },
  pin: {
    position: 'absolute',
    left: '47%',
    top: 78,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.obsidianSoft,
    borderWidth: 1,
    borderColor: colors.copper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
