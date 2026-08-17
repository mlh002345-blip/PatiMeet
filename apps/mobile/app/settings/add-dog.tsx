import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { DogForm, type DogFormValues } from '../../src/components/DogForm';
import { AppText, Banner, ScrollScreen } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { colors, spacing } from '../../src/theme';

/** Yeni köpek profili ekleme (çoklu köpek desteği). */
export default function AddDogScreen() {
  const router = useRouter();
  const { refresh } = useSession();

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(values: DogFormValues) {
    setFormError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await api.createDog({
        name: values.name,
        size: values.size,
        energy: values.energy,
        sociability: values.sociability,
        breed: values.breed,
        birthYear: values.birthYear,
        bio: values.bio,
        vaccinated: values.vaccinated,
        photoUrl: values.photoUrl ?? null,
      });
      await refresh();
      setSuccess('Köpek profili eklendi.');
      setTimeout(() => router.back(), 900);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Köpek profili eklenemedi. Tekrar deneyin.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollScreen>
        <View>
          {success ? <Banner tone="success" message={success} /> : null}

          <AppText variant="display">Köpek ekle</AppText>
          <AppText
            variant="body"
            color={colors.textMuted}
            style={{ marginTop: spacing.xs, marginBottom: spacing.xl }}
          >
            Her köpeğin için ayrı profil tutabilirsin; keşfet ve etkinliklerde hangisiyle
            katılacağını seçersin.
          </AppText>

          <DogForm
            submitLabel="Köpeği ekle"
            submitting={submitting}
            formError={formError}
            onSubmit={onSubmit}
          />
        </View>
      </ScrollScreen>
    </KeyboardAvoidingView>
  );
}
