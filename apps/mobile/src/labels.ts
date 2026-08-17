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

export const purposeLabels: Record<string, string> = {
  yuruyus: 'Yürüyüş arkadaşı',
  oyun: 'Oyun arkadaşı',
  sosyal: 'Sosyalleşme',
  egitim: 'Eğitim ve çalışma',
};

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
