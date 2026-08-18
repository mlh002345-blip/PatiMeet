import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { CommunityAlert, DiscoverItem, EventSummary } from '../api';
import {
  alertTypeEmoji,
  alertTypeLabels,
  dogAgeLabel,
  dogSizeLabels,
  energyLabels,
  eventTypeEmoji,
  eventTypeLabels,
  formatEventDate,
  formatRelative,
  labelFor,
  sociabilityLabels,
  urgentAlertTypes,
} from '../labels';
import { colors, radius, spacing } from '../theme';
import { AppText, Avatar, Card, Tag } from './ui';
import { MatchBadge } from './MatchScore';

/** Keşfet listesindeki köpek kartı. Köpek görsel olarak ön planda. */
export function DogCard({ item, onPress }: { item: DiscoverItem; onPress: () => void }) {
  const { dog, owner } = item;

  return (
    <Card onPress={onPress} style={styles.dogCard}>
      <View style={styles.row}>
        {dog.photoUrl ? (
          <Image source={{ uri: dog.photoUrl }} style={styles.dogPhoto} />
        ) : (
          <Avatar name={dog.name} size={58} />
        )}

        <View style={styles.rowBody}>
          <AppText variant="heading" numberOfLines={1}>
            {dog.name}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
            {dog.breed ?? 'Cins belirtilmemiş'} · {dogAgeLabel(dog.age)}
          </AppText>
          <AppText variant="caption" color={colors.textSubtle} numberOfLines={1}>
            {owner.name} · {owner.district ?? 'Semt belirtilmemiş'}
          </AppText>
        </View>
      </View>

      <View style={styles.tagRow}>
        {item.match ? <MatchBadge match={item.match} /> : null}
        <Tag label={labelFor(dogSizeLabels, dog.size)} tone="primary" />
        <Tag label={labelFor(energyLabels, dog.energy)} tone="accent" />
        <Tag label={labelFor(sociabilityLabels, dog.sociability)} />
        {dog.vaccinated ? <Tag label="Aşılı (beyan)" tone="success" /> : null}
      </View>

      {dog.bio ? (
        <AppText
          variant="body"
          color={colors.textMuted}
          numberOfLines={2}
          style={{ marginTop: spacing.sm }}
        >
          {dog.bio}
        </AppText>
      ) : null}
    </Card>
  );
}

/** Etkinlik listesi kartı. */
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
  const [imageFailed, setImageFailed] = useState(false);

  const eventImage = event.type === 'yuruyus'
    ? 'https://images.unsplash.com/photo-1558788353-f76d92427f16?w=600&auto=format&fit=crop'
    : event.type === 'egitim'
      ? 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&auto=format&fit=crop'
      : 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&auto=format&fit=crop';
  const date = new Date(event.startsAt);
  const day = date.toLocaleDateString('tr-TR', { day: 'numeric' });
  const month = date.toLocaleDateString('tr-TR', { month: 'short' });

  /**
   * Kart tıklanabilir bir kabuk DEĞİL: içinde "Katıl" düğmesi var ve iç içe
   * dokunma hedefi web'de geçersiz HTML (<button> içinde <button>) üretip
   * hydration hatası veriyordu. Bunun yerine yalnızca bilgi alanı tıklanabilir;
   * "Katıl" kardeş öğe olarak duruyor. Böylece tek dokunuşun hem katılma hem
   * detaya gitme tetikleme riski de ortadan kalkıyor.
   */
  return (
    <Card style={styles.eventCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${event.title} etkinliğinin ayrıntıları`}
        onPress={onPress}
        style={({ pressed }) => [styles.eventContent, pressed && { opacity: 0.9 }]}
      >
        {imageFailed ? (
          // Uzak görsel yüklenemezse boş boşluk bırakmıyoruz.
          <View style={[styles.eventPhoto, styles.eventPhotoFallback]}>
            <AppText variant="title">{eventTypeEmoji[event.type] ?? '🐾'}</AppText>
          </View>
        ) : (
          <Image
            source={{ uri: eventImage }}
            style={styles.eventPhoto}
            onError={() => setImageFailed(true)}
          />
        )}
        <View style={styles.dateBlock}>
          <AppText variant="title">{day}</AppText>
          <AppText variant="caption" color={colors.textMuted}>{month}</AppText>
        </View>

        <View style={styles.rowBody}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {event.title}
          </AppText>
          <AppText variant="caption" color={colors.primary} style={{ marginTop: 2 }}>
            {formatEventDate(event.startsAt)}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
            {event.district} · {labelFor(eventTypeLabels, event.type)}
          </AppText>
          <View style={styles.eventMeta}>
            <SymbolView name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} size={14} tintColor={colors.textMuted} />
            <AppText variant="caption" color={colors.textMuted}>{formatEventDate(event.startsAt).split('·').pop()?.trim()}</AppText>
            <SymbolView name={{ ios: 'person.2', android: 'group', web: 'group' }} size={14} tintColor={colors.textMuted} />
            <AppText variant="caption" color={colors.textMuted}>{event.participantCount}/{event.capacity}</AppText>
          </View>
        </View>
      </Pressable>

      {!compact ? (
        <View style={styles.eventFooter}>
          <View style={styles.tagRowCompact}>
            {event.isOwner ? <Tag label="Etkinliğiniz" tone="accent" /> : null}
            {event.hasJoined && !event.isOwner ? <Tag label="Katıldınız" tone="success" /> : null}
            {event.isFull ? <Tag label="Dolu" tone="danger" /> : null}
          </View>
          {onJoin ? (
            <Pressable
              accessibilityRole="button"
              onPress={onJoin}
              disabled={joining}
              style={({ pressed }) => [styles.joinButton, pressed && { opacity: 0.82 }]}
            >
              <AppText variant="label" color={colors.textOnPrimary}>{joining ? 'Katılıyor…' : 'Katıl'}</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** Güvenli Topluluk bildirimi kartı (kayıp hayvan ilanları dahil). */
export function AlertCard({ alert, onPress }: { alert: CommunityAlert; onPress: () => void }) {
  const urgent = urgentAlertTypes.has(alert.type);
  const cover = alert.photos[0];

  return (
    <Card onPress={onPress} style={styles.alertCard}>
      <View style={styles.row}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.alertCover} />
        ) : (
          <View style={[styles.alertCover, styles.alertCoverFallback]}>
            <AppText variant="title">{alertTypeEmoji[alert.type] ?? '📣'}</AppText>
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

          <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>
            📍 {alert.district}
            {alert.areaNote ? ` · ${alert.areaNote}` : ''} · {formatRelative(alert.createdAt)}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

/** Ana sayfada hızlı aksiyon kartı. */
export function ActionCard({
  emoji,
  title,
  description,
  onPress,
}: {
  emoji: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md }}>
      <View style={styles.row}>
        <View style={styles.actionIcon}>
          <AppText variant="title">{emoji}</AppText>
        </View>
        <View style={styles.rowBody}>
          <AppText variant="bodyStrong">{title}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {description}
          </AppText>
        </View>
        <AppText variant="heading" color={colors.textSubtle}>
          ›
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  dogCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  dogPhoto: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.surfaceMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  eventCard: {
    marginBottom: spacing.md,
    padding: 0,
    overflow: 'hidden',
  },
  eventContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  eventPhoto: {
    width: 76,
    height: 82,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  eventPhotoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBlock: {
    width: 42,
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.xs,
  },
  eventFooter: {
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagRowCompact: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  joinButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
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
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
