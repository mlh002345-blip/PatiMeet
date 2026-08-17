import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { colors, radius, shadow, spacing, typography } from '../theme';

// ---------------------------------------------------------------------------
// Metin
// ---------------------------------------------------------------------------

type TextVariant = keyof typeof typography;

interface AppTextProps {
  children: React.ReactNode;
  variant?: TextVariant;
  color?: string;
  center?: boolean;
  numberOfLines?: number;
  onPress?: () => void;
  style?: StyleProp<TextStyle>;
}

export function AppText({
  children,
  variant = 'body',
  color = colors.text,
  center,
  numberOfLines,
  onPress,
  style,
}: AppTextProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      onPress={onPress}
      accessibilityRole={onPress ? 'link' : undefined}
      style={[typography[variant], { color }, center && { textAlign: 'center' }, style]}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Buton
// ---------------------------------------------------------------------------

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  fullWidth = true,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const palette = {
    primary: { bg: colors.primary, fg: colors.textOnPrimary, border: 'transparent' },
    secondary: { bg: colors.surface, fg: colors.primary, border: colors.primary },
    ghost: { bg: 'transparent', fg: colors.textMuted, border: 'transparent' },
    danger: { bg: colors.dangerLight, fg: colors.danger, border: 'transparent' },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'secondary' ? 1.5 : 0,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        fullWidth && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[typography.bodyStrong, { color: palette.fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Sekme ekranlarında marka ve bildirim erişimini tutarlı gösterir. */
export function AppHeader({ onNotifications }: { onNotifications?: () => void }) {
  return (
    <View style={styles.appHeader}>
      <AppText variant="title" color={colors.primary}>PatiMeet</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Bildirimler"
        hitSlop={10}
        onPress={onNotifications}
        style={({ pressed }) => [styles.headerIcon, pressed && { opacity: 0.7 }]}
      >
        <SymbolView
          name={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
          size={22}
          tintColor={colors.text}
        />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Kart
// ---------------------------------------------------------------------------

export function Card({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

// ---------------------------------------------------------------------------
// Form alanları
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  maxLength?: number;
  required?: boolean;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  multiline,
  keyboardType = 'default',
  secureTextEntry,
  autoCapitalize = 'sentences',
  maxLength,
  required,
}: FieldProps) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View style={styles.fieldLabelRow}>
        <AppText variant="label" color={colors.textMuted}>
          {label}
        </AppText>
        {required ? (
          <AppText variant="caption" color={colors.accent}>
            {' '}
            zorunlu
          </AppText>
        ) : null}
      </View>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={!secureTextEntry}
        maxLength={maxLength}
        style={[
          styles.input,
          multiline && { height: 100, textAlignVertical: 'top', paddingTop: spacing.md },
          Boolean(error) && { borderColor: colors.danger },
        ]}
      />

      {error ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/** Tek seçimli seçenek grubu — az adımlı formlar için dropdown yerine kullanılır. */
export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  required,
  columns,
}: {
  label?: string;
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
  required?: boolean;
  columns?: boolean;
}) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? (
        <View style={styles.fieldLabelRow}>
          <AppText variant="label" color={colors.textMuted}>
            {label}
          </AppText>
          {required ? (
            <AppText variant="caption" color={colors.accent}>
              {' '}
              zorunlu
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.choiceRow, columns && { flexDirection: 'column' }]}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.chip,
                selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                pressed && { opacity: 0.85 },
                columns && { alignSelf: 'stretch' },
              ]}
            >
              <Text
                style={[
                  typography.label,
                  { color: selected ? colors.textOnPrimary : colors.textMuted },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

/** Basit onay kutusu — sözleşme onayları ve aşı beyanı için. */
export function Checkbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={styles.checkboxRow}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Etiketler ve avatar
// ---------------------------------------------------------------------------

export function Tag({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger';
}) {
  const palette = {
    neutral: { bg: colors.surfaceMuted, fg: colors.textMuted },
    primary: { bg: colors.primaryLight, fg: colors.primary },
    accent: { bg: colors.accentLight, fg: colors.accent },
    success: { bg: colors.successLight, fg: colors.success },
    warning: { bg: colors.warningLight, fg: colors.warning },
    danger: { bg: colors.dangerLight, fg: colors.danger },
  }[tone];

  return (
    <View style={[styles.tag, { backgroundColor: palette.bg }]}>
      <Text style={[typography.caption, { color: palette.fg, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

/**
 * Fotoğraf yoksa baş harf gösterilir. MVP'de fotoğraf yükleme altyapısı
 * olmadığı için çoğu profil bu durumda görünür; tasarım buna göre yapıldı.
 */
export function Avatar({
  name,
  size = 48,
  emoji,
}: {
  name: string;
  size?: number;
  emoji?: string;
}) {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?';
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={{ fontSize: size * 0.42, color: colors.primary, fontWeight: '700' }}>
        {emoji ?? initial}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Durum ekranları: yükleniyor, boş, hata
// ---------------------------------------------------------------------------

export function LoadingState({ label = 'Yükleniyor…' }: { label?: string }) {
  return (
    <View style={styles.stateContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.md }}>
        {label}
      </AppText>
    </View>
  );
}

export function EmptyState({
  emoji = '🐾',
  title,
  description,
  actionLabel,
  onAction,
}: {
  emoji?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.stateContainer}>
      <Text style={{ fontSize: 44, marginBottom: spacing.md }}>{emoji}</Text>
      <AppText variant="heading" center>
        {title}
      </AppText>
      {description ? (
        <AppText
          variant="body"
          color={colors.textMuted}
          center
          style={{ marginTop: spacing.sm, maxWidth: 300 }}
        >
          {description}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          fullWidth={false}
          style={{ marginTop: spacing.xl, paddingHorizontal: spacing.xl }}
        />
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.stateContainer}>
      <Text style={{ fontSize: 40, marginBottom: spacing.md }}>😕</Text>
      <AppText variant="heading" center>
        Bir şeyler ters gitti
      </AppText>
      <AppText
        variant="body"
        color={colors.textMuted}
        center
        style={{ marginTop: spacing.sm, maxWidth: 300 }}
      >
        {message}
      </AppText>
      {onRetry ? (
        <Button
          label="Tekrar dene"
          onPress={onRetry}
          variant="secondary"
          fullWidth={false}
          style={{ marginTop: spacing.xl, paddingHorizontal: spacing.xl }}
        />
      ) : null}
    </View>
  );
}

/** Form üstünde gösterilen satır içi hata/başarı bildirimi. */
export function Banner({
  tone,
  message,
}: {
  tone: 'error' | 'success' | 'info' | 'warning';
  message: string;
}) {
  const palette = {
    error: { bg: colors.dangerLight, fg: colors.danger, icon: '⚠️' },
    success: { bg: colors.successLight, fg: colors.success, icon: '✓' },
    info: { bg: colors.primaryLight, fg: colors.primary, icon: 'ℹ️' },
    warning: { bg: colors.warningLight, fg: colors.warning, icon: '⚠️' },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]}>
      <Text style={{ marginRight: spacing.sm }}>{palette.icon}</Text>
      <Text style={[typography.body, { color: palette.fg, flex: 1 }]}>{message}</Text>
    </View>
  );
}

/** Ekran gövdesi — krem arka plan ve tutarlı kenar boşlukları. */
export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  if (!scroll) {
    return (
      <View style={[styles.screen, padded && { paddingHorizontal: spacing.lg }]}>{children}</View>
    );
  }
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        padded && { paddingHorizontal: spacing.lg },
        { paddingBottom: spacing.xxl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/**
 * Kaydırılabilir ekran gövdesi.
 *
 * Sekme ekranlarının tamamı aynı düzeni paylaşır: krem arka plan, güvenli
 * alan üst boşluğu, yatay kenar boşluğu ve aşağı çekerek yenileme. Tek yerde
 * tutulması görsel tutarlılığı garanti eder.
 */
export function ScrollScreen({
  children,
  refreshing,
  onRefresh,
  padded = true,
  topInset = true,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  topInset?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        padded && { paddingHorizontal: spacing.lg },
        { paddingTop: (topInset ? insets.top : 0) + spacing.lg, paddingBottom: spacing.xxl },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

/** Liste üstündeki arama alanı — Keşfet ve semt seçiminde aynı görünüm. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.searchWrap}>
      <SymbolView
        name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
        size={20}
        tintColor={colors.textSubtle}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        style={styles.searchInput}
        autoCorrect={false}
      />
    </View>
  );
}

/**
 * Alt panel (bottom sheet). Şikâyet/engelleme ve Google onay panelleri aynı
 * yüzeyi kullanır: karartılmış arka plan, üstte tutamak, yuvarlatılmış köşeler.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Paneli kapat" />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        {children}
      </View>
    </Modal>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="heading">{title}</AppText>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <AppText variant="label" color={colors.primary}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    fontSize: 15,
    color: colors.text,
  },
  searchWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  searchInput: {
    flex: 1,
    minHeight: 50,
    marginLeft: spacing.sm,
    fontSize: 15,
    color: colors.text,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxMark: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  avatar: {
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    minHeight: 260,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl + spacing.lg,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
});
