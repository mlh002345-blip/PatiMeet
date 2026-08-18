/**
 * Uyum skoru ve çoklu köpek testleri (Öncelik 2).
 *
 *   npm run test:matching
 *
 * Skor hesaplaması saf bir fonksiyon olduğu için kuralları doğrudan sınıyoruz;
 * ayrıca uçlar üzerinden keşfet sıralaması ve profil kırılımları doğrulanıyor.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  delete process.env.DATABASE_URL;
  process.env.PGLITE_DATA_DIR = 'memory';
}
process.env.JWT_SECRET = 'matching-test-secret';
process.env.ADMIN_TOKEN = 'matching-admin';
process.env.ADMIN_SESSION_SECRET = 'matching-session';
process.env.STORAGE_DRIVER = 'local';
process.env.PUSH_DRIVER = 'none';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';

const { createApp } = require('./app') as typeof import('./app');
const { getDb, runMigrations } = require('./db') as typeof import('./db');
const matching = require('./domain/matching') as typeof import('./domain/matching');
import type { DogRow, UserRow } from './domain/serialize';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, extra?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
    if (extra !== undefined) console.error('    →', JSON.stringify(extra));
  }
}

const section = (title: string) => console.log(`\n${title}`);

/** Test verisi üreticileri. */
function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u',
    email: 'u@test.com',
    password_hash: null,
    provider: 'email',
    name: 'Test',
    district: 'Kadıköy',
    bio: '',
    purpose: 'yuruyus',
    purposes: ['yuruyus'],
    photo_url: null,
    status: 'active',
    terms_accepted_at: null,
    privacy_accepted_at: null,
    deletion_requested_at: null,
    google_id: null,
    apple_id: null,
    email_verified_at: null,
    password_disabled_at: null,
    created_at: 0,
    ...overrides,
  };
}

const YEAR = new Date().getUTCFullYear();

