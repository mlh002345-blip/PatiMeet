import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { SafetySheet } from '../../src/components/SafetySheet';
import {
  AppText,
  Avatar,
  Banner,
  Button,
  Card,
  DetailHeader,
  ErrorState,
  LoadingState,
  ScrollScreen,
  Tag,
} from '../../src/components/ui';
import {
  alertTypeLabels,
  formatEventDate,
  formatRelative,
  labelFor,
  urgentAlertTypes,
} from '../../src/labels';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

/**
 * Güvenli Topluluk bildirimi detayı.
 *
 * İletişim yalnızca uygulama içi mesajla kurulur; telefon, adres veya kesin
 * konum gösterilmez çünkü hiç toplanmıyor.
 */
export default function AlertDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const loader = useLoader(async () => {
    if (!params.id) throw new ApiError(400, 'bad_request', 'Bildirim bilgisi eksik.');
    return api.alert(params.id);
  }, [params.id]);

  const alert = loader.data?.alert;

  async function openChat() {
    if (!alert?.author) return;
    setActionError(null);
    setOpening(true);
    try {
      const res = await api.openConversation(alert.author.id);
      router.push(`/chat/${res.conversation.id}`);
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : 'Sohbet açılamadı. Tekrar deneyin.'
      );
    } finally {
      setOpening(false);
    }
  }

  async function resolve() {
    if (!alert) return;
    setActionError(null);
    setBusy(true);
    try {
      await api.updateAlertStatus(alert.id, alert.status === 'resolved' ? 'active' : 'resolved');
      loader.reload();
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : 'Durum güncellenemedi. Tekrar deneyin.'
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove() {
    if (!alert) return;
    Alert.alert('Bildirimi kaldır', 'Bu bildirim listeden kaldırılacak. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.deleteAlert(alert.id);
            router.replace('/alerts');
          } catch (error) {
            setActionError(
              error instanceof ApiError ? error.message : 'Bildirim kaldırılamadı.'
            );
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (loader.loading) return <LoadingState label="Bildirim yükleniyor…" />;
  if (loader.error) return <ErrorState message={loader.error} onRetry={loader.reload} />;
  if (!alert) return <ErrorState message="Bildirim bulunamadı." />;

  const urgent = urgentAlertTypes.has(alert.type);

  return (
    <ScrollScreen>
      <DetailHeader label="Topluluk bildirimi" onBack={() => router.back()} />
      {actionError ? <Banner tone="error" message={actionError} /> : null}
      {alert.status === 'resolved' ? (
        <Banner tone="success" message="Bu bildirim çözüldü olarak işaretlendi." />
      ) : null}

      {/* Fotoğraflar */}
      {alert.photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gallery}
        >
          {alert.photos.map((photo, index) => (
            <Image
              key={photo}
              source={{ uri: photo }}
              style={[styles.photo, alert.photos.length === 1 && styles.photoSingle]}
              accessibilityLabel={`${index + 1}. fotoğraf`}
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.tagRow}>
        <Tag
          label={labelFor(alertTypeLabels, alert.type)}
          tone={urgent ? 'danger' : 'primary'}
        />
        <Tag label={alert.district} />
      </View>

      {alert.animalName ? (
        <AppText variant="display" style={{ marginTop: spacing.md }}>
          {alert.animalName}
        </AppText>
      ) : null}

      <Card style={{ marginTop: spacing.lg }}>
        <DetailRow label="Yaklaşık bölge" value={alert.areaNote || alert.district} />
        {alert.occurredAt ? (
          <DetailRow
            label={
              alert.type === 'kayip_hayvan' || alert.type === 'bulunan_hayvan'
                ? 'Son görülme'
                : 'Olay zamanı'
            }
            value={formatEventDate(alert.occurredAt)}
          />
        ) : null}
        <DetailRow label="Paylaşıldı" value={formatRelative(alert.createdAt)} />

        <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.md }}>
          Güvenlik için kesin konum toplanmıyor; yalnızca yaklaşık bölge paylaşılır.
        </AppText>
      </Card>

      <AppText variant="body" style={{ marginTop: spacing.lg }}>
        {alert.description}
      </AppText>

      {/* İletişim */}
      {alert.author && !alert.isOwner ? (
        <>
          <AppText variant="heading" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
            Paylaşan
          </AppText>

          <Card>
            <View style={styles.authorRow}>
              {alert.author.photoUrl ? (
                <Image source={{ uri: alert.author.photoUrl }} style={styles.authorPhoto} />
              ) : (
                <Avatar name={alert.author.name} size={48} />
              )}
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <AppText variant="bodyStrong">{alert.author.name}</AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {alert.author.district ?? 'Semt belirtilmemiş'}
                </AppText>
              </View>
            </View>
          </Card>

          <Button
            label="Mesaj gönder"
            onPress={openChat}
            loading={opening}
            style={{ marginTop: spacing.lg }}
          />
          <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>
            İletişim uygulama içi mesajla kurulur.
          </AppText>

          <Button
            label="Şikâyet et veya engelle"
            variant="ghost"
            onPress={() => setSheetOpen(true)}
            style={{ marginTop: spacing.lg }}
          />
        </>
      ) : null}

      {/* Sahibinin eylemleri */}
      {alert.isOwner ? (
        <View style={{ marginTop: spacing.xl }}>
          <Button
            label={alert.status === 'resolved' ? 'Yeniden yayına al' : 'Çözüldü olarak işaretle'}
            variant="secondary"
            onPress={resolve}
            loading={busy}
          />
          <Button
            label="Bildirimi kaldır"
            variant="ghost"
            onPress={confirmRemove}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      ) : null}

      {alert.author && !alert.isOwner ? (
        <SafetySheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          targetType="alert"
          targetId={alert.id}
          targetName={alert.author.name}
          blockUserId={alert.author.id}
          onBlocked={() => router.back()}
        />
      ) : null}
    </ScrollScreen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" style={{ flex: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  gallery: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  photo: {
    width: 220,
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  photoSingle: {
    width: 320,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorPhoto: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
});
