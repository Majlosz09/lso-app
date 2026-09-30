import { useCallback, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Modal, Platform,
} from 'react-native'
import Toast from 'react-native-toast-message'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { shadow } from '../../lib/shadows'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { TimePickerModal } from '../../components/TimePickerModal'

// Kolejność od poniedziałku; wartości jak w Postgres (0 = niedziela)
const WEEK = [
  { dow: 1, short: 'Pn', full: 'Poniedziałek' },
  { dow: 2, short: 'Wt', full: 'Wtorek' },
  { dow: 3, short: 'Śr', full: 'Środa' },
  { dow: 4, short: 'Cz', full: 'Czwartek' },
  { dow: 5, short: 'Pt', full: 'Piątek' },
  { dow: 6, short: 'So', full: 'Sobota' },
  { dow: 0, short: 'Nd', full: 'Niedziela' },
]
const DAY_FULL: Record<number, string> = Object.fromEntries(WEEK.map(d => [d.dow, d.full]))

type Period = 'year_end' | 'm3' | 'm6' | 'm12'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'year_end', label: 'Do końca roku' },
  { key: 'm3', label: '3 miesiące' },
  { key: 'm6', label: '6 miesięcy' },
  { key: 'm12', label: 'Rok' },
]

type Rule = {
  id: string
  profile_id: string
  day_of_week: number
  time: string
  start_date: string
  end_date: string
  profile: { full_name: string } | null
}
type Member = { id: string; full_name: string }
type Template = { day_of_week: number; time: string; label: string | null }

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function periodEnd(period: Period, from: Date): Date {
  if (period === 'year_end') return new Date(from.getFullYear(), 11, 31)
  const months = period === 'm3' ? 3 : period === 'm6' ? 6 : 12
  const d = new Date(from)
  d.setMonth(d.getMonth() + months)
  d.setDate(d.getDate() - 1)
  return d
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export default function RecurringAssignmentsScreen() {
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const { profile } = useAuthStore()
  const parishId = profile?.parish_id

  const [rules, setRules] = useState<Rule[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [day, setDay] = useState<number>(3)
  const [time, setTime] = useState('')
  const [timePickerOpen, setTimePickerOpen] = useState(false)
  const [period, setPeriod] = useState<Period>('year_end')
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const [pendingCancel, setPendingCancel] = useState<{ ids: string[]; label: string } | null>(null)

  const load = useCallback(async () => {
    if (!parishId) return
    const [rulesRes, membersRes, tmplRes] = await Promise.all([
      supabase.from('recurring_assignments')
        .select('id, profile_id, day_of_week, time, start_date, end_date, profile:profiles!recurring_assignments_profile_id_fkey(full_name)')
        .eq('parish_id', parishId)
        .order('day_of_week').order('time'),
      supabase.from('profiles').select('id, full_name')
        .eq('parish_id', parishId).eq('role', 'member').eq('is_active', true)
        .order('full_name'),
      supabase.from('mass_templates').select('day_of_week, time, label')
        .eq('parish_id', parishId).order('time'),
    ])
    if (rulesRes.error) Toast.show({ type: 'error', text1: 'Błąd', text2: rulesRes.error.message })
    setRules((rulesRes.data ?? []) as any)
    setMembers(membersRes.data ?? [])
    setTemplates(tmplRes.data ?? [])
    setLoading(false)
  }, [parishId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // Grupy „dzień + godzina” — cały dyżur można cofnąć jednym przyciskiem
  const groups = useMemo(() => {
    const today = dateStr(new Date())
    const map = new Map<string, { day: number; time: string; rules: Rule[] }>()
    for (const r of rules) {
      const key = `${r.day_of_week}_${r.time}`
      if (!map.has(key)) map.set(key, { day: r.day_of_week, time: r.time, rules: [] })
      map.get(key)!.rules.push(r)
    }
    const order = (d: number) => (d === 0 ? 7 : d)
    return [...map.values()]
      .map(g => ({ ...g, expired: g.rules.every(r => r.end_date < today) }))
      .sort((a, b) => order(a.day) - order(b.day) || a.time.localeCompare(b.time))
  }, [rules])

  const dayTemplates = useMemo(
    () => templates.filter(t => t.day_of_week === day),
    [templates, day],
  )

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? members.filter(m => m.full_name.toLowerCase().includes(q)) : members
  }, [members, search])

  const openForm = () => {
    setDay(3)
    setTime('')
    setPeriod('year_end')
    setSelected([])
    setSearch('')
    setFormOpen(true)
  }

  const toggleMember = (id: string) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  const handleSave = async () => {
    if (!time) { Toast.show({ type: 'error', text1: 'Wybierz godzinę' }); return }
    if (selected.length === 0) { Toast.show({ type: 'error', text1: 'Wybierz ministrantów' }); return }
    const start = new Date()
    const end = periodEnd(period, start)
    setSaving(true)
    const { data, error } = await supabase.rpc('create_recurring_assignments', {
      p_profile_ids: selected,
      p_day_of_week: day,
      p_time: `${time}:00`,
      p_start: dateStr(start),
      p_end: dateStr(end),
    })
    setSaving(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie udało się', text2: error.message }); return }
    const res = data as { rules: number; assignments: number }
    Toast.show({
      type: 'success',
      text1: 'Stały dyżur ustawiony',
      text2: `${DAY_FULL[day]} ${time} — ${res.assignments} przydziałów do ${formatDate(dateStr(end))}`,
    })
    setFormOpen(false)
    load()
  }

  const doCancel = async () => {
    if (!pendingCancel) return
    const { ids } = pendingCancel
    setPendingCancel(null)
    const { data, error } = await supabase.rpc('cancel_recurring_assignments', { p_ids: ids })
    if (error) { Toast.show({ type: 'error', text1: 'Nie udało się', text2: error.message }); return }
    Toast.show({
      type: 'success',
      text1: 'Stały dyżur cofnięty',
      text2: `Usunięto ${(data as any)?.removed_assignments ?? 0} przyszłych przydziałów`,
    })
    load()
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 72 }]}>
        <Text style={styles.intro}>
          Stały dyżur przypisuje ministranta do tej samej Mszy co tydzień. Przydziały pojawią się
          w grafiku od razu na cały okres — cofnięcie usuwa wszystkie przyszłe naraz (historia zostaje).
        </Text>

        {groups.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="repeat-outline" size={48} color={c.iconMuted} />
            <Text style={styles.emptyText}>Brak stałych dyżurów</Text>
          </View>
        ) : groups.map(g => (
          <View key={`${g.day}_${g.time}`} style={[styles.card, g.expired && { opacity: 0.6 }]}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{DAY_FULL[g.day]}, {g.time.slice(0, 5)}</Text>
                <Text style={styles.cardSub}>
                  {g.expired ? 'Zakończony' : `co tydzień · ${g.rules.length} ${g.rules.length === 1 ? 'ministrant' : 'ministrantów'}`}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.cancelAllBtn}
                onPress={() => setPendingCancel({
                  ids: g.rules.map(r => r.id),
                  label: `${DAY_FULL[g.day]}, ${g.time.slice(0, 5)} (wszyscy ministranci)`,
                })}
              >
                <Text style={styles.cancelAllText}>Cofnij cały</Text>
              </TouchableOpacity>
            </View>
            {g.rules.map(r => (
              <View key={r.id} style={styles.ruleRow}>
                <Ionicons name="person-outline" size={16} color={c.subtext} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.ruleName}>{r.profile?.full_name ?? '—'}</Text>
                  <Text style={styles.ruleDates}>{formatDate(r.start_date)} – {formatDate(r.end_date)}</Text>
                </View>
                <TouchableOpacity
                  hitSlop={8}
                  onPress={() => setPendingCancel({
                    ids: [r.id],
                    label: `${r.profile?.full_name ?? ''} — ${DAY_FULL[g.day]}, ${g.time.slice(0, 5)}`,
                  })}
                >
                  <Ionicons name="close-circle-outline" size={22} color={c.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={[styles.fab, { bottom: Math.max(insets.bottom, 16) }]} onPress={openForm}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.fabText}>Dodaj stały dyżur</Text>
      </TouchableOpacity>

      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Nowy stały dyżur</Text>
              <TouchableOpacity onPress={() => setFormOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={c.subtext} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Dzień tygodnia</Text>
              <View style={styles.chipRow}>
                {WEEK.map(d => (
                  <TouchableOpacity
                    key={d.dow}
                    style={[styles.dayChip, day === d.dow && styles.chipActive]}
                    onPress={() => { setDay(d.dow); setTime('') }}
                  >
                    <Text style={[styles.chipText, day === d.dow && styles.chipTextActive]}>{d.short}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Godzina</Text>
              <View style={styles.chipRow}>
                {dayTemplates.map(t => {
                  const hhmm = t.time.slice(0, 5)
                  return (
                    <TouchableOpacity
                      key={t.time}
                      style={[styles.chip, time === hhmm && styles.chipActive]}
                      onPress={() => setTime(hhmm)}
                    >
                      <Text style={[styles.chipText, time === hhmm && styles.chipTextActive]}>
                        {hhmm}{t.label ? ` · ${t.label}` : ''}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
                <TouchableOpacity
                  style={[styles.chip, time && !dayTemplates.some(t => t.time.slice(0, 5) === time) && styles.chipActive]}
                  onPress={() => setTimePickerOpen(true)}
                >
                  <Text style={[styles.chipText, time && !dayTemplates.some(t => t.time.slice(0, 5) === time) && styles.chipTextActive]}>
                    {time && !dayTemplates.some(t => t.time.slice(0, 5) === time) ? time : 'Inna godzina…'}
                  </Text>
                </TouchableOpacity>
              </View>
              {dayTemplates.length === 0 && (
                <Text style={styles.hint}>Brak Mszy w rozkładzie na ten dzień — wybierz godzinę ręcznie.</Text>
              )}

              <Text style={styles.label}>Na jak długo</Text>
              <View style={styles.chipRow}>
                {PERIODS.map(p => (
                  <TouchableOpacity
                    key={p.key}
                    style={[styles.chip, period === p.key && styles.chipActive]}
                    onPress={() => setPeriod(p.key)}
                  >
                    <Text style={[styles.chipText, period === p.key && styles.chipTextActive]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>
                Od dziś do {formatDate(dateStr(periodEnd(period, new Date())))}
              </Text>

              <Text style={styles.label}>Ministranci ({selected.length})</Text>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={16} color={c.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Szukaj ministranta…"
                  placeholderTextColor={c.textTertiary}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
              <View style={styles.memberList}>
                {filteredMembers.map(m => {
                  const on = selected.includes(m.id)
                  return (
                    <TouchableOpacity key={m.id} style={styles.memberRow} onPress={() => toggleMember(m.id)}>
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? c.primary : c.subtext} />
                      <Text style={styles.memberName}>{m.full_name}</Text>
                    </TouchableOpacity>
                  )
                })}
                {filteredMembers.length === 0 && <Text style={styles.hint}>Brak ministrantów</Text>}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveText}>Przypisz co tydzień</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <TimePickerModal
        visible={timePickerOpen}
        value={time}
        onConfirm={t => { setTime(t); setTimePickerOpen(false) }}
        onClose={() => setTimePickerOpen(false)}
      />

      <ConfirmDialog
        visible={pendingCancel !== null}
        title="Cofnąć stały dyżur?"
        message={`${pendingCancel?.label ?? ''}\n\nWszystkie przyszłe przydziały z tego stałego dyżuru zostaną usunięte z grafiku. Odbyte służby i punkty zostają.`}
        confirmText="Cofnij"
        destructive
        onConfirm={doCancel}
        onCancel={() => setPendingCancel(null)}
      />
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, ...(Platform.OS === 'web' && { minHeight: 0 }) },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg },
    content: { padding: 16, gap: 12 },
    intro: { fontSize: 13, color: c.subtext, lineHeight: 19, fontFamily: 'Manrope_500Medium' },
    empty: { alignItems: 'center', marginTop: 48, gap: 10 },
    emptyText: { fontSize: 15, color: c.textTertiary, fontFamily: 'Manrope_500Medium' },
    card: { backgroundColor: c.surface, borderRadius: 14, padding: 14, gap: 4, ...shadow.xs },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    cardTitle: { fontSize: 16, color: c.text, fontFamily: 'Manrope_700Bold' },
    cardSub: { fontSize: 12, color: c.subtext, marginTop: 2, fontFamily: 'Manrope_500Medium' },
    cancelAllBtn: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
      borderWidth: 1, borderColor: c.danger + '55',
    },
    cancelAllText: { fontSize: 12, color: c.danger, fontFamily: 'Manrope_700Bold' },
    ruleRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.border,
    },
    ruleName: { fontSize: 14, color: c.text, fontFamily: 'Manrope_600SemiBold' },
    ruleDates: { fontSize: 11, color: c.subtext, marginTop: 1, fontFamily: 'Manrope_500Medium' },
    fab: {
      position: 'absolute', left: 16, right: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, ...shadow.md,
    },
    fabText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, gap: 12, maxHeight: '90%',
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetTitle: { fontSize: 18, color: c.text, fontFamily: 'Manrope_700Bold' },
    label: { fontSize: 13, color: c.subtext, textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: 'Manrope_700Bold' },
    hint: { fontSize: 12, color: c.textTertiary, fontFamily: 'Manrope_500Medium' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    dayChip: { minWidth: 42, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: c.primarySurface },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: c.primarySurface },
    chipActive: { backgroundColor: c.primary },
    chipText: { fontSize: 13, color: c.subtext, fontFamily: 'Manrope_600SemiBold' },
    chipTextActive: { color: '#fff' },
    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
    },
    searchInput: { flex: 1, fontSize: 15, color: c.text, fontFamily: 'Manrope_500Medium' },
    memberList: { gap: 2 },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
    memberName: { fontSize: 15, color: c.text, fontFamily: 'Manrope_500Medium' },
    saveBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
    saveText: { color: '#fff', fontSize: 16, fontFamily: 'Manrope_700Bold' },
  })
}
