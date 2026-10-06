import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { AppText, Avatar, Button, Card, Chip, Icon, ListRow, Segmented, Sheet, TextField } from '../ui'
import { useFunctions } from '../../hooks/useFunctions'

/** Najczęstsze funkcje liturgiczne do szybkiego dodania. */
export const PRESET_ROLES = ['Ceremoniarz', 'Lektor', 'Akolita', 'Krucyferariusz', 'Ceroferariusz', 'Turyferariusz', 'Nawikulariusz', 'Ministrant']

export type RolesMode = 'admin' | 'self'
type Slot = { id: string; name: string; position: number; holder: { profileId: string; name: string } | null }

/** Błąd „brak funkcji/kolumny” = baza bez migracji 20261001070000. */
const missing = (msg: string) => /roles_mode|schedule_role_slots|slot_id|set_schedule_roles|assign_role_slot|claim_role_slot|release_role_slot|schema cache/.test(msg)

function useRoles(scheduleId: string | null) {
  const [mode, setMode] = useState<RolesMode | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [available, setAvailable] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!scheduleId) { setLoading(false); return }
    const [sch, sl, asg] = await Promise.all([
      supabase.from('schedules').select('roles_mode').eq('id', scheduleId).maybeSingle(),
      supabase.from('schedule_role_slots').select('id, name, position').eq('schedule_id', scheduleId).order('position'),
      supabase.from('schedule_assignments').select('slot_id, profile_id, profile:profiles(full_name)').eq('schedule_id', scheduleId).not('slot_id', 'is', null),
    ])
    if (sch.error || sl.error || asg.error) { setAvailable(false); setLoading(false); return }
    const holders = new Map(((asg.data ?? []) as any[]).map(a => [a.slot_id, { profileId: a.profile_id, name: a.profile?.full_name ?? '—' }]))
    setAvailable(true)
    setMode(((sch.data as any)?.roles_mode ?? null) as RolesMode | null)
    setSlots(((sl.data ?? []) as any[]).map(s => ({ ...s, holder: holders.get(s.id) ?? null })))
    setLoading(false)
  }, [scheduleId])

  useEffect(() => { load() }, [load])
  return { mode, slots, available, loading, reload: load }
}

