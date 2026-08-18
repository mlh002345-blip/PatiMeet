import { PURPOSE_LABELS, readPurposes, sharedPurposes, type PurposeValue } from './purposes';
import type { DogRow, UserRow } from './serialize';

/**
 * Açıklanabilir uyum skoru.
 *
 * Amaç, kullanıcıya "neden bu eşleşme" sorusunun cevabını verebilmek. Bu
 * yüzden tek bir sayı değil, alt kırılımlar da döndürülür ve her kırılımın
 * kendi açıklaması vardır.
 *
 * ÖNEMLİ SINIR: Skor yalnızca kullanıcıların kendi girdiği profil bilgilerine
 * dayanır. Sağlık, güvenlik, mizaç veya gerçek uyum garantisi DEĞİLDİR ve
 * veterinerlik ya da eğitim tavsiyesi yerine geçmez. Arayüzde bu uyarı
 * gösterilir; hesaplama kasıtlı olarak basit ve okunabilir tutuldu.
 */
export type MatchFactorKey = 'energy' | 'sociability' | 'size' | 'district' | 'purpose' | 'age';

export interface MatchFactor {
  key: MatchFactorKey;
  label: string;
  /** Kazanılan puan. */
  points: number;
  /** Bu etkenin üst sınırı. */
  max: number;
  /** Kullanıcıya gösterilecek kısa açıklama. */
  note: string;
}

export interface MatchScore {
  /** 0–100 arası toplam. */
  score: number;
  /** `yuksek` ≥ 70, `orta` ≥ 45, `dusuk` < 45 */
  level: 'yuksek' | 'orta' | 'dusuk';
  factors: MatchFactor[];
  /** Bilgi eksikliği nedeniyle hesaplanamayan etkenler. */
  missing: string[];
}

/**
 * Sıralı ölçekler. Aradaki mesafe uyumu belirler: aynı seviye en iyi,
 * bir basamak fark kabul edilebilir, iki basamak fark zorlayıcı.
 */
const ENERGY_ORDER = ['sakin', 'dengeli', 'enerjik'];
const SIZE_ORDER = ['kucuk', 'orta', 'buyuk'];
const SOCIABILITY_ORDER = ['cekingen', 'secici', 'sosyal'];

function distance(order: string[], a: string, b: string): number | null {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i === -1 || j === -1) return null;
  return Math.abs(i - j);
}

/** Etken ağırlıkları — toplamı 100. */
const WEIGHTS = {
  energy: 25,
  sociability: 20,
  size: 20,
  district: 15,
  purpose: 10,
  age: 10,
} as const;

function energyFactor(mine: string, theirs: string): MatchFactor | null {
  const d = distance(ENERGY_ORDER, mine, theirs);
  if (d === null) return null;

  const points = d === 0 ? WEIGHTS.energy : d === 1 ? 15 : 5;
  const note =
    d === 0
      ? 'Enerji seviyeleri aynı; tempo konusunda anlaşmaları kolay.'
      : d === 1
        ? 'Enerji seviyeleri yakın; kısa bir alışma süresi yeterli olabilir.'
        : 'Enerji seviyeleri çok farklı; biri yorulurken diğeri oyun isteyebilir.';

  return { key: 'energy', label: 'Enerji uyumu', points, max: WEIGHTS.energy, note };
}

/**
 * Sosyallik: çekingen bir köpek için karşı tarafın sosyal olması iyidir
 * (sabırlı yaklaşım), ancak iki çekingen köpek de birbirini zorlamaz.
 * En zor durum çekingen + seçici eşleşmesidir.
 */
function sociabilityFactor(mine: string, theirs: string): MatchFactor | null {
  const mineIndex = SOCIABILITY_ORDER.indexOf(mine);
  const theirsIndex = SOCIABILITY_ORDER.indexOf(theirs);
  if (mineIndex === -1 || theirsIndex === -1) return null;

  const bothSocial = mine === 'sosyal' && theirs === 'sosyal';
  const oneSocial = mine === 'sosyal' || theirs === 'sosyal';
  const bothShy = mine === 'cekingen' && theirs === 'cekingen';
  const shyAndPicky =
    (mine === 'cekingen' && theirs === 'secici') || (mine === 'secici' && theirs === 'cekingen');

  let points: number;
  let note: string;

  if (bothSocial) {
    points = WEIGHTS.sociability;
    note = 'İkisi de sosyal; tanışma büyük olasılıkla hızlı geçer.';
  } else if (oneSocial) {
    points = 16;
    note = 'Biri sosyal; çekingen olanın alışmasına yardımcı olabilir.';
  } else if (bothShy) {
    points = 12;
    note = 'İkisi de çekingen; sakin ve baskısız bir tanışma iyi olur.';
  } else if (shyAndPicky) {
    points = 6;
    note = 'Biri çekingen, diğeri seçici; ilk buluşmayı kısa tutmak iyi olur.';
  } else {
    points = 10;
    note = 'İkisi de seçici; tanışmayı yavaş ilerletmek gerekebilir.';
  }

  return { key: 'sociability', label: 'Sosyallik uyumu', points, max: WEIGHTS.sociability, note };
}

function sizeFactor(mine: string, theirs: string): MatchFactor | null {
  const d = distance(SIZE_ORDER, mine, theirs);
  if (d === null) return null;

  const points = d === 0 ? WEIGHTS.size : d === 1 ? 12 : 6;
  const note =
    d === 0
      ? 'Benzer boyutta; oyun sırasında denge kurmaları kolay.'
      : d === 1
        ? 'Boyut farkı orta; oyunu gözlemlemek iyi olur.'
        : 'Boyut farkı büyük; oyunu yakından takip etmek ve mola vermek gerekir.';

  return { key: 'size', label: 'Boyut uyumu', points, max: WEIGHTS.size, note };
}

