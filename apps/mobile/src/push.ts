import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { api } from './api';

/**
 * Push bildirimleri.
 *
 * Expo Push kullanılıyor: tek uçtan hem APNs (iOS) hem FCM (Android). Cihaz
 * jetonu sunucuya kaydedilir ve gönderim sunucudan yapılır.
 *
 * İzin reddi ve jeton yenileme durumları:
 *   - izin verilmezse uygulama normal çalışmaya devam eder, jeton kaydedilmez
 *   - jeton uygulama güncellemesi veya yeniden kurulumda değişebilir; her
 *     açılışta kaydediyoruz ve sunucu aynı jetonu günceller
 *   - oturum kapatılırken jeton silinir, böylece bildirim eski hesaba gitmez
 */

const LAST_TOKEN_KEY = 'patimeet.pushToken';

/**
 * Push yalnızca yerel platformlarda desteklenir.
 *
 * Web hedefi (geliştirme önizlemesi ve tarayıcı testleri) `expo-notifications`
 * ile çalışmaz; API'lere hiç dokunmuyoruz. Aksi halde tarayıcıda hata
 * bildirimi çıkar ve arayüz kullanılamaz hale gelir.
 */
const PUSH_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Bildirim davranışı: uygulama açıkken de banner göster.
 * Bu çağrı modül yüklenirken bir kez yapılır.
 */
if (PUSH_SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export type PushPermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Android'de bildirimlerin görünmesi için kanal tanımlı olmalı. */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Genel bildirimler',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#5B3E8E',
  });
}

/**
 * Expo push jetonunu alır.
 *
 * Emülatör/simülatörde push jetonu üretilemez; bu durumda `null` döner ve
 * uygulama sessizce devam eder.
 */
async function fetchExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  /**
   * `projectId` EAS projesine bağlıdır ve jeton üretmek için gerekir.
   * Yapılandırma yoksa (henüz EAS projesi oluşturulmadıysa) atlıyoruz.
   */
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;

  if (!projectId) return null;

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    return result.data;
  } catch {
    return null;
  }
}

/**
 * Cihazı bildirimlere kaydeder.
 *
 * `requestPermission` false ise yalnızca hâlihazırda verilmiş izin kullanılır;
 * kullanıcıyı beklenmedik bir sistem sorusuyla karşılaştırmamak için ilk
 * kayıtta bunu açıkça istiyoruz.
 */
export async function registerForPush(
  requestPermission: boolean
): Promise<{ state: PushPermissionState; token: string | null }> {
  if (!PUSH_SUPPORTED) return { state: 'unsupported', token: null };

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted' && requestPermission && existing.canAskAgain) {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }

  if (status !== 'granted') {
    return { state: status === 'denied' ? 'denied' : 'undetermined', token: null };
  }

  const token = await fetchExpoPushToken();
  if (!token) return { state: 'granted', token: null };

  try {
    await api.registerPushToken({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    await AsyncStorage.setItem(LAST_TOKEN_KEY, token);
  } catch {
    // Sunucuya ulaşılamazsa bir sonraki açılışta tekrar denenir.
  }

  return { state: 'granted', token };
}

/**
 * Oturum kapatılırken jetonu sunucudan siler.
 * Aksi halde cihaza eski hesabın bildirimleri gelmeye devam eder.
 */
export async function unregisterPush(): Promise<void> {
  if (!PUSH_SUPPORTED) return;

  const token = await AsyncStorage.getItem(LAST_TOKEN_KEY);
  if (!token) return;

  try {
    await api.unregisterPushToken(token);
  } catch {
    // Ağ hatası: sunucudaki jeton bir sonraki gönderimde geçersiz sayılır.
  }
  await AsyncStorage.removeItem(LAST_TOKEN_KEY);
}

/**
 * Oturum açıkken cihazı kaydeder ve bildirime dokunulduğunda ilgili ekrana
 * götürür.
 */
export function usePushRegistration(
  isSignedIn: boolean,
  onOpen: (data: Record<string, unknown>) => void
): { permission: PushPermissionState } {
  const [permission, setPermission] = useState<PushPermissionState>('undetermined');
  // Aynı oturumda tekrar tekrar kayıt denemesini engeller.
  const registered = useRef(false);

  useEffect(() => {
    if (!PUSH_SUPPORTED) return;
    if (!isSignedIn) {
      registered.current = false;
      return;
    }
    if (registered.current) return;
    registered.current = true;

    let cancelled = false;
    (async () => {
      const result = await registerForPush(true);
      if (!cancelled) setPermission(result.state);
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  // Bildirime dokunma → derin bağlantı
  const handler = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data ?? {};
      onOpen(data as Record<string, unknown>);
    },
    [onOpen]
  );

  useEffect(() => {
    if (!PUSH_SUPPORTED) return;

    const subscription = Notifications.addNotificationResponseReceivedListener(handler);

    // Uygulama bildirime dokunularak kapalıdan açıldıysa onu da yakala.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handler(response);
      })
      .catch(() => {
        // Bildirim geçmişi okunamazsa akış etkilenmez.
      });

    return () => subscription.remove();
  }, [handler]);

  return { permission };
}
