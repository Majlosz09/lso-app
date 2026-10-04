import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { dayShort, pl, relativeDay, shortDate } from '../../lib/dates'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { AppText, Avatar, Badge, Button, Card, Icon, Sheet, TextField } from '../ui'

type Report = {
  id: string
  service_date: string
  service_time: string
  category: string
  title: string
  note: string | null
  created_at: string
  schedule_id: string | null
  profile: { full_name: string }
}

const CAT: Record<string, string> = { msza: 'Msza', nabozenstwo: 'Nabożeństwo', zbiorka: 'Zbiórka' }

/** Zgłoszenia obecności po fakcie — opiekun przyjmuje (obecność + punkty) albo odrzuca. */
export function AttendanceReportsList({ isDesktop, onCount }: { isDesktop: boolean; onCount?: (n: number) => void }) {
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const { colors: c } = useTheme()
  const [items, setItems] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<Report | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    if (!parishId) return
    const { data, error } = await supabase
      .from('attendance_reports')
      .select('id, service_date, service_time, category, title, note, created_at, schedule_id, profile:profiles!attendance_reports_profile_id_fkey(full_name)')
      .eq('parish_id', parishId)
      .eq('status', 'pending')
      .order('service_date', { ascending: false })
    if (error) Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
    const list = (data ?? []) as unknown as Report[]
    setItems(list)
    onCount?.(list.length)
    setLoading(false)
  }, [parishId])
  useEffect(() => { load() }, [load])
  useRealtimeTable('attendance_reports', () => { load() }, parishId ? `parish_id=eq.${parishId}` : undefined)

  const decide = async (r: Report, approve: boolean, adminNote?: string) => {
    setBusy(r.id)
    const { data, error } = await supabase.rpc('decide_attendance_report', { p_id: r.id, p_approve: approve, p_note: adminNote ?? null })
    setBusy(null)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    const pts = (data as any)?.points_awarded
    Toast.show(approve
      ? { type: 'success', text1: `Obecność przyjęta: ${r.profile.full_name}`, text2: pts ? `+${pts} pkt` : undefined }
      : { type: 'info', text1: `Odrzucono: ${r.profile.full_name}` })
    setRejecting(null)
    load()
  }

  if (loading) return <ActivityIndicator color={c.primary} style={styles.loader} />
  if (items.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: c.iconMuted }]}>
        <Icon name="check-circle" size={40} color={c.success} filled />
        <AppText variant="bodyStrong">Brak zgłoszeń obecności</AppText>
        <AppText muted style={styles.center}>Gdy ministrant był na służbie, ale jej nie potwierdził, jego zgłoszenie pojawi się tutaj.</AppText>
      </View>
    )
  }

  return (
    <>
      <View style={[styles.grid, isDesktop && styles.gridDesktop]}>
        {items.map(r => (
          <Card key={r.id} large style={[styles.card, isDesktop && styles.cardDesktop]}>
            <View style={styles.head}>
              <Avatar name={r.profile.full_name} size={42} color={c.primary} textColor={c.gold} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{r.profile.full_name}</AppText>
                <AppText variant="small" muted>
                  {`${r.title} · ${dayShort(r.service_date)} ${shortDate(r.service_date)} · ${r.service_time.slice(0, 5)} (${relativeDay(r.service_date)})`}
                </AppText>
              </View>
              <Badge label={CAT[r.category] ?? r.category} tone={r.schedule_id ? 'navy' : 'gold'} />
            </View>
            {!r.schedule_id && (
              <AppText variant="small" muted>Tej służby nie było w grafiku — po przyjęciu zostanie dodana.</AppText>
            )}
            {!!r.note && (
              <View style={[styles.reason, { backgroundColor: c.goldSurface }]}>
                <AppText style={[styles.reasonText, { color: c.goldText }]}>{r.note}</AppText>
              </View>
            )}
            <View style={styles.actions}>
              <Button label="Odrzuć" variant="secondary" style={styles.flex} onPress={() => { setNote(''); setRejecting(r) }} />
              <Button label="Był — przyjmij" style={styles.flex} loading={busy === r.id} onPress={() => decide(r, true)} />
            </View>
          </Card>
        ))}
      </View>
      <Sheet
        visible={!!rejecting}
        onClose={() => setRejecting(null)}
        eyebrow={rejecting ? `${rejecting.profile.full_name} · ${rejecting.title}` : undefined}
        title="Odrzucić zgłoszenie obecności?"
        footer={<Button label="Odrzuć" variant="danger" loading={!!rejecting && busy === rejecting.id} onPress={() => rejecting && decide(rejecting, false, note)} />}
      >
        <TextField label="Powód (zobaczy ministrant, opcjonalnie)" placeholder="np. nie było Cię na tej Mszy" value={note} onChangeText={setNote} />
      </Sheet>
    </>
  )
}

export function reportsCountLabel(n: number) {
  return `${n} ${pl(n, ['zgłoszenie', 'zgłoszenia', 'zgłoszeń'])}`
}

const styles = StyleSheet.create({
  loader: { marginTop: 40 },
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: 8, padding: 28, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed' },
  grid: { gap: 12 },
  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { gap: 10 },
  cardDesktop: { width: '48.5%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reason: { borderRadius: 12, padding: 12 },
  reasonText: { ...sans(500), fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10 },
})
