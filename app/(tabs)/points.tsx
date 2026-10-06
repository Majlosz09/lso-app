import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif } from '../../lib/theme'
import { localDateStr, shortDate, dayShort, pl } from '../../lib/dates'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useLiturgyHeader } from '../../hooks/useLiturgyHeader'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import type { BadgeWithDef } from '../../components/FormationBadges'
import { BadgeGrid } from '../../components/BadgeGrid'
import { AppText, Card, Icon, ScreenHeader, Segmented, SectionHeader } from '../../components/ui'

type Seg = 'ranking' | 'history' | 'badges'
type RankRow = { profile_id: string; full_name: string; total_points: number; services_count: number; rankName: string | null }
type PointRow = { id: string; amount: number; reason: string; created_at: string; schedule: { title: string; date: string } | null }

export function usePointsData() {
  const profile = useAuthStore(s => s.profile)
  const [ranking, setRanking] = useState<RankRow[]>([])
  const [history, setHistory] = useState<PointRow[]>([])
  const [badges, setBadges] = useState<BadgeWithDef[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!profile?.id || !profile.parish_id) return
    const [rankRes, histRes, profRes, ranksRes, badgeRes] = await Promise.all([
      supabase.from('points_summary').select('profile_id, full_name, total_points, services_count')
        .eq('parish_id', profile.parish_id).order('total_points', { ascending: false }),
      supabase.from('points').select('id, amount, reason, created_at, schedule:schedules(title, date)')
        .eq('profile_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, rank_id').eq('parish_id', profile.parish_id).eq('is_active', true),
      supabase.from('ranks').select('id, name').or(`parish_id.is.null,parish_id.eq.${profile.parish_id}`),
      supabase.from('member_badges')
        .select('id, awarded_at, badge_definition:badge_definitions(id, name, icon, criteria_key)')
        .eq('profile_id', profile.id).eq('is_active', true),
    ])
    const rankName = new Map((ranksRes.data ?? []).map((r: any) => [r.id, r.name]))
    const profRank = new Map((profRes.data ?? []).map((p: any) => [p.id, p.rank_id]))
    setRanking(((rankRes.data ?? []) as any[])
      .filter(r => profRank.has(r.profile_id))
      .map(r => ({ ...r, rankName: rankName.get(profRank.get(r.profile_id)) ?? null })))
    setHistory((histRes.data ?? []) as any)
    const seen = new Set<string>()
    setBadges(((badgeRes.data ?? []) as any[]).filter(b => {
      if (!b.badge_definition) return false
      const key = b.badge_definition.criteria_key ?? b.badge_definition.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }))
    setLoading(false)
  }, [profile?.id, profile?.parish_id])

  useEffect(() => { load() }, [load])
  useRealtimeTable('points', () => { load() }, profile?.parish_id ? `parish_id=eq.${profile.parish_id}` : undefined)
  return { ranking, history, badges, loading, reload: load }
}

