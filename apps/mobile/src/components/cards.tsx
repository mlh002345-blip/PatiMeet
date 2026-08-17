import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { DiscoverItem, EventSummary } from '../api';
import {
  dogAgeLabel,
  dogSizeLabels,
  energyLabels,
  eventTypeEmoji,
  eventTypeLabels,
  formatEventDate,
  labelFor,
  sociabilityLabels,
} from '../labels';
import { colors, spacing } from '../theme';
import { AppText, Avatar, Card, Tag } from './ui';

/** Keşfet listesindeki köpek kartı. Köpek görsel olarak ön planda. */
export function DogCard({ item, onPress }: { item: DiscoverItem; onPress: () => void }) {
  const { dog, owner } = item;

  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md }}>
      <View style={styles.row}>
        <Avatar name={dog.name} size={64} emoji="🐕" />

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
          style={{ marginTop: spacing.md }}
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
}: {
  event: EventSummary;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md }}>
      <View style={styles.row}>
        <View style={styles.eventIcon}>
          <AppText variant="title">{eventTypeEmoji[event.type] ?? '🐾'}</AppText>
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
        </View>
      </View>

      {!compact ? (
        <View style={styles.tagRow}>
          <Tag
            label={
              event.isFull ? 'Kontenjan doldu' : `${event.spotsLeft} kişilik yer var`
            }
            tone={event.isFull ? 'danger' : 'success'}
          />
          <Tag label={labelFor(dogSizeLabels, event.dogSize)} tone="primary" />
          {event.isOwner ? <Tag label="Etkinliğiniz" tone="accent" /> : null}
          {event.hasJoined && !event.isOwner ? <Tag label="Katıldınız" tone="success" /> : null}
        </View>
      ) : null}
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
    marginTop: spacing.md,
  },
  eventIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
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
