import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, setAuthToken, type CurrentUser } from './api';

const TOKEN_KEY = 'patimeet.token';

interface SessionValue {
  /** Açılış ekranı boyunca true; kaydedilmiş oturum okunuyor. */
  initializing: boolean;
  token: string | null;
  user: CurrentUser | null;
  signIn: (token: string, user: CurrentUser) => Promise<void>;
  signOut: () => Promise<void>;
  /** Profil/köpek değişikliklerinden sonra kullanıcıyı tazeler. */
  refresh: () => Promise<void>;
  setUser: (user: CurrentUser) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);

  // Uygulama açılışında kaydedilmiş token'ı doğrulayıp oturumu geri yükler.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(TOKEN_KEY);
        if (!stored) return;

        setAuthToken(stored);
        const { user: fetched } = await api.me();
        if (cancelled) return;

        setToken(stored);
        setUser(fetched);
      } catch (error) {
        // Token geçersiz veya hesap kapatılmışsa oturumu temizle. Ağ hatasında
        // da giriş ekranına düşmek, yarı açık bir oturumdan daha öngörülebilir.
        if (error instanceof ApiError && error.status !== 0) {
          await AsyncStorage.removeItem(TOKEN_KEY);
        }
        setAuthToken(null);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (nextToken: string, nextUser: CurrentUser) => {
    setAuthToken(nextToken);
    await AsyncStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Sunucuya ulaşılamasa bile yerel oturumu kapatıyoruz.
    }
    setAuthToken(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const { user: fetched } = await api.me();
    setUser(fetched);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ initializing, token, user, signIn, signOut, refresh, setUser }),
    [initializing, token, user, signIn, signOut, refresh]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession, SessionProvider içinde kullanılmalı.');
  return context;
}
