import { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { DAY_LONG, DAY_SHORT } from '../../lib/dates'
import {
  DraftEntry, SERVICE_MODE_INFO, ServiceMode, SlotCategory, clearDays, copyDay, draftKey, setModeForDays,
  shiftDays, shiftTime, sortDraft,
} from '../../lib/massSchedule'
import { TimePickerModal } from '../TimePickerModal'
import { AppText, Button, Card, Chip, Icon } from '../ui'

/** Poniedziałek pierwszy */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const MODES: ServiceMode[] = ['signup', 'assigned', 'none']
const MODE_ICON: Record<ServiceMode, string> = { signup: 'account-plus', assigned: 'clipboard-account', none: 'minus-circle' }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

type Props = {
  entries: DraftEntry[]
  onChange: (next: DraftEntry[]) => void
  /** dni widoczne w edytorze (okres: tylko jego dni) */
  days?: number[]
  /** podpowiedź w pustym dniu */
  emptyDayText?: string
  /** własny nagłówek dnia (np. „W te święta”) */
  dayTitle?: (day: number) => string
}

/** Edytor rozkładu (szkic): pozycje per dzień + zmiany zbiorcze na wybranych dniach. */
export function RozkladEditor({ entries, onChange, days = WEEK_ORDER, emptyDayText = 'Brak Mszy', dayTitle }: Props) {
  const { colors: c } = useTheme()
  const visibleDays = WEEK_ORDER.filter(d => days.includes(d))
  const [picker, setPicker] = useState<{ key: string } | null>(null)
  const [bulkDays, setBulkDays] = useState<number[]>([])
  const [copyFrom, setCopyFrom] = useState<number | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const pickedEntry = picker ? entries.find(e => e.key === picker.key) : null

  const update = (key: string, patch: Partial<DraftEntry>) =>
    onChange(sortDraft(entries.map(e => (e.key === key ? { ...e, ...patch } : e))))
  const remove = (key: string) => onChange(entries.filter(e => e.key !== key))
  const add = (day: number) => {
    const last = entries.filter(e => e.day_of_week === day).map(e => e.time).sort().pop()
    const key = draftKey()
    onChange(sortDraft([...entries, {
      id: null, key, day_of_week: day, time: last ? shiftTime(last, 30) : '18:00', label: null,
      category: 'msza', service_mode: day === 0 ? (entries.find(e => e.day_of_week === 0)?.service_mode ?? 'assigned') : 'signup',
      base_template_id: null,
    }]))
    setPicker({ key })
  }

  const target = bulkDays.length ? bulkDays : visibleDays
  const targetLabel = bulkDays.length === 0 || bulkDays.length === visibleDays.length
    ? 'wszystkie dni'
    : WEEK_ORDER.filter(d => bulkDays.includes(d)).map(d => DAY_SHORT[d]).join(', ')
  const toggleBulk = (d: number) => setBulkDays(b => (b.includes(d) ? b.filter(x => x !== d) : [...b, d]))

  return (
    <View style={styles.wrap}>
      {/* ── Zmiany zbiorcze ── */}
      <Card large style={styles.bulk}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: bulkOpen }} onPress={() => setBulkOpen(o => !o)} style={styles.row}>
          <Icon name="layers-triple" size={20} color={c.goldInk} />
          <View style={styles.flex}>
            <AppText variant="eyebrow" color={c.goldInk}>Zmień wiele naraz</AppText>
            {!bulkOpen && <AppText variant="small" muted>Przesuń godziny, usuń, ustaw tryb albo skopiuj dzień</AppText>}
          </View>
          <Icon name={bulkOpen ? 'chevron-up' : 'chevron-down'} size={22} color={c.subtext} />
        </Pressable>
        {bulkOpen && <>
        <AppText variant="small" muted>Wybierz dni (bez wyboru = wszystkie), potem akcję.</AppText>
        <View style={styles.chips}>
          {visibleDays.map(d => (
            <Chip key={d} label={DAY_SHORT[d]} selected={bulkDays.includes(d)} onPress={() => toggleBulk(d)} />
          ))}
        </View>
        <AppText variant="small" muted>{`Dotyczy: ${targetLabel}`}</AppText>
        <View style={styles.chips}>
          {[-30, -15, 15, 30].map(m => (
            <Chip key={m} icon="clock" label={`${m > 0 ? '+' : '−'}${Math.abs(m)} min`}
              onPress={() => onChange(sortDraft(shiftDays(entries, target, m)))} />
          ))}
        </View>
        <View style={styles.chips}>
          {MODES.map(m => (
            <Chip key={m} icon={MODE_ICON[m]} label={SERVICE_MODE_INFO[m].short}
              onPress={() => onChange(setModeForDays(entries, target, m))} />
          ))}
          <Chip icon="delete" label="Usuń wszystkie" onPress={() => onChange(clearDays(entries, target))} />
        </View>
        <View style={styles.chips}>
          <AppText variant="small" muted>Skopiuj układ z:</AppText>
          {visibleDays.map(d => (
            <Chip key={d} label={DAY_SHORT[d]} selected={copyFrom === d} onPress={() => setCopyFrom(copyFrom === d ? null : d)} />
          ))}
        </View>
        {copyFrom !== null && (
          <Button compact variant="secondary" icon="content-copy"
            label={`Kopiuj ${DAY_LONG[copyFrom]} → ${targetLabel}`}
            onPress={() => { onChange(copyDay(entries, copyFrom, target)); setCopyFrom(null) }} />
        )}
        </>}
      </Card>

      {/* ── Dni ── */}
      {visibleDays.map(day => {
        const items = entries.filter(e => e.day_of_week === day)
        return (
          <Card key={day} large style={styles.day}>
            <View style={styles.row}>
              <AppText variant="heading" style={styles.flex}>{dayTitle ? dayTitle(day) : cap(DAY_LONG[day])}</AppText>
              <Pressable accessibilityRole="button" onPress={() => add(day)} style={[styles.addBtn, { backgroundColor: c.primarySurface }]}>
                <Icon name="plus" size={16} color={c.primary} />
                <AppText style={[styles.addText, { color: c.primary }]}>Dodaj</AppText>
              </Pressable>
            </View>
            {items.length === 0 && <AppText variant="small" muted>{emptyDayText}</AppText>}
            {items.map(e => (
              <View key={e.key} style={[styles.entry, { borderTopColor: c.border }]}>
                <View style={styles.row}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Zmień godzinę" onPress={() => setPicker({ key: e.key })}
                    style={[styles.time, { backgroundColor: c.primary }]}>
                    <AppText style={styles.timeText}>{e.time.slice(0, 5)}</AppText>
                  </Pressable>
                  <TextInput
                    value={e.label ?? ''}
                    onChangeText={v => update(e.key, { label: v || null })}
                    placeholder={e.category === 'nabozenstwo' ? 'Nabożeństwo (np. Różaniec)' : 'Msza Święta'}
                    placeholderTextColor={c.textTertiary}
                    style={[styles.label, { color: c.text, backgroundColor: c.inputBg }]}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel="Usuń" hitSlop={8} onPress={() => remove(e.key)}>
                    <Icon name="delete" size={22} color={c.danger} />
                  </Pressable>
                </View>
                <View style={styles.chips}>
                  {(['msza', 'nabozenstwo'] as SlotCategory[]).map(cat => (
                    <Chip key={cat} label={cat === 'msza' ? 'Msza' : 'Nabożeństwo'} selected={e.category === cat}
                      onPress={() => update(e.key, { category: cat })} />
                  ))}
                  <View style={[styles.sep, { backgroundColor: c.border }]} />
                  {MODES.map(m => (
                    <Chip key={m} icon={MODE_ICON[m]} label={SERVICE_MODE_INFO[m].short} selected={e.service_mode === m}
                      onPress={() => update(e.key, { service_mode: m })} />
                  ))}
                </View>
              </View>
            ))}
          </Card>
        )
      })}

      <TimePickerModal
        visible={!!pickedEntry}
        value={pickedEntry?.time.slice(0, 5) ?? ''}
        onConfirm={t => { if (picker) update(picker.key, { time: t }); setPicker(null) }}
        onClose={() => setPicker(null)}
      />
    </View>
  )
}

/** Legenda trybów (pod edytorem). */
export function ServiceModeLegend() {
  const { colors: c } = useTheme()
  return (
    <View style={styles.legend}>
      {MODES.map(m => (
        <View key={m} style={styles.row}>
          <Icon name={MODE_ICON[m]} size={16} color={c.subtext} />
          <AppText variant="small" muted style={styles.flex}>
            <AppText variant="small" style={{ ...sans(700) }}>{SERVICE_MODE_INFO[m].label}</AppText>
            {` — ${SERVICE_MODE_INFO[m].hint}`}
          </AppText>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  bulk: { gap: 8 },
  day: { gap: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  addText: { ...sans(700), fontSize: 13 },
  entry: { gap: 8, paddingTop: 10, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  time: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, minWidth: 64, alignItems: 'center' },
  timeText: { ...sans(800), fontSize: 15, color: '#FFFFFF' },
  label: { ...sans(500), flex: 1, minWidth: 0, fontSize: 14, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  sep: { width: 1, height: 20, marginHorizontal: 4 },
  legend: { gap: 6, paddingHorizontal: 4 },
})
