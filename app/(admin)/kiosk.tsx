import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, BackHandler, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useKeepAwake } from 'expo-keep-awake'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif } from '../../lib/theme'
import { isCheckInWindowOpen, localDateStr } from '../../lib/dates'
import { Service, useServices } from '../../hooks/useServices'
import { AppText, Avatar, Button, Icon, Sheet, TextField } from '../../components/ui'
import { KeyboardScrollView } from '../../components/ui/KeyboardScrollView'

const NAVY = '#071C3A'
const MUTED = '#C9D3E3'
const GOLD_I = '#E3C98E'

type Member = { id: string; full_name: string; avatar_url: string | null }

/**
 * Tryb zakrystii: tablet w zakrystii, na którym dzieci bez telefonu potwierdzają obecność.
 * Działa na sesji opiekuna (on może zameldować każdego z parafii). Wyjście wymaga hasła opiekuna.
 */
export default function KioskScreen() {
  useKeepAwake()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const { session, profile, parish } = useAuthStore()
  const today = localDateStr()
  const { services, loading, refresh } = useServices(today, today)
  const [members, setMembers] = useState<Member[]>([])
  const [present, setPresent] = useState<Set<string>>(new Set())
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ name: string; points: number } | null>(null)
  const [exitOpen, setExitOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [exitError, setExitError] = useState('')
  const [, tick] = useState(0)
  const [err, setErr] = useState('')

  // co minutę: okna meldowania się otwierają i zamykają
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 60_000); return () => clearInterval(t) }, [])
  // Android: przycisk „wstecz” nie wychodzi z trybu zakrystii
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!profile?.parish_id) return
    supabase.from('profiles').select('id, full_name, avatar_url')
      .eq('parish_id', profile.parish_id).eq('role', 'member').eq('is_active', true).eq('approved', true)
      .order('full_name')
      .then(({ data }) => setMembers((data ?? []) as Member[]))
  }, [profile?.parish_id])

  const open = useMemo(
    () => services.filter(s => s.serviceMode !== 'none' && isCheckInWindowOpen(s.date, s.time)),
    [services, done],
  )
  const service: Service | undefined = open.find(s => s.id === serviceId) ?? open[0]
  const nextToday = services.find(s => s.serviceMode !== 'none' && new Date(`${s.date}T${s.time}`).getTime() > Date.now())

  // kto już jest obecny na wybranej służbie
  useEffect(() => {
    if (!service || service.isTemplate) { setPresent(new Set()); return }
    supabase.from('attendance').select('profile_id').eq('schedule_id', service.id)
      .then(({ data }) => setPresent(new Set((data ?? []).map((a: any) => a.profile_id))))
  }, [service?.id, done])

  const onDuty = new Set((service?.people ?? []).filter(p => p.status === 'assigned' || p.status === 'present').map(p => p.profileId))
  const q = query.trim().toLowerCase()
  const list = members
    .filter(m => !q || m.full_name.toLowerCase().includes(q))
    .sort((a, b) => Number(onDuty.has(b.id)) - Number(onDuty.has(a.id)) || a.full_name.localeCompare(b.full_name, 'pl'))

  const checkIn = async (m: Member) => {
    if (!service || !profile?.parish_id) return
    setBusy(true)
    let scheduleId = service.id
    if (service.isTemplate) {
      const { data, error } = await supabase.rpc('materialize_slot', { p_date: service.date, p_time_label: service.time, p_church_id: service.churchId })
      if (error || !data) { setBusy(false); setConfirm(null); setErr(error?.message ?? 'Nie znaleziono służby'); return }
      scheduleId = data as string
    }
    const { data, error } = await supabase.rpc('check_in_and_award_points', {
      p_schedule_id: scheduleId, p_profile_id: m.id, p_parish_id: profile.parish_id, p_method: 'kiosk',
    })
    setBusy(false)
    setConfirm(null)
    if (error) { setErr(error.message); return }
    setErr('')
    setDone({ name: m.full_name.split(' ')[0], points: (data as any)?.points_awarded ?? 0 })
    setQuery('')
    refresh()
    setTimeout(() => setDone(null), 2500)
  }

  const exit = async () => {
    const email = session?.user?.email
    if (!email) return
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setExitError('Nieprawidłowe hasło'); return }
    setExitOpen(false)
    setPassword('')
    router.replace('/(admin)/(admin-tabs)' as any)
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <StatusBar style="light" />
      <View style={styles.top}>
        <View style={styles.flex}>
          <AppText variant="eyebrow" color={c.gold}>{`Zakrystia · ${parish?.name ?? ''}`}</AppText>
          <AppText style={[serif(), styles.title]}>
            Kto jest <AppText style={[serif(true), styles.title, { color: GOLD_I }]}>na służbie?</AppText>
          </AppText>
        </View>
        <Pressable accessibilityRole="button" onPress={() => { setExitError(''); setExitOpen(true) }} style={styles.exit}>
          <Icon name="lock" size={18} color={MUTED} />
          <AppText style={styles.exitText}>Zakończ</AppText>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={c.gold} style={styles.flex} /> : !service ? (
        <View style={styles.center}>
          <Icon name="clock-outline" size={56} color={MUTED} />
          <AppText style={styles.big}>Teraz nie ma służby do potwierdzenia</AppText>
          <AppText style={styles.hint}>
            {nextToday ? `Najbliższa: ${nextToday.title} o ${nextToday.time} — potwierdzanie od 30 min przed.` : 'Dziś nie ma już służb.'}
          </AppText>
        </View>
      ) : (
        <>
          {open.length > 1 && (
            <View style={styles.services}>
              {open.map(s => (
                <Pressable key={s.id} onPress={() => setServiceId(s.id)}
                  style={[styles.svc, s.id === service.id && { backgroundColor: c.gold }]}>
                  <AppText style={[styles.svcText, s.id === service.id && { color: NAVY }]}>
                    {`${s.time} · ${s.title}${s.churchName ? ` · ${s.churchName}` : ''}`}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}
          {open.length === 1 && (
            <AppText style={styles.hint}>{`${service.title} · ${service.time}${service.churchName ? ` · ${service.churchName}` : ''}`}</AppText>
          )}
          {!!err && <AppText style={[styles.hint, { color: '#F2B8B5' }]}>{err}</AppText>}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Szukaj imienia…"
            placeholderTextColor="#8497B5"
            style={styles.search}
          />
          <KeyboardScrollView contentContainerStyle={styles.grid}>
            {list.map(m => {
              const isPresent = present.has(m.id)
              return (
                <Pressable key={m.id} accessibilityRole="button" disabled={isPresent}
                  onPress={() => setConfirm(m)}
                  style={[styles.tile, onDuty.has(m.id) && { borderColor: c.gold }, isPresent && styles.tileDone]}>
                  <Avatar name={m.full_name} avatarUrl={m.avatar_url} size={56} color={c.primary} textColor={c.gold} />
                  <AppText style={styles.tileName} numberOfLines={2}>{m.full_name}</AppText>
                  <AppText style={styles.tileSub}>{isPresent ? 'obecny ✓' : onDuty.has(m.id) ? 'dyżur' : ' '}</AppText>
                </Pressable>
              )
            })}
          </KeyboardScrollView>
        </>
      )}

      {done && (
        <View style={styles.doneOverlay} pointerEvents="none">
          <Icon name="check-circle" size={96} color={c.success} filled />
          <AppText style={styles.doneText}>{`Dzięki, ${done.name}!`}</AppText>
          {done.points > 0 && <AppText style={styles.donePts}>{`+${done.points} pkt`}</AppText>}
        </View>
      )}

      <Sheet
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        eyebrow={service ? `${service.title} · ${service.time}` : undefined}
        title={confirm ? `To Ty, ${confirm.full_name}?` : ''}
        footer={<Button label="Tak, jestem na służbie" icon="account-check" variant="gold" onPress={() => confirm && checkIn(confirm)} loading={busy} />}
      >
        <AppText muted>Potwierdź tylko swoją obecność. Opiekun widzi, kto potwierdził przez tablet.</AppText>
      </Sheet>

      <Sheet
        visible={exitOpen}
        onClose={() => setExitOpen(false)}
        eyebrow="Tryb zakrystii"
        title="Hasło opiekuna"
        footer={<Button label="Zakończ tryb zakrystii" icon="lock-open" onPress={exit} />}
      >
        <TextField label="Hasło" value={password} onChangeText={setPassword} secureTextEntry autoFocus
          hint={exitError || undefined} hintTone="danger" onSubmitEditing={exit} />
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY, paddingHorizontal: 20, gap: 14 },
  flex: { flex: 1, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 34, lineHeight: 38, color: '#FFFFFF' },
  exit: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)' },
  exitText: { ...sans(700), fontSize: 13, color: MUTED },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  big: { ...sans(800), fontSize: 22, color: '#FFFFFF', textAlign: 'center' },
  hint: { ...sans(600), fontSize: 15, color: MUTED, textAlign: 'center' },
  services: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  svc: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)' },
  svcText: { ...sans(700), fontSize: 15, color: '#FFFFFF' },
  search: { ...sans(600), fontSize: 18, color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', paddingBottom: 24 },
  tile: {
    width: 150, minHeight: 150, borderRadius: 20, padding: 12, alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 2, borderColor: 'transparent',
  },
  tileDone: { opacity: 0.45 },
  tileName: { ...sans(800), fontSize: 15, color: '#FFFFFF', textAlign: 'center' },
  tileSub: { ...sans(600), fontSize: 12, color: GOLD_I },
  doneOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(7,28,58,0.92)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  doneText: { ...sans(800), fontSize: 30, color: '#FFFFFF' },
  donePts: { ...sans(800), fontSize: 22, color: GOLD_I },
})
