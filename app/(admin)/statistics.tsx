import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { shadow } from '../../lib/shadows'
import { getCatColors, ScheduleCategory } from '../../types/database'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ExportModal } from '../../components/ExportModal'

type Period = 7 | 30 | 90 | 365

type Overview = {
  total_services: number
  total_points: number
  attendance_rate: number
  assigned_count: number
  present_count: number
}

type TopMember = {
  profile_id: string
  full_name: string
  services: number
  points: number
  rate: number
}

type CategoryStat = {
  category: ScheduleCategory
  services: number
  assigned: number
  present: number
}

type MonthStat = {
  month: string
  services: number
  present: number
}

const PERIOD_LABELS: Record<Period, string> = {
  7: '7 dni',
  30: '30 dni',
  90: '3 mies.',
  365: 'rok',
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function StatisticsScreen() {
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [period, setPeriod] = useState<Period>(30)
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [topMembers, setTopMembers] = useState<TopMember[]>([])
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([])
  const [monthStats, setMonthStats] = useState<MonthStat[]>([])
  const [exportVisible, setExportVisible] = useState(false)

  const fetchStats = async (p: Period) => {
    if (!profile?.parish_id) return
    setLoading(true)

    const from = new Date()
    from.setDate(from.getDate() - p)
    const fromStr = localDateStr(from)
    const todayStr = localDateStr(new Date())
    const parishId = profile.parish_id

    const [schedulesRes, assignmentsRes, attendanceRes, pointsRes] = await Promise.all([
      supabase
        .from('schedules')
        .select('id, category, date')
        .eq('parish_id', parishId)
        .gte('date', fromStr)
        .lte('date', todayStr),
      supabase
        .from('schedule_assignments')
        .select('id, profile_id, status, schedule:schedules!inner(date, category, parish_id)')
        .eq('schedule.parish_id', parishId)
        .gte('schedule.date', fromStr)
        .lte('schedule.date', todayStr),
      supabase
        .from('attendance')
        .select('profile_id, schedule_id, checked_at')
        .eq('parish_id', parishId)
        .gte('checked_at', from.toISOString()),
      supabase
        .from('points')
        .select('profile_id, amount')
        .eq('parish_id', parishId)
        .gte('created_at', from.toISOString()),
    ])

    const schedules: any[] = schedulesRes.data ?? []
    const assignments: any[] = assignmentsRes.data ?? []
    const attendances: any[] = attendanceRes.data ?? []
    const pointRows: any[] = pointsRes.data ?? []

    // Overview
    const presentCount = assignments.filter(a =>
      ['present', 'confirmed'].includes(a.status)
    ).length
    const assignedCount = assignments.filter(a =>
      a.status !== 'excused'
    ).length
    const totalPoints = pointRows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0)

    setOverview({
      total_services: schedules.length,
      total_points: totalPoints,
      attendance_rate: assignedCount > 0 ? Math.round((presentCount / assignedCount) * 100) : 0,
      assigned_count: assignedCount,
      present_count: presentCount,
    })

    // Top members
    const memberMap: Record<string, { full_name: string; services: Set<string>; present: number; points: number }> = {}
    assignments.forEach((a: any) => {
      if (!memberMap[a.profile_id]) memberMap[a.profile_id] = { full_name: '', services: new Set(), present: 0, points: 0 }
      memberMap[a.profile_id].services.add(a.schedule?.id ?? a.id)
      if (['present', 'confirmed'].includes(a.status)) memberMap[a.profile_id].present++
    })
    pointRows.forEach((r: any) => {
      if (r.amount > 0) {
        if (!memberMap[r.profile_id]) memberMap[r.profile_id] = { full_name: '', services: new Set(), present: 0, points: 0 }
        memberMap[r.profile_id].points += r.amount
      }
    })

    // Fill names from assignments
    const { data: profileNames } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('parish_id', parishId)
      .eq('role', 'member')

    ;(profileNames ?? []).forEach((p: any) => {
      if (memberMap[p.id]) memberMap[p.id].full_name = p.full_name
    })

    const top = Object.entries(memberMap)
      .map(([id, v]) => ({
        profile_id: id,
        full_name: v.full_name || '—',
        services: v.services.size,
        points: v.points,
        rate: v.services.size > 0 ? Math.round((v.present / v.services.size) * 100) : 0,
      }))
      .filter(m => m.full_name !== '—' || m.services > 0)
      .sort((a, b) => b.services - a.services || b.points - a.points)
      .slice(0, 5)

    setTopMembers(top)

    // Category stats
    const catMap: Record<string, { services: number; assigned: number; present: number }> = {}
    schedules.forEach((s: any) => {
      if (!catMap[s.category]) catMap[s.category] = { services: 0, assigned: 0, present: 0 }
      catMap[s.category].services++
    })
    assignments.forEach((a: any) => {
      const cat = a.schedule?.category
      if (cat && catMap[cat]) {
        if (a.status !== 'excused') catMap[cat].assigned++
        if (['present', 'confirmed'].includes(a.status)) catMap[cat].present++
      }
    })
    setCategoryStats(
      Object.entries(catMap).map(([cat, v]) => ({
        category: cat as ScheduleCategory,
        ...v,
      })).sort((a, b) => b.services - a.services)
    )

    // Monthly stats (last N months)
    const monthMap: Record<string, { services: number; present: number }> = {}
    schedules.forEach((s: any) => {
      const m = s.date.slice(0, 7)
      if (!monthMap[m]) monthMap[m] = { services: 0, present: 0 }
      monthMap[m].services++
    })
    assignments.forEach((a: any) => {
      const m = a.schedule?.date?.slice(0, 7)
      if (m && monthMap[m] && ['present', 'confirmed'].includes(a.status)) {
        monthMap[m].present++
      }
    })
    const months = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }))
    setMonthStats(months)

    setLoading(false)
  }

  useEffect(() => { fetchStats(period) }, [period, profile?.parish_id])

  const handlePeriod = (p: Period) => {
    if (p !== period) setPeriod(p)
  }

  return (
    <>
      <Stack.Screen options={{
        title: 'Statystyki',
        headerRight: () => (
          <TouchableOpacity
            onPress={() => setExportVisible(true)}
            hitSlop={8}
            style={{ marginRight: 4 }}
          >
            <Ionicons name="download-outline" size={22} color="#fff" />
          </TouchableOpacity>
        ),
      }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* Period filter */}
        <View style={styles.periodRow}>
          {([7, 30, 90, 365] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => handlePeriod(p)}
            >
              <Text style={[styles.periodLabel, period === p && styles.periodLabelActive]}>
                {PERIOD_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={c.primary} />
          </View>
        ) : (
          <>
            {/* Overview cards */}
            <View style={styles.overviewRow}>
              <OverviewCard
                icon="checkmark-circle"
                color="#16A34A"
                value={`${overview?.attendance_rate ?? 0}%`}
                label={`Frekwencja\n${overview?.present_count ?? 0}/${overview?.assigned_count ?? 0}`}
                styles={styles}
              />
              <OverviewCard
                icon="calendar"
                color={c.primary}
                value={String(overview?.total_services ?? 0)}
                label="Służb"
                styles={styles}
              />
              <OverviewCard
                icon="trophy"
                color="#FFC107"
                value={String(overview?.total_points ?? 0)}
                label="Pkt łącznie"
                styles={styles}
              />
            </View>

            {/* Top members */}
            {topMembers.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Top ministranci</Text>
                {topMembers.map((m, i) => (
                  <TopMemberRow key={m.profile_id} member={m} position={i + 1} styles={styles} />
                ))}
              </View>
            )}

            {/* Category stats */}
            {categoryStats.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Podział wg kategorii</Text>
                {categoryStats.map(cat => (
                  <CategoryRow key={cat.category} stat={cat} styles={styles} />
                ))}
              </View>
            )}

            {/* Monthly activity */}
            {monthStats.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Aktywność miesięczna</Text>
                <MonthChart months={monthStats} styles={styles} colors={c} />
              </View>
            )}

            {!overview?.total_services && (
              <View style={styles.empty}>
                <Ionicons name="bar-chart-outline" size={48} color={c.border} />
                <Text style={styles.emptyText}>Brak danych dla wybranego okresu</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
      <ExportModal visible={exportVisible} onClose={() => setExportVisible(false)} />
    </>
  )
}

