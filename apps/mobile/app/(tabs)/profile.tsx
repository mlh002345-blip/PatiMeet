import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { api, ApiError, API_URL } from '../../src/api';
import {
  AppText,
  Avatar,
  Banner,
  Button,
  Card,
  ScrollScreen,
  Tag,
} from '../../src/components/ui';
import {
  dogAgeLabel,
  dogSizeLabels,
  energyLabels,
  labelFor,
  purposeLabels,
  sociabilityLabels,
} from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, radius, spacing } from '../../src/theme';

/** Profil ve ayarlar (14/14). */
export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dog = user?.dogs?.[0];

  function confirmSignOut() {
    Alert.alert('Oturumu kapat', 'Çıkmak istediğinden emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Çıkış yap',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/sign-in');
        },
      },
    ]);
  }

  /** KVKK gereği hesap silme uygulama içinden yapılabilir olmalı. */
  function confirmDelete() {
    Alert.alert(
      'Hesabını sil',
      'Hesabın kapatılacak, köpek profilin ve etkinliklerin diğer kullanıcılara gösterilmeyecek. Bu işlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Hesabımı sil',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await api.deleteAccount();
              await signOut();
              router.replace('/(auth)/sign-in');
            } catch (err) {
              setError(
                err instanceof ApiError ? err.message : 'Hesap silinemedi. Tekrar deneyin.'
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollScreen>
      {error ? <Banner tone="error" message={error} /> : null}

      {/* Kullanıcı kartı */}
      <Card>
        <View style={styles.headerRow}>
          {user?.photoUrl ? (
            <Image source={{ uri: user.photoUrl }} style={styles.photo} />
          ) : (
            <Avatar name={user?.name ?? '?'} size={72} />
          )}

          <View style={{ flex: 1, marginLeft: spacing.lg }}>
            <AppText variant="title">{user?.name}</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {user?.district ?? 'Semt seçilmemiş'}
            </AppText>
            {user?.purpose ? (
              <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
                <Tag label={labelFor(purposeLabels, user.purpose)} tone="primary" />
              </View>
            ) : null}
          </View>
        </View>

        {user?.bio ? (
          <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.lg }}>
            {user.bio}
          </AppText>
        ) : null}

        <Button
          label="Profili düzenle"
          variant="secondary"
          onPress={() => router.push('/settings/edit-profile')}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      {/* Köpek kartı */}
      {dog ? (
        <Card style={{ marginTop: spacing.md }}>
          <View style={styles.headerRow}>
            {dog.photoUrl ? (
              <Image source={{ uri: dog.photoUrl }} style={styles.photo} />
            ) : (
              <Avatar name={dog.name} size={72} emoji="🐕" />
            )}

            <View style={{ flex: 1, marginLeft: spacing.lg }}>
              <AppText variant="title">{dog.name}</AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {dog.breed ?? 'Cins belirtilmemiş'} · {dogAgeLabel(dog.age)}
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
            <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.md }}>
              {dog.bio}
            </AppText>
          ) : null}

          <Button
            label="Köpek profilini düzenle"
            variant="secondary"
            onPress={() => router.push('/settings/edit-dog')}
            style={{ marginTop: spacing.lg }}
          />
        </Card>
      ) : null}

      {/* Güvenlik */}
      <AppText variant="heading" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
        Güvenlik
      </AppText>
      <View style={styles.group}>
        <SettingsRow
          label="Engellenen kullanıcılar"
          onPress={() => router.push('/settings/blocked')}
        />
        <SettingsRow
          label="Topluluk kuralları"
          onPress={() => router.push('/legal/community')}
        />
        <SettingsRow
          label="İlk buluşma güvenlik önerileri"
          onPress={() => router.push('/legal/safety')}
          last
        />
      </View>

      {/* Yasal */}
      <AppText variant="heading" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
        Yasal
      </AppText>
      <View style={styles.group}>
        <SettingsRow label="Kullanıcı Sözleşmesi" onPress={() => router.push('/legal/terms')} />
        <SettingsRow
          label="KVKK Aydınlatma Metni ve Gizlilik"
          onPress={() => router.push('/legal/privacy')}
          last
        />
      </View>

      {/* Hesap */}
      <AppText variant="heading" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
        Hesap
      </AppText>
      <Card>
        <AppText variant="caption" color={colors.textMuted}>
          E-posta
        </AppText>
        <AppText variant="body">{user?.email}</AppText>

        <AppText variant="caption" color={colors.textMuted} style={{ marginTop: spacing.md }}>
          Giriş yöntemi
        </AppText>
        <View style={styles.methodRow}>
          {user?.googleLinked ? <Tag label="Google ile bağlı" tone="primary" /> : null}
          {user?.hasPassword ? <Tag label="E-posta ve şifre" tone="neutral" /> : null}
        </View>

        {user?.passwordLoginDisabled ? (
          <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>
            Hesabın Google ile bağlandığı için şifre ile giriş kapatıldı.
          </AppText>
        ) : null}

        <Button
          label="Oturumu kapat"
          variant="secondary"
          onPress={confirmSignOut}
          style={{ marginTop: spacing.lg }}
        />
        <Button
          label="Hesabımı sil"
          variant="danger"
          onPress={confirmDelete}
          loading={busy}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <AppText
        variant="caption"
        color={colors.textSubtle}
        center
        style={{ marginTop: spacing.xl }}
      >
        PatiMeet MVP · {API_URL}
      </AppText>
    </ScrollScreen>
  );
}

function SettingsRow({
  label,
  onPress,
  last,
}: {
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingsRow,
        !last && styles.settingsRowBorder,
        pressed && { opacity: 0.7 },
      ]}
    >
      <AppText variant="body">{label}</AppText>
      <AppText variant="body" color={colors.textSubtle}>
        ›
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  settingsRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
