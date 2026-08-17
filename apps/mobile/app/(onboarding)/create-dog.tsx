import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../../src/api';
import { DogForm, type DogFormValues } from '../../src/components/DogForm';
import { StepHeader } from '../../src/components/StepHeader';
import { Screen } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { spacing } from '../../src/theme';

/**
 * Köpek profili oluşturma (4/14). Onboarding'in son adımı.
 *
 * İş kuralı: kullanıcı en az bir köpek profiline sahip olmalı, bu yüzden bu
 * adım atlanamaz.
 */
export default function OnboardingDogScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const insets = useSafeAreaInsets();

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: DogFormValues) {
    setFormError(null);
    setSubmitting(true);
    try {
      await api.createDog(values);
      await refresh();
      router.replace('/(tabs)/home');
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Köpek profili oluşturulamadı. Tekrar deneyin.'
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
      <Screen>
        <View style={{ paddingTop: insets.top + spacing.lg }}>
          <StepHeader
            step={3}
            total={3}
            title="Köpeğini tanıt"
            description="Bu bilgiler doğru eşleşmeleri bulmaya yardım eder. Yıldızlı olmayan alanları sonra da doldurabilirsin."
          />

          <DogForm
            submitLabel="Profili tamamla"
            submitting={submitting}
            formError={formError}
            onSubmit={onSubmit}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
