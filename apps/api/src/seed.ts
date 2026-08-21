/**
 * Demo veri üretir.
 *
 *   npm run seed
 *   npm run seed -- --reset    (mevcut veriyi temizler)
 *
 * Boş başlangıç durumlarını test etmek için `--reset` kullanın.
 */
import bcrypt from 'bcryptjs';
import { getDb, nowMs, runMigrations } from './db';
import { newId } from './ids';

const DAY = 24 * 60 * 60 * 1000;

interface SeedUser {
  email: string;
  name: string;
  district: string;
  bio: string;
  /** Çoklu seçim: "Ne arıyorsun?" */
  purposes: string[];
  dog: {
    name: string;
    breed: string;
    birthYear: number;
    size: string;
    energy: string;
    sociability: string;
    bio: string;
    photoUrl: string;
  };
}

const users: SeedUser[] = [
  {
    email: 'elif@ornek.com',
    name: 'Elif',
    district: 'Kadıköy',
    bio: 'Her akşam Yoğurtçu Parkı civarında yürüyoruz. Sakin köpeklerle tanışmayı seviyoruz.',
    purposes: ['yuruyus', 'sosyal'],
    dog: {
      name: 'Pati',
      breed: 'Golden Retriever',
      birthYear: 2021,
      size: 'buyuk',
      energy: 'dengeli',
      sociability: 'sosyal',
      bio: 'Top getirmeye bayılır, çocuklarla çok iyi anlaşır.',
      photoUrl: 'https://images.unsplash.com/photo-1552053831-71594a27632d?w=800&auto=format&fit=crop',
    },
  },
  {
    email: 'mert@ornek.com',
    name: 'Mert',
    district: 'Beşiktaş',
    bio: 'Sabah koşularına köpeğimle çıkıyorum. Enerjik arkadaşlar arıyoruz.',
    purposes: ['oyun', 'etkinlik'],
    dog: {
      name: 'Karamel',
      breed: 'Border Collie',
      birthYear: 2022,
      size: 'orta',
      energy: 'enerjik',
      sociability: 'sosyal',
      bio: 'Çok zeki, komut öğrenmeye meraklı. Koşmayı çok sever.',
      photoUrl: 'https://images.unsplash.com/photo-1507146426996-ef05306b995a?w=800&auto=format&fit=crop',
    },
  },
  {
    email: 'zeynep@ornek.com',
    name: 'Zeynep',
    district: 'Kadıköy',
    bio: 'Sokaktan sahiplendik, yeni yeni sosyalleşiyor. Sabırlı arkadaşlar arıyoruz.',
    purposes: ['sosyal'],
    dog: {
      name: 'Fındık',
      breed: 'Terrier karışık',
      birthYear: 2023,
      size: 'kucuk',
      energy: 'dengeli',
      sociability: 'cekingen',
      bio: 'İlk tanışmada çekingen ama alışınca çok oyuncu.',
      photoUrl: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=800&auto=format&fit=crop',
    },
  },
  {
    email: 'can@ornek.com',
    name: 'Can',
    district: 'Şişli',
    bio: 'Hafta sonu uzun yürüyüşleri planlıyorum. Grup yürüyüşlerine katılmayı seviyorum.',
    purposes: ['yuruyus', 'etkinlik'],
    dog: {
      name: 'Duman',
      breed: 'Husky',
      birthYear: 2020,
      size: 'buyuk',
      energy: 'enerjik',
      sociability: 'secici',
      bio: 'Uzun yürüyüşlerin kralı. Bazı köpeklerle mesafeli olabiliyor.',
      photoUrl: 'https://images.unsplash.com/photo-1605568427561-40dd23c2acea?w=800&auto=format&fit=crop',
    },
  },
  {
    email: 'selin@ornek.com',
    name: 'Selin',
    district: 'Üsküdar',
    bio: 'Yaşlı bir köpeğim var, kısa ve sakin yürüyüşler tercih ediyoruz.',
    purposes: ['sosyal', 'yuruyus'],
    dog: {
      name: 'Maya',
      breed: 'Cocker Spaniel',
      birthYear: 2015,
      size: 'orta',
      energy: 'sakin',
      sociability: 'sosyal',
      bio: 'Sakin, uysal ve çok sevecen. Kısa yürüyüşler ona yetiyor.',
      photoUrl: 'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?w=800&auto=format&fit=crop',
    },
  },
];

