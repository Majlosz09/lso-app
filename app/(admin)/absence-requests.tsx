import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Stack } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { dayShort, longDate, pl, shortDate } from '../../lib/dates'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { AppText, Avatar, Badge, Button, Card, Icon, Sheet } from '../../components/ui'

const REJECTION_NOTE =
  'Usprawiedliwienie nie zostało zatwierdzone. Skontaktuj się z księdzem, aby wyjaśnić sytuację.'

type AbsenceRequest = {
  id: string
  absence_reason: string
  profile: { full_name: string }
  schedule: { title: string; date: string; time: string | null }
}

type Pending = { kind: 'approve' | 'reject'; request: AbsenceRequest } | { kind: 'all' }

export default function AbsenceRequestsScreen() {
  const { profile, parish } = useAuthStore()
  // Z2: kara z reguł punktów (przed migracją kolumny brak → brak kary)
  const penalty = parish?.rejected_excuse_penalty ?? 0
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const [requests, setRequests] = useState<AbsenceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Pending | null>(null)

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('id, absence_reason, profile:profiles(full_name), schedule:schedules!inner(title, date, time, parish_id)')
        .eq('status', 'excused')
        .eq('schedule.parish_id', profile?.parish_id)
      if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
      setRequests(((data ?? []) as unknown as AbsenceRequest[]).sort((a, b) => a.schedule.date.localeCompare(b.schedule.date)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRequests() }, [])

  const run = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.kind === 'all') {
        const ids = requests.map(r => r.id)
        const { error } = await supabase.from('schedule_assignments').update({ status: 'confirmed', admin_note: null }).in('id', ids)
        if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
        Toast.show({ type: 'success', text1: `Przyjęto ${ids.length} ${pl(ids.length, ['usprawiedliwienie', 'usprawiedliwienia', 'usprawiedliwień'])}` })
        setRequests([])
      } else {
        const r = confirm.request
        const approve = confirm.kind === 'approve'
        let { error } = approve
          ? await supabase.from('schedule_assignments').update({ status: 'confirmed', admin_note: null }).eq('id', r.id)
          : await supabase.rpc('reject_absence_request', { p_assignment_id: r.id })
        // baza bez migracji 20261001000000 — odrzucenie bez kary
        if (!approve && error && /reject_absence_request/.test(error.message)) {
          ({ error } = await supabase.from('schedule_assignments').update({ status: 'absent', admin_note: REJECTION_NOTE }).eq('id', r.id))
        }
        if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
        setRequests(prev => prev.filter(x => x.id !== r.id))
        Toast.show(approve
          ? { type: 'success', text1: `Usprawiedliwienie przyjęte: ${r.profile.full_name}` }
          : { type: 'info', text1: `Odrzucono: ${r.profile.full_name}`, text2: penalty > 0 ? `−${penalty} pkt` : undefined })
      }
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  const when = (r: AbsenceRequest) => `${dayShort(r.schedule.date)} ${shortDate(r.schedule.date)} · ${r.schedule.time?.slice(0, 5) ?? ''}`

  const body = loading ? <ActivityIndicator color={c.primary} style={styles.loader} /> : requests.length === 0 ? (
    <View style={[styles.empty, { borderColor: c.iconMuted }]}>
      <Icon name="check-circle" size={40} color={c.success} filled />
      <AppText variant="bodyStrong">Brak oczekujących zgłoszeń</AppText>
      <AppText muted>Wszystkie nieobecności zostały rozpatrzone.</AppText>
    </View>
  ) : (
    <View style={[styles.grid, isDesktop && styles.gridDesktop]}>
      {requests.map(r => (
        <Card key={r.id} large style={[styles.card, isDesktop && styles.cardDesktop]}>
          <View style={styles.head}>
            <Avatar name={r.profile.full_name} size={42} color={c.primary} textColor={c.gold} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{r.profile.full_name}</AppText>
              <AppText variant="small" muted>{`${r.schedule.title} · ${when(r)}`}</AppText>
            </View>
          </View>
          <View style={[styles.reason, { backgroundColor: c.goldSurface }]}>
            <AppText style={[styles.reasonText, { color: c.goldText }]}>{r.absence_reason || 'Bez podanego powodu'}</AppText>
          </View>
          <View style={styles.actions}>
            <Button label="Odrzuć" variant="secondary" style={styles.flex} onPress={() => setConfirm({ kind: 'reject', request: r })} />
            <Button label="Przyjmij" style={styles.flex} onPress={() => setConfirm({ kind: 'approve', request: r })} />
          </View>
        </Card>
      ))}
    </View>
  )

  const c1 = confirm && confirm.kind !== 'all' ? confirm.request : null

  return (
    <>
      <Stack.Screen options={{ title: 'Usprawiedliwienia' }} />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.body, isDesktop && styles.desktop]}>
        <View style={styles.top}>
          <Badge label={`${requests.length} do rozpatrzenia`} tone={requests.length ? 'gold' : 'muted'} />
          {requests.length >= 2 && (
            <Button label={`Przyjmij wszystkie (${requests.length})`} icon="check-all" variant="secondary" compact onPress={() => setConfirm({ kind: 'all' })} />
          )}
        </View>
        {body}
      </ScrollView>
      <Sheet
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        eyebrow={c1 ? `${c1.schedule.title} · ${longDate(c1.schedule.date)}` : undefined}
        title={confirm?.kind === 'all' ? 'Przyjąć wszystkie?' : confirm?.kind === 'approve' ? 'Przyjąć usprawiedliwienie?' : 'Odrzucić usprawiedliwienie?'}
        footer={
          <>
            <Button
              label={confirm?.kind === 'reject' ? 'Odrzuć' : 'Przyjmij'}
              variant={confirm?.kind === 'reject' ? 'danger' : 'primary'}
              onPress={run}
              loading={busy}
            />
            <Button label="Anuluj" variant="secondary" onPress={() => setConfirm(null)} />
          </>
        }
      >
        <AppText muted>
          {confirm?.kind === 'all'
            ? `Wszystkie ${requests.length} zgłoszenia zostaną uznane za usprawiedliwione.`
            : confirm?.kind === 'approve'
              ? `${c1?.profile.full_name} — nieobecność zostanie usprawiedliwiona.`
              : `${c1?.profile.full_name} zobaczy przy służbie informację, że usprawiedliwienie nie zostało przyjęte, i nieobecność będzie liczona jako nieusprawiedliwiona.${penalty > 0 ? ` Zostanie odjęte ${penalty} pkt (zmienisz to w regułach punktów).` : ''}`}
        </AppText>
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  loader: { marginTop: 40 },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  empty: { alignItems: 'center', gap: 8, padding: 30, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 18 },
  grid: { gap: 12 },
  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: { gap: 12, padding: 16 },
  cardDesktop: { width: '48.8%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reason: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  reasonText: { ...sans(600), fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10 },
})
