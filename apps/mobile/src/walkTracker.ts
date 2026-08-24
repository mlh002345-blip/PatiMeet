import * as Location from 'expo-location';
import { Platform } from 'react-native';

/**
 * Gerçek GPS yürüyüş takibi.
 *
 * Konum izni YALNIZCA kullanıcı yürüyüşü başlattığında istenir; uygulama
 * açılışında değil. İzin reddedilirse ekran bunu açıkça söyler ve ayarlara
 * yönlendirir; sahte konum veya zamana göre uydurulmuş mesafe ÜRETİLMEZ.
 *
 * Toplanan noktalar tamponda birikir ve toplu olarak sunucuya gönderilir;
 * süzme (doğruluk, sıçrama, titreme) ve mesafe hesabı sunucudadır, böylece
 * istemci kapansa bile veri tutarlı kalır.
 */

export type PermissionState = 'unknown' | 'granted' | 'denied' | 'unsupported';

export interface TrackedPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  recordedAt: number;
}

/** Konum yalnızca yerel platformlarda güvenilir; web hedefi takip etmez. */
export const LOCATION_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * İzin ister. Zaten verilmişse yeniden sormaz.
 * `canAskAgain` false ise kullanıcının ayarlardan açması gerekir.
 */
export async function requestPermission(): Promise<{
  state: PermissionState;
  canAskAgain: boolean;
}> {
  if (!LOCATION_SUPPORTED) return { state: 'unsupported', canAskAgain: false };

  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return { state: 'granted', canAskAgain: true };

  const asked = await Location.requestForegroundPermissionsAsync();
  return {
    state: asked.granted ? 'granted' : 'denied',
    canAskAgain: asked.canAskAgain !== false,
  };
}

export interface WalkTracker {
  stop(): void;
  /** Tampondaki noktaları alır ve tamponu boşaltır. */
  drain(): TrackedPoint[];
  /** Tamponda bekleyen nokta sayısı. */
  pending(): number;
}

/**
 * Konum akışını başlatır.
 *
 * `distanceInterval` sayesinde kullanıcı yerinde dururken yeni nokta
 * üretilmez; bu hem pil hem de mesafe doğruluğu için gerekli.
 */
export async function startTracking(
  onPoint?: (point: TrackedPoint) => void
): Promise<WalkTracker> {
  const buffer: TrackedPoint[] = [];

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 4000,
      distanceInterval: 5,
    },
    (location) => {
      const point: TrackedPoint = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy ?? null,
        recordedAt: location.timestamp,
      };
      buffer.push(point);
      onPoint?.(point);
    }
  );

  return {
    stop: () => subscription.remove(),
    drain: () => buffer.splice(0, buffer.length),
    pending: () => buffer.length,
  };
}

/** "00:32:18" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
}

/** "2,73 km" */
export function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
}

/** "5:48" — saniye/km değerinden. */
export function formatPace(secondsPerKm: number | null): string {
  if (!secondsPerKm) return '--:--';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Sunucudaki `domain/walks.ts#trimRoute` ile birebir aynı oran. */
const ENDPOINT_TRIM_RATIO = 0.12;

/**
 * Paylaşılan/görüntülenen özetlerde başlangıç ve bitişi gizler.
 *
 * `GET /api/walks/:id/route` sahibine HAM rotayı döner (ownerRoute
 * kurtarma ve canlı takip için gerekli); ancak bir özeti görüntülerken veya
 * paylaşırken ev konumunu ele verecek uç bölümler istemci tarafında da
 * kırpılır — sunucudaki `trimRoute` ile aynı mantık, aynı oran.
 */
export function trimRouteEndpoints<T>(points: T[], hideEndpoints: boolean): T[] {
  if (!hideEndpoints) return points;
  if (points.length < 8) return [];
  const cut = Math.max(1, Math.floor(points.length * ENDPOINT_TRIM_RATIO));
  return points.slice(cut, points.length - cut);
}