export default function PointsScreen() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const { palette } = useLiturgyHeader()
  const profile = useAuthStore(s => s.profile)
  const { ranking, history, badges, loading, reload } = usePointsData()
  const [seg, setSeg] = useState<Seg>('ranking')
  const [refreshing, setRefreshing] = useState(false)

  const myIdx = ranking.findIndex(r => r.profile_id === profile?.id)
  const me = myIdx >= 0 ? ranking[myIdx] : null
  const total = me?.total_points ?? 0
  const leader = ranking[0]?.total_points ?? 0
  const toLeader = Math.max(0, leader - total)
  const progress = leader > 0 ? Math.min(1, total / leader) : 0
  const openMember = (id: string) => id !== profile?.id && router.push(`/(tabs)/member-profile?id=${id}` as any)

  const summaryLine = myIdx === 0
    ? 'Prowadzisz w rankingu parafii — tak trzymaj!'
    : leader > 0 ? `Do 1. miejsca brakuje ${toLeader} pkt` : 'Punkty zdobywasz za każdą potwierdzoną służbę.'

  // ── Listy ────────────────────────────────────────────────────────────────
  const rankingList = (
    <Card flush>
      {ranking.length === 0 ? <AppText muted style={styles.pad}>Brak danych rankingowych.</AppText> : ranking.map((r, i) => {
        const isMe = r.profile_id === profile?.id
        const medal = ['#C9A55A', '#D9D6CF', '#C98E5A'][i]
        return (
          <Pressable
            key={r.profile_id}
            onPress={() => openMember(r.profile_id)}
            style={({ hovered }: any) => [
              styles.rankRow,
              i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight },
              (isMe || hovered) && { backgroundColor: isMe ? c.goldSurface : c.highlight },
            ]}
          >
            <View style={[styles.pos, medal ? { backgroundColor: medal } : { borderWidth: 1, borderColor: c.inputBorder }]}>
              <AppText style={[styles.posText, { color: medal ? '#14213A' : c.subtext }]}>{i + 1}</AppText>
            </View>
            <View style={styles.flex}>
              <AppText style={[styles.rankName, isMe && sans(800)]} numberOfLines={1}>{r.full_name}</AppText>
              <AppText variant="small" muted>{r.rankName ?? 'Ministrant'}</AppText>
            </View>
            <AppText style={[styles.rankPts, { color: c.text }]}>{r.total_points}</AppText>
          </Pressable>
        )
      })}
    </Card>
  )

  const historyList = (
    <Card flush>
      {history.length === 0 ? (
        <AppText muted style={styles.pad}>Brak historii — punkty zdobywasz za każdą potwierdzoną służbę.</AppText>
      ) : history.map((h, i) => {
        const date = h.schedule?.date ?? localDateStr(new Date(h.created_at))
        return (
          <View key={h.id} style={[styles.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong" numberOfLines={1}>{h.schedule?.title ?? h.reason}</AppText>
              <AppText variant="small" muted numberOfLines={1}>
                {`${dayShort(date).toLowerCase()} ${shortDate(date)}${h.schedule ? ` · ${h.reason}` : ''}`}
              </AppText>
            </View>
            <AppText style={[styles.amount, { color: h.amount >= 0 ? c.success : c.dangerStrong }]}>
              {h.amount > 0 ? `+${h.amount}` : h.amount}
            </AppText>
          </View>
        )
      })}
    </Card>
  )

  const badgesGrid = (
    <Card style={styles.badgesCard}>
      <BadgeGrid badges={badges} emptyText="Nie masz jeszcze odznak. Zdobywasz je za regularną służbę." />
      <Pressable onPress={() => router.push('/(tabs)/badge-catalog')} style={styles.catalogLink}>
        <AppText variant="label" color={c.primary}>Katalog odznak →</AppText>
      </Pressable>
    </Card>
  )

  if (loading) return <View style={[styles.center, { backgroundColor: c.bg }]}><ActivityIndicator color={c.primary} /></View>

  if (isDesktop) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.desktop}>
        <View style={styles.col}>
          <View style={[styles.hero, { backgroundColor: c.primary }]}>
            <AppText variant="eyebrow" color={c.gold}>Twoje punkty</AppText>
            <View style={styles.bigRow}>
              <AppText style={[serif(), styles.big, { color: '#FFFFFF' }]}>{total}</AppText>
              <AppText style={[styles.bigSub, { color: '#C9D3E3' }]}>{`pkt · #${myIdx + 1 || '—'} w parafii`}</AppText>
            </View>
            <View style={styles.barTrack}><View style={[styles.barFill, { width: `${progress * 100}%`, backgroundColor: c.gold }]} /></View>
            <AppText style={[styles.heroLine, { color: '#C9D3E3' }]}>{`${me?.rankName ?? 'Ministrant'} · ${summaryLine}`}</AppText>
          </View>
          <View>
            <SectionHeader title="Odznaki" />
            {badgesGrid}
          </View>
          <View>
            <SectionHeader title="Historia" />
            {historyList}
          </View>
        </View>
        <View style={styles.col}>
          <SectionHeader title="Ranking parafii" />
          {rankingList}
        </View>
      </ScrollView>
    )
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false) }} />}
    >
      <ScreenHeader eyebrow="Twoje punkty">
        <View style={styles.bigRow}>
          <AppText style={[serif(), styles.big, { color: palette.fg }]}>{total}</AppText>
          <AppText style={[styles.bigSub, { color: palette.fg }]}>{`pkt · #${myIdx + 1 || '—'} w parafii`}</AppText>
        </View>
        <View style={styles.barLabels}>
          <AppText variant="label" color={palette.fg}>{me?.rankName ?? 'Ministrant'}</AppText>
          <AppText variant="label" color={palette.fg}>{`${me?.services_count ?? 0} ${pl(me?.services_count ?? 0, ['służba', 'służby', 'służb'])}`}</AppText>
        </View>
        <View style={[styles.barTrack, { backgroundColor: palette.chip }]}>
          <View style={[styles.barFill, { width: `${progress * 100}%`, backgroundColor: c.gold }]} />
        </View>
        <AppText variant="small" color={palette.fg}>{summaryLine}</AppText>
      </ScreenHeader>
      <View style={styles.mobileBody}>
        <Segmented
          value={seg}
          onChange={setSeg}
          options={[{ value: 'ranking', label: 'Ranking' }, { value: 'history', label: 'Historia' }, { value: 'badges', label: 'Odznaki' }]}
        />
        {seg === 'ranking' ? rankingList : seg === 'history' ? historyList : badgesGrid}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pad: { padding: 14 },
  mobileBody: { padding: 16, gap: 14, paddingBottom: 32 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  big: { fontSize: 72, lineHeight: 76 },
  bigSub: { ...sans(700), fontSize: 15 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, cursor: 'pointer' } as any,
  pos: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  posText: { ...sans(800), fontSize: 12 },
  rankName: { ...sans(600), fontSize: 15 },
  rankPts: { ...sans(800), fontSize: 16, fontVariant: ['tabular-nums'] },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  amount: { ...sans(800), fontSize: 15, fontVariant: ['tabular-nums'] },
  badgesCard: { gap: 14 },
  catalogLink: { alignSelf: 'flex-start', cursor: 'pointer' } as any,
  desktop: { flexDirection: 'row', gap: 20, padding: 28, paddingHorizontal: 32, alignItems: 'flex-start' },
  col: { flex: 1, gap: 18 },
  hero: { borderRadius: 22, padding: 24, gap: 12 },
  heroLine: { ...sans(600), fontSize: 13 },
})
