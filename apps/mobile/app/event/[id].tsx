import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { SafetySheet } from '../../src/components/SafetySheet';
import {
  AppText,
  Avatar,
  Banner,
  Button,
  Card,
  ChoiceGroup,
  ErrorState,
  LoadingState,
  ScrollScreen,
  Tag,
} from '../../src/components/ui';
import {
  dogSizeLabels,
  eventTypeEmoji,
  eventTypeLabels,
  formatEventDate,
  labelFor,
} from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

/** Etkinlik detayı (10/14). */
export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loader = useLoader(() => api.event(id), [id]);

  const dogs = user?.dogs ?? [];
  /**
   * Hangi köpekle katılınacağı. Tek köpek varsa otomatik seçilir; birden
   * fazlaysa kullanıcı seçer (etkinliğin boyut kısıtı sunucuda doğrulanır).
   */
  const [selectedDogId, setSelectedDogId] = useState<string | null>(dogs[0]?.id ?? null);

  async function runAction(action: () => Promise<unknown>, successMessage?: string) {
    setActionError(null);
    setActionSuccess(null);
    setBusy(true);
    try {
      await action();
      loader.refresh();
      if (successMessage) setActionSuccess(successMessage);
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : 'İşlem tamamlanamadı. Tekrar deneyin.'
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmCancel() {
    Alert.alert(
      'Etkinliği iptal et',
      'Katılımcılar bu etkinliği artık göremeyecek. Bu işlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal et',
          style: 'destructive',
          onPress: () =>
            runAction(() => api.cancelEvent(id), 'Etkinlik iptal edildi.'),
        },
      ]
    );
  }

  async function messageOwner(ownerId: string) {
    setActionError(null);
    setBusy(true);
    try {
      const res = await api.openConversation(ownerId);
      router.push(`/chat/${res.conversation.id}`);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Sohbet açılamadı.');
    } finally {
      setBusy(false);
    }
  }

  if (loader.loading) return <LoadingState label="Etkinlik yükleniyor…" />;
  if (loader.error) return <ErrorState message={loader.error} onRetry={loader.reload} />;
  if (!loader.data) return <ErrorState message="Etkinlik bulunamadı." />;

  const { event, participants } = loader.data;
  const isCancelled = event.status === 'cancelled';

  return (
    <ScrollScreen topInset={false}>
      {actionError ? <Banner tone="error" message={actionError} /> : null}
      {actionSuccess ? <Banner tone="success" message={actionSuccess} /> : null}
      {isCancelled ? (
        <Banner tone="warning" message="Bu etkinlik iptal edildi." />
      ) : null}

      <Card>
        <View style={styles.headerRow}>
          <View style={styles.icon}>
            <AppText variant="display">{eventTypeEmoji[event.type] ?? '🐾'}</AppText>
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Tag label={labelFor(eventTypeLabels, event.type)} tone="accent" />
          </View>
        </View>

        <AppText variant="display" style={{ marginTop: spacing.lg }}>
          {event.title}
        </AppText>

        <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
          <DetailRow icon="🗓️" label="Tarih ve saat" value={formatEventDate(event.startsAt)} />
          <DetailRow icon="📍" label="Semt" value={event.district} />
          <DetailRow icon="🚩" label="Buluşma noktası" value={event.meetingPoint} />
          <DetailRow
            icon="🐕"
            label="Uygun köpek boyutu"
            value={labelFor(dogSizeLabels, event.dogSize)}
          />
          <DetailRow
            icon="👥"
            label="Katılım"
            value={`${event.participantCount} / ${event.capacity} kişi`}
          />
        </View>

        {/* Gizlilik notu: buluşma noktası kullanıcı tarafından yazılan bir
            açıklamadır; uygulama açık adres veya koordinat paylaşmaz. */}
        <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.md }}>
          Buluşma noktası etkinlik sahibinin yazdığı genel bir açıklamadır.
        </AppText>
      </Card>

      {event.description ? (
        <Card style={{ marginTop: spacing.md }}>
          <AppText variant="heading">Açıklama</AppText>
          <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
            {event.description}
          </AppText>
        </Card>
      ) : null}

      {event.rules ? (
        <Card style={{ marginTop: spacing.md }}>
          <AppText variant="heading">Kurallar</AppText>
          <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
            {event.rules}
          </AppText>
        </Card>
      ) : null}

      {/* Katılımcılar */}
      <AppText variant="heading" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
        Katılımcılar ({participants.length})
      </AppText>

      {participants.length > 0 ? (
        participants.map(({ user: participant, dog: participantDog }) => (
          <Pressable
            key={participant.id}
            accessibilityRole="button"
            onPress={() =>
              participantDog
                ? router.push(`/user/${participant.id}?dogId=${participantDog.id}`)
                : undefined
            }
            style={({ pressed }) => [styles.participant, pressed && { opacity: 0.85 }]}
          >
            <Avatar name={participant.name} size={44} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <AppText variant="bodyStrong">
                {participant.name}
                {participant.id === user?.id ? ' (sen)' : ''}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {participantDog
                  ? `${participantDog.name} · ${labelFor(dogSizeLabels, participantDog.size)}`
                  : participant.district ?? 'Semt belirtilmemiş'}
              </AppText>
            </View>
            {participant.id === event.owner?.id ? <Tag label="Düzenleyen" tone="primary" /> : null}
          </Pressable>
        ))
      ) : (
        <Card>
          <AppText variant="body" color={colors.textMuted}>
            Henüz katılımcı yok.
          </AppText>
        </Card>
      )}

      {/* Aksiyonlar */}
      <View style={{ marginTop: spacing.xl }}>
        {event.isOwner ? (
          <>
            <Button
              label="Etkinliği iptal et"
              variant="danger"
              onPress={confirmCancel}
              disabled={isCancelled || busy}
            />
          </>
        ) : (
          <>
            {/* Çoklu köpek: hangisiyle katılınacağı seçilir */}
            {!event.hasJoined && dogs.length > 1 ? (
              <ChoiceGroup
                label="Hangi köpeğinle katılıyorsun?"
                options={dogs.map((item) => ({
                  value: item.id,
                  label: `${item.name} (${labelFor(dogSizeLabels, item.size)})`,
                }))}
                value={selectedDogId}
                onChange={setSelectedDogId}
              />
            ) : null}

            {event.hasJoined ? (
              <Button
                label="Katılımdan ayrıl"
                variant="secondary"
                onPress={() => runAction(() => api.leaveEvent(id), 'Katılımdan ayrıldın.')}
                loading={busy}
                disabled={isCancelled}
              />
            ) : (
              <Button
                label={event.isFull ? 'Kontenjan doldu' : 'Etkinliğe katıl'}
                onPress={() =>
                  runAction(
                    () => api.joinEvent(id, selectedDogId ?? undefined),
                    'Etkinliğe katıldın!'
                  )
                }
                loading={busy}
                disabled={event.isFull || isCancelled}
              />
            )}

            {event.owner ? (
              <Button
                label="Düzenleyene mesaj gönder"
                variant="secondary"
                onPress={() => messageOwner(event.owner!.id)}
                style={{ marginTop: spacing.sm }}
                disabled={busy}
              />
            ) : null}
          </>
        )}

        <Button
          label="Etkinliği şikâyet et"
          variant="ghost"
          onPress={() => setSheetOpen(true)}
          style={{ marginTop: spacing.sm }}
        />
      </View>

      {/* İlk buluşma güvenlik uyarısı */}
      <Card
        style={{
          marginTop: spacing.xl,
          backgroundColor: colors.warningLight,
          borderColor: colors.warningLight,
        }}
      >
        <AppText variant="bodyStrong" color={colors.warning}>
          🛡️ Güvenli buluşma
        </AppText>
        <AppText variant="body" color={colors.warning} style={{ marginTop: spacing.xs }}>
          Kalabalık ve açık bir alanda buluş, adresini paylaşma ve nerede olduğunu bir yakınına
          haber ver.
        </AppText>
      </Card>

      <SafetySheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        targetType="event"
        targetId={event.id}
        targetName={event.title}
      />
    </ScrollScreen>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="body">{icon}</AppText>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <AppText variant="caption" color={colors.textSubtle}>
          {label}
        </AppText>
        <AppText variant="bodyStrong">{value}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  participant: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
});
