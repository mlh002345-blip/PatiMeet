import { Link } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';
import { AppText, Banner, BottomSheet, Button, Checkbox } from './ui';

/**
 * Sağlayıcı ile yeni hesap açılırken sözleşme onayı alan alt panel.
 *
 * Google ve Apple akışlarının ikisi de bunu kullanır: onay metinleri ve
 * doğrulama kuralı tek yerde durur.
 */
export function ConsentSheet({
  visible,
  onClose,
  providerLabel,
  acceptTerms,
  acceptPrivacy,
  onToggleTerms,
  onTogglePrivacy,
  error,
  busy,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  providerLabel: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  onToggleTerms: () => void;
  onTogglePrivacy: () => void;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View>
        <AppText variant="title">Son bir adım</AppText>
        <AppText
          variant="body"
          color={colors.textMuted}
          style={{ marginTop: spacing.xs, marginBottom: spacing.xl }}
        >
          {providerLabel} ile PatiMeet hesabın oluşturulmadan önce aşağıdaki onayları vermen
          gerekiyor.
        </AppText>

        {error ? <Banner tone="error" message={error} /> : null}

        <Checkbox checked={acceptTerms} onToggle={onToggleTerms}>
          <AppText variant="caption" color={colors.textMuted}>
            <Link href="/legal/terms">
              <Text style={styles.link}>Kullanıcı Sözleşmesi</Text>
            </Link>
            'ni okudum ve onaylıyorum.
          </AppText>
        </Checkbox>

        <Checkbox checked={acceptPrivacy} onToggle={onTogglePrivacy}>
          <AppText variant="caption" color={colors.textMuted}>
            <Link href="/legal/privacy">
              <Text style={styles.link}>KVKK Aydınlatma Metni</Text>
            </Link>
            'ni okudum ve onaylıyorum.
          </AppText>
        </Checkbox>

        <Button
          label="Hesabımı oluştur"
          onPress={onSubmit}
          loading={busy}
          style={{ marginTop: spacing.lg }}
        />
        <Button label="Vazgeç" variant="ghost" onPress={onClose} style={{ marginTop: spacing.sm }} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  link: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