function makeDog(overrides: Partial<DogRow> = {}): DogRow {
  return {
    id: 'd',
    owner_id: 'u',
    name: 'Köpek',
    breed: null,
    birth_year: YEAR - 3,
    size: 'orta',
    energy: 'dengeli',
    sociability: 'sosyal',
    bio: '',
    vaccinated: true,
    photo_url: null,
    status: 'active',
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

async function main(): Promise<void> {
  // ---------------------------------------------------------------------
  section('1. Skor hesaplama kuralları');

  const identical = matching.computeMatchScore(
    { user: makeUser(), dog: makeDog() },
    { user: makeUser({ id: 'u2' }), dog: makeDog({ id: 'd2', owner_id: 'u2' }) }
  );
  check('Birebir aynı profiller %100 verir', identical?.score === 100, identical);
  check('Yüksek uyum seviyesi', identical?.level === 'yuksek');
  check('Altı etken de hesaplanır', identical?.factors.length === 6, identical?.factors.length);
  check('Eksik bilgi yok', identical?.missing.length === 0);

  const opposite = matching.computeMatchScore(
    {
      user: makeUser({ district: 'Kadıköy', purpose: 'yuruyus' }),
      dog: makeDog({ size: 'kucuk', energy: 'sakin', sociability: 'cekingen', birth_year: YEAR - 12 }),
    },
    {
      user: makeUser({ id: 'u2', district: 'Şişli', purpose: 'egitim' }),
      dog: makeDog({
        id: 'd2',
        owner_id: 'u2',
        size: 'buyuk',
        energy: 'enerjik',
        sociability: 'secici',
        birth_year: YEAR - 1,
      }),
    }
  );
  check('Zıt profiller düşük skor verir', (opposite?.score ?? 100) < 45, opposite?.score);
  check('Düşük uyum seviyesi', opposite?.level === 'dusuk', opposite?.level);

  // Her etken kendi açıklamasını taşımalı — arayüz bunu gösteriyor.
  check(
    'Her etkenin açıklaması var',
    (identical?.factors ?? []).every((f) => f.note.length > 10 && f.label.length > 2),
    identical?.factors.map((f) => f.label)
  );
  check(
    'Puanlar üst sınırı aşmaz',
    (opposite?.factors ?? []).every((f) => f.points >= 0 && f.points <= f.max),
    opposite?.factors
  );

  // Enerji: bir basamak fark orta, iki basamak düşük
  const energyAdjacent = matching.computeMatchScore(
    { user: makeUser(), dog: makeDog({ energy: 'sakin' }) },
    { user: makeUser({ id: 'u2' }), dog: makeDog({ id: 'd2', energy: 'dengeli' }) }
  );
  const energyFar = matching.computeMatchScore(
    { user: makeUser(), dog: makeDog({ energy: 'sakin' }) },
    { user: makeUser({ id: 'u2' }), dog: makeDog({ id: 'd2', energy: 'enerjik' }) }
  );
  const findFactor = (result: typeof energyAdjacent, key: string) =>
    result?.factors.find((f) => f.key === key);

  check(
    'Enerji: komşu seviye tam puandan az, zıt seviyeden fazla',
    (findFactor(energyAdjacent, 'energy')?.points ?? 0) >
      (findFactor(energyFar, 'energy')?.points ?? 0),
    {
      komsu: findFactor(energyAdjacent, 'energy')?.points,
      zit: findFactor(energyFar, 'energy')?.points,
    }
  );

  // Sosyallik: çekingen + sosyal, çekingen + seçiciden iyi olmalı
  const shyWithSocial = matching.computeMatchScore(
    { user: makeUser(), dog: makeDog({ sociability: 'cekingen' }) },
    { user: makeUser({ id: 'u2' }), dog: makeDog({ id: 'd2', sociability: 'sosyal' }) }
  );
  const shyWithPicky = matching.computeMatchScore(
    { user: makeUser(), dog: makeDog({ sociability: 'cekingen' }) },
    { user: makeUser({ id: 'u2' }), dog: makeDog({ id: 'd2', sociability: 'secici' }) }
  );
  check(
    'Sosyallik: çekingen+sosyal, çekingen+seçiciden daha uyumlu',
    (findFactor(shyWithSocial, 'sociability')?.points ?? 0) >
      (findFactor(shyWithPicky, 'sociability')?.points ?? 0),
    {
      sosyal: findFactor(shyWithSocial, 'sociability')?.points,
      secici: findFactor(shyWithPicky, 'sociability')?.points,
    }
  );

  /**
   * Eksik bilgi cezalandırılmamalı: yaşı belirtilmemiş bir köpek, diğer
   * etkenleri mükemmelse yine yüksek skor almalı.
   */
  const missingAge = matching.computeMatchScore(
    { user: makeUser(), dog: makeDog({ birth_year: null }) },
    { user: makeUser({ id: 'u2' }), dog: makeDog({ id: 'd2', birth_year: null }) }
  );
  check('Eksik yaş cezalandırılmaz (yine %100)', missingAge?.score === 100, missingAge?.score);
  check(
    'Eksik etken bildirilir',
    missingAge?.missing.includes('Köpek yaşı') === true,
    missingAge?.missing
  );
  check('Eksik etken hesaba katılmaz', missingAge?.factors.length === 5, missingAge?.factors.length);

  const noDog = matching.computeMatchScore(
    { user: makeUser(), dog: null },
    { user: makeUser({ id: 'u2' }), dog: makeDog({ id: 'd2' }) }
  );
  check('Köpek yoksa skor üretilmez', noDog === null);

  // Çoklu köpek: en uyumlu olan seçilir
  const best = matching.bestMatchScore(
    makeUser(),
    [
      makeDog({ id: 'sakin-kopek', energy: 'sakin', size: 'kucuk' }),
      makeDog({ id: 'enerjik-kopek', energy: 'enerjik', size: 'buyuk' }),
    ],
    {
      user: makeUser({ id: 'u2' }),
      dog: makeDog({ id: 'd2', energy: 'enerjik', size: 'buyuk' }),
    }
  );
  check(
    'Çoklu köpekte en uyumlu köpek seçilir',
    best?.viewerDogId === 'enerjik-kopek',
    best?.viewerDogId
  );

  // ---------------------------------------------------------------------
  section('2. Keşfet ve profil detayı');

  const db = getDb();
  await runMigrations(db);

  const app = createApp({ googleVerifier: null, appleVerifier: null });
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('adres alınamadı');
  const base = `http://127.0.0.1:${address.port}`;

  async function req<T = any>(
    method: string,
    url: string,
    options: { token?: string; body?: unknown } = {}
  ): Promise<{ status: number; body: T }> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    const response = await fetch(`${base}${url}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  const stamp = Date.now();
  async function register(label: string) {
    const res = await req('POST', '/api/auth/register', {
      body: {
        email: `${label}${stamp}@test.com`,
        password: 'sifre12345',
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    return { token: res.body.token as string, id: res.body.user.id as string };
  }

  const ali = await register('ali');
  const veli = await register('veli');

  await req('PATCH', '/api/users/me', {
    token: ali.token,
    body: { name: 'Ali', district: 'Kadıköy', purpose: 'yuruyus' },
  });
  await req('PATCH', '/api/users/me', {
    token: veli.token,
    body: { name: 'Veli', district: 'Kadıköy', purpose: 'yuruyus' },
  });

  // Ali'nin iki köpeği: biri Veli'nin köpeğiyle çok uyumlu, biri değil
  const aliCalm = await req('POST', '/api/dogs', {
    token: ali.token,
    body: {
      name: 'Sakin',
      size: 'kucuk',
      energy: 'sakin',
      sociability: 'cekingen',
      birthYear: YEAR - 10,
    },
  });
  const aliActive = await req('POST', '/api/dogs', {
    token: ali.token,
    body: {
      name: 'Enerjik',
      size: 'buyuk',
      energy: 'enerjik',
      sociability: 'sosyal',
      birthYear: YEAR - 2,
    },
  });
  check('İkinci köpek profili eklenebilir', aliActive.status === 201, aliActive.body);

  const veliDog = await req('POST', '/api/dogs', {
    token: veli.token,
    body: {
      name: 'Eşleşen',
      size: 'buyuk',
      energy: 'enerjik',
      sociability: 'sosyal',
      birthYear: YEAR - 2,
    },
  });

  const discover = await req('GET', '/api/discover', { token: ali.token });
  const found = discover.body.items.find((item: any) => item.dog.id === veliDog.body.dog.id);
  check('Keşfet uyum skoru döner', typeof found?.match?.score === 'number', found?.match);
  check(
    'Skor en uyumlu köpeğe göre hesaplanır',
    found?.match?.viewerDogId === aliActive.body.dog.id,
    { secilen: found?.match?.viewerDogId, beklenen: aliActive.body.dog.id }
  );
  check('Uyum yüksek çıkar', found?.match?.score >= 70, found?.match?.score);
  check(
    'Kırılımlar keşfet yanıtında da var',
    Array.isArray(found?.match?.factors) && found.match.factors.length === 6
  );

  // Köpeği olmayan kullanıcı için skor null olmalı
  const ayse = await register('ayse');
  await req('PATCH', '/api/users/me', {
    token: ayse.token,
    body: { name: 'Ayşe', district: 'Kadıköy' },
  });
  const noDogDiscover = await req('GET', '/api/discover', { token: ayse.token });
  check(
    'Köpeği olmayan kullanıcıya skor gösterilmez',
    noDogDiscover.body.items.every((item: any) => item.match === null),
    noDogDiscover.body.items.map((i: any) => i.match)
  );

  // Profil detayı: her köpek için ayrı kırılım
  const profile = await req('GET', `/api/users/${veli.id}?dogId=${veliDog.body.dog.id}`, {
    token: ali.token,
  });
  check('Profil detayı kırılım listesi döner', Array.isArray(profile.body.matches));
  check(
    'Her köpek için ayrı kırılım var',
    profile.body.matches.length === 2,
    profile.body.matches.length
  );
  check(
    'En uyumlu köpek ilk sırada',
    profile.body.matches[0].score >= profile.body.matches[1].score,
    profile.body.matches.map((m: any) => ({ dog: m.viewerDogName, score: m.score }))
  );
  check(
    'Kırılımda köpek adı taşınır',
    profile.body.matches.every(
      (m: any) => typeof m.viewerDogName === 'string' && m.viewerDogName.length > 0
    )
  );

  // Kendi profilinde skor gösterilmez
  const ownProfile = await req('GET', `/api/users/${ali.id}`, { token: ali.token });
  check('Kendi profilinde skor yok', ownProfile.body.matches.length === 0);

  // ---------------------------------------------------------------------
  section('3. Çoklu köpek iş kuralları');

  const dogs = await req('GET', '/api/dogs', { token: ali.token });
  check('İki köpek listelenir', dogs.body.dogs.length === 2, dogs.body.dogs.length);

  const deleteFirst = await req('DELETE', `/api/dogs/${aliCalm.body.dog.id}`, {
    token: ali.token,
  });
  check('Birden fazla köpek varken silme çalışır', deleteFirst.status === 200, deleteFirst.body);

  const deleteLast = await req('DELETE', `/api/dogs/${aliActive.body.dog.id}`, {
    token: ali.token,
  });
  check(
    'Son köpek silinemez',
    deleteLast.status === 400 && deleteLast.body.error?.code === 'last_dog',
    deleteLast.body
  );

  // Üst sınır: 5 köpek
  for (let i = 0; i < 4; i++) {
    await req('POST', '/api/dogs', {
      token: ali.token,
      body: { name: `Köpek ${i}`, size: 'orta', energy: 'dengeli', sociability: 'sosyal' },
    });
  }
  const overLimit = await req('POST', '/api/dogs', {
    token: ali.token,
    body: { name: 'Fazla', size: 'orta', energy: 'dengeli', sociability: 'sosyal' },
  });
  check(
    'Köpek sayısı üst sınırı uygulanır',
    overLimit.status === 400 && overLimit.body.error?.code === 'dog_limit_reached',
    overLimit.body
  );

  // Etkinliğe belirli bir köpekle katılma
  const event = await req('POST', '/api/events', {
    token: veli.token,
    body: {
      title: 'Büyük köpekler yürüyüşü',
      type: 'yuruyus',
      startsAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
      district: 'Kadıköy',
      meetingPoint: 'Park girişi',
      capacity: 6,
      dogSize: 'buyuk',
    },
  });

  const aliDogsNow = await req('GET', '/api/dogs', { token: ali.token });
  const bigDog = aliDogsNow.body.dogs.find((d: any) => d.size === 'buyuk');
  const mediumDog = aliDogsNow.body.dogs.find((d: any) => d.size === 'orta');

  const wrongSize = await req('POST', `/api/events/${event.body.event.id}/join`, {
    token: ali.token,
    body: { dogId: mediumDog.id },
  });
  check(
    'Uygun olmayan boyuttaki köpekle katılım reddedilir',
    wrongSize.status === 400 && wrongSize.body.error?.code === 'dog_size_mismatch',
    wrongSize.body
  );

  const rightSize = await req('POST', `/api/events/${event.body.event.id}/join`, {
    token: ali.token,
    body: { dogId: bigDog.id },
  });
  check('Doğru köpekle katılım başarılı', rightSize.status === 200, rightSize.body);

  const detail = await req('GET', `/api/events/${event.body.event.id}`, { token: ali.token });
  const aliParticipant = detail.body.participants.find((p: any) => p.user.id === ali.id);
  check(
    'Katılımcı listesinde seçilen köpek görünür',
    aliParticipant?.dog?.id === bigDog.id,
    aliParticipant?.dog
  );

  // Etkinlik oluştururken köpek seçimi
  const createdWithDog = await req('POST', '/api/events', {
    token: ali.token,
    body: {
      title: 'Kendi yürüyüşüm',
      type: 'yuruyus',
      startsAt: Date.now() + 4 * 24 * 60 * 60 * 1000,
      district: 'Kadıköy',
      meetingPoint: 'Sahil',
      capacity: 5,
      dogId: bigDog.id,
    },
  });
  const ownDetail = await req('GET', `/api/events/${createdWithDog.body.event.id}`, {
    token: ali.token,
  });
  check(
    'Etkinlik oluştururken seçilen köpek kaydedilir',
    ownDetail.body.participants[0]?.dog?.id === bigDog.id,
    ownDetail.body.participants[0]?.dog
  );

  server.close();
  await db.close();

  console.log(`\n${'='.repeat(52)}`);
  console.log(`Toplam: ${passed + failed}  |  Geçen: ${passed}  |  Başarısız: ${failed}`);
  console.log('='.repeat(52));

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Uyum skoru testleri çöktü:', error);
  process.exit(1);
});
