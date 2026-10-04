import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { DAY_SHORT, localDateStr, parseDate, pl, shortDate } from '../../lib/dates'
import {
  DraftEntry, MassPeriod, PeriodEntry, RozkladEntry, SERVICE_MODE_INFO, ServiceMode, draftErrors, draftFromTemplates,
  draftKey, periodCoversDate, setModeForDays, sortDraft,
} from '../../lib/massSchedule'
import { RozkladEditor, ServiceModeLegend, WEEK_ORDER } from '../../components/admin/RozkladEditor'
import { RozkladChange, RozkladPolicy, RozkladPreviewSheet } from '../../components/admin/RozkladPreviewSheet'
import { DatePickerModal } from '../../components/DatePickerModal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { AppText, Button, Card, Chip, Icon, Segmented, TextField } from '../../components/ui'

type Tab = 'base' | 'periods'
type PeriodForm = {
  id: string | null
  name: string
  date_from: string
  date_to: string
  repeat_yearly: boolean
  days: number[]
  entries: DraftEntry[]
}
type SaveRequest = { target: 'base' | 'period' | 'delete_period'; periodId?: string | null; period?: object; entries: DraftEntry[] }

const MON_SAT = [1, 2, 3, 4, 5, 6]
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

function toDraft(rows: (RozkladEntry & { base_template_id?: string | null })[]): DraftEntry[] {
  return sortDraft(rows.map(r => ({
    id: r.id, key: draftKey(), day_of_week: r.day_of_week, time: r.time.slice(0, 5), label: r.label,
    category: r.category ?? 'msza', service_mode: r.service_mode ?? 'signup', base_template_id: r.base_template_id ?? null,
  })))
}
const sig = (d: DraftEntry[]) =>
  JSON.stringify(sortDraft(d).map(e => [e.id, e.day_of_week, e.time.slice(0, 5), e.label ?? '', e.category, e.service_mode, e.base_template_id ?? null]))

function daysText(days: number[]): string {
  const s = [...days].sort((a, b) => (a || 7) - (b || 7))
  if (s.length === 7) return 'cały tydzień'
  if (s.join() === MON_SAT.join()) return 'pn–sb'
  return s.map(d => DAY_SHORT[d]).join(', ')
}
function rangeText(p: { date_from: string; date_to: string; repeat_yearly: boolean }): string {
  const one = p.date_from === p.date_to
  const year = (d: string) => (p.repeat_yearly ? '' : ` ${d.slice(0, 4)}`)
  const txt = one ? `${shortDate(p.date_from)}${year(p.date_from)}` : `${shortDate(p.date_from)} – ${shortDate(p.date_to)}${year(p.date_to)}`
  return p.repeat_yearly ? `${txt} · co roku` : txt
}

/** Gotowe okresy (co roku liczy się tylko dzień i miesiąc). */
function presets(today: string) {
  const y = Number(today.slice(0, 4))
  const yr = (md: string) => `${y}-${md}`
  return [
    { label: 'Październik', name: 'Październik — różaniec', from: yr('10-01'), to: yr('10-31'), yearly: true, days: MON_SAT },
    { label: 'Maj', name: 'Maj — nabożeństwa majowe', from: yr('05-01'), to: yr('05-31'), yearly: true, days: MON_SAT },
    { label: 'Czerwiec', name: 'Czerwiec — nabożeństwa czerwcowe', from: yr('06-01'), to: yr('06-30'), yearly: true, days: MON_SAT },
    { label: 'Wakacje', name: 'Wakacje', from: yr('07-01'), to: yr('08-31'), yearly: true, days: ALL_DAYS },
    { label: 'Jeden dzień', name: 'Zmiana jednorazowa', from: today, to: today, yearly: false, days: [parseDate(today).getDay()] },
  ]
}

