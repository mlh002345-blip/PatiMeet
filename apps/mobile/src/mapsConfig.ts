import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Native harita bu platformda gerçekten kullanılabilir mi?
 *
 * - iOS: Apple Maps herhangi bir anahtar gerektirmez → her zaman true.
 * - Android: Google Maps `GOOGLE_MAPS_ANDROID_API_KEY` derleme anında
 *   verilmemişse boş bir karo ızgarası gösterir; bu yüzden anahtar
 *   `app.config.ts` tarafından `extra.mapsConfigured.android`'e yazılır ve
 *   burada okunur. Anahtarın kendisi asla istemciye taşınmaz.
 * - Web: `react-native-maps` web'de derlenmez; her zaman false (ayrı bir
 *   `.web.tsx` bileşeni kullanılır, bu fonksiyon web'de hiç çağrılmaz).
 */
export function isNativeMapAvailable(): boolean {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS !== 'android') return false;

  const extra = Constants.expoConfig?.extra as
    | { mapsConfigured?: { android?: boolean } }
    | undefined;
  return Boolean(extra?.mapsConfigured?.android);
}