function OverviewCard({ icon, color, value, label, styles }: {
  icon: any; color: string; value: string; label: string; styles: any
}) {
  return (
    <View style={[styles.overviewCard, { borderTopColor: color }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.overviewValue}>{value}</Text>
      <Text style={styles.overviewLabel}>{label}</Text>
    </View>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

function TopMemberRow({ member, position, styles }: { member: TopMember; position: number; styles: any }) {
  return (
    <View style={styles.memberRow}>
      <Text style={styles.memberPos}>
        {position <= 3 ? MEDALS[position - 1] : `#${position}`}
      </Text>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName} numberOfLines={1}>{member.full_name}</Text>
        <Text style={styles.memberMeta}>{member.services} służb · {member.rate}% frekwencja</Text>
      </View>
      <View style={styles.memberPoints}>
        <Text style={styles.memberPtsValue}>{member.points}</Text>
        <Text style={styles.memberPtsLabel}>pkt</Text>
      </View>
    </View>
  )
}

function CategoryRow({ stat, styles }: { stat: CategoryStat; styles: any }) {
  const { isDark } = useTheme()
  const cfg = getCatColors(stat.category, isDark)
  const rate = stat.assigned > 0 ? stat.present / stat.assigned : 0
  return (
    <View style={styles.catRow}>
      <View style={[styles.catDot, { backgroundColor: cfg.color }]} />
      <View style={styles.catInfo}>
        <View style={styles.catHeader}>
          <Text style={styles.catLabel}>{cfg.label}</Text>
          <Text style={styles.catCount}>{stat.services} służb</Text>
        </View>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${Math.round(rate * 100)}%` as any, backgroundColor: cfg.color }]} />
        </View>
        <Text style={styles.catRate}>{Math.round(rate * 100)}% frekwencja</Text>
      </View>
    </View>
  )
}

function MonthChart({ months, styles, colors: c }: { months: MonthStat[]; styles: any; colors: Colors }) {
  const maxServices = Math.max(...months.map(m => m.services), 1)
  return (
    <View style={styles.monthChart}>
      <View style={styles.monthCols}>
      {months.map(m => {
        const barH = Math.max(4, Math.round((m.services / maxServices) * 80))
        const presentH = m.services > 0 ? Math.round((m.present / m.services) * barH) : 0
        const [year, month] = m.month.split('-')
        const label = new Date(Number(year), Number(month) - 1).toLocaleDateString('pl-PL', { month: 'short' })
        return (
          <View key={m.month} style={styles.monthCol}>
            <Text style={styles.monthCount}>{m.services}</Text>
            <View style={[styles.monthBar, { height: barH }]}>
              <View style={[styles.monthPresent, { height: presentH }]} />
            </View>
            <Text style={styles.monthLabel}>{label}</Text>
          </View>
        )
      })}
      </View>
      <View style={styles.chartLegend}>
        <View style={[styles.legendDot, { backgroundColor: c.primaryAlpha08 }]} />
        <Text style={styles.legendText}>Przypisania</Text>
        <View style={[styles.legendDot, { backgroundColor: '#16A34A' }]} />
        <Text style={styles.legendText}>Obecni</Text>
      </View>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 16 },
    center: { paddingVertical: 60, alignItems: 'center' },

    periodRow: {
      flexDirection: 'row',
      backgroundColor: c.border,
      borderRadius: 10,
      padding: 3,
      gap: 2,
    },
    periodBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
    periodBtnActive: { backgroundColor: c.surface, ...shadow.md },
    periodLabel: { fontSize: 13, fontWeight: '500', color: c.subtext },
    periodLabelActive: { color: c.text, fontWeight: '600' },

    overviewRow: { flexDirection: 'row', gap: 10 },
    overviewCard: {
      flex: 1, backgroundColor: c.surface, borderRadius: 12, padding: 12,
      alignItems: 'center', gap: 4, borderTopWidth: 3,
      ...shadow.xs,
    },
    overviewValue: { fontSize: 22, fontWeight: '800', color: c.text },
    overviewLabel: { fontSize: 11, color: c.subtext, textAlign: 'center', lineHeight: 15 },

    section: {
      backgroundColor: c.surface, borderRadius: 14, padding: 14, gap: 10,
      ...shadow.xs,
    },
    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.8,
    },

    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    memberPos: { fontSize: 18, width: 32, textAlign: 'center' },
    memberInfo: { flex: 1 },
    memberName: { fontSize: 14, fontWeight: '600', color: c.text },
    memberMeta: { fontSize: 12, color: c.textTertiary, marginTop: 1 },
    memberPoints: { alignItems: 'flex-end' },
    memberPtsValue: { fontSize: 17, fontWeight: '700', color: c.primary },
    memberPtsLabel: { fontSize: 10, color: c.textTertiary },

    catRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    catDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
    catInfo: { flex: 1, gap: 4 },
    catHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    catLabel: { fontSize: 13, fontWeight: '600', color: c.text },
    catCount: { fontSize: 12, color: c.subtext },
    barBg: { height: 6, backgroundColor: c.primarySurface, borderRadius: 3, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3 },
    catRate: { fontSize: 11, color: c.textTertiary },

    monthChart: { gap: 8 },
    monthCols: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 100 },
    monthCol: { alignItems: 'center', gap: 2, flex: 1 },
    monthBar: { width: 24, backgroundColor: c.primaryAlpha08, borderRadius: 4, justifyContent: 'flex-end' },
    monthPresent: { width: '100%', backgroundColor: '#16A34A', borderRadius: 4 },
    monthCount: { fontSize: 9, color: c.textTertiary },
    monthLabel: { fontSize: 10, color: c.subtext },
    chartLegend: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 11, color: c.subtext, marginRight: 6 },

    empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
    emptyText: { color: c.textTertiary, fontSize: 14 },
  })
}
