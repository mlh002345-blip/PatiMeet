import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api, ApiError, type AlertTypeInfo } from '../../src/api';
import { DateTimeField } from '../../src/components/DateTimeField';
import { PhotoGridPicker, type PickedPhoto } from '../../src/components/PhotoGridPicker';
import {
  AppText,
  Banner,
  Button,
  Card,
  ChoiceGroup,
  DetailHeader,
  Field,
  PageIntro,
  Screen,
} from '../../src/components/ui';
import { alertTypeLabels } from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, spacing } from '../../src/theme';

const MAX_PHOTOS = 5;

/**
 * Güvenli Topluluk bildirimi oluşturma (kayıp hayvan ilanı dahil).
 *
 * KONUM: Bilinçli olarak yalnızca semt ve serbest metin bir yaklaşık bölge
 * tarifi soruluyor. Kesin konum, koordinat veya açık adres alanı yok; sunucu
 * da adres benzeri girdileri reddediyor.
 */
export default function CreateAlertScreen() {
  const router = useRouter();
  const { user } = useSession();

  const [types, setTypes] = useState<AlertTypeInfo[]>([]);
  const [type, setType] = useState<string | null>(null);
  const [animalName, setAnimalName] = useState('');
  const [district, setDistrict] = useState<string | null>(user?.district ?? null);
  const [districts, setDistricts] = useState<string[]>([]);
  const [areaNote, setAreaNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .alertTypes()
      .then((res) => setTypes(res.types))
      .catch(() => setFormError('Bildirim türleri yüklenemedi. Bağlantınızı kontrol edin.'));

    api
      .districts()
      .then((res) => setDistricts(res.districts))
      .catch(() => {
        if (user?.district) setDistricts([user.district]);
      });
  }, [user?.district]);

  /** Seçilen türün hangi alanları zorunlu kıldığı sunucudan geliyor. */
  const selected = useMemo(
    () => types.find((entry) => entry.value === type) ?? null,
    [types, type]
  );

  async function onSubmit() {
    setFormError(null);
    const next: Record<string, string> = {};

    if (!type) next.type = 'Bildirim türü seçin.';
    if (!district) next.district = 'Semt seçin.';
    if (description.trim().length < 10) next.description = 'Açıklama en az 10 karakter olmalı.';
    if (selected?.requiresAnimalName && !animalName.trim()) {
      next.animalName = 'Hayvanın adını yazın.';
    }
    // Fotoğraf hiçbir türde zorunlu değil (bkz. domain/alerts.ts).
    if (selected?.requiresOccurredAt && occurredAt.getTime() > Date.now()) {
      next.occurredAt = 'Son görülme zamanı gelecekte olamaz.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const res = await api.createAlert({
        type: type!,
        animalName: animalName.trim() || null,
        district: district!,
        areaNote: areaNote.trim(),
        occurredAt: selected?.requiresOccurredAt ? occurredAt.getTime() : null,
        description: description.trim(),
        photoKeys: photos.map((photo) => photo.key),
      });
      router.replace(`/alerts/${res.alert.id}`);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Bildirim oluşturulamadı. Tekrar deneyin.'
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
      <Screen topInset>
        <View style={{ paddingTop: spacing.lg }}>
          <DetailHeader label="Yeni topluluk bildirimi" onBack={() => router.back()} />
          <PageIntro
            kicker="GÜVENLİ TOPLULUK"
            title="Komşularını haberdar et"
            description="Yaklaşık bölgeyi ve doğrulanabilir ayrıntıları paylaş; kişisel iletişim bilgilerini gizli tut."
          />
          {formError ? <Banner tone="error" message={formError} /> : null}

          <ChoiceGroup
            label="Bildirim türü"
            required
            columns
            options={(types.length > 0
              ? types.map((entry) => ({ value: entry.value, label: entry.label }))
              : Object.entries(alertTypeLabels).map(([value, label]) => ({ value, label }))
            )}
            value={type}
            onChange={setType}
            error={errors.type}
          />

          {selected ? (
            <AppText variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.lg }}>
              {selected.description}
            </AppText>
          ) : null}

          {selected?.requiresAnimalName || type === 'bulunan_hayvan' || type === 'gecici_yuva' ? (
            <Field
              label="Hayvanın adı"
              value={animalName}
              onChangeText={setAnimalName}
              placeholder="Örn. Zeytin"
              maxLength={60}
              error={errors.animalName}
              required={selected?.requiresAnimalName}
              autoCapitalize="words"
            />
          ) : null}

          <PhotoGridPicker
            label="Fotoğraf ekle — isteğe bağlı"
            hint={
              selected?.photoHint
                ? `${selected.photoHint} En fazla ${MAX_PHOTOS} fotoğraf ekleyebilirsin.`
                : `İstersen en fazla ${MAX_PHOTOS} fotoğraf ekleyebilirsin.`
            }
            purpose="alert_photo"
            values={photos}
            onChange={setPhotos}
            max={MAX_PHOTOS}
            error={errors.photos}
          />

          <ChoiceGroup
            label={type === 'kayip_hayvan' ? 'Son görüldüğü semt' : 'Semt'}
            required
            options={districts.map((d) => ({ value: d, label: d }))}
            value={district}
            onChange={setDistrict}
            error={errors.district}
          />

          <Field
            label="Yaklaşık bölge"
            value={areaNote}
            onChangeText={setAreaNote}
            placeholder="Örn. Yoğurtçu Parkı civarı"
            maxLength={120}
            hint="Yalnızca yaklaşık bir tarif yaz."
          />

          <Card style={{ backgroundColor: colors.warningLight, borderColor: colors.warningLight, marginBottom: spacing.lg }}>
            <AppText variant="bodyStrong" color={colors.warning}>
              Kesin konum paylaşma
            </AppText>
            <AppText variant="body" color={colors.warning} style={{ marginTop: spacing.xs }}>
              Açık adres, kapı numarası, koordinat veya harita bağlantısı yazma. Bunlar hem senin
              hem hayvanın güvenliğini riske atar ve sunucu tarafından reddedilir.
            </AppText>
          </Card>

          {selected?.requiresOccurredAt ? (
            <DateTimeField
              label={
                type === 'kayip_hayvan' || type === 'bulunan_hayvan'
                  ? 'Son görülme tarihi ve saati'
                  : 'Olayın tarihi ve saati'
              }
              value={occurredAt}
              onChange={setOccurredAt}
              bounds="past"
              error={errors.occurredAt}
            />
          ) : null}

          <Field
            label="Açıklama"
            value={description}
            onChangeText={setDescription}
            placeholder="Tasması, tüy rengi, davranışı gibi tanınmasını kolaylaştıran ayrıntıları yaz."
            multiline
            maxLength={1000}
            required
            error={errors.description}
            hint={`${description.length}/1000 karakter`}
          />

          <AppText variant="caption" color={colors.textSubtle} style={{ marginBottom: spacing.lg }}>
            İletişim uygulama içi mesajla kurulur; telefon numaranı veya adresini yazmana gerek
            yok.
          </AppText>

          <Button label="Bildirimi yayınla" onPress={onSubmit} loading={saving} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
