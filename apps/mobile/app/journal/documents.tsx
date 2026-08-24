import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { AppText, Banner, Button, Card, ChoiceGroup, DetailHeader, Field, LoadingState } from '../../src/components/ui';
import { readFileBytes } from '../../src/fileBytes';
import { formatShortDate } from '../../src/labels';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

type PendingUpload = { uri: string; mimeType: string; name: string };

/**
 * Sağlık belgeleri.
 *
 * Belgeler yalnızca sahibine açıktır ve adresleri süreli imzalı üretilir;
 * kalıcı herkese açık bağlantı verilmez (bkz. storage/index.ts).
 */
export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ dogId: string }>();
  const [docTypes, setDocTypes] = useState<Array<{ value: string; label: string }>>([]);
  const [type, setType] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadStage, setUploadStage] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);

  const loader = useLoader(() => api.documents(params.dogId), [params.dogId]);

  useEffect(() => {
    api
      .journalTypes()
      .then((res) => setDocTypes(res.documentTypes))
      .catch(() => undefined);
  }, []);

  async function pickImage() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('İzin gerekli', 'Belge seçmek için galeri erişimi vermeniz gerekiyor.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const asset = result.assets[0];
    setPending({
      uri: asset.uri,
      mimeType: asset.mimeType || 'image/jpeg',
      name: asset.fileName || 'belge.jpg',
    });
  }

  async function pickPdf() {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const asset = result.assets[0];
    setPending({
      uri: asset.uri,
      mimeType: asset.mimeType || 'application/pdf',
      name: asset.name || 'belge.pdf',
    });
  }

  async function upload() {
    setError(null);
    if (!type) {
      setError('Belge türü seçin.');
      return;
    }
    if (!pending) {
      setError('Önce bir fotoğraf veya PDF seçin.');
      return;
    }

    setBusy(true);
    setUploadStage('uploading');
    try {
      const bytes = await readFileBytes(pending.uri);
      const uploaded = await api.uploadPhoto('document', bytes, pending.mimeType);
      setUploadStage('saving');
      await api.addDocument({
        dogId: params.dogId,
        type,
        title: title.trim() || undefined,
        storageKey: uploaded.key,
      });
      setTitle('');
      setPending(null);
      setMessage('Belge eklendi.');
      loader.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Belge yüklenemedi. Tekrar deneyin.');
    } finally {
      setBusy(false);
      setUploadStage('idle');
    }
  }

  function confirmRemove(id: string, label: string) {
    Alert.alert('Belgeyi sil', `"${label}" belgesini silmek istediğinize emin misiniz?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteDocument(id);
            loader.reload();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Belge silinemedi. Tekrar deneyin.');
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl }}>
      <DetailHeader label="Sağlık belgeleri" onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }}>
      {message ? <Banner tone="success" message={message} /> : null}
      {error ? <Banner tone="error" message={error} /> : null}

      <Card style={{ marginBottom: spacing.lg }}>
        <ChoiceGroup
          label="Belge türü"
          required
          columns
          options={docTypes}
          value={type}
          onChange={setType}
        />
        <Field label="Başlık" value={title} onChangeText={setTitle} placeholder="İsteğe bağlı" maxLength={120} />

        <View style={s.pickRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fotoğraf/Görsel seç"
            onPress={pickImage}
            disabled={busy}
            style={({ pressed }) => [s.pickButton, pressed && s.pickButtonPressed]}
          >
            <SymbolView
              name={{ ios: 'photo', android: 'image', web: 'image' }}
              size={18}
              tintColor={colors.primary}
            />
            <AppText variant="label">Fotoğraf/Görsel seç</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="PDF seç"
            onPress={pickPdf}
            disabled={busy}
            style={({ pressed }) => [s.pickButton, pressed && s.pickButtonPressed]}
          >
            <SymbolView
              name={{ ios: 'doc.text', android: 'description', web: 'description' }}
              size={18}
              tintColor={colors.primary}
            />
            <AppText variant="label">PDF seç</AppText>
          </Pressable>
        </View>

        {pending ? (
          <View style={s.pendingRow}>
            <SymbolView
              name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
              size={16}
              tintColor={colors.success}
            />
            <AppText variant="caption" numberOfLines={1} style={{ flex: 1 }}>
              {pending.name}
            </AppText>
          </View>
        ) : null}

        <Button
          label={
            uploadStage === 'uploading'
              ? 'Yükleniyor…'
              : uploadStage === 'saving'
                ? 'Kaydediliyor…'
                : 'Belge ekle'
          }
          onPress={upload}
          loading={busy}
        />
        <AppText variant="caption" color={colors.textMuted} style={{ marginTop: spacing.md }}>
          Belgelerin yalnızca sana açıktır. Bağlantılar süreli üretilir, herkese açık hale
          gelmez.
        </AppText>
      </Card>

      {loader.loading ? (
        <LoadingState />
      ) : (
        (loader.data?.documents ?? []).map((doc) => (
          <Card key={doc.id} style={{ marginBottom: spacing.sm }}>
            <View style={s.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${doc.title || doc.typeLabel} belgesini aç`}
                onPress={() => router.push(`/journal/document/${doc.id}`)}
                style={s.rowMain}
              >
                <View style={s.icon}>
                  <SymbolView
                    name={{ ios: 'doc.text', android: 'description', web: 'description' }}
                    size={20}
                    tintColor={colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{doc.title || doc.typeLabel}</AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    {doc.typeLabel} · {formatShortDate(doc.createdAt)}
                  </AppText>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Belgeyi sil"
                onPress={() => confirmRemove(doc.id, doc.title || doc.typeLabel)}
                style={s.action}
              >
                <SymbolView
                  name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                  size={18}
                  tintColor={colors.danger}
                />
              </Pressable>
            </View>
          </Card>
        ))
      )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pickRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  pickButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickButtonPressed: { opacity: 0.7 },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
});
