import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { dayShort, relativeDay, shortDate } from '../../lib/dates'
import type { Service } from '../../hooks/useServices'
import { AppText, Button, Icon, Sheet } from '../ui'

/**
 * Rodzic zapisuje dziecko (bez telefonu) na Mszę z zapisami: wolne Msze z najbliższych dni,
 * raz albo co tydzień — jak ministrant w swojej aplikacji.
 */
export function ChildSignUpSheet({ visible, onClose, child, services, takenScheduleIds, onDone }: {
  visible: boolean
  onClose: () => void
  child: { id: string; name: string } | null
  services: Service[]
  /** służby, na które dziecko już jest zapisane */
  takenScheduleIds: Set<string>
  onDone: () => void
}) {
  const { colors: c } = useTheme()
  const [pick, setPick] = useState<Service | null>(null)
  const [busy, setBusy] = useState(false)
  const free = useMemo(() => {
    const soon = Date.now() + 30 * 60_000
    return services.filter(s => s.serviceMode === 'signup' && !takenScheduleIds.has(s.id)
      && new Date(`${s.date}T${s.time}`).getTime() > soon)
  }, [services, takenScheduleIds])
  const days = Array.from(new Set(free.map(s => s.date)))

  const signUp = async (mode: 'once' | 'recurring') => {
    if (!pick || !child) return
    setBusy(true)
    const { data, error } = await supabase.rpc('sign_up_for_slot', {
      p_date: pick.date, p_time_label: pick.time, p_mode: mode, p_church_id: pick.churchId, p_for_child: child.id,
    })
    setBusy(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: error.message }); return }
    const n = (data as any)?.count ?? 1
    Toast.show({ type: 'success', text1: `${child.name} zapisany`, text2: mode === 'recurring' ? `Co tydzień — ${n} służb` : `${pick.title} · ${dayShort(pick.date)} ${pick.time}` })
    setPick(null)
    onDone()
    onClose()
  }

  return (
    <Sheet
      visible={visible}
      onClose={() => { setPick(null); onClose() }}
      eyebrow={child ? `Zapis: ${child.name}` : undefined}
      title={pick ? `${pick.title} · ${pick.time}` : 'Na którą Mszę?'}
      footer={pick ? (
        <>
          <Button label="Zapisz raz" icon="check" onPress={() => signUp('once')} loading={busy} />
          <Button label={`Zapisuj co tydzień (${dayShort(pick.date)} ${pick.time})`} icon="calendar-sync" variant="secondary" onPress={() => signUp('recurring')} />
          <Button label="Wróć do listy" variant="ghost" onPress={() => setPick(null)} />
        </>
      ) : undefined}
    >
      {pick ? (
        <AppText muted>{`${relativeDay(pick.date)}, ${shortDate(pick.date)}${pick.churchName ? ` · ${pick.churchName}` : ''}. Dziecko dostanie powiadomienie, a Ty zobaczysz dyżur w zakładce.`}</AppText>
      ) : free.length === 0 ? (
        <AppText muted>Brak wolnych Mszy z zapisami w najbliższych dniach.</AppText>
      ) : (
        <ScrollView style={styles.list}>
          {days.map(d => (
            <View key={d} style={styles.day}>
              <AppText variant="small" muted>{`${dayShort(d)} ${shortDate(d)} · ${relativeDay(d)}`}</AppText>
              {free.filter(s => s.date === d).map(s => (
                <Pressable key={s.id} onPress={() => setPick(s)} style={[styles.row, { borderColor: c.border }]}>
                  <AppText variant="bodyStrong" style={styles.time}>{s.time}</AppText>
                  <View style={styles.flex}>
                    <AppText variant="body" numberOfLines={1}>{s.title}</AppText>
                    {!!s.churchName && <AppText variant="small" color={c.goldInk}>{s.churchName}</AppText>}
                  </View>
                  <Icon name="plus-circle" size={22} color={c.primary} />
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { maxHeight: 420 },
  day: { gap: 6, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  time: { width: 52 },
})
