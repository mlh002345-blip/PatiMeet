import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { AppText, Banner, Button, Card, ChoiceGroup, DetailHeader, Field, PageIntro } from '../../src/components/ui';
import { dogSizeLabels } from '../../src/labels';
import { useSession } from '../../src/session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../src/theme';

const WHEN = [
  { value: '0', label: 'Şimdi' },
  { value: '30', label: '30 dakika içinde' },
  { value: '60', label: '1 saat içinde' },
  { value: '120', label: '2 saat içinde' },
];

const DURATIONS = [
  { value: '30', label: '30 dk' },
  { value: '45', label: '45 dk' },
  { value: '60', label: '1 saat' },
  { value: '90', label: '1,5 saat' },
];

/**
 * Hızlı yürüyüş daveti.
 *
 * Kesin buluşma noktası sorulmaz: yalnızca semt ve yaklaşık bölge tarifi.
 * Katılım sonrası ayrıntı mesajlaşma üzerinden konuşulur.
 */
export default function CreateInviteScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useSession();
  const dogs = user?.dogs ?? [];

  const [dogId, setDogId] = useState<string | null>(dogs[0]?.id ?? null);
  const [districts, setDistricts] = useState<string[]>([]);
  const [district, setDistrict] = useState<string | null>(user?.district ?? null);
  const [areaNote, setAreaNote] = useState('');
  const [when, setWhen] = useState<string | null>('30');
  const [duration, setDuration] = useState<string | null>('45');
  const [pace, setPace] = useState<string | null>('normal');
  const [dogSize, setDogSize] = useState<string | null>('hepsi');
  const [note, setNote] = useState('');
  const [paces, setPaces] = useState<Array<{ value: string; label: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Oturum eşzamansız yükleniyor: ekran doğrudan bir bağlantıyla açıldığında
   * `user` ilk render'da henüz yok ve semt boş kalıyordu. Kullanıcı geldiğinde
   * bir kez dolduruyoruz; kullanıcının kendi seçimi ezilmiyor.
   */
  const districtHydrated = useRef(Boolean(user?.district));
  useEffect(() => {
    if (districtHydrated.current || !user?.district) return;
    districtHydrated.current = true;
    setDistrict(user.district);
    setDogId((current) => current ?? user.dogs?.[0]?.id ?? null);
  }, [user?.district, user?.dogs]);

  useEffect(() => {
    api.inviteOptions().then((res) => setPaces(res.paces)).catch(() => undefined);
    api
      .districts()
      .then((res) => setDistricts(res.districts))
      .catch(() => {
        if (user?.district) setDistricts([user.district]);
      });
  }, [user?.district]);

  async function submit() {
    setError(null);
    if (!district || !when || !duration || !pace) {
      setError('Semt, zaman, süre ve tempo seçin.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.createInvite({
        dogId,
        district,
        areaNote: areaNote.trim() || undefined,
        // "Şimdi" seçilirse birkaç dakika sonrası; sunucu geçmişi reddediyor.
        startsAt: Date.now() + Math.max(Number(when), 2) * 60_000,
        durationMinutes: Number(duration),
        pace,
        dogSize: dogSize ?? 'hepsi',
        note: note.trim() || undefined,
      });
      router.replace(`/neighbourhood/invite/${res.invite.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Davet oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.screen} contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl }}>
        <DetailHeader label="Hızlı yürüyüş daveti" onBack={() => router.back()} />
        <View style={{ paddingHorizontal: spacing.lg }}>
        <PageIntro
          kicker="MAHALLE"
          title="Birlikte yürüyelim"
          description="Kısa süreli bir davet aç; semtindeki komşuların katılabilsin."
          compact
        />
        {error ? <Banner tone="error" message={error} /> : null}

        {dogs.length > 1 ? (
          <ChoiceGroup
            label="Köpeğin"
            options={dogs.map((d) => ({ value: d.id, label: d.name }))}
            value={dogId}
            onChange={setDogId}
          />
        ) : null}

        <ChoiceGroup
          label="Semt"
          required
          options={districts.map((d) => ({ value: d, label: d }))}
          value={district}
          onChange={setDistrict}
        />

        <Field
          label="Yaklaşık bölge"
          value={areaNote}
          onChangeText={setAreaNote}
          placeholder="Örn. Moda sahili civarı"
          maxLength={120}
          hint="Kesin adres yazma; buluşma noktasını mesajla konuşursunuz."
        />

        <ChoiceGroup label="Ne zaman" required options={WHEN} value={when} onChange={setWhen} />
        <ChoiceGroup label="Tahmini süre" required options={DURATIONS} value={duration} onChange={setDuration} />
        <ChoiceGroup
          label="Tempo"
          required
          options={paces.length > 0 ? paces : [{ value: 'normal', label: 'Normal' }]}
          value={pace}
          onChange={setPace}
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
          label="Kısa not"
          value={note}
          onChangeText={setNote}
          placeholder="Örn. sakin tempoda yürüyoruz"
          multiline
          maxLength={300}
        />

        <Card tone="inset" style={{ marginBottom: spacing.lg }}>
          <AppText variant="caption" color={colors.textMuted}>
            Davet, yürüyüş süresi dolduğunda kendiliğinden kapanır. Aynı anda en fazla 3 açık
            davetin olabilir.
          </AppText>
        </Card>

        <Button label="Daveti yayınla" onPress={submit} loading={busy} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
});
