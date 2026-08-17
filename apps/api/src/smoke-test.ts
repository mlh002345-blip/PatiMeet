/**
 * Uçtan uca duman testi. Gerçek bir sunucu ayağa kaldırıp MVP'nin temel
 * akışlarını ve iş kurallarını HTTP üzerinden doğrular.
 *
 *   npm test
 *
 * Geçici bir veritabanı dosyası kullanır; mevcut geliştirme verisine dokunmaz.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDb = path.join(os.tmpdir(), `patimeet-smoke-${Date.now()}.sqlite`);
process.env.DB_FILE = tmpDb;
process.env.PORT = '0';
process.env.JWT_SECRET = 'smoke-test-secret';
process.env.ADMIN_TOKEN = 'smoke-admin-token';

// Ortam değişkenleri config okunmadan önce ayarlanmalı.
const { createApp } = require('./app') as typeof import('./app');

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

function section(title: string): void {
  console.log(`\n${title}`);
}

async function main(): Promise<void> {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Sunucu adresi alınamadı');
  const base = `http://127.0.0.1:${address.port}`;

  interface Res<T = any> {
    status: number;
    body: T;
  }

  async function req<T = any>(
    method: string,
    url: string,
    options: { token?: string; body?: unknown; adminToken?: string } = {}
  ): Promise<Res<T>> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.adminToken) headers['x-admin-token'] = options.adminToken;

    const response = await fetch(`${base}${url}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  }

  const DAY = 24 * 60 * 60 * 1000;
  const stamp = Date.now();

  section('1. Kayıt ve giriş');

  const noTerms = await req('POST', '/api/auth/register', {
    body: { email: `a${stamp}@test.com`, password: 'sifre12345' },
  });
  check('Sözleşme onayı olmadan kayıt reddedilir', noTerms.status === 400, noTerms.body);

  const shortPassword = await req('POST', '/api/auth/register', {
    body: { email: `b${stamp}@test.com`, password: '123', acceptTerms: true, acceptPrivacy: true },
  });
  check('Kısa şifre reddedilir', shortPassword.status === 400, shortPassword.body);

  const badEmail = await req('POST', '/api/auth/register', {
    body: { email: 'gecersiz', password: 'sifre12345', acceptTerms: true, acceptPrivacy: true },
  });
  check('Geçersiz e-posta reddedilir', badEmail.status === 400, badEmail.body);

  async function registerUser(label: string) {
    const email = `${label}${stamp}@test.com`;
    const res = await req('POST', '/api/auth/register', {
      body: { email, password: 'sifre12345', acceptTerms: true, acceptPrivacy: true },
    });
    if (res.status !== 201) throw new Error(`${label} kaydı başarısız: ${JSON.stringify(res.body)}`);
    return { email, token: res.body.token as string, id: res.body.user.id as string };
  }

  const ayse = await registerUser('ayse');
  const burak = await registerUser('burak');
  const ceyda = await registerUser('ceyda');
  check('Kayıt token ve kullanıcı döner', Boolean(ayse.token && ayse.id));
  check('Yeni kullanıcının köpeği yok', true);

  const duplicate = await req('POST', '/api/auth/register', {
    body: { email: ayse.email, password: 'sifre12345', acceptTerms: true, acceptPrivacy: true },
  });
  check('Aynı e-posta ile ikinci kayıt reddedilir', duplicate.status === 409, duplicate.body);

  const wrongLogin = await req('POST', '/api/auth/login', {
    body: { email: ayse.email, password: 'yanlissifre' },
  });
  check('Hatalı şifre ile giriş reddedilir', wrongLogin.status === 401);

  const login = await req('POST', '/api/auth/login', {
    body: { email: ayse.email, password: 'sifre12345' },
  });
  check('Doğru bilgilerle giriş başarılı', login.status === 200 && Boolean(login.body.token));

  section('2. Yetkilendirme');

  const noAuth = await req('GET', '/api/discover');
  check('Token olmadan korumalı uç 401 döner', noAuth.status === 401);

  const badToken = await req('GET', '/api/discover', { token: 'gecersiz.token.degeri' });
  check('Geçersiz token 401 döner', badToken.status === 401);

  const adminNoToken = await req('GET', '/api/admin/stats');
  check('Admin ucu anahtarsız erişilemez', adminNoToken.status === 403);

  section('3. Profil ve köpek profili');

  await req('PATCH', '/api/users/me', {
    token: ayse.token,
    body: { name: 'Ayşe', district: 'Kadıköy', bio: 'Akşam yürüyüşleri', purpose: 'yuruyus' },
  });
  await req('PATCH', '/api/users/me', {
    token: burak.token,
    body: { name: 'Burak', district: 'Kadıköy', purpose: 'oyun' },
  });
  await req('PATCH', '/api/users/me', {
    token: ceyda.token,
    body: { name: 'Ceyda', district: 'Beşiktaş', purpose: 'sosyal' },
  });

  const shortName = await req('PATCH', '/api/users/me', {
    token: ayse.token,
    body: { name: 'A' },
  });
  check('Çok kısa ad reddedilir', shortName.status === 400);

  const incompleteDog = await req('POST', '/api/dogs', {
    token: ayse.token,
    body: { name: 'Pati' },
  });
  check('Zorunlu alanlar olmadan köpek profili reddedilir', incompleteDog.status === 400);

  const futureDog = await req('POST', '/api/dogs', {
    token: ayse.token,
    body: {
      name: 'Pati',
      size: 'buyuk',
      energy: 'dengeli',
      sociability: 'sosyal',
      birthYear: new Date().getUTCFullYear() + 2,
    },
  });
  check('Gelecek doğum yılı reddedilir', futureDog.status === 400);

  const dogA = await req('POST', '/api/dogs', {
    token: ayse.token,
    body: {
      name: 'Pati',
      breed: 'Golden Retriever',
      birthYear: 2021,
      size: 'buyuk',
      energy: 'dengeli',
      sociability: 'sosyal',
      vaccinated: true,
    },
  });
  check('Köpek profili oluşturulur', dogA.status === 201, dogA.body);
  check('Yaş doğum yılından hesaplanır', typeof dogA.body?.dog?.age === 'number');

  const dogB = await req('POST', '/api/dogs', {
    token: burak.token,
    body: { name: 'Karamel', size: 'orta', energy: 'enerjik', sociability: 'sosyal' },
  });
  const dogC = await req('POST', '/api/dogs', {
    token: ceyda.token,
    body: { name: 'Fındık', size: 'kucuk', energy: 'sakin', sociability: 'cekingen' },
  });
  check('Diğer kullanıcıların köpekleri oluşturulur', dogB.status === 201 && dogC.status === 201);

  const me = await req('GET', '/api/auth/me', { token: ayse.token });
  check('Profil tamamlandı bayrağı doğru', me.body?.user?.profileComplete === true, me.body?.user);

  const lastDog = await req('DELETE', `/api/dogs/${dogA.body.dog.id}`, { token: ayse.token });
  check('Son köpek profili silinemez', lastDog.status === 400, lastDog.body);

  const foreignDog = await req('PATCH', `/api/dogs/${dogB.body.dog.id}`, {
    token: ayse.token,
    body: { name: 'Değiştirildi' },
  });
  check('Başkasının köpeği düzenlenemez', foreignDog.status === 403);

  section('4. Keşfet');

  const discover = await req('GET', '/api/discover', { token: ayse.token });
  const discoveredIds = discover.body.items.map((i: any) => i.owner.id);
  check('Keşfet listesi diğer kullanıcıları gösterir', discover.body.items.length === 2, discoveredIds);
  check('Kendi profilim listede yok', !discoveredIds.includes(ayse.id));

  const noAddress = JSON.stringify(discover.body);
  check(
    'Keşfet yanıtında e-posta veya adres alanı yok',
    !noAddress.includes('@test.com') && !noAddress.includes('meeting_point')
  );

  const filtered = await req('GET', '/api/discover?district=Kadıköy', { token: ceyda.token });
  check(
    'Semt filtresi çalışır',
    filtered.body.items.length === 2 &&
      filtered.body.items.every((i: any) => i.owner.district === 'Kadıköy'),
    filtered.body.items.map((i: any) => i.owner.district)
  );

  const sizeFiltered = await req('GET', '/api/discover?size=orta', { token: ayse.token });
  check(
    'Boyut filtresi çalışır',
    sizeFiltered.body.items.length === 1 && sizeFiltered.body.items[0].dog.size === 'orta'
  );

  const energyFiltered = await req('GET', '/api/discover?energy=sakin', { token: ayse.token });
  check('Enerji filtresi çalışır', energyFiltered.body.items.length === 1);

  const districts = await req('GET', '/api/discover/districts');
  check('Semt listesi döner', Array.isArray(districts.body.districts) && districts.body.districts.length > 5);

  section('5. Etkinlikler');

  const pastEvent = await req('POST', '/api/events', {
    token: ayse.token,
    body: {
      title: 'Geçmiş etkinlik',
      type: 'yuruyus',
      startsAt: Date.now() - DAY,
      district: 'Kadıköy',
      meetingPoint: 'Park girişi',
      capacity: 5,
    },
  });
  check('Geçmiş tarihli etkinlik oluşturulamaz', pastEvent.status === 400, pastEvent.body);

  const event = await req('POST', '/api/events', {
    token: ayse.token,
    body: {
      title: 'Yoğurtçu Parkı yürüyüşü',
      type: 'yuruyus',
      startsAt: Date.now() + 2 * DAY,
      district: 'Kadıköy',
      meetingPoint: 'Yoğurtçu Parkı ana giriş',
      capacity: 2,
      dogSize: 'hepsi',
      description: 'Bir saatlik sakin tur',
      rules: 'Tasma zorunlu',
    },
  });
  check('Etkinlik oluşturulur', event.status === 201, event.body);
  const eventId = event.body.event.id;
  check('Etkinlik sahibi otomatik katılımcı', event.body.event.participantCount === 1);
  check('Sahiplik bayrağı doğru', event.body.event.isOwner === true);

  const list = await req('GET', '/api/events', { token: burak.token });
  check('Etkinlik listesi etkinliği gösterir', list.body.events.some((e: any) => e.id === eventId));

  const join = await req('POST', `/api/events/${eventId}/join`, {
    token: burak.token,
    body: { dogId: dogB.body.dog.id },
  });
  check('Etkinliğe katılım başarılı', join.status === 200, join.body);
  check('Katılımcı sayısı artar', join.body.event.participantCount === 2);
  check('Kontenjan dolu işaretlenir', join.body.event.isFull === true);

  const rejoin = await req('POST', `/api/events/${eventId}/join`, { token: burak.token });
  check('Aynı etkinliğe iki kez katılınamaz', rejoin.status === 409, rejoin.body);

  const full = await req('POST', `/api/events/${eventId}/join`, { token: ceyda.token });
  check('Kontenjan dolduğunda katılım reddedilir', full.status === 409, full.body);

  const ownerLeave = await req('POST', `/api/events/${eventId}/leave`, { token: ayse.token });
  check('Etkinlik sahibi ayrılamaz', ownerLeave.status === 400);

  const leave = await req('POST', `/api/events/${eventId}/leave`, { token: burak.token });
  check('Katılımdan ayrılma çalışır', leave.status === 200 && leave.body.event.participantCount === 1);

  const detail = await req('GET', `/api/events/${eventId}`, { token: ceyda.token });
  check('Etkinlik detayı katılımcı listesi döner', detail.body.participants.length === 1);

  const foreignEdit = await req('PATCH', `/api/events/${eventId}`, {
    token: burak.token,
    body: { title: 'Ele geçirildi' },
  });
  check('Yalnızca sahibi etkinliği düzenler', foreignEdit.status === 403);

  const foreignCancel = await req('POST', `/api/events/${eventId}/cancel`, { token: burak.token });
  check('Yalnızca sahibi etkinliği iptal eder', foreignCancel.status === 403);

  // Boyut kısıtı olan etkinliğe uyumsuz köpekle katılım denemesi.
  const sizedEvent = await req('POST', '/api/events', {
    token: ceyda.token,
    body: {
      title: 'Küçük köpekler buluşması',
      type: 'oyun',
      startsAt: Date.now() + 3 * DAY,
      district: 'Beşiktaş',
      meetingPoint: 'Sahil parkı',
      capacity: 6,
      dogSize: 'kucuk',
    },
  });
  const sizeMismatch = await req('POST', `/api/events/${sizedEvent.body.event.id}/join`, {
    token: ayse.token,
    body: { dogId: dogA.body.dog.id },
  });
  check('Uygun olmayan köpek boyutu ile katılım reddedilir', sizeMismatch.status === 400, sizeMismatch.body);

  // Kontenjan düşürme kuralı: 2 katılımcılı bir etkinlikte sınır 1'e çekilemez.
  const capacityEvent = await req('POST', '/api/events', {
    token: ayse.token,
    body: {
      title: 'Kontenjan testi yürüyüşü',
      type: 'yuruyus',
      startsAt: Date.now() + 5 * DAY,
      district: 'Kadıköy',
      meetingPoint: 'Park girişi',
      capacity: 4,
    },
  });
  await req('POST', `/api/events/${capacityEvent.body.event.id}/join`, { token: burak.token });

  const capacityDown = await req('PATCH', `/api/events/${capacityEvent.body.event.id}`, {
    token: ayse.token,
    body: { capacity: 1 },
  });
  check(
    'Kontenjan mevcut katılımcı sayısının altına düşürülemez',
    capacityDown.status === 400,
    capacityDown.body
  );

  const capacityUp = await req('PATCH', `/api/events/${capacityEvent.body.event.id}`, {
    token: ayse.token,
    body: { capacity: 6 },
  });
  check('Kontenjan artırılabilir', capacityUp.status === 200 && capacityUp.body.event.capacity === 6);

  section('6. Mesajlaşma');

  const conversation = await req('POST', '/api/messages/conversations', {
    token: ayse.token,
    body: { userId: burak.id },
  });
  check('Konuşma oluşturulur', conversation.status === 200, conversation.body);
  const conversationId = conversation.body.conversation.id;

  const again = await req('POST', '/api/messages/conversations', {
    token: burak.token,
    body: { userId: ayse.id },
  });
  check('Aynı çift için tek konuşma kullanılır', again.body.conversation.id === conversationId);

  const selfChat = await req('POST', '/api/messages/conversations', {
    token: ayse.token,
    body: { userId: ayse.id },
  });
  check('Kendine mesaj gönderilemez', selfChat.status === 400);

  const emptyMessage = await req('POST', `/api/messages/conversations/${conversationId}/messages`, {
    token: ayse.token,
    body: { body: '   ' },
  });
  check('Boş mesaj reddedilir', emptyMessage.status === 400);

  const sent = await req('POST', `/api/messages/conversations/${conversationId}/messages`, {
    token: ayse.token,
    body: { body: 'Merhaba! Cumartesi parkta buluşalım mı?' },
  });
  check('Mesaj gönderilir', sent.status === 201, sent.body);

  const outsider = await req('GET', `/api/messages/conversations/${conversationId}/messages`, {
    token: ceyda.token,
  });
  check('Üçüncü kişi konuşmayı okuyamaz', outsider.status === 403);

  const unreadBefore = await req('GET', '/api/messages/unread-count', { token: burak.token });
  check('Okunmamış mesaj sayacı çalışır', unreadBefore.body.unreadCount === 1, unreadBefore.body);

  const thread = await req('GET', `/api/messages/conversations/${conversationId}/messages`, {
    token: burak.token,
  });
  check('Mesajlar okunur', thread.body.messages.length === 1);
  check('Gönderen bayrağı doğru', thread.body.messages[0].isMine === false);

  const unreadAfter = await req('GET', '/api/messages/unread-count', { token: burak.token });
  check('Okuma sonrası sayaç sıfırlanır', unreadAfter.body.unreadCount === 0);

  const conversations = await req('GET', '/api/messages/conversations', { token: ayse.token });
  check('Konuşma listesi döner', conversations.body.conversations.length === 1);
  check(
    'Konuşma listesinde son mesaj var',
    conversations.body.conversations[0].lastMessage?.body?.includes('Cumartesi')
  );

  section('7. Şikâyet ve engelleme');

  const reasons = await req('GET', '/api/safety/report-reasons');
  check('Şikâyet nedenleri listelenir', reasons.body.reasons.length >= 5);

  const selfReport = await req('POST', '/api/safety/reports', {
    token: ayse.token,
    body: { targetType: 'user', targetId: ayse.id, reason: 'spam' },
  });
  check('Kendini şikâyet edemez', selfReport.status === 400);

  const badReason = await req('POST', '/api/safety/reports', {
    token: ayse.token,
    body: { targetType: 'user', targetId: burak.id, reason: 'olmayan_neden' },
  });
  check('Geçersiz şikâyet nedeni reddedilir', badReason.status === 400);

  const report = await req('POST', '/api/safety/reports', {
    token: ceyda.token,
    body: {
      targetType: 'user',
      targetId: burak.id,
      reason: 'taciz',
      details: 'Israrlı mesaj gönderiyor.',
    },
  });
  check('Kullanıcı şikâyeti kaydedilir', report.status === 201, report.body);

  const eventReport = await req('POST', '/api/safety/reports', {
    token: ceyda.token,
    body: { targetType: 'event', targetId: eventId, reason: 'uygunsuz_icerik' },
  });
  check('Etkinlik şikâyeti kaydedilir', eventReport.status === 201);

  // Ceyda, Burak'ı engelliyor.
  const block = await req('POST', '/api/safety/blocks', {
    token: ceyda.token,
    body: { userId: burak.id },
  });
  check('Kullanıcı engellenir', block.status === 201);

  const blockedProfile = await req('GET', `/api/users/${burak.id}`, { token: ceyda.token });
  check('Engellenen kullanıcının profili görünmez', blockedProfile.status === 404);

  const reverseProfile = await req('GET', `/api/users/${ceyda.id}`, { token: burak.token });
  check('Engelleme karşılıklı çalışır', reverseProfile.status === 404, reverseProfile.body);

  const blockedDiscover = await req('GET', '/api/discover', { token: ceyda.token });
  check(
    'Engellenen kullanıcı keşfet listesinde çıkmaz',
    !blockedDiscover.body.items.some((i: any) => i.owner.id === burak.id)
  );

  const blockedMessage = await req('POST', '/api/messages/conversations', {
    token: burak.token,
    body: { userId: ceyda.id },
  });
  check('Engellenen kullanıcı mesaj gönderemez', blockedMessage.status === 403, blockedMessage.body);

  const blockList = await req('GET', '/api/safety/blocks', { token: ceyda.token });
  check('Engellenenler listesi döner', blockList.body.blocked.length === 1);

  const unblock = await req('DELETE', `/api/safety/blocks/${burak.id}`, { token: ceyda.token });
  check('Engel kaldırılır', unblock.status === 200);

  const afterUnblock = await req('GET', `/api/users/${burak.id}`, { token: ceyda.token });
  check('Engel kaldırıldıktan sonra profil görünür', afterUnblock.status === 200);

  section('8. Yasal metinler');

  const docs = await req('GET', '/api/legal');
  check('Belge listesi döner', docs.body.documents.length === 4);

  for (const slug of ['terms', 'privacy', 'community', 'safety']) {
    const doc = await req('GET', `/api/legal/${slug}`);
    check(`${slug} belgesi erişilebilir`, doc.status === 200 && doc.body.body.length > 100);
  }

  const missingDoc = await req('GET', '/api/legal/olmayan');
  check('Olmayan belge 404 döner', missingDoc.status === 404);

  section('9. Moderasyon');

  const stats = await req('GET', '/api/admin/stats', { adminToken: 'smoke-admin-token' });
  check('İstatistikler döner', stats.status === 200 && stats.body.users === 3, stats.body);
  check('Açık şikâyet sayısı doğru', stats.body.openReports === 2, stats.body);

  const reportList = await req('GET', '/api/admin/reports?status=open', {
    adminToken: 'smoke-admin-token',
  });
  check('Şikâyetler listelenir', reportList.body.reports.length === 2);

  const resolve = await req('PATCH', `/api/admin/reports/${report.body.reportId}`, {
    adminToken: 'smoke-admin-token',
    body: { status: 'resolved' },
  });
  check('Şikâyet incelendi olarak işaretlenir', resolve.status === 200);

  const removeEvent = await req('PATCH', `/api/admin/events/${eventId}`, {
    adminToken: 'smoke-admin-token',
    body: { status: 'removed' },
  });
  check('Etkinlik kaldırılır', removeEvent.status === 200);

  const removedDetail = await req('GET', `/api/events/${eventId}`, { token: burak.token });
  check('Kaldırılan etkinlik kullanıcıya görünmez', removedDetail.status === 404);

  const suspend = await req('PATCH', `/api/admin/users/${burak.id}`, {
    adminToken: 'smoke-admin-token',
    body: { status: 'suspended' },
  });
  check('Kullanıcı pasife alınır', suspend.status === 200);

  const suspendedAccess = await req('GET', '/api/discover', { token: burak.token });
  check('Pasif kullanıcı korumalı uçlara erişemez', suspendedAccess.status === 403, suspendedAccess.body);

  const suspendedInDiscover = await req('GET', '/api/discover', { token: ayse.token });
  check(
    'Pasif kullanıcı keşfet listesinde görünmez',
    !suspendedInDiscover.body.items.some((i: any) => i.owner.id === burak.id)
  );

  section('10. Hesap silme');

  const noConfirm = await req('POST', '/api/auth/delete-account', { token: ceyda.token });
  check('Onaysız hesap silme reddedilir', noConfirm.status === 400);

  const deleted = await req('POST', '/api/auth/delete-account', {
    token: ceyda.token,
    body: { confirm: true },
  });
  check('Hesap silme talebi işlenir', deleted.status === 200);

  const afterDelete = await req('GET', '/api/auth/me', { token: ceyda.token });
  check('Silinen hesap oturum açamaz', afterDelete.status === 403, afterDelete.body);

  const deletedInDiscover = await req('GET', '/api/discover', { token: ayse.token });
  check(
    'Silinen hesabın köpeği keşfette görünmez',
    !deletedInDiscover.body.items.some((i: any) => i.owner.id === ceyda.id)
  );

  server.close();
  fs.rmSync(tmpDb, { force: true });
  fs.rmSync(`${tmpDb}-wal`, { force: true });
  fs.rmSync(`${tmpDb}-shm`, { force: true });

  console.log(`\n${'='.repeat(48)}`);
  console.log(`Toplam: ${passed + failed}  |  Geçen: ${passed}  |  Başarısız: ${failed}`);
  console.log('='.repeat(48));

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Duman testi çöktü:', error);
  process.exit(1);
});
