import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError, type ChatMessage } from '../../src/api';
import { SafetySheet } from '../../src/components/SafetySheet';
import {
  AppText,
  Avatar,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../src/components/ui';
import { formatTime } from '../../src/labels';
import { colors, radius, spacing, typography } from '../../src/theme';

/** Sohbet (13/14) — bire bir metin mesajlaşma. */
export default function ChatScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [other, setOther] = useState<{ id: string; name: string } | null>(null);
  const [canSend, setCanSend] = useState(true);
  const [draft, setDraft] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  async function load(): Promise<void> {
    try {
      const res = await api.messages(id);
      setMessages(res.messages);
      setOther({ id: res.conversation.user.id, name: res.conversation.user.name });
      setCanSend(res.canSend);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : 'Mesajlar yüklenemedi. Tekrar deneyin.'
      );
    }
  }

  useEffect(() => {
    void load();
    // MVP'de canlı bağlantı (websocket) yok; yeni mesajlar için hafif yoklama.
    const timer = setInterval(() => void load(), 6000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Başlıkta karşı tarafın adı ve güvenlik menüsü gösterilir.
  useEffect(() => {
    navigation.setOptions({
      title: other?.name ?? 'Sohbet',
      headerRight: () =>
        other ? (
          <Pressable onPress={() => setSheetOpen(true)} hitSlop={10} accessibilityRole="button">
            <AppText variant="heading" color={colors.textMuted}>
              ⋯
            </AppText>
          </Pressable>
        ) : null,
    });
  }, [navigation, other]);

  async function send() {
    const body = draft.trim();
    if (!body) return;

    setSendError(null);
    setSending(true);
    try {
      const res = await api.sendMessage(id, body);
      setMessages((current) => [...(current ?? []), res.message]);
      setDraft('');
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (error) {
      setSendError(
        error instanceof ApiError ? error.message : 'Mesaj gönderilemedi. Tekrar deneyin.'
      );
    } finally {
      setSending(false);
    }
  }

  if (loadError && messages === null) {
    return <ErrorState message={loadError} onRetry={() => void load()} />;
  }
  if (messages === null) return <LoadingState label="Mesajlar yükleniyor…" />;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {/* Profil kısayolu */}
        {other ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/user/${other.id}`)}
            style={({ pressed }) => [styles.profileLink, pressed && { opacity: 0.85 }]}
          >
            <Avatar name={other.name} size={40} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <AppText variant="bodyStrong">{other.name}</AppText>
              <AppText variant="caption" color={colors.textMuted}>
                Profili görüntüle
              </AppText>
            </View>
            <AppText variant="body" color={colors.textSubtle}>
              ›
            </AppText>
          </Pressable>
        ) : null}

        {sendError ? <Banner tone="error" message={sendError} /> : null}
        {!canSend ? (
          <Banner
            tone="warning"
            message="Bu kullanıcıyla mesajlaşma kapalı. Engellemeyi ayarlardan kaldırabilirsiniz."
          />
        ) : null}

        {messages.length === 0 ? (
          <EmptyState
            emoji="👋"
            title="Sohbeti başlat"
            description="Kendini tanıt ve köpeklerinizi tanıştırmak için bir buluşma öner."
          />
        ) : (
          messages.map((message) => (
            <View
              key={message.id}
              style={[styles.bubbleRow, message.isMine ? styles.mineRow : styles.theirsRow]}
            >
              <View style={[styles.bubble, message.isMine ? styles.mine : styles.theirs]}>
                <AppText
                  variant="body"
                  color={message.isMine ? colors.textOnPrimary : colors.text}
                >
                  {message.body}
                </AppText>
                <AppText
                  variant="caption"
                  color={message.isMine ? colors.textOnPrimaryMuted : colors.textSubtle}
                  style={{ marginTop: 2, alignSelf: 'flex-end' }}
                >
                  {formatTime(message.createdAt)}
                </AppText>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Gönderme alanı */}
      <View style={styles.composer}>
        {canSend ? (
          <>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Mesaj yaz…"
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
              multiline
              maxLength={1000}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gönder"
              onPress={send}
              disabled={sending || !draft.trim()}
              style={({ pressed }) => [
                styles.sendButton,
                (sending || !draft.trim()) && { opacity: 0.4 },
                pressed && { opacity: 0.8 },
              ]}
            >
              <AppText variant="bodyStrong" color={colors.textOnPrimary}>
                ➤
              </AppText>
            </Pressable>
          </>
        ) : (
          <Button
            label="Engeli kaldırmak için ayarlara git"
            variant="secondary"
            onPress={() => router.push('/settings/blocked')}
          />
        )}
      </View>

      {other ? (
        <SafetySheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          targetType="user"
          targetId={other.id}
          targetName={other.name}
          onBlocked={() => router.back()}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  mineRow: {
    justifyContent: 'flex-end',
  },
  theirsRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  mine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: radius.sm,
  },
  theirs: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    maxHeight: 120,
    minHeight: 48,
    ...typography.body,
    color: colors.text,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
