import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { api } from '../../src/api';
import { AppText, DetailHeader, ErrorState, LoadingState, PageIntro, Screen } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

/**
 * Yasal metin görüntüleyici.
 *
 * Kullanıcı Sözleşmesi, KVKK metni, Topluluk Kuralları ve güvenlik önerileri
 * aynı ekranı kullanır. Metinler sunucudan gelir; böylece yeni sürüm
 * yayınlamadan güncellenebilir.
 */
export default function LegalDocumentScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const loader = useLoader(() => api.legalDocument(slug), [slug]);

  if (loader.loading) return <LoadingState label="Belge yükleniyor…" />;
  if (loader.error) return <ErrorState message={loader.error} onRetry={loader.reload} />;
  if (!loader.data) return <ErrorState message="Belge bulunamadı." />;

  return (
    <Screen topInset>
      <View style={{ paddingTop: spacing.lg }}>
        <DetailHeader label="PatiMeet belgeleri" onBack={() => router.back()} />
        <PageIntro kicker="ŞEFFAFLIK" title={loader.data.title} compact />
        <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>
          Son güncelleme: {loader.data.updatedAt}
        </AppText>

        <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xl }}>
          {loader.data.body}
        </AppText>
      </View>
    </Screen>
  );
}
