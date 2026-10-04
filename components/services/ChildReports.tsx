import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { addDays, dayShort, localDateStr, shortDate } from '../../lib/dates'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { AppText, Badge, Button, Card } from '../ui'

type Report = {
  id: string
  profile_id: string
  service_date: string
  service_time: string
  title: string
  status: 'pending' | 'approved' | 'rejected'
  admin_note: string | null
}

const STATUS: Record<Report['status'], { label: string; tone: 'gold' | 'success' | 'danger' }> = {
  pending: { label: 'czeka na opiekuna', tone: 'gold' },
  approved: { label: 'przyjęte', tone: 'success' },
  rejected: { label: 'odrzucone', tone: 'danger' },
}

/**
 * Zgłoszenia obecności po fakcie z ostatnich 14 dni.
 * Ministrant: własne (z wycofaniem oczekujących). Rodzic: dzieci (z imieniem).
 */
export function ReportsStatus({ profileIds, names, canWithdraw, title = 'Zgłoszenia obecności' }: {
  profileIds: string[]
  names?: Record<string, string>
  canWithdraw?: boolean
  title?: string
}) {
  const { colors: c } = useTheme()
  const [items, setItems] = useState<Report[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const key = profileIds.join(',')

  const load = useCallback(async () => {
    if (!profileIds.length) { setItems([]); return }
    const { data } = await supabase
      .from('attendance_reports')
      .select('id, profile_id, service_date, service_time, title, status, admin_note')
      .in('profile_id', profileIds)
      .gte('service_date', addDays(localDateStr(), -14))
      .order('service_date', { ascending: false })
    setItems((data ?? []) as Report[])
  }, [key])
  useEffect(() => { load() }, [load])
  useRealtimeTable('attendance_reports', () => { load() })

  const withdraw = async (r: Report) => {
    setBusy(r.id)
    const { error } = await supabase.from('attendance_reports').delete().eq('id', r.id)
    setBusy(null)
    if (error) { Toast.show({ type: 'error', text1: 'Nie udało się wycofać', text2: error.message }); return }
    Toast.show({ type: 'success', text1: 'Zgłoszenie wycofane' })
    load()
  }

  if (items.length === 0) return null
  return (
    <View style={styles.wrap}>
      <AppText variant="eyebrow" color={c.goldInk}>{title}</AppText>
      <Card flush>
        {items.map((r, i) => (
          <View key={r.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
            <View style={styles.line}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={1}>{`${r.title} · ${r.service_time.slice(0, 5)}`}</AppText>
                <AppText variant="small" muted>
                  {`${dayShort(r.service_date)} ${shortDate(r.service_date)}${names?.[r.profile_id] ? ` · ${names[r.profile_id]}` : ''}`}
                </AppText>
              </View>
              <Badge label={STATUS[r.status].label} tone={STATUS[r.status].tone} />
            </View>
            {!!r.admin_note && <AppText variant="small" color={c.dangerStrong}>{r.admin_note}</AppText>}
            {canWithdraw && r.status === 'pending' && (
              <Button label="Wycofaj" icon="undo" variant="ghost" compact style={styles.action} loading={busy === r.id} onPress={() => withdraw(r)} />
            )}
          </View>
        ))}
      </Card>
    </View>
  )
}

/** Rodzic: zgłoszenia obecności dzieci. */
export function ChildReports({ childIds, names }: { childIds: string[]; names: Record<string, string> }) {
  return <ReportsStatus profileIds={childIds} names={names} title="Zgłoszenia obecności dzieci" />
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  row: { paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  action: { alignSelf: 'flex-start', marginLeft: -12 },
})