function districtFactor(mine: string | null, theirs: string | null): MatchFactor | null {
  if (!mine || !theirs) return null;

  const same = mine === theirs;
  return {
    key: 'district',
    label: 'Semt',
    points: same ? WEIGHTS.district : 4,
    max: WEIGHTS.district,
    note: same
      ? `İkiniz de ${mine} çevresindesiniz; sık buluşmak kolay.`
      : `Farklı semtlerdesiniz (${mine} — ${theirs}); buluşmak için ortak bir nokta gerekebilir.`,
  };
}

/**
 * Kullanım amacı artık çoklu seçim: en az bir ortak beklenti varsa tam puan
 * verilir ve açıklamada hangi başlıkların örtüştüğü yazılır. Hiç ortak yoksa
 * eskisi gibi düşük ama sıfır olmayan bir puan kalır — farklı beklentiler
 * eşleşmeyi imkânsız kılmaz, sadece baştan konuşmayı gerektirir.
 */
function purposeFactor(mine: PurposeValue[], theirs: PurposeValue[]): MatchFactor | null {
  if (mine.length === 0 || theirs.length === 0) return null;

  const shared = sharedPurposes(mine, theirs);
  const names = shared.map((value) => PURPOSE_LABELS[value].toLocaleLowerCase('tr-TR'));

  return {
    key: 'purpose',
    label: 'Kullanım amacı',
    points: shared.length > 0 ? WEIGHTS.purpose : 4,
    max: WEIGHTS.purpose,
    note:
      shared.length > 0
        ? `Ortak beklentiniz var: ${names.join(', ')}.`
        : 'Farklı şeyler arıyorsunuz; ne istediğinizi baştan konuşmak iyi olur.',
  };
}

function ageFactor(mine: number | null, theirs: number | null): MatchFactor | null {
  if (mine === null || theirs === null) return null;

  const diff = Math.abs(mine - theirs);
  const points = diff <= 1 ? WEIGHTS.age : diff <= 3 ? 7 : diff <= 6 ? 4 : 2;
  const note =
    diff <= 1
      ? 'Yaşları çok yakın; oyun istekleri benzer olur.'
      : diff <= 3
        ? 'Yaşları yakın.'
        : 'Yaş farkı belirgin; yavru enerjisi ile yaşlı köpek temposu farklı olabilir.';

  return { key: 'age', label: 'Yaş uyumu', points, max: WEIGHTS.age, note };
}

function dogAge(dog: DogRow): number | null {
  if (!dog.birth_year) return null;
  const age = new Date().getUTCFullYear() - dog.birth_year;
  return age >= 0 ? age : null;
}

/**
 * İki köpek/sahip çifti için uyum skorunu hesaplar.
 *
 * Eksik bilgi cezalandırılmaz: hesaplanamayan etkenler toplamdan düşülür ve
 * skor mevcut etkenlerin üst sınırına göre yüzdeye çevrilir. Böylece profilini
 * henüz tamamlamamış kullanıcılar haksız biçimde düşük görünmez; hangi bilginin
 * eksik olduğu `missing` içinde bildirilir.
 */
export function computeMatchScore(
  viewer: { user: UserRow; dog: DogRow | null },
  target: { user: UserRow; dog: DogRow | null }
): MatchScore | null {
  // En az iki köpek profili olmadan anlamlı bir skor üretilemez.
  if (!viewer.dog || !target.dog) return null;

  const candidates: Array<MatchFactor | null> = [
    energyFactor(viewer.dog.energy, target.dog.energy),
    sociabilityFactor(viewer.dog.sociability, target.dog.sociability),
    sizeFactor(viewer.dog.size, target.dog.size),
    districtFactor(viewer.user.district, target.user.district),
    purposeFactor(
      readPurposes(viewer.user.purposes, viewer.user.purpose),
      readPurposes(target.user.purposes, target.user.purpose)
    ),
    ageFactor(dogAge(viewer.dog), dogAge(target.dog)),
  ];

  const factors = candidates.filter((factor): factor is MatchFactor => factor !== null);

  const missing: string[] = [];
  if (!candidates[3]) missing.push('Semt bilgisi');
  if (!candidates[4]) missing.push('Kullanım amacı');
  if (!candidates[5]) missing.push('Köpek yaşı');

  const earned = factors.reduce((sum, factor) => sum + factor.points, 0);
  const possible = factors.reduce((sum, factor) => sum + factor.max, 0);

  // possible her zaman > 0: enerji, sosyallik ve boyut zorunlu alanlardır.
  const score = Math.round((earned / possible) * 100);

  return {
    score,
    level: score >= 70 ? 'yuksek' : score >= 45 ? 'orta' : 'dusuk',
    factors,
    missing,
  };
}

/**
 * Bir kullanıcının birden fazla köpeği olabilir. Keşfet listesinde tek bir
 * skor gösterildiği için, izleyenin köpekleri arasından **en uyumlu** olanı
 * seçiyoruz — kullanıcı için en anlamlı bilgi bu.
 */
export function bestMatchScore(
  viewerUser: UserRow,
  viewerDogs: DogRow[],
  target: { user: UserRow; dog: DogRow | null }
): (MatchScore & { viewerDogId: string }) | null {
  let best: (MatchScore & { viewerDogId: string }) | null = null;

  for (const dog of viewerDogs) {
    const result = computeMatchScore({ user: viewerUser, dog }, target);
    if (result && (!best || result.score > best.score)) {
      best = { ...result, viewerDogId: dog.id };
    }
  }

  return best;
}
