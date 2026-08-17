import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../../src/api';
import { StepHeader } from '../../src/components/StepHeader';
import {
  AppText,
  Banner,
  Button,
  LoadingState,
  Screen,
  SearchField,
} from '../../src/components/ui';
import { useSession } from '../../src/session';
import { colors, radius, spacing } from '../../src/theme';

/**
 * Semt seçimi (5/14).
 *
 * Gizlilik kuralı: kullanıcının tam konumu hiç istenmez ve paylaşılmaz.
 * Keşif ve etkinlikler yalnızca kullanıcının kendisinin seçtiği semte dayanır.
 */
export default function OnboardingDistrictScreen() {
  const router = useRouter();
  const { user, setUser } = useSession();
  const insets = useSafeAreaInsets();

  const [districts, setDistricts] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(user?.district ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .districts()
      .then((res) => {
        if (!cancelled) setDistricts(res.districts);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof ApiError ? error.message : 'Semt listesi yüklenemedi.'
          );
          setDistricts([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!districts) return [];
    const needle = query.trim().toLocaleLowerCase('tr');
    if (!needle) return districts;
    return districts.filter((d) => d.toLocaleLowerCase('tr').includes(needle));
  }, [districts, query]);

  async function onSubmit() {
    if (!selected) {
      setFormError('Devam etmek için bir semt seçin.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const res = await api.updateProfile({ district: selected });
      setUser(res.user);
      // Köpek profili yoksa onboarding devam eder, varsa ana sayfaya geçilir.
      router.replace(res.user.hasDog ? '/(tabs)/home' : '/(onboarding)/create-dog');
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Semt kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + spacing.lg }}>
        <StepHeader
          step={2}
          total={3}
          title="Hangi semtte yürüyorsun?"
          description="Yakınındaki köpekleri ve etkinlikleri semtine göre gösteriyoruz. Tam adresin hiçbir zaman paylaşılmaz."
        />

        {formError ? <Banner tone="error" message={formError} /> : null}
        {loadError ? <Banner tone="warning" message={loadError} /> : null}

        <View style={{ marginBottom: spacing.lg }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Semt ara" />
        </View>

        {districts === null ? (
          <LoadingState label="Semtler yükleniyor…" />
        ) : (
          <View style={styles.list}>
            {filtered.map((district) => {
              const isSelected = district === selected;
              return (
                <Pressable
                  key={district}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelected(district)}
                  style={({ pressed }) => [
                    styles.item,
                    isSelected && styles.itemSelected,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <AppText
                    variant="bodyStrong"
                    color={isSelected ? colors.primary : colors.text}
                  >
                    {district}
                  </AppText>
                  {isSelected ? (
                    <AppText variant="bodyStrong" color={colors.primary}>
                      ✓
                    </AppText>
                  ) : null}
                </Pressable>
              );
            })}

            {filtered.length === 0 ? (
              <AppText variant="body" color={colors.textMuted} center style={{ padding: spacing.xl }}>
                "{query}" için sonuç bulunamadı.
              </AppText>
            ) : null}
          </View>
        )}

        <Button
          label="Devam et"
          onPress={onSubmit}
          loading={saving}
          disabled={!selected}
          style={{ marginTop: spacing.xl }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  itemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
});
