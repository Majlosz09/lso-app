import { useEffect, useState } from 'react'
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import { useTheme } from '../../../lib/ThemeContext'
import { sans, serif, VESTMENT_NAMES, VestmentColor } from '../../../lib/theme'
import { shadow } from '../../../lib/shadows'
import { getLiturgicalDay } from '../../../lib/liturgy'
import { addDays, dayMonth, dayNum, dayShort, localDateStr, pl, relativeDay, shortDate } from '../../../lib/dates'
import { STATUS_LABELS } from '../../../lib/status'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { useLiturgyHeader } from '../../../hooks/useLiturgyHeader'
import { ChildDuty, ChildSummary, useChildren } from '../../../hooks/useChildren'
import { announcementWhen } from '../../../components/announcements/AnnouncementsFeed'
import { AppText, Avatar, Badge, Card, Icon, SectionHeader } from '../../../components/ui'
import { useUnreadAnnouncements } from '../../../hooks/useUnreadAnnouncements'
import { NotificationBell } from '../../../components/layout/NotificationBell'
import { tourRef } from '../../../components/tour/TourTarget'
import { topGap } from '../../../lib/safeTop'

type Ann = { id: string; title: string; created_at: string; author: { full_name: string } | null }
type DutyRow = ChildDuty & { child: string }

const firstName = (n: string) => n.split(' ')[0]

