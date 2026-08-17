import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '../../src/api';
import { DogCard } from '../../src/components/cards';
import {
  AppText,
  ChoiceGroup,
  EmptyState,
  ErrorState,
  LoadingState,
  ScrollScreen,
  SearchField,
  Tag,
} from '../../src/components/ui';
import { dogSizeLabels, energyLabels } from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

/**
 * Keşfet (7/14).
 *
 * Semt, boyut ve enerji seviyesine göre temel filtreleme (MVP 4.4). Yalnızca
 * semt bilgisi gösterilir; tam konum veya adres hiçbir zaman dönmez.
 */
export default function DiscoverScreen() {
  const router = useRouter();
  const { user } = useSession();

  const [district, setDistrict] = useState<string | null>(user?.district ?? null);
  const [size, setSize] = useState<string | null>(null);
  const [energy, setEnergy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loader = useLoader(
    () =>
      api.discover({
        district: district ?? undefined,
        size: size ?? undefined,
        energy: energy ?? undefined,
        search: search.trim() || undefined,
      }),
    [district, size, energy, search]
  );

  const activeFilterCount = [size, energy].filter(Boolean).length + (district ? 1 : 0);
  // Eski/demo veride yinelenen kayıt olsa bile aynı köpek iki kez gösterilmez.
  const visibleItems = loader.data
    ? Array.from(new Map(loader.data.items.map((item) => [item.dog.id, item])).values())
    : [];

  function clearFilters() {
    setSize(null);
    setEnergy(null);
    setDistrict(null);
    setSearch('');
  }

  return (
    <ScrollScreen refreshing={loader.refreshing} onRefresh={loader.refresh}>
      <AppText variant="display">Keşfet</AppText>
      <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
        Yakınındaki köpekleri gör, sahibine mesaj gönder.
      </AppText>

      <View style={{ marginTop: spacing.lg }}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Köpek adı veya cins ara"
        />
      </View>

      <View style={styles.filterBar}>
        <AppText
          variant="label"
          color={colors.primary}
          onPress={() => setFiltersOpen((v) => !v)}
        >
          {filtersOpen ? 'Filtreleri gizle' : 'Filtrele'}
          {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </AppText>

        {activeFilterCount > 0 ? (
          <AppText variant="label" color={colors.textMuted} onPress={clearFilters}>
            Temizle
          </AppText>
        ) : null}
      </View>

      {activeFilterCount > 0 && !filtersOpen ? (
        <View style={styles.activeFilters}>
          {district ? <Tag label={district} tone="primary" /> : null}
          {size ? <Tag label={dogSizeLabels[size as keyof typeof dogSizeLabels]} tone="primary" /> : null}
          {energy ? <Tag label={energyLabels[energy as keyof typeof energyLabels]} tone="accent" /> : null}
        </View>
      ) : null}

      {filtersOpen ? (
        <View style={styles.filters}>
          <ChoiceGroup
            label="Semt"
            options={[
              ...(user?.district
                ? [{ value: user.district, label: `${user.district} (semtim)` }]
                : []),
            ]}
            value={district}
            onChange={(value) => setDistrict(district === value ? null : value)}
          />

          <ChoiceGroup
            label="Boyut"
            options={[
              { value: 'kucuk', label: dogSizeLabels.kucuk },
              { value: 'orta', label: dogSizeLabels.orta },
              { value: 'buyuk', label: dogSizeLabels.buyuk },
            ]}
            value={size}
            onChange={(value) => setSize(size === value ? null : value)}
          />

          <ChoiceGroup
            label="Enerji seviyesi"
            options={Object.entries(energyLabels).map(([value, label]) => ({ value, label }))}
            value={energy}
            onChange={(value) => setEnergy(energy === value ? null : value)}
          />
        </View>
      ) : null}

      {loader.loading ? (
        <LoadingState label="Köpekler yükleniyor…" />
      ) : loader.error ? (
        <ErrorState message={loader.error} onRetry={loader.reload} />
      ) : visibleItems.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <AppText variant="caption" color={colors.textSubtle} style={{ marginBottom: spacing.md }}>
            {visibleItems.length} köpek bulundu
          </AppText>

          {visibleItems.map((item) => (
            <DogCard
              key={item.dog.id}
              item={item}
              onPress={() => router.push(`/user/${item.owner.id}?dogId=${item.dog.id}`)}
            />
          ))}
        </View>
      ) : activeFilterCount > 0 || search ? (
        <EmptyState
          emoji="🔍"
          title="Sonuç bulunamadı"
          description="Filtreleri değiştirip tekrar deneyebilirsin."
          actionLabel="Filtreleri temizle"
          onAction={clearFilters}
        />
      ) : (
        <EmptyState
          emoji="🐾"
          title="Henüz keşfedecek köpek yok"
          description="Semtinde yeni kullanıcılar katıldıkça burada görünecekler. Bir etkinlik oluşturarak topluluğu başlatabilirsin."
          actionLabel="Yürüyüş oluştur"
          onAction={() => router.push('/event/create')}
        />
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  filters: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  activeFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
});