function SlotRow({ slot, first, right }: { slot: Slot; first: boolean; right?: React.ReactNode }) {
  const { colors: c } = useTheme()
  return (
    <View style={[styles.slot, !first && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
      <View style={[styles.roleTag, { backgroundColor: c.goldSurface }]}>
        <AppText style={[styles.roleTagText, { color: c.goldText }]} numberOfLines={1}>{slot.name}</AppText>
      </View>
      <View style={styles.flex}>
        {slot.holder ? (
          <View style={styles.holder}>
            <Avatar name={slot.holder.name} size={26} color={c.primary} textColor={c.gold} />
            <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>{slot.holder.name}</AppText>
          </View>
        ) : <AppText muted>Wolne</AppText>}
      </View>
      {right}
    </View>
  )
}

/**
 * N17 — ministrant: role na tej służbie (gdy opiekun je włączył).
 * W trybie „wolny wybór” przyciski Zajmij / Zwolnij.
 */
export function MemberRolesCard({ scheduleId, canChoose, onChanged }: { scheduleId: string | null; canChoose: boolean; onChanged?: () => void }) {
  const { colors: c } = useTheme()
  const me = useAuthStore(s => s.profile?.id)
  const { mode, slots, available, reload } = useRoles(scheduleId)
  const { requiredFor, has } = useFunctions()
  const [busy, setBusy] = useState<string | null>(null)
  if (!available || !mode || slots.length === 0) return null
  const lacks = (s: Slot) => { const fn = requiredFor(s.name); return !!fn && !!me && !has(me, fn.id) }

  const mine = slots.find(s => s.holder?.profileId === me)
  const act = async (slot: Slot, claim: boolean) => {
    setBusy(slot.id)
    const { error } = await supabase.rpc(claim ? 'claim_role_slot' : 'release_role_slot', { p_slot_id: slot.id })
    setBusy(null)
    if (error) { Toast.show({ type: 'error', text1: 'Nie udało się', text2: error.message }); reload(); return }
    Toast.show({ type: 'success', text1: claim ? `Twoja rola: ${slot.name}` : 'Rola zwolniona' })
    reload(); onChanged?.()
  }

  return (
    <Card flush>
      <View style={[styles.head, { borderBottomColor: c.borderLight }]}>
        <AppText variant="eyebrow" color={c.goldInk} style={styles.flex}>Role na tej Mszy</AppText>
        <AppText variant="small" muted>{mode === 'self' ? 'wolny wybór' : 'przydziela opiekun'}</AppText>
      </View>
      {slots.map((s, i) => {
        const isMine = s.holder?.profileId === me
        const right = mode === 'self' && canChoose ? (
          isMine ? <Button label="Zwolnij" variant="ghost" compact loading={busy === s.id} onPress={() => act(s, false)} />
            : !s.holder && lacks(s) ? <AppText variant="small" muted>wymaga funkcji</AppText>
            : !s.holder ? <Button label={mine ? 'Zmień na tę' : 'Zajmij'} variant="secondary" compact loading={busy === s.id} onPress={() => act(s, true)} />
              : undefined
        ) : isMine ? <Icon name="account-check" size={20} color={c.success} filled /> : undefined
        return <SlotRow key={s.id} slot={s} first={i === 0} right={right} />
      })}
    </Card>
  )
}

/** N17 — opiekun: włączanie ról na tej służbie, edycja listy ról i przydzielanie osób. */
export function AdminRolesCard({ scheduleId, onChanged }: { scheduleId: string; onChanged?: () => void }) {
  const { colors: c } = useTheme()
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const { mode, slots, available, loading, reload } = useRoles(scheduleId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [draftMode, setDraftMode] = useState<RolesMode>('admin')
  const [custom, setCustom] = useState('')
  const [saving, setSaving] = useState(false)
  const [pickFor, setPickFor] = useState<Slot | null>(null)
  const [members, setMembers] = useState<{ id: string; full_name: string }[]>([])
  const [query, setQuery] = useState('')
  const { functions, requiredFor, has } = useFunctions()
  const quickRoles = functions.length ? [...functions.map(f => f.name), 'Ministrant'] : PRESET_ROLES

  if (loading || !available) return null

  const openEditor = () => {
    setDraft(slots.length ? slots.map(s => s.name) : ['Ceremoniarz', 'Lektor', 'Akolita'])
    setDraftMode(mode ?? 'admin')
    setCustom('')
    setEditing(true)
  }

  const save = async (disable = false) => {
    if (!disable && draft.length === 0) { Toast.show({ type: 'error', text1: 'Dodaj co najmniej jedną rolę' }); return }
    setSaving(true)
    const { error } = await supabase.rpc('set_schedule_roles', { p_schedule_id: scheduleId, p_roles: disable ? [] : draft, p_mode: disable ? null : draftMode })
    setSaving(false)
    if (error) { Toast.show({ type: 'error', text1: missing(error.message) ? 'Role nie są jeszcze włączone w tej bazie' : 'Błąd', text2: error.message }); return }
    setEditing(false)
    Toast.show({ type: 'success', text1: disable ? 'Role wyłączone — zwykła obsada' : 'Role zapisane' })
    reload(); onChanged?.()
  }

  const openPicker = async (slot: Slot) => {
    setQuery('')
    setPickFor(slot)
    const { data } = await supabase.from('profiles').select('id, full_name')
      .eq('parish_id', parishId).eq('role', 'member').eq('is_active', true).eq('approved', true).order('full_name')
    setMembers((data ?? []) as any)
  }

  const assign = async (profileId: string | null) => {
    const slot = pickFor
    if (!slot) return
    setPickFor(null)
    const { error } = await supabase.rpc('assign_role_slot', { p_slot_id: slot.id, p_profile_id: profileId })
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    reload(); onChanged?.()
  }

  const holderSlot = new Map(slots.filter(s => s.holder).map(s => [s.holder!.profileId, s.name]))
  const needFn = pickFor ? requiredFor(pickFor.name) : null
  const filtered = members
    .filter(m => !query.trim() || m.full_name.toLowerCase().includes(query.trim().toLowerCase()))
    // z wymaganą funkcją najpierw
    .sort((a, b) => (needFn ? Number(has(b.id, needFn.id)) - Number(has(a.id, needFn.id)) : 0))

  return (
    <>
      <Card flush>
        <View style={[styles.head, { borderBottomColor: c.borderLight }]}>
          <View style={styles.flex}>
            <AppText variant="eyebrow" color={c.goldInk}>Role na tej Mszy</AppText>
            {!!mode && <AppText variant="small" muted>{mode === 'self' ? 'Ministranci sami wybierają rolę' : 'Przydzielasz osoby do ról'}</AppText>}
          </View>
          <Button label={mode ? 'Edytuj' : 'Włącz role'} icon={mode ? 'pencil' : 'account-star'} compact variant="secondary" onPress={openEditor} />
        </View>
        {!mode ? (
          <AppText variant="small" muted style={styles.pad}>
            Na zwykłych Mszach wystarczy obsada. Na uroczystości możesz włączyć role (np. ceremoniarz, lektor, akolici) tylko dla tej służby.
          </AppText>
        ) : slots.map((s, i) => (
          <SlotRow
            key={s.id}
            slot={s}
            first={i === 0}
            right={<Button label={s.holder ? 'Zmień' : 'Przydziel'} variant={s.holder ? 'ghost' : 'secondary'} compact onPress={() => openPicker(s)} />}
          />
        ))}
      </Card>

      {/* Edytor ról */}
      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        title={mode ? 'Role na tej Mszy' : 'Włącz role'}
        footer={
          <>
            <Button label="Zapisz role" onPress={() => save(false)} loading={saving} />
            {mode ? <Button label="Wyłącz role" variant="secondary" onPress={() => save(true)} /> : <Button label="Anuluj" variant="secondary" onPress={() => setEditing(false)} />}
          </>
        }
      >
        <Segmented
          options={[{ value: 'admin', label: 'Przydzielam ja' }, { value: 'self', label: 'Ministranci wybierają' }]}
          value={draftMode}
          onChange={v => setDraftMode(v as RolesMode)}
        />
        <Card flush>
          {draft.length === 0 ? <AppText muted style={styles.pad}>Dodaj role poniżej.</AppText> : draft.map((r, i) => (
            <View key={`${r}-${i}`} style={[styles.draftRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
              <AppText style={[styles.num, { color: c.subtext }]}>{i + 1}</AppText>
              <AppText variant="bodyStrong" style={styles.flex}>{r}</AppText>
              <Pressable accessibilityLabel={`Usuń rolę ${r}`} hitSlop={8} onPress={() => setDraft(d => d.filter((_, j) => j !== i))}>
                <Icon name="close" size={20} color={c.dangerStrong} filled />
              </Pressable>
            </View>
          ))}
        </Card>
        <AppText variant="label" muted>Dodaj rolę</AppText>
        <View style={styles.chips}>
          {quickRoles.map(r => <Chip key={r} label={r} icon="plus" onPress={() => setDraft(d => [...d, r])} />)}
        </View>
        <View style={styles.customRow}>
          <TextField placeholder="Inna rola, np. Psałterzysta" value={custom} onChangeText={setCustom} style={styles.flex} />
          <Button label="Dodaj" compact variant="secondary" onPress={() => { const v = custom.trim(); if (v) { setDraft(d => [...d, v.slice(0, 40)]); setCustom('') } }} />
        </View>
        <AppText variant="small" muted>
          Obecność i punkty liczą się jak zwykle. Wyłączenie ról zostawia osoby w obsadzie jako ministrantów.
        </AppText>
      </Sheet>

      {/* Wybór osoby do roli */}
      <Sheet visible={!!pickFor} onClose={() => setPickFor(null)} eyebrow="Przydziel do roli" title={pickFor?.name ?? ''}>
        {members.length > 8 && <TextField placeholder="Szukaj po imieniu…" value={query} onChangeText={setQuery} />}
        <Card flush>
          <ScrollView style={styles.pickList} nestedScrollEnabled>
            {pickFor?.holder && (
              <ListRow first icon="account-remove" destructive title="Zwolnij rolę" subtitle={`${pickFor.holder.name} zostanie w obsadzie`} onPress={() => assign(null)} />
            )}
            {members.length === 0 ? <ActivityIndicator color={c.primary} style={styles.pad} /> : filtered.map((m, i) => (
              <ListRow
                key={m.id}
                first={i === 0 && !pickFor?.holder}
                title={m.full_name}
                subtitle={[holderSlot.get(m.id) ? `Teraz: ${holderSlot.get(m.id)}` : '', needFn && !has(m.id, needFn.id) ? `bez funkcji „${needFn.name}”` : ''].filter(Boolean).join(' · ') || undefined}
                left={<Avatar name={m.full_name} size={34} color={c.primary} textColor={c.gold} />}
                selected={pickFor?.holder?.profileId === m.id}
                onPress={() => assign(m.id)}
              />
            ))}
          </ScrollView>
        </Card>
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pad: { padding: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  roleTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, width: 118 },
  roleTagText: { ...sans(700), fontSize: 12 },
  holder: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  num: { ...sans(800), fontSize: 13, width: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickList: { maxHeight: 380 },
})
