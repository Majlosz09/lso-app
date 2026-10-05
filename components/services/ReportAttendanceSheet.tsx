import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { addDays, localDateStr, relativeDay } from '../../lib/dates'
import type { Service } from '../../hooks/useServices'
import { TimePickerModal } from '../TimePickerModal'
import { AppText, Button, Chip, Icon, Sheet, TextField } from '../ui'

/** Okno zgłoszenia: od 30 min przed rozpoczęciem do 48 h po (tak samo w report_attendance). */
export function reportable(s: Pick<Service, 'date' | 'time' | 'attended' | 'serviceMode'>, now = new Date()): boolean {
  if (s.attended || s.serviceMode === 'none') return false
  const start = new Date(`${s.date}T${s.time}:00`).getTime()
  return now.getTime() >= start - 30 * 60_000 && now.getTime() <= start + 48 * 3600_000
}

type Props = {
  visible: boolean
  onClose: () => void
  /** służby z ostatnich dni (z grafiku i rozkładu) */
  services: Service[]
  onSent: () => void
  /** rodzic zgłasza za dziecko */
  forChild?: { id: string; name: string } | null
}

/** „Byłem, ale nie potwierdziłem” — zgłoszenie obecności do opiekuna (do 48 h). */
export function ReportAttendanceSheet({ visible, onClose, services, onSent, forChild }: Props) {
  const { colors: c } = useTheme()
  const today = localDateStr()
  const candidates = useMemo(
    () => services.filter(s => reportable(s)).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)).slice(0, 5),
    [services, visible],
  )
  const [pick, setPick] = useState<string | 'other' | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<'msza' | 'nabozenstwo'>('nabozenstwo')
  const [day, setDay] = useState(today)
  const [time, setTime] = useState('')
  const [timeOpen, setTimeOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!visible) return
    setPick(candidates[0]?.id ?? 'other'); setTitle(''); setTime(''); setNote(''); setDay(today)
  }, [visible])

  const chosen = candidates.find(s => s.id === pick)
  const send = async () => {
    const other = pick === 'other'
    if (other && (!title.trim() || !/^\d{2}:\d{2}$/.test(time))) {
      Toast.show({ type: 'error', text1: 'Uzupełnij, na czym byłeś i o której' }); return
    }
    setBusy(true)
    const { error } = await supabase.rpc('report_attendance', other
      ? { p_date: day, p_time: time, p_title: title.trim(), p_category: category, p_note: note.trim() || null, p_for_child: forChild?.id ?? null }
      : { p_date: chosen!.date, p_time: chosen!.time, p_category: chosen!.category, p_note: note.trim() || null, p_church_id: chosen!.churchId, p_for_child: forChild?.id ?? null })
    setBusy(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie wysłano', text2: error.message }); return }
    Toast.show({ type: 'success', text1: 'Wysłano do opiekuna', text2: 'Punkty dostaniesz po zatwierdzeniu.' })
    onSent()
    onClose()
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow="Zgłoś obecność"
      title={forChild ? `Na czym był ${forChild.name}?` : 'Na czym byłeś?'}
      footer={<Button label="Wyślij do opiekuna" icon="send" onPress={send} loading={busy} disabled={!pick} />}
    >
      <AppText variant="small" muted>
        {forChild
          ? `${forChild.name} był na służbie, ale nie ma telefonu albo zapomniał potwierdzić? Zgłoś to do 48 godzin — opiekun zatwierdzi, a punkty trafią na konto dziecka.`
          : 'Zapomniałeś się zapisać albo potwierdzić obecność? Zgłoś to do 48 godzin — opiekun zatwierdzi, a punkty dostaniesz jak za tę służbę.'}
      </AppText>
      <View style={styles.list}>
        {candidates.map(s => (
          <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ checked: pick === s.id }} onPress={() => setPick(s.id)}
            style={[styles.option, { borderColor: pick === s.id ? c.primary : c.border, backgroundColor: pick === s.id ? c.primarySurface : c.surface }]}>
            <Icon name={pick === s.id ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={pick === s.id ? c.primary : c.subtext} filled />
            <View style={styles.flex}>
              <AppText variant="bodyStrong" numberOfLines={1}>{`${s.title} · ${s.time}`}</AppText>
              <AppText variant="small" muted>{`${relativeDay(s.date)}${s.churchName ? ` · ${s.churchName}` : ''}${s.mine ? ' · Twój dyżur' : ''}`}</AppText>
            </View>
          </Pressable>
        ))}
        <Pressable accessibilityRole="radio" accessibilityState={{ checked: pick === 'other' }} onPress={() => setPick('other')}
          style={[styles.option, { borderColor: pick === 'other' ? c.primary : c.border, backgroundColor: pick === 'other' ? c.primarySurface : c.surface }]}>
          <Icon name={pick === 'other' ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={pick === 'other' ? c.primary : c.subtext} filled />
          <AppText variant="bodyStrong" style={styles.flex}>Inne — nie ma tego na liście</AppText>
        </Pressable>
      </View>

      {pick === 'other' && (
        <View style={styles.other}>
          <TextField label="Na czym byłeś?" placeholder="np. Różaniec, Droga Krzyżowa" value={title} onChangeText={setTitle} />
          <View style={styles.chips}>
            <Chip label="Nabożeństwo" selected={category === 'nabozenstwo'} onPress={() => setCategory('nabozenstwo')} />
            <Chip label="Msza" selected={category === 'msza'} onPress={() => setCategory('msza')} />
          </View>
          <View style={styles.chips}>
            {[0, -1, -2].map(n => {
              const d = addDays(today, n)
              return <Chip key={d} label={relativeDay(d)} selected={day === d} onPress={() => setDay(d)} />
            })}
            <Chip icon="clock" label={time || 'Godzina…'} selected={!!time} onPress={() => setTimeOpen(true)} />
          </View>
        </View>
      )}

      <TextField label="Wiadomość do opiekuna (opcjonalnie)" placeholder="np. przyszedłem w zastępstwie" value={note} onChangeText={setNote} />
      <TimePickerModal visible={timeOpen} value={time} onConfirm={t => { setTime(t); setTimeOpen(false) }} onClose={() => setTimeOpen(false)} />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  other: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
