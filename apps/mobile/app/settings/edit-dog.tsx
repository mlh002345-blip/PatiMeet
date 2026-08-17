import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { DogForm, type DogFormValues } from '../../src/components/DogForm';
import { Banner, EmptyState, Screen } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { spacing } from '../../src/theme';

/** Köpek profili düzenleme (MVP 4.3 — profil düzenleme). */
export default function EditDogScreen() {
  const router = useRouter();
  const { user, refresh } = useSession();

  // MVP'de çoklu köpek yönetimi kapsam dışı; ilk köpek düzenlenir.
  const dog = user?.dogs?.[0] ?? null;

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(values: DogFormValues) {
    if (!dog) return;

    setFormError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.updateDog(dog.id, values);
      await refresh();
      setSuccess('Köpek profili güncellendi.');
      setTimeout(() => router.back(), 900);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Değişiklikler kaydedilemedi. Tekrar deneyin.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (!dog) {
    return (
      <Screen>
        <EmptyState
          emoji="🐕"
          title="Köpek profili bulunamadı"
          description="Devam etmek için bir köpek profili oluşturman gerekiyor."
          actionLabel="Köpek profili oluştur"
          onAction={() => router.replace('/(onboarding)/create-dog')}
        />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={{ paddingTop: spacing.lg }}>
          {success ? <Banner tone="success" message={success} /> : null}

          <DogForm
            initial={dog}
            submitLabel="Değişiklikleri kaydet"
            submitting={saving}
            formError={formError}
            onSubmit={onSubmit}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
