import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { PhotoPicker } from '../../src/components/PhotoPicker';
import {
  AppText,
  Banner,
  Button,
  ChoiceGroup,
  Field,
  Screen,
} from '../../src/components/ui';
import { purposeLabels } from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, spacing } from '../../src/theme';

/** Profil düzenleme (MVP 4.2 — profil düzenleme). */
export default function EditProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useSession();

  const [name, setName] = useState(user?.name ?? '');
  const [district, setDistrict] = useState<string | null>(user?.district ?? null);
  const [districts, setDistricts] = useState<string[]>([]);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [purpose, setPurpose] = useState<string | null>(user?.purpose ?? null);
  /**
   * Mevcut fotoğraf sunucudan görüntüleme adresi olarak gelir; yeni bir
   * fotoğraf yüklenmedikçe alanı hiç göndermiyoruz ki adres, anahtarın
   * üzerine yazılmasın.
   */
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.photoUrl ?? null);
  const [photoTouched, setPhotoTouched] = useState(false);

  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .districts()
      .then((res) => setDistricts(res.districts))
      .catch(() => {
        if (user?.district) setDistricts([user.district]);
      });
  }, [user?.district]);

  async function onSubmit() {
    setFormError(null);
    setSuccess(null);

    if (name.trim().length < 2) {
      setNameError('Adınız en az 2 karakter olmalı.');
      return;
    }
    setNameError(null);

    setSaving(true);
    try {
      const res = await api.updateProfile({
        name: name.trim(),
        district,
        bio: bio.trim(),
        purpose,
        ...(photoTouched ? { photoUrl: photoKey } : {}),
      });
      setUser(res.user);
      setSuccess('Profilin güncellendi.');
      setTimeout(() => router.back(), 900);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Profil kaydedilemedi. Tekrar deneyin.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={{ paddingTop: spacing.lg }}>
          {formError ? <Banner tone="error" message={formError} /> : null}
          {success ? <Banner tone="success" message={success} /> : null}

          <PhotoPicker
            label="Profil fotoğrafı"
            purpose="user_photo"
            value={photoKey ?? (photoPreview ? 'mevcut' : null)}
            previewUrl={photoPreview}
            onChange={(next) => {
              setPhotoTouched(true);
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

          <ChoiceGroup
            label="Semt"
            required
            options={districts.map((d) => ({ value: d, label: d }))}
            value={district}
            onChange={setDistrict}
          />

          <AppText variant="caption" color={colors.textSubtle} style={{ marginBottom: spacing.lg }}>
            Diğer kullanıcılar yalnızca semtini görür; tam adresin hiçbir zaman paylaşılmaz.
          </AppText>

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
            placeholder="Kendinden ve yürüyüş alışkanlıklarından kısaca bahset."
            multiline
            maxLength={300}
            hint={`${bio.length}/300 karakter`}
          />

          <Button label="Değişiklikleri kaydet" onPress={onSubmit} loading={saving} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
