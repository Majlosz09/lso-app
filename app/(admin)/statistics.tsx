import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { CATEGORY_CONFIG } from '../../types/database'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif } from '../../lib/theme'
import { addDays, localDateStr } from '../../lib/dates'
import { computeParishStats, ParishStats } from '../../lib/statistics'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { ExportModal } from '../../components/ExportModal'
import { AppText, Button, Card, ScreenHeader, Segmented } from '../../components/ui'

type Period = '7' | '30' | '90' | '365'
const MONTH_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

export default function StatisticsScreen() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const [period, setPeriod] = useState<Period>('30')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<ParishStats | null>(null)
  const [exportVisible, setExportVisible] = useState(false)

  useEffect(() => {
    const parishId = profile?.parish_id
    if (!parishId) return
    let cancelled = false
    const to = localDateStr()
    const from = addDays(to, -Number(period))
    setLoading(true)
    Promise.all([
      // służby „bez punktów” nie wchodzą do statystyk obecności
      supabase.from('schedules').select('id, category, date').eq('parish_id', parishId).neq('service_mode', 'none').gte('date', from).lte('date', to),
      supabase.from('schedule_assignments')
        .select('profile_id, status, schedule:schedules!inner(id, date, category, parish_id, service_mode)')
        .eq('schedule.parish_id', parishId).neq('schedule.service_mode', 'none').gte('schedule.date', from).lte('schedule.date', to),
      supabase.from('points').select('profile_id, amount').eq('parish_id', parishId).gte('created_at', new Date(from + 'T00:00:00').toISOString()),
      supabase.from('profiles').select('id, full_name').eq('parish_id', parishId).eq('role', 'member').eq('is_active', true),
    ]).then(([s, a, p, n]) => {
      if (cancelled) return
      const names = Object.fromEntries(((n.data ?? []) as any[]).map(x => [x.id, x.full_name]))
      setStats(computeParishStats(from, to, (s.data ?? []) as any, (a.data ?? []) as any, (p.data ?? []) as any, names))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [period, profile?.parish_id])

  const rateColor = (r: number | null) => r == null ? c.iconMuted : r >= 85 ? c.successStrong : r >= 70 ? c.gold : c.dangerStrong
  const maxMonth = Math.max(1, ...(stats?.months ?? []).map(m => m.services))
  const maxPresent = Math.max(1, ...(stats?.months ?? []).map(m => m.present))

  const weeksCard = (
    <Card large style={styles.panel}>
      <AppText variant="eyebrow" color={c.goldInk}>Tydzień po tygodniu</AppText>
      <View style={styles.bars}>
        {(stats?.weeks ?? []).map(w => (
          <View key={w.label} style={styles.barCol}>
            <AppText style={[styles.barTop, { color: c.text }]}>{w.rate != null ? `${w.rate}%` : '—'}</AppText>
            <View style={[styles.barTrack, { backgroundColor: c.borderLight }]}>
              <View style={[styles.barFill, { height: `${w.rate ?? 0}%`, backgroundColor: c.primary }]} />
            </View>
            <AppText style={[styles.barLabel, { color: c.subtext }]} numberOfLines={2}>{w.label}</AppText>
          </View>
        ))}
      </View>
    </Card>
  )

  const catCard = (
    <Card large style={styles.panel}>
      <AppText variant="eyebrow" color={c.goldInk}>Podział wg rodzaju</AppText>
      {(stats?.categories ?? []).length === 0 ? <AppText muted>Brak służb w tym okresie.</AppText> : stats!.categories.map(k => {
        const cfg = CATEGORY_CONFIG[k.category] ?? CATEGORY_CONFIG.msza
        return (
          <View key={k.category} style={styles.catRow}>
            <View style={styles.rowBetween}>
              <AppText variant="bodyStrong">{cfg.label}</AppText>
              <AppText variant="small" muted>{`${k.share}% · ${k.services} służb · frekw. ${k.rate != null ? `${k.rate}%` : '—'}`}</AppText>
            </View>
            <View style={[styles.hTrack, { backgroundColor: c.borderLight }]}>
              <View style={[styles.hFill, { width: `${k.share}%`, backgroundColor: cfg.color }]} />
            </View>
          </View>
        )
      })}
    </Card>
  )

  const monthCard = (
    <Card large style={styles.panel}>
      <AppText variant="eyebrow" color={c.goldInk}>Aktywność miesięczna</AppText>
      <View style={styles.bars}>
        {(stats?.months ?? []).slice(-6).map(m => (
          <View key={m.month} style={styles.barCol}>
            <View style={[styles.monthPair, { height: 90 }]}>
              <View style={[styles.monthBar, { height: `${(m.services / maxMonth) * 100}%`, backgroundColor: c.goldSurface }]} />
              <View style={[styles.monthBar, { height: `${(m.present / maxPresent) * 100}%`, backgroundColor: c.primary }]} />
            </View>
            <AppText style={[styles.barTop, { color: c.text }]}>{MONTH_ROMAN[Number(m.month.slice(5)) - 1]}</AppText>
            <AppText style={[styles.barLabel, { color: c.subtext }]}>{`${m.services} służb`}</AppText>
          </View>
        ))}
      </View>
      <AppText variant="small" muted>Jasne — liczba służb, granatowe — obecności.</AppText>
    </Card>
  )

  const membersCard = (
    <Card flush>
      <View style={styles.cardHead}><AppText variant="eyebrow" color={c.goldInk}>Frekwencja ministrantów</AppText></View>
      <View style={isDesktop ? styles.memberGrid : undefined}>
        {(stats?.members ?? []).map(m => (
          <View key={m.profile_id} style={[styles.memberRow, { borderTopColor: c.borderLight }, isDesktop && styles.memberCell]}>
            <AppText variant="body" style={styles.memberName} numberOfLines={1}>{m.full_name}</AppText>
            <View style={[styles.hTrack, styles.flex, { backgroundColor: c.borderLight }]}>
              <View style={[styles.hFill, { width: `${m.rate ?? 0}%`, backgroundColor: rateColor(m.rate) }]} />
            </View>
            <AppText style={[styles.memberRate, { color: c.text }]}>{m.rate != null ? `${m.rate}%` : '—'}</AppText>
          </View>
        ))}
      </View>
    </Card>
  )

  const periodSeg = (
    <Segmented
      value={period}
      onChange={setPeriod}
      options={[{ value: '7', label: 'Tydzień' }, { value: '30', label: 'Miesiąc' }, { value: '90', label: 'Kwartał' }, { value: '365', label: 'Rok' }]}
    />
  )

  const big = (color: string) => (
    <View style={styles.bigRow}>
      <AppText style={[serif(), styles.big, { color }]}>{stats?.rate != null ? `${stats.rate}%` : '—'}</AppText>
      <AppText variant="bodyStrong" color={color} style={styles.bigSub}>
        {`średnia frekwencja · ${stats?.services ?? 0} służb · ${stats?.points ?? 0} pkt`}
      </AppText>
    </View>
  )

  const body = loading ? <ActivityIndicator color={c.primary} style={styles.loader} /> : (
    <>
      {isDesktop ? (
        <View style={styles.threeCols}>{weeksCard}{catCard}{monthCard}</View>
      ) : (
        <>{weeksCard}{catCard}{monthCard}</>
      )}
      {membersCard}
    </>
  )

  return (
    <>
      <Stack.Screen options={{ title: 'Statystyki', headerShown: false }} />
      <ScrollView style={{ backgroundColor: c.bg }}>
        {isDesktop ? (
          <View style={styles.deskHead}>
            <View style={styles.deskBig}>{big(c.text)}</View>
            <View style={styles.deskSeg}>{periodSeg}</View>
            <Button label="Raport miesięczny" icon="file-chart" variant="secondary" compact onPress={() => router.push('/(admin)/monthly-report' as any)} />
            <Button label="Eksportuj raport" icon="download" compact onPress={() => setExportVisible(true)} />
          </View>
        ) : (
          <ScreenHeader
            eyebrow="Frekwencja i aktywność"
            title="Statystyki"
            onBack={() => (router.canGoBack() ? router.back() : router.replace('/(admin)/(admin-tabs)'))}
          />
        )}
        <View style={[styles.body, isDesktop && styles.deskBody]}>
          {!isDesktop && (
            <>
              {big(c.text)}
              {periodSeg}
              <Button label="Eksportuj raport" icon="download" variant="secondary" onPress={() => setExportVisible(true)} />
            </>
          )}
          {body}
        </View>
      </ScrollView>
      <ExportModal visible={exportVisible} onClose={() => setExportVisible(false)} />
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  loader: { marginTop: 40 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  deskBody: { paddingHorizontal: 32, paddingTop: 0 },
  deskHead: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 32, paddingTop: 24, paddingBottom: 18, flexWrap: 'wrap' },
  deskBig: { flexGrow: 1, flexBasis: 260, minWidth: 220 },
  deskSeg: { width: 380, maxWidth: '100%' },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  big: { fontSize: 64, lineHeight: 68, fontFamily: 'Manrope_500Medium' },
  bigSub: { flexShrink: 1 },
  threeCols: { flexDirection: 'row', gap: 16, alignItems: 'stretch' },
  panel: { flex: 1, gap: 14, padding: 18 },
  bars: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barTop: { ...sans(800), fontSize: 12, fontVariant: ['tabular-nums'] },
  barTrack: { width: '100%', height: 90, borderRadius: 8, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 8 },
  barLabel: { ...sans(600), fontSize: 9, textAlign: 'center' },
  monthPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, width: '100%', justifyContent: 'center' },
  monthBar: { width: '40%', maxWidth: 22, borderRadius: 5, minHeight: 3 },
  catRow: { gap: 6 },
  hTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  hFill: { height: 8, borderRadius: 4 },
  cardHead: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  memberGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1 },
  memberCell: { width: '50%' },
  memberName: { width: 150 },
  memberRate: { ...sans(800), fontSize: 13, width: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
})
