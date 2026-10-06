import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import { useRouter } from 'expo-router'
import Toast from 'react-native-toast-message'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { addDays, dayShort, localDateStr, pl, shortDate, weekDays } from '../../lib/dates'
import { getLiturgicalDay } from '../../lib/liturgy'
import { AutoMember, AutoProposal, AutoService, AutoTargets, proposalLoad, proposeSchedule, targetFor } from '../../lib/autoSchedule'
import { Service, useServices } from '../../hooks/useServices'
import { AppText, Button, Card, Chip, Icon, Segmented, Sheet } from '../../components/ui'

type Range = 'this' | 'next' | 'four'
const INACTIVE = ['absent', 'excused', 'confirmed', 'swapped']

function rangeDates(r: Range): [string, string] {
  const today = localDateStr()
  if (r === 'this') return [today, weekDays(0)[6]]
  if (r === 'next') { const w = weekDays(1); return [w[0], w[6]] }
  return [today, addDays(today, 27)]
}

function Stepper({ label, value, onChange, max = 6 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  const { colors: c } = useTheme()
  return (
    <View style={styles.stepper}>
      <AppText variant="body" style={styles.flex}>{label}</AppText>
      <Pressable accessibilityLabel="mniej" onPress={() => onChange(Math.max(0, value - 1))} style={[styles.stepBtn, { backgroundColor: c.primarySurface }]}>
        <Icon name="minus" size={18} color={c.primary} />
      </Pressable>
      <AppText variant="bodyStrong" style={styles.stepVal}>{value}</AppText>
      <Pressable accessibilityLabel="więcej" onPress={() => onChange(Math.min(max, value + 1))} style={[styles.stepBtn, { backgroundColor: c.primarySurface }]}>
        <Icon name="plus" size={18} color={c.primary} />
      </Pressable>
    </View>
  )
}

/** „Ułóż grafik za mnie”: sprawiedliwa propozycja obsady → poprawki → zatwierdzenie jednym przyciskiem. */
export default function AutoScheduleScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const parishId = useAuthStore(s => s.profile?.parish_id)

  const [range, setRange] = useState<Range>('next')
  const [targets, setTargets] = useState<AutoTargets>({ weekday: 1, sunday: 2, devotion: 0 })
  const [maxPerWeek, setMaxPerWeek] = useState(2)
  const [includeSignup, setIncludeSignup] = useState(true)
  const [from, to] = rangeDates(range)
  const { services, loading } = useServices(from, to)
  const [members, setMembers] = useState<AutoMember[]>([])
  const [edits, setEdits] = useState<Record<string, string[]>>({})
  const [replace, setReplace] = useState<{ key: string; index: number } | null>(null)
  const [saving, setSaving] = useState(false)

  // ministranci + obciążenie z ostatnich 6 tygodni + stałe zapisy (dzień tygodnia i godzina)
  useEffect(() => {
    if (!parishId) return
    const since = addDays(localDateStr(), -42)
    Promise.all([
      supabase.from('profiles').select('id, full_name').eq('parish_id', parishId).eq('role', 'member').eq('is_active', true).eq('approved', true),
      supabase.from('schedule_assignments').select('profile_id, status, schedule:schedules!inner(parish_id, date)')
        .eq('schedule.parish_id', parishId).gte('schedule.date', since).lt('schedule.date', localDateStr()),
      supabase.from('recurring_commitments').select('profile_id, day_of_week, time_slot'),
    ]).then(([p, a, rc]) => {
      const recent = new Map<string, number>()
      for (const x of (a.data ?? []) as any[]) if (!INACTIVE.includes(x.status)) recent.set(x.profile_id, (recent.get(x.profile_id) ?? 0) + 1)
      const regular = new Map<string, string[]>()
      for (const x of (rc.data ?? []) as any[]) if (x.time_slot) regular.set(x.profile_id, [...(regular.get(x.profile_id) ?? []), `${x.day_of_week}_${String(x.time_slot).slice(0, 5)}`])
      setMembers(((p.data ?? []) as any[]).map(m => ({ id: m.id, name: m.full_name, recent: recent.get(m.id) ?? 0, regular: regular.get(m.id) })))
    })
  }, [parishId])

  const autoServices: AutoService[] = useMemo(() => services
    .filter(s => s.serviceMode === 'assigned' || (includeSignup && s.serviceMode === 'signup'))
    .filter(s => new Date(`${s.date}T${s.time}`).getTime() > Date.now())
    .map(s => ({
      key: s.id, date: s.date, time: s.time, title: s.title, category: s.category,
      people: s.people.filter(p => !INACTIVE.includes(p.status)).map(p => p.profileId),
      sunday: new Date(s.date + 'T12:00:00').getDay() === 0 || !!getLiturgicalDay(s.date).holyDay,
    })), [services, includeSignup])

  const base: AutoProposal = useMemo(() => proposeSchedule(autoServices, members, { targets, maxPerWeek }), [autoServices, members, targets, maxPerWeek])
  useEffect(() => { setEdits({}) }, [base])
  const proposal: AutoProposal = base.map(p => ({ ...p, memberIds: edits[p.serviceKey] ?? p.memberIds })).filter(p => p.memberIds.length)
  const load = proposalLoad(proposal)
  const total = proposal.reduce((n, p) => n + p.memberIds.length, 0)
  const byKey = new Map(services.map(s => [s.id, s]))
  const nameOf = (id: string) => members.find(m => m.id === id)?.name ?? '—'
  const gaps = autoServices.filter(s => {
    const got = s.people.length + (proposal.find(p => p.serviceKey === s.key)?.memberIds.length ?? 0)
    return got < targetFor(s, targets)
  }).length

  const removeAt = (key: string, index: number) => {
    const cur = proposal.find(p => p.serviceKey === key)?.memberIds ?? []
    setEdits(e => ({ ...e, [key]: cur.filter((_, i) => i !== index) }))
  }
  const replaceWith = (memberId: string) => {
    if (!replace) return
    const cur = [...(proposal.find(p => p.serviceKey === replace.key)?.memberIds ?? [])]
    cur[replace.index] = memberId
    setEdits(e => ({ ...e, [replace.key]: cur }))
    setReplace(null)
  }

  const apply = async () => {
    const items = proposal.map(p => {
      const s = byKey.get(p.serviceKey) as Service
      return {
        schedule_id: s.isTemplate ? null : s.id, date: s.date, time: s.time, church_id: s.churchId,
        category: s.category, title: s.title, service_mode: s.serviceMode, profile_ids: p.memberIds,
      }
    })
    setSaving(true)
    const { data, error } = await supabase.rpc('apply_auto_schedule', { p_items: items })
    setSaving(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: error.message }); return }
    const r = data as any
    Toast.show({ type: 'success', text1: `Grafik zapisany: ${r.assignments} ${pl(r.assignments, ['dyżur', 'dyżury', 'dyżurów'])}`, text2: `Powiadomiono ${r.members} ${pl(r.members, ['osobę', 'osoby', 'osób'])}` })
    router.replace('/(admin)/(admin-tabs)/schedules' as any)
  }

  const days = Array.from(new Set(proposal.map(p => byKey.get(p.serviceKey)?.date).filter(Boolean) as string[])).sort()
  const replaceSvc = replace ? byKey.get(replace.key) : null

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={[styles.body, isDesktop && styles.desktop, { paddingBottom: Math.max(insets.bottom, 16) + 96 }]}>
        <Card large style={styles.card}>
          <AppText variant="eyebrow" color={c.goldInk}>Ułóż grafik za mnie</AppText>
          <AppText variant="small" muted>
            Aplikacja proponuje obsadę: najpierw osoby z najmniejszą liczbą służb w ostatnich tygodniach, nikt dwa razy o tej samej porze,
            z limitem na tydzień. Zapisani zostają. Zanim zatwierdzisz, możesz każdą osobę usunąć albo zamienić.
          </AppText>
          <Segmented<Range>
            options={[{ value: 'this', label: 'Ten tydzień' }, { value: 'next', label: 'Następny' }, { value: 'four', label: '4 tygodnie' }]}
            value={range}
            onChange={setRange}
          />
          <AppText variant="small" muted>{`${shortDate(from)} – ${shortDate(to)}`}</AppText>
          <Stepper label="Ministranci na Mszy w tygodniu" value={targets.weekday} onChange={v => setTargets({ ...targets, weekday: v })} />
          <Stepper label="Na Mszy w niedzielę i święto" value={targets.sunday} onChange={v => setTargets({ ...targets, sunday: v })} />
          <Stepper label="Na nabożeństwie" value={targets.devotion} onChange={v => setTargets({ ...targets, devotion: v })} />
          <Stepper label="Najwyżej służb na osobę w tygodniu" value={maxPerWeek} onChange={v => setMaxPerWeek(Math.max(1, v))} max={7} />
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: includeSignup }} onPress={() => setIncludeSignup(v => !v)} style={styles.toggle}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">Uzupełnij też Msze z zapisami</AppText>
              <AppText variant="small" muted>Tam, gdzie ministranci sami się zapisują, a brakuje chętnych.</AppText>
            </View>
            <Switch value={includeSignup} onValueChange={setIncludeSignup} trackColor={{ true: c.primary, false: c.inputBorder }} thumbColor="#FFFFFF" />
          </Pressable>
        </Card>

        {loading || !members.length ? <ActivityIndicator color={c.primary} /> : proposal.length === 0 ? (
          <Card large><AppText muted>{gaps ? 'Brak wolnych osób do obsadzenia (limit tygodniowy albo kolizje godzin).' : 'Wszystkie służby w tym okresie są już obsadzone.'}</AppText></Card>
        ) : (
          <>
            <AppText variant="small" muted style={styles.summary}>
              {`${total} ${pl(total, ['przydział', 'przydziały', 'przydziałów'])} dla ${load.size} ${pl(load.size, ['osoby', 'osób', 'osób'])}` +
                (gaps ? ` · ${gaps} ${pl(gaps, ['służba', 'służby', 'służb'])} nadal z brakami` : '')}
            </AppText>
            {days.map(d => (
              <View key={d} style={styles.day}>
                <AppText variant="small" muted>{`${dayShort(d)} ${shortDate(d)}`}</AppText>
                {proposal.filter(p => byKey.get(p.serviceKey)?.date === d).map(p => {
                  const s = byKey.get(p.serviceKey)!
                  const existing = s.people.filter(x => !INACTIVE.includes(x.status))
                  return (
                    <Card key={p.serviceKey} style={styles.svc}>
                      <View style={styles.row}>
                        <AppText variant="bodyStrong">{s.time}</AppText>
                        <AppText variant="body" style={styles.flex} numberOfLines={1}>{`${s.title}${s.churchName ? ` · ${s.churchName}` : ''}`}</AppText>
                      </View>
                      <View style={styles.chips}>
                        {existing.map(x => <Chip key={x.profileId} label={x.name} icon="check" />)}
                        {p.memberIds.map((id, i) => (
                          <View key={`${id}-${i}`} style={[styles.proposed, { backgroundColor: c.goldSurface, borderColor: c.gold }]}>
                            <Pressable onPress={() => setReplace({ key: p.serviceKey, index: i })} accessibilityLabel={`Zamień ${nameOf(id)}`}>
                              <AppText style={[styles.proposedText, { color: c.goldText }]}>{nameOf(id)}</AppText>
                            </Pressable>
                            <Pressable onPress={() => removeAt(p.serviceKey, i)} hitSlop={8} accessibilityLabel={`Usuń ${nameOf(id)}`}>
                              <Icon name="close" size={14} color={c.goldText} filled />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    </Card>
                  )
                })}
              </View>
            ))}
            <Card style={styles.card}>
              <AppText variant="eyebrow" color={c.goldInk}>Ile kto dostaje</AppText>
              <View style={styles.chips}>
                {[...members].sort((a, b) => (load.get(b.id) ?? 0) - (load.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'pl')).map(m => (
                  <Chip key={m.id} label={`${m.name.split(' ')[0]} ${load.get(m.id) ?? 0}`} />
                ))}
              </View>
              <AppText variant="small" muted>Liczba nowych dyżurów w tej propozycji (bez zapisów, które już są w grafiku).</AppText>
            </Card>
          </>
        )}
      </ScrollView>

      {proposal.length > 0 && (
        <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <AppText variant="small" muted style={styles.flex}>Każdy dostanie jedno zbiorcze powiadomienie.</AppText>
          <Button compact label="Zatwierdź i powiadom" icon="check" loading={saving} onPress={apply} />
        </View>
      )}

      <Sheet visible={!!replace} onClose={() => setReplace(null)} eyebrow={replaceSvc ? `${dayShort(replaceSvc.date)} ${shortDate(replaceSvc.date)} · ${replaceSvc.time}` : undefined} title="Kto zamiast?">
        <View style={styles.chips}>
          {members
            .filter(m => replaceSvc && !replaceSvc.people.some(x => x.profileId === m.id) && !(proposal.find(p => p.serviceKey === replace?.key)?.memberIds.includes(m.id)))
            .sort((a, b) => (load.get(a.id) ?? 0) + a.recent - ((load.get(b.id) ?? 0) + b.recent) || a.name.localeCompare(b.name, 'pl'))
            .map(m => <Chip key={m.id} label={`${m.name} · ${load.get(m.id) ?? 0}`} onPress={() => replaceWith(m.id)} />)}
        </View>
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { padding: 16, gap: 12 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 820, width: '100%' },
  card: { gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepVal: { width: 24, textAlign: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summary: { paddingHorizontal: 4 },
  day: { gap: 6 },
  svc: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  proposed: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  proposedText: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth,
  },
})
