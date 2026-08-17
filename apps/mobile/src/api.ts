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
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Bazı uçlar (yasal metinler) oturum gerektirmez. */
  skipAuth?: boolean;
}

const TIMEOUT_MS = 15000;

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authToken && !options.skipAuth) headers.authorization = `Bearer ${authToken}`;

  // Bağlantı hatalarında ekranın süresiz "yükleniyor" kalmaması için zaman aşımı.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
  purpose: string | null;
  photoUrl: string | null;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  district: string | null;
  bio: string;
  purpose: string | null;
  photoUrl: string | null;
  status: string;
  dogs: Dog[];
  profileComplete: boolean;
  hasDog: boolean;
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

export interface DiscoverItem {
  dog: Dog;
  owner: PublicUser;
}

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

  social: (body: { provider: 'google' | 'apple'; providerId: string; email: string; name?: string }) =>
    apiRequest<{ token: string; user: CurrentUser }>('/api/auth/social', {
      method: 'POST',
      body,
      skipAuth: true,
    }),

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
    purpose?: string | null;
    photoUrl?: string | null;
  }) => apiRequest<{ user: CurrentUser }>('/api/users/me', { method: 'PATCH', body }),

  userProfile: (id: string) =>
    apiRequest<{ user: PublicUser; dogs: Dog[]; isSelf: boolean }>(`/api/users/${id}`),

  myDogs: () => apiRequest<{ dogs: Dog[] }>('/api/dogs'),

  createDog: (body: DogPayload) => apiRequest<{ dog: Dog }>('/api/dogs', { method: 'POST', body }),

  updateDog: (id: string, body: Partial<DogPayload>) =>
    apiRequest<{ dog: Dog }>(`/api/dogs/${id}`, { method: 'PATCH', body }),

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
    targetType: 'user' | 'event';
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
