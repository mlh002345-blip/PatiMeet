import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { WalkPoint } from '../api';
import { colors, radius, spacing } from '../theme';
import { AppText } from './ui';

/**
 * Rota çizimi — web sürümü.
 *
 * `react-native-maps` yerel bir modüldür ve web'de derlenmez (bkz.
 * `WalkMap.tsx` üst yorumu). Web için gerçek harita karosu yerine gerçek GPS
 * noktalarını kendi koordinat kutusuna göre ölçekleyip çizen güvenli bir
 * şema kullanılır — sahte sokak veya sahte harita çizilmez. Mobil uygulama
 * bu dosyayı hiç kullanmaz.
 */
export function WalkMap({
  points,
  dogPhotoUrl,
  height = 260,
}: {
  points: WalkPoint[];
  /** Web şemasında otomatik takip/"konumuma dön" yok; prop kabul edilir, yoksayılır. */
  live?: boolean;
  dogPhotoUrl?: string | null;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <View style={[styles.map, { height }]}>
        <View style={styles.pending}>
          <SymbolView
            name={{ ios: 'location.circle', android: 'my_location', web: 'my_location' }}
            size={30}
            tintColor={colors.copperPale}
          />
          <AppText variant="caption" color={colors.textOnDarkMuted} center style={{ marginTop: spacing.sm }}>
            {points.length === 0
              ? 'Konum bekleniyor…'
              : 'Rota çizilmeye başlıyor, birkaç adım at.'}
          </AppText>
        </View>
      </View>
    );
  }

  // Koordinat kutusu — rota kutunun içine oturacak biçimde ölçeklenir.
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 0.0004);
  const spanLng = Math.max(maxLng - minLng, 0.0004);

  const pad = 24;
  const width = 100; // yüzde tabanlı yerleşim
  const project = (p: WalkPoint) => ({
    /** Yüzde cinsinden konum; kapsayıcı genişliğinden bağımsız çalışır. */
    left: ((p.lng - minLng) / spanLng) * (width - 2 * (pad / 3)) + pad / 3,
    top: (1 - (p.lat - minLat) / spanLat) * (height - 2 * pad) + pad,
  });

  const projected = points.map(project);
  const last = projected[projected.length - 1];

  return (
    <View style={[styles.map, { height }]}>
      {/* Rota, ardışık noktalar arasına çizilen ince bakır parçalardan oluşur. */}
      {projected.slice(1).map((point, index) => {
        const prev = projected[index];
        const dx = point.left - prev.left;
        const dy = point.top - prev.top;
        // Yatay eksen yüzde, dikey eksen piksel: eğim için yaklaşık bir ölçek.
        const length = Math.sqrt(dx * dx + (dy / 3) * (dy / 3));
        const angle = (Math.atan2(dy / 3, dx) * 180) / Math.PI;
        return (
          <View
            key={points[index + 1].recordedAt}
            style={[
              styles.segment,
              {
                left: `${prev.left}%`,
                top: prev.top,
                width: `${length}%`,
                transform: [{ rotate: `${angle}deg` }],
              },
            ]}
          />
        );
      })}

      <View style={[styles.dogPin, { left: `${last.left}%`, top: last.top - 24 }]}>
        {dogPhotoUrl ? (
          <Image source={{ uri: dogPhotoUrl }} style={styles.fill} />
        ) : (
          <SymbolView
            name={{ ios: 'pawprint.fill', android: 'pets', web: 'pets' }}
            size={20}
            tintColor={colors.textOnDark}
          />
        )}
      </View>

      <View style={styles.legend}>
        <AppText variant="caption" color={colors.textOnDarkMuted}>
          {points.length} konum noktası
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#123126',
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  pending: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  segment: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.copperPale,
    transformOrigin: 'left center',
  },
  dogPin: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forestSoft,
    borderWidth: 3,
    borderColor: colors.copperPale,
    marginLeft: -22,
  },
  fill: { width: '100%', height: '100%' },
  legend: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(18,33,25,.8)',
  },
});
