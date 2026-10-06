import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { useFocusEffect, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import { PointRule, SERVICE_TYPE_LABELS, ServiceType } from '../../../types/database'
import { useRealtimeTable } from '../../../hooks/useRealtimeTable'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { useTheme } from '../../../lib/ThemeContext'
import { sans } from '../../../lib/theme'
import { ExportModal } from '../../../components/ExportModal'
import { AppText, Button, Card, ListRow, ScreenHeader } from '../../../components/ui'

type RankedMember = { id: string; full_name: string; total_points: number; rankName: string | null }

export const QUICK_AMOUNTS = [1, 2, 5, -2] as const

/** Powód zapisywany przy szybkim przyznaniu punktów z rankingu. */
export function quickReason(amount: number): string {
  return amount > 0 ? 'Punkty od opiekuna' : 'Kara od opiekuna'
}

export default function PointsTab() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { profile: adminProfile, parish } = useAuthStore()
  const { colors: c } = useTheme()
  const [ranking, setRanking] = useState<RankedMember[]>([])
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<PointRule[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [exportVisible, setExportVisible] = useState(false)

  const loadRanking = useCallback(() => {
    if (!adminProfile?.parish_id) return
    Promise.all([
      supabase.from('points_summary').select('profile_id, total_points').eq('parish_id', adminProfile.parish_id).order('total_points', { ascending: false }),
      supabase.from('profiles').select('id, full_name, rank_id').eq('parish_id', adminProfile.parish_id).eq('role', 'member').eq('is_active', true),
      supabase.from('ranks').select('id, name').or(`parish_id.is.null,parish_id.eq.${adminProfile.parish_id}`),
    ]).then(([summaryRes, profilesRes, ranksRes]) => {
      const rankName = new Map(((ranksRes.data ?? []) as any[]).map(r => [r.id, r.name]))
      const people = new Map(((profilesRes.data ?? []) as any[]).map(p => [p.id, p]))
      const seen = new Set<string>()
      const list: RankedMember[] = []
      for (const s of (summaryRes.data ?? []) as any[]) {
        const p = people.get(s.profile_id)
        if (!p) continue
        seen.add(p.id)
        list.push({ id: p.id, full_name: p.full_name, total_points: s.total_points, rankName: rankName.get(p.rank_id) ?? null })
      }
      // ministranci bez żadnych punktów też na liście
      for (const p of people.values()) {
        if (!seen.has(p.id)) list.push({ id: p.id, full_name: p.full_name, total_points: 0, rankName: rankName.get(p.rank_id) ?? null })
      }
      setRanking(list)
      setLoading(false)
    })
  }, [adminProfile?.parish_id])

  const loadRules = useCallback(() => {
    if (!adminProfile?.parish_id) return
    supabase.from('point_rules').select('*').eq('parish_id', adminProfile.parish_id).order('points', { ascending: false })
      .then(({ data }) => setRules((data ?? []) as PointRule[]))
  }, [adminProfile?.parish_id])

  useEffect(() => { loadRanking() }, [loadRanking])
  useFocusEffect(useCallback(() => { loadRules() }, [loadRules]))
  useRealtimeTable('points', () => loadRanking(), adminProfile?.parish_id ? `parish_id=eq.${adminProfile.parish_id}` : undefined)
  useRealtimeTable('attendance', () => loadRanking(), adminProfile?.parish_id ? `parish_id=eq.${adminProfile.parish_id}` : undefined)

  const quickAward = async (m: RankedMember, amount: number) => {
    const key = `${m.id}:${amount}`
    setBusy(key)
    const { error } = await supabase.from('points').insert({
      profile_id: m.id,
      amount,
      reason: quickReason(amount),
      awarded_by: adminProfile?.id,
      parish_id: adminProfile?.parish_id,
    })
    setBusy(null)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    Toast.show({ type: 'success', text1: `${m.full_name}: ${amount > 0 ? '+' : ''}${amount} pkt` })
    loadRanking()
  }

  const medal = (i: number) => ['#C9A55A', '#D9D6CF', '#C98E5A'][i]

  const rankingCard = (
    <Card flush>
      <View style={[styles.cardHead, { borderBottomColor: c.borderLight }]}>
        <AppText variant="eyebrow" color={c.goldInk} style={styles.flex}>Ranking · szybkie przyznawanie</AppText>
        <Button label="Z powodem…" icon="star-circle" compact onPress={() => router.push('/(admin)/award-points')} />
      </View>
      {loading ? <ActivityIndicator color={c.primary} style={styles.pad} /> : ranking.length === 0 ? (
        <AppText muted style={styles.pad}>Brak ministrantów w parafii.</AppText>
      ) : ranking.map((m, i) => (
        <View key={m.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
          <View style={[styles.pos, medal(i) ? { backgroundColor: medal(i) } : { borderWidth: 1, borderColor: c.inputBorder }]}>
            <AppText style={[styles.posText, { color: medal(i) ? '#14213A' : c.subtext }]}>{i + 1}</AppText>
          </View>
          <Pressable style={styles.flex} onPress={() => router.push(`/(admin)/member-detail?id=${m.id}`)}>
            <AppText variant="bodyStrong" numberOfLines={1}>{m.full_name}</AppText>
            <AppText variant="small" muted numberOfLines={1}>{m.rankName ?? 'Ministrant'}</AppText>
          </Pressable>
          <AppText style={[styles.pts, { color: c.text }]}>{m.total_points}</AppText>
          <View style={styles.quick}>
            {QUICK_AMOUNTS.map(a => {
              const k = `${m.id}:${a}`
              return (
                <Pressable
                  key={a}
                  accessibilityRole="button"
                  accessibilityLabel={`${a > 0 ? '+' : ''}${a} pkt dla ${m.full_name}`}
                  onPress={() => quickAward(m, a)}
                  disabled={!!busy}
                  style={({ hovered }: any) => [
                    styles.qBtn,
                    { borderColor: c.inputBorder, backgroundColor: hovered ? c.highlight : c.surface, opacity: busy && busy !== k ? 0.6 : 1 },
                  ]}
                >
                  {busy === k
                    ? <ActivityIndicator size="small" color={c.primary} />
                    : <AppText style={[styles.qText, { color: a > 0 ? c.success : c.dangerStrong }]}>{a > 0 ? `+${a}` : a}</AppText>}
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}
    </Card>
  )

  const rulesCard = (
    <Card flush>
      <View style={[styles.cardHead, { borderBottomColor: c.borderLight }]}>
        <AppText variant="eyebrow" color={c.goldInk} style={styles.flex}>Reguły punktowania</AppText>
      </View>
      {rules.length === 0 ? <AppText muted style={styles.pad}>Brak reguł — ustaw je w edytorze.</AppText> : rules.map((r, i) => (
        <View key={r.id} style={[styles.ruleRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
          <AppText variant="body" style={styles.flex}>{SERVICE_TYPE_LABELS[r.service_type as ServiceType] ?? r.service_type}</AppText>
          <AppText style={[styles.rulePts, { color: r.points >= 0 ? c.success : c.dangerStrong }]}>{r.points > 0 ? `+${r.points}` : r.points}</AppText>
        </View>
      ))}
      {parish?.rejected_excuse_penalty != null && (
        <View style={[styles.ruleRow, { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
          <AppText variant="body" style={styles.flex}>Odrzucone usprawiedliwienie</AppText>
          <AppText style={[styles.rulePts, { color: parish.rejected_excuse_penalty ? c.dangerStrong : c.subtext }]}>
            {parish.rejected_excuse_penalty ? `−${parish.rejected_excuse_penalty}` : '0'}
          </AppText>
        </View>
      )}
      <View style={styles.pad}>
        <Button label="Edytuj reguły" icon="pencil" variant="secondary" onPress={() => router.push('/(admin)/point-rules')} />
      </View>
    </Card>
  )

  const tools = (
    <Card flush>
      <ListRow first icon="download" title="Eksport punktów" subtitle="PDF lub CSV" onPress={() => setExportVisible(true)} />
      <ListRow icon="medal" title="Odznaki" subtitle="Tworzenie i przyznawanie" onPress={() => router.push('/(admin)/badge-management')} />
    </Card>
  )

  if (isDesktop) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.desktop}>
        <View style={styles.colMain}>{rankingCard}</View>
        <View style={styles.colSide}>{rulesCard}{tools}</View>
        <ExportModal visible={exportVisible} onClose={() => setExportVisible(false)} pointsOnly />
      </ScrollView>
    )
  }

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <ScrollView>
        <ScreenHeader eyebrow="Parafia" title="Punkty" />
        <View style={styles.body}>
          {rankingCard}
          {rulesCard}
          {tools}
        </View>
      </ScrollView>
      <ExportModal visible={exportVisible} onClose={() => setExportVisible(false)} pointsOnly />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pad: { padding: 14 },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  pos: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  posText: { ...sans(800), fontSize: 12 },
  pts: { ...sans(800), fontSize: 16, minWidth: 36, textAlign: 'right', fontVariant: ['tabular-nums'] },
  quick: { flexDirection: 'row', gap: 4 },
  qBtn: { width: 36, height: 32, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as any,
  qText: { ...sans(800), fontSize: 12 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  rulePts: { ...sans(800), fontSize: 15, fontVariant: ['tabular-nums'] },
  desktop: { flexDirection: 'row', gap: 20, padding: 28, paddingHorizontal: 32, alignItems: 'flex-start' },
  colMain: { flex: 1.5 },
  colSide: { flex: 1, gap: 16 },
})
