import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Mahalle sekmesindeki "yeni içerik" göstergesi için son görülme zamanı.
 *
 * Sunucuda tutulmaz — yalnızca bu cihazda, ölçülü bir görsel ipucu için.
 * Kullanıcı Mahalle sekmesini her ziyaret ettiğinde güncellenir.
 */
const KEY = 'patimeet.neighbourhood.lastSeenAt';

export async function getNeighbourhoodLastSeen(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function markNeighbourhoodSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Kritik değil; en kötü ihtimalle rozet bir sonraki açılışta da görünür.
  }
}
