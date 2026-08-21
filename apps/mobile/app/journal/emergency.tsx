import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { AppText, Banner, Button, Card, DetailHeader, Field } from '../../src/components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../src/theme';

/**
 * Acil durum kartı.
 *
 * Varsayılan olarak ÖZELDİR. Paylaşılabilir bağlantı yalnızca kullanıcı açıkça
 * isterse üretilir ve istendiğinde kapatılabilir.
 */
export default function EmergencyCardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ dogId: string }>();

  const [healthNote, setHealthNote] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medications, setMedications] = useState('');
  const [chipNumber, setChipNumber] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!params.dogId) return;
    api
      .emergencyCard(params.dogId)
      .then((res) => {
        if (hydrated.current || !res.card) return;
        hydrated.current = true;
        setHealthNote(res.card.healthNote);
        setAllergies(res.card.allergies);
        setMedications(res.card.medications);
        setChipNumber(res.card.chipNumber ?? '');
        setClinicName(res.card.clinicName ?? '');
        setShared(res.card.shared);
      })
      .catch(() => undefined);
  }, [params.dogId]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.saveEmergencyCard(params.dogId, {
        healthNote,
        allergies,
        medications,
        chipNumber: chipNumber.trim() || null,
        clinicName: clinicName.trim() || null,
      });
      setMessage('Acil durum kartı kaydedildi.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kart kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleShare() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.setEmergencySharing(params.dogId, !shared);
      setShared(res.shared);
      setMessage(
        res.shared
          ? 'Paylaşılabilir bağlantı açıldı. İstediğin an kapatabilirsin.'
          : 'Paylaşım kapatıldı; kart yeniden yalnızca sana açık.'
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Paylaşım değiştirilemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.screen} contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl }}>
        <DetailHeader label="Acil durum kartı" onBack={() => router.back()} />
        <View style={{ paddingHorizontal: spacing.lg }}>
        {message ? <Banner tone="success" message={message} /> : null}
        {error ? <Banner tone="error" message={error} /> : null}

        <AppText variant="body" color={colors.textMuted} style={{ marginBottom: spacing.lg }}>
          Acil bir durumda hızlı ulaşılması gereken bilgiler. Doldurmak isteğe bağlıdır ve
          kart varsayılan olarak yalnızca sana açıktır.
        </AppText>

        <Field
          label="Önemli sağlık notu"
          value={healthNote}
          onChangeText={setHealthNote}
          placeholder="Örn. kalp üfürümü var"
          multiline
          maxLength={600}
        />
        <Field label="Alerjiler" value={allergies} onChangeText={setAllergies} maxLength={300} />
        <Field
          label="Düzenli ilaçlar"
          value={medications}
          onChangeText={setMedications}
          maxLength={300}
        />
        <Field label="Çip numarası" value={chipNumber} onChangeText={setChipNumber} maxLength={60} />
        <Field
          label="Tercih edilen klinik"
          value={clinicName}
          onChangeText={setClinicName}
          placeholder="Klinik adı"
          maxLength={120}
        />

        <Button label="Kaydet" onPress={save} loading={busy} />

        <Card tone="inset" style={{ marginTop: spacing.xl }}>
          <AppText variant="bodyStrong">
            {shared ? 'Paylaşılabilir bağlantı açık' : 'Kart özel'}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
            {shared
              ? 'Bağlantıya sahip olan kişi kartı görebilir. İstediğin an kapat.'
              : 'Kart yalnızca sana açık. Gerekirse paylaşılabilir bağlantı üretebilirsin.'}
          </AppText>
          <Button
            label={shared ? 'Paylaşımı kapat' : 'Paylaşılabilir bağlantı üret'}
            variant={shared ? 'danger' : 'secondary'}
            onPress={toggleShare}
            loading={busy}
            style={{ marginTop: spacing.md }}
          />
        </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
});