async function main(): Promise<void> {
  const db = getDb();
  await runMigrations(db);

  const reset = process.argv.includes('--reset');
  if (reset) {
    // Sıra önemli: yabancı anahtar bağımlılıkları önce silinir.
    for (const table of [
      'messages',
      'conversations',
      'event_participants',
      'events',
      'blocks',
      'reports',
      'analytics_events',
      'walk_points',
      'walk_shares',
      'walks',
      'walk_invite_participants',
      'walk_invites',
      'play_group_members',
      'play_groups',
      'dog_journal_entries',
      'dog_documents',
      'dog_memories',
      'dog_emergency_cards',
      'community_alert_photos',
      'community_alerts',
      'lost_dog_posts',
      'event_reviews',
      'media_objects',
      'push_tokens',
      'notification_preferences',
      'dogs',
      'users',
    ]) {
      await db.exec(`DELETE FROM ${table}`);
    }
    console.log('[seed] mevcut veri temizlendi');
  }

  const ts = nowMs();
  const passwordHash = bcrypt.hashSync('patimeet123', 10);
  const created: Array<{ userId: string; dogId: string; seed: SeedUser }> = [];

  for (const seed of users) {
    const exists = await db.one<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      seed.email,
    ]);
    if (exists) {
      console.log(`[seed] ${seed.email} zaten var, atlanıyor`);
      continue;
    }

    const userId = newId();
    await db.exec(
      `INSERT INTO users
         (id, email, password_hash, provider, name, district, bio, purpose, purposes,
          email_verified_at, terms_accepted_at, privacy_accepted_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'email', $4, $5, $6, $7, $8, $9, $9, $9, $9, $9)`,
      [
        userId,
        seed.email,
        passwordHash,
        seed.name,
        seed.district,
        seed.bio,
        // Eski tek değerli kolon ilk seçimle uyumlu kalır.
        seed.purposes[0] ?? null,
        seed.purposes,
        ts,
      ]
    );

    const dogId = newId();
    await db.exec(
      `INSERT INTO dogs
         (id, owner_id, name, breed, birth_year, size, energy, sociability, bio, vaccinated, photo_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11, $11)`,
      [
        dogId,
        userId,
        seed.dog.name,
        seed.dog.breed,
        seed.dog.birthYear,
        seed.dog.size,
        seed.dog.energy,
        seed.dog.sociability,
        seed.dog.bio,
        seed.dog.photoUrl,
        ts,
      ]
    );

    created.push({ userId, dogId, seed });
  }

  if (created.length > 0) {
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

    for (const event of events) {
      const owner = created[event.owner];
      if (!owner) continue;

      const eventId = newId();
      await db.exec(
        `INSERT INTO events
           (id, owner_id, title, type, starts_at, district, meeting_point, capacity, dog_size, description, rules, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
        [
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
        ]
      );

      await db.exec(
        `INSERT INTO event_participants (id, event_id, user_id, dog_id, created_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id, user_id) DO NOTHING`,
        [newId(), eventId, owner.userId, owner.dogId, ts]
      );

      // Sahibi dışında bir katılımcı daha ekleyerek katılımcı listesini doldur.
      const guest = created.find((c) => c.userId !== owner.userId);
      if (guest) {
        await db.exec(
          `INSERT INTO event_participants (id, event_id, user_id, dog_id, created_at)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id, user_id) DO NOTHING`,
          [newId(), eventId, guest.userId, guest.dogId, ts]
        );
      }
    }

    // Örnek bir konuşma ve okunmamış mesaj.
    if (created.length >= 2) {
      const [first, second] = created;
      const [a, b] =
        first.userId < second.userId
          ? [first.userId, second.userId]
          : [second.userId, first.userId];

      const conversationId = newId();
      await db.exec(
        'INSERT INTO conversations (id, user_a_id, user_b_id, last_message_at, created_at) VALUES ($1, $2, $3, $4, $4)',
        [conversationId, a, b, ts]
      );

      const messages: Array<[string, string, number | null, number]> = [
        [
          second.userId,
          'Merhaba! Pati ile bu hafta sonu parkta buluşmak ister misiniz?',
          null,
          ts - 3600_000,
        ],
        [
          first.userId,
          'Merhaba, çok isteriz! Cumartesi sabahı uygun olur mu?',
          ts - 1800_000,
          ts - 1800_000,
        ],
        [second.userId, 'Cumartesi 10:00 bize uyar, görüşmek üzere!', null, ts - 600_000],
      ];

      for (const [senderId, body, readAt, createdAt] of messages) {
        await db.exec(
          'INSERT INTO messages (id, conversation_id, sender_id, body, read_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [newId(), conversationId, senderId, body, readAt, createdAt]
        );
      }
    }
    /**
     * Güvenli Topluluk örnekleri.
     *
     * Yalnızca fotoğraf zorunluluğu olmayan türler ekleniyor: seed sahte bir
     * media_objects kaydı üretmiyor, dolayısıyla kayıp/bulunan hayvan ilanı
     * için gerçek bir yükleme gerekir (uygulamadan denenebilir).
     */
    const alerts = [
      {
        owner: 0,
        type: 'zehirli_yem',
        district: 'Kadıköy',
        areaNote: 'Yoğurtçu Parkı çevresi',
        occurredAt: ts - 6 * 60 * 60 * 1000,
        description:
          'Park girişinde açıkta bırakılmış şüpheli yem gördük. Köpeğinizi tasmasız bırakmayın, yerden bir şey yemesine izin vermeyin.',
      },
      {
        owner: 3,
        type: 'destek',
        district: 'Şişli',
        areaNote: 'Mahalle içi',
        occurredAt: null,
        description:
          'Sokak köpekleri için mama desteği topluyoruz. Katkı sağlamak veya ulaşım için yardım etmek isterseniz mesaj atın.',
      },
    ];

    for (const alert of alerts) {
      const owner = created[alert.owner];
      if (!owner) continue;

      await db.exec(
        `INSERT INTO community_alerts
           (id, author_id, type, animal_name, district, area_note, occurred_at,
            description, status, created_at, updated_at)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 'active', $8, $8)`,
        [
          newId(),
          owner.userId,
          alert.type,
          alert.district,
          alert.areaNote,
          alert.occurredAt,
          alert.description,
          ts,
        ]
      );
    }
  }

  console.log(`[seed] ${created.length} kullanıcı ve köpek profili oluşturuldu`);
  if (created.length > 0) {
    console.log('[seed] Demo giriş bilgileri (tüm hesaplar için şifre: patimeet123):');
    for (const c of created) console.log(`         ${c.seed.email}`);
  }

  await db.close();
}

main().catch((error) => {
  console.error('[seed] hata:', error);
  process.exit(1);
});
