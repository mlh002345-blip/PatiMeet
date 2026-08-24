import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dinamik uygulama yapılandırması.
 *
 * Statik `app.json` temel alınır; Google ile giriş için gereken ve derleme
 * anında ortam değişkenlerinden türetilmesi gereken değerler burada eklenir.
 *
 * iOS'ta Google, yetkilendirme sonucunu uygulamaya "ters çevrilmiş istemci
 * kimliği" şemasıyla döner. Örneğin
 *   1234-abcd.apps.googleusercontent.com
 * istemci kimliği için şema
 *   com.googleusercontent.apps.1234-abcd
 * olur. Bu değer istemci kimliğine bağlı olduğu için app.json'a sabit
 * yazılamaz; burada üretiyoruz. `ios.scheme` alanına koyduğumuzda Expo bunu
 * Info.plist içindeki CFBundleURLTypes ile kendisi birleştirir.
 */
function reversedClientIdScheme(clientId: string | undefined): string | null {
  if (!clientId) return null;

  const suffix = '.apps.googleusercontent.com';
  if (!clientId.endsWith(suffix)) return null;

  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

/** Tanımlı olmayan anahtarları hiç eklemeyerek yapılandırmayı temiz tutar. */
function definedOnly(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();

  const googleScheme = reversedClientIdScheme(iosClientId);

  /**
   * Android'de react-native-maps (Google Maps) bu anahtar olmadan boş bir
   * karo ızgarası gösterir veya hiç yüklenmez. iOS'ta Apple Maps kullanılır
   * ve herhangi bir anahtar gerekmez. Anahtar `.env`'e veya koda yazılmaz —
   * yalnızca GitHub Actions secrets üzerinden derleme anında okunur (bkz.
   * DEPLOYMENT.md §7.1). Anahtar boşsa Android manifest'ine hiçbir şey
   * eklenmez; istemci bunu `extra.mapsConfigured.android` ile tespit edip
   * "Harita yapılandırılmadı" durumunu gösterir (bkz. src/mapsConfig.ts).
   */
  const googleMapsAndroidApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();

  return {
    ...config,
    name: config.name ?? 'PatiMeet',
    slug: config.slug ?? 'patimeet',
    ios: {
      ...config.ios,
      // Yalnızca Google yapılandırıldığında ek şema tanımlanır.
      ...(googleScheme ? { scheme: [googleScheme] } : {}),
    },
    android: {
      ...config.android,
      ...(googleMapsAndroidApiKey
        ? {
            config: {
              ...config.android?.config,
              googleMaps: { apiKey: googleMapsAndroidApiKey },
            },
          }
        : {}),
    },
    extra: {
      ...config.extra,
      /**
       * OAuth istemci kimlikleri gizli değer değildir; herkese açıktır ve tek
       * başlarına yetki vermez. Mobil uygulamada `client secret` hiç
       * kullanılmaz (PKCE ile çalışıyoruz).
       */
      google: definedOnly({ iosClientId, androidClientId, webClientId }),
      /** Anahtarın kendisi değil, yalnızca yapılandırılıp yapılandırılmadığı. */
      mapsConfigured: { android: Boolean(googleMapsAndroidApiKey) },
    },
  };
};
