import React, { useState } from 'react';
import { View } from 'react-native';
import { api, ApiError } from '../../src/api';
import {
  AppText,
  Avatar,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '../../src/components/ui';
import { colors, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

/** Engellenen kullanıcılar — engeli kaldırma buradan yapılır. */
export default function BlockedUsersScreen() {
  const loader = useLoader(() => api.blockedUsers());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function unblock(userId: string) {
    setBusyId(userId);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.unblock(userId);
      setSuccess(res.message);
      loader.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Engel kaldırılamadı.');
    } finally {
      setBusyId(null);
    }
  }

  if (loader.loading) return <LoadingState />;
  if (loader.error) return <ErrorState message={loader.error} onRetry={loader.reload} />;

  return (
    <Screen>
      <View style={{ paddingTop: spacing.lg }}>
        {error ? <Banner tone="error" message={error} /> : null}
        {success ? <Banner tone="success" message={success} /> : null}

        {loader.data && loader.data.blocked.length > 0 ? (
          <>
            <AppText variant="body" color={colors.textMuted} style={{ marginBottom: spacing.lg }}>
              Engellediğin kullanıcılar sana mesaj gönderemez ve profilini göremez.
            </AppText>

            {loader.data.blocked.map((user) => (
              <Card key={user.id} style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Avatar name={user.name} size={44} />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <AppText variant="bodyStrong">{user.name}</AppText>
                    <AppText variant="caption" color={colors.textMuted}>
                      {user.district ?? 'Semt belirtilmemiş'}
                    </AppText>
                  </View>
                </View>

                <Button
                  label="Engeli kaldır"
                  variant="secondary"
                  onPress={() => unblock(user.id)}
                  loading={busyId === user.id}
                  style={{ marginTop: spacing.md }}
                />
              </Card>
            ))}
          </>
        ) : (
          <EmptyState
            emoji="🛡️"
            title="Engellenen kullanıcı yok"
            description="Rahatsız edici bir kullanıcıyla karşılaşırsan profilinden veya sohbetten engelleyebilirsin."
          />
        )}
      </View>
    </Screen>
  );
}
