import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { AppText, Banner, Button, Card, ChoiceGroup, DetailHeader, Field, LoadingState } from '../../src/components/ui';
import { formatShortDate } from '../../src/labels';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loader = useLoader(() => api.documents(params.dogId), [params.dogId]);

  useEffect(() => {
    api
      .journalTypes()
      .then((res) => setDocTypes(res.documentTypes))
      .catch(() => undefined);
  }, []);

  async function pickAndUpload() {
    setError(null);
    if (!type) {
      setError('Belge türü seçin.');
      return;
    }

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

    setBusy(true);
    try {
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const uploaded = await api.uploadPhoto('document', blob, asset.mimeType || blob.type || 'image/jpeg');
      await api.addDocument({
        dogId: params.dogId,
        type,
        title: title.trim() || undefined,
        storageKey: uploaded.key,
      });
      setTitle('');
      setMessage('Belge eklendi.');
      loader.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Belge yüklenemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api.deleteDocument(id).catch(() => undefined);
    loader.reload();
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
        <Button label="Belge ekle" onPress={pickAndUpload} loading={busy} />
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
              {doc.url ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Belgeyi aç"
                  onPress={() => void Linking.openURL(doc.url as string)}
                  style={s.action}
                >
                  <SymbolView
                    name={{ ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' }}
                    size={18}
                    tintColor={colors.primary}
                  />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Belgeyi sil"
                onPress={() => remove(doc.id)}
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
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
