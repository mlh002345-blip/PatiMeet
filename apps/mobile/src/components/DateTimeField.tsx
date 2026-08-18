import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { formatEventDate } from '../labels';
import { colors, radius, spacing } from '../theme';
import { AppText } from './ui';

/**
 * Tarih ve saat seçimi.
 *
 * iOS ve Android yerel bileşenleri farklı çalışır: Android'de imperatif API
 * (`DateTimePickerAndroid.open`) ile tarih ve ardından saat sorulur, iOS'ta
 * satır içi seçici gösterilir.
 *
 * Varsayılan sınır gelecek tarihlerdir (etkinlik oluşturma). Geçmişte bir anı
 * seçmek gereken yerler — kayıp hayvan ilanında "son görülme" gibi —
 * `bounds="past"` verir.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  error,
  bounds = 'future',
  required = true,
}: {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  error?: string | null;
  /** `future`: bugünden ileri, `past`: bugüne kadar geri. */
  bounds?: 'future' | 'past';
  required?: boolean;
}) {
  const [iosPickerVisible, setIosPickerVisible] = useState(false);
  const [iosMode, setIosMode] = useState<'date' | 'time'>('date');

  const now = new Date();
  const minimumDate = bounds === 'future' ? now : undefined;
  const maximumDate = bounds === 'past' ? now : undefined;

  function openAndroid() {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      maximumDate,
      onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
        if (event.type !== 'set' || !selectedDate) return;

        // Tarih seçildikten sonra saati sor, seçilen günü koruyarak birleştir.
        DateTimePickerAndroid.open({
          value: selectedDate,
          mode: 'time',
          is24Hour: true,
          onChange: (timeEvent: DateTimePickerEvent, selectedTime?: Date) => {
            if (timeEvent.type !== 'set' || !selectedTime) return;
            const combined = new Date(selectedDate);
            combined.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
            onChange(combined);
          },
        });
      },
    });
  }

  function handleIosChange(_event: DateTimePickerEvent, selectedDate?: Date) {
    if (!selectedDate) return;
    if (iosMode === 'date') {
      // Gün değişince mevcut saati koru.
      const combined = new Date(selectedDate);
      combined.setHours(value.getHours(), value.getMinutes(), 0, 0);
      onChange(combined);
    } else {
      const combined = new Date(value);
      combined.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
      onChange(combined);
    }
  }

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <AppText variant="label" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>
        {label}
        {required ? (
          <AppText variant="caption" color={colors.accent}>
            {'  '}zorunlu
          </AppText>
        ) : null}
      </AppText>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (Platform.OS === 'android') openAndroid();
          else setIosPickerVisible((v) => !v);
        }}
        style={({ pressed }) => [
          styles.trigger,
          Boolean(error) && { borderColor: colors.danger },
          pressed && { opacity: 0.85 },
        ]}
      >
        <AppText variant="body">🗓️ {formatEventDate(value.getTime())}</AppText>
        <AppText variant="body" color={colors.primary}>
          Değiştir
        </AppText>
      </Pressable>

      {Platform.OS === 'ios' && iosPickerVisible ? (
        <View style={styles.iosPanel}>
          <View style={styles.iosTabs}>
            {(['date', 'time'] as const).map((mode) => (
              <AppText
                key={mode}
                variant="label"
                color={iosMode === mode ? colors.primary : colors.textMuted}
                onPress={() => setIosMode(mode)}
              >
                {mode === 'date' ? 'Tarih' : 'Saat'}
              </AppText>
            ))}
          </View>

          <DateTimePicker
            value={value}
            mode={iosMode}
            display="spinner"
            minimumDate={iosMode === 'date' ? minimumDate : undefined}
            maximumDate={iosMode === 'date' ? maximumDate : undefined}
            onChange={handleIosChange}
            locale="tr-TR"
          />

          <AppText
            variant="label"
            color={colors.primary}
            center
            onPress={() => setIosPickerVisible(false)}
            style={{ paddingVertical: spacing.md }}
          >
            Tamam
          </AppText>
        </View>
      ) : null}

      {error ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  iosPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  iosTabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingBottom: spacing.sm,
  },
});
