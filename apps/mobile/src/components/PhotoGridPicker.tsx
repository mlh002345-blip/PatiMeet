import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { api, ApiError, type MediaPurpose } from '../api';
import { readFileBytes } from '../fileBytes';
import { colors, radius, spacing } from '../theme';
import { AppText } from './ui';

export interface PickedPhoto {
  /** Sunucuya gönderilecek kalıcı depo anahtarı. */
  key: string;
  /** Gösterilecek adres. */
  url: string;
}

/**
 * Çoklu fotoğraf seçici (en fazla `max` adet).
 *
 * PhotoPicker ile aynı güvenli yolu kullanır: seçilen her görsel obje
 * deposuna yüklenir ve yalnızca dönen depo anahtarı saklanır. Cihaz
 * üzerindeki geçici URI hiçbir zaman sunucuya gönderilmez.
 */
export function PhotoGridPicker({
  label,
  hint,
  purpose,
  values,
  onChange,
  max = 5,
  error,
  required,
}: {
  label: string;
  hint?: string;
  purpose: MediaPurpose;
  values: PickedPhoto[];
  onChange: (next: PickedPhoto[]) => void;
  max?: number;
  error?: string | null;
  required?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const remaining = max - values.length;

  async function pick() {
    setUploadError(null);
    if (remaining <= 0) return;

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
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.7,
      });

      if (result.canceled || result.assets.length === 0) return;

      setBusy(true);
      const uploaded: PickedPhoto[] = [];
      const failures: string[] = [];

      // Sırayla yüklüyoruz: mobil bağlantıda paralel yükleme zaman aşımı riskini artırır.
      for (const asset of result.assets.slice(0, remaining)) {
        try {
          const bytes = await readFileBytes(asset.uri);
          const contentType = asset.mimeType || 'image/jpeg';
          const res = await api.uploadPhoto(purpose, bytes, contentType);
          uploaded.push({ key: res.key, url: res.url });
        } catch (err) {
          failures.push(err instanceof ApiError ? err.message : 'Bir fotoğraf yüklenemedi.');
        }
      }

      if (uploaded.length > 0) onChange([...values, ...uploaded]);
      // Kısmi başarısızlıkta yüklenenler korunur, kalanı kullanıcıya bildirilir.
      if (failures.length > 0) setUploadError(failures[0]);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Fotoğraf yüklenemedi. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  function removeAt(index: number) {
    setUploadError(null);
    onChange(values.filter((_, i) => i !== index));
  }

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View style={styles.labelRow}>
        <AppText variant="label" color={colors.textMuted}>
          {label}
        </AppText>
        {required ? (
          <AppText variant="caption" color={colors.accent}>
            {'  '}zorunlu
          </AppText>
        ) : null}
      </View>

      <View style={styles.grid}>
        {values.map((photo, index) => (
          <View key={photo.key} style={styles.thumbWrapper}>
            <Image source={{ uri: photo.url }} style={styles.thumb} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${index + 1}. fotoğrafı kaldır`}
              onPress={() => removeAt(index)}
              hitSlop={8}
              style={styles.removeBadge}
            >
              <AppText variant="caption" color={colors.textOnPrimary}>
                ✕
              </AppText>
            </Pressable>
          </View>
        ))}

        {remaining > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fotoğraf ekle"
            onPress={pick}
            disabled={busy}
            style={({ pressed }) => [styles.addTile, pressed && { opacity: 0.85 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <AppText variant="title" color={colors.primary}>
                  +
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {values.length}/{max}
                </AppText>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      {hint && !error && !uploadError ? (
        <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>
          {hint}
        </AppText>
      ) : null}

      {error || uploadError ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {error ?? uploadError}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  thumbWrapper: {
    width: 84,
    height: 84,
  },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
