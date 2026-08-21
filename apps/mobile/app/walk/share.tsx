import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import {
  AppText,
  Banner,
  Button,
  Card,
  ChoiceGroup,
  DetailHeader,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../src/components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

const DURATIONS = [
  { value: '30', label: '30 dakika' },
  { value: '60', label: '1 saat' },
  { value: '120', label: '2 saat' },
];

/**
 * Canlı konum paylaşımı.
 *
 * Paylaşım yalnızca kullanıcının açık seçimiyle, tek bir güvendiği kişiyle ve
 * belirlediği süre boyunca açılır. Süre dolunca sunucu tarafında kendiliğinden
 * kapanır; kullanıcı istediği an durdurabilir.
 */
export default function WalkShareScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ walkId: string }>();
  const [target, setTarget] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<string | null>('60');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Güvendiğin kişiler: hâlihazırda mesajlaştığın kullanıcılar.
  const loader = useLoader(() => api.conversations(), []);

  async function share() {
    if (!params.walkId || !target || !minutes) {
      setError('Kişi ve süre seçin.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.shareWalk(params.walkId, { userId: target, minutes: Number(minutes) });
      setMessage('Konumun paylaşılıyor. Süre dolunca kendiliğinden kapanacak.');
      setTimeout(() => router.back(), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Paylaşım açılamadı.');
    } finally {
      setBusy(false);
    }
  }

  if (loader.loading) return <LoadingState />;
  if (loader.error) return <ErrorState message={loader.error} onRetry={loader.reload} />;

  const contacts = loader.data?.conversations ?? [];

  return (
    <View style={[s.screen, { paddingTop: insets.top + spacing.sm }]}>
      <DetailHeader label="Konum paylaş" onBack={() => router.back()} />
      {message ? <Banner tone="success" message={message} /> : null}
      {error ? <Banner tone="error" message={error} /> : null}

      <AppText variant="heading" color={colors.textOnDark}>
        Canlı konumunu paylaş
      </AppText>
      <AppText variant="body" color={colors.textOnDarkMuted} style={{ marginTop: spacing.xs }}>
        Yalnızca seçtiğin kişi, seçtiğin süre boyunca son konumunu görür. Geçmiş rotan
        paylaşılmaz.
      </AppText>

      {contacts.length === 0 ? (
        <EmptyState
          icon={{ ios: 'bubble.left', android: 'chat_bubble', web: 'chat_bubble' }}
          title="Henüz sohbet ettiğin kimse yok"
          description="Konumunu yalnızca mesajlaştığın kişilerle paylaşabilirsin."
        />
      ) : (
        <Card style={{ marginTop: spacing.lg }}>
          <ChoiceGroup
            label="Kiminle"
            required
            columns
            options={contacts.map((c) => ({ value: c.user.id, label: c.user.name }))}
            value={target}
            onChange={setTarget}
          />
          <ChoiceGroup
            label="Ne kadar süreyle"
            required
            options={DURATIONS}
            value={minutes}
            onChange={setMinutes}
          />
          <Button label="Paylaşımı başlat" onPress={share} loading={busy} />
        </Card>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.primaryDark, paddingHorizontal: spacing.lg },
});
