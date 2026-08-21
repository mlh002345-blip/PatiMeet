import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../../src/api';
import { SafetySheet } from '../../../src/components/SafetySheet';
import {
  AppText,
  Banner,
  Button,
  Card,
  ErrorState,
  LoadingState,
  ScrollScreen,
  Tag,
} from '../../../src/components/ui';
import { dogSizeLabels, formatEventDate, labelFor } from '../../../src/labels';
import { colors, radius, spacing } from '../../../src/theme';
import { useLoader } from '../../../src/useLoader';

const PACE_LABELS: Record<string, string> = {
  sakin: 'Sakin tempo',
  normal: 'Normal tempo',
  hareketli: 'Hareketli tempo',
};

/** Hızlı yürüyüş daveti detayı. Kesin buluşma noktası burada gösterilmez. */
export default function InviteDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const loader = useLoader(() => api.invite(params.id), [params.id]);
  const invite = loader.data?.invite;

  async function act(action: 'join' | 'leave' | 'cancel') {
    if (!invite) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'join') {
        const res = await api.joinInvite(invite.id);
        setMessage(res.message);
      } else if (action === 'leave') {
        await api.leaveInvite(invite.id);
      } else {
        await api.cancelInvite(invite.id);
        router.back();
        return;
      }
      loader.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function openChat() {
    if (!invite?.owner) return;
    try {
      const res = await api.openConversation(invite.owner.id);
      router.push(`/chat/${res.conversation.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sohbet açılamadı.');
    }
  }

  if (loader.loading) return <LoadingState label="Davet yükleniyor…" />;
  if (loader.error) return <ErrorState message={loader.error} onRetry={loader.reload} />;
  if (!invite) return <ErrorState message="Davet bulunamadı." />;

  return (
    <ScrollScreen>
      {message ? <Banner tone="success" message={message} /> : null}
      {error ? <Banner tone="error" message={error} /> : null}
      {invite.expired ? (
        <Banner tone="warning" message="Bu davetin süresi doldu; katılım kapandı." />
      ) : null}

      <View style={s.tagRow}>
        <Tag label={invite.district} tone="primary" />
        <Tag label={PACE_LABELS[invite.pace] ?? invite.pace} tone="accent" />
        <Tag label={labelFor(dogSizeLabels, invite.dogSize)} />
      </View>

      <AppText variant="display" style={{ marginTop: spacing.md }}>
        Hızlı yürüyüş
      </AppText>

      <Card style={{ marginTop: spacing.lg }}>
        <Row label="Buluşma" value={formatEventDate(invite.startsAt)} />
        <Row label="Yaklaşık bölge" value={invite.areaNote || invite.district} />
        <Row label="Tahmini süre" value={`${invite.durationMinutes} dakika`} />
        <Row label="Katılan" value={`${invite.participantCount} kişi`} />
        <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>
          Kesin buluşma noktası davette paylaşılmaz; katıldıktan sonra mesajla konuşursunuz.
        </AppText>
      </Card>

      {invite.note ? (
        <AppText variant="body" style={{ marginTop: spacing.lg }}>
          {invite.note}
        </AppText>
      ) : null}

      {invite.owner && !invite.isOwner ? (
        <>
          <AppText variant="heading" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
            Daveti açan
          </AppText>
          <Card>
            <View style={s.ownerRow}>
              {invite.owner.photoUrl ? (
                <Image source={{ uri: invite.owner.photoUrl }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarFallback]}>
                  <SymbolView
                    name={{ ios: 'person', android: 'person', web: 'person' }}
                    size={20}
                    tintColor={colors.primary}
                  />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <AppText variant="bodyStrong">{invite.owner.name}</AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {invite.owner.district ?? 'Semt belirtilmemiş'}
                </AppText>
              </View>
            </View>
          </Card>
        </>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        {invite.isOwner ? (
          <Button label="Daveti iptal et" variant="danger" onPress={() => act('cancel')} loading={busy} />
        ) : invite.hasJoined ? (
          <>
            <Button label="Mesaj gönder" onPress={openChat} />
            <Button
              label="Katılımdan ayrıl"
              variant="ghost"
              onPress={() => act('leave')}
              loading={busy}
              style={{ marginTop: spacing.sm }}
            />
          </>
        ) : (
          <Button
            label={invite.expired ? 'Süresi doldu' : 'Katıl'}
            onPress={() => act('join')}
            loading={busy}
            disabled={invite.expired}
          />
        )}

        {invite.owner && !invite.isOwner ? (
          <Button
            label="Şikâyet et veya engelle"
            variant="ghost"
            onPress={() => setSheetOpen(true)}
            style={{ marginTop: spacing.lg }}
          />
        ) : null}
      </View>

      {invite.owner && !invite.isOwner ? (
        <SafetySheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          targetType="user"
          targetId={invite.owner.id}
          targetName={invite.owner.name}
          onBlocked={() => router.back()}
        />
      ) : null}
    </ScrollScreen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" style={{ flex: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  );
}

const s = StyleSheet.create({
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  ownerRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
});
