/**
 * Çoklu seçim "Ne arıyorsun?" alanı ve Güvenli Topluluk bildirimleri testi.
 *
 *   npm run test:alerts
 *
 * Varsayılan olarak gömülü PostgreSQL (PGlite) kullanır; TEST_DATABASE_URL
 * verilirse gerçek PostgreSQL üzerinde aynı testler çalışır.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patimeet-alerts-'));

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  delete process.env.DATABASE_URL;
  process.env.PGLITE_DATA_DIR = 'memory';
}
process.env.PORT = '0';
process.env.JWT_SECRET = 'alerts-test-secret';
process.env.ADMIN_TOKEN = 'alerts-admin-token';
process.env.ADMIN_SESSION_SECRET = 'alerts-admin-session';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = uploadDir;
process.env.PUSH_DRIVER = 'none';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';

const { createApp } = require('./app') as typeof import('./app');
const { getDb, runMigrations, nowMs } = require('./db') as typeof import('./db');
const { setPushSender } = require('./domain/push') as typeof import('./domain/push');
const { newId } = require('./ids') as typeof import('./ids');

interface CapturedPush {
  tokens: string[];
  title: string;
  body: string;
}
const sentPush: CapturedPush[] = [];
setPushSender({
  driver: 'none',
  async send(tokens, message) {
    sentPush.push({ tokens, title: message.title, body: message.body });
    return tokens.map((token) => ({ token, ok: true, shouldRevoke: false }));
  },
});

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

/** Geçerli, en küçük JPEG başlığı — yükleme doğrulaması bayt imzasına bakar. */
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]),
  Buffer.alloc(64, 0x20),
  Buffer.from([0xff, 0xd9]),
]);

