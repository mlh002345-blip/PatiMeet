import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import {
  AppText,
  Avatar,
  Banner,
  Button,
  Card,
  DetailHeader,
  PageIntro,
  ScrollScreen,
  Tag,
} from '../../src/components/ui';
import {
  dogAgeLabel,
  dogSizeLabels,
  energyLabels,
  labelFor,
  sociabilityLabels,
} from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, radius, spacing } from '../../src/theme';

/**
 * Köpeklerim (çoklu köpek yönetimi).
 *
 * Bir kullanıcı birden fazla köpek profiline sahip olabilir. İş kuralı gereği
 * en az bir köpek kalmalıdır; son köpek silinemez.
 */
const MAX_DOGS = 5;

export default function MyDogsScreen() {
  const router = useRouter();
  const { user, refresh } = useSession();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dogs = user?.dogs ?? [];
  const atLimit = dogs.length >= MAX_DOGS;

  function confirmDelete(dogId: string, dogName: string) {
    Alert.alert(
      `${dogName} profilini sil`,
      'Bu köpek profili kaldırılacak. Katıldığı etkinlik kayıtları etkilenmez.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setBusyId(dogId);
            setError(null);
            try {
              await api.deleteDog(dogId);
              await refresh();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Profil silinemedi.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollScreen>
      <DetailHeader label="Köpek profilleri" onBack={() => router.back()} />
      {error ? <Banner tone="error" message={error} /> : null}

      <PageIntro
        kicker="PATİ AİLEN"
        title="Köpeklerim"
        description={`${dogs.length} köpek profilin var. En fazla ${MAX_DOGS} ekleyebilirsin.`}
      />

      {dogs.map((dog) => (
        <Card key={dog.id} style={{ marginBottom: spacing.md }}>
          <View style={styles.row}>
            {dog.photoUrl ? (
              <Image source={{ uri: dog.photoUrl }} style={styles.photo} />
            ) : (
              <Avatar name={dog.name} size={60} />
            )}

            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <AppText variant="heading">{dog.name}</AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {dog.breed ?? 'Cins belirtilmemiş'} · {dogAgeLabel(dog.age)}
              </AppText>
            </View>
          </View>

          <View style={styles.tagRow}>
            <Tag label={labelFor(dogSizeLabels, dog.size)} tone="primary" />
            <Tag label={labelFor(energyLabels, dog.energy)} tone="accent" />
            <Tag label={labelFor(sociabilityLabels, dog.sociability)} />
            {dog.vaccinated ? <Tag label="Aşılı (beyan)" tone="success" /> : null}
          </View>

          <Button
            label="Düzenle"
            variant="secondary"
            onPress={() => router.push(`/settings/edit-dog?dogId=${dog.id}`)}
            style={{ marginTop: spacing.lg }}
          />

          {/* İş kuralı: en az bir köpek profili kalmalı. */}
          {dogs.length > 1 ? (
            <Button
              label="Profili sil"
              variant="danger"
              onPress={() => confirmDelete(dog.id, dog.name)}
              loading={busyId === dog.id}
              style={{ marginTop: spacing.sm }}
            />
          ) : (
            <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.md }}>
              En az bir köpek profilin olmalı; bu yüzden son profil silinemez.
            </AppText>
          )}
        </Card>
      ))}

      <Button
        label={atLimit ? `En fazla ${MAX_DOGS} köpek eklenebilir` : '+ Köpek ekle'}
        onPress={() => router.push('/settings/add-dog')}
        disabled={atLimit}
        style={{ marginTop: spacing.lg }}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photo: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
