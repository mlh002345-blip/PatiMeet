import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { AppText, Banner, Button, Card, ChoiceGroup, DetailHeader, Field, PageIntro } from '../../src/components/ui';
import { dogSizeLabels, playStyleLabels } from '../../src/labels';
import { useSession } from '../../src/session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../src/theme';

/**
 * Oyun grubu oluşturma.
 *
 * Kesin buluşma noktası sorulmaz — mevcut Mahalle/Güvenli Topluluk
 * mahremiyet kuralıyla tutarlı: yalnızca semt seçilir.
 */
export default function CreateGroupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useSession();

  const [name, setName] = useState('');
  const [districts, setDistricts] = useState<string[]>([]);
  const [district, setDistrict] = useState<string | null>(user?.district ?? null);
  const [dogSize, setDogSize] = useState<string | null>('hepsi');
  const [playStyle, setPlayStyle] = useState<string | null>('dengeli');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const districtHydrated = useRef(Boolean(user?.district));
  useEffect(() => {
    if (districtHydrated.current || !user?.district) return;
    districtHydrated.current = true;
    setDistrict(user.district);
  }, [user?.district]);

  useEffect(() => {
    api
      .districts()
      .then((res) => setDistricts(res.districts))
      .catch(() => {
        if (user?.district) setDistricts([user.district]);
      });
  }, [user?.district]);

  async function submit() {
    setError(null);
    if (!name.trim() || !district) {
      setError('Grup adı ve semt gerekli.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.createGroup({
        name: name.trim(),
        district,
        dogSize: dogSize ?? undefined,
        playStyle: playStyle ?? undefined,
        description: description.trim() || undefined,
      });
      router.replace('/(tabs)/neighbourhood');
      void res;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Grup oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.screen} contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl }}>
        <DetailHeader label="Oyun grubu oluştur" onBack={() => router.back()} />
        <View style={{ paddingHorizontal: spacing.lg }}>
          <PageIntro
            kicker="MAHALLE"
            title="Yeni bir oyun grubu kur"
            description="Semtindeki komşularla düzenli oyun buluşmaları için bir grup aç."
            compact
          />
          {error ? <Banner tone="error" message={error} /> : null}

          <Field
            label="Grup adı"
            value={name}
            onChangeText={setName}
            placeholder="Örn. Moda Sahili Köpek Dostları"
            maxLength={80}
          />

          <ChoiceGroup
            label="Semt"
            required
            options={districts.map((d) => ({ value: d, label: d }))}
            value={district}
            onChange={setDistrict}
          />

          <ChoiceGroup
            label="Uygun köpek boyutu"
            options={[
              { value: 'hepsi', label: dogSizeLabels.hepsi },
              { value: 'kucuk', label: dogSizeLabels.kucuk },
              { value: 'orta', label: dogSizeLabels.orta },
              { value: 'buyuk', label: dogSizeLabels.buyuk },
            ]}
            value={dogSize}
            onChange={setDogSize}
          />

          <ChoiceGroup
            label="Oyun tarzı"
            options={[
              { value: 'sakin', label: playStyleLabels.sakin },
              { value: 'dengeli', label: playStyleLabels.dengeli },
              { value: 'hareketli', label: playStyleLabels.hareketli },
            ]}
            value={playStyle}
            onChange={setPlayStyle}
          />

          <Field
            label="Kısa açıklama"
            value={description}
            onChangeText={setDescription}
            placeholder="Grubun kime uygun olduğunu kısaca anlat"
            multiline
            maxLength={300}
          />

          <Card tone="inset" style={{ marginBottom: spacing.lg }}>
            <AppText variant="caption" color={colors.textMuted}>
              Kesin buluşma noktası burada sorulmaz; üyeler ayrıntıyı mesajlaşma üzerinden
              konuşur.
            </AppText>
          </Card>

          <Button label="Grubu oluştur" onPress={submit} loading={busy} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
});