export default function ParentHome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const isDesktop = useIsDesktop()
  const { colors: c, isDark } = useTheme()
  const { profile } = useAuthStore()
  const liturgy = useLiturgyHeader()
  const pal = liturgy.palette
  const { children, loading, reload } = useChildren(14)
  const [anns, setAnns] = useState<Ann[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const today = localDateStr()

  useEffect(() => {
    if (!profile?.parish_id) return
    supabase.from('announcements').select('id, title, created_at, author:profiles(full_name)')
      .eq('parish_id', profile.parish_id).in('target_audience', ['all', 'parents'])
      .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(2)
      .then(({ data }) => setAnns((data ?? []) as any))
  }, [profile?.parish_id])

  const allDuties: DutyRow[] = children
    .flatMap(ch => ch.duties.map(d => ({ ...d, child: ch.full_name })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  const weekDuties = allDuties.filter(d => d.date <= addDays(today, 6))
  const next = allDuties.find(d => d.status === 'assigned')
  const openChild = (id: string) => router.push(`/(parent)/member-profile?id=${id}` as any)

  const childRow = (ch: ChildSummary, i: number) => {
    const nd = ch.duties[0]
    return (
      <Pressable
        key={ch.id}
        onPress={() => openChild(ch.id)}
        style={({ hovered }: any) => [styles.childRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }, hovered && { backgroundColor: c.highlight }]}
      >
        <Avatar name={ch.full_name} avatarUrl={ch.avatar_url} size={46} />
        <View style={styles.flex}>
          <View style={styles.rowBetween}>
            <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>{ch.full_name}</AppText>
            <AppText style={[styles.pts, { color: c.text }]}>{`${ch.points} pkt`}</AppText>
          </View>
          <AppText variant="small" muted>
            {`${ch.rankName ?? 'Ministrant'} · frekwencja ${ch.attendance != null ? `${ch.attendance}%` : '—'}`}
          </AppText>
          {nd && (
            <AppText variant="small" color={c.primary} style={sans(700)} numberOfLines={1}>
              {`${dayShort(nd.date)} ${shortDate(nd.date)} · ${nd.time} · ${nd.title}`}
            </AppText>
          )}
        </View>
      </Pressable>
    )
  }

  const childrenCard = (
    <Card large flush style={!isDesktop && shadow.hero}>
      <View style={styles.cardHead}><AppText variant="eyebrow" color={c.goldInk}>Moje dzieci</AppText></View>
      {loading ? null : children.length === 0 ? (
        <View style={styles.pad}>
          <AppText variant="bodyStrong">Brak powiązanych dzieci</AppText>
          <AppText variant="small" muted>Poproś opiekuna o połączenie konta dziecka z Twoim.</AppText>
        </View>
      ) : children.map(childRow)}
    </Card>
  )

  const nextCard = next && (() => {
    const vest = (getLiturgicalDay(next.date).color ?? 'GREEN') as VestmentColor
    return (
      <Card large style={styles.nextCard}>
        <View style={styles.rowBetween}>
          <AppText variant="eyebrow" color={c.goldInk}>{`Najbliższa służba · ${firstName(next.child)}`}</AppText>
          <Badge label={relativeDay(next.date)} tone="gold" />
        </View>
        <View style={styles.nextMain}>
          <View style={[styles.dateTile, { backgroundColor: c.primary }]}>
            <AppText style={[styles.dateDow, { color: c.gold }]}>{dayShort(next.date).toUpperCase()}</AppText>
            <AppText style={styles.dateNum}>{dayNum(next.date)}</AppText>
            <AppText style={styles.dateTime}>{next.time}</AppText>
          </View>
          <View style={styles.flex}>
            <AppText style={[serif(), styles.nextTitle, { color: c.text }]} numberOfLines={2}>{next.title}</AppText>
            <AppText variant="small" muted>{`${firstName(next.child)} · ${VESTMENT_NAMES[vest]}`}</AppText>
          </View>
        </View>
      </Card>
    )
  })()

  const dutyList = (list: DutyRow[], emptyText: string) => (
    <Card flush>
      {list.length === 0 ? <AppText muted style={styles.pad}>{emptyText}</AppText> : list.map((d, i) => (
        <View key={d.assignmentId} style={[styles.dutyRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
          <AppText variant="small" muted style={styles.dutyDate}>{`${dayShort(d.date)} ${shortDate(d.date)}`}</AppText>
          <AppText style={[styles.dutyTime, { color: c.text }]}>{d.time}</AppText>
          <View style={styles.flex}>
            <AppText variant="bodyStrong" numberOfLines={1}>{d.title}</AppText>
            <AppText variant="small" color={d.status === 'assigned' ? c.success : c.goldInk}>
              {`${firstName(d.child)} · ${STATUS_LABELS[d.status]?.toLowerCase() ?? d.status}`}
            </AppText>
          </View>
        </View>
      ))}
    </Card>
  )

  const unreadAnn = useUnreadAnnouncements()
  const annCard = (
    <Card flush>
      <View style={[styles.cardHead, styles.rowBetween]}>
        <View style={styles.annTitle}>
          <AppText variant="eyebrow" color={c.goldInk}>Ogłoszenia dla rodziców</AppText>
          {unreadAnn > 0 && <Badge label={`${unreadAnn} ${pl(unreadAnn, ['nowe', 'nowe', 'nowych'])}`} tone="navy" />}
        </View>
        <Pressable style={{ flexShrink: 0 }} onPress={() => router.push('/(parent)/(parent-tabs)/announcements')}><AppText variant="label" color={c.primary}>Wszystkie →</AppText></Pressable>
      </View>
      {anns.length === 0 ? <AppText muted style={styles.pad}>Brak ogłoszeń.</AppText> : anns.map(a => (
        <Pressable key={a.id} onPress={() => router.push('/(parent)/(parent-tabs)/announcements')} style={[styles.annRow, { borderTopColor: c.borderLight }]}>
          <AppText variant="bodyStrong" numberOfLines={1}>{a.title}</AppText>
          <AppText variant="small" muted>{`${a.author?.full_name ?? 'Parafia'} · ${announcementWhen(a.created_at)}`}</AppText>
        </Pressable>
      ))}
    </Card>
  )

  if (isDesktop) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.desktop}>
        <View style={styles.colMain}>
          <View style={styles.kidGrid}>
            {children.map(ch => (
              <Card key={ch.id} large style={styles.kidCard} onPress={() => openChild(ch.id)}>
                <View style={styles.kidHead}>
                  <Avatar name={ch.full_name} avatarUrl={ch.avatar_url} size={44} color={c.primary} textColor={c.gold} />
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong">{ch.full_name}</AppText>
                    <AppText variant="small" muted>{ch.rankName ?? 'Ministrant'}</AppText>
                  </View>
                </View>
                <View style={styles.kidStats}>
                  {[[String(ch.points), 'pkt'], [ch.attendance != null ? `${ch.attendance}%` : '—', 'frekwencja'], [ch.position ? `#${ch.position}` : '—', 'w parafii']].map(([v, l]) => (
                    <View key={l} style={styles.flex}>
                      <AppText style={[styles.kidStatV, { color: c.text }]}>{v}</AppText>
                      <AppText variant="small" muted>{l}</AppText>
                    </View>
                  ))}
                </View>
                <View style={[styles.kidNext, { backgroundColor: c.bg }]}>
                  <AppText variant="small" style={sans(700)}>
                    {ch.duties[0] ? `${dayShort(ch.duties[0].date)} ${shortDate(ch.duties[0].date)} · ${ch.duties[0].time} · ${ch.duties[0].title}` : 'Brak zaplanowanych dyżurów'}
                  </AppText>
                </View>
              </Card>
            ))}
            {!loading && children.length === 0 && childrenCard}
          </View>
          <View>
            <SectionHeader title="Dyżury dzieci w tym tygodniu" />
            {dutyList(weekDuties, 'W tym tygodniu dzieci nie mają dyżurów.')}
          </View>
        </View>
        <View style={styles.colSide}>
          <View style={[styles.litCard, { backgroundColor: pal.bg }]}>
            <AppText variant="eyebrow" color={pal.accent}>{liturgy.entry.typeLabel}</AppText>
            <AppText style={[serif(), styles.litTitle, { color: pal.fg }]}>
              Dziś, <AppText style={[serif(true), styles.litTitle, { color: pal.fg }]}>{dayMonth(today)}</AppText>
            </AppText>
            <AppText style={[styles.litName, { color: pal.fg }]}>{liturgy.entry.name}</AppText>
          </View>
          {annCard}
        </View>
      </ScrollView>
    )
  }

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <StatusBar style={pal.statusBar} />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false) }} />}>
        <View style={[styles.header, { backgroundColor: pal.bg, paddingTop: topGap(insets.top, 8) }]}>
          <View style={styles.topRow}>
            <Image source={require('../../../assets/images/icon.png')} style={styles.logo} />
            <AppText style={[styles.greeting, { color: pal.fg }]}>{`Króluj nam Chryste,\n${firstName(profile?.full_name ?? '')}`}</AppText>
            <NotificationBell tone="header" fg={pal.fg} />
            <Pressable ref={tourRef('profile')} onPress={() => router.push('/(parent)/(parent-tabs)/profile')} accessibilityRole="button" accessibilityLabel="Profil">
              <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size={38} />
            </Pressable>
          </View>
          <AppText variant="eyebrow" color={pal.accent}>{liturgy.entry.typeLabel}</AppText>
          <AppText style={[serif(), styles.today, { color: pal.fg }]}>
            Dziś, <AppText style={[serif(true), styles.today, { color: pal.fg }]}>{dayMonth(today)}</AppText>
          </AppText>
          <AppText style={[styles.litName, { color: pal.fg }]}>{liturgy.entry.name}</AppText>
        </View>
        <View style={styles.body}>
          <View style={styles.overlap}>{childrenCard}</View>
          {nextCard}
          <AppText variant="title">Dyżury dzieci w tym tygodniu</AppText>
          {dutyList(weekDuties, 'W tym tygodniu dzieci nie mają dyżurów.')}
          {annCard}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  annTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 },
  flex: { flex: 1, minWidth: 0 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pad: { padding: 14, gap: 4 },
  header: { paddingHorizontal: 22, paddingBottom: 72, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  logo: { width: 34, height: 34, borderRadius: 9 },
  greeting: { ...sans(700), fontSize: 13, lineHeight: 17, flex: 1 },
  today: { fontSize: 40, lineHeight: 43 },
  litName: { ...sans(500), fontSize: 14, opacity: 0.92 },
  body: { paddingHorizontal: 16, paddingBottom: 28, gap: 16 },
  overlap: { marginTop: -52 },
  cardHead: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  childRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, cursor: 'pointer' } as any,
  pts: { ...sans(800), fontSize: 15, fontVariant: ['tabular-nums'] },
  nextCard: { gap: 12, padding: 18 },
  nextMain: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dateTile: { width: 62, borderRadius: 14, paddingVertical: 8, alignItems: 'center' },
  dateDow: { ...sans(800), fontSize: 11 },
  dateNum: { ...sans(800), fontSize: 26, lineHeight: 30, color: '#FFFFFF' },
  dateTime: { ...sans(700), fontSize: 12, color: '#C9D3E3' },
  nextTitle: { fontSize: 22, lineHeight: 26 },
  dutyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  dutyDate: { width: 62 },
  dutyTime: { ...sans(800), fontSize: 14, minWidth: 44, flexShrink: 0, fontVariant: ['tabular-nums'] },
  annRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 2, borderTopWidth: 1, cursor: 'pointer' } as any,
  desktop: { flexDirection: 'row', gap: 20, padding: 28, paddingHorizontal: 32, alignItems: 'flex-start' },
  colMain: { flex: 1.6, gap: 18 },
  colSide: { flex: 1, gap: 16 },
  kidGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  kidCard: { flexBasis: 250, flexGrow: 1, gap: 14, padding: 18 },
  kidHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kidStats: { flexDirection: 'row', gap: 10 },
  kidStatV: { ...sans(800), fontSize: 22, fontVariant: ['tabular-nums'] },
  kidNext: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  litCard: { borderRadius: 20, padding: 20, gap: 6 },
  litTitle: { fontSize: 32, lineHeight: 35 },
})