const DAY = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  await runMigrations(getDb());

  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Sunucu adresi alınamadı');
  const base = `http://127.0.0.1:${address.port}`;

  async function req<T = any>(
    method: string,
    url: string,
    options: { token?: string; body?: unknown; adminToken?: string } = {}
  ): Promise<{ status: number; body: T }> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.adminToken) headers['x-admin-token'] = options.adminToken;
    const response = await fetch(`${base}${url}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  async function upload(token: string, purpose: string) {
    const response = await fetch(`${base}/api/media/${purpose}`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${token}` },
      body: new Uint8Array(JPEG),
    });
    return { status: response.status, body: (await response.json()) as any };
  }

  const stamp = Date.now();

  async function registerUser(label: string, district: string) {
    const email = `${label}${stamp}@test.com`;
    const res = await req('POST', '/api/auth/register', {
      body: { email, password: 'sifre12345', acceptTerms: true, acceptPrivacy: true },
    });
    if (res.status !== 201) throw new Error(`${label} kaydı başarısız: ${JSON.stringify(res.body)}`);
    const token = res.body.token as string;
    await req('PATCH', '/api/users/me', {
      token,
      body: { name: label[0].toUpperCase() + label.slice(1), district },
    });
    return { email, token, id: res.body.user.id as string };
  }

  const ada = await registerUser('ada', 'Kadıköy');
  const berk = await registerUser('berk', 'Kadıköy');
  const cem = await registerUser('cem', 'Beşiktaş');

  // ------------------------------------------------------------------
  section('1. Çoklu seçim: "Ne arıyorsun?"');

  const multi = await req('PATCH', '/api/users/me', {
    token: ada.token,
    body: { purposes: ['yuruyus', 'oyun', 'etkinlik'] },
  });
  check('Birden fazla amaç kaydedilir', multi.status === 200, multi.body);
  check(
    'Seçimler sırayla döner',
    JSON.stringify(multi.body.user.purposes) === JSON.stringify(['yuruyus', 'oyun', 'etkinlik']),
    multi.body.user.purposes
  );
  check(
    'Eski tek değerli alan ilk seçimle uyumlu kalır',
    multi.body.user.purpose === 'yuruyus',
    multi.body.user.purpose
  );

  const dbPurpose = await getDb().one<{ purpose: string | null; purposes: string[] }>(
    'SELECT purpose, purposes FROM users WHERE id = $1',
    [ada.id]
  );
  check(
    'Veritabanında eski kolon da güncellenir (geri dönüş güvencesi)',
    dbPurpose?.purpose === 'yuruyus' && dbPurpose.purposes.length === 3,
    dbPurpose
  );

  const dupes = await req('PATCH', '/api/users/me', {
    token: berk.token,
    body: { purposes: ['oyun', 'oyun', 'sosyal'] },
  });
  check(
    'Yinelenen seçimler tekilleştirilir',
    JSON.stringify(dupes.body.user.purposes) === JSON.stringify(['oyun', 'sosyal']),
    dupes.body.user.purposes
  );

  const invalid = await req('PATCH', '/api/users/me', {
    token: berk.token,
    body: { purposes: ['yuruyus', 'olmayan_secenek'] },
  });
  check('Geçersiz seçenek reddedilir', invalid.status === 400, invalid.body);

  const cleared = await req('PATCH', '/api/users/me', {
    token: cem.token,
    body: { purposes: [] },
  });
  check(
    'Boş liste seçimi temizler',
    cleared.body.user.purposes.length === 0 && cleared.body.user.purpose === null,
    cleared.body.user
  );

  // Eski istemci uyumluluğu: tek değerli alan hâlâ kabul edilir.
  const legacy = await req('PATCH', '/api/users/me', {
    token: cem.token,
    body: { purpose: 'sosyal' },
  });
  check(
    'Eski tek değerli istek çoklu yapıya yazılır',
    JSON.stringify(legacy.body.user.purposes) === JSON.stringify(['sosyal']),
    legacy.body.user.purposes
  );

  // Migration senaryosu: yalnızca eski kolonu dolu bir satır.
  const legacyId = newId();
  const ts = nowMs();
  await getDb().exec(
    `INSERT INTO users (id, email, password_hash, provider, name, district, bio, purpose,
                        terms_accepted_at, privacy_accepted_at, created_at, updated_at)
     VALUES ($1, $2, NULL, 'email', 'Eski', 'Kadıköy', '', 'egitim', $3, $3, $3, $3)`,
    [legacyId, `eski${stamp}@test.com`, ts]
  );
  const legacyRow = await req('GET', `/api/users/${legacyId}`, { token: ada.token });
  check(
    'Sadece eski kolonu dolu kayıt çoklu yapıda okunur',
    JSON.stringify(legacyRow.body.user.purposes) === JSON.stringify(['egitim']),
    legacyRow.body.user
  );

  // ------------------------------------------------------------------
  section('2. Uyum skoru çoklu seçimle çalışır');

  await req('POST', '/api/dogs', {
    token: ada.token,
    body: { name: 'Zeytin', size: 'orta', energy: 'dengeli', sociability: 'sosyal' },
  });
  await req('POST', '/api/dogs', {
    token: berk.token,
    body: { name: 'Kömür', size: 'orta', energy: 'dengeli', sociability: 'sosyal' },
  });

  // Ada: yuruyus, oyun, etkinlik — Berk: oyun, sosyal → ortak "oyun"
  const overlap = await req('GET', `/api/users/${berk.id}`, { token: ada.token });
  const purposeFactor = overlap.body.matches?.[0]?.factors?.find((f: any) => f.key === 'purpose');
  check('Uyum kırılımında kullanım amacı var', Boolean(purposeFactor), overlap.body.matches?.[0]);
  check(
    'Ortak seçenek varsa tam puan verilir',
    purposeFactor?.points === purposeFactor?.max,
    purposeFactor
  );
  check(
    'Açıklama ortak başlığı adlandırır',
    typeof purposeFactor?.note === 'string' && purposeFactor.note.includes('oyun'),
    purposeFactor?.note
  );

  await req('PATCH', '/api/users/me', { token: berk.token, body: { purposes: ['egitim'] } });
  const noOverlap = await req('GET', `/api/users/${berk.id}`, { token: ada.token });
  const noOverlapFactor = noOverlap.body.matches?.[0]?.factors?.find(
    (f: any) => f.key === 'purpose'
  );
  check(
    'Ortak seçenek yoksa puan düşer ama sıfırlanmaz',
    noOverlapFactor?.points > 0 && noOverlapFactor?.points < noOverlapFactor?.max,
    noOverlapFactor
  );

  await req('PATCH', '/api/users/me', {
    token: berk.token,
    body: { purposes: ['oyun', 'sosyal'] },
  });

  // ------------------------------------------------------------------
  section('3. Bildirim türleri');

  const types = await req('GET', '/api/safety/alert-types');
  check('Tür listesi oturumsuz erişilebilir', types.status === 200);
  const values = (types.body.types as any[]).map((t) => t.value);
  const expected = [
    'kayip_hayvan',
    'bulunan_hayvan',
    'zehirli_yem',
    'yarali_hayvan',
    'salgin_hastalik',
    'acil_kan',
    'gecici_yuva',
    'destek',
  ];
  check('Sekiz bildirim türü tanımlı', values.length === 8, values);
  check('İstenen türlerin hepsi var', expected.every((v) => values.includes(v)), values);
  check('En fazla fotoğraf sayısı 5', types.body.maxPhotos === 5, types.body.maxPhotos);

  // ------------------------------------------------------------------
  section('4. Kayıp köpek ilanı');

  const photo1 = await upload(ada.token, 'alert_photo');
  const photo2 = await upload(ada.token, 'alert_photo');
  check('Bildirim fotoğrafı yüklenebilir', photo1.status === 201, photo1.body);

  const missingPhoto = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'kayip_hayvan',
      animalName: 'Zeytin',
      district: 'Kadıköy',
      areaNote: 'Yoğurtçu Parkı civarı',
      occurredAt: nowMs() - 2 * 60 * 60 * 1000,
      description: 'Kahverengi tasması vardı, ürkek bir köpek. Gören olursa haber versin.',
    },
  });
  check('Fotoğrafsız kayıp ilanı reddedilir', missingPhoto.status === 400, missingPhoto.body);

  const missingName = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'kayip_hayvan',
      district: 'Kadıköy',
      occurredAt: nowMs() - 3600_000,
      description: 'Kahverengi tasması vardı, ürkek bir köpek. Gören olursa haber versin.',
      photoKeys: [photo1.body.key],
    },
  });
  check('Adsız kayıp ilanı reddedilir', missingName.status === 400, missingName.body);

  const missingTime = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'kayip_hayvan',
      animalName: 'Zeytin',
      district: 'Kadıköy',
      description: 'Kahverengi tasması vardı, ürkek bir köpek. Gören olursa haber versin.',
      photoKeys: [photo1.body.key],
    },
  });
  check('Son görülme zamanı olmadan reddedilir', missingTime.status === 400, missingTime.body);

  const future = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'kayip_hayvan',
      animalName: 'Zeytin',
      district: 'Kadıköy',
      occurredAt: nowMs() + 5 * DAY,
      description: 'Kahverengi tasması vardı, ürkek bir köpek. Gören olursa haber versin.',
      photoKeys: [photo1.body.key],
    },
  });
  check('Gelecek tarihli son görülme reddedilir', future.status === 400, future.body);

  const tooOld = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'kayip_hayvan',
      animalName: 'Zeytin',
      district: 'Kadıköy',
      occurredAt: nowMs() - 200 * DAY,
      description: 'Kahverengi tasması vardı, ürkek bir köpek. Gören olursa haber versin.',
      photoKeys: [photo1.body.key],
    },
  });
  check('90 günden eski son görülme reddedilir', tooOld.status === 400, tooOld.body);

  const stolenPhoto = await upload(cem.token, 'alert_photo');
  const notMine = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'kayip_hayvan',
      animalName: 'Zeytin',
      district: 'Kadıköy',
      occurredAt: nowMs() - 3600_000,
      description: 'Kahverengi tasması vardı, ürkek bir köpek. Gören olursa haber versin.',
      photoKeys: [stolenPhoto.body.key],
    },
  });
  check('Başkasının fotoğrafı kullanılamaz', notMine.status === 403, notMine.body);

  const tooManyKeys = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'kayip_hayvan',
      animalName: 'Zeytin',
      district: 'Kadıköy',
      occurredAt: nowMs() - 3600_000,
      description: 'Kahverengi tasması vardı, ürkek bir köpek. Gören olursa haber versin.',
      photoKeys: [1, 2, 3, 4, 5, 6].map(() => photo1.body.key),
    },
  });
  check('5’ten fazla fotoğraf reddedilir', tooManyKeys.status === 400, tooManyKeys.body);

  sentPush.length = 0;
  // Berk aynı semtte ve bildirimi almalı.
  await req('POST', '/api/push/tokens', {
    token: berk.token,
    body: { token: 'ExponentPushToken[berk-alerts]', platform: 'ios' },
  });

  const lost = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'kayip_hayvan',
      animalName: 'Zeytin',
      district: 'Kadıköy',
      areaNote: 'Yoğurtçu Parkı civarı',
      occurredAt: nowMs() - 2 * 60 * 60 * 1000,
      description: 'Kahverengi tasması vardı, ürkek bir köpek. Gören olursa haber versin.',
      photoKeys: [photo1.body.key, photo2.body.key],
    },
  });
  check('Kayıp ilanı oluşturulur', lost.status === 201, lost.body);
  check('İki fotoğraf da döner', lost.body.alert.photos.length === 2, lost.body.alert.photos);
  check('Hayvanın adı döner', lost.body.alert.animalName === 'Zeytin');
  check('Yaklaşık bölge döner', lost.body.alert.areaNote === 'Yoğurtçu Parkı civarı');
  check('Son görülme zamanı döner', typeof lost.body.alert.occurredAt === 'number');
  check('İlan sahibi işaretlenir', lost.body.alert.isOwner === true);
  check(
    'Mesajlaşma için ilan sahibi kimliği döner',
    lost.body.alert.author?.id === ada.id,
    lost.body.alert.author
  );
  check(
    'Yanıtta kesin konum alanı yok',
    !('latitude' in lost.body.alert) && !('address' in lost.body.alert),
    Object.keys(lost.body.alert)
  );
  check(
    'Aynı semtteki kullanıcıya bildirim gider',
    sentPush.some((p) => p.tokens.includes('ExponentPushToken[berk-alerts]')),
    sentPush
  );
  check(
    'Bildirim başlığı tür ve semti içerir',
    sentPush.some((p) => p.title.includes('Kayıp hayvan') && p.title.includes('Kadıköy')),
    sentPush.map((p) => p.title)
  );

  // ------------------------------------------------------------------
  section('5. Kesin konum toplanmaz');

  const coords = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'zehirli_yem',
      district: 'Kadıköy',
      areaNote: '41.0082, 28.9784',
      occurredAt: nowMs() - 3600_000,
      description: 'Parkta şüpheli yem gördük, dikkatli olun.',
    },
  });
  check('Koordinat içeren bölge reddedilir', coords.status === 400, coords.body);
  check('Hata kodu açık', coords.body?.error?.code === 'exact_location_not_allowed', coords.body);

  const addressLike = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'zehirli_yem',
      district: 'Kadıköy',
      areaNote: 'Moda Cad. No: 42 Daire 3',
      occurredAt: nowMs() - 3600_000,
      description: 'Parkta şüpheli yem gördük, dikkatli olun.',
    },
  });
  check('Kapı/daire numarası reddedilir', addressLike.status === 400, addressLike.body);

  const mapLink = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'zehirli_yem',
      district: 'Kadıköy',
      occurredAt: nowMs() - 3600_000,
      description: 'Şüpheli yem burada: https://maps.app.goo.gl/abc123 dikkatli olun.',
    },
  });
  check('Açıklamadaki harita bağlantısı reddedilir', mapLink.status === 400, mapLink.body);

  const approximate = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'zehirli_yem',
      district: 'Kadıköy',
      areaNote: 'Moda sahil yürüyüş yolu civarı',
      occurredAt: nowMs() - 3600_000,
      description: 'Açıkta bırakılmış şüpheli yem gördük, köpeğinizi yerden bir şey yemesin.',
    },
  });
  check('Yaklaşık tarif kabul edilir', approximate.status === 201, approximate.body);

  // ------------------------------------------------------------------
  section('6. Diğer bildirim türleri');

  const withoutPhoto = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: {
      type: 'acil_kan',
      animalName: 'Duman',
      district: 'Kadıköy',
      description: 'Ameliyat için acil kan ihtiyacı var, uygun bağışçı arıyoruz.',
    },
  });
  check('Fotoğraf zorunlu olmayan tür fotoğrafsız açılır', withoutPhoto.status === 201, withoutPhoto.body);

  const shortDescription = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: { type: 'destek', district: 'Kadıköy', description: 'kısa' },
  });
  check('Çok kısa açıklama reddedilir', shortDescription.status === 400, shortDescription.body);

  const badType = await req('POST', '/api/safety/alerts', {
    token: ada.token,
    body: { type: 'olmayan_tur', district: 'Kadıköy', description: 'Yeterince uzun bir açıklama.' },
  });
  check('Geçersiz tür reddedilir', badType.status === 400, badType.body);

  // ------------------------------------------------------------------
  section('7. Listeleme, filtreleme ve yetki');

  const all = await req('GET', '/api/safety/alerts', { token: berk.token });
  check('Bildirimler listelenir', all.status === 200 && all.body.alerts.length >= 3, all.body);
  check(
    'En yeni ilan başta',
    all.body.alerts[0].createdAt >= all.body.alerts[all.body.alerts.length - 1].createdAt
  );

  const filtered = await req('GET', '/api/safety/alerts?type=kayip_hayvan', { token: berk.token });
  check(
    'Türe göre filtre çalışır',
    filtered.body.alerts.length >= 1 &&
      filtered.body.alerts.every((a: any) => a.type === 'kayip_hayvan'),
    filtered.body.alerts.map((a: any) => a.type)
  );

  const otherDistrict = await req('GET', '/api/safety/alerts?district=Beşiktaş', {
    token: berk.token,
  });
  check('Semte göre filtre çalışır', otherDistrict.body.alerts.length === 0, otherDistrict.body);

  const mine = await req('GET', '/api/safety/alerts?scope=mine', { token: berk.token });
  check('Kendi ilanlarım filtresi çalışır', mine.body.alerts.length === 0, mine.body);

  const notOwner = await req('GET', `/api/safety/alerts/${lost.body.alert.id}`, {
    token: berk.token,
  });
  check('Başka kullanıcı ilanı görebilir', notOwner.status === 200);
  check('Başkası için isOwner false', notOwner.body.alert.isOwner === false);

  const cannotResolve = await req('PATCH', `/api/safety/alerts/${lost.body.alert.id}`, {
    token: berk.token,
    body: { status: 'resolved' },
  });
  check('Sahibi olmayan ilanı kapatamaz', cannotResolve.status === 403, cannotResolve.body);

  const cannotDelete = await req('DELETE', `/api/safety/alerts/${lost.body.alert.id}`, {
    token: berk.token,
  });
  check('Sahibi olmayan ilanı silemez', cannotDelete.status === 403, cannotDelete.body);

  const anon = await req('GET', '/api/safety/alerts');
  check('Oturumsuz liste erişimi reddedilir', anon.status === 401);

  // ------------------------------------------------------------------
  section('8. İlan sahibiyle uygulama içi mesajlaşma');

  const conversation = await req('POST', '/api/messages/conversations', {
    token: berk.token,
    body: { userId: lost.body.alert.author.id },
  });
  check('İlan sahibiyle sohbet açılır', conversation.status === 201 || conversation.status === 200, conversation.body);

  const message = await req(
    'POST',
    `/api/messages/conversations/${conversation.body.conversation.id}/messages`,
    { token: berk.token, body: { body: 'Zeytin’i sabah parkta gördüm sanırım.' } }
  );
  check('İlan üzerinden mesaj gönderilir', message.status === 201, message.body);

  // ------------------------------------------------------------------
  section('9. Şikâyet, engelleme ve yaşam döngüsü');

  const reported = await req('POST', '/api/safety/reports', {
    token: berk.token,
    body: { targetType: 'alert', targetId: lost.body.alert.id, reason: 'spam' },
  });
  check('Bildirim şikâyet edilebilir', reported.status === 201, reported.body);

  const badReport = await req('POST', '/api/safety/reports', {
    token: berk.token,
    body: { targetType: 'alert', targetId: 'olmayan-id', reason: 'spam' },
  });
  check('Olmayan bildirim şikâyeti reddedilir', badReport.status === 404, badReport.body);

  await req('POST', '/api/safety/blocks', { token: berk.token, body: { userId: ada.id } });
  const afterBlock = await req('GET', '/api/safety/alerts', { token: berk.token });
  check(
    'Engellenen kullanıcının ilanları listede görünmez',
    afterBlock.body.alerts.every((a: any) => a.author?.id !== ada.id),
    afterBlock.body.alerts.map((a: any) => a.author?.id)
  );
  const blockedDetail = await req('GET', `/api/safety/alerts/${lost.body.alert.id}`, {
    token: berk.token,
  });
  check('Engellenen kullanıcının ilan detayı 404 döner', blockedDetail.status === 404);
  await req('DELETE', `/api/safety/blocks/${ada.id}`, { token: berk.token });

  const resolved = await req('PATCH', `/api/safety/alerts/${lost.body.alert.id}`, {
    token: ada.token,
    body: { status: 'resolved' },
  });
  check('Sahibi ilanı çözüldü olarak işaretler', resolved.body.alert.status === 'resolved', resolved.body);

  const activeList = await req('GET', '/api/safety/alerts', { token: berk.token });
  check(
    'Çözülen ilan varsayılan listede görünmez',
    activeList.body.alerts.every((a: any) => a.id !== lost.body.alert.id)
  );

  const resolvedList = await req('GET', '/api/safety/alerts?status=resolved', {
    token: berk.token,
  });
  check(
    'Çözülen ilanlar ayrı filtreyle görülür',
    resolvedList.body.alerts.some((a: any) => a.id === lost.body.alert.id)
  );

  // Fotoğraf silinince ilan fotoğrafı da düşer.
  await req('DELETE', `/api/media/${photo1.body.mediaId}`, { token: ada.token });
  const afterPhotoDelete = await req('GET', `/api/safety/alerts/${lost.body.alert.id}`, {
    token: ada.token,
  });
  check(
    'Silinen fotoğraf ilandan da kalkar',
    afterPhotoDelete.body.alert.photos.length === 1,
    afterPhotoDelete.body.alert.photos
  );

  const removed = await req('DELETE', `/api/safety/alerts/${lost.body.alert.id}`, {
    token: ada.token,
  });
  check('Sahibi ilanı kaldırır', removed.status === 200, removed.body);

  const afterRemove = await req('GET', `/api/safety/alerts/${lost.body.alert.id}`, {
    token: ada.token,
  });
  check('Kaldırılan ilan 404 döner', afterRemove.status === 404);

  // ------------------------------------------------------------------
  section('10. Moderasyon');

  const modAlert = await req('POST', '/api/safety/alerts', {
    token: cem.token,
    body: {
      type: 'gecici_yuva',
      district: 'Beşiktaş',
      description: 'Geçici yuva arayan uysal bir köpek için ilan açıyoruz.',
      photoKeys: [stolenPhoto.body.key],
    },
  });
  check('Moderasyon için ilan hazırlandı', modAlert.status === 201, modAlert.body);

  await req('POST', '/api/safety/reports', {
    token: ada.token,
    body: { targetType: 'alert', targetId: modAlert.body.alert.id, reason: 'uygunsuz_icerik' },
  });

  const reportList = await req('GET', '/api/admin/reports?status=open', {
    adminToken: 'alerts-admin-token',
  });
  const alertReport = (reportList.body.reports as any[]).find(
    (r) => r.target_id === modAlert.body.alert.id
  );
  check('Bildirim şikâyeti panelde listelenir', Boolean(alertReport), reportList.body);
  check(
    'Şikâyet edilen bildirim tanınabilir bir etiketle görünür',
    Boolean(alertReport?.target_label),
    alertReport
  );

  const modRemove = await req('PATCH', `/api/admin/alerts/${modAlert.body.alert.id}`, {
    adminToken: 'alerts-admin-token',
    body: { status: 'removed', note: 'kural ihlali' },
  });
  check('Moderatör bildirimi kaldırır', modRemove.status === 200, modRemove.body);

  const modGone = await req('GET', `/api/safety/alerts/${modAlert.body.alert.id}`, {
    token: cem.token,
  });
  check('Moderasyonla kaldırılan bildirim 404 döner', modGone.status === 404);

  const modMissing = await req('PATCH', '/api/admin/alerts/olmayan-id', {
    adminToken: 'alerts-admin-token',
    body: { status: 'removed' },
  });
  check('Olmayan bildirimin moderasyonu 404 döner', modMissing.status === 404, modMissing.body);

  const modNoToken = await req('PATCH', `/api/admin/alerts/${modAlert.body.alert.id}`, {
    body: { status: 'active' },
  });
  check('Anahtarsız moderasyon reddedilir', modNoToken.status === 403, modNoToken.body);

  // ------------------------------------------------------------------
  section('11. Eski kayıp ilanlarının birleşik yapıya taşınması');

  const db = getDb();
  const MERGE_MIGRATION = '0009_merge_lost_dog_posts_into_alerts';

  // Ada'nın köpeğini (fotoğraflı) ve fotoğrafsız ikinci bir köpeği hazırla.
  const adaDogs = await req('GET', '/api/dogs', { token: ada.token });
  const adaDogId = adaDogs.body.dogs[0].id as string;
  const legacyPhoto = await upload(ada.token, 'dog_photo');
  await db.exec('UPDATE dogs SET photo_url = $1 WHERE id = $2', [legacyPhoto.body.key, adaDogId]);

  const berkDogs = await req('GET', '/api/dogs', { token: berk.token });
  const berkDogId = berkDogs.body.dogs[0].id as string;
  await db.exec('UPDATE dogs SET photo_url = NULL WHERE id = $1', [berkDogId]);

  const legacyTs = nowMs() - 5 * DAY;
  const activePostId = newId();
  const foundPostId = newId();
  const noPhotoPostId = newId();

  await db.exec(
    `INSERT INTO lost_dog_posts
       (id, owner_id, dog_id, district, last_seen_area, details, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'Kadıköy', 'Moda sahili civarı', 'Kırmızı tasmalı, ürkek.', 'active', $4, $4)`,
    [activePostId, ada.id, adaDogId, legacyTs]
  );
  await db.exec(
    `INSERT INTO lost_dog_posts
       (id, owner_id, dog_id, district, last_seen_area, details, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'Kadıköy', 'Bahariye civarı', 'Bulundu, teşekkürler.', 'found', $4, $4)`,
    [foundPostId, ada.id, adaDogId, legacyTs]
  );
  await db.exec(
    `INSERT INTO lost_dog_posts
       (id, owner_id, dog_id, district, last_seen_area, details, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'Kadıköy', 'Park çevresi', '', 'active', $4, $4)`,
    [noPhotoPostId, berk.id, berkDogId, legacyTs]
  );

  /** Geçişi yeniden çalıştırır (migration kaydını silerek). */
  async function rerunMerge(): Promise<void> {
    await db.exec('DELETE FROM schema_migrations WHERE id = $1', [MERGE_MIGRATION]);
    await runMigrations(db);
  }

  await rerunMerge();

  const migrated = await db.query<any>(
    'SELECT * FROM community_alerts WHERE source_lost_dog_id IS NOT NULL ORDER BY created_at'
  );
  check('Üç eski ilanın hepsi taşındı', migrated.length === 3, migrated.length);

  const movedActive = migrated.find((row: any) => row.source_lost_dog_id === activePostId);
  check('Taşınan ilan kayıp hayvan türünde', movedActive?.type === 'kayip_hayvan', movedActive);
  check('Köpeğin adı korundu', movedActive?.animal_name === 'Zeytin', movedActive?.animal_name);
  check('Semt korundu', movedActive?.district === 'Kadıköy');
  check(
    'Son görülen yaklaşık bölge korundu',
    movedActive?.area_note === 'Moda sahili civarı',
    movedActive?.area_note
  );
  check(
    'Açıklama korundu',
    movedActive?.description === 'Kırmızı tasmalı, ürkek.',
    movedActive?.description
  );
  check('İlan sahibi korundu (mesajlaşma bağlantısı)', movedActive?.author_id === ada.id);
  check('Oluşturulma zamanı korundu', movedActive?.created_at === legacyTs, movedActive?.created_at);
  check('Son görülme zamanı dolduruldu', movedActive?.occurred_at === legacyTs);

  const movedFound = migrated.find((row: any) => row.source_lost_dog_id === foundPostId);
  check('Bulunan ilan çözüldü olarak taşındı', movedFound?.status === 'resolved', movedFound?.status);

  const movedPhotos = await db.query<any>(
    'SELECT * FROM community_alert_photos WHERE alert_id = $1',
    [movedActive?.id]
  );
  check(
    'Köpeğin profil fotoğrafı ilana taşındı',
    movedPhotos.length === 1 && movedPhotos[0].storage_key === legacyPhoto.body.key,
    movedPhotos
  );

  const movedNoPhoto = migrated.find((row: any) => row.source_lost_dog_id === noPhotoPostId);
  const noPhotoRows = await db.query<any>(
    'SELECT * FROM community_alert_photos WHERE alert_id = $1',
    [movedNoPhoto?.id]
  );
  check('Fotoğrafsız köpek ilanı da taşındı', Boolean(movedNoPhoto), movedNoPhoto);
  check('Fotoğrafsız ilanda boş fotoğraf kaydı oluşmadı', noPhotoRows.length === 0, noPhotoRows);

  check(
    'Kaynak tablo silinmedi (geri dönüş güvencesi)',
    (await db.query<any>('SELECT id FROM lost_dog_posts')).length === 3
  );

  // Tekrar çalıştırma: ne çift kayıt ne veri kaybı.
  await rerunMerge();
  await rerunMerge();

  const afterRerun = await db.query<any>(
    'SELECT * FROM community_alerts WHERE source_lost_dog_id IS NOT NULL'
  );
  check('Geçiş tekrar çalışınca çift kayıt oluşmaz', afterRerun.length === 3, afterRerun.length);

  const photosAfterRerun = await db.query<any>(
    'SELECT * FROM community_alert_photos WHERE alert_id = $1',
    [movedActive?.id]
  );
  check(
    'Geçiş tekrar çalışınca fotoğraf çiftlenmez',
    photosAfterRerun.length === 1,
    photosAfterRerun.length
  );

  const idsAfter = afterRerun.map((row: any) => row.id).sort();
  const idsBefore = migrated.map((row: any) => row.id).sort();
  check(
    'Tekrar çalıştırma mevcut kayıtların kimliğini değiştirmez',
    JSON.stringify(idsAfter) === JSON.stringify(idsBefore),
    { idsBefore, idsAfter }
  );

  // Taşınan ilan yeni ekranda görünür ve sahibiyle mesajlaşılabilir.
  const migratedDetail = await req('GET', `/api/safety/alerts/${movedActive?.id}`, {
    token: berk.token,
  });
  check('Taşınan ilan yeni uçtan okunur', migratedDetail.status === 200, migratedDetail.body);
  check(
    'Taşınan ilanın sahibi mesajlaşma için dönüyor',
    migratedDetail.body.alert.author?.id === ada.id,
    migratedDetail.body.alert.author
  );
  check(
    'Taşınan ilanda köpeğin fotoğrafı görünüyor',
    migratedDetail.body.alert.photos.length === 1,
    migratedDetail.body.alert.photos
  );
  check(
    'Kaynak kaydın kimliği izlenebilir',
    migratedDetail.body.alert.sourceLostDogId === activePostId,
    migratedDetail.body.alert.sourceLostDogId
  );

  // ------------------------------------------------------------------
  section('12. Eski uçların geriye uyumluluğu');

  const legacyList = await req('GET', '/api/community/lost-dogs?district=Kadıköy', {
    token: berk.token,
  });
  check('Eski liste ucu çalışmaya devam ediyor', legacyList.status === 200, legacyList.body);
  check(
    'Eski liste birleşik veriden besleniyor',
    legacyList.body.posts.some((p: any) => p.id === movedActive?.id),
    legacyList.body.posts?.length
  );
  check('Eski uç kullanımdan kaldırıldığını bildiriyor', legacyList.body.deprecated === true);

  const legacyCountBefore = (
    await db.query<any>('SELECT id FROM lost_dog_posts')
  ).length;

  const legacyCreate = await req('POST', '/api/community/lost-dogs', {
    token: ada.token,
    body: {
      dogId: adaDogId,
      district: 'Kadıköy',
      lastSeenArea: 'Yoğurtçu Parkı civarı',
      details: 'Eski istemciden açılan ilan.',
    },
  });
  check('Eski oluşturma ucu çalışıyor', legacyCreate.status === 201, legacyCreate.body);

  const createdViaLegacy = await req('GET', `/api/safety/alerts/${legacyCreate.body.id}`, {
    token: berk.token,
  });
  check(
    'Eski uçtan açılan ilan birleşik yapıda',
    createdViaLegacy.status === 200 && createdViaLegacy.body.alert.type === 'kayip_hayvan',
    createdViaLegacy.body
  );
  check(
    'Eski uçtan açılan ilanda köpeğin adı ve fotoğrafı var',
    createdViaLegacy.body.alert.animalName === 'Zeytin' &&
      createdViaLegacy.body.alert.photos.length === 1,
    createdViaLegacy.body.alert
  );
  check(
    'Eski uç artık eski tabloya yazmıyor',
    (await db.query<any>('SELECT id FROM lost_dog_posts')).length === legacyCountBefore,
    legacyCountBefore
  );

  const legacyFound = await req('POST', `/api/community/lost-dogs/${activePostId}/found`, {
    token: ada.token,
  });
  check('Eski kapatma ucu eski kimlikle çalışıyor', legacyFound.status === 200, legacyFound.body);
  const closed = await db.one<any>('SELECT status FROM community_alerts WHERE id = $1', [
    movedActive?.id,
  ]);
  check('Eski kimlikle kapatma birleşik kaydı çözüldü yapıyor', closed?.status === 'resolved', closed);

  const summary = await req('GET', '/api/community/area-summary', { token: berk.token });
  check('Bölge özeti çalışıyor', summary.status === 200, summary.body);
  check(
    'Özet birleşik bildirimleri sayıyor',
    typeof summary.body.activeAlerts === 'number' &&
      typeof summary.body.lostDogAlerts === 'number',
    summary.body
  );
  check(
    'Özet kesin konum döndürmüyor',
    !('latitude' in summary.body) && !('coordinates' in summary.body),
    Object.keys(summary.body)
  );

  // `egitim` eski veride geçerli kalmalı (yeni arayüzde gösterilmese de).
  const legacyPurpose = await req('PATCH', '/api/users/me', {
    token: berk.token,
    body: { purposes: ['egitim', 'oyun'] },
  });
  check(
    'Eski `egitim` değeri API tarafından kabul edilmeye devam ediyor',
    legacyPurpose.status === 200 &&
      legacyPurpose.body.user.purposes.includes('egitim'),
    legacyPurpose.body.user?.purposes
  );

  // ------------------------------------------------------------------
  section('13. Etkinlik sonrası güven değerlendirmesi');

  const pastEventId = newId();
  const pastTs = nowMs() - 2 * DAY;
  await db.exec(
    `INSERT INTO events
       (id, owner_id, title, type, starts_at, district, meeting_point, capacity, dog_size,
        description, rules, created_at, updated_at)
     VALUES ($1, $2, 'Geçmiş yürüyüş', 'yuruyus', $3, 'Kadıköy', 'Park girişi', 10, 'hepsi',
             '', '', $3, $3)`,
    [pastEventId, ada.id, pastTs]
  );

  const notParticipant = await req('POST', `/api/community/events/${pastEventId}/review`, {
    token: berk.token,
    body: { rating: 5, feltSafe: true },
  });
  check('Katılmayan kullanıcı değerlendiremez', notParticipant.status === 400, notParticipant.body);

  await db.exec(
    'INSERT INTO event_participants (id, event_id, user_id, created_at) VALUES ($1, $2, $3, $4)',
    [newId(), pastEventId, berk.id, pastTs]
  );

  const review = await req('POST', `/api/community/events/${pastEventId}/review`, {
    token: berk.token,
    body: { rating: 4, feltSafe: true, comment: 'Düzenli ve güvenliydi.' },
  });
  check('Katılımcı değerlendirme gönderebiliyor', review.status === 201, review.body);

  const reviewAgain = await req('POST', `/api/community/events/${pastEventId}/review`, {
    token: berk.token,
    body: { rating: 5, feltSafe: false, comment: 'Fikrimi değiştirdim.' },
  });
  check('Tekrar gönderim çift kayıt oluşturmaz', reviewAgain.status === 201, reviewAgain.body);
  const reviewRows = await db.query<any>(
    'SELECT * FROM event_reviews WHERE event_id = $1 AND reviewer_id = $2',
    [pastEventId, berk.id]
  );
  check('Değerlendirme tek satır olarak güncellendi', reviewRows.length === 1, reviewRows.length);
  check('Güncellenen değer kaydedildi', reviewRows[0]?.rating === 5, reviewRows[0]);

  const savedReview = await req('GET', `/api/community/events/${pastEventId}/review`, {
    token: berk.token,
  });
  check(
    'Kendi değerlendirmesi okunabiliyor',
    savedReview.body.review?.rating === 5 && savedReview.body.review?.feltSafe === false,
    savedReview.body
  );

  const futureEvent = await req('POST', '/api/events', {
    token: ada.token,
    body: {
      title: 'Gelecek yürüyüş',
      type: 'yuruyus',
      startsAt: nowMs() + 3 * DAY,
      district: 'Kadıköy',
      meetingPoint: 'Park girişi',
      capacity: 5,
    },
  });
  const futureReview = await req(
    'POST',
    `/api/community/events/${futureEvent.body.event.id}/review`,
    { token: ada.token, body: { rating: 5, feltSafe: true } }
  );
  check('Bitmemiş etkinlik değerlendirilemez', futureReview.status === 400, futureReview.body);

  // Hesap silindiğinde ilanlar da gider (ON DELETE CASCADE + hesap kapatma).
  server.close();
  await getDb().close();
  fs.rmSync(uploadDir, { recursive: true, force: true });

  console.log(`\n${'='.repeat(48)}`);
  console.log(`Toplam: ${passed + failed}  |  Geçen: ${passed}  |  Başarısız: ${failed}`);
  console.log('='.repeat(48));

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Bildirim testi çöktü:', error);
  process.exit(1);
});
