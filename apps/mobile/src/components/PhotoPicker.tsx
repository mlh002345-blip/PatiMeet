import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { AppText, Avatar } from './ui';

/**
 * Fotoğraf seçici.
 *
 * MVP kapsamında sunucu tarafı dosya yükleme yok (bkz. MVP 11. bölüm: fotoğraf
 * gönderme kapsam dışı). Bu yüzden seçilen görselin cihaz üzerindeki URI'si
 * saklanır ve yalnızca o cihazda görüntülenir. Yükleme altyapısı eklendiğinde
 * `onChange` içinde yüklenip dönen kalıcı URL kaydedilecek.
 */
export function PhotoPicker({
  label,
  value,
  onChange,
  fallbackName,
  emoji,
}: {
  label: string;
  value: string | null;
  onChange: (uri: string | null) => void;
  fallbackName: string;
  emoji?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function pick() {
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'İzin gerekli',
          'Fotoğraf seçebilmek için galeri erişim izni vermeniz gerekiyor. Ayarlardan izin verebilirsiniz.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        onChange(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Fotoğraf seçilemedi', 'Beklenmeyen bir hata oluştu. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <AppText variant="label" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>
        {label}
      </AppText>

      <View style={styles.row}>
        <Pressable onPress={pick} disabled={busy} accessibilityRole="button">
          {value ? (
            <Image source={{ uri: value }} style={styles.preview} />
          ) : (
            <Avatar name={fallbackName} size={80} emoji={emoji} />
          )}
        </Pressable>

        <View style={{ marginLeft: spacing.lg, flex: 1 }}>
          <Pressable onPress={pick} disabled={busy} accessibilityRole="button" hitSlop={8}>
            <AppText variant="bodyStrong" color={colors.primary}>
              {value ? 'Fotoğrafı değiştir' : 'Fotoğraf seç'}
            </AppText>
          </Pressable>

          {value ? (
            <Pressable
              onPress={() => onChange(null)}
              accessibilityRole="button"
              hitSlop={8}
              style={{ marginTop: spacing.sm }}
            >
              <AppText variant="caption" color={colors.danger}>
                Kaldır
              </AppText>
            </Pressable>
          ) : (
            <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>
              İsteğe bağlı, sonra da ekleyebilirsin.
            </AppText>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  preview: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
});
