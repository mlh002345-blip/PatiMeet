import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '../../src/api';
import {
  AppText,
  AppHeader,
  Avatar,
  EmptyState,
  ErrorState,
  LoadingState,
  ScrollScreen,
} from '../../src/components/ui';
import { formatRelative } from '../../src/labels';
import { colors, radius, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

/** Mesaj listesi (12/14) — okunmamış göstergesi ile. */
export default function MessagesScreen() {
  const router = useRouter();
  const loader = useLoader(() => api.conversations());

  return (
    <ScrollScreen refreshing={loader.refreshing} onRefresh={loader.refresh}>
      <AppHeader onNotifications={() => router.push('/settings/notifications')} />
      <AppText variant="kicker" color={colors.copper}>ÖZEL SOHBETLER</AppText>
      <AppText variant="editorial" style={{ marginTop: spacing.xs }}>Mesajlar</AppText>
      {loader.data && loader.data.totalUnread > 0 ? (
        <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
          {loader.data.totalUnread} okunmamış mesajın var.
        </AppText>
      ) : (
        <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
          Yeni dostlukların ve yürüyüş planlarının özel alanı.
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
              <View style={styles.avatarFrame}>
                <Avatar name={conversation.user.name} size={52} />
                {conversation.unreadCount > 0 ? <View style={styles.onlineDot} /> : null}
              </View>

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
            icon={{ ios: 'message', android: 'chat_bubble', web: 'chat_bubble' }}
            title="Henüz mesajın yok"
            description="Keşfet sekmesinden bir köpek sahibine mesaj göndererek başlayabilirsin."
            actionLabel="Keşfet'e git"
            onAction={() => router.push('/(tabs)/discover')}
          />
        )}
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
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
  avatarFrame: {
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.copper,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
