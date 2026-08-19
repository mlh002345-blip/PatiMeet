import { Platform } from 'react-native';

/**
 * PatiMeet Privé tasarım dili.
 *
 * Onaylı görsel yön: `design/patimeet-prive-flagship-11of10-v1.png`
 * Yardımcı referans: `design/patimeet-premium-ui-reference-v1.png`
 *
 * Karakter: şehirli köpek sahiplerine özel, güvenilir dijital kulüp. Kemik
 * beyazı ve sıcak fildişi zemin, koyu botanik yeşil tipografi, obsidyen
 * derinlik ve ölçülü oksitlenmiş bakır vurgu. Parlak gradient, ağır gölge ve
 * çocukça süslerden kaçınılır.
 *
 * GERİYE UYUMLULUK: Eski anahtar adlarının hepsi korundu (`primary`, `accent`,
 * `surfaceMuted`, ...). Değerleri yeni palete taşındı; böylece mevcut ekranlar
 * tek tek düzenlenmeden yeni dile geçer ve hiçbir çağrı kırılmaz.
 */

/** Ham marka renkleri. Bileşenler bunları doğrudan değil, roller üzerinden kullanır. */
const palette = {
  ivory: '#F3EDE3',
  ivorySoft: '#FFFCF7',
  ivoryDeep: '#EAE2D5',

  forest: '#1E3A2F',
  forestSoft: '#2E5142',
  forestPale: '#E3EAE4',

  obsidian: '#121410',
  obsidianSoft: '#1E211B',

  /** Dekoratif bakır (PatiLine, ince çerçeve, rozet kenarı). */
  copper: '#B5713C',
  /** Eylem bakırı — beyaz metinle AA kontrastı sağlar (4.8:1). */
  copperAction: '#A6602F',
  copperDeep: '#8F5326',
  copperPale: '#F4E7D8',
} as const;

export const colors = {
  // --- Zeminler ---
  background: palette.ivory,
  surface: palette.ivorySoft,
  surfaceMuted: palette.ivoryDeep,

  /** Sinematik/kulüp yüzeyleri. */
  obsidian: palette.obsidian,
  obsidianSoft: palette.obsidianSoft,

  // --- Ana vurgu: koyu botanik yeşil ---
  primary: palette.forest,
  primaryDark: '#16281F',
  primaryLight: palette.forestPale,
  primaryOn: '#FFFFFF',
  forest: palette.forest,
  forestSoft: palette.forestSoft,

  // --- İkincil vurgu: oksitlenmiş bakır ---
  accent: palette.copperAction,
  accentLight: palette.copperPale,
  copper: palette.copper,
  copperAction: palette.copperAction,
  copperDeep: palette.copperDeep,
  copperPale: palette.copperPale,

  // --- Metin ---
  text: '#1C1E19',
  textMuted: '#5E6358',
  textSubtle: '#777C70',
  textOnPrimary: '#FFFFFF',
  /** Koyu fotoğraf/obsidyen zemin üzerindeki ikincil metin. */
  textOnDark: '#F3EDE3',
  textOnDarkMuted: 'rgba(243, 237, 227, 0.76)',

  // --- Durumlar ---
  success: '#2E6B4F',
  successLight: '#E1EDE6',
  danger: '#9E3025',
  dangerLight: '#F7E6E3',
  warning: '#8A6420',
  warningLight: '#F7EEDC',

  // --- Çizgiler ---
  border: '#E2D9CA',
  borderStrong: '#CFC3AF',
  /** Koyu yüzeylerde ince ayırıcı. */
  borderOnDark: 'rgba(243, 237, 227, 0.16)',

  // --- Örtüler ---
  backdrop: 'rgba(18, 20, 16, 0.52)',
  textOnPrimaryMuted: 'rgba(255, 255, 255, 0.72)',
} as const;

/**
 * Gece teması tokenları.
 *
 * Bu fazda kullanıcıya tema seçimi sunulmuyor; yapı ileride `colors` yerine
 * geçebilsin diye aynı anahtar kümesiyle hazırlandı.
 */
export type ColorTokens = Record<keyof typeof colors, string>;

