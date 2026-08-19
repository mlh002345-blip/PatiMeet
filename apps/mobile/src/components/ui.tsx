import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { colors, HIT_SIZE, radius, scrim, shadow, spacing, typography } from '../theme';

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
  variant?: 'primary' | 'secondary' | 'forest' | 'ghost' | 'danger';
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

  /**
   * Privé dilinde tek baskın eylem bakır dolgu, ikincil eylem orman yeşili
   * ince çerçevedir. `forest` varyantı koyu/sinematik yüzeylerde okunur.
   */
  const palette = {
    primary: { bg: colors.copperAction, fg: colors.textOnPrimary, border: 'transparent' },
    secondary: { bg: 'transparent', fg: colors.primary, border: colors.primary },
    forest: { bg: colors.primary, fg: colors.textOnPrimary, border: 'transparent' },
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
        <Text style={[typography.bodyStrong, { color: palette.fg }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Sekme ekranlarının ortak üst başlığı.
 *
 * Marka kilidi: serif "PatiMeet" + bakır "PRIVÉ" üst başlığı. Sağdaki eylem
 * alanı isteğe bağlı; verilmezse yalnızca marka gösterilir.
 */
export function AppHeader({
  onNotifications,
  action,
}: {
  onNotifications?: () => void;
  /** Bildirim yerine ekrana özel bir eylem koymak için. */
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.appHeader}>
      <View>
        <Text style={[typography.title, { color: colors.primary }]}>PatiMeet</Text>
        <Text style={[typography.kicker, { color: colors.copper, marginTop: 1 }]}>PRIVÉ</Text>
      </View>

      {action ?? (
        <IconAction
          label="Bildirimler"
          name={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
          onPress={onNotifications}
        />
      )}
    </View>
  );
}

/**
 * Yuvarlak ikon eylemi. Dokunma alanı her zaman en az 44 px kalır; görsel
 * daire daha küçük olsa bile.
 */
export function IconAction({
  label,
  name,
  onPress,
  tone = 'default',
  size = 20,
}: {
  label: string;
  name: SymbolViewProps['name'];
  onPress?: () => void;
  /** `onDark` koyu fotoğraf veya obsidyen yüzeyler için. */
  tone?: 'default' | 'onDark' | 'copper';
  size?: number;
}) {
  const tint =
    tone === 'onDark' ? colors.textOnDark : tone === 'copper' ? colors.copperAction : colors.text;
  const bg =
    tone === 'onDark' ? 'rgba(18, 20, 16, 0.42)' : tone === 'copper' ? colors.copperPale : colors.surface;
  const line = tone === 'onDark' ? 'rgba(243, 237, 227, 0.28)' : colors.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.iconAction,
        { backgroundColor: bg, borderColor: line },
        pressed && { opacity: 0.7 },
      ]}
    >
      <SymbolView name={name} size={size} tintColor={tint} />
    </Pressable>
  );
}

/**
 * PatiLine — ince bakır rota çizgisi.
 *
 * Dekorasyon değil: bir ilerlemeyi, rotayı veya zaman çizgisini anlatır.
 * `progress` 0–1 arası verilir; verilmezse tam çizgi çizilir.
 */
export function PatiLine({
  progress,
  style,
}: {
  progress?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const ratio = progress === undefined ? 1 : Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.patiLineTrack, style]}>
      <View style={[styles.patiLineFill, { width: `${ratio * 100}%` }]} />
    </View>
  );
}

/**
 * Sayısal vurgu — kapasite, uyum, mesafe.
 * İsteğe bağlı `progress` değeri altına bir PatiLine çizer.
 */
