import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { CommunityAlert, DiscoverItem, EventSummary } from '../api';
import {
  alertTypeLabels,
  alertTypeSymbol,
  dogAgeLabel,
  dogSizeLabels,
  energyLabels,
  eventTypeLabels,
  formatEventDate,
  formatRelative,
  labelFor,
  sociabilityLabels,
  urgentAlertTypes,
} from '../labels';
import { colors, radius, spacing } from '../theme';
import { AppText, Card, ImageHero, PatiLine, SubtleBadge, Tag } from './ui';
import { MatchBadge } from './MatchScore';

/**
 * Keşfet listesindeki editoryal köpek kartı.
 *
 * Büyük fotoğraf ana taşıyıcı; uyum skoru sol üstte, isim ve karar vermeye
 * yarayan en fazla üç etiket fotoğrafın altında. Fotoğraf yoksa ImageHero
 * tutarlı bir premium fallback gösterir.
 */
export function DogCard({ item, onPress }: { item: DiscoverItem; onPress: () => void }) {
  const { dog, owner } = item;

  /** Karar vermeye yardım eden en fazla üç etiket. */
  const traits = [
    labelFor(dogSizeLabels, dog.size),
    labelFor(energyLabels, dog.energy),
    labelFor(sociabilityLabels, dog.sociability),
  ];

  return (
    <View style={styles.dogCard}>
      <ImageHero
        uri={dog.photoUrl}
        height={300}
        onPress={onPress}
        fallbackLabel={dog.name}
        topLeft={
          item.match ? (
            <View style={styles.matchChip}>
              <AppText variant="metric" color={colors.textOnDark}>
                %{item.match.score}
              </AppText>
              <AppText variant="caption" color={colors.textOnDarkMuted}>
                uyum
              </AppText>
            </View>
          ) : null
        }
        topRight={
          dog.vaccinated ? (
            <SubtleBadge
              label="Aşılı (beyan)"
              tone="onDark"
              icon={{ ios: 'checkmark.seal', android: 'verified', web: 'verified' }}
            />
          ) : null
        }
      >
        <AppText variant="display" color={colors.textOnDark} numberOfLines={1}>
          {dog.name}
        </AppText>
        <AppText variant="body" color={colors.textOnDarkMuted} numberOfLines={1}>
          {dog.breed ?? 'Cins belirtilmemiş'} · {dogAgeLabel(dog.age)}
        </AppText>

        <View style={styles.dogMetaRow}>
          <SymbolView
            name={{ ios: 'mappin', android: 'place', web: 'place' }}
            size={13}
            tintColor={colors.textOnDarkMuted}
          />
          <AppText variant="caption" color={colors.textOnDarkMuted} numberOfLines={1}>
            {owner.district ?? 'Semt belirtilmemiş'} · {owner.name}
          </AppText>
        </View>
      </ImageHero>

      <View style={styles.dogFooter}>
        <View style={styles.tagRow}>
          {traits.map((trait) => (
            <Tag key={trait} label={trait} />
          ))}
        </View>

        {/**
         * Açık eylem. Doğrudan mesaj göndermek yerine profili açıyor: mesaj,
         * engelleme ve şikâyet aynı ekranda; akış değişmediği için mevcut
         * güvenlik kontrolleri korunuyor.
         */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${dog.name} ile tanış`}
          onPress={onPress}
          style={({ pressed }) => [styles.meetButton, pressed && { opacity: 0.85 }]}
        >
          <AppText variant="label" color={colors.textOnPrimary}>
            Tanış
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Kulüp etkinlik kartı.
 *
 * Sinematik kapak, tarih/saat, yaklaşık bölge ve kapasite; tek baskın eylem
 * "Yerini ayır". Kapak fotoğrafı sunucudan (`coverPhotoUrl`) gelir; yoksa
 * ImageHero tutarlı bir fallback çizer — uydurma bir görsel kullanılmaz.
 *
 * Kart tıklanabilir bir kabuk DEĞİL: içinde ayrı bir eylem düğmesi var ve iç
 * içe dokunma hedefi web'de geçersiz HTML (<button> içinde <button>) üretip
 * hydration hatası veriyordu. Bunun yerine yalnızca bilgi alanı tıklanabilir.
 */
export function EventCard({
  event,
  onPress,
  compact,
  onJoin,
  joining,
}: {
  event: EventSummary;
  onPress: () => void;
  compact?: boolean;
  onJoin?: () => void;
  joining?: boolean;
}) {
  const date = new Date(event.startsAt);
  const day = date.toLocaleDateString('tr-TR', { day: 'numeric' });
  const month = date.toLocaleDateString('tr-TR', { month: 'short' });

  const statusLabel = event.isOwner
    ? 'Etkinliğiniz'
    : event.hasJoined
      ? 'Yeriniz ayrıldı'
      : event.isFull
        ? 'Kontenjan doldu'
        : null;

  return (
    <View style={styles.eventCard}>
      <ImageHero
        uri={event.coverPhotoUrl}
        height={compact ? 150 : 210}
        onPress={onPress}
        fallbackLabel={labelFor(eventTypeLabels, event.type)}
        fallbackIcon={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
        topLeft={
          <View style={styles.dateChip}>
            <AppText variant="metric" color={colors.textOnDark}>
              {day}
            </AppText>
            <AppText variant="caption" color={colors.textOnDarkMuted}>
              {month}
            </AppText>
          </View>
        }
        topRight={
          statusLabel ? (
            <SubtleBadge
              label={statusLabel}
              tone="onDark"
              icon={
                event.hasJoined || event.isOwner
                  ? { ios: 'checkmark.seal', android: 'verified', web: 'verified' }
                  : undefined
              }
            />
          ) : null
        }
      >
        <AppText variant="title" color={colors.textOnDark} numberOfLines={2}>
          {event.title}
        </AppText>

        <View style={styles.eventMeta}>
          <SymbolView
            name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
            size={13}
            tintColor={colors.textOnDarkMuted}
          />
          <AppText variant="caption" color={colors.textOnDarkMuted}>
            {formatEventDate(event.startsAt)}
          </AppText>
        </View>

        <View style={styles.eventMeta}>
          <SymbolView
            name={{ ios: 'mappin', android: 'place', web: 'place' }}
            size={13}
            tintColor={colors.textOnDarkMuted}
          />
          <AppText variant="caption" color={colors.textOnDarkMuted} numberOfLines={1}>
            {event.district} · {labelFor(eventTypeLabels, event.type)}
          </AppText>
        </View>
      </ImageHero>

      {!compact ? (
        <View style={styles.eventFooter}>
          <View style={{ flex: 1 }}>
            <AppText variant="label" color={colors.primary}>
              {event.participantCount}/{event.capacity} kişi
            </AppText>
            <PatiLine
              progress={event.capacity > 0 ? event.participantCount / event.capacity : 0}
              style={{ marginTop: spacing.sm, maxWidth: 120 }}
            />
          </View>

          {onJoin ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${event.title} etkinliğinde yerini ayır`}
              onPress={onJoin}
              disabled={joining}
              style={({ pressed }) => [styles.joinButton, pressed && { opacity: 0.85 }]}
            >
              <AppText variant="label" color={colors.textOnPrimary}>
                {joining ? 'Ayrılıyor…' : 'Yerini ayır'}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Güvenli Topluluk bildirimi kartı (kayıp hayvan ilanları dahil). */
export function AlertCard({ alert, onPress }: { alert: CommunityAlert; onPress: () => void }) {
  const urgent = urgentAlertTypes.has(alert.type);
  const cover = alert.photos[0];

  return (
    <Card onPress={onPress} style={styles.alertCard}>
      <View style={styles.alertRow}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.alertCover} />
        ) : (
          <View style={[styles.alertCover, styles.alertCoverFallback]}>
            <SymbolView
              name={alertTypeSymbol(alert.type)}
              size={22}
              tintColor={urgent ? colors.danger : colors.primary}
            />
          </View>
        )}

        <View style={styles.alertBody}>
          <View style={styles.alertTagRow}>
            <Tag
              label={labelFor(alertTypeLabels, alert.type)}
              tone={urgent ? 'danger' : 'primary'}
            />
            {alert.status === 'resolved' ? <Tag label="Çözüldü" tone="success" /> : null}
          </View>

          {alert.animalName ? (
            <AppText variant="bodyStrong" numberOfLines={1} style={{ marginTop: spacing.xs }}>
              {alert.animalName}
            </AppText>
          ) : null}

          <AppText
            variant="body"
            color={colors.textMuted}
            numberOfLines={2}
            style={{ marginTop: 2 }}
          >
            {alert.description}
          </AppText>

          <View style={styles.alertMetaRow}>
            <SymbolView
              name={{ ios: 'mappin', android: 'place', web: 'place' }}
              size={12}
              tintColor={colors.textSubtle}
            />
            <AppText variant="caption" color={colors.textSubtle} numberOfLines={1}>
              {alert.district}
              {alert.areaNote ? ` · ${alert.areaNote}` : ''} · {formatRelative(alert.createdAt)}
            </AppText>
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  dogCard: {
    marginBottom: spacing.xl,
  },
  matchChip: {
    backgroundColor: 'rgba(30, 58, 47, 0.86)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'flex-start',
  },
  dogMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.sm,
  },
  dateChip: {
    backgroundColor: 'rgba(18, 20, 16, 0.6)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 52,
  },
  dogFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  meetButton: {
    backgroundColor: colors.copperAction,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  eventCard: {
    marginBottom: spacing.xl,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.xs,
  },
  eventFooter: {
    minHeight: 44,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  joinButton: {
    backgroundColor: colors.copperAction,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertRow: {
    flexDirection: 'row',
  },
  alertCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  alertCover: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  alertCoverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  alertTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  alertMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
});
