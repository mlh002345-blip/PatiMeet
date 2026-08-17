import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ApiError } from './api';

interface LoaderState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => void;
  /** Aşağı çekerek yenileme için — tam ekran yükleniyor durumuna geçmez. */
  refresh: () => void;
  setData: (data: T) => void;
}

/**
 * Ekranlarda tekrar eden "yükleniyor / hata / veri" üçlüsünü tek yerde
 * yönetir. Ekran her odaklandığında veriyi tazeler; MVP'de canlı bağlantı
 * olmadığı için listelerin güncel kalmasını bu sağlar.
 */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[] = []): LoaderState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'refresh') setRefreshing(true);
      setError(null);
      try {
        const result = await load();
        setData(result);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Veriler yüklenemedi. Tekrar deneyin.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    deps
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // Odak her değiştiğinde yeniden yükle; iptal edilen istek state'i ezmesin.
      (async () => {
        if (!cancelled) await run(data === null ? 'initial' : 'refresh');
      })();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run])
  );

  const reload = useCallback(() => {
    setLoading(true);
    void run('initial');
  }, [run]);

  const refresh = useCallback(() => {
    void run('refresh');
  }, [run]);

  return { data, loading, refreshing, error, reload, refresh, setData };
}