export function Metric({
  value,
  label,
  progress,
  tone = 'default',
}: {
  value: string;
  label: string;
  progress?: number;
  tone?: 'default' | 'onDark';
}) {
  const onDark = tone === 'onDark';
  return (
    <View style={{ flex: 1 }}>
      <Text style={[typography.metric, { color: onDark ? colors.textOnDark : colors.primary }]}>
        {value}
      </Text>
      <Text
        style={[
          typography.caption,
          { color: onDark ? colors.textOnDarkMuted : colors.textMuted, marginTop: 2 },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {progress !== undefined ? <PatiLine progress={progress} style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
}

/** Küçük, sessiz rozet — "Doğrulanmış", "Kulüp üyesi". */
export function SubtleBadge({
  label,
  icon,
  tone = 'default',
}: {
  label: string;
  icon?: SymbolViewProps['name'];
  tone?: 'default' | 'onDark' | 'copper';
}) {
  const onDark = tone === 'onDark';
  const fg = onDark ? colors.textOnDark : tone === 'copper' ? colors.copperDeep : colors.primary;
  const bg = onDark ? 'rgba(18, 20, 16, 0.46)' : tone === 'copper' ? colors.copperPale : colors.primaryLight;
  const line = onDark ? 'rgba(243, 237, 227, 0.26)' : 'transparent';

  return (
    <View style={[styles.subtleBadge, { backgroundColor: bg, borderColor: line }]}>
      {icon ? <SymbolView name={icon} size={12} tintColor={fg} /> : null}
      <Text style={[typography.caption, { color: fg, fontWeight: '600' }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Sinematik fotoğraf alanı.
 *
 * Fotoğrafın üzerine üç katmanlı bir karartma koyar (bkz. theme.ts `scrim`) ve
 * alt kısma içerik yerleştirir. Fotoğraf yoksa veya yüklenemezse tutarlı,
 * zarif bir orman yeşili fallback gösterilir — boş gri kutu bırakılmaz.
 */
export function ImageHero({
  uri,
  height = 220,
  children,
  topRight,
  topLeft,
  fallbackLabel,
  fallbackIcon,
  radius: cornerRadius = radius.lg,
  onPress,
  style,
}: {
  uri?: string | null;
  height?: number;
  children?: React.ReactNode;
  topRight?: React.ReactNode;
  topLeft?: React.ReactNode;
  fallbackLabel?: string;
  fallbackIcon?: SymbolViewProps['name'];
  radius?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = React.useState(false);
  const showImage = Boolean(uri) && !failed;

  const content = (
    <View style={[styles.hero, { height, borderRadius: cornerRadius }, style]}>
      {showImage ? (
        <Image
          source={{ uri: uri as string } as ImageSourcePropType}
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        /**
         * Fallback ortalanır; ancak üzerine yazı bindiğinde alt içerik alanı
         * kadar yukarı kaydırılır, yoksa başlıkla çakışıyor.
         */
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.heroFallback,
            children ? { paddingBottom: 96 } : null,
          ]}
        >
          <SymbolView
            name={fallbackIcon ?? { ios: 'pawprint', android: 'pets', web: 'pets' }}
            size={34}
            tintColor="rgba(243, 237, 227, 0.45)"
          />
          {fallbackLabel && !children ? (
            <Text
              style={[typography.caption, { color: colors.textOnDarkMuted, marginTop: spacing.sm }]}
              numberOfLines={1}
            >
              {fallbackLabel}
            </Text>
          ) : null}
        </View>
      )}

      {/* Metnin okunabilirliği için alttan yukarı koyulaşan üç katman. */}
      {children ? (
        <>
          <View style={[styles.scrimBand, { height: '55%', backgroundColor: scrim.soft }]} />
          <View style={[styles.scrimBand, { height: '38%', backgroundColor: scrim.medium }]} />
          <View style={[styles.scrimBand, { height: '22%', backgroundColor: scrim.strong }]} />
        </>
      ) : null}

      {topLeft ? <View style={styles.heroTopLeft}>{topLeft}</View> : null}
      {topRight ? <View style={styles.heroTopRight}>{topRight}</View> : null}
      {children ? <View style={styles.heroContent}>{children}</View> : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.94 } : null)}
    >
      {content}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Kart
// ---------------------------------------------------------------------------

/**
 * Yüzey. Varsayılan fildişi kart; `tone="dark"` obsidyen kulüp yüzeyi,
 * `tone="inset"` zeminden hafif ayrışan sessiz bir blok üretir.
 */
export function Card({
  children,
  onPress,
  tone = 'default',
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  tone?: 'default' | 'dark' | 'inset';
  style?: StyleProp<ViewStyle>;
}) {
  const toneStyle =
    tone === 'dark'
      ? { backgroundColor: colors.obsidianSoft, borderColor: colors.borderOnDark }
      : tone === 'inset'
        ? { backgroundColor: colors.surfaceMuted, borderColor: 'transparent' }
        : null;

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, toneStyle, pressed && { opacity: 0.92 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
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

/**
 * Çoklu seçimli seçenek grubu.
 *
 * ChoiceGroup ile aynı görünümü paylaşır; farkı seçili öğeye tekrar
 * dokunmanın seçimi kaldırması ve erişilebilirlik rolünün `checkbox` olması
 * (ekran okuyucu "seçili/seçili değil" der, radyo grubu gibi tek seçim
 * beklentisi yaratmaz).
 */
export function MultiChoiceGroup<T extends string>({
  label,
  options,
  values,
  onChange,
  error,
  hint,
  required,
  max,
}: {
  label?: string;
  options: Array<{ value: T; label: string }>;
  values: T[];
  onChange: (values: T[]) => void;
  error?: string | null;
  hint?: string;
  required?: boolean;
  /** Üst sınır dolduğunda seçili olmayan seçenekler pasifleşir. */
  max?: number;
}) {
  const atLimit = max !== undefined && values.length >= max;

  function toggle(value: T) {
    if (values.includes(value)) {
      onChange(values.filter((item) => item !== value));
      return;
    }
    if (atLimit) return;
    onChange([...values, value]);
  }

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

      <View style={styles.choiceRow}>
        {options.map((option) => {
          const selected = values.includes(option.value);
          const disabled = !selected && atLimit;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="checkbox"
              /**
               * `accessibilityState` yerel platformlarda yeterli, ancak React
               * Native Web bunu `aria-checked` olarak yaymıyor; kutunun seçili
               * olup olmadığı ekran okuyucuya ulaşmıyordu. İki API'yi birlikte
               * veriyoruz.
               */
              accessibilityState={{ checked: selected, disabled }}
              aria-checked={selected}
              accessibilityLabel={option.label}
              onPress={() => toggle(option.value)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.chip,
                selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                disabled && { opacity: 0.45 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                style={[
                  typography.label,
                  { color: selected ? colors.textOnPrimary : colors.textMuted },
                ]}
              >
                {selected ? `✓ ${option.label}` : option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {hint && !error ? (
        <AppText variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>
          {hint}
        </AppText>
      ) : null}

      {error ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {error}
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
  emoji,
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  /** @deprecated Privé dilinde emoji yerine `icon` kullanılır; prop yalnızca eski çağrılar kırılmasın diye duruyor. */
  emoji?: string;
  icon?: SymbolViewProps['name'];
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.stateContainer}>
      <View style={styles.stateIcon}>
        <SymbolView
          name={icon ?? { ios: 'pawprint', android: 'pets', web: 'pets' }}
          size={26}
          tintColor={colors.primary}
        />
      </View>
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
      <View style={[styles.stateIcon, { backgroundColor: colors.dangerLight }]}>
        <SymbolView
          name={{ ios: 'exclamationmark.triangle', android: 'error_outline', web: 'error_outline' }}
          size={24}
          tintColor={colors.danger}
        />
      </View>
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

/**
 * Editoryal bölüm başlığı.
 *
 * `kicker` verilirse üstte bakır, harf aralığı açılmış küçük bir üst başlık
 * çıkar ve ana başlık serif olur — dergi hiyerarşisi. Verilmezse eski
 * davranış birebir korunur.
 */
export function SectionHeader({
  title,
  kicker,
  actionLabel,
  onAction,
}: {
  title: string;
  kicker?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        {kicker ? (
          /**
           * Büyük harfe stille çeviriyoruz, JS ile değil: ekran okuyucular
           * metnin özgün halini okur, "GÜVENLİ TOPLULUK" harf harf
           * hecelenmez.
           */
          <Text
            style={[
              typography.kicker,
              { color: colors.copper, marginBottom: 3, textTransform: 'uppercase' },
            ]}
          >
            {kicker}
          </Text>
        ) : null}
        <AppText variant={kicker ? 'title' : 'heading'}>{title}</AppText>
      </View>

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          hitSlop={12}
          style={{ paddingLeft: spacing.md }}
        >
          <AppText variant="label" color={colors.copperDeep}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  iconAction: {
    minWidth: HIT_SIZE,
    minHeight: HIT_SIZE,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patiLineTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  patiLineFill: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.copper,
  },
  subtleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  hero: {
    overflow: 'hidden',
    backgroundColor: colors.primaryDark,
    justifyContent: 'flex-end',
  },
  heroFallback: {
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrimBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroContent: {
    padding: spacing.lg,
  },
  heroTopLeft: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
  },
  heroTopRight: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
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
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
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
