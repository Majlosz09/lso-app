import { useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../../lib/supabase'
import { serviceAvailability } from '../../../lib/serviceRules'
import { AbsenceSheet } from '../../../components/services/AbsenceSheet'
import { useTheme } from '../../../lib/ThemeContext'
import { sans, VESTMENT_DOT, VestmentColor } from '../../../lib/theme'
import { getLiturgicalDay } from '../../../lib/liturgy'
import { dayShort, longDate, shortDate } from '../../../lib/dates'
import { STATUS_COLORS, STATUS_LABELS } from '../../../lib/status'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { ChildDuty, useChildren } from '../../../hooks/useChildren'
import { AppText, Avatar, Button, Card, ScreenHeader } from '../../../components/ui'

type Duty = ChildDuty & { child: string; avatar: string | null }

/** N14: rodzic może zgłosić nieobecność dziecka na tych samych zasadach co ministrant. */
function canReport(d: ChildDuty): boolean {
  return serviceAvailability(
    { date: d.date, time: d.time, category: d.category as any, mine: { id: d.assignmentId, status: d.status } as any, attended: d.status === 'present' },
    'self',
  ).canReportAbsence
}

/** Błąd „brak funkcji” przed migracją 20261001010000. */
const rpcMissing = (msg: string) => /report_child_absence|withdraw_child_absence|schema cache/.test(msg)

/** Nadchodzące dyżury dzieci (4 tygodnie), pogrupowane po dniach. */
export default function ParentSchedule() {
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const { children, loading, reload } = useChildren(28)
  const [refreshing, setRefreshing] = useState(false)
  const [absenceFor, setAbsenceFor] = useState<Duty | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const report = async (text: string) => {
    const d = absenceFor
    if (!d) return
    setBusy(d.assignmentId)
    const { error } = await supabase.rpc('report_child_absence', { p_assignment_id: d.assignmentId, p_reason: text })
    setBusy(null)
    if (error) {
      Toast.show({ type: 'error', text1: rpcMissing(error.message) ? 'Funkcja jeszcze niedostępna' : 'Nie udało się wysłać', text2: rpcMissing(error.message) ? undefined : error.message })
      return
    }
    setAbsenceFor(null)
    Toast.show({ type: 'success', text1: 'Zgłoszenie wysłane do opiekuna', text2: d.child })
    reload()
  }

  const withdraw = async (d: Duty) => {
    setBusy(d.assignmentId)
    const { error } = await supabase.rpc('withdraw_child_absence', { p_assignment_id: d.assignmentId })
    setBusy(null)
    if (error) { Toast.show({ type: 'error', text1: 'Nie udało się wycofać', text2: error.message }); return }
    Toast.show({ type: 'success', text1: 'Zgłoszenie wycofane', text2: d.child })
    reload()
  }

  const duties: Duty[] = children
    .flatMap(ch => ch.duties.map(d => ({ ...d, child: ch.full_name, avatar: ch.avatar_url })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  const days = Array.from(new Set(duties.map(d => d.date)))

  const body = loading ? <ActivityIndicator color={c.primary} style={styles.loader} /> : days.length === 0 ? (
    <View style={[styles.empty, { borderColor: c.iconMuted }]}>
      <AppText muted>{children.length ? 'Dzieci nie mają zaplanowanych dyżurów w najbliższych tygodniach.' : 'Brak powiązanych dzieci.'}</AppText>
    </View>
  ) : days.map(day => {
    const lit = getLiturgicalDay(day)
    const vest = (lit.color ?? 'GREEN') as VestmentColor
    return (
      <View key={day} style={styles.group}>
        <View style={styles.dayHead}>
          <View style={[styles.dot, { backgroundColor: VESTMENT_DOT[vest] }, vest === 'WHITE' && { borderWidth: 1, borderColor: c.gold }]} />
          <AppText style={[styles.dayLabel, { color: c.text }]}>{`${dayShort(day)} ${shortDate(day)}`}</AppText>
          <AppText variant="small" muted numberOfLines={1} style={styles.flex}>{lit.name}</AppText>
        </View>
        <Card flush>
          {duties.filter(d => d.date === day).map((d, i) => (
            <View key={d.assignmentId} style={[styles.rowWrap, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
            <View style={styles.row}>
              <AppText style={[styles.time, { color: c.text }]}>{d.time}</AppText>
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={1}>{d.title}</AppText>
                <View style={styles.childLine}>
                  <Avatar name={d.child} avatarUrl={d.avatar} size={20} />
                  <AppText variant="small" muted>{d.child}</AppText>
                </View>
              </View>
              <View style={[styles.status, { backgroundColor: (STATUS_COLORS[d.status] ?? c.subtext) + '22' }]}>
                <AppText style={[styles.statusText, { color: STATUS_COLORS[d.status] ?? c.subtext }]}>{STATUS_LABELS[d.status] ?? d.status}</AppText>
              </View>
            </View>
            {canReport(d) ? (
              <Button label="Zgłoś nieobecność" icon="calendar-remove" variant="ghost" compact style={styles.action} onPress={() => setAbsenceFor(d)} />
            ) : d.status === 'excused' ? (
              <Button label="Wycofaj zgłoszenie" icon="undo" variant="ghost" compact style={styles.action} loading={busy === d.assignmentId} onPress={() => withdraw(d)} />
            ) : null}
            </View>
          ))}
        </Card>
      </View>
    )
  })

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false) }} />}
    >
      {!isDesktop && <ScreenHeader eyebrow="Najbliższe 4 tygodnie" title="Dyżury dzieci" />}
      <View style={[styles.body, isDesktop && styles.desktop]}>{body}</View>
      <AbsenceSheet
        visible={!!absenceFor}
        title={absenceFor ? `${absenceFor.child.split(' ')[0]} nie może być` : 'Nieobecność'}
        eyebrow={absenceFor ? `${absenceFor.title} · ${longDate(absenceFor.date)} ${absenceFor.time}` : undefined}
        busy={!!absenceFor && busy === absenceFor.assignmentId}
        onClose={() => setAbsenceFor(null)}
        onSubmit={report}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  loader: { marginTop: 40 },
  body: { padding: 16, gap: 16, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 900 },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16, padding: 24 },
  group: { gap: 8 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dayLabel: { ...sans(700), fontSize: 13 },
  rowWrap: { paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  action: { alignSelf: 'flex-start', marginLeft: 48 },
  time: { ...sans(800), fontSize: 15, width: 48, fontVariant: ['tabular-nums'] },
  childLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  status: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { ...sans(700), fontSize: 11 },
})
