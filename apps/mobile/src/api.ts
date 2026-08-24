import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API adresini çözer.
 *
 * Gerçek cihazda `localhost` telefonun kendisini gösterdiği için, Expo'nun
 * geliştirme sunucusu ana makine IP'sini `hostUri` içinde verir; onu kullanıp
 * API portuna yönlendiriyoruz. Yayın derlemelerinde EXPO_PUBLIC_API_URL veya
 * app.json içindeki `extra.apiUrl` geçerlidir.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const configured = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (hostUri && Platform.OS !== 'web') {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:4000`;
    }
  }

  return (configured ?? 'http://localhost:4000').replace(/\/$/, '');
}

export const API_URL = resolveApiUrl();

/** Sunucudan gelen yapılandırılmış hataları taşıyan tip. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Bazı uçlar (yasal metinler) oturum gerektirmez. */
  skipAuth?: boolean;
  /**
   * Ham bayt gövdesi (görsel yükleme). Verildiğinde JSON serileştirme
   * yapılmaz ve `content-type` bu değere göre ayarlanır.
   */
  raw?: { data: Blob | ArrayBuffer; contentType: string };
  /** Yükleme gibi uzun süren istekler için özel zaman aşımı. */
  timeoutMs?: number;
}

const TIMEOUT_MS = 15000;

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!options.raw) headers['content-type'] = 'application/json';
  else headers['content-type'] = options.raw.contentType;
  if (authToken && !options.skipAuth) headers.authorization = `Bearer ${authToken}`;

  // Bağlantı hatalarında ekranın süresiz "yükleniyor" kalmaması için zaman aşımı.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.raw
        ? (options.raw.data as BodyInit)
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, 'timeout', 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.');
    }
    throw new ApiError(
      0,
      'network_error',
      'İnternet bağlantısı kurulamadı. Bağlantınızı kontrol edip tekrar deneyin.'
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown',
      error?.message ?? 'Beklenmeyen bir hata oluştu. Tekrar deneyin.'
    );
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sunucu ile paylaşılan veri tipleri
// ---------------------------------------------------------------------------

export interface Dog {
  id: string;
  ownerId: string;
  name: string;
  breed: string | null;
  birthYear: number | null;
  age: number | null;
  size: string;
  energy: string;
  sociability: string;
  bio: string;
  vaccinated: boolean;
  photoUrl: string | null;
}

export interface PublicUser {
  id: string;
  name: string;
  district: string | null;
  bio: string;
  /** Çoklu seçim: "Ne arıyorsun?" cevapları. */
  purposes: string[];
  /** Eski tek değerli alan — sunucu ilk seçimi gönderir. */
  purpose: string | null;
  photoUrl: string | null;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  district: string | null;
  bio: string;
  /** Çoklu seçim: "Ne arıyorsun?" cevapları. */
  purposes: string[];
  /** Eski tek değerli alan — sunucu ilk seçimi gönderir. */
  purpose: string | null;
  photoUrl: string | null;
  status: string;
  dogs: Dog[];
  profileComplete: boolean;
  hasDog: boolean;
  termsAcceptedAt: number | null;
  privacyAcceptedAt: number | null;
  /** Hesap bir Google kimliğine bağlı mı? */
  googleLinked: boolean;
  /** Hesap bir Apple kimliğine bağlı mı? */
  appleLinked: boolean;
  hasPassword: boolean;
  /** Hesap eşleştirmesi sırasında şifre girişi kapatıldı mı? */
  passwordLoginDisabled: boolean;
}

export interface EventSummary {
  id: string;
  title: string;
  type: string;
  startsAt: number;
  district: string;
  meetingPoint: string;
  capacity: number;
  dogSize: string;
  description: string;
  rules: string;
  coverPhotoUrl: string | null;
  status: string;
  participantCount: number;
  spotsLeft: number;
  isFull: boolean;
  isOwner: boolean;
  hasJoined: boolean;
  owner: PublicUser | null;
}

export interface Conversation {
  id: string;
  user: PublicUser;
  lastMessage: { body: string; createdAt: number; isMine: boolean } | null;
  unreadCount: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: number;
  isMine: boolean;
}

/** Açıklanabilir uyum skoru — alt kırılımlarıyla. */
export interface MatchFactor {
  key: 'energy' | 'sociability' | 'size' | 'district' | 'purpose' | 'age';
  label: string;
  points: number;
  max: number;
  note: string;
}

export interface MatchScore {
  score: number;
  level: 'yuksek' | 'orta' | 'dusuk';
  factors: MatchFactor[];
  /** Bilgi eksikliği nedeniyle hesaplanamayan etkenler. */
  missing: string[];
}

export interface MatchBreakdown extends MatchScore {
  viewerDogId: string;
  viewerDogName: string;
  targetDogId: string;
}

export interface DiscoverItem {
  dog: Dog;
  owner: PublicUser;
  /** İzleyenin köpeği yoksa null. */
  match: (MatchScore & { viewerDogId: string }) | null;
}


/** Yükleme türü — sunucudaki `MediaPurpose` ile aynı. */
export type MediaPurpose =
  | 'user_photo'
  | 'dog_photo'
  | 'event_photo'
  | 'alert_photo'
  | 'walk_photo'
  | 'memory_photo'
  | 'group_photo'
  | 'document';

/** Güvenli Topluluk bildirim türü ve zorunlu alanları. */
export interface AlertTypeInfo {
  value: string;
  label: string;
  description: string;
  requiresAnimalName: boolean;
  /** Her zaman false — fotoğraf hiçbir türde zorunlu değil. */
  requiresPhoto: boolean;
  /** Fotoğraf eklemeyi teşvik eden kısa tavsiye. */
  photoHint?: string;
  requiresOccurredAt: boolean;
}

/**
 * Güvenli Topluluk bildirimi (kayıp hayvan ilanı dahil).
 *
 * Kesin konum alanı bilinçli olarak YOK: yalnızca semt ve serbest metin bir
 * yaklaşık bölge tarifi taşınır.
 */
export interface CommunityAlert {
  id: string;
  type: string;
  typeLabel: string;
  animalName: string | null;
  district: string;
  areaNote: string;
  /** Son görülme / olay zamanı. */
  occurredAt: number | null;
  description: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  /** Görüntülenebilir fotoğraf adresleri (en fazla 5). */
  photos: string[];
  isOwner: boolean;
  /** Uygulama içi mesajla iletişim için ilan sahibi. */
  author: PublicUser | null;
  /** Eski kayıp ilanı kaydından taşındıysa kaynağın kimliği. */
  sourceLostDogId: string | null;
}

/** Yaklaşık bölge özeti — semt düzeyinde sayılar, konum verisi değil. */
export interface AreaSummary {
  district: string;
  nearbyDogs: number;
  upcomingEvents: number;
  activeAlerts: number;
  lostDogAlerts: number;
}

/** Etkinlik sonrası güven değerlendirmesi. */
export interface EventReview {
  rating: number;
  feltSafe: boolean;
  comment: string;
  createdAt: number;
}

export interface AlertPayload {
  type: string;
  animalName?: string | null;
  district: string;
  areaNote?: string;
  occurredAt?: number | null;
  description: string;
  /** Yüklenen fotoğrafların depo anahtarları. */
  photoKeys?: string[];
}

export interface NotificationPreferences {
  messages: boolean;
  events: boolean;
  safety: boolean;
  /** Aşı, ilaç ve bakım hatırlatmaları. */
  care: boolean;
  /** Hızlı yürüyüş davetleri. */
  invites: boolean;
}

// --- Canlı Yürüyüş ---

export interface WalkPoint {
  lat: number;
  lng: number;
  recordedAt: number;
}

export interface Walk {
  id: string;
  dogId: string | null;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number;
  distanceMeters: number;
  paceSecondsPerKm: number | null;
  /** TAHMİNDİR — sağlık ölçümü değildir. */
  estimatedCalories: number;
  hideEndpoints: boolean;
  district: string | null;
  note: string;
  photoUrl: string | null;
  createdAt: number;
  /** Uçları gizlenmiş rota özeti; ham rota yalnızca ayrı uçtan gelir. */
  route?: WalkPoint[];
}

export interface WalkSummary {
  weeklySeconds: number;
  weeklyMeters: number;
  weeklyWalks: number;
  todaySeconds: number;
}

// --- Köpeğimin Günlüğü ---

export interface JournalTypeInfo {
  value: string;
  label: string;
  numeric?: { label: string; unit: string; min: number; max: number };
  repeatDays?: number[];
  remindable?: boolean;
}

export interface JournalEntry {
  id: string;
  dogId: string;
  type: string;
  typeLabel: string;
  title: string;
  note: string;
  occurredAt: number;
  remindAt: number | null;
  reminderStatus: string | null;
  repeatIntervalDays: number | null;
  value: number | null;
  valueUnit: string | null;
  createdAt: number;
  /** Yalnızca hatırlatma listesinde dolu. */
  dogName?: string;
}

export interface JournalOverview {
  upcoming: JournalEntry[];
  overdue: JournalEntry[];
  recent: JournalEntry[];
  weightSeries: Array<{ occurredAt: number; value: number | null }>;
}

export interface DogDocument {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  url: string | null;
  createdAt: number;
}

export interface DogDocumentDetail extends DogDocument {
  /** Yüklemede doğrulanan gerçek MIME türü — uzantıya değil buna güvenilir. */
  contentType: string | null;
}

export interface DogMemory {
  id: string;
  photoUrl: string | null;
  note: string;
  occurredAt: number;
  walkId: string | null;
  eventId: string | null;
}

export interface EmergencyCard {
  healthNote: string;
  allergies: string;
  medications: string;
  chipNumber: string | null;
  clinicName: string | null;
  shared: boolean;
  shareToken: string | null;
  updatedAt: number;
}

// --- Mahalle Akışı ---

export interface WalkInvite {
  id: string;
  district: string;
  areaNote: string;
  startsAt: number;
  expiresAt: number;
  durationMinutes: number;
  pace: string;
  dogSize: string;
  note: string;
  status: string;
  expired: boolean;
  participantCount: number;
  isOwner: boolean;
  hasJoined: boolean;
  owner: PublicUser | null;
  createdAt: number;
}

export interface PlayGroup {
  id: string;
  name: string;
  district: string;
  dogSize: string;
  playStyle: string;
  description: string;
  coverPhotoUrl: string | null;
  memberCount: number;
  isMember: boolean;
  isOwner: boolean;
  upcomingEventCount: number;
  createdAt: number;
}

export interface FeedItem {
  kind: 'event' | 'alert' | 'invite';
  id: string;
  title: string;
  subtitle: string;
  district: string;
  sortAt: number;
  photoUrl: string | null;
  meta: Record<string, string | number | boolean | null>;
}
/** @deprecated Kayıp ilanları artık `CommunityAlert` (`kayip_hayvan` türü). */
export interface LostDogPost { id:string; district:string; lastSeenArea:string; details:string; status:string; createdAt:number; isOwner:boolean; dog:Dog|null; owner:PublicUser|null }

/** Köpek profili oluşturma/güncelleme gövdesi — DogForm çıktısıyla eşleşir. */
export interface DogPayload {
  name: string;
  size: string;
  energy: string;
  sociability: string;
  breed?: string | null;
  birthYear?: number | null;
  bio?: string;
  vaccinated?: boolean;
  photoUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Uç noktalar
// ---------------------------------------------------------------------------

export const api = {
  areaSummary: () => apiRequest<AreaSummary>('/api/community/area-summary'),
  lostDogs: (district?:string) => apiRequest<{posts:LostDogPost[]}>(`/api/community/lost-dogs${district ? `?district=${encodeURIComponent(district)}` : ''}`),
  createLostDog: (body:{dogId:string;district:string;lastSeenArea:string;details?:string}) => apiRequest<{ok:boolean;message:string}>('/api/community/lost-dogs',{method:'POST',body}),
  markDogFound: (id:string) => apiRequest<{ok:boolean;message:string}>(`/api/community/lost-dogs/${id}/found`,{method:'POST'}),
  reviewEvent: (id: string, body: { rating: number; feltSafe: boolean; comment?: string }) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/community/events/${id}/review`, {
      method: 'POST',
      body,
    }),

  /** Kullanıcının bu etkinliğe daha önce yaptığı değerlendirme (yoksa null). */
  eventReview: (id: string) =>
    apiRequest<{ review: EventReview | null }>(`/api/community/events/${id}/review`),
  register: (body: {
    email: string;
    password: string;
    acceptTerms: true;
    acceptPrivacy: true;
  }) => apiRequest<{ token: string; user: CurrentUser }>('/api/auth/register', {
    method: 'POST',
    body,
    skipAuth: true,
  }),

  login: (body: { email: string; password: string }) =>
    apiRequest<{ token: string; user: CurrentUser }>('/api/auth/login', {
      method: 'POST',
      body,
      skipAuth: true,
    }),

  /**
   * Google ID token'ını sunucuya doğrulatır ve oturum açar.
   * Yeni hesap oluşturulacaksa sözleşme onayları gönderilmelidir; aksi halde
   * sunucu `consent_required` döner.
   */
  googleSignIn: (body: { idToken: string; acceptTerms?: boolean; acceptPrivacy?: boolean }) =>
    apiRequest<{
      token: string;
      user: CurrentUser;
      isNewUser: boolean;
      linkedExistingAccount: boolean;
      passwordLoginDisabled: boolean;
    }>('/api/auth/google', { method: 'POST', body, skipAuth: true }),

  /** Sunucu tarafında Google ile girişin açık olup olmadığı. */
  googleConfig: () =>
    apiRequest<{ enabled: boolean; configuredClientCount: number }>('/api/auth/google/config', {
      skipAuth: true,
    }),

  /**
   * Apple kimlik token'ını sunucuya doğrulatır ve oturum açar.
   *
   * Apple adı yalnızca ilk yetkilendirmede ve token dışında verir; varsa
   * `fullName` ile iletilir.
   */
  appleSignIn: (body: {
    idToken: string;
    fullName?: string;
    acceptTerms?: boolean;
    acceptPrivacy?: boolean;
  }) =>
    apiRequest<{
      token: string;
      user: CurrentUser;
      isNewUser: boolean;
      linkedExistingAccount: boolean;
      passwordLoginDisabled: boolean;
    }>('/api/auth/apple', { method: 'POST', body, skipAuth: true }),

  /** Sunucu tarafında Apple ile girişin açık olup olmadığı. */
  appleConfig: () =>
    apiRequest<{ enabled: boolean; configuredClientCount: number }>('/api/auth/apple/config', {
      skipAuth: true,
    }),

  // --- Görsel yükleme ---

  /**
   * Görseli obje deposuna yükler ve kalıcı bir depo anahtarı döner.
   *
   * Dönen `key` değeri profil veya köpek güncellemesinde `photoUrl` alanına
   * yazılır. Cihaz üzerindeki geçici URI yerine bu anahtar saklandığı için
   * fotoğraf tüm cihazlarda görünür.
   */
  uploadPhoto: (
    purpose: MediaPurpose,
    data: Blob | ArrayBuffer,
    contentType: string
  ) =>
    apiRequest<{ key: string; url: string; mediaId: string }>(`/api/media/${purpose}`, {
      method: 'POST',
      raw: { data, contentType },
      // Yükleme mobil bağlantıda uzun sürebilir.
      timeoutMs: 60000,
    }),

  deletePhoto: (mediaId: string) =>
    apiRequest<{ ok: boolean }>(`/api/media/${mediaId}`, { method: 'DELETE' }),

  /** `document` amacı için PDF dahil izin verilen türleri döner. */
  uploadLimits: (purpose?: MediaPurpose) =>
    apiRequest<{ contentTypes: string[]; maxBytes: number }>(
      `/api/media/allowed-types${purpose ? `?purpose=${purpose}` : ''}`,
      { skipAuth: true }
    ),

  // --- Push bildirimleri ---

  registerPushToken: (body: { token: string; platform: 'ios' | 'android' }) =>
    apiRequest<{ ok: boolean; pushEnabled: boolean }>('/api/push/tokens', {
      method: 'POST',
      body,
    }),

  unregisterPushToken: (token: string) =>
    apiRequest<{ ok: boolean }>('/api/push/tokens', { method: 'DELETE', body: { token } }),

  notificationPreferences: () =>
    apiRequest<{ preferences: NotificationPreferences; pushEnabled: boolean }>(
      '/api/push/preferences'
    ),

  updateNotificationPreferences: (body: Partial<NotificationPreferences>) =>
    apiRequest<{ preferences: NotificationPreferences }>('/api/push/preferences', {
      method: 'PATCH',
      body,
    }),

  /** KVKK erişim hakkı: kullanıcının kendi verisinin özeti. */
  myData: () => apiRequest<Record<string, unknown>>('/api/auth/my-data'),

  me: () => apiRequest<{ user: CurrentUser }>('/api/auth/me'),

  logout: () => apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  deleteAccount: () =>
    apiRequest<{ ok: boolean; message: string }>('/api/auth/delete-account', {
      method: 'POST',
      body: { confirm: true },
    }),

  updateProfile: (body: {
    name?: string;
    district?: string | null;
    bio?: string;
    /** Çoklu seçim. Boş dizi seçimi temizler. */
    purposes?: string[];
    photoUrl?: string | null;
  }) => apiRequest<{ user: CurrentUser }>('/api/users/me', { method: 'PATCH', body }),

  userProfile: (id: string, dogId?: string) =>
    apiRequest<{
      user: PublicUser;
      dogs: Dog[];
      isSelf: boolean;
      /** İzleyenin her köpeği için uyum kırılımı; en uyumlu ilk sırada. */
      matches: MatchBreakdown[];
    }>(`/api/users/${id}${dogId ? `?dogId=${encodeURIComponent(dogId)}` : ''}`),

  myDogs: () => apiRequest<{ dogs: Dog[] }>('/api/dogs'),

  createDog: (body: DogPayload) => apiRequest<{ dog: Dog }>('/api/dogs', { method: 'POST', body }),

  updateDog: (id: string, body: Partial<DogPayload>) =>
    apiRequest<{ dog: Dog }>(`/api/dogs/${id}`, { method: 'PATCH', body }),

  /** Köpek profili silme. Son köpek silinemez (sunucu 400 döner). */
  deleteDog: (id: string) => apiRequest<{ ok: boolean }>(`/api/dogs/${id}`, { method: 'DELETE' }),

  discover: (params: { district?: string; size?: string; energy?: string; search?: string }) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<{ items: DiscoverItem[]; hasMore: boolean }>(`/api/discover${suffix}`);
  },

  districts: () => apiRequest<{ districts: string[] }>('/api/discover/districts', { skipAuth: true }),

  events: (params: { district?: string; type?: string; scope?: string } = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<{ events: EventSummary[] }>(`/api/events${suffix}`);
  },

  event: (id: string) =>
    apiRequest<{
      event: EventSummary;
      participants: Array<{ user: PublicUser; dog: Dog | null }>;
    }>(`/api/events/${id}`),

  createEvent: (body: {
    title: string;
    type: string;
    startsAt: number;
    district: string;
    meetingPoint: string;
    capacity: number;
    dogSize?: string;
    description?: string;
    rules?: string;
    coverPhotoUrl?: string | null;
  }) => apiRequest<{ event: EventSummary }>('/api/events', { method: 'POST', body }),

  joinEvent: (id: string, dogId?: string) =>
    apiRequest<{ event: EventSummary }>(`/api/events/${id}/join`, {
      method: 'POST',
      body: dogId ? { dogId } : {},
    }),

  leaveEvent: (id: string) =>
    apiRequest<{ event: EventSummary }>(`/api/events/${id}/leave`, { method: 'POST' }),

  cancelEvent: (id: string) =>
    apiRequest<{ event: EventSummary }>(`/api/events/${id}/cancel`, { method: 'POST' }),

  conversations: () =>
    apiRequest<{ conversations: Conversation[]; totalUnread: number }>('/api/messages/conversations'),

  openConversation: (userId: string) =>
    apiRequest<{ conversation: { id: string; user: PublicUser } }>('/api/messages/conversations', {
      method: 'POST',
      body: { userId },
    }),

  messages: (conversationId: string) =>
    apiRequest<{
      conversation: { id: string; user: PublicUser };
      messages: ChatMessage[];
      canSend: boolean;
      blocked: boolean;
    }>(`/api/messages/conversations/${conversationId}/messages`),

  sendMessage: (conversationId: string, body: string) =>
    apiRequest<{ message: ChatMessage }>(`/api/messages/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body },
    }),

  unreadCount: () => apiRequest<{ unreadCount: number }>('/api/messages/unread-count'),

  reportReasons: () =>
    apiRequest<{ reasons: Array<{ value: string; label: string }> }>(
      '/api/safety/report-reasons',
      { skipAuth: true }
    ),

  report: (body: {
    targetType: 'user' | 'event' | 'alert';
    targetId: string;
    reason: string;
    details?: string;
  }) => apiRequest<{ ok: boolean; message: string }>('/api/safety/reports', { method: 'POST', body }),

  block: (userId: string) =>
    apiRequest<{ ok: boolean; message: string }>('/api/safety/blocks', {
      method: 'POST',
      body: { userId },
    }),

  unblock: (userId: string) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/safety/blocks/${userId}`, {
      method: 'DELETE',
    }),

  blockedUsers: () => apiRequest<{ blocked: PublicUser[] }>('/api/safety/blocks'),

  // --- Güvenli Topluluk bildirimleri ---

  // --- Canlı Yürüyüş ---

  activeWalk: () =>
    apiRequest<{ walk: Walk | null; pointCount?: number; shares?: Array<{ shared_with_id: string; expires_at: number; name: string }> }>(
      '/api/walks/active'
    ),

  startWalk: (body: { dogId?: string | null; district?: string | null; hideEndpoints?: boolean }) =>
    apiRequest<{ walk: Walk }>('/api/walks', { method: 'POST', body }),

  /** Toplu nokta gönderimi; sunucu gürültüyü süzer ve mesafeyi hesaplar. */
  addWalkPoints: (
    id: string,
    body: { points: Array<WalkPoint & { accuracy?: number | null }>; durationSeconds: number }
  ) =>
    apiRequest<{
      walk: Walk;
      accepted: number;
      rejected: { accuracy: number; jump: number; jitter: number };
    }>(`/api/walks/${id}/points`, { method: 'POST', body }),

  setWalkStatus: (id: string, status: 'active' | 'paused') =>
    apiRequest<{ walk: Walk }>(`/api/walks/${id}`, { method: 'PATCH', body: { status } }),

  finishWalk: (
    id: string,
    body: { durationSeconds?: number; note?: string; photoUrl?: string | null; cancel?: boolean }
  ) => apiRequest<{ walk: Walk }>(`/api/walks/${id}/finish`, { method: 'POST', body }),

  walkRoute: (id: string) => apiRequest<{ points: WalkPoint[] }>(`/api/walks/${id}/route`),

  walkSummary: () => apiRequest<WalkSummary>('/api/walks/summary'),

  walks: () => apiRequest<{ walks: Walk[] }>('/api/walks'),

  shareWalk: (id: string, body: { userId: string; minutes: number }) =>
    apiRequest<{ ok: boolean; expiresAt: number }>(`/api/walks/${id}/share`, {
      method: 'POST',
      body,
    }),

  stopWalkSharing: (id: string) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/walks/${id}/share`, { method: 'DELETE' }),

  // --- Köpeğimin Günlüğü ---

  journalTypes: () =>
    apiRequest<{ types: JournalTypeInfo[]; documentTypes: Array<{ value: string; label: string }> }>(
      '/api/journal/types',
      { skipAuth: true }
    ),

  journalOverview: (dogId: string) =>
    apiRequest<JournalOverview>(`/api/journal/${dogId}/overview`),

  journalEntries: (dogId: string, type?: string) =>
    apiRequest<{ entries: JournalEntry[] }>(
      `/api/journal/${dogId}/entries${type ? `?type=${encodeURIComponent(type)}` : ''}`
    ),

  addJournalEntry: (body: {
    dogId: string;
    type: string;
    title?: string;
    note?: string;
    occurredAt: number;
    remindAt?: number | null;
    repeatIntervalDays?: number | null;
    value?: number | null;
  }) => apiRequest<{ entry: JournalEntry }>('/api/journal/entries', { method: 'POST', body }),

  updateReminder: (
    id: string,
    body: { status: 'pending' | 'done' | 'snoozed' | 'cancelled'; snoozeUntil?: number | null }
  ) =>
    apiRequest<{ entry: JournalEntry }>(`/api/journal/entries/${id}/reminder`, {
      method: 'PATCH',
      body,
    }),

  deleteJournalEntry: (id: string) =>
    apiRequest<{ ok: boolean }>(`/api/journal/entries/${id}`, { method: 'DELETE' }),

  /** Uygulama içi hatırlatmalar — push olmasa da çalışır. */
  reminders: () => apiRequest<{ reminders: JournalEntry[] }>('/api/journal/reminders'),

  documents: (dogId: string) =>
    apiRequest<{ documents: DogDocument[] }>(`/api/journal/${dogId}/documents`),

  /** Uygulama içi belge önizlemesi için tür ve süreli adres dahil tam bilgi. */
  document: (id: string) =>
    apiRequest<{ document: DogDocumentDetail }>(`/api/journal/documents/${id}`),

  addDocument: (body: { dogId: string; type: string; title?: string; storageKey: string }) =>
    apiRequest<{ id: string; ok: boolean }>('/api/journal/documents', { method: 'POST', body }),

  deleteDocument: (id: string) =>
    apiRequest<{ ok: boolean }>(`/api/journal/documents/${id}`, { method: 'DELETE' }),

  memories: (dogId: string) =>
    apiRequest<{ memories: DogMemory[] }>(`/api/journal/${dogId}/memories`),

  addMemory: (body: {
    dogId: string;
    storageKey?: string | null;
    note?: string;
    occurredAt: number;
    walkId?: string | null;
    eventId?: string | null;
  }) => apiRequest<{ id: string; ok: boolean }>('/api/journal/memories', { method: 'POST', body }),

  emergencyCard: (dogId: string) =>
    apiRequest<{ card: EmergencyCard | null }>(`/api/journal/${dogId}/emergency`),

  saveEmergencyCard: (
    dogId: string,
    body: {
      healthNote?: string;
      allergies?: string;
      medications?: string;
      chipNumber?: string | null;
      clinicName?: string | null;
    }
  ) => apiRequest<{ card: EmergencyCard }>(`/api/journal/${dogId}/emergency`, { method: 'PUT', body }),

  setEmergencySharing: (dogId: string, enabled: boolean) =>
    apiRequest<{ shared: boolean; shareToken: string | null }>(
      `/api/journal/${dogId}/emergency/share`,
      { method: 'POST', body: { enabled } }
    ),

  // --- Mahalle Akışı ---

  feed: (params: { district?: string; kinds?: string } = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<{ items: FeedItem[] }>(`/api/neighbourhood/feed${suffix}`);
  },

  inviteOptions: () =>
    apiRequest<{ paces: Array<{ value: string; label: string }>; maxActive: number }>(
      '/api/neighbourhood/invite-options',
      { skipAuth: true }
    ),

  invites: (params: { district?: string; scope?: 'all' | 'mine' } = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<{ invites: WalkInvite[] }>(`/api/neighbourhood/invites${suffix}`);
  },

  invite: (id: string) =>
    apiRequest<{ invite: WalkInvite }>(`/api/neighbourhood/invites/${id}`),

  createInvite: (body: {
    dogId?: string | null;
    district: string;
    areaNote?: string;
    startsAt: number;
    durationMinutes: number;
    pace: string;
    dogSize?: string;
    note?: string;
  }) =>
    apiRequest<{ invite: WalkInvite; notified: number }>('/api/neighbourhood/invites', {
      method: 'POST',
      body,
    }),

  joinInvite: (id: string, dogId?: string | null) =>
    apiRequest<{ invite: WalkInvite; message: string }>(
      `/api/neighbourhood/invites/${id}/join`,
      { method: 'POST', body: { dogId: dogId ?? null } }
    ),

  leaveInvite: (id: string) =>
    apiRequest<{ invite: WalkInvite }>(`/api/neighbourhood/invites/${id}/leave`, { method: 'POST' }),

  cancelInvite: (id: string) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/neighbourhood/invites/${id}/cancel`, {
      method: 'POST',
    }),

  groups: (params: { district?: string; scope?: 'all' | 'mine' } = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<{ groups: PlayGroup[] }>(`/api/neighbourhood/groups${suffix}`);
  },

  createGroup: (body: {
    name: string;
    district: string;
    dogSize?: string;
    playStyle?: string;
    description?: string;
    coverPhotoUrl?: string | null;
  }) => apiRequest<{ group: PlayGroup }>('/api/neighbourhood/groups', { method: 'POST', body }),

  joinGroup: (id: string) =>
    apiRequest<{ group: PlayGroup }>(`/api/neighbourhood/groups/${id}/join`, { method: 'POST' }),

  leaveGroup: (id: string) =>
    apiRequest<{ group: PlayGroup }>(`/api/neighbourhood/groups/${id}/leave`, { method: 'POST' }),

  alertTypes: () =>
    apiRequest<{ types: AlertTypeInfo[]; maxPhotos: number }>('/api/safety/alert-types', {
      skipAuth: true,
    }),

  alerts: (
    params: {
      type?: string;
      district?: string;
      scope?: 'all' | 'mine';
      status?: 'active' | 'resolved';
    } = {}
  ) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<{ alerts: CommunityAlert[]; hasMore: boolean }>(
      `/api/safety/alerts${suffix}`
    );
  },

  alert: (id: string) => apiRequest<{ alert: CommunityAlert }>(`/api/safety/alerts/${id}`),

  createAlert: (body: AlertPayload) =>
    apiRequest<{ alert: CommunityAlert; notified: number }>('/api/safety/alerts', {
      method: 'POST',
      body,
    }),

  /** İlanı çözüldü (ör. hayvan bulundu) olarak işaretler. */
  updateAlertStatus: (id: string, status: 'active' | 'resolved') =>
    apiRequest<{ alert: CommunityAlert }>(`/api/safety/alerts/${id}`, {
      method: 'PATCH',
      body: { status },
    }),

  deleteAlert: (id: string) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/safety/alerts/${id}`, { method: 'DELETE' }),

  legalDocuments: () =>
    apiRequest<{ documents: Array<{ slug: string; title: string; updatedAt: string }> }>(
      '/api/legal',
      { skipAuth: true }
    ),

  legalDocument: (slug: string) =>
    apiRequest<{ slug: string; title: string; updatedAt: string; body: string }>(
      `/api/legal/${slug}`,
      { skipAuth: true }
    ),
};
