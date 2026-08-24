import { SymbolView } from 'expo-symbols';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import type { WalkPoint } from '../api';
import { isNativeMapAvailable } from '../mapsConfig';
import { colors, radius, spacing } from '../theme';
import { AppText } from './ui';

/**
 * Canlı Yürüyüş haritası — gerçek karo, gerçek konum.
 *
 * iOS'ta Apple Maps, Android'de Google Maps kullanılır (`PROVIDER_DEFAULT`).
 * Kesin GPS koordinatları hiçbir analitik olayına veya günlüğe yazılmaz —
 * yalnızca haritanın kendisine, cihaz üzerinde çizilir.
 *
 * Bu dosya yalnızca iOS/Android'de kullanılır; `react-native-maps` web'de
 * derlenmediği için Metro web derlemesinde bunun yerine `WalkMap.web.tsx`
 * seçilir (aynı platform-uzantı deseni: bkz. src/components/PdfDocumentViewer.tsx).
 */

const DEFAULT_DELTA = 0.01;

function toLatLng(p: WalkPoint) {
  return { latitude: p.lat, longitude: p.lng };
}

export function WalkMap({
  points,
  live = false,
  dogPhotoUrl,
  height = 280,
}: {
  points: WalkPoint[];
  /** Yürüyüş sürerken otomatik takip ve "konumuma dön" düğmesi etkinleşir. */
  live?: boolean;
  dogPhotoUrl?: string | null;
  height?: number;
}) {
  if (!isNativeMapAvailable()) {
    return <MapsNotConfigured height={height} />;
  }
  return <ConfiguredWalkMap points={points} live={live} dogPhotoUrl={dogPhotoUrl} height={height} />;
}

function ConfiguredWalkMap({
  points,
  live,
  dogPhotoUrl,
  height,
}: {
  points: WalkPoint[];
  live: boolean;
  dogPhotoUrl?: string | null;
  height: number;
}) {
  const mapRef = useRef<MapView>(null);
  const [following, setFollowing] = useState(true);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const hasFitOnce = useRef(false);

  const last = points[points.length - 1] ?? null;
  const first = points[0] ?? null;

  // Canlı modda yeni nokta geldikçe, kullanıcı haritayı elle oynatmadığı
  // sürece kamerayı güncel konuma kaydır.
  useEffect(() => {
    if (!ready || !live || !following || !last) return;
    mapRef.current?.animateToRegion(
      { latitude: last.lat, longitude: last.lng, latitudeDelta: DEFAULT_DELTA, longitudeDelta: DEFAULT_DELTA },
      400
    );
  }, [ready, live, following, last?.lat, last?.lng]);

  // Özet (canlı olmayan) modda rotanın tamamı tek seferde çerçeveye sığdırılır.
  useEffect(() => {
    if (!ready || live || hasFitOnce.current || points.length < 2) return;
    hasFitOnce.current = true;
    mapRef.current?.fitToCoordinates(points.map(toLatLng), {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, [ready, live, points]);

  function recenter() {
    setFollowing(true);
    if (last) {
      mapRef.current?.animateToRegion(
        { latitude: last.lat, longitude: last.lng, latitudeDelta: DEFAULT_DELTA, longitudeDelta: DEFAULT_DELTA },
        400
      );
    }
  }

  if (mapError) {
    return (
      <View style={[styles.container, { height }]}>
        <SymbolView
          name={{ ios: 'exclamationmark.triangle', android: 'error_outline', web: 'error_outline' }}
          size={26}
          tintColor={colors.copperPale}
        />
        <AppText variant="caption" color={colors.textOnDarkMuted} center style={{ marginTop: spacing.sm }}>
          Harita yüklenemedi. Yürüyüş kaydı buna rağmen devam ediyor.
        </AppText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <MapErrorBoundary onError={() => setMapError(true)}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: (first ?? last)?.lat ?? 41.015,
            longitude: (first ?? last)?.lng ?? 28.979,
            latitudeDelta: DEFAULT_DELTA,
            longitudeDelta: DEFAULT_DELTA,
          }}
          onMapReady={() => setReady(true)}
          onPanDrag={() => live && setFollowing(false)}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
          rotateEnabled={!live}
        >
          {points.length > 1 ? (
            <Polyline coordinates={points.map(toLatLng)} strokeColor={colors.copper} strokeWidth={4} lineCap="round" />
          ) : null}

          {first ? (
            <Marker coordinate={toLatLng(first)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={styles.startPin} />
            </Marker>
          ) : null}

          {last && (live || points.length > 1) ? (
            <Marker coordinate={toLatLng(last)} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.dogPin}>
                {dogPhotoUrl ? (
                  <Image source={{ uri: dogPhotoUrl }} style={styles.fill} />
                ) : (
                  <SymbolView
                    name={{ ios: 'pawprint.fill', android: 'pets', web: 'pets' }}
                    size={18}
                    tintColor={colors.textOnDark}
                  />
                )}
              </View>
            </Marker>
          ) : null}
        </MapView>
      </MapErrorBoundary>

      {points.length === 0 ? (
        <View style={styles.overlayCenter} pointerEvents="none">
          <AppText variant="caption" color={colors.textOnDarkMuted} center>
            Konum bekleniyor…
          </AppText>
        </View>
      ) : null}

      {live && !following ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Konumuma dön"
          onPress={recenter}
          style={({ pressed }) => [styles.recenterButton, pressed && { opacity: 0.85 }]}
        >
          <SymbolView
            name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }}
            size={20}
            tintColor={colors.textOnDark}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function MapsNotConfigured({ height }: { height: number }) {
  return (
    <View style={[styles.container, { height }]}>
      <SymbolView
        name={{ ios: 'map', android: 'map', web: 'map' }}
        size={28}
        tintColor={colors.copperPale}
      />
      <AppText variant="bodyStrong" color={colors.textOnDark} center style={{ marginTop: spacing.sm }}>
        Harita yapılandırılmadı
      </AppText>
      <AppText
        variant="caption"
        color={colors.textOnDarkMuted}
        center
        style={{ marginTop: spacing.xs, paddingHorizontal: spacing.lg }}
      >
        Mesafe ve süre takibi normal şekilde çalışmaya devam ediyor.
      </AppText>
    </View>
  );
}

/**
 * Native harita modülünde beklenmeyen bir çalışma zamanı hatası olursa
 * yürüyüş ekranının tamamını değil yalnızca haritayı devre dışı bırakır.
 */
class MapErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#123126',
    borderWidth: 1,
    borderColor: colors.borderOnDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { width: '100%', height: '100%' },
  overlayCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,33,25,.55)',
  },
  startPin: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.textOnDark,
    borderWidth: 3,
    borderColor: colors.copper,
  },
  dogPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forestSoft,
    borderWidth: 3,
    borderColor: colors.copperPale,
  },
  recenterButton: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.copperAction,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.3)',
  },
});
