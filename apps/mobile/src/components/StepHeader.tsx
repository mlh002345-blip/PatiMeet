import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { AppText } from './ui';

/** Onboarding adım göstergesi — az adımlı formlar hissini pekiştirir. */
export function StepHeader({
  step,
  total,
  title,
  description,
}: {
  step: number;
  total: number;
  title: string;
  description: string;
}) {
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <View style={styles.dots}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            style={[styles.dot, index < step && { backgroundColor: colors.primary, flex: 1.4 }]}
          />
        ))}
      </View>

      <AppText variant="caption" color={colors.textSubtle} style={{ marginBottom: spacing.sm }}>
        Adım {step} / {total}
      </AppText>
      <AppText variant="display">{title}</AppText>
      <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
        {description}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dot: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
});
