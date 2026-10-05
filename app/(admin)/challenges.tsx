import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { localDateStr, shortDate } from '../../lib/dates'
import { BoardRow, CHALLENGE_PRESETS, Challenge, ChallengePreset, challengeStatus, nextPresetDates } from '../../lib/challenges'
import { DatePickerModal } from '../../components/DatePickerModal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { AppText, Badge, Button, Card, Chip, Icon, Sheet, TextField } from '../../components/ui'

type Form = { id: string | null; name: string; description: string; date_from: string; date_to: string; goal: string; bonus: string; filter: string; icon: string }
const STATUS_LABEL = { active: 'trwa', upcoming: 'wkrótce', ended: 'zakończone' } as const

/** Wyzwania sezonowe: tworzenie z szablonów (Roraty, Droga Krzyżowa…), wyniki uczestników. */
export default function ChallengesScreen() {
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const me = useAuthStore(s => s.profile?.id)
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const today = localDateStr()
  const [list, setList] = useState<Challenge[] | null>(null)
  const [anchors, setAnchors] = useState<Record<number, Record<string, string>>>({})
  const [form, setForm] = useState<Form | null>(null)
  const [datePick, setDatePick] = useState<'from' | 'to' | null>(null)
  const [saving, setSaving] = useState(false)
  const [board, setBoard] = useState<{ c: Challenge; rows: BoardRow[] } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    if (!parishId) return
    const { data } = await supabase.from('challenges').select('*').eq('parish_id', parishId).order('date_from', { ascending: false })
    setList((data ?? []) as Challenge[])
  }, [parishId])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const y = Number(today.slice(0, 4))
    Promise.all([y, y + 1].map(yy => supabase.rpc('liturgical_anchors', { p_year: yy }))).then(res => {
      const out: Record<number, Record<string, string>> = {}
      res.forEach((r, i) => { out[y + i] = Object.fromEntries(((r.data ?? []) as any[]).map(x => [x.key, x.day])) })
      setAnchors(out)
    })
  }, [today])

  const fromPreset = (p: ChallengePreset) => {
    const d = nextPresetDates(p, today, anchors)
    if (!d) { Toast.show({ type: 'error', text1: 'Nie udało się policzyć dat' }); return }
    setForm({ id: null, name: `${p.name} ${d.year}`, description: p.description, date_from: d.from, date_to: d.to,
      goal: String(p.goal), bonus: String(p.bonus), filter: p.filter ?? '', icon: p.icon })
  }
  const edit = (ch: Challenge) => setForm({ id: ch.id, name: ch.name, description: ch.description ?? '', date_from: ch.date_from, date_to: ch.date_to,
    goal: String(ch.goal), bonus: String(ch.bonus_points), filter: ch.title_filter ?? '', icon: ch.icon })

  const save = async () => {
    if (!form || !parishId) return
    const goal = parseInt(form.goal, 10), bonus = parseInt(form.bonus || '0', 10)
    if (!form.name.trim()) { Toast.show({ type: 'error', text1: 'Podaj nazwę' }); return }
    if (!(goal >= 1 && goal <= 200)) { Toast.show({ type: 'error', text1: 'Cel: od 1 do 200 obecności' }); return }
    if (form.date_to < form.date_from) { Toast.show({ type: 'error', text1: 'Koniec przed początkiem' }); return }
    const row = { name: form.name.trim().slice(0, 60), description: form.description.trim() || null, date_from: form.date_from, date_to: form.date_to,
      goal, bonus_points: Math.max(0, Math.min(500, bonus || 0)), title_filter: form.filter.trim() || null, icon: form.icon }
    setSaving(true)
    const res = form.id
      ? await supabase.from('challenges').update(row).eq('id', form.id).select('id').single()
      : await supabase.from('challenges').insert({ ...row, parish_id: parishId, created_by: me }).select('id').single()
    if (!res.error && res.data) await supabase.rpc('recount_challenge', { p_challenge: res.data.id })
    setSaving(false)
    if (res.error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: res.error.message }); return }
    Toast.show({ type: 'success', text1: form.id ? 'Wyzwanie zapisane' : 'Wyzwanie dodane', text2: 'Ministranci zobaczą je na Pulpicie.' })
    setForm(null)
    load()
  }
  const remove = async () => {
    if (!form?.id) return
    setConfirmDelete(false)
    const { error } = await supabase.from('challenges').delete().eq('id', form.id)
    if (error) { Toast.show({ type: 'error', text1: 'Nie usunięto', text2: error.message }); return }
    setForm(null); load()
  }
  const openBoard = async (ch: Challenge) => {
    const { data } = await supabase.rpc('challenge_board', { p_challenge: ch.id })
    setBoard({ c: ch, rows: (data ?? []) as BoardRow[] })
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.body, isDesktop && styles.desktop]} keyboardShouldPersistTaps="handled">
      {form ? (
        <Card large style={styles.card}>
          <AppText variant="eyebrow" color={c.goldInk}>{form.id ? 'Edycja wyzwania' : 'Nowe wyzwanie'}</AppText>
          <TextField label="Nazwa" value={form.name} onChangeText={v => setForm({ ...form, name: v })} maxLength={60} />
          <TextField label="Opis dla ministrantów" value={form.description} onChangeText={v => setForm({ ...form, description: v })} multiline maxLength={300} />
          <View style={styles.row}>
            {(['from', 'to'] as const).map(k => (
              <Pressable key={k} onPress={() => setDatePick(k)} style={[styles.dateBox, { backgroundColor: c.inputBg }]}>
                <AppText variant="small" muted>{k === 'from' ? 'Od' : 'Do'}</AppText>
                <AppText variant="bodyStrong">{shortDate(k === 'from' ? form.date_from : form.date_to)} {(k === 'from' ? form.date_from : form.date_to).slice(0, 4)}</AppText>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <TextField label="Cel (obecności)" keyboardType="number-pad" value={form.goal} onChangeText={v => setForm({ ...form, goal: v.replace(/\D/g, '') })} containerStyle={styles.flex} />
            <TextField label="Premia (pkt)" keyboardType="number-pad" value={form.bonus} onChangeText={v => setForm({ ...form, bonus: v.replace(/\D/g, '') })} containerStyle={styles.flex} />
          </View>
          <TextField label="Liczą się służby, których nazwa zawiera (puste = wszystkie)" placeholder="np. rorat, droga, róża"
            value={form.filter} onChangeText={v => setForm({ ...form, filter: v })} maxLength={40} />
          <AppText variant="small" muted>Obecności liczą się same (z aplikacji, tabletu, opiekuna i zgłoszeń). Premia przychodzi automatycznie po osiągnięciu celu.</AppText>
          <Button label="Zapisz" icon="check" onPress={save} loading={saving} />
          {form.id && <Button label="Usuń wyzwanie" icon="delete" variant="secondary" onPress={() => setConfirmDelete(true)} />}
          <Button label="Anuluj" variant="ghost" onPress={() => setForm(null)} />
        </Card>
      ) : (
        <>
          <Card large style={styles.card}>
            <AppText variant="eyebrow" color={c.goldInk}>Nowe wyzwanie z szablonu</AppText>
            <AppText variant="small" muted>Daty liczą się same z kalendarza liturgicznego (najbliższa edycja).</AppText>
            <View style={styles.chips}>
              {CHALLENGE_PRESETS.map(p => <Chip key={p.key} icon={p.icon} label={p.name} onPress={() => fromPreset(p)} />)}
              <Chip icon="plus" label="Własne" onPress={() => setForm({ id: null, name: '', description: '', date_from: today, date_to: today, goal: '5', bonus: '10', filter: '', icon: 'trophy' })} />
            </View>
          </Card>
          {list === null ? <ActivityIndicator color={c.primary} /> : list.length === 0 ? (
            <AppText variant="small" muted style={styles.empty}>Brak wyzwań — dodaj pierwsze z szablonu.</AppText>
          ) : list.map(ch => {
            const st = challengeStatus(ch, today)
            return (
              <Card key={ch.id} style={[styles.card, st === 'ended' && { opacity: 0.6 }]}>
                <View style={styles.row}>
                  <Icon name={ch.icon || 'trophy'} size={22} color={c.goldInk} />
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong">{ch.name}</AppText>
                    <AppText variant="small" muted>
                      {`${shortDate(ch.date_from)} – ${shortDate(ch.date_to)} · cel ${ch.goal}${ch.bonus_points ? ` · +${ch.bonus_points} pkt` : ''}${ch.title_filter ? ` · „${ch.title_filter}”` : ''}`}
                    </AppText>
                  </View>
                  <Badge label={STATUS_LABEL[st]} tone={st === 'active' ? 'success' : st === 'upcoming' ? 'gold' : 'muted'} />
                </View>
                <View style={styles.row}>
                  <Button compact label="Wyniki" icon="podium" variant="secondary" style={styles.flex} onPress={() => openBoard(ch)} />
                  <Button compact label="Edytuj" icon="pencil" variant="ghost" style={styles.flex} onPress={() => edit(ch)} />
                </View>
              </Card>
            )
          })}
        </>
      )}

      {form && (
        <DatePickerModal visible={!!datePick} value={datePick === 'to' ? form.date_to : form.date_from}
          minDate={datePick === 'to' ? form.date_from : undefined}
          onConfirm={d => { setForm(datePick === 'from' ? { ...form, date_from: d, date_to: form.date_to < d ? d : form.date_to } : { ...form, date_to: d }); setDatePick(null) }}
          onClose={() => setDatePick(null)} />
      )}
      <Sheet visible={!!board} onClose={() => setBoard(null)} eyebrow="Wyniki" title={board?.c.name ?? ''}>
        {board && board.rows.length === 0 ? <AppText muted>Jeszcze nikt nie zdobył punktu w tym wyzwaniu.</AppText> : board?.rows.map((r, i) => (
          <View key={r.id} style={styles.boardRow}>
            <AppText variant="bodyStrong" style={styles.pos}>{i + 1}.</AppText>
            <AppText variant="body" style={styles.flex}>{r.name}</AppText>
            <AppText variant="bodyStrong" color={r.done ? c.success : c.text}>{`${r.count}/${board.c.goal}${r.done ? ' ✓' : ''}`}</AppText>
          </View>
        ))}
      </Sheet>
      <ConfirmDialog visible={confirmDelete} title="Usunąć wyzwanie?" message="Przyznane premie zostaną (są już w punktach ministrantów)."
        confirmText="Usuń" destructive onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 820, width: '100%' },
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dateBox: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  empty: { textAlign: 'center', paddingVertical: 12 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  pos: { width: 28 },
})
