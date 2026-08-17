import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../api';
import { colors, radius, spacing } from '../theme';
import { AppText, Banner, Button, ChoiceGroup, Field } from './ui';

/**
 * Şikâyet ve engelleme, ayrı tam ekranlar yerine alt panel olarak uygulandı
 * (MVP belgesi 5. bölüm). Aynı bileşen hem kullanıcı hem etkinlik şikâyetinde
 * kullanılır; engelleme yalnızca kullanıcı hedefinde gösterilir.
 */
interface SafetySheetProps {
  visible: boolean;
  onClose: () => void;
  targetType: 'user' | 'event';
  targetId: string;
  targetName: string;
  /** Engelleme sonrası çağrılır — çağıran ekran genelde geri gider. */
  onBlocked?: () => void;
}

const FALLBACK_REASONS = [
  { value: 'taciz', label: 'Taciz veya rahatsız edici davranış' },
  { value: 'uygunsuz_icerik', label: 'Uygunsuz içerik' },
  { value: 'sahte_profil', label: 'Sahte profil' },
  { value: 'hayvana_kotu_muamele', label: 'Hayvana kötü muamele' },
  { value: 'spam', label: 'Spam veya reklam' },
  { value: 'diger', label: 'Diğer' },
];

type Mode = 'menu' | 'report' | 'block';

export function SafetySheet({
  visible,
  onClose,
  targetType,
  targetId,
  targetName,
  onBlocked,
}: SafetySheetProps) {
  const [mode, setMode] = useState<Mode>('menu');
  const [reasons, setReasons] = useState(FALLBACK_REASONS);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Panel her açılışta temiz başlar.
  useEffect(() => {
    if (visible) {
      setMode('menu');
      setReason(null);
      setDetails('');
      setError(null);
      setSuccess(null);
    }
  }, [visible]);

  useEffect(() => {
    api
      .reportReasons()
      .then((res) => setReasons(res.reasons))
      .catch(() => {
        // Sunucuya ulaşılamazsa yerel liste ile devam ediyoruz.
      });
  }, []);

  async function submitReport() {
    if (!reason) {
      setError('Lütfen bir şikâyet nedeni seçin.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.report({
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
      });
      setSuccess(res.message);
      setTimeout(onClose, 1600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Şikâyet gönderilemedi.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitBlock() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.block(targetId);
      setSuccess(res.message);
      setTimeout(() => {
        onClose();
        onBlocked?.();
      }, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kullanıcı engellenemedi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.handle} />

        {success ? (
          <Banner tone="success" message={success} />
        ) : (
          <>
            {error ? <Banner tone="error" message={error} /> : null}

            {mode === 'menu' ? (
              <>
                <AppText variant="title">
                  {targetType === 'user' ? targetName : 'Etkinlik'}
                </AppText>
                <AppText
                  variant="body"
                  color={colors.textMuted}
                  style={{ marginTop: spacing.xs, marginBottom: spacing.xl }}
                >
                  Topluluk kurallarına aykırı bir durum mu var?
                </AppText>

                <Button
                  label="Şikâyet et"
                  variant="secondary"
                  onPress={() => setMode('report')}
                  style={{ marginBottom: spacing.md }}
                />

                {targetType === 'user' ? (
                  <Button
                    label="Kullanıcıyı engelle"
                    variant="danger"
                    onPress={() => setMode('block')}
                    style={{ marginBottom: spacing.md }}
                  />
                ) : null}

                <Button label="Vazgeç" variant="ghost" onPress={onClose} />
              </>
            ) : null}

            {mode === 'report' ? (
              <>
                <AppText variant="title">Şikâyet et</AppText>
                <AppText
                  variant="body"
                  color={colors.textMuted}
                  style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}
                >
                  Şikâyetiniz gizli tutulur, karşı tarafa bildirilmez.
                </AppText>

                <ChoiceGroup
                  label="Şikâyet nedeni"
                  required
                  columns
                  options={reasons}
                  value={reason}
                  onChange={setReason}
                />

                <Field
                  label="Açıklama"
                  value={details}
                  onChangeText={setDetails}
                  placeholder="Kısaca ne olduğunu anlatın (isteğe bağlı)"
                  multiline
                  maxLength={600}
                />

                <Button label="Şikâyeti gönder" onPress={submitReport} loading={submitting} />
                <Button
                  label="Geri"
                  variant="ghost"
                  onPress={() => setMode('menu')}
                  style={{ marginTop: spacing.sm }}
                />
              </>
            ) : null}

            {mode === 'block' ? (
              <>
                <AppText variant="title">{targetName} engellensin mi?</AppText>
                <AppText
                  variant="body"
                  color={colors.textMuted}
                  style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}
                >
                  Engellediğinizde birbirinize mesaj gönderemez ve profillerinizi göremezsiniz.
                  Bu işlemi ayarlardan geri alabilirsiniz.
                </AppText>

                <Button label="Engelle" variant="danger" onPress={submitBlock} loading={submitting} />
                <Button
                  label="Vazgeç"
                  variant="ghost"
                  onPress={() => setMode('menu')}
                  style={{ marginTop: spacing.sm }}
                />
              </>
            ) : null}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(42, 36, 48, 0.45)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl + spacing.lg,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
});
