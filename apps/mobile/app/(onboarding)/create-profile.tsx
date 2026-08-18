import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../../src/api';
import { PhotoPicker } from '../../src/components/PhotoPicker';
import { StepHeader } from '../../src/components/StepHeader';
import { AppText, Banner, Button, Field, MultiChoiceGroup, Screen } from '../../src/components/ui';
import { legacyPurposes, purposeLabels, SELECTABLE_PURPOSES } from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, spacing } from '../../src/theme';

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
  const [purposes, setPurposes] = useState<string[]>(user?.purposes ?? []);
  // Kaydedilecek depo anahtarı ile gösterilecek adresi ayrı tutuyoruz.
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.photoUrl ?? null);
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
        purposes,
        photoUrl: photoKey,
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
            purpose="user_photo"
            value={photoKey}
            previewUrl={photoPreview}
            onChange={(next) => {
              setPhotoKey(next?.key ?? null);
              setPhotoPreview(next?.url ?? null);
            }}
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

          <MultiChoiceGroup
            label="Ne arıyorsun?"
            hint="Birden fazla seçebilirsin."
            options={SELECTABLE_PURPOSES.map((value) => ({
              value,
              label: purposeLabels[value],
            }))}
            values={purposes.filter((value) =>
              (SELECTABLE_PURPOSES as readonly string[]).includes(value)
            )}
            onChange={(next) => {
              /**
               * Seçenek listesinde artık yer almayan eski başlıklar (ör.
               * "Eğitim ve çalışma") korunur; kullanıcı aşağıdaki nottan
               * kaldırmadıkça kaydederken silinmez.
               */
              setPurposes([...next, ...legacyPurposes(purposes)]);
            }}
          />

          {legacyPurposes(purposes).length > 0 ? (
            <View style={{ marginTop: -spacing.md, marginBottom: spacing.lg }}>
              <AppText variant="caption" color={colors.textMuted}>
                Eski seçimin korunuyor: {legacyPurposes(purposes)
                  .map((value) => purposeLabels[value] ?? value)
                  .join(', ')}
              </AppText>
              <AppText
                variant="caption"
                color={colors.danger}
                style={{ marginTop: spacing.xs, textDecorationLine: 'underline' }}
                onPress={() =>
                  setPurposes(
                    purposes.filter((value) =>
                      (SELECTABLE_PURPOSES as readonly string[]).includes(value)
                    )
                  )
                }
              >
                Kaldır
              </AppText>
            </View>
          ) : null}

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