export default function MassScheduleScreen() {
  const profile = useAuthStore(s => s.profile)
  const insets = useSafeAreaInsets()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const today = localDateStr()

  const [tab, setTab] = useState<Tab>('base')
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<RozkladEntry[]>([])
  const [baseDraft, setBaseDraft] = useState<DraftEntry[]>([])
  const [periods, setPeriods] = useState<MassPeriod[]>([])
  const [periodEntries, setPeriodEntries] = useState<PeriodEntry[]>([])
  const [form, setForm] = useState<PeriodForm | null>(null)
  const [datePick, setDatePick] = useState<'from' | 'to' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // zapis z podglądem
  const [pending, setPending] = useState<SaveRequest | null>(null)
  const [changes, setChanges] = useState<RozkladChange[]>([])
  const [policy, setPolicy] = useState<RozkladPolicy>('move')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!profile?.parish_id) return
    const [t, p, e] = await Promise.all([
      supabase.from('mass_templates').select('*').eq('parish_id', profile.parish_id).order('day_of_week').order('time'),
      supabase.from('mass_periods').select('*').eq('parish_id', profile.parish_id).order('date_from'),
      supabase.from('mass_period_entries').select('*').eq('parish_id', profile.parish_id),
    ])
    const tpl = (t.data ?? []) as RozkladEntry[]
    setTemplates(tpl)
    setBaseDraft(toDraft(tpl))
    setPeriods((p.data ?? []) as MassPeriod[])
    setPeriodEntries((e.data ?? []) as PeriodEntry[])
    setLoading(false)
  }, [profile?.parish_id])
  useEffect(() => { load() }, [load])

  const baseDirty = useMemo(() => sig(baseDraft) !== sig(toDraft(templates)), [baseDraft, templates])

  // ── zapis ──
  const call = async (req: SaveRequest, pol: RozkladPolicy, dryRun: boolean) => supabase.rpc('save_rozklad', {
    p_target: req.target,
    p_period_id: req.periodId ?? null,
    p_period: req.period ?? null,
    p_entries: req.entries.map(e => ({
      id: e.id, day_of_week: e.day_of_week, time: e.time.slice(0, 5), label: e.label?.trim() || null,
      category: e.category, service_mode: e.service_mode, base_template_id: e.base_template_id ?? null,
    })),
    p_policy: pol,
    p_dry_run: dryRun,
  })

  const commit = async (req: SaveRequest, pol: RozkladPolicy) => {
    setSaving(true)
    const { data, error } = await call(req, pol, false)
    setSaving(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: error.message }); return }
    setPending(null)
    setForm(null)
    const r = data as any
    const extra = [
      r.moved ? `przeniesiono ${r.moved} ${pl(r.moved, ['zapis', 'zapisy', 'zapisów'])}` : '',
      r.cancelled ? `odwołano ${r.cancelled}` : '',
    ].filter(Boolean).join(', ')
    Toast.show({ type: 'success', text1: req.target === 'delete_period' ? 'Zmiana okresowa usunięta' : 'Rozkład zapisany', text2: extra || undefined })
    load()
  }

  const save = async (req: SaveRequest) => {
    const errs = draftErrors(req.entries)
    if (errs.length) { Toast.show({ type: 'error', text1: 'Popraw rozkład', text2: errs[0] }); return }
    setSaving(true)
    const { data, error } = await call(req, 'move', true)
    setSaving(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: error.message }); return }
    const ch = ((data as any)?.changes ?? []) as RozkladChange[]
    if (ch.length === 0) { await commit(req, 'move'); return }
    setPolicy('move')
    setChanges(ch)
    setPending(req)
  }

  const changePolicy = async (p: RozkladPolicy) => {
    setPolicy(p)
    if (!pending) return
    const { data } = await call(pending, p, true)
    if (data) setChanges(((data as any).changes ?? []) as RozkladChange[])
  }

  // ── okres ──
  const openPeriod = (p: MassPeriod | null, preset?: ReturnType<typeof presets>[number]) => {
    if (p) {
      setForm({
        id: p.id, name: p.name, date_from: p.date_from, date_to: p.date_to, repeat_yearly: p.repeat_yearly,
        days: p.days_of_week, entries: toDraft(periodEntries.filter(e => e.period_id === p.id)),
      })
      return
    }
    const ps = preset ?? presets(today)[4]
    setForm({
      id: null, name: ps.name, date_from: ps.from, date_to: ps.to, repeat_yearly: ps.yearly, days: ps.days,
      entries: draftFromTemplates(templates, ps.days),
    })
  }
  const setFormDays = (days: number[]) => {
    if (!form || days.length === 0) return
    const added = days.filter(d => !form.days.includes(d))
    setForm({
      ...form, days,
      entries: sortDraft([...form.entries.filter(e => days.includes(e.day_of_week)), ...draftFromTemplates(templates, added)]),
    })
  }
  const toggleFormDay = (d: number) => form && setFormDays(form.days.includes(d) ? form.days.filter(x => x !== d) : [...form.days, d])
  const applyPreset = (ps: ReturnType<typeof presets>[number]) => form && setForm({
    ...form, name: form.id ? form.name : ps.name, date_from: ps.from, date_to: ps.to, repeat_yearly: ps.yearly, days: ps.days,
    entries: form.id ? form.entries.filter(e => ps.days.includes(e.day_of_week)) : draftFromTemplates(templates, ps.days),
  })
  const savePeriod = () => {
    if (!form) return
    if (!form.name.trim()) { Toast.show({ type: 'error', text1: 'Podaj nazwę zmiany' }); return }
    if (form.date_to < form.date_from) { Toast.show({ type: 'error', text1: 'Data końca jest przed początkiem' }); return }
    save({
      target: 'period', periodId: form.id, entries: form.entries,
      period: { name: form.name.trim(), date_from: form.date_from, date_to: form.date_to, repeat_yearly: form.repeat_yearly, days_of_week: form.days },
    })
  }

  if (loading) {
    return <View style={[styles.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  const sundayModes = [...new Set(baseDraft.filter(e => e.day_of_week === 0).map(e => e.service_mode))]
  const body = [styles.body, isDesktop && styles.desktop, { paddingBottom: Math.max(insets.bottom, 16) + (baseDirty && tab === 'base' ? 96 : 24) }]

  // ── formularz okresu ──
  if (form) {
    const activeNow = periodCoversDate(form, today)
    return (
      <View style={[styles.flex, { backgroundColor: c.bg }]}>
        <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">
          <Card large style={styles.card}>
            <AppText variant="eyebrow" color={c.goldInk}>{form.id ? 'Edycja zmiany okresowej' : 'Nowa zmiana okresowa'}</AppText>
            {!form.id && (
              <View style={styles.chips}>
                {presets(today).map(ps => <Chip key={ps.label} label={ps.label} onPress={() => applyPreset(ps)} />)}
              </View>
            )}
            <TextField label="Nazwa" value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder="np. Październik — różaniec" />
            <View style={styles.dates}>
              {(['from', 'to'] as const).map(k => (
                <Pressable key={k} onPress={() => setDatePick(k)} style={[styles.dateBox, { backgroundColor: c.inputBg }]}>
                  <AppText variant="small" muted>{k === 'from' ? 'Od' : 'Do'}</AppText>
                  <AppText variant="bodyStrong">{shortDate(k === 'from' ? form.date_from : form.date_to)} {form.repeat_yearly ? '' : (k === 'from' ? form.date_from : form.date_to).slice(0, 4)}</AppText>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: form.repeat_yearly }}
              onPress={() => setForm({ ...form, repeat_yearly: !form.repeat_yearly })} style={styles.toggle}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">Powtarzaj co roku</AppText>
                <AppText variant="small" muted>Np. październik z różańcem — ustawiasz raz na zawsze.</AppText>
              </View>
              <Switch value={form.repeat_yearly} onValueChange={v => setForm({ ...form, repeat_yearly: v })}
                trackColor={{ true: c.primary, false: c.inputBorder }} thumbColor="#FFFFFF" />
            </Pressable>
            <AppText variant="small" muted>Dni, których dotyczy (pozostałe dni bez zmian):</AppText>
            <View style={styles.chips}>
              {WEEK_ORDER.map(d => <Chip key={d} label={DAY_SHORT[d]} selected={form.days.includes(d)} onPress={() => toggleFormDay(d)} />)}
              <Chip label="Pn–Sb" onPress={() => setFormDays(MON_SAT)} />
              <Chip label="Cały tydzień" onPress={() => setFormDays(ALL_DAYS)} />
            </View>
            <AppText variant="small" muted>
              {`${rangeText(form)} · ${daysText(form.days)}${activeNow ? ' · trwa teraz' : ''}. ` +
                'W te dni poniższy układ ZASTĘPUJE stały rozkład. Pusty dzień = brak Mszy (odwołane).'}
            </AppText>
            <Button compact variant="ghost" icon="restore" label="Wypełnij stałym rozkładem"
              onPress={() => setForm({ ...form, entries: draftFromTemplates(templates, form.days) })} />
          </Card>

          <RozkladEditor entries={form.entries} onChange={entries => setForm({ ...form, entries })} days={form.days}
            emptyDayText="Brak Mszy — w tym okresie odwołane" />
          <ServiceModeLegend />

          <Button label={form.id ? 'Zapisz zmianę' : 'Dodaj zmianę okresową'} icon="check" onPress={savePeriod} loading={saving && !pending} />
          {form.id && <Button label="Usuń zmianę okresową" variant="secondary" icon="delete" onPress={() => setConfirmDelete(true)} />}
          <Button label="Anuluj" variant="ghost" onPress={() => setForm(null)} />
        </ScrollView>

        <DatePickerModal
          visible={!!datePick}
          value={datePick === 'to' ? form.date_to : form.date_from}
          minDate={datePick === 'to' ? form.date_from : undefined}
          onConfirm={d => {
            if (datePick === 'from') setForm({ ...form, date_from: d, date_to: form.date_to < d ? d : form.date_to })
            else setForm({ ...form, date_to: d })
            setDatePick(null)
          }}
          onClose={() => setDatePick(null)}
        />
        <ConfirmDialog
          visible={confirmDelete}
          title="Usunąć zmianę okresową?"
          message="W te dni znów będzie obowiązywał stały rozkład. Zobaczysz, czyje zapisy to zmienia."
          confirmText="Usuń"
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); save({ target: 'delete_period', periodId: form.id, entries: [] }) }}
        />
        <RozkladPreviewSheet visible={!!pending} changes={changes} policy={policy} onPolicy={changePolicy}
          loading={saving} onConfirm={() => pending && commit(pending, policy)} onClose={() => setPending(null)} />
      </View>
    )
  }

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">
        <Segmented<Tab>
          options={[{ value: 'base', label: 'Stały rozkład' }, { value: 'periods', label: `Zmiany okresowe${periods.length ? ` (${periods.length})` : ''}` }]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'base' ? (
          <>
            <Card large style={styles.card}>
              <View style={styles.row}>
                <Icon name="calendar-star" size={20} color={c.goldInk} />
                <AppText variant="eyebrow" color={c.goldInk} style={styles.flex}>Niedziele</AppText>
              </View>
              <AppText variant="small" muted>Jak w Twojej parafii wygląda służba w niedziele? Dotyczy wszystkich niedzielnych Mszy.</AppText>
              <Segmented<ServiceMode>
                options={(['signup', 'assigned', 'none'] as ServiceMode[]).map(m => ({ value: m, label: SERVICE_MODE_INFO[m].short }))}
                value={(sundayModes.length === 1 ? sundayModes[0] : 'assigned') as ServiceMode}
                onChange={m => setBaseDraft(setModeForDays(baseDraft, [0], m))}
              />
              <AppText variant="small" muted>
                {sundayModes.length > 1 ? 'Niedzielne Msze mają różne ustawienia — wybierz, żeby ujednolicić.' : SERVICE_MODE_INFO[(sundayModes[0] ?? 'assigned') as ServiceMode].hint}
              </AppText>
            </Card>
            <RozkladEditor entries={baseDraft} onChange={setBaseDraft} />
            <ServiceModeLegend />
          </>
        ) : (
          <>
            <Card large style={styles.card}>
              <AppText variant="small" muted>
                Zmiana okresowa zastępuje stały rozkład w wybranym czasie — np. w październiku: 17:00 Msza, 17:30 różaniec, 18:00 Msza.
                Zapisy ministrantów na zmienione godziny przeniesiesz jednym kliknięciem.
              </AppText>
              <View style={styles.chips}>
                {presets(today).map(ps => <Chip key={ps.label} icon="plus" label={ps.label} onPress={() => openPeriod(null, ps)} />)}
              </View>
            </Card>
            {periods.length === 0 && <AppText variant="small" muted style={styles.empty}>Brak zmian okresowych — obowiązuje stały rozkład.</AppText>}
            {periods.map(p => {
              const n = periodEntries.filter(e => e.period_id === p.id).length
              const now = periodCoversDate(p, today)
              const ended = !p.repeat_yearly && p.date_to < today
              return (
                <Card key={p.id} large onPress={() => openPeriod(p)} style={[styles.card, ended && { opacity: 0.6 }]}>
                  <View style={styles.row}>
                    <AppText variant="bodyStrong" style={styles.flex}>{p.name}</AppText>
                    {now && <AppText variant="small" color={c.success}>trwa teraz</AppText>}
                    {ended && <AppText variant="small" muted>zakończona</AppText>}
                    <Icon name="chevron-right" size={20} color={c.subtext} />
                  </View>
                  <AppText variant="small" muted>
                    {`${rangeText(p)} · ${daysText(p.days_of_week)} · ${n ? `${n} ${pl(n, ['pozycja', 'pozycje', 'pozycji'])}` : 'Msze odwołane'}`}
                  </AppText>
                </Card>
              )
            })}
            <Button label="Nowa zmiana okresowa" icon="plus" onPress={() => openPeriod(null)} />
          </>
        )}
      </ScrollView>

      {tab === 'base' && baseDirty && (
        <View style={[styles.saveBar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <AppText variant="small" muted style={styles.flex}>Niezapisane zmiany w rozkładzie</AppText>
          <Button compact variant="ghost" label="Odrzuć" onPress={() => setBaseDraft(toDraft(templates))} />
          <Button compact label="Zapisz" icon="check" loading={saving && !pending} onPress={() => save({ target: 'base', entries: baseDraft })} />
        </View>
      )}

      <RozkladPreviewSheet visible={!!pending} changes={changes} policy={policy} onPolicy={changePolicy}
        loading={saving} onConfirm={() => pending && commit(pending, policy)} onClose={() => setPending(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  body: { padding: 16, gap: 12 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 820, width: '100%' },
  card: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  dates: { flexDirection: 'row', gap: 10 },
  dateBox: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  empty: { textAlign: 'center', paddingVertical: 12 },
  saveBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth,
  },
})
