import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError, type JournalTypeInfo } from '../../src/api';
import { DateTimeField } from '../../src/components/DateTimeField';
import { AppText, Banner, Button, Card, ChoiceGroup, DetailHeader, Field, PageIntro } from '../../src/components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../src/theme';

/**
 * Günlük kaydı ekleme.
 *
 * Form türe göre daralır: yalnızca o kayıt türünde anlamlı alanlar gösterilir.
 * Alan tanımları sunucudan gelir, böylece kurallar tek yerde yaşar.
 */
export default function AddJournalEntryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ dogId: string }>();

  const [types, setTypes] = useState<JournalTypeInfo[]>([]);
  const [type, setType] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [value, setValue] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [wantsReminder, setWantsReminder] = useState(false);
  const [remindAt, setRemindAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  });
  const [repeat, setRepeat] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .journalTypes()
      .then((res) => setTypes(res.types))
      .catch(() => setError('Kayıt türleri yüklenemedi.'));
  }, []);

  const selected = useMemo(() => types.find((t) => t.value === type) ?? null, [types, type]);

  async function submit() {
    setError(null);
    if (!params.dogId || !type) {
      setError('Kayıt türü seçin.');
      return;
    }

    let numeric: number | null = null;
    if (selected?.numeric) {
      const parsed = Number(value.replace(',', '.'));
      if (!value.trim() || Number.isNaN(parsed)) {
        setError(`${selected.numeric.label} değerini girin.`);
        return;
      }
      numeric = parsed;
    }

    setBusy(true);
    try {
      await api.addJournalEntry({
        dogId: params.dogId,
        type,
        title: title.trim() || undefined,
        note: note.trim() || undefined,
        occurredAt: occurredAt.getTime(),
        remindAt: wantsReminder ? remindAt.getTime() : null,
        repeatIntervalDays: wantsReminder && repeat ? Number(repeat) : null,
        value: numeric,
      });
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kayıt eklenemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={s.screen} contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl }}>
        <DetailHeader label="Kayıt ekle" onBack={() => router.back()} />
        <View style={{ paddingHorizontal: spacing.lg }}>
        <PageIntro
          kicker="KÖPEĞİMİN GÜNLÜĞÜ"
          title="Yeni kayıt"
          description="Yalnızca seçtiğin türde anlamlı olan alanlar gösterilir."
          compact
        />
        {error ? <Banner tone="error" message={error} /> : null}

        <ChoiceGroup
          label="Kayıt türü"
          required
          columns
          options={types.map((t) => ({ value: t.value, label: t.label }))}
          value={type}
          onChange={(next) => {
            setType(next);
            setValue('');
            setRepeat(null);
          }}
        />

        {selected ? (
          <>
            <DateTimeField
              label="Tarih"
              value={occurredAt}
              onChange={setOccurredAt}
              bounds="past"
            />

            {selected.numeric ? (
              <Field
                label={`${selected.numeric.label} (${selected.numeric.unit})`}
                value={value}
                onChangeText={setValue}
                placeholder={`${selected.numeric.min}–${selected.numeric.max}`}
                keyboardType="number-pad"
                required
              />
            ) : null}

            <Field
              label="Başlık"
              value={title}
              onChangeText={setTitle}
              placeholder="Örn. Karma aşı"
              maxLength={120}
            />

            <Field
              label="Not"
              value={note}
              onChangeText={setNote}
              placeholder="Eklemek istediğin ayrıntılar"
              multiline
              maxLength={1000}
            />

            {selected.remindable ? (
              <Card tone="inset" style={{ marginBottom: spacing.lg }}>
                <AppText
                  variant="label"
                  color={wantsReminder ? colors.copperDeep : colors.textMuted}
                  onPress={() => setWantsReminder((v) => !v)}
                >
                  {wantsReminder ? '✓ Hatırlatma kurulacak' : 'Hatırlatma ekle'}
                </AppText>

                {wantsReminder ? (
                  <View style={{ marginTop: spacing.lg }}>
                    <DateTimeField
                      label="Hatırlatma zamanı"
                      value={remindAt}
                      onChange={setRemindAt}
                    />
                    {selected.repeatDays?.length ? (
                      <ChoiceGroup
                        label="Tekrar"
                        options={selected.repeatDays.map((days) => ({
                          value: String(days),
                          label: days >= 365 ? 'Yılda bir' : `${days} günde bir`,
                        }))}
                        value={repeat}
                        onChange={(next) => setRepeat(repeat === next ? null : next)}
                      />
                    ) : null}
                    <AppText variant="caption" color={colors.textMuted}>
                      Bildirim kapalıysa hatırlatma uygulama içinde gösterilir; kayıt kaybolmaz.
                    </AppText>
                  </View>
                ) : null}
              </Card>
            ) : null}

            <Button label="Kaydet" onPress={submit} loading={busy} />
          </>
        ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
});
