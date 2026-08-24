import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, type DogDocumentDetail } from '../../../src/api';
import { AppText, DetailHeader } from '../../../src/components/ui';
import { PdfDocumentViewer } from '../../../src/components/PdfDocumentViewer';
import { colors, spacing } from '../../../src/theme';

/**
 * Belge önizleme — uygulama içi, güvenli.
 *
 * Belgenin süreli imzalı adresi hiçbir zaman üçüncü taraf bir görüntüleyiciye
 * (ör. Google Docs Viewer) gönderilmez ve kullanıcı uygulama dışına
 * çıkarılmaz:
 *   - Görseller doğrudan bu ekranda, cihazın kendi ağ isteğiyle gösterilir
 *     (tıpkı uygulamanın başka yerlerinde fotoğraf gösterdiği gibi).
 *   - PDF, `PdfDocumentViewer` bileşeni tarafından önce cihazın önbellek
 *     dizinine geçici indirilip yerel dosya yolundan (native, ağ isteği
 *     yapmadan) sayfalanarak gösterilir; ekran kapanınca dosya silinir.
 *
 * `PdfDocumentViewer` uzantısız bir yoldan içe aktarılır: `react-native-pdf`
 * yerel bir modül olduğundan web derlemesinde Metro otomatik olarak
 * `PdfDocumentViewer.web.tsx` sürümünü seçer, böylece o modül hiçbir zaman
 * web paketine dahil edilmez (bkz. src/components/PdfDocumentViewer.tsx).
 */
export default function DocumentPreviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();

  const [doc, setDoc] = useState<DogDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  const isPdf = doc?.contentType === 'application/pdf';
  const isImage = Boolean(doc?.contentType?.startsWith('image/'));

  useEffect(() => {
    let cancelled = false;

    api
      .document(params.id)
      .then((res) => {
        if (!cancelled) setDoc(res.document);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Belge yüklenemedi.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const goBack = useCallback(() => router.back(), [router]);

  return (
    <GestureHandlerRootView style={s.screen}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <DetailHeader label={doc?.title || doc?.typeLabel || 'Belge'} onBack={goBack} />
      </View>

      <View style={s.body}>
        {loading ? (
          <View style={s.centered}>
            <ActivityIndicator size="large" color={colors.copperAction} />
            <AppText variant="body" color={colors.textOnDarkMuted} style={{ marginTop: spacing.md }}>
              Belge yükleniyor…
            </AppText>
          </View>
        ) : error ? (
          <ErrorState message={error} />
        ) : !doc ? (
          <ErrorState message="Belge bulunamadı." />
        ) : isImage && doc.url ? (
          imageError ? (
            <ErrorState message="Görsel açılamadı. Tekrar deneyin." />
          ) : (
            <ZoomableImage uri={doc.url} onError={() => setImageError(true)} />
          )
        ) : isPdf && doc.url ? (
          <PdfDocumentViewer url={doc.url} documentId={doc.id} />
        ) : (
          <ErrorState message="Bu belge türü uygulama içinde önizlenemiyor." />
        )}
      </View>
    </GestureHandlerRootView>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <View style={s.centered}>
      <SymbolView
        name={{ ios: 'exclamationmark.triangle', android: 'error_outline', web: 'error_outline' }}
        size={32}
        tintColor={colors.textOnDarkMuted}
      />
      <AppText
        variant="body"
        color={colors.textOnDarkMuted}
        style={{ marginTop: spacing.md, textAlign: 'center', paddingHorizontal: spacing.xl }}
      >
        {message}
      </AppText>
    </View>
  );
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

/** Sıkıştırma (pinch) ve sürükleme ile yakınlaştırılabilir görsel. */
function ZoomableImage({ uri, onError }: { uri: string; onError: () => void }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  function reset() {
    'worklet';
    scale.value = withSpring(1);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= MIN_SCALE) reset();
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value <= MIN_SCALE) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > MIN_SCALE) {
        reset();
      } else {
        scale.value = withSpring(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={s.zoomArea}>
        <Animated.Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, animatedStyle]}
          resizeMode="contain"
          onError={onError}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.obsidian },
  header: { paddingHorizontal: spacing.lg },
  body: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  zoomArea: { flex: 1, overflow: 'hidden' },
});
