import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MatchFactor, MatchScore as MatchScoreData } from '../api';
import { colors, radius, spacing } from '../theme';
import { AppText, Card } from './ui';

/**
 * Uyum skoru göstergeleri.
 *
 * Skor kasıtlı olarak "açıklanabilir" sunulur: kullanıcı yalnızca bir sayı
 * değil, o sayıyı oluşturan etkenleri ve her birinin ne anlama geldiğini görür.
 *
 * Skor bir garanti değildir; bu uyarı büyük gösterimde her zaman yer alır.
 */
const LEVEL_LABELS: Record<MatchScoreData['level'], string> = {
  yuksek: 'Yüksek uyum',
  orta: 'Orta uyum',
  dusuk: 'Düşük uyum',
};

function levelColor(level: MatchScoreData['level']): { fg: string; bg: string } {
  if (level === 'yuksek') return { fg: colors.success, bg: colors.successLight };
  if (level === 'orta') return { fg: colors.warning, bg: colors.warningLight };
  return { fg: colors.textMuted, bg: colors.surfaceMuted };
}

/** Keşfet kartında gösterilen küçük rozet. */
export function MatchBadge({ match }: { match: MatchScoreData }) {
  const palette = levelColor(match.level);

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <AppText variant="caption" color={palette.fg} style={styles.badgeScore}>
        %{match.score}
      </AppText>
      <AppText variant="caption" color={palette.fg}>
        {' '}
        uyum
      </AppText>
    </View>
  );
}

/** Tek bir etkenin dolu/boş çubuğu ve açıklaması. */
function FactorRow({ factor }: { factor: MatchFactor }) {
  const ratio = factor.max > 0 ? factor.points / factor.max : 0;
  const fill = Math.max(0.06, Math.min(1, ratio));

  const tone =
    ratio >= 0.8 ? colors.success : ratio >= 0.5 ? colors.accent : colors.textSubtle;

  return (
    <View style={styles.factor}>
      <View style={styles.factorHeader}>
        <AppText variant="label" color={colors.text}>
          {factor.label}
        </AppText>
        <AppText variant="caption" color={colors.textSubtle}>
          {factor.points}/{factor.max}
        </AppText>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { flex: fill, backgroundColor: tone }]} />
        <View style={{ flex: 1 - fill }} />
      </View>

      <AppText variant="caption" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
        {factor.note}
      </AppText>
    </View>
  );
}

/**
 * Profil detayındaki tam kırılım.
 *
 * `viewerDogName` verilirse hangi köpek için hesaplandığı yazılır — çoklu
 * köpek durumunda gerekli.
 */
export function MatchBreakdownCard({
  match,
  viewerDogName,
  targetDogName,
}: {
  match: MatchScoreData;
  viewerDogName?: string;
  targetDogName?: string;
}) {
  const palette = levelColor(match.level);
  const [expanded, setExpanded] = useState(false);
  const visibleFactors = expanded ? match.factors : match.factors.slice(0, 3);

  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.scoreCircle, { backgroundColor: palette.bg }]}>
          <AppText variant="title" color={palette.fg}>
            %{match.score}
          </AppText>
        </View>

        <View style={{ flex: 1, marginLeft: spacing.lg }}>
          <AppText variant="heading" color={palette.fg}>
            {LEVEL_LABELS[match.level]}
          </AppText>
          {viewerDogName && targetDogName ? (
            <AppText variant="caption" color={colors.textMuted}>
              {viewerDogName} ↔ {targetDogName}
            </AppText>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: spacing.lg }}>
        {visibleFactors.map((factor) => (
          <FactorRow key={factor.key} factor={factor} />
        ))}
      </View>

      {match.factors.length > 3 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={styles.expandButton}
        >
          <AppText variant="label" color={colors.primary}>
            {expanded ? 'Ayrıntıları daralt' : `${match.factors.length - 3} ayrıntı daha göster`}
          </AppText>
        </Pressable>
      ) : null}

      {match.missing.length > 0 ? (
        <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.md }}>
          Eksik bilgi nedeniyle hesaplanamayan etkenler: {match.missing.join(', ')}. Profilleri
          tamamlamak skoru daha isabetli yapar.
        </AppText>
      ) : null}

      {/*
        Yasal ve etik sınır: skor yalnızca profil beyanlarına dayanır.
        Bu uyarı bilinçli olarak kaldırılamaz biçimde kartın içinde.
      */}
      <View style={styles.disclaimer}>
        <AppText variant="caption" color={colors.textMuted}>
          Bu skor yalnızca sizin ve karşı tarafın girdiği profil bilgilerine dayanan bir tahmindir.
          Sağlık, güvenlik veya uyum garantisi değildir. Köpeklerin gerçek uyumunu ilk buluşmada
          kontrollü biçimde gözlemleyin.
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  badgeScore: {
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factor: {
    marginBottom: spacing.lg,
  },
  factorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  track: {
    flexDirection: 'row',
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: radius.pill,
  },
  disclaimer: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  expandButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
  },
});
