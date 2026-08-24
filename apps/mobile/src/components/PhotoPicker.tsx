import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../api';
import { readFileBytes } from '../fileBytes';
import { colors, radius, spacing } from '../theme';
import { AppText } from './ui';

/**
 * Fotoğraf seçici ve yükleyici.
 *
 * Seçilen görsel obje deposuna yüklenir ve sunucudan dönen kalıcı **depo
 * anahtarı** (`media/...`) kaydedilir. Cihaz üzerindeki geçici URI saklanmaz;
 * böylece fotoğraf tüm cihazlarda ve diğer kullanıcılarda görünür.
 *
 * `value`      : kaydedilecek anahtar (veya sunucudan gelen mevcut değer)
 * `previewUrl` : gösterilecek adres (sunucunun döndürdüğü görüntüleme adresi)
 */
export function PhotoPicker({
  label,
  value,
  previewUrl,
  purpose,
  onChange,
  fallbackName,
  emoji,
}: {
  label: string;
  value: string | null;
  previewUrl?: string | null;
  purpose: 'user_photo' | 'dog_photo' | 'event_photo';
  /** Yükleme tamamlandığında anahtar ve görüntüleme adresi ile çağrılır. */
  onChange: (next: { key: string; url: string } | null) => void;
  fallbackName: string;
  emoji?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Yükleme sürerken hemen yerel önizleme gösteriyoruz. */
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const shownImage = localPreview ?? previewUrl ?? null;

  async function pick() {
    setError(null);
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
        aspect: purpose === 'event_photo' ? [16, 9] : [1, 1],
        // Yükleme boyutunu makul tutmak için sıkıştırıyoruz.
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const asset = result.assets[0];
      setLocalPreview(asset.uri);
      setBusy(true);

      const bytes = await readFileBytes(asset.uri);
      const contentType = asset.mimeType || 'image/jpeg';
      const uploaded = await api.uploadPhoto(purpose, bytes, contentType);

      onChange({ key: uploaded.key, url: uploaded.url });
      setLocalPreview(null);
    } catch (err) {
      setLocalPreview(null);
      setError(
        err instanceof ApiError ? err.message : 'Fotoğraf yüklenemedi. Tekrar deneyin.'
      );
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    setLocalPreview(null);
    setError(null);
    onChange(null);
  }

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <AppText variant="label" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>
        {label}
      </AppText>

      <View style={[styles.row, purpose === 'event_photo' && styles.eventRow]}>
        <Pressable
          onPress={pick}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`${label} seç`}
        >
          <View>
            {shownImage ? (
              <Image source={{ uri: shownImage }} style={[styles.preview, purpose === 'event_photo' && styles.eventPreview]} />
            ) : (
              <View style={[styles.preview, styles.fallback, purpose === 'event_photo' && styles.eventPreview]}>
                <View style={styles.orbit} />
                <SymbolView
                  name={purpose === 'event_photo'
                    ? { ios: 'photo', android: 'add_photo_alternate', web: 'add_photo_alternate' }
                    : { ios: 'camera', android: 'add_a_photo', web: 'add_a_photo' }}
                  size={purpose === 'event_photo' ? 28 : 24}
                  tintColor={colors.copperPale}
                />
                {purpose !== 'event_photo' ? (
                  <AppText variant="caption" color={colors.textOnDarkMuted} style={{ marginTop: 2 }}>
                    {emoji ?? fallbackName.trim().slice(0, 1).toUpperCase()}
                  </AppText>
                ) : null}
              </View>
            )}

            {busy ? (
              <View style={styles.overlay}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}
          </View>
        </Pressable>

        <View style={{ marginLeft: spacing.lg, flex: 1 }}>
          <AppText variant="kicker" color={colors.copper} style={{ marginBottom: spacing.xs }}>
            {purpose === 'event_photo' ? 'KAPAK GÖRSELİ' : 'PORTRE'}
          </AppText>
          <Pressable onPress={pick} disabled={busy} accessibilityRole="button" hitSlop={8}>
            <AppText variant="bodyStrong" color={busy ? colors.textSubtle : colors.primary}>
              {busy ? 'Yükleniyor…' : value ? 'Fotoğrafı değiştir' : 'Fotoğraf seç'}
            </AppText>
          </Pressable>

          {value && !busy ? (
            <Pressable
              onPress={remove}
              accessibilityRole="button"
              hitSlop={8}
              style={{ marginTop: spacing.sm }}
            >
              <AppText variant="caption" color={colors.danger}>
                Kaldır
              </AppText>
            </Pressable>
          ) : !value && !busy ? (
            <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>
              İsteğe bağlı, sonra da ekleyebilirsin.
            </AppText>
          ) : null}

          {error ? (
            <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
              {error}
            </AppText>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  eventRow: {
    alignItems: 'center',
  },
  preview: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  eventPreview: {
    width: 144,
    height: 88,
    borderRadius: radius.md,
  },
  fallback: {
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.copper,
  },
  orbit: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(181, 113, 60, 0.36)',
    top: -24,
    right: -18,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
