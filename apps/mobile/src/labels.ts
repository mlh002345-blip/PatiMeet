/**
 * Arayüz Türkçe. Sunucu enum değerlerini (kucuk, enerjik, ...) kullanıcıya
 * gösterilecek etiketlere burada çeviriyoruz ki metinler tek yerde yaşasın.
 */
export const dogSizeLabels: Record<string, string> = {
  kucuk: 'Küçük',
  orta: 'Orta',
  buyuk: 'Büyük',
  hepsi: 'Tüm boyutlar',
};

export const energyLabels: Record<string, string> = {
  sakin: 'Sakin',
  dengeli: 'Dengeli',
  enerjik: 'Enerjik',
};

export const sociabilityLabels: Record<string, string> = {
  cekingen: 'Çekingen',
  secici: 'Seçici',
  sosyal: 'Sosyal',
};

/**
 * "Ne arıyorsun?" seçenekleri — çoklu seçim.
 *
 * `egitim` bilinçli olarak listede: alan tek seçimliyken bu değeri seçmiş
 * kullanıcıların verisi korunuyor ve düzenleme ekranında görünmeye devam
 * ediyor. Sunucu tarafındaki liste ile aynı sırada tutulmalı
 * (apps/api/src/domain/purposes.ts).
 */
export const purposeLabels: Record<string, string> = {
  yuruyus: 'Yürüyüş arkadaşı',
  oyun: 'Oyun buluşması',
  sosyal: 'Sosyalleşme',
  etkinlik: 'Etkinlik',
  egitim: 'Eğitim ve çalışma',
};

/** Güvenli Topluluk bildirim türleri. Sunucu listesi ile aynı değerler. */
export const alertTypeLabels: Record<string, string> = {
  kayip_hayvan: 'Kayıp hayvan',
  bulunan_hayvan: 'Bulunan hayvan',
  zehirli_yem: 'Zehirli yem / tehlikeli bölge',
  yarali_hayvan: 'Yaralı veya başıboş hayvan',
  salgin_hastalik: 'Salgın hastalık uyarısı',
  acil_kan: 'Acil kan ihtiyacı',
  gecici_yuva: 'Geçici yuva / sahiplendirme',
  destek: 'Mama veya ulaşım desteği',
};

/** Liste kartlarında türü bir bakışta ayırt etmek için. */
export const alertTypeEmoji: Record<string, string> = {
  kayip_hayvan: '🔎',
  bulunan_hayvan: '🏠',
  zehirli_yem: '☠️',
  yarali_hayvan: '🚑',
  salgin_hastalik: '🦠',
  acil_kan: '🩸',
  gecici_yuva: '🤝',
  destek: '🥫',
};

/**
 * Aciliyeti yüksek türler listede vurgulanır. Renk seçimi bilgilendirme
 * amaçlı; hiçbiri resmî bir acil durum servisi yerine geçmez.
 */
export const urgentAlertTypes = new Set(['kayip_hayvan', 'zehirli_yem', 'yarali_hayvan', 'acil_kan']);

export const eventTypeLabels: Record<string, string> = {
  yuruyus: 'Yürüyüş',
  park: 'Park buluşması',
  oyun: 'Oyun',
  egitim: 'Eğitim',
  sosyal: 'Sosyalleşme',
};

export const eventTypeEmoji: Record<string, string> = {
  yuruyus: '🚶',
  park: '🌳',
  oyun: '🎾',
  egitim: '🎓',
  sosyal: '🐾',
};

export function labelFor(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return '—';
  return map[value] ?? value;
}

const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** "12 Mart Cumartesi, 10:00" biçiminde tarih. */
export function formatEventDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${WEEKDAYS[date.getDay()]}, ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Mesaj listesinde göreli zaman: "az önce", "3 sa", "Dün", "12 Mart". */
export function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes} dk`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Dün';
  if (days < 7) return `${days} gün`;
  return formatShortDate(timestamp);
}

export function dogAgeLabel(age: number | null): string {
  if (age === null || age === undefined) return 'Yaş belirtilmemiş';
  if (age === 0) return 'Yavru';
  return `${age} yaşında`;
}

/** "12 Mart Cumartesi, 10:00" — bildirimlerde son görülme zamanı için. */
export function formatDateTime(timestamp: number): string {
  return formatEventDate(timestamp);
}
