/**
 * "Ne arıyorsun?" seçenekleri.
 *
 * Alan tek seçimden çoklu seçime geçti. `egitim` bilinçli olarak listede
 * kalıyor: mevcut kullanıcıların kayıtlı verisi bozulmasın ve profilini
 * düzenlerken seçimini kaybetmesin diye geçerli bir değer olmayı sürdürüyor.
 */
export const PURPOSE_VALUES = ['yuruyus', 'oyun', 'sosyal', 'etkinlik', 'egitim'] as const;

export type PurposeValue = (typeof PURPOSE_VALUES)[number];

export const PURPOSE_LABELS: Record<PurposeValue, string> = {
  yuruyus: 'Yürüyüş arkadaşı',
  oyun: 'Oyun buluşması',
  sosyal: 'Sosyalleşme',
  etkinlik: 'Etkinlik',
  egitim: 'Eğitim ve çalışma',
};

export function isPurposeValue(value: unknown): value is PurposeValue {
  return typeof value === 'string' && (PURPOSE_VALUES as readonly string[]).includes(value);
}

/**
 * Veritabanından okunan değeri normalize eder.
 *
 * Sürücüler `TEXT[]` kolonunu dizi olarak döndürür; ancak eski satırlarda
 * kolon boş olabilir. Bu durumda tek değerli `purpose` kolonuna düşerek
 * geçiş dönemindeki kayıtların da doğru görünmesini sağlıyoruz.
 */
export function readPurposes(
  purposes: unknown,
  legacy: string | null | undefined
): PurposeValue[] {
  const raw = Array.isArray(purposes) ? purposes : [];
  const list = raw.filter(isPurposeValue);
  if (list.length > 0) return dedupe(list);
  return isPurposeValue(legacy) ? [legacy] : [];
}

/** Sırayı koruyarak yinelenenleri atar. */
export function dedupe(values: PurposeValue[]): PurposeValue[] {
  const seen = new Set<string>();
  const out: PurposeValue[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** Kaç seçenek ortak? Uyum skorunda kullanılır. */
export function sharedPurposes(a: PurposeValue[], b: PurposeValue[]): PurposeValue[] {
  const other = new Set<string>(b);
  return a.filter((value) => other.has(value));
}
