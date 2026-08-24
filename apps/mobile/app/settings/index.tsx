import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, API_URL } from '../../src/api';
import {
  AppText,
  Avatar,
  Banner,
  Button,
  Card,
  DetailHeader,
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

/**
 * Profil ve ayarlar.
 *
 * Pati sekmesi köpeğin kişisel merkezi olduğu için kullanıcı profili, köpek
 * yönetimi, bildirim tercihleri ve diğer ayarlar buraya taşındı — sağ üstteki
 * profil/ayar düğmesinden erişilir (bkz. app/(tabs)/profile.tsx).
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dogs = user?.dogs ?? [];

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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
    >
      <DetailHeader label="Profil ve ayarlar" onBack={() => router.back()} />
      {error ? <Banner tone="error" message={error} /> : null}

      {/* Kullanıcı kartı */}
      <Card style={styles.memberCard}>
        <View style={styles.memberTopline}>
          <AppText variant="kicker" color={colors.copperPale}>PATIMEET PRIVÉ</AppText>
          <Tag label="AKTİF ÜYE" tone="success" />
        </View>
        <View style={styles.headerRow}>
          {user?.photoUrl ? (
            <Image source={{ uri: user.photoUrl }} style={styles.photo} />
          ) : (
            <Avatar name={user?.name ?? '?'} size={72} />
          )}

          <View style={{ flex: 1, marginLeft: spacing.lg }}>
            <AppText variant="title" color={colors.textOnDark}>{user?.name}</AppText>
            <AppText variant="caption" color={colors.textOnDarkMuted}>
              {user?.district ?? 'Semt seçilmemiş'}
            </AppText>
            {user && user.purposes.length > 0 ? (
              <View style={styles.purposeRow}>
                {user.purposes.map((purpose) => (
                  <Tag key={purpose} label={labelFor(purposeLabels, purpose)} tone="primary" />
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {user?.bio ? (
          <AppText variant="body" color={colors.textOnDarkMuted} style={{ marginTop: spacing.lg }}>
            {user.bio}
          </AppText>
        ) : null}

        <Button
          label="Profili düzenle"
          variant="primary"
          onPress={() => router.push('/settings/edit-profile')}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      {/* Köpek kartları — çoklu köpek desteklenir */}
      <AppText variant="kicker" color={colors.copper} style={{ marginTop: spacing.xl }}>DOSTLARIN</AppText>
      {dogs.map((dog) => (
        <Card key={dog.id} style={{ marginTop: spacing.md }}>
          <View style={styles.headerRow}>
            {dog.photoUrl ? (
              <Image source={{ uri: dog.photoUrl }} style={styles.photo} />
            ) : (
              <Avatar name={dog.name} size={72} />
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
            onPress={() => router.push(`/settings/edit-dog?dogId=${dog.id}`)}
            style={{ marginTop: spacing.lg }}
          />
        </Card>
      ))}

      <Button
        label={dogs.length > 1 ? 'Köpeklerimi yönet' : '+ Köpek ekle'}
        variant="secondary"
        onPress={() => router.push(dogs.length > 1 ? '/settings/dogs' : '/settings/add-dog')}
        style={{ marginTop: spacing.md }}
      />

      {/* Tercihler */}
      <AppText variant="kicker" color={colors.copper} style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
        KİŞİSELLEŞTİR
      </AppText>
      <AppText variant="heading" style={{ marginBottom: spacing.md }}>
        Tercihler
      </AppText>
      <View style={styles.group}>
        <SettingsRow label="Köpeğimin Günlüğü" onPress={() => router.push('/journal')} />
        <SettingsRow label="Mahalle" onPress={() => router.push('/(tabs)/neighbourhood')} />
        <SettingsRow label="Bildirimler" onPress={() => router.push('/settings/notifications')} last />
      </View>

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
          {user?.appleLinked ? <Tag label="Apple ile bağlı" tone="primary" /> : null}
          {user?.hasPassword ? <Tag label="E-posta ve şifre" tone="neutral" /> : null}
        </View>

        {user?.passwordLoginDisabled ? (
          <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>
            Hesabın {user?.appleLinked ? 'Apple' : 'Google'} ile bağlandığı için şifre ile giriş
            kapatıldı.
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
    </ScrollView>
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
  screen: { flex: 1, backgroundColor: colors.background },
  memberCard: {
    backgroundColor: colors.obsidian,
    borderColor: colors.copper,
  },
  memberTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  purposeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
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
