/**
 * Demo veri üretir. Boş başlangıç durumlarını da test edebilmek için
 * `npm run seed -- --reset` ile mevcut veriyi temizleyebilirsiniz.
 */
import bcrypt from 'bcryptjs';
import { db, migrate, nowMs } from './db';
import { newId } from './ids';

migrate();

const reset = process.argv.includes('--reset');
if (reset) {
  for (const table of [
    'messages',
    'conversations',
    'event_participants',
    'events',
    'blocks',
    'reports',
    'dogs',
    'users',
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  console.log('[seed] mevcut veri temizlendi');
}

const DAY = 24 * 60 * 60 * 1000;
const ts = nowMs();
const passwordHash = bcrypt.hashSync('patimeet123', 10);

interface SeedUser {
  email: string;
  name: string;
  district: string;
  bio: string;
  purpose: string;
  dog: {
    name: string;
    breed: string;
    birthYear: number;
    size: string;
    energy: string;
    sociability: string;
    bio: string;
  };
}

const users: SeedUser[] = [
  {
    email: 'elif@ornek.com',
    name: 'Elif',
    district: 'Kadıköy',
    bio: 'Her akşam Yoğurtçu Parkı civarında yürüyoruz. Sakin köpeklerle tanışmayı seviyoruz.',
    purpose: 'yuruyus',
    dog: {
      name: 'Pati',
      breed: 'Golden Retriever',
      birthYear: 2021,
      size: 'buyuk',
      energy: 'dengeli',
      sociability: 'sosyal',
      bio: 'Top getirmeye bayılır, çocuklarla çok iyi anlaşır.',
    },
  },
  {
    email: 'mert@ornek.com',
    name: 'Mert',
    district: 'Beşiktaş',
    bio: 'Sabah koşularına köpeğimle çıkıyorum. Enerjik arkadaşlar arıyoruz.',
    purpose: 'oyun',
    dog: {
      name: 'Karamel',
      breed: 'Border Collie',
      birthYear: 2022,
      size: 'orta',
      energy: 'enerjik',
      sociability: 'sosyal',
      bio: 'Çok zeki, komut öğrenmeye meraklı. Koşmayı çok sever.',
    },
  },
  {
    email: 'zeynep@ornek.com',
    name: 'Zeynep',
    district: 'Kadıköy',
    bio: 'Sokaktan sahiplendik, yeni yeni sosyalleşiyor. Sabırlı arkadaşlar arıyoruz.',
    purpose: 'sosyal',
    dog: {
      name: 'Fındık',
      breed: 'Terrier karışık',
      birthYear: 2023,
      size: 'kucuk',
      energy: 'dengeli',
      sociability: 'cekingen',
      bio: 'İlk tanışmada çekingen ama alışınca çok oyuncu.',
    },
  },
  {
    email: 'can@ornek.com',
    name: 'Can',
    district: 'Şişli',
    bio: 'Hafta sonu uzun yürüyüşleri planlıyorum. Grup yürüyüşlerine katılmayı seviyorum.',
    purpose: 'yuruyus',
    dog: {
      name: 'Duman',
      breed: 'Husky',
      birthYear: 2020,
      size: 'buyuk',
      energy: 'enerjik',
      sociability: 'secici',
      bio: 'Uzun yürüyüşlerin kralı. Bazı köpeklerle mesafeli olabiliyor.',
    },
  },
  {
    email: 'selin@ornek.com',
    name: 'Selin',
    district: 'Üsküdar',
    bio: 'Yaşlı bir köpeğim var, kısa ve sakin yürüyüşler tercih ediyoruz.',
    purpose: 'sosyal',
    dog: {
      name: 'Maya',
      breed: 'Cocker Spaniel',
      birthYear: 2015,
      size: 'orta',
      energy: 'sakin',
      sociability: 'sosyal',
      bio: 'Sakin, uysal ve çok sevecen. Kısa yürüyüşler ona yetiyor.',
    },
  },
];

const insertUser = db.prepare(
  `INSERT INTO users
     (id, email, password_hash, provider, name, district, bio, purpose, terms_accepted_at, privacy_accepted_at, created_at, updated_at)
   VALUES (?, ?, ?, 'email', ?, ?, ?, ?, ?, ?, ?, ?)`
);

const insertDog = db.prepare(
  `INSERT INTO dogs
     (id, owner_id, name, breed, birth_year, size, energy, sociability, bio, vaccinated, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
);

const created: Array<{ userId: string; dogId: string; seed: SeedUser }> = [];

const seedTx = db.transaction(() => {
  for (const seed of users) {
    const exists = db
      .prepare<[string], { id: string }>('SELECT id FROM users WHERE email = ?')
      .get(seed.email);
    if (exists) {
      console.log(`[seed] ${seed.email} zaten var, atlanıyor`);
      continue;
    }

    const userId = newId();
    insertUser.run(
      userId,
      seed.email,
      passwordHash,
      seed.name,
      seed.district,
      seed.bio,
      seed.purpose,
      ts,
      ts,
      ts,
      ts
    );

    const dogId = newId();
    insertDog.run(
      dogId,
      userId,
      seed.dog.name,
      seed.dog.breed,
      seed.dog.birthYear,
      seed.dog.size,
      seed.dog.energy,
      seed.dog.sociability,
      seed.dog.bio,
      ts,
      ts
    );

    created.push({ userId, dogId, seed });
  }

  if (created.length === 0) return;

  const events = [
    {
      owner: 0,
      title: 'Yoğurtçu Parkı akşam yürüyüşü',
      type: 'yuruyus',
      startsAt: ts + 2 * DAY,
      district: 'Kadıköy',
      meetingPoint: 'Yoğurtçu Parkı ana giriş, köpek alanı tarafı',
      capacity: 8,
      dogSize: 'hepsi',
      description: 'Bir saatlik sakin bir tur atıp parkta biraz oyun molası veriyoruz.',
      rules: 'Tasma zorunlu. Aşıları eksik köpekleri getirmeyin. Poşetinizi unutmayın.',
    },
    {
      owner: 1,
      title: 'Sabah koşusu ve serbest oyun',
      type: 'oyun',
      startsAt: ts + 4 * DAY,
      district: 'Beşiktaş',
      meetingPoint: 'Sahil yolu, köpek parkı girişi',
      capacity: 6,
      dogSize: 'orta',
      description: 'Enerjisi yüksek köpekler için hızlı tempolu bir buluşma.',
      rules: 'Enerjik köpekler için uygundur. Su getirin.',
    },
    {
      owner: 3,
      title: 'Hafta sonu uzun rota',
      type: 'yuruyus',
      startsAt: ts + 6 * DAY,
      district: 'Şişli',
      meetingPoint: 'Park girişindeki bilgi panosu önü',
      capacity: 10,
      dogSize: 'buyuk',
      description: 'Yaklaşık iki saatlik daha uzun bir rota. Dayanıklı köpekler için.',
      rules: 'Tasma zorunlu. Mola noktalarında su verilecek.',
    },
    {
      owner: 2,
      title: 'Çekingen köpekler için sakin tanışma',
      type: 'sosyal',
      startsAt: ts + 3 * DAY,
      district: 'Kadıköy',
      meetingPoint: 'Sahil parkı, sakin taraf',
      capacity: 5,
      dogSize: 'kucuk',
      description: 'Yeni sosyalleşen köpekler için baskısız, kısa bir tanışma buluşması.',
      rules: 'Sabırlı olun, köpekleri zorlamayın. Tasma zorunlu.',
    },
  ];

  const insertEvent = db.prepare(
    `INSERT INTO events
       (id, owner_id, title, type, starts_at, district, meeting_point, capacity, dog_size, description, rules, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertParticipant = db.prepare(
    'INSERT OR IGNORE INTO event_participants (id, event_id, user_id, dog_id, created_at) VALUES (?, ?, ?, ?, ?)'
  );

  for (const event of events) {
    const owner = created[event.owner];
    if (!owner) continue;

    const eventId = newId();
    insertEvent.run(
      eventId,
      owner.userId,
      event.title,
      event.type,
      event.startsAt,
      event.district,
      event.meetingPoint,
      event.capacity,
      event.dogSize,
      event.description,
      event.rules,
      ts,
      ts
    );
    insertParticipant.run(newId(), eventId, owner.userId, owner.dogId, ts);

    // Sahibi dışında bir katılımcı daha ekleyerek katılımcı listesini doldur.
    const guest = created.find((c) => c.userId !== owner.userId);
    if (guest) insertParticipant.run(newId(), eventId, guest.userId, guest.dogId, ts);
  }

  // Örnek bir konuşma ve okunmamış mesaj.
  if (created.length >= 2) {
    const [first, second] = created;
    const [a, b] =
      first.userId < second.userId
        ? [first.userId, second.userId]
        : [second.userId, first.userId];

    const conversationId = newId();
    db.prepare(
      'INSERT INTO conversations (id, user_a_id, user_b_id, last_message_at, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(conversationId, a, b, ts, ts);

    const insertMessage = db.prepare(
      'INSERT INTO messages (id, conversation_id, sender_id, body, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insertMessage.run(
      newId(),
      conversationId,
      second.userId,
      'Merhaba! Pati ile bu hafta sonu parkta buluşmak ister misiniz?',
      null,
      ts - 3600_000
    );
    insertMessage.run(
      newId(),
      conversationId,
      first.userId,
      'Merhaba, çok isteriz! Cumartesi sabahı uygun olur mu?',
      ts - 1800_000,
      ts - 1800_000
    );
    insertMessage.run(
      newId(),
      conversationId,
      second.userId,
      'Cumartesi 10:00 bize uyar, görüşmek üzere!',
      null,
      ts - 600_000
    );
  }
});

seedTx();

console.log(`[seed] ${created.length} kullanıcı ve köpek profili oluşturuldu`);
if (created.length > 0) {
  console.log('[seed] Demo giriş bilgileri (tüm hesaplar için şifre: patimeet123):');
  for (const c of created) console.log(`         ${c.seed.email}`);
}
