import React, { useState } from 'react';
import { View } from 'react-native';
import type { Dog } from '../api';
import { dogSizeLabels, energyLabels, sociabilityLabels } from '../labels';
import { colors, spacing } from '../theme';
import { PhotoPicker } from './PhotoPicker';
import { AppText, Banner, Button, Checkbox, ChoiceGroup, Field } from './ui';

export interface DogFormValues {
  name: string;
  breed: string | null;
  birthYear: number | null;
  size: string;
  energy: string;
  sociability: string;
  bio: string;
  vaccinated: boolean;
  photoUrl: string | null;
}

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Köpek profili formu. Hem oluşturma (4/14) hem düzenleme ekranında kullanılır.
 *
 * Zorunlu alanlar yalnızca ad, boyut, enerji ve sosyallik; diğerleri sonradan
 * tamamlanabilir (MVP 4.3).
 */
export function DogForm({
  initial,
  submitLabel,
  submitting,
  formError,
  onSubmit,
}: {
  initial?: Dog | null;
  submitLabel: string;
  submitting: boolean;
  formError: string | null;
  onSubmit: (values: DogFormValues) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [breed, setBreed] = useState(initial?.breed ?? '');
  const [ageText, setAgeText] = useState(
    initial?.birthYear ? String(CURRENT_YEAR - initial.birthYear) : ''
  );
  const [size, setSize] = useState<string | null>(initial?.size ?? null);
  const [energy, setEnergy] = useState<string | null>(initial?.energy ?? null);
  const [sociability, setSociability] = useState<string | null>(initial?.sociability ?? null);
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [vaccinated, setVaccinated] = useState(initial?.vaccinated ?? false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial?.photoUrl ?? null);

  const [errors, setErrors] = useState<{
    name?: string;
    size?: string;
    energy?: string;
    sociability?: string;
    age?: string;
  }>({});

  function handleSubmit() {
    const next: typeof errors = {};

    if (!name.trim()) next.name = 'Köpeğinizin adını girin.';
    if (!size) next.size = 'Boyut seçin.';
    if (!energy) next.energy = 'Enerji seviyesi seçin.';
    if (!sociability) next.sociability = 'Sosyallik seviyesi seçin.';

    // Yaş isteğe bağlı; girilirse makul aralıkta olmalı.
    let birthYear: number | null = null;
    if (ageText.trim()) {
      const age = Number(ageText.trim());
      if (!Number.isInteger(age) || age < 0 || age > 25) {
        next.age = 'Yaş 0 ile 25 arasında bir sayı olmalı.';
      } else {
        birthYear = CURRENT_YEAR - age;
      }
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit({
      name: name.trim(),
      breed: breed.trim() || null,
      birthYear,
      size: size!,
      energy: energy!,
      sociability: sociability!,
      bio: bio.trim(),
      vaccinated,
      photoUrl,
    });
  }

  return (
    <View>
      {formError ? <Banner tone="error" message={formError} /> : null}

      <PhotoPicker
        label="Köpek fotoğrafı"
        value={photoUrl}
        onChange={setPhotoUrl}
        fallbackName={name || 'K'}
        emoji="🐕"
      />

      <Field
        label="Köpeğinin adı"
        value={name}
        onChangeText={setName}
        placeholder="Örn. Pati"
        error={errors.name}
        autoCapitalize="words"
        maxLength={40}
        required
      />

      <ChoiceGroup
        label="Boyut"
        required
        options={[
          { value: 'kucuk', label: dogSizeLabels.kucuk },
          { value: 'orta', label: dogSizeLabels.orta },
          { value: 'buyuk', label: dogSizeLabels.buyuk },
        ]}
        value={size}
        onChange={setSize}
        error={errors.size}
      />

      <ChoiceGroup
        label="Enerji seviyesi"
        required
        options={Object.entries(energyLabels).map(([value, label]) => ({ value, label }))}
        value={energy}
        onChange={setEnergy}
        error={errors.energy}
      />

      <ChoiceGroup
        label="Sosyallik"
        required
        options={Object.entries(sociabilityLabels).map(([value, label]) => ({ value, label }))}
        value={sociability}
        onChange={setSociability}
        error={errors.sociability}
      />

      <Field
        label="Cins"
        value={breed}
        onChangeText={setBreed}
        placeholder="Örn. Golden Retriever veya karışık"
        maxLength={60}
      />

      <Field
        label="Yaş"
        value={ageText}
        onChangeText={setAgeText}
        placeholder="Örn. 3"
        keyboardType="number-pad"
        error={errors.age}
        maxLength={2}
      />

      <Field
        label="Kısa açıklama"
        value={bio}
        onChangeText={setBio}
        placeholder="Örn. Top getirmeye bayılır, çocuklarla iyi anlaşır."
        multiline
        maxLength={300}
        hint={`${bio.length}/300 karakter`}
      />

      <View style={{ marginBottom: spacing.xl }}>
        <Checkbox checked={vaccinated} onToggle={() => setVaccinated((v) => !v)}>
          <AppText variant="body">Aşıları tam</AppText>
          <AppText variant="caption" color={colors.textSubtle}>
            Bu bilgi kullanıcı beyanıdır, PatiMeet tarafından doğrulanmaz.
          </AppText>
        </Checkbox>
      </View>

      <Button label={submitLabel} onPress={handleSubmit} loading={submitting} />
    </View>
  );
}