export const darkColors: ColorTokens = {
  ...colors,
  background: palette.obsidian,
  surface: palette.obsidianSoft,
  surfaceMuted: '#262A22',
  primary: '#8FB3A1',
  primaryDark: '#6E9483',
  primaryLight: '#22302A',
  forest: '#8FB3A1',
  forestSoft: '#A8C4B5',
  text: palette.ivory,
  textMuted: 'rgba(243, 237, 227, 0.72)',
  textSubtle: 'rgba(243, 237, 227, 0.54)',
  border: 'rgba(243, 237, 227, 0.14)',
  borderStrong: 'rgba(243, 237, 227, 0.24)',
  backdrop: 'rgba(0, 0, 0, 0.62)',
};

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

/** İnce sınır kalınlıkları — kalın çerçeve premium hissi bozuyor. */
export const border = {
  hairline: StyleSheetHairline(),
  thin: 1,
  medium: 1.5,
} as const;

function StyleSheetHairline(): number {
  // RN'in kendi hairline değeri platforma göre değişir; import zincirini
  // sadeleştirmek için burada sabit bir güvenli alt sınır kullanıyoruz.
  return Platform.OS === 'web' ? 1 : 0.5;
}

/**
 * Editoryal başlıklar için serif.
 *
 * Harici font dosyası eklemedik: uygun lisanslı bir serif yüklemek yeni bir
 * bağımlılık ve ~1 MB varlık demek. Bunun yerine her platformun kendi sistem
 * serifini kullanıyoruz — lisans sorunu yok, paket büyümüyor, sistem font
 * ölçeklemesi bozulmuyor.
 */
export const fontFamily = {
  serif: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    web: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
    default: 'serif',
  }),
  sans: Platform.select({
    ios: undefined,
    android: undefined,
    web: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    default: undefined,
  }),
} as const;

/**
 * Tipografi rolleri.
 *
 * `editorial` ve `display` serif; gövde metinleri sistem sans. Satır
 * yükseklikleri sistem font ölçeklemesiyle birlikte büyüyebilsin diye sabit
 * ama cömert tutuldu.
 */
export const typography = {
  /** Ekran açılışındaki büyük editoryal başlık — "Günaydın, Elif". */
  editorial: {
    fontFamily: fontFamily.serif,
    fontSize: 34,
    fontWeight: '400' as const,
    lineHeight: 42,
    letterSpacing: -0.4,
  },
  display: {
    fontFamily: fontFamily.serif,
    fontSize: 28,
    fontWeight: '400' as const,
    lineHeight: 36,
    letterSpacing: -0.2,
  },
  title: {
    fontFamily: fontFamily.serif,
    fontSize: 22,
    fontWeight: '400' as const,
    lineHeight: 29,
  },
  heading: { fontSize: 17, fontWeight: '600' as const, lineHeight: 23 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18, letterSpacing: 0.1 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
  /** Sayısal vurgu — kapasite, uyum, mesafe. */
  metric: {
    fontFamily: fontFamily.serif,
    fontSize: 24,
    fontWeight: '400' as const,
    lineHeight: 28,
  },
  /** Küçük, harf aralığı açılmış üst başlık — "KULÜP", "PRIVÉ". */
  kicker: {
    fontSize: 10,
    fontWeight: '700' as const,
    lineHeight: 14,
    letterSpacing: 2,
  },
} as const;

/**
 * Yükselti. Privé dilinde gölge çok ölçülü: derinlik ince sınır ve zemin
 * kontrastıyla anlatılır, ağır gölgeyle değil.
 */
export const shadow = {
  card: {
    shadowColor: palette.obsidian,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  raised: {
    shadowColor: palette.obsidian,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;

/**
 * Fotoğraf üzerindeki karartma katmanları.
 *
 * `expo-linear-gradient` kurulu değil ve yalnızca bunun için yeni bir
 * bağımlılık eklemiyoruz: üst üste binen üç yarı saydam katman küçük
 * ekranlarda gradient ile aynı okunabilirliği veriyor.
 */
export const scrim = {
  soft: 'rgba(18, 20, 16, 0.18)',
  medium: 'rgba(18, 20, 16, 0.42)',
  strong: 'rgba(18, 20, 16, 0.72)',
} as const;

/** Erişilebilir dokunma hedefi alt sınırı. */
export const HIT_SIZE = 44;
