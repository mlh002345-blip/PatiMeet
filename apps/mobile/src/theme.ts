/**
 * PatiMeet tasarım dili.
 *
 * MVP tasarım ilkeleri: açık krem arka plan, koyu lila vurgu, yuvarlak köşeler,
 * kart tabanlı arayüz ve yüksek okunabilirlik. Flört uygulaması izlenimi
 * vermemek için doygun pembe/kırmızı tonlarından kaçınıldı.
 */
export const colors = {
  // Arka planlar
  background: '#FBF6EF',
  surface: '#FFFFFF',
  surfaceMuted: '#F4EEE6',

  // Vurgu — koyu lila
  primary: '#5B3E8E',
  primaryDark: '#452D6E',
  primaryLight: '#EDE6F7',
  primaryOn: '#FFFFFF',

  // İkincil sıcak ton (köpek/pati vurguları)
  accent: '#C9803A',
  accentLight: '#FBEEE0',

  // Metin
  text: '#2A2430',
  textMuted: '#6E6577',
  textSubtle: '#9A93A2',
  textOnPrimary: '#FFFFFF',

  // Durumlar
  success: '#2E7D5B',
  successLight: '#E3F2EA',
  danger: '#B3261E',
  dangerLight: '#FBE9E7',
  warning: '#9A6700',
  warningLight: '#FFF6E0',

  // Çizgiler
  border: '#E7DFD4',
  borderStrong: '#D6CCBE',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  heading: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
} as const;

/** Kart gölgeleri iOS ve Android'de farklı API kullanır. */
export const shadow = {
  card: {
    shadowColor: '#2A2430',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#2A2430',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;
