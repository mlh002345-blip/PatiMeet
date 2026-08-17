import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { SafetySheet } from '../../src/components/SafetySheet';
import {
  AppText,
  Avatar,
  Banner,
  Button,
  Card,
  ErrorState,
  LoadingState,
  ScrollScreen,
  Tag,
} from '../../src/components/ui';
import {
  dogAgeLabel,
  dogSizeLabels,
  energyLabels,
  labelFor,
  purposeLabels,
  sociabilityLabels,
} from '../../src/labels';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';
import { MatchBreakdownCard } from '../../src/components/MatchScore';

/**
 * Köpek ve sahip profil detayı (8/14).
 *
 * Rota sahibin kimliğiyle açılır (`/user/:id`); isteğe bağlı `dogId` sorgu
 * parametresi hangi köpeğin öne çıkarılacağını belirler. Yalnızca semt
 * gösterilir, açık adres veya konum yok.
 */
export default function UserProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; dogId?: string }>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const loader = useLoader(async () => {
    if (!params.id) throw new ApiError(400, 'bad_request', 'Profil bilgisi eksik.');
    return api.userProfile(params.id, params.dogId);
  }, [params.id, params.dogId]);

  async function openChat() {
    if (!params.id) return;
    setActionError(null);
    setOpening(true);
    try {
      const res = await api.openConversation(params.id);
      router.push(`/chat/${res.conversation.id}`);
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : 'Sohbet açılamadı. Tekrar deneyin.'
      );
    } finally {
      setOpening(false);
    }
  }

  if (loader.loading) return <LoadingState label="Profil yükleniyor…" />;
  if (loader.error) return <ErrorState message={loader.error} onRetry={loader.reload} />;
  if (!loader.data) return <ErrorState message="Profil bulunamadı." />;

  const { user: owner, dogs, isSelf } = loader.data;
  /**
   * Eski bir sunucu sürümü bu alanı göndermeyebilir; ekran bu yüzden
   * çökmemeli. Boş liste, uyum bölümünün hiç gösterilmemesi anlamına gelir.
   */
  const matches = loader.data.matches ?? [];
  // `dogId` verilmişse o köpeği öne çıkar, yoksa ilk köpeği göster.
  const focused = dogs.find((d) => d.id === params.dogId) ?? dogs[0];

  return (
    <ScrollScreen topInset={false}>
      {actionError ? <Banner tone="error" message={actionError} /> : null}

      {/* Köpek ön planda */}
      {focused ? (
        <Card>
          <View style={{ alignItems: 'center' }}>
            {focused.photoUrl ? (
              <Image source={{ uri: focused.photoUrl }} style={styles.hero} />
            ) : (
              <Avatar name={focused.name} size={110} emoji="🐕" />
            )}

            <AppText variant="display" style={{ marginTop: spacing.lg }}>
              {focused.name}
            </AppText>
            <AppText variant="body" color={colors.textMuted}>
              {focused.breed ?? 'Cins belirtilmemiş'} · {dogAgeLabel(focused.age)}
            </AppText>
          </View>

          <View style={styles.tagRow}>
            <Tag label={labelFor(dogSizeLabels, focused.size)} tone="primary" />
            <Tag label={labelFor(energyLabels, focused.energy)} tone="accent" />
            <Tag label={labelFor(sociabilityLabels, focused.sociability)} />
            {focused.vaccinated ? <Tag label="Aşılı (beyan)" tone="success" /> : null}
          </View>

          {focused.bio ? (
            <AppText variant="body" style={{ marginTop: spacing.lg }}>
              {focused.bio}
            </AppText>
          ) : null}

          {focused.vaccinated ? (
            <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.md }}>
              Aşı bilgisi kullanıcı beyanıdır, PatiMeet tarafından doğrulanmaz.
            </AppText>
          ) : null}
        </Card>
      ) : null}

      {/* Ana eylem uzun uyum açıklamalarından önce görünür. */}
      {!isSelf ? (
        <View style={styles.primaryActions}>
          <Button label="Mesaj gönder" onPress={openChat} loading={opening} />
          <Button
            label="Etkinliğe davet et"
            variant="secondary"
            onPress={() => router.push('/event/create')}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      ) : null}

      {/* Uyum skoru — en uyumlu köpek önce */}
      {matches.length > 0 ? (
        <>
          <AppText variant="heading" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
            {matches.length > 1 ? 'Köpeklerinizle uyum' : 'Uyum'}
          </AppText>

          {matches.map((match) => (
            <View key={match.viewerDogId} style={{ marginBottom: spacing.md }}>
              <MatchBreakdownCard
                match={match}
                viewerDogName={matches.length > 1 ? match.viewerDogName : undefined}
                targetDogName={matches.length > 1 ? focused?.name : undefined}
              />
            </View>
          ))}
        </>
      ) : null}

      {/* Sahip bilgisi */}
      <AppText variant="heading" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
        Sahibi
      </AppText>

      <Card>
        <View style={styles.ownerRow}>
          {owner.photoUrl ? (
            <Image source={{ uri: owner.photoUrl }} style={styles.ownerPhoto} />
          ) : (
            <Avatar name={owner.name} size={56} />
          )}

          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <AppText variant="heading">{owner.name}</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              📍 {owner.district ?? 'Semt belirtilmemiş'}
            </AppText>
          </View>
        </View>

        {owner.purpose ? (
          <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
            <Tag label={labelFor(purposeLabels, owner.purpose)} tone="primary" />
          </View>
        ) : null}

        {owner.bio ? (
          <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.md }}>
            {owner.bio}
          </AppText>
        ) : null}
      </Card>

      {/* Diğer köpekler */}
      {dogs.length > 1 ? (
        <>
          <AppText variant="heading" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
            Diğer köpekleri
          </AppText>
          {dogs
            .filter((d) => d.id !== focused?.id)
            .map((d) => (
              <Card key={d.id} style={{ marginBottom: spacing.sm }}>
                <View style={styles.ownerRow}>
                  <Avatar name={d.name} size={44} emoji="🐕" />
                  <View style={{ marginLeft: spacing.md }}>
                    <AppText variant="bodyStrong">{d.name}</AppText>
                    <AppText variant="caption" color={colors.textMuted}>
                      {labelFor(dogSizeLabels, d.size)} · {labelFor(energyLabels, d.energy)}
                    </AppText>
                  </View>
                </View>
              </Card>
            ))}
        </>
      ) : null}

      {/* Güvenlik eylemi ana aksiyonlardan ayrı ve daha düşük öncelikte. */}
      {!isSelf ? (
        <View style={{ marginTop: spacing.md }}>
          <Button
            label="Şikâyet et veya engelle"
            variant="ghost"
            onPress={() => setSheetOpen(true)}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      ) : null}

      <SafetySheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        targetType="user"
        targetId={owner.id}
        targetName={owner.name}
        onBlocked={() => router.back()}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: 110,
    height: 110,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
    justifyContent: 'center',
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ownerPhoto: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  primaryActions: {
    marginTop: spacing.lg,
  },
});
