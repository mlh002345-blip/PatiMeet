import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Oturum jetonu deposu.
 *
 * Jeton artık `expo-secure-store` içinde tutuluyor: iOS'ta Keychain,
 * Android'de EncryptedSharedPreferences. Cihaz kilidi arkasında saklandığı
 * için başka bir uygulama veya yedek dosyası jetonu okuyamaz.
 *
 * GEÇİŞ: Eski sürümlerde jeton `AsyncStorage` içindeydi. İlk okumada eski
 * kayıt bulunursa güvenli depoya taşınır ve ardından eski kayıt silinir;
 * böylece mevcut kullanıcıların oturumu kapanmaz ve düz metin kopya geride
 * kalmaz.
 *
 * WEB: SecureStore web'de yok. Tarayıcıda AsyncStorage (localStorage) ile
 * devam ediyoruz — web hedefi geliştirme ve E2E içindir, mağaza paketi değil.
 */

const TOKEN_KEY = 'patimeet.token';

/** SecureStore yalnızca yerel platformlarda var. */
const secureAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

export async function readToken(): Promise<string | null> {
  if (!secureAvailable) return AsyncStorage.getItem(TOKEN_KEY);

  try {
    const secure = await SecureStore.getItemAsync(TOKEN_KEY);
    if (secure) return secure;
  } catch {
    // Güvenli depo okunamazsa eski kayda düşüp oturumu kurtarmayı deniyoruz.
  }

  // --- Eski AsyncStorage kaydını taşı ---
  let legacy: string | null = null;
  try {
    legacy = await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
  if (!legacy) return null;

  try {
    await SecureStore.setItemAsync(TOKEN_KEY, legacy);
    // Yalnızca taşıma BAŞARILI olduktan sonra eski kaydı siliyoruz.
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Taşınamadıysa eski kaydı silmiyoruz; kullanıcı oturumsuz kalmasın.
  }
  return legacy;
}

export async function writeToken(token: string): Promise<void> {
  if (!secureAvailable) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  // Eski düz metin kopya varsa temizlenir.
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
  if (secureAvailable) {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  }
}
