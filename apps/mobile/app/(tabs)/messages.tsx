import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import {
  AppText,
  Avatar,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../src/components/ui';
import { formatRelative } from '../../src/labels';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

/** Mesaj listesi (12/14) — okunmamış göstergesi ile. */
export default function MessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const loader = useLoader(() => api.conversations());

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingHorizontal: spacing.lg,
        paddingTop: insets.top + spacing.lg,
        paddingBottom: spacing.xxl,
      }}
      refreshControl={
        <RefreshControl
          refreshing={loader.refreshing}
          onRefresh={loader.refresh}
          tintColor={colors.primary}
        />
      }
    >
      <AppText variant="display">Mesajlar</AppText>
      {loader.data && loader.data.totalUnread > 0 ? (
        <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
          {loader.data.totalUnread} okunmamış mesajın var.
        </AppText>
      ) : (
        <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
          Buluşma planlamak için sohbet et.
        </AppText>
      )}

      <View style={{ marginTop: spacing.xl }}>
        {loader.loading ? (
          <LoadingState label="Konuşmalar yükleniyor…" />
        ) : loader.error ? (
          <ErrorState message={loader.error} onRetry={loader.reload} />
        ) : loader.data && loader.data.conversations.length > 0 ? (
          loader.data.conversations.map((conversation) => (
            <Pressable
              key={conversation.id}
              accessibilityRole="button"
              onPress={() => router.push(`/chat/${conversation.id}`)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <Avatar name={conversation.user.name} size={52} />

              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                    {conversation.user.name}
                  </AppText>
                  {conversation.lastMessage ? (
                    <AppText variant="caption" color={colors.textSubtle}>
                      {formatRelative(conversation.lastMessage.createdAt)}
                    </AppText>
                  ) : null}
                </View>

                <AppText
                  variant="body"
                  color={conversation.unreadCount > 0 ? colors.text : colors.textMuted}
                  numberOfLines={1}
                  style={{ marginTop: 2 }}
                >
                  {conversation.lastMessage
                    ? `${conversation.lastMessage.isMine ? 'Sen: ' : ''}${conversation.lastMessage.body}`
                    : 'Henüz mesaj yok'}
                </AppText>
              </View>

              {conversation.unreadCount > 0 ? (
                <View style={styles.badge}>
                  <AppText variant="caption" color={colors.textOnPrimary}>
                    {conversation.unreadCount}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          ))
        ) : (
          <EmptyState
            emoji="💬"
            title="Henüz mesajın yok"
            description="Keşfet sekmesinden bir köpek sahibine mesaj göndererek başlayabilirsin."
            actionLabel="Keşfet'e git"
            onAction={() => router.push('/(tabs)/discover')}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: spacing.sm,
  },
});
