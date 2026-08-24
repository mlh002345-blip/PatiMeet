import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './ui';
import { colors, spacing } from '../theme';

/**
 * Web karşılığı: `react-native-pdf` yerel bir modüldür ve web'de derlenemez.
 * Belgenin süreli adresi üçüncü taraf bir görüntüleme servisine gönderilmez;
 * tarayıcının kendi yerleşik (ilk taraf) PDF göstericisi yeni sekmede açılır.
 */
export function PdfDocumentViewer({ url }: { url: string; documentId: string }) {
  return (
    <View style={s.centered}>
      <SymbolView
        name={{ ios: 'doc.text', android: 'description', web: 'description' }}
        size={32}
        tintColor={colors.textOnDarkMuted}
      />
      <AppText
        variant="body"
        color={colors.textOnDarkMuted}
        style={{ marginTop: spacing.md, textAlign: 'center', paddingHorizontal: spacing.xl }}
      >
        PDF önizleme mobil uygulamada sayfa sayfa görüntülenir. Web'de tarayıcının kendi
        gösterici sekmesinde açabilirsin.
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => window.open(url, '_blank', 'noopener,noreferrer')}
        style={s.openButton}
      >
        <AppText variant="bodyStrong" color={colors.textOnDark}>
          Yeni sekmede aç
        </AppText>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  openButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.copperAction,
  },
});
