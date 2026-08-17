import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../../src/api';
import { PhotoPicker } from '../../src/components/PhotoPicker';
import { StepHeader } from '../../src/components/StepHeader';
import { Banner, Button, ChoiceGroup, Field, Screen } from '../../src/components/ui';
import { purposeLabels } from '../../src/labels';
import { useSession } from '../../src/session';
import { spacing } from '../../src/theme';

/**
 * Kullanıcı profili oluşturma (3/14).
 *
 * İlk kullanımda yalnızca ad zorunlu; semt bir sonraki adımda seçilir,
 * açıklama ve kullanım amacı sonradan tamamlanabilir.
 */
export default function OnboardingProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useSession();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [purpose, setPurpose] = useState<string | null>(user?.purpose ?? null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(user?.photoUrl ?? null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setFormError(null);

    if (name.trim().length < 2) {
      setNameError('Adınız en az 2 karakter olmalı.');
      return;
    }
    setNameError(null);

    setLoading(true);
    try {
      const res = await api.updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        purpose,
        photoUrl,
      });
      setUser(res.user);
      router.push('/(onboarding)/select-district');
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Profil kaydedilemedi. Tekrar deneyin.'
      );
    } finally {
      setLoading(false);
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
            step={1}
            total={3}
            title="Kendini tanıt"
            description="Diğer köpek sahipleri seni bu bilgilerle görecek. Ayrıntıları sonra da tamamlayabilirsin."
          />

          {formError ? <Banner tone="error" message={formError} /> : null}

          <PhotoPicker
            label="Profil fotoğrafı"
            value={photoUrl}
            onChange={setPhotoUrl}
            fallbackName={name || 'P'}
          />

          <Field
            label="Ad"
            value={name}
            onChangeText={setName}
            placeholder="Adınız"
            error={nameError}
            autoCapitalize="words"
            maxLength={60}
            required
          />

          <ChoiceGroup
            label="Ne arıyorsun?"
            options={Object.entries(purposeLabels).map(([value, label]) => ({ value, label }))}
            value={purpose}
            onChange={setPurpose}
          />

          <Field
            label="Kısa açıklama"
            value={bio}
            onChangeText={setBio}
            placeholder="Örn. Her akşam parkta yürüyoruz, sakin köpeklerle tanışmayı seviyoruz."
            multiline
            maxLength={300}
            hint={`${bio.length}/300 karakter`}
          />

          <Button label="Devam et" onPress={onSubmit} loading={loading} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
