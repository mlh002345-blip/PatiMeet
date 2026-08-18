import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '../../src/api';
import { AlertCard } from '../../src/components/cards';
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  ScrollScreen,
} from '../../src/components/ui';
import { alertTypeEmoji, alertTypeLabels } from '../../src/labels';
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
    () =>
      api.alerts({
        type: type ?? undefined,
        district: onlyMyDistrict ? (user?.district ?? undefined) : undefined,
      }),
    [type, onlyMyDistrict, user?.district]
  );

  const alerts = loader.data?.alerts ?? [];

  return (
    <ScrollScreen refreshing={loader.refreshing} onRefresh={loader.refresh}>
      <AppText variant="display">Güvenli Topluluk</AppText>
      <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
        Semtindeki acil durumları ve yardım çağrılarını burada paylaşırsın. İlanlar kullanıcı
        beyanıdır; PatiMeet doğrulamaz.
      </AppText>

      <Button
        label="Bildirim oluştur"
        onPress={() => router.push('/alerts/create')}
        style={{ marginTop: spacing.lg }}
      />

      {/* Tür filtresi */}
      <View style={styles.filterRow}>
        <FilterChip label="Tümü" active={type === null} onPress={() => setType(null)} />
        {Object.entries(alertTypeLabels).map(([value, label]) => (
          <FilterChip
            key={value}
            label={`${alertTypeEmoji[value] ?? '📣'} ${label}`}
            active={type === value}
            onPress={() => setType(type === value ? null : value)}
          />
        ))}
      </View>

      {user?.district ? (
        <View style={styles.filterRow}>
          <FilterChip
            label={`📍 Yalnızca ${user.district}`}
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
          emoji="🛡️"
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
    </ScrollScreen>
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
