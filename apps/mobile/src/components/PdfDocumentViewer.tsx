import { Directory, File, Paths } from 'expo-file-system';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import RNPdf, { type PdfError, type PdfRef } from 'react-native-pdf';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './ui';
import { colors, radius, spacing } from '../theme';

/**
 * PDF'i cihazın önbelleğine geçici indirip yerel dosya yolundan (native, ağ
 * isteği yapmadan) sayfalayarak gösterir.
 *
 * Bu dosya `react-native-pdf`'i içe aktardığı için yalnızca iOS/Android'de
 * kullanılmalı — web derlemesinde bunun yerine `PdfDocumentViewer.web.tsx`
 * yüklenir. `[id].tsx` bu bileşeni uzantısız bir yoldan (`./PdfDocumentViewer`)
 * içe aktarır; Metro'nun platforma göre modül çözümlemesi web'de otomatik
 * olarak `.web.tsx` sürümünü seçer, böylece `react-native-pdf` hiçbir zaman
 * web paketine dahil edilmez.
 */

const CACHE_DIR = new Directory(Paths.cache, 'patimeet-documents');

function cacheFileFor(documentId: string): File {
  return new File(CACHE_DIR, `${documentId}.pdf`);
}

/** Önceki oturumdan kalmış olabilecek tüm geçici belgeleri temizler. */
function clearDocumentCache(): void {
  try {
    if (CACHE_DIR.exists) CACHE_DIR.delete();
  } catch {
    // Dizin yoksa veya silinemiyorsa sorun değil; bir sonraki indirme yeniden oluşturur.
  }
}

export function PdfDocumentViewer({ url, documentId }: { url: string; documentId: string }) {
  const insets = useSafeAreaInsets();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const pdfRef = useRef<PdfRef>(null);

  useEffect(() => {
    let cancelled = false;
    setDownloading(true);
    setError(null);
    setLocalUri(null);

    // Bir önceki belgeden kalmış olabilecek dosyaları temizleyip yalnız bu
    // belgeyi indiriyoruz; kalıcı genel bir adres asla üretilmez.
    clearDocumentCache();
    if (!CACHE_DIR.exists) CACHE_DIR.create({ intermediates: true });

    File.downloadFileAsync(url, cacheFileFor(documentId), { idempotent: true })
      .then((downloaded) => {
        if (!cancelled) setLocalUri(downloaded.uri);
      })
      .catch(() => {
        if (!cancelled) setError('Belge indirilemedi. Bağlantınızı kontrol edip tekrar deneyin.');
      })
      .finally(() => {
        if (!cancelled) setDownloading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url, documentId]);

  // Ekran kapanınca (bileşen kaldırılınca) indirilen geçici dosya silinir.
  useEffect(() => {
    return () => {
      try {
        const file = cacheFileFor(documentId);
        if (file.exists) file.delete();
      } catch {
        // yoksay
      }
    };
  }, [documentId]);

  if (error) {
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
          {error}
        </AppText>
      </View>
    );
  }

  if (downloading || !localUri) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={colors.copperAction} />
        <AppText variant="body" color={colors.textOnDarkMuted} style={{ marginTop: spacing.md }}>
          Belge indiriliyor…
        </AppText>
      </View>
    );
  }

  return (
    <>
      <RNPdf
        ref={pdfRef}
        source={{ uri: localUri, cache: false }}
        style={s.pdf}
        enablePaging
        minScale={1}
        maxScale={4}
        onLoadComplete={(numberOfPages) => setPageCount(numberOfPages)}
        onPageChanged={(currentPage) => setPage(currentPage)}
        onError={(err: PdfError) => setError(err.message || 'Belge görüntülenemedi.')}
        renderActivityIndicator={() => <ActivityIndicator size="large" color={colors.copperAction} />}
      />
      {pageCount > 1 ? (
        <View style={[s.pageBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Önceki sayfa"
            disabled={page <= 1}
            onPress={() => pdfRef.current?.setPage(page - 1)}
            style={[s.pageButton, page <= 1 && s.pageButtonDisabled]}
          >
            <SymbolView
              name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
              size={20}
              tintColor={colors.textOnDark}
            />
          </Pressable>
          <AppText variant="label" color={colors.textOnDark}>
            Sayfa {page} / {pageCount}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sonraki sayfa"
            disabled={page >= pageCount}
            onPress={() => pdfRef.current?.setPage(page + 1)}
            style={[s.pageButton, page >= pageCount && s.pageButtonDisabled]}
          >
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={20}
              tintColor={colors.textOnDark}
            />
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pdf: { flex: 1, backgroundColor: colors.obsidian },
  pageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.obsidianSoft,
  },
  pageButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243, 237, 227, 0.08)',
  },
  pageButtonDisabled: { opacity: 0.35 },
});
