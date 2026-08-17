import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { DateTimeField } from '../../src/components/DateTimeField';
import {
  AppText,
  Banner,
  Button,
  ChoiceGroup,
  Field,
  Screen,
} from '../../src/components/ui';
import { dogSizeLabels, eventTypeLabels } from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, spacing } from '../../src/theme';

/** Etkinlik oluşturma (11/14). */
export default function CreateEventScreen() {
  const router = useRouter();
  const { user } = useSession();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<string | null>('yuruyus');
  // Varsayılan: yarın 10:00 — geçmiş tarih kuralına takılmayan makul bir başlangıç.
  const [startsAt, setStartsAt] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
    return date;
  });
  const [district, setDistrict] = useState<string | null>(user?.district ?? null);
  const [districts, setDistricts] = useState<string[]>([]);
  const [meetingPoint, setMeetingPoint] = useState('');
  const [capacityText, setCapacityText] = useState('8');
  const [dogSize, setDogSize] = useState<string>('hepsi');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('Tasma zorunlu. Aşıları eksik köpekleri getirmeyin.');

  const [errors, setErrors] = useState<{
    title?: string;
    type?: string;
    district?: string;
    meetingPoint?: string;
    capacity?: string;
    startsAt?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .districts()
      .then((res) => setDistricts(res.districts))
      .catch(() => {
        // Semt listesi yüklenemezse kullanıcının kendi semti seçili kalır.
        if (user?.district) setDistricts([user.district]);
      });
  }, [user?.district]);

  async function onSubmit() {
    const next: typeof errors = {};

    if (title.trim().length < 3) next.title = 'Başlık en az 3 karakter olmalı.';
    if (!type) next.type = 'Etkinlik türü seçin.';
    if (!district) next.district = 'Semt seçin.';
    if (meetingPoint.trim().length < 3) {
      next.meetingPoint = 'Buluşma noktasını kısaca açıklayın.';
    }

    const capacity = Number(capacityText.trim());
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > 50) {
      next.capacity = 'Katılımcı sınırı 2 ile 50 arasında olmalı.';
    }

    // İş kuralı: geçmiş tarihli etkinlik oluşturulamaz.
    if (startsAt.getTime() <= Date.now()) {
      next.startsAt = 'Etkinlik tarihi gelecekte olmalı.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setFormError(null);
    setSubmitting(true);
    try {
      const res = await api.createEvent({
        title: title.trim(),
        type: type!,
        startsAt: startsAt.getTime(),
        district: district!,
        meetingPoint: meetingPoint.trim(),
        capacity,
        dogSize,
        description: description.trim(),
        rules: rules.trim(),
      });
      // Oluşturulan etkinliğe git; geri tuşu listeye döner.
      router.replace(`/event/${res.event.id}`);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Etkinlik oluşturulamadı. Tekrar deneyin.'
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
        <View style={{ paddingTop: spacing.lg }}>
          <AppText variant="display">Yürüyüş oluştur</AppText>
          <AppText
            variant="body"
            color={colors.textMuted}
            style={{ marginTop: spacing.xs, marginBottom: spacing.xl }}
          >
            Buluşmanı planla, semtindeki köpek sahipleri katılsın.
          </AppText>

          {formError ? <Banner tone="error" message={formError} /> : null}

          <Field
            label="Başlık"
            value={title}
            onChangeText={setTitle}
            placeholder="Örn. Yoğurtçu Parkı akşam yürüyüşü"
            error={errors.title}
            maxLength={80}
            required
          />

          <ChoiceGroup
            label="Etkinlik türü"
            required
            options={Object.entries(eventTypeLabels).map(([value, label]) => ({ value, label }))}
            value={type}
            onChange={setType}
            error={errors.type}
          />

          <DateTimeField
            label="Tarih ve saat"
            value={startsAt}
            onChange={setStartsAt}
            error={errors.startsAt}
          />

          <ChoiceGroup
            label="Semt"
            required
            options={districts.map((d) => ({ value: d, label: d }))}
            value={district}
            onChange={setDistrict}
            error={errors.district}
          />

          <Field
            label="Buluşma noktası"
            value={meetingPoint}
            onChangeText={setMeetingPoint}
            placeholder="Örn. Parkın ana girişi, köpek alanı tarafı"
            error={errors.meetingPoint}
            hint="Açık adres yazmayın; herkesin bulabileceği genel bir nokta tarif edin."
            maxLength={160}
            required
          />

          <Field
            label="Katılımcı sınırı"
            value={capacityText}
            onChangeText={setCapacityText}
            placeholder="8"
            keyboardType="number-pad"
            error={errors.capacity}
            maxLength={2}
            required
          />

          <ChoiceGroup
            label="Uygun köpek boyutu"
            options={[
              { value: 'hepsi', label: dogSizeLabels.hepsi },
              { value: 'kucuk', label: dogSizeLabels.kucuk },
              { value: 'orta', label: dogSizeLabels.orta },
              { value: 'buyuk', label: dogSizeLabels.buyuk },
            ]}
            value={dogSize}
            onChange={setDogSize}
          />

          <Field
            label="Açıklama"
            value={description}
            onChangeText={setDescription}
            placeholder="Rotayı ve planı kısaca anlat."
            multiline
            maxLength={600}
          />

          <Field
            label="Kurallar"
            value={rules}
            onChangeText={setRules}
            placeholder="Örn. Tasma zorunlu, poşetinizi getirin."
            multiline
            maxLength={600}
          />

          <Button label="Etkinliği oluştur" onPress={onSubmit} loading={submitting} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
