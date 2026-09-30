import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import { useTheme } from '../../../lib/ThemeContext'
import { sans, serif } from '../../../lib/theme'
import { pl } from '../../../lib/dates'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { useChildren } from '../../../hooks/useChildren'
import { AppText, Avatar, Card, ScreenHeader, Segmented, SectionHeader } from '../../../components/ui'

type RankRow = { profile_id: string; full_name: string; total_points: number }

export default function ParentPoints() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const profile = useAuthStore(s => s.profile)
  const { children, loading } = useChildren(0)
  const [ranking, setRanking] = useState<RankRow[]>([])
  const [seg, setSeg] = useState<'children' | 'ranking'>('children')

  useEffect(() => {
    if (!profile?.parish_id) return
    Promise.all([
      supabase.from('points_summary').select('profile_id, full_name, total_points').eq('parish_id', profile.parish_id).order('total_points', { ascending: false }),
      supabase.from('profiles').select('id').eq('parish_id', profile.parish_id).eq('is_active', true),
    ]).then(([r, p]) => {
      const ids = new Set(((p.data ?? []) as any[]).map(x => x.id))
      setRanking(((r.data ?? []) as RankRow[]).filter(x => ids.has(x.profile_id)))
    })
  }, [profile?.parish_id])

  const childIds = new Set(children.map(ch => ch.id))
  const openChild = (id: string) => router.push(`/(parent)/member-profile?id=${id}` as any)

  const kids = loading ? <ActivityIndicator color={c.primary} /> : children.length === 0 ? (
    <Card><AppText muted>Brak powiązanych dzieci.</AppText></Card>
  ) : children.map(ch => (
    <Card key={ch.id} large style={styles.kid} onPress={() => openChild(ch.id)}>
      <View style={styles.kidHead}>
        <Avatar name={ch.full_name} avatarUrl={ch.avatar_url} size={48} color={c.primary} textColor={c.gold} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{ch.full_name}</AppText>
          <AppText variant="small" muted>{ch.rankName ?? 'Ministrant'}</AppText>
        </View>
        <View style={styles.right}>
          <AppText style={[serif(), styles.big, { color: c.text }]}>{ch.points}</AppText>
          <AppText variant="small" muted>pkt</AppText>
        </View>
      </View>
      <View style={styles.stats}>
        {[
          [ch.position ? `#${ch.position}` : '—', 'miejsce w parafii'],
          [ch.attendance != null ? `${ch.attendance}%` : '—', 'frekwencja'],
          [String(ch.services), pl(ch.services, ['służba', 'służby', 'służb'])],
        ].map(([v, l]) => (
          <View key={l} style={[styles.stat, { backgroundColor: c.bg }]}>
            <AppText style={[styles.statV, { color: c.text }]}>{v}</AppText>
            <AppText variant="small" muted>{l}</AppText>
          </View>
        ))}
      </View>
      {ch.badges.length > 0 && <AppText style={styles.badges}>{ch.badges.join('  ')}</AppText>}
    </Card>
  ))

  const rankingList = (
    <Card flush>
      {ranking.map((r, i) => {
        const mine = childIds.has(r.profile_id)
        return (
          <Pressable
            key={r.profile_id}
            disabled={!mine}
            onPress={() => openChild(r.profile_id)}
            style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }, mine && { backgroundColor: c.goldSurface }]}
          >
            <AppText style={[styles.pos, { color: c.subtext }]}>{i + 1}</AppText>
            <AppText style={[styles.rankName, { color: c.text }, mine && sans(800)]} numberOfLines={1}>{r.full_name}</AppText>
            <AppText style={[styles.rankPts, { color: c.text }]}>{r.total_points}</AppText>
          </Pressable>
        )
      })}
    </Card>
  )

  if (isDesktop) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.desktop}>
        <View style={styles.col}><SectionHeader title="Moje dzieci" />{kids}</View>
        <View style={styles.col}><SectionHeader title="Ranking parafii" />{rankingList}</View>
      </ScrollView>
    )
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }}>
      <ScreenHeader eyebrow="Punkty dzieci" title="Punkty" />
      <View style={styles.body}>
        <Segmented value={seg} onChange={setSeg} options={[{ value: 'children', label: 'Moje dzieci' }, { value: 'ranking', label: 'Ranking' }]} />
        {seg === 'children' ? kids : rankingList}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  desktop: { flexDirection: 'row', gap: 20, padding: 28, paddingHorizontal: 32, alignItems: 'flex-start' },
  col: { flex: 1, gap: 12 },
  kid: { gap: 14, padding: 18 },
  kidHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  right: { alignItems: 'flex-end' },
  big: { fontSize: 40, lineHeight: 42 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 12, padding: 10, gap: 2 },
  statV: { ...sans(800), fontSize: 18, fontVariant: ['tabular-nums'] },
  badges: { fontSize: 18 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  pos: { ...sans(800), fontSize: 13, width: 24 },
  rankName: { ...sans(600), fontSize: 15, flex: 1 },
  rankPts: { ...sans(800), fontSize: 15, fontVariant: ['tabular-nums'] },
})
