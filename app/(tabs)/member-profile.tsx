import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useLiturgyHeader } from '../../hooks/useLiturgyHeader'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { pl } from '../../lib/dates'
import { FormationSection, BadgeWithDef } from '../../components/FormationBadges'
import { BadgeGrid } from '../../components/BadgeGrid'
import { AppText, Avatar, Button, Card, HeaderChip, ScreenHeader, SectionHeader } from '../../components/ui'

type MemberData = {
  id: string
  full_name: string
  avatar_url: string | null
  rank_id: string | null
  ranks: { name: string } | null
  member_badges: (BadgeWithDef & { is_active: boolean })[]
}

type Stats = { points: number; services: number; position: number; attendance: number | null }

/** Frekwencja: obecny / (obecny + nieobecny + usprawiedliwiony) na minionych służbach. */
export function attendanceRate(statuses: string[]): number | null {
  const counted = statuses.filter(s => ['present', 'absent', 'excused', 'confirmed'].includes(s))
  if (counted.length === 0) return null
  return Math.round((counted.filter(s => s === 'present').length / counted.length) * 100)
}

export default function MemberProfileScreen() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const { palette } = useLiturgyHeader()

  const [member, setMember] = useState<MemberData | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [allRanks, setAllRanks] = useState<{ id: string; name: string; order: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchData = useCallback(async () => {
    if (!id || !profile?.parish_id) return
    try {
      const [memberRes, ranksRes, rankingRes, assignRes] = await Promise.all([
        supabase
          .from('profiles')
          .select(`
            id, full_name, avatar_url, rank_id,
            ranks(name),
            member_badges(
              id, awarded_at, is_active,
              badge_definition:badge_definitions(id, name, icon, criteria_key)
            )
          `)
          .eq('id', id)
          .single(),
        supabase.from('ranks').select('id, name, order')
          .or(`parish_id.is.null,parish_id.eq.${profile.parish_id}`).order('order'),
        supabase.from('points_summary').select('profile_id, total_points, services_count')
          .eq('parish_id', profile.parish_id).order('total_points', { ascending: false }),
        supabase.from('schedule_assignments').select('status, schedule:schedules!inner(date)')
          .eq('profile_id', id).lt('schedule.date', new Date().toISOString().slice(0, 10)),
      ])
      if (memberRes.error || !memberRes.data) setNotFound(true)
      else setMember(memberRes.data as unknown as MemberData)
      setAllRanks(ranksRes.data ?? [])
      const rows = (rankingRes.data ?? []) as any[]
      const idx = rows.findIndex(r => r.profile_id === id)
      setStats({
        points: idx >= 0 ? rows[idx].total_points : 0,
        services: idx >= 0 ? rows[idx].services_count : 0,
        position: idx + 1,
        attendance: attendanceRate(((assignRes.data ?? []) as any[]).map(a => a.status)),
      })
    } catch {
      setNotFound(true)
    }
    setLoading(false)
  }, [id, profile?.parish_id])

  useEffect(() => { fetchData() }, [fetchData])
  useRealtimeTable('profiles', () => { fetchData() }, id ? `id=eq.${id}` : undefined)
  useRealtimeTable('member_badges', () => { fetchData() }, id ? `profile_id=eq.${id}` : undefined)

  const seen = new Set<string>()
  const activeBadges = (member?.member_badges ?? [])
    .filter(b => b.is_active && b.badge_definition !== null)
    .filter(b => {
      const key = b.badge_definition?.criteria_key ?? b.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/points'))

  if (loading) {
    return <View style={[styles.center, { backgroundColor: c.bg }]}><ActivityIndicator color={c.primary} /></View>
  }
  if (notFound || !member) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg, gap: 12 }]}>
        <AppText muted>Nie znaleziono profilu.</AppText>
        <Button label="Wróć" variant="secondary" onPress={back} />
      </View>
    )
  }

  const statTiles = (
    <View style={styles.stats}>
      {[
        [String(stats?.points ?? 0), 'pkt'],
        [stats?.attendance != null ? `${stats.attendance}%` : '—', 'frekwencja'],
        [String(stats?.services ?? 0), pl(stats?.services ?? 0, ['służba', 'służby', 'służb'])],
      ].map(([v, l]) => (
        <Card key={l} style={styles.stat}>
          <AppText style={[styles.statValue, { color: c.text }]}>{v}</AppText>
          <AppText variant="small" muted>{l}</AppText>
        </Card>
      ))}
    </View>
  )

  const identity = (fg: string) => (
    <View style={styles.identity}>
      <Avatar name={member.full_name} avatarUrl={member.avatar_url} size={64} />
      <View style={styles.flex}>
        <AppText variant="display" color={fg} style={styles.name}>{member.full_name}</AppText>
        <View style={styles.chips}>
          <HeaderChip label={member.ranks?.name ?? 'Ministrant'} palette={palette} />
          {!!stats?.position && <HeaderChip label={`#${stats.position}`} palette={palette} />}
        </View>
      </View>
    </View>
  )

  const body = (
    <View style={styles.body}>
      {statTiles}
      {allRanks.length > 0 && <FormationSection ranks={allRanks} currentRankId={member.rank_id} c={c} />}
      <View>
        <SectionHeader title="Wyróżnienia" />
        <Card><BadgeGrid badges={activeBadges} emptyText="Brak wyróżnień." /></Card>
      </View>
    </View>
  )

  if (isDesktop) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.desktop}>
        <View style={[styles.desktopHead, { backgroundColor: palette.bg }]}>{identity(palette.fg)}</View>
        {body}
      </ScrollView>
    )
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }}>
      <ScreenHeader onBack={back}>{identity(palette.fg)}</ScreenHeader>
      {body}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  name: { fontSize: 30, lineHeight: 33 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 8 },
  body: { padding: 16, gap: 16, paddingBottom: 32 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { ...sans(800), fontSize: 22, fontVariant: ['tabular-nums'] },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 820, width: '100%', alignSelf: 'center' },
  desktopHead: { borderRadius: 22, padding: 24 },
})
