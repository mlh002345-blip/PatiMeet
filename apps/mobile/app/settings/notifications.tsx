import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { api, ApiError, type NotificationPreferences } from '../../src/api';
import {
  AppText,
  Banner,
  Button,
  Card,
  DetailHeader,
  ErrorState,
  LoadingState,
  PageIntro,
  Screen,
} from '../../src/components/ui';
import { registerForPush } from '../../src/push';
import { colors, radius, spacing } from '../../src/theme';

/**
 * Bildirim ayarları.
 *
 * İki katman var:
 *   1. Sistem izni — cihaz ayarlarından yönetilir; reddedilmişse kullanıcıyı
 *      ayarlara yönlendiriyoruz (uygulama içinden geri açılamaz).
 *   2. Kategori tercihleri — sunucuda saklanır ve gönderim öncesi kontrol edilir.
 */
export default function NotificationSettingsScreen() {
  const router = useRouter();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [systemGranted, setSystemGranted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [remote, permission] = await Promise.all([
          api.notificationPreferences(),
          Platform.OS === 'web'
            ? Promise.resolve({ status: 'denied' as const })
            : Notifications.getPermissionsAsync(),
        ]);

        if (cancelled) return;
        setPreferences(remote.preferences);
        setPushEnabled(remote.pushEnabled);
        setSystemGranted(permission.status === 'granted');
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : 'Bildirim ayarları yüklenemedi.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: keyof NotificationPreferences) {
    if (!preferences) return;

    const next = { ...preferences, [key]: !preferences[key] };
    // İyimser güncelleme: anahtar hemen hareket etsin, hata olursa geri alınır.
    setPreferences(next);
    setSaving(key);
    setError(null);

    try {
      const result = await api.updateNotificationPreferences({ [key]: next[key] });
      setPreferences(result.preferences);
    } catch (err) {
      setPreferences(preferences);
      setError(err instanceof ApiError ? err.message : 'Ayar kaydedilemedi.');
    } finally {
      setSaving(null);
    }
  }

  async function askPermission() {
    const result = await registerForPush(true);
    setSystemGranted(result.state === 'granted');

    // Kullanıcı daha önce reddettiyse sistem bir daha sormaz; ayarlara götür.
    if (result.state === 'denied') {
      Linking.openSettings().catch(() => undefined);
    }
  }

  if (loading) return <LoadingState label="Ayarlar yükleniyor…" />;
  if (error && !preferences) return <ErrorState message={error} />;

  return (
    <Screen topInset>
      <View style={{ paddingTop: spacing.lg }}>
        <DetailHeader label="Bildirim tercihleri" onBack={() => router.back()} />
        <PageIntro
          kicker="SANA ÖZEL"
          title="Bildirimler"
          description="Yalnızca önemsediğin gelişmeler için haber al."
          compact
        />
        {error ? <Banner tone="error" message={error} /> : null}

        {!pushEnabled ? (
          <Banner
            tone="info"
            message="Bu sunucuda bildirim gönderimi kapalı. Tercihleriniz kaydedilir ve gönderim açıldığında geçerli olur."
          />
        ) : null}

        {systemGranted === false ? (
          <Card style={{ marginBottom: spacing.lg }}>
            <AppText variant="bodyStrong">Bildirim izni kapalı</AppText>
            <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
              Mesaj ve etkinlik bildirimlerini alabilmek için cihaz ayarlarından PatiMeet
              bildirimlerine izin vermeniz gerekiyor.
            </AppText>
            <Button
              label="İzin ver"
              variant="secondary"
              onPress={askPermission}
              style={{ marginTop: spacing.lg }}
            />
          </Card>
        ) : null}

        <View style={styles.group}>
          <Row
            title="Mesajlar"
            description="Biri sana mesaj gönderdiğinde"
            value={preferences?.messages ?? true}
            busy={saving === 'messages'}
            onToggle={() => toggle('messages')}
          />
          <Row
            title="Etkinlikler"
            description="Katılım, güncelleme ve iptal bilgileri"
            value={preferences?.events ?? true}
            busy={saving === 'events'}
            onToggle={() => toggle('events')}
          />
          <Row
            title="Güvenlik"
            description="Şikâyet sonucu ve topluluk güvenliği bildirimleri"
            value={preferences?.safety ?? true}
            busy={saving === 'safety'}
            onToggle={() => toggle('safety')}
            last
          />
        </View>

        <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.lg }}>
          Güvenliğini etkileyen önemli bildirimler (örneğin hesabınla ilgili bir moderasyon
          kararı) bu tercihten bağımsız olarak gönderilir.
        </AppText>
      </View>
    </Screen>
  );
}

/** Basit anahtar satırı — ek bağımlılık getirmemek için elle çizildi. */
function Row({
  title,
  description,
  value,
  busy,
  onToggle,
  last,
}: {
  title: string;
  description: string;
  value: boolean;
  busy: boolean;
  onToggle: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, busy }}
      accessibilityLabel={title}
      onPress={onToggle}
      disabled={busy}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowBorder,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={{ flex: 1, marginRight: spacing.lg }}>
        <AppText variant="body">{title}</AppText>
        <AppText variant="caption" color={colors.textSubtle}>
          {description}
        </AppText>
      </View>

      <View style={[styles.track, value && styles.trackOn, busy && { opacity: 0.5 }]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  track: {
    width: 50,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    padding: 3,
    justifyContent: 'center',
  },
  trackOn: {
    backgroundColor: colors.primary,
  },
  knob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  knobOn: {
    alignSelf: 'flex-end',
  },
});
