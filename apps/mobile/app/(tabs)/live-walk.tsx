import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, type Walk, type WalkPoint } from '../../src/api';
import { AppText } from '../../src/components/ui';
import { WalkMap } from '../../src/components/WalkMap';
import { useSession } from '../../src/session';
import { colors, radius, spacing } from '../../src/theme';
import {
  formatClock,
  formatDistance,
  formatPace,
  LOCATION_SUPPORTED,
  requestPermission,
  startTracking,
  type PermissionState,
  type TrackedPoint,
  type WalkTracker,
} from '../../src/walkTracker';

/** Noktalar bu aralıkla toplu gönderilir; sunucu süzer ve mesafeyi hesaplar. */
const FLUSH_MS = 10_000;

/**
 * Canlı Yürüyüş — gerçek GPS takibi.
 *
 * Sahte harita veya zamana göre uydurulmuş mesafe YOK: mesafe, tempo ve rota
 * gerçek konum noktalarından sunucuda hesaplanır. Konum alınamıyorsa ekran
 * bunu açık bir izin/boş durumu olarak gösterir.
 */
export default function LiveWalkScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useSession();
  const dog = user?.dogs?.[0];

  const [walk, setWalk] = useState<Walk | null>(null);
  const [route, setRoute] = useState<WalkPoint[]>([]);
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [shareExpiresAt, setShareExpiresAt] = useState<number | null>(null);

  const tracker = useRef<WalkTracker | null>(null);
  const walkRef = useRef<Walk | null>(null);
  walkRef.current = walk;

  /** Sunucudan gelen süre + son gönderimden bu yana geçen yerel süre. */
  const baseSeconds = useRef(0);
  const resumedAt = useRef<number | null>(null);

  const stopTracker = useCallback(() => {
    tracker.current?.stop();
    tracker.current = null;
  }, []);

  /** Tampondaki noktaları gönderir ve sunucudan gelen özeti uygular. */
  const flush = useCallback(async () => {
    const current = walkRef.current;
    if (!current || current.status !== 'active') return;

    const points = tracker.current?.drain() ?? [];
    const seconds = liveSeconds();
    if (points.length === 0 && seconds === baseSeconds.current) return;

    try {
      const res = await api.addWalkPoints(current.id, {
        points: points.map((p: TrackedPoint) => ({
          lat: p.lat,
          lng: p.lng,
          accuracy: p.accuracy,
          recordedAt: p.recordedAt,
        })),
        durationSeconds: seconds,
      });
      setWalk(res.walk);
      if (points.length > 0) {
        setRoute((prev) => [
          ...prev,
          ...points.map((p) => ({ lat: p.lat, lng: p.lng, recordedAt: p.recordedAt })),
        ]);
      }
    } catch (err) {
      // Bağlantı koptuysa noktalar tamponda kalır ve bir sonraki turda gider.
      if (err instanceof ApiError && err.status === 0) return;
      setError(err instanceof ApiError ? err.message : 'Yürüyüş güncellenemedi.');
    }
  }, []);

  function liveSeconds(): number {
    if (resumedAt.current === null) return baseSeconds.current;
    return baseSeconds.current + Math.floor((Date.now() - resumedAt.current) / 1000);
  }

  /** Açılışta süren yürüyüşü kurtar. */
  useEffect(() => {
    let cancelled = false;
    api
      .activeWalk()
      .then(async (res) => {
        if (cancelled) return;
        setWalk(res.walk);
        if (res.walk) {
          baseSeconds.current = res.walk.durationSeconds;
          setElapsed(res.walk.durationSeconds);
          const own = await api.walkRoute(res.walk.id).catch(() => ({ points: [] }));
          if (!cancelled) setRoute(own.points);
          if (res.walk.status === 'active' && LOCATION_SUPPORTED) {
            const perm = await requestPermission();
            if (cancelled) return;
            setPermission(perm.state);
            if (perm.state === 'granted') {
              resumedAt.current = Date.now();
              tracker.current = await startTracking();
            }
          }
        }
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
      stopTracker();
    };
  }, [stopTracker]);

  /** Sayaç ve düzenli gönderim. */
  useEffect(() => {
    if (!walk || walk.status !== 'active') return;
    const tick = setInterval(() => setElapsed(liveSeconds()), 1000);
    const push = setInterval(() => void flush(), FLUSH_MS);
    return () => {
      clearInterval(tick);
      clearInterval(push);
    };
  }, [walk?.id, walk?.status, flush]);

  /**
   * Uygulama arka plana geçtiğinde bekleyen noktaları hemen gönderiyoruz;
   * böylece kısa süreli arka plan geçişinde yürüyüş kaybolmuyor.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flush();
    });
    return () => sub.remove();
  }, [flush]);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      if (LOCATION_SUPPORTED) {
        const perm = await requestPermission();
        setPermission(perm.state);
        setCanAskAgain(perm.canAskAgain);
        if (perm.state !== 'granted') {
          setBusy(false);
          return;
        }
      } else {
        setPermission('unsupported');
        setBusy(false);
        return;
      }

      const res = await api.startWalk({
        dogId: dog?.id ?? null,
        district: user?.district ?? null,
        hideEndpoints: true,
      });
      baseSeconds.current = 0;
      resumedAt.current = Date.now();
      setElapsed(0);
      setRoute([]);
      setWalk(res.walk);
      tracker.current = await startTracking();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yürüyüş başlatılamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    if (!walk) return;
    setBusy(true);
    setError(null);
    try {
      if (walk.status === 'active') {
        await flush();
        baseSeconds.current = liveSeconds();
        resumedAt.current = null;
        stopTracker();
        const res = await api.setWalkStatus(walk.id, 'paused');
        setWalk(res.walk);
      } else {
        const res = await api.setWalkStatus(walk.id, 'active');
        resumedAt.current = Date.now();
        setWalk(res.walk);
        tracker.current = await startTracking();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Durum değiştirilemedi.');
    } finally {
      setBusy(false);
    }
  }

  function confirmFinish() {
    if (!walk) return;
    Alert.alert('Yürüyüşü bitir', 'Yürüyüş kaydedilsin mi?', [
      { text: 'Devam et', style: 'cancel' },
      { text: 'Vazgeç ve sil', style: 'destructive', onPress: () => void finish(true) },
      { text: 'Kaydet ve bitir', onPress: () => void finish(false) },
    ]);
  }

  async function finish(cancel: boolean) {
    if (!walk) return;
    setBusy(true);
    setError(null);
    try {
      await flush();
      const seconds = liveSeconds();
      stopTracker();
      resumedAt.current = null;
      const res = await api.finishWalk(walk.id, { durationSeconds: seconds, cancel });
      setWalk(null);
      setRoute([]);
      baseSeconds.current = 0;
      setElapsed(0);
      setShareExpiresAt(null);
      if (!cancel) router.push(`/walk/${res.walk.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yürüyüş bitirilemedi.');
    } finally {
      setBusy(false);
    }
  }

  const sharing = shareExpiresAt !== null && shareExpiresAt > Date.now();

  async function toggleShare() {
    if (!walk) return;
    if (sharing) {
      await api.stopWalkSharing(walk.id).catch(() => undefined);
      setShareExpiresAt(null);
      return;
    }
    // Kiminle paylaşılacağı sohbet listesinden seçilir.
    router.push(`/walk/share?walkId=${walk.id}`);
  }

  const active = walk?.status === 'active';
  const running = walk !== null;

  return (
    <View style={[s.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Geri"
          onPress={() => router.push('/(tabs)/home')}
          style={s.circle}
        >
          <SymbolView
            name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
            size={22}
            tintColor={colors.textOnDark}
          />
        </Pressable>
        <AppText variant="heading" color={colors.textOnDark}>
          Canlı yürüyüş
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sharing ? 'Paylaşımı durdur' : 'Güvenli paylaşım'}
          accessibilityState={{ selected: sharing }}
          onPress={toggleShare}
          disabled={!running}
          style={[s.circle, !running && { opacity: 0.4 }]}
        >
          <SymbolView
            name={{
              ios: sharing ? 'checkmark.shield.fill' : 'shield',
              android: sharing ? 'verified_user' : 'shield',
              web: sharing ? 'verified_user' : 'shield',
            }}
            size={22}
            tintColor={sharing ? '#62D49C' : colors.textOnDark}
          />
        </Pressable>
      </View>

      {/* Paylaşım durumu ekranda belirgin */}
      {running ? (
        <View style={[s.livePill, sharing && { borderColor: '#62D49C' }]}>
          <View style={[s.liveDot, !active && { backgroundColor: colors.textSubtle }]} />
          <AppText variant="caption" color={colors.textOnDark}>
            {active ? 'Canlı' : 'Duraklatıldı'}
          </AppText>
          {sharing ? (
            <AppText variant="caption" color="#62D49C">
              · Konum paylaşılıyor
            </AppText>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.stateBox}>
            <ActivityIndicator color={colors.copperPale} />
          </View>
        ) : permission === 'denied' ? (
          <PermissionNotice
            title="Konum izni kapalı"
            description={
              canAskAgain
                ? 'Rota ve mesafe için konum izni gerekiyor. İzin vermeden yürüyüş kaydedilemez.'
                : 'Konum iznini daha önce kapatmışsın. Ayarlardan açtıktan sonra yürüyüşü başlatabilirsin.'
            }
            actionLabel={canAskAgain ? 'İzin iste' : 'Ayarları aç'}
            onAction={() => (canAskAgain ? void start() : void Linking.openSettings())}
          />
        ) : permission === 'unsupported' ? (
          <PermissionNotice
            title="Bu cihazda konum takibi yok"
            description="Canlı yürüyüş gerçek GPS gerektirir; web önizlemesinde çalışmaz. Telefon uygulamasında kullanabilirsin."
          />
        ) : running ? (
          <WalkMap points={route} live dogPhotoUrl={dog?.photoUrl ?? null} />
        ) : (
          <PermissionNotice
            title="Yürüyüşe hazır"
            description={`${dog?.name ?? 'Pati'} ile yürüyüşü başlat; rota, mesafe ve tempo gerçek konumdan hesaplanır.`}
          />
        )}

        {error ? (
          <View style={s.errorBox}>
            <AppText variant="caption" color="#FFD9D2">
              {error}
            </AppText>
          </View>
        ) : null}
      </ScrollView>

      <View style={[s.panel, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={s.metrics}>
          <Metric label="Süre" value={formatClock(running ? elapsed : 0)} />
          <Metric label="Mesafe" value={formatDistance(walk?.distanceMeters ?? 0)} />
          <Metric
            label="Tempo"
            value={`${formatPace(walk?.paceSecondsPerKm ?? null)} dk/km`}
            last
          />
        </View>

        {walk && walk.distanceMeters > 0 ? (
          <AppText variant="caption" color={colors.textOnDarkMuted} center style={{ marginBottom: spacing.md }}>
            ~{walk.estimatedCalories} kcal · tahmini değerdir
          </AppText>
        ) : null}

        <View style={s.controls}>
          <SideAction
            label={sharing ? 'Paylaşımı durdur' : 'Güvenlik & paylaş'}
            icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
            onPress={toggleShare}
            disabled={!running}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={running ? 'Yürüyüşü bitir' : 'Yürüyüşü başlat'}
            onPress={() => (running ? confirmFinish() : void start())}
            disabled={busy}
            style={({ pressed }) => [s.mainAction, (pressed || busy) && { opacity: 0.82 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.textOnDark} />
            ) : (
              <>
                <SymbolView
                  name={{
                    ios: running ? 'stop.fill' : 'play.fill',
                    android: running ? 'stop' : 'play_arrow',
                    web: running ? 'stop' : 'play_arrow',
                  }}
                  size={25}
                  tintColor={colors.textOnDark}
                />
                <AppText variant="label" color={colors.textOnDark} center>
                  {running ? 'Yürüyüşü\nbitir' : 'Yürüyüşü\nbaşlat'}
                </AppText>
              </>
            )}
          </Pressable>

          <SideAction
            label={active ? 'Duraklat' : 'Devam et'}
            icon={{
              ios: active ? 'pause.fill' : 'play.fill',
              android: active ? 'pause' : 'play_arrow',
              web: active ? 'pause' : 'play_arrow',
            }}
            onPress={togglePause}
            disabled={!running || busy}
          />
        </View>
      </View>
    </View>
  );
}

function Metric({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.metric, last && { borderRightWidth: 0 }]}>
      <AppText variant="caption" color={colors.textOnDarkMuted}>
        {label}
      </AppText>
      <AppText variant="heading" color={colors.textOnDark} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

function SideAction({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.sideAction, (disabled || pressed) && { opacity: 0.45 }]}
    >
      <View style={s.sideCircle}>
        <SymbolView name={icon} size={21} tintColor={colors.textOnDark} />
      </View>
      <AppText variant="caption" color={colors.textOnDarkMuted} center numberOfLines={2}>
        {label}
      </AppText>
    </Pressable>
  );
}

