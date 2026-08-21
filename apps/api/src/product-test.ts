/**
 * Canlı Yürüyüş, Köpeğimin Günlüğü, Mahalle Akışı ve analitik testleri.
 *
 *   npm run test:product
 *
 * Varsayılan gömülü PostgreSQL (PGlite); TEST_DATABASE_URL verilirse gerçek
 * PostgreSQL üzerinde aynı testler çalışır.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patimeet-product-'));

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  delete process.env.DATABASE_URL;
  process.env.PGLITE_DATA_DIR = 'memory';
}
process.env.PORT = '0';
process.env.JWT_SECRET = 'product-test-secret';
process.env.ADMIN_TOKEN = 'product-admin-token';
process.env.ADMIN_SESSION_SECRET = 'product-admin-session';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = uploadDir;
process.env.PUSH_DRIVER = 'none';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';

const { createApp } = require('./app') as typeof import('./app');
const { getDb, runMigrations, nowMs } = require('./db') as typeof import('./db');
const { setPushSender } = require('./domain/push') as typeof import('./domain/push');
const walks = require('./domain/walks') as typeof import('./domain/walks');
const analytics = require('./domain/analytics') as typeof import('./domain/analytics');

setPushSender({
  driver: 'none',
  async send(tokens) {
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

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]),
  Buffer.alloc(64, 0x20),
  Buffer.from([0xff, 0xd9]),
]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20), Buffer.from('\n%%EOF')]);

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60_000;

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

  async function upload(token: string, purpose: string, data: Buffer, type: string) {
    const response = await fetch(`${base}/api/media/${purpose}`, {
      method: 'POST',
      headers: { 'content-type': type, authorization: `Bearer ${token}` },
      body: new Uint8Array(data),
    });
    return { status: response.status, body: (await response.json()) as any };
  }

  const stamp = Date.now();

  async function registerUser(label: string, district: string) {
    const email = `${label}${stamp}@test.com`;
    const res = await req('POST', '/api/auth/register', {
      body: { email, password: 'sifre12345', acceptTerms: true, acceptPrivacy: true },
    });
    if (res.status !== 201) throw new Error(`${label}: ${JSON.stringify(res.body)}`);
    const token = res.body.token as string;
    await req('PATCH', '/api/users/me', {
      token,
      body: { name: label[0].toUpperCase() + label.slice(1), district },
    });
    const dog = await req('POST', '/api/dogs', {
      token,
      body: { name: `${label}-köpek`, size: 'orta', energy: 'dengeli', sociability: 'sosyal' },
    });
    return { email, token, id: res.body.user.id as string, dogId: dog.body.dog.id as string };
  }

  const ali = await registerUser('ali', 'Kadıköy');
  const beren = await registerUser('beren', 'Kadıköy');
  const ceren = await registerUser('ceren', 'Beşiktaş');

  // ------------------------------------------------------------------
  section('1. GPS süzme ve hesap birimleri');

  const d = walks.distanceMeters({ lat: 40.98, lng: 29.02 }, { lat: 40.99, lng: 29.02 });
  check('Mesafe hesabı gerçekçi', d > 1050 && d < 1160, d);

  const filtered = walks.filterPoints(null, [
    { lat: 40.9800, lng: 29.0200, accuracy: 8, recordedAt: 1000 },
    // Doğruluğu çok düşük — atılmalı.
    { lat: 40.9801, lng: 29.0201, accuracy: 500, recordedAt: 2000 },
    // Mikro titreme (< 3 m) — atılmalı.
    { lat: 40.98001, lng: 29.02001, accuracy: 8, recordedAt: 3000 },
    // Gerçek adım.
    { lat: 40.9805, lng: 29.0200, accuracy: 8, recordedAt: 10000 },
    // Fiziksel olarak imkânsız sıçrama — atılmalı.
    { lat: 41.5000, lng: 29.0200, accuracy: 8, recordedAt: 11000 },
  ]);
  check('Düşük doğruluklu nokta atılır', filtered.rejected.accuracy === 1, filtered.rejected);
  check('Titreme atılır', filtered.rejected.jitter === 1, filtered.rejected);
  check('Mantıksız sıçrama atılır', filtered.rejected.jump === 1, filtered.rejected);
  check('Yalnızca gerçek adımlar sayılır', filtered.accepted.length === 2, filtered.accepted.length);
  check('Mesafe yalnızca kabul edilenlerden gelir', filtered.addedMeters > 40 && filtered.addedMeters < 70, filtered.addedMeters);

  check('Çok kısa mesafede tempo hesaplanmaz', walks.paceSecondsPerKm(50, 60) === null);
  check('Tempo saniye/km olarak hesaplanır', walks.paceSecondsPerKm(1000, 360) === 360);

  const trimmed = walks.trimRoute([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true);
  check('Uçları gizlenen rota kırpılır', trimmed.length < 10 && trimmed[0] !== 1, trimmed);
  check('Uç gizleme kapalıyken rota tam', walks.trimRoute([1, 2, 3], false).length === 3);
  check('Kısa rota uç gizlemede tamamen gizlenir', walks.trimRoute([1, 2, 3], true).length === 0);

  // ------------------------------------------------------------------
  section('2. Canlı Yürüyüş akışı');

  const start = await req('POST', '/api/walks', {
    token: ali.token,
    body: { dogId: ali.dogId, district: 'Kadıköy', hideEndpoints: true },
  });
  check('Yürüyüş başlatılır', start.status === 201, start.body);
  const walkId = start.body.walk.id as string;

  const second = await req('POST', '/api/walks', { token: ali.token, body: {} });
  check('Aynı anda ikinci yürüyüş açılamaz', second.status === 409, second.body);

  /**
   * Sunucu, bildirilen süreyi yürüyüşün başlangıcından bu yana geçen gerçek
   * zamanla sınırlar (şişirmeye karşı). Gerçekçi bir senaryo için yürüyüşün
   * başlangıcını 10 dakika geriye alıyoruz.
   */
  const t0 = nowMs() - 10 * MIN;
  await getDb().exec('UPDATE walks SET started_at = $1 WHERE id = $2', [t0, walkId]);

  const points = await req('POST', `/api/walks/${walkId}/points`, {
    token: ali.token,
    body: {
      durationSeconds: 600,
      points: [
        { lat: 40.9800, lng: 29.0200, accuracy: 6, recordedAt: t0 },
        { lat: 40.9810, lng: 29.0200, accuracy: 6, recordedAt: t0 + 120_000 },
        { lat: 40.9820, lng: 29.0200, accuracy: 6, recordedAt: t0 + 240_000 },
        { lat: 40.9830, lng: 29.0200, accuracy: 6, recordedAt: t0 + 360_000 },
      ],
    },
  });
  check('Noktalar eklenir', points.status === 200, points.body);
  check('Mesafe gerçek koordinatlardan hesaplanır', points.body.walk.distanceMeters > 300, points.body.walk.distanceMeters);
  check('Tempo hesaplanır', typeof points.body.walk.paceSecondsPerKm === 'number', points.body.walk);
  check(
    'Kalori tahmin olarak işaretli alanda döner',
    typeof points.body.walk.estimatedCalories === 'number',
    points.body.walk.estimatedCalories
  );

  const inflated = await req('POST', `/api/walks/${walkId}/points`, {
    token: ali.token,
    body: {
      durationSeconds: 86400,
      points: [{ lat: 40.9840, lng: 29.0200, accuracy: 6, recordedAt: nowMs() }],
    },
  });
  check(
    'Süre geçen zamanla sınırlanır (şişirilemez)',
    inflated.body.walk.durationSeconds <= 11 * 60,
    inflated.body.walk.durationSeconds
  );

  const foreignPoints = await req('POST', `/api/walks/${walkId}/points`, {
    token: beren.token,
    body: { durationSeconds: 10, points: [{ lat: 41, lng: 29, recordedAt: nowMs() }] },
  });
  check('Başkası yürüyüşe nokta ekleyemez', foreignPoints.status === 403, foreignPoints.body);

  const foreignRoute = await req('GET', `/api/walks/${walkId}/route`, { token: beren.token });
  check('Başkası ham rotayı okuyamaz', foreignRoute.status === 403, foreignRoute.body);

  const ownRoute = await req('GET', `/api/walks/${walkId}/route`, { token: ali.token });
  check('Sahibi ham rotayı okur', ownRoute.status === 200 && ownRoute.body.points.length >= 4, ownRoute.body?.points?.length);

  const paused = await req('PATCH', `/api/walks/${walkId}`, {
    token: ali.token,
    body: { status: 'paused' },
  });
  check('Yürüyüş duraklatılır', paused.body.walk.status === 'paused', paused.body);

  const whilePaused = await req('POST', `/api/walks/${walkId}/points`, {
    token: ali.token,
    body: { durationSeconds: 10, points: [{ lat: 40.985, lng: 29.02, recordedAt: nowMs() }] },
  });
  check('Duraklatılmışken nokta eklenmez', whilePaused.status === 400, whilePaused.body);

  await req('PATCH', `/api/walks/${walkId}`, { token: ali.token, body: { status: 'active' } });

  // Kurtarma: uygulama kapansa da aktif yürüyüş geri alınır.
  const recovered = await req('GET', '/api/walks/active', { token: ali.token });
  check('Aktif yürüyüş kurtarılabilir', recovered.body.walk?.id === walkId, recovered.body.walk);
  check('Kurtarmada nokta sayısı bildirilir', recovered.body.pointCount >= 4, recovered.body.pointCount);
  check(
    'Kurtarılan özette uçlar gizli',
    recovered.body.walk.hideEndpoints === true,
    recovered.body.walk
  );

  // ------------------------------------------------------------------
  section('3. Süreli canlı konum paylaşımı');

  const noShare = await req('GET', `/api/walks/${walkId}/shared`, { token: beren.token });
  check('Paylaşım yokken canlı konum görünmez', noShare.status === 404, noShare.body);

  const share = await req('POST', `/api/walks/${walkId}/share`, {
    token: ali.token,
    body: { userId: beren.id, minutes: 30 },
  });
  check('Konum belirli kişiyle paylaşılır', share.status === 201, share.body);

  const shared = await req('GET', `/api/walks/${walkId}/shared`, { token: beren.token });
  check('Paylaşılan kişi canlı konumu görür', shared.status === 200, shared.body);
  check('Yalnızca son konum paylaşılır', Boolean(shared.body.lastPoint) && !('route' in shared.body), Object.keys(shared.body));

  const outsider = await req('GET', `/api/walks/${walkId}/shared`, { token: ceren.token });
  check('Üçüncü kişi paylaşımı göremez', outsider.status === 404, outsider.body);

  // Süresi geçmiş paylaşım kendiliğinden kapanır.
  await getDb().exec('UPDATE walk_shares SET expires_at = $1 WHERE walk_id = $2', [
    nowMs() - 1000,
    walkId,
  ]);
  const expiredShare = await req('GET', `/api/walks/${walkId}/shared`, { token: beren.token });
  check('Süresi dolan paylaşım kapanır', expiredShare.status === 404, expiredShare.body);

  await req('POST', `/api/walks/${walkId}/share`, {
    token: ali.token,
    body: { userId: beren.id, minutes: 30 },
  });
  await req('DELETE', `/api/walks/${walkId}/share`, { token: ali.token });
  const stopped = await req('GET', `/api/walks/${walkId}/shared`, { token: beren.token });
  check('Kullanıcı paylaşımı istediğinde durdurur', stopped.status === 404, stopped.body);

  // ------------------------------------------------------------------
  section('4. Yürüyüşü bitirme ve haftalık hedef');

  const walkPhoto = await upload(ali.token, 'walk_photo', JPEG, 'image/jpeg');
  const finish = await req('POST', `/api/walks/${walkId}/finish`, {
    token: ali.token,
    body: { durationSeconds: 900, note: 'Sahilde güzel bir tur.', photoUrl: walkPhoto.body.key },
  });
  check('Yürüyüş tamamlanır', finish.body.walk.status === 'completed', finish.body);
  check('Özette rota uçları gizli', Array.isArray(finish.body.walk.route), finish.body.walk.route?.length);
  check('Yürüyüş fotoğrafı kaydedilir', Boolean(finish.body.walk.photoUrl), finish.body.walk.photoUrl);

  const finishAgain = await req('POST', `/api/walks/${walkId}/finish`, { token: ali.token, body: {} });
  check('Biten yürüyüş tekrar bitirilemez', finishAgain.status === 400, finishAgain.body);

  const afterFinish = await req('GET', '/api/walks/active', { token: ali.token });
  check('Bitince aktif yürüyüş kalmaz', afterFinish.body.walk === null, afterFinish.body);

  const summary = await req('GET', '/api/walks/summary', { token: ali.token });
  /** 900 sn bildirildi ama yürüyüş 10 dk sürdü: sunucu doğru şekilde kırptı. */
  check('Haftalık özet gerçek veriden gelir', summary.body.weeklySeconds === 600, summary.body);
  check('Haftalık mesafe gerçek rotadan gelir', summary.body.weeklyMeters > 300, summary.body);
  check('Haftalık yürüyüş sayısı doğru', summary.body.weeklyWalks === 1, summary.body);

  const history = await req('GET', '/api/walks', { token: ali.token });
  check('Geçmiş yürüyüşler listelenir', history.body.walks.length === 1, history.body.walks?.length);

  const restart = await req('POST', '/api/walks', { token: ali.token, body: {} });
  check('Bitince yeni yürüyüş başlatılabilir', restart.status === 201, restart.body);
  await req('POST', `/api/walks/${restart.body.walk.id}/finish`, {
    token: ali.token,
    body: { cancel: true },
  });

  // ------------------------------------------------------------------
  section('5. Köpeğimin Günlüğü');

  const types = await req('GET', '/api/journal/types');
  const requiredTypes = [
    'asi', 'ic_parazit', 'dis_parazit', 'ilac', 'veteriner', 'saglik_notu', 'kilo', 'mama',
    'su', 'alerji', 'uyku', 'tuvalet', 'davranis', 'banyo', 'tirnak', 'dis', 'tuy',
  ];
  const typeValues = (types.body.types as any[]).map((t) => t.value);
  check(
    'İstenen 17 kayıt türünün hepsi tanımlı',
    requiredTypes.every((t) => typeValues.includes(t)),
    requiredTypes.filter((t) => !typeValues.includes(t))
  );
  check(
    'Kilo türünde sayısal alan tanımlı',
    Boolean(types.body.types.find((t: any) => t.value === 'kilo')?.numeric),
    types.body.types.find((t: any) => t.value === 'kilo')
  );

  const vaccine = await req('POST', '/api/journal/entries', {
    token: ali.token,
    body: {
      dogId: ali.dogId,
      type: 'asi',
      title: 'Karma aşı',
      occurredAt: nowMs() - 5 * DAY,
      remindAt: nowMs() + 30 * DAY,
      repeatIntervalDays: 365,
    },
  });
  check('Aşı kaydı ve hatırlatma oluşur', vaccine.status === 201, vaccine.body);
  check('Hatırlatma beklemede', vaccine.body.entry.reminderStatus === 'pending', vaccine.body.entry);

  const foreignDog = await req('POST', '/api/journal/entries', {
    token: beren.token,
    body: { dogId: ali.dogId, type: 'saglik_notu', occurredAt: nowMs() },
  });
  check('Başkasının köpeğine kayıt eklenemez', foreignDog.status === 404, foreignDog.body);

  const badWeight = await req('POST', '/api/journal/entries', {
    token: ali.token,
    body: { dogId: ali.dogId, type: 'kilo', occurredAt: nowMs(), value: 900 },
  });
  check('Gerçek dışı kilo reddedilir', badWeight.status === 400, badWeight.body);

  const badValueType = await req('POST', '/api/journal/entries', {
    token: ali.token,
    body: { dogId: ali.dogId, type: 'tuvalet', occurredAt: nowMs(), value: 5 },
  });
  check('Sayısal olmayan türde değer reddedilir', badValueType.status === 400, badValueType.body);

  const pastReminder = await req('POST', '/api/journal/entries', {
    token: ali.token,
    body: { dogId: ali.dogId, type: 'ilac', occurredAt: nowMs(), remindAt: nowMs() - 10 * DAY },
  });
  check('Geçmiş tarihli hatırlatma reddedilir', pastReminder.status === 400, pastReminder.body);

  for (const [days, value] of [[30, 12.4], [15, 12.9], [1, 13.2]] as const) {
    await req('POST', '/api/journal/entries', {
      token: ali.token,
      body: { dogId: ali.dogId, type: 'kilo', occurredAt: nowMs() - days * DAY, value },
    });
  }

  const overview = await req('GET', `/api/journal/${ali.dogId}/overview`, { token: ali.token });
  check('Genel görünüm yaklaşanları verir', overview.body.upcoming.length >= 1, overview.body.upcoming);
  check('Kilo serisi eskiden yeniye sıralı', overview.body.weightSeries[0].value === 12.4, overview.body.weightSeries);
  check('Son kilo en sonda', overview.body.weightSeries.at(-1).value === 13.2, overview.body.weightSeries);

  const foreignOverview = await req('GET', `/api/journal/${ali.dogId}/overview`, { token: beren.token });
  check('Başkası günlüğü göremez', foreignOverview.status === 404, foreignOverview.body);

  const done = await req('PATCH', `/api/journal/entries/${vaccine.body.entry.id}/reminder`, {
    token: ali.token,
    body: { status: 'done' },
  });
  check('Hatırlatma tamamlandı olur', done.body.entry.reminderStatus === 'done', done.body.entry);

  const reminders = await req('GET', '/api/journal/reminders', { token: ali.token });
  const repeated = (reminders.body.reminders as any[]).find((r) => r.type === 'asi');
  check('Tekrarlı bakım bir sonraki tarihe kurulur', Boolean(repeated), reminders.body.reminders);

  const snoozed = await req('PATCH', `/api/journal/entries/${repeated.id}/reminder`, {
    token: ali.token,
    body: { status: 'snoozed', snoozeUntil: nowMs() + 3 * DAY },
  });
  check('Hatırlatma ertelenebilir', snoozed.body.entry.reminderStatus === 'snoozed', snoozed.body.entry);

  const foreignReminder = await req('PATCH', `/api/journal/entries/${repeated.id}/reminder`, {
    token: beren.token,
    body: { status: 'cancelled' },
  });
  check('Başkası hatırlatmayı değiştiremez', foreignReminder.status === 403, foreignReminder.body);

  // ------------------------------------------------------------------
  section('6. Sağlık belgeleri ve anılar');

  const pdf = await upload(ali.token, 'document', PDF, 'application/pdf');
  check('PDF belge yüklenebilir', pdf.status === 201, pdf.body);

  const pdfAsPhoto = await upload(ali.token, 'dog_photo', PDF, 'application/pdf');
  check('PDF profil fotoğrafı olarak yüklenemez', pdfAsPhoto.status === 400, pdfAsPhoto.body);

  const doc = await req('POST', '/api/journal/documents', {
    token: ali.token,
    body: { dogId: ali.dogId, type: 'asi_karnesi', title: 'Aşı karnesi', storageKey: pdf.body.key },
  });
  check('Belge kaydedilir', doc.status === 201, doc.body);

  const docs = await req('GET', `/api/journal/${ali.dogId}/documents`, { token: ali.token });
  check('Belgeler listelenir', docs.body.documents.length === 1, docs.body.documents);

  const foreignDocs = await req('GET', `/api/journal/${ali.dogId}/documents`, { token: beren.token });
  check('Başkası sağlık belgelerini göremez', foreignDocs.status === 404, foreignDocs.body);

  const berenFile = await upload(beren.token, 'document', PDF, 'application/pdf');
  const stolenDoc = await req('POST', '/api/journal/documents', {
    token: ali.token,
    body: { dogId: ali.dogId, type: 'recete', storageKey: berenFile.body.key },
  });
  check('Başkasının dosyası belge olarak eklenemez', stolenDoc.status === 403, stolenDoc.body);

  const memoryPhoto = await upload(ali.token, 'memory_photo', JPEG, 'image/jpeg');
  const memory = await req('POST', '/api/journal/memories', {
    token: ali.token,
    body: {
      dogId: ali.dogId,
      storageKey: memoryPhoto.body.key,
      note: 'İlk sahil yürüyüşü',
      occurredAt: nowMs() - DAY,
      walkId,
    },
  });
  check('Anı kaydedilir', memory.status === 201, memory.body);

  const memories = await req('GET', `/api/journal/${ali.dogId}/memories`, { token: ali.token });
  check('Anılar listelenir', memories.body.memories.length === 1, memories.body.memories);
  check('Anı yürüyüşle ilişkilendirilir', memories.body.memories[0].walkId === walkId, memories.body.memories[0]);

  // ------------------------------------------------------------------
  section('7. Acil durum kartı');

  const emptyCard = await req('GET', `/api/journal/${ali.dogId}/emergency`, { token: ali.token });
  check('Kart başlangıçta boş', emptyCard.body.card === null, emptyCard.body);

  await req('PUT', `/api/journal/${ali.dogId}/emergency`, {
    token: ali.token,
    body: { healthNote: 'Kalp üfürümü var.', allergies: 'Tavuk', chipNumber: '999000111222333' },
  });
  const card = await req('GET', `/api/journal/${ali.dogId}/emergency`, { token: ali.token });
  check('Kart kaydedilir', card.body.card.allergies === 'Tavuk', card.body.card);
  check('Kart varsayılan olarak özel', card.body.card.shared === false, card.body.card);

  const foreignCard = await req('GET', `/api/journal/${ali.dogId}/emergency`, { token: beren.token });
  check('Başkası acil durum kartını göremez', foreignCard.status === 404, foreignCard.body);

  const shareCard = await req('POST', `/api/journal/${ali.dogId}/emergency/share`, {
    token: ali.token,
    body: { enabled: true },
  });
  check('Paylaşım yalnızca açık istekle üretilir', Boolean(shareCard.body.shareToken), shareCard.body);

  // ------------------------------------------------------------------
  section('8. Hızlı Yürüyüş Daveti');

  const invite = await req('POST', '/api/neighbourhood/invites', {
    token: ali.token,
    body: {
      dogId: ali.dogId,
      district: 'Kadıköy',
      areaNote: 'Moda sahili civarı',
      startsAt: nowMs() + 30 * MIN,
      durationMinutes: 45,
      pace: 'normal',
      dogSize: 'hepsi',
      note: 'Sakin bir tur atalım.',
    },
  });
  check('Davet oluşturulur', invite.status === 201, invite.body);
  const inviteId = invite.body.invite.id as string;
  check(
    'Davette kesin konum alanı yok',
    !('latitude' in invite.body.invite) && !('address' in invite.body.invite),
    Object.keys(invite.body.invite)
  );

  const addressInvite = await req('POST', '/api/neighbourhood/invites', {
    token: ali.token,
    body: {
      district: 'Kadıköy',
      areaNote: 'Moda Cad. No: 12',
      startsAt: nowMs() + 20 * MIN,
      durationMinutes: 30,
      pace: 'normal',
    },
  });
  check('Açık adresli davet reddedilir', addressInvite.status === 400, addressInvite.body);

  const pastInvite = await req('POST', '/api/neighbourhood/invites', {
    token: ali.token,
    body: {
      district: 'Kadıköy',
      startsAt: nowMs() - 2 * 60 * MIN,
      durationMinutes: 30,
      pace: 'normal',
    },
  });
  check('Geçmiş zamanlı davet reddedilir', pastInvite.status === 400, pastInvite.body);

  const join = await req('POST', `/api/neighbourhood/invites/${inviteId}/join`, {
    token: beren.token,
    body: { dogId: beren.dogId },
  });
  check('Davete katılınır', join.status === 200 && join.body.invite.hasJoined, join.body);
  check('Katılım sonrası buluşma noktası mesajla paylaşılır', join.body.message.includes('mesajla'), join.body.message);

  const selfJoin = await req('POST', `/api/neighbourhood/invites/${inviteId}/join`, {
    token: ali.token,
    body: {},
  });
  check('Kendi davetine katılınamaz', selfJoin.status === 400, selfJoin.body);

  const leave = await req('POST', `/api/neighbourhood/invites/${inviteId}/leave`, {
    token: beren.token,
    body: {},
  });
  check('Davetten ayrılınır', leave.body.invite.hasJoined === false, leave.body.invite);

  // Süresi dolmuş davete katılım reddedilmeli.
  await getDb().exec('UPDATE walk_invites SET expires_at = $1 WHERE id = $2', [nowMs() - 1000, inviteId]);
  const expiredJoin = await req('POST', `/api/neighbourhood/invites/${inviteId}/join`, {
    token: beren.token,
    body: {},
  });
  check('Süresi dolan davete katılım reddedilir', expiredJoin.status === 400, expiredJoin.body);
  check('Hata kodu açık', expiredJoin.body?.error?.code === 'invite_expired', expiredJoin.body);

  const expiredView = await req('GET', `/api/neighbourhood/invites/${inviteId}`, { token: beren.token });
  check('Süresi dolan davet expired olarak işaretlenir', expiredView.body.invite.expired === true, expiredView.body.invite);

  // Aktif davet sınırı.
  const created: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const res = await req('POST', '/api/neighbourhood/invites', {
      token: ceren.token,
      body: {
        district: 'Beşiktaş',
        startsAt: nowMs() + (10 + i) * MIN,
        durationMinutes: 30,
        pace: 'sakin',
      },
    });
    if (res.status === 201) created.push(res.body.invite.id);
    else check('Aktif davet sayısı sınırlanır', res.status === 409 && i === 3, res.body);
  }
  check('Sınıra kadar davet açılabilir', created.length === 3, created.length);

  const cancel = await req('POST', `/api/neighbourhood/invites/${created[0]}/cancel`, {
    token: ceren.token,
    body: {},
  });
  check('Davet iptal edilir', cancel.status === 200, cancel.body);

  const foreignCancel = await req('POST', `/api/neighbourhood/invites/${created[1]}/cancel`, {
    token: ali.token,
    body: {},
  });
  check('Başkası daveti iptal edemez', foreignCancel.status === 403, foreignCancel.body);

  // Engelleme daveti gizler.
  await req('POST', '/api/safety/blocks', { token: beren.token, body: { userId: ceren.id } });
  const blockedList = await req('GET', '/api/neighbourhood/invites?district=Beşiktaş', {
    token: beren.token,
  });
  check(
    'Engellenen kullanıcının daveti görünmez',
    (blockedList.body.invites as any[]).every((i) => i.owner?.id !== ceren.id),
    blockedList.body.invites?.length
  );
  await req('DELETE', `/api/safety/blocks/${ceren.id}`, { token: beren.token });

  // ------------------------------------------------------------------
  section('9. Mahalle Akışı');

  await req('POST', '/api/events', {
    token: ali.token,
    body: {
      title: 'Akış testi yürüyüşü',
      type: 'yuruyus',
      startsAt: nowMs() + 2 * DAY,
      district: 'Kadıköy',
      meetingPoint: 'Park girişi',
      capacity: 8,
    },
  });
  await req('POST', '/api/safety/alerts', {
    token: ali.token,
    body: {
      type: 'zehirli_yem',
      district: 'Kadıköy',
      areaNote: 'Sahil yolu civarı',
      occurredAt: nowMs() - 60 * MIN,
      description: 'Şüpheli yem gördük, dikkatli olun lütfen.',
    },
  });
  await req('POST', '/api/neighbourhood/invites', {
    token: ali.token,
    body: {
      district: 'Kadıköy',
      startsAt: nowMs() + 40 * MIN,
      durationMinutes: 30,
      pace: 'normal',
    },
  });

  const feed = await req('GET', '/api/neighbourhood/feed?district=Kadıköy', { token: beren.token });
  const kinds = new Set((feed.body.items as any[]).map((i) => i.kind));
  check('Akış üç içerik türünü birleştirir', kinds.has('event') && kinds.has('alert') && kinds.has('invite'), [...kinds]);
  check(
    'Akışta kesin konum yok',
    (feed.body.items as any[]).every((i) => !('latitude' in i) && !('address' in i)),
    feed.body.items[0]
  );

  const filteredFeed = await req('GET', '/api/neighbourhood/feed?kinds=invite', { token: beren.token });
  check(
    'İçerik türü filtresi çalışır',
    (filteredFeed.body.items as any[]).every((i) => i.kind === 'invite'),
    filteredFeed.body.items?.map((i: any) => i.kind)
  );

  const otherDistrict = await req('GET', '/api/neighbourhood/feed?district=Şişli', { token: beren.token });
  check('Semt filtresi çalışır', otherDistrict.body.items.length === 0, otherDistrict.body.items);

  const anonFeed = await req('GET', '/api/neighbourhood/feed');
  check('Oturumsuz akış erişimi reddedilir', anonFeed.status === 401);

  // ------------------------------------------------------------------
  section('10. Oyun grupları');

  const group = await req('POST', '/api/neighbourhood/groups', {
    token: ali.token,
    body: {
      name: 'Moda Sabah Grubu',
      district: 'Kadıköy',
      dogSize: 'orta',
      playStyle: 'dengeli',
      description: 'Sabah sakin tempoda yürüyen küçük bir grup.',
    },
  });
  check('Grup oluşturulur', group.status === 201, group.body);
  check('Kurucu üye sayılır', group.body.group.memberCount === 1, group.body.group);
  check('Kurucu yönetici', group.body.group.isOwner === true, group.body.group);

  const groupId = group.body.group.id as string;
  const joinGroup = await req('POST', `/api/neighbourhood/groups/${groupId}/join`, {
    token: beren.token,
    body: {},
  });
  check('Gruba katılınır', joinGroup.body.group.isMember === true, joinGroup.body.group);
  check('Üye sayısı artar', joinGroup.body.group.memberCount === 2, joinGroup.body.group);

  const leaveGroup = await req('POST', `/api/neighbourhood/groups/${groupId}/leave`, {
    token: beren.token,
    body: {},
  });
  check('Gruptan ayrılınır', leaveGroup.body.group.isMember === false, leaveGroup.body.group);

  const ownerLeave = await req('POST', `/api/neighbourhood/groups/${groupId}/leave`, {
    token: ali.token,
    body: {},
  });
  check('Yönetici gruptan ayrılamaz', ownerLeave.status === 400, ownerLeave.body);

  const mine = await req('GET', '/api/neighbourhood/groups?scope=mine', { token: ali.token });
  check('Kendi gruplarım filtresi çalışır', mine.body.groups.length === 1, mine.body.groups?.length);

  // ------------------------------------------------------------------
  section('11. Bildirim tercihleri');

  const prefs = await req('GET', '/api/push/preferences', { token: ali.token });
  check('Yeni kategoriler tercihlerde var', 'care' in prefs.body.preferences && 'invites' in prefs.body.preferences, prefs.body.preferences);

  const updated = await req('PATCH', '/api/push/preferences', {
    token: ali.token,
    body: { care: false, invites: false },
  });
  check('Kategori tercihi kapatılabilir', updated.body.preferences.care === false && updated.body.preferences.invites === false, updated.body.preferences);

  const reread = await req('GET', '/api/push/preferences', { token: ali.token });
  check('Tercih kalıcı', reread.body.preferences.care === false, reread.body.preferences);
  check('Diğer kategoriler korunur', reread.body.preferences.messages === true, reread.body.preferences);

  // ------------------------------------------------------------------
  section('12. Gizlilik odaklı analitik');

  const clean = analytics.sanitizeProps({
    distance_meters: 1200,
    has_dog: true,
    // Serbest metin ve kişisel alanlar atılmalı.
    note: 'Kalp üfürümü var',
    email: 'a@b.com',
    lat: 40.98,
    BadKey: 5,
  });
  check('Sayısal alan korunur', clean.distance_meters === 1200, clean);
  check('Boolean alan korunur', clean.has_dog === true, clean);
  check('Serbest metin atılır', !('note' in clean) && !('email' in clean), clean);
  check('Geçersiz anahtar atılır', !('BadKey' in clean), clean);

  const rows = await getDb().query<{ name: string; props: string }>(
    'SELECT name, props FROM analytics_events WHERE user_id = $1',
    [ali.id]
  );
  const names = rows.map((r) => r.name);
  check('Yürüyüş olayları kaydedilir', names.includes('walk_started') && names.includes('walk_completed'), names);
  check('Günlük ve davet olayları kaydedilir', names.includes('journal_entry_added') && names.includes('invite_created'), names);
  check(
    'Kaydedilen olaylarda serbest metin yok',
    rows.every((r) => !/[a-zA-ZğüşöçİĞÜŞÖÇ]{4,}["']\s*:\s*["'][^"']{4,}/.test(r.props)),
    rows.map((r) => r.props).slice(0, 3)
  );

  // ------------------------------------------------------------------
  section('13. Hesap silme kişisel veriyi temizler');

  await req('POST', '/api/auth/delete-account', { token: ali.token, body: { confirm: true } });

  const [journalLeft, docsLeft, walksLeft, cardLeft] = await Promise.all([
    getDb().query('SELECT id FROM dog_journal_entries WHERE owner_id = $1', [ali.id]),
    getDb().query('SELECT id FROM dog_documents WHERE owner_id = $1', [ali.id]),
    getDb().query('SELECT id FROM walks WHERE user_id = $1', [ali.id]),
    getDb().query('SELECT dog_id FROM dog_emergency_cards WHERE owner_id = $1', [ali.id]),
  ]);
  check('Günlük kayıtları silinir', journalLeft.length === 0, journalLeft.length);
  check('Sağlık belgeleri silinir', docsLeft.length === 0, docsLeft.length);
  check('Yürüyüş ve rota verisi silinir', walksLeft.length === 0, walksLeft.length);
  check('Acil durum kartı silinir', cardLeft.length === 0, cardLeft.length);

  const anonymised = await getDb().query('SELECT id FROM analytics_events WHERE user_id = $1', [ali.id]);
  check('Analitik olayları kimliksizleştirilir', anonymised.length === 0, anonymised.length);

  server.close();
  await getDb().close();
  fs.rmSync(uploadDir, { recursive: true, force: true });

  console.log(`\n${'='.repeat(48)}`);
  console.log(`Toplam: ${passed + failed}  |  Geçen: ${passed}  |  Başarısız: ${failed}`);
  console.log('='.repeat(48));

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Ürün testi çöktü:', error);
  process.exit(1);
});
