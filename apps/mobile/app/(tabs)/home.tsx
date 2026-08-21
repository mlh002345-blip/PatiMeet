import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React from 'react';
import { Image, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { AppText, IconAction } from '../../src/components/ui';
import { formatEventDate } from '../../src/labels';
import { useSession } from '../../src/session';
import { colors, radius, shadow, spacing } from '../../src/theme';
import { useLoader } from '../../src/useLoader';

const fallbackHero = require('../../assets/prive-home-sunrise-v1.png');
function greeting() { const h = new Date().getHours(); return h < 11 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar'; }

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const dog = user?.dogs?.[0];
  const loader = useLoader(async () => {
    const [joined, nearby, discover, summary, reminders] = await Promise.all([
      api.events({ scope: 'joined' }), api.events({ district: user?.district ?? undefined }),
      api.discover({ district: user?.district ?? undefined }).catch(() => ({ items: [], hasMore: false })),
      /**
       * Günlük hedef artık gerçek yürüyüş verisinden geliyor; sabit kodlanmış
       * bir ilerleme yok. Uç hata verirse ekran yine açılır.
       */
      api.walkSummary().catch(() => ({ weeklySeconds: 0, weeklyMeters: 0, weeklyWalks: 0, todaySeconds: 0 })),
      api.reminders().catch(() => ({ reminders: [] })),
    ]);
    return {
      joined: joined.events,
      nearby: nearby.events,
      discover: discover.items,
      summary,
      reminders: reminders.reminders,
    };
  }, [user?.district]);
  const nextEvent = loader.data?.joined[0] ?? loader.data?.nearby[0] ?? null;
  /** Günlük hedef: 60 dakika. İlerleme bugünkü gerçek yürüyüş süresinden. */
  const goalMinutes = 60;
  const completedMinutes = Math.round((loader.data?.summary.todaySeconds ?? 0) / 60);
  const progress = Math.min(1, completedMinutes / goalMinutes);
  /** Gecikmiş veya bugün gelen bakım hatırlatmaları. */
  const dueReminders = (loader.data?.reminders ?? []).filter(
    (r) => r.remindAt !== null && r.remindAt <= Date.now() + 24 * 60 * 60 * 1000
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={loader.refreshing} onRefresh={loader.refresh} tintColor={colors.copperPale} />}>
      <ImageBackground source={dog?.photoUrl ? { uri: dog.photoUrl } : fallbackHero} style={[s.hero, { paddingTop: insets.top + spacing.sm }]} imageStyle={s.heroImage}>
        <View style={s.heroShade} />
        <View style={s.header}>
          <View style={s.brandRow}><View style={s.pawMark}><SymbolView name={{ ios: 'pawprint.fill', android: 'pets', web: 'pets' }} size={20} tintColor={colors.textOnDark} /></View><AppText variant="title" color={colors.textOnDark}>PatiMeet</AppText></View>
          <View style={s.headerActions}>
            <IconAction label="Mesajlar" name={{ ios: 'bubble.left.and.bubble.right', android: 'chat_bubble', web: 'chat_bubble' }} tone="onDark" onPress={() => router.push('/(tabs)/messages')} />
            <Pressable onPress={() => router.push('/(tabs)/profile')} style={s.ownerAvatar}>{user?.photoUrl ? <Image source={{ uri: user.photoUrl }} style={s.fill} /> : <AppText variant="label" color={colors.textOnDark}>{user?.name?.[0] ?? 'P'}</AppText>}</Pressable>
          </View>
        </View>
        <View style={s.greeting}><AppText variant="title" color={colors.textOnDark}>{greeting()}, {user?.name}</AppText><View style={s.locationPill}><SymbolView name={{ ios: 'mappin', android: 'place', web: 'place' }} size={15} tintColor={colors.textOnDark} /><AppText variant="label" color={colors.textOnDark}>{user?.district ?? 'Semtin'}</AppText></View></View>
        <View style={{ flex: 1 }} />
        <View style={s.dogInfo}><AppText variant="display" color={colors.textOnDark}>{dog?.name ?? 'Pati'}</AppText><AppText variant="body" color={colors.textOnDarkMuted}>{dog?.breed ?? 'Dostun'}{dog?.age ? ` · ${dog.age} yaşında` : ''}</AppText><View style={s.traits}><DarkChip label={dog?.energy === 'yuksek' ? 'Enerjik' : 'Dengeli'} icon={{ ios: 'bolt.fill', android: 'bolt', web: 'bolt' }} /><DarkChip label={dog?.sociability === 'sosyal' ? 'Sosyal' : 'Sakin'} icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }} />{dog?.vaccinated ? <DarkChip label="Aşılı" icon={{ ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' }} /> : null}</View></View>
      </ImageBackground>

      <View style={s.body}>
        <View style={s.quickRow}>
          <QuickAction label={'Yürüyüşe\nçık'} icon={{ ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' }} tone="forest" onPress={() => router.push('/(tabs)/live-walk')} />
          <QuickAction label={'Mahalle\nakışı'} icon={{ ios: 'person.2.fill', android: 'groups', web: 'groups' }} tone="lavender" onPress={() => router.push('/neighbourhood')} />
          <QuickAction label={'Güvenli\ntopluluk'} icon={{ ios: 'shield.fill', android: 'shield', web: 'shield' }} tone="sage" onPress={() => router.push('/alerts')} />
        </View>
        <View style={s.goalCard}><View style={{ flex: 1 }}><AppText variant="label" color={colors.textOnDark}>Günlük hedefin</AppText><View style={s.goalTrack}><View style={[s.goalFill, { width: `${progress * 100}%` }]} /></View><AppText variant="caption" color={colors.textOnDarkMuted} style={{ marginTop: spacing.sm }}>{completedMinutes > 0 ? `Bugün ${completedMinutes} dk yürüdünüz` : 'Bugün henüz yürüyüş yok'} · hedef {goalMinutes} dk</AppText></View><View style={s.progressRing}><AppText variant="heading" color={colors.textOnDark}>%{Math.round(progress * 100)}</AppText><AppText variant="caption" color={colors.copperPale}>{completedMinutes} dk</AppText></View></View>
        {dueReminders.length > 0 ? (
          <Pressable onPress={() => router.push('/journal')} style={({ pressed }) => [s.reminderCard, pressed && s.pressed]}>
            <View style={s.reminderIcon}><SymbolView name={{ ios: 'cross.case.fill', android: 'medical_services', web: 'medical_services' }} size={20} tintColor={colors.copperPale} /></View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" color={colors.textOnDark} numberOfLines={1}>{dueReminders[0].typeLabel}{dueReminders[0].dogName ? ` · ${dueReminders[0].dogName}` : ''}</AppText>
              <AppText variant="caption" color={colors.textOnDarkMuted}>{dueReminders.length > 1 ? `${dueReminders.length} bakım hatırlatması bekliyor` : 'Bakım zamanı geldi'}</AppText>
            </View>
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={18} tintColor={colors.textOnDarkMuted} />
          </Pressable>
        ) : null}
        <SectionHead kicker="SIRADAKİ ETKİNLİK" title={nextEvent?.title ?? 'Birlikte yeni bir rota keşfedin'} action="Tümü" onAction={() => router.push('/(tabs)/events')} />
        <Pressable onPress={() => nextEvent ? router.push(`/event/${nextEvent.id}`) : router.push('/event/create')} style={({ pressed }) => [s.eventCard, pressed && s.pressed]}><View style={s.eventIcon}><SymbolView name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} size={24} tintColor={colors.copperPale} /></View><View style={{ flex: 1 }}><AppText variant="bodyStrong" color={colors.textOnDark} numberOfLines={1}>{nextEvent?.title ?? 'Yürüyüşünü planla'}</AppText><AppText variant="caption" color={colors.textOnDarkMuted} style={{ marginTop: 3 }} numberOfLines={1}>{nextEvent ? `${formatEventDate(nextEvent.startsAt)} · ${nextEvent.district}` : `${user?.district ?? 'Semtin'} · uygun zamanı sen seç`}</AppText><AppText variant="caption" color={colors.copperPale} style={{ marginTop: spacing.sm }}>{nextEvent ? `${nextEvent.participantCount} kişi katılıyor` : 'İlk buluşmayı sen başlat'}</AppText></View><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={20} tintColor={colors.textOnDarkMuted} /></Pressable>
        {loader.data?.discover.length ? <><SectionHead kicker="YAKININDAKİLER" title="Bugün kimler dışarıda?" action="Keşfet" onAction={() => router.push('/(tabs)/discover')} /><View style={s.peopleRow}>{loader.data.discover.slice(0, 5).map((item) => <Pressable key={item.dog.id} onPress={() => router.push(`/user/${item.owner.id}?dogId=${item.dog.id}`)} style={s.personWrap}><View style={s.personAvatar}>{item.dog.photoUrl ? <Image source={{ uri: item.dog.photoUrl }} style={s.fill} /> : <AppText variant="heading" color={colors.textOnDark}>{item.dog.name[0]}</AppText>}<View style={s.onlineDot} /></View><AppText variant="caption" color={colors.textOnDarkMuted} numberOfLines={1}>{item.dog.name}</AppText></Pressable>)}</View></> : null}
      </View>
    </ScrollView>
  );
}

function DarkChip({ label, icon }: { label: string; icon: SymbolViewProps['name'] }) { return <View style={s.darkChip}><SymbolView name={icon} size={13} tintColor={colors.copperPale} /><AppText variant="caption" color={colors.textOnDark}>{label}</AppText></View>; }
function QuickAction({ label, icon, tone, onPress }: { label: string; icon: SymbolViewProps['name']; tone: 'forest' | 'lavender' | 'sage'; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [s.quickAction, s[tone], pressed && s.pressed]}><SymbolView name={icon} size={28} tintColor={colors.textOnDark} /><AppText variant="label" color={colors.textOnDark} center>{label}</AppText></Pressable>; }
function SectionHead({ kicker, title, action, onAction }: { kicker: string; title: string; action: string; onAction: () => void }) { return <View style={s.sectionHead}><View style={{ flex: 1 }}><AppText variant="kicker" color={colors.copper}>{kicker}</AppText><AppText variant="heading" color={colors.textOnDark} style={{ marginTop: 3 }}>{title}</AppText></View><AppText variant="label" color={colors.copperPale} onPress={onAction}>{action}</AppText></View>; }

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.primaryDark }, hero: { height: 540, paddingHorizontal: spacing.lg, overflow: 'hidden', justifyContent: 'space-between' }, heroImage: { opacity: .98 }, heroShade: { position: 'absolute', inset: 0, backgroundColor: 'rgba(10,24,18,.25)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, pawMark: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,48,36,.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,.28)' }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, ownerAvatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forestSoft, borderWidth: 2, borderColor: colors.copperPale }, fill: { width: '100%', height: '100%' },
  greeting: { gap: spacing.sm }, locationPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, minHeight: 36, borderRadius: radius.pill, backgroundColor: 'rgba(18,20,16,.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,.28)' }, dogInfo: { paddingBottom: spacing.xl }, traits: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }, darkChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, minHeight: 30, borderRadius: radius.pill, backgroundColor: 'rgba(18,20,16,.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' },
  body: { paddingHorizontal: spacing.lg }, quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }, quickAction: { flex: 1, minHeight: 116, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,.15)', ...shadow.card }, forest: { backgroundColor: '#294F3D' }, lavender: { backgroundColor: '#514862' }, sage: { backgroundColor: '#4D5B36' }, pressed: { opacity: .78, transform: [{ scale: .985 }] },
  reminderCard: { marginTop: spacing.sm, minHeight: 72, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.obsidianSoft, borderWidth: 1, borderColor: colors.copperDeep },
  reminderIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.07)' },
  goalCard: { marginTop: spacing.md, borderRadius: radius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, backgroundColor: colors.obsidianSoft, borderWidth: 1, borderColor: colors.borderOnDark }, goalTrack: { height: 5, borderRadius: 3, marginTop: spacing.md, backgroundColor: 'rgba(255,255,255,.12)', overflow: 'hidden' }, goalFill: { height: '100%', borderRadius: 3, backgroundColor: colors.copperPale }, progressRing: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: colors.copper },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.md, marginTop: spacing.xl, marginBottom: spacing.md }, eventCard: { minHeight: 92, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.obsidianSoft, borderWidth: 1, borderColor: colors.borderOnDark }, eventIcon: { width: 54, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.copperDeep },
  peopleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: spacing.lg }, personWrap: { width: 58, alignItems: 'center', gap: 5 }, personAvatar: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forestSoft, borderWidth: 2, borderColor: colors.copperPale }, onlineDot: { position: 'absolute', width: 11, height: 11, borderRadius: 6, right: 0, bottom: 1, backgroundColor: '#4FDB93', borderWidth: 2, borderColor: colors.primaryDark },
});