function PermissionNotice({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.stateBox}>
      <View style={s.stateIcon}>
        <SymbolView
          name={{ ios: 'location.slash', android: 'location_off', web: 'location_off' }}
          size={26}
          tintColor={colors.copperPale}
        />
      </View>
      <AppText variant="heading" color={colors.textOnDark} center>
        {title}
      </AppText>
      <AppText
        variant="body"
        color={colors.textOnDarkMuted}
        center
        style={{ marginTop: spacing.sm, maxWidth: 300 }}
      >
        {description}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [s.noticeButton, pressed && { opacity: 0.85 }]}
        >
          <AppText variant="label" color={colors.textOnDark}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0C2118' },
  header: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.07)',
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  livePill: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(18,33,25,.88)',
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#38D990' },
  stateBox: {
    margin: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    backgroundColor: '#123126',
    borderWidth: 1,
    borderColor: colors.borderOnDark,
    minHeight: 220,
    justifyContent: 'center',
  },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.06)',
    marginBottom: spacing.lg,
  },
  noticeButton: {
    marginTop: spacing.xl,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.copperAction,
  },
  errorBox: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(158,48,37,.35)',
  },
  panel: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    backgroundColor: 'rgba(25,48,38,.98)',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  metrics: { flexDirection: 'row', marginBottom: spacing.md },
  metric: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    gap: 3,
    borderRightWidth: 1,
    borderRightColor: colors.borderOnDark,
  },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  sideAction: { width: 92, alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  sideCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  mainAction: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.copperAction,
    borderWidth: 4,
    borderColor: colors.copperPale,
  },
});
