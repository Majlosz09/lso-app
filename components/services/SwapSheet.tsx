import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { longDate } from '../../lib/dates'
import type { Service } from '../../hooks/useServices'
import { AppText, Avatar, Button, Icon, Sheet, TextField } from '../ui'

type Person = { id: string; full_name: string; rank: string | null }

/** N4: wybór osoby do zamiany — ministranci parafii bez przydziału na tej służbie. */
export function SwapSheet({ service, busy, onClose, onSubmit }: {
  service: Service | null
  busy?: boolean
  onClose: () => void
  onSubmit: (toProfileId: string, toName: string) => void
}) {
  const { colors: c } = useTheme()
  const profile = useAuthStore(s => s.profile)
  const [people, setPeople] = useState<Person[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!service || !profile?.parish_id) return
    setSelected(null); setQuery('')
    supabase.from('profiles')
      .select('id, full_name, ranks(name)')
      .eq('parish_id', profile.parish_id).eq('role', 'member').eq('is_active', true).eq('approved', true)
      .order('full_name')
      .then(({ data }) => setPeople(((data ?? []) as any[]).map(p => ({ id: p.id, full_name: p.full_name, rank: p.ranks?.name ?? null }))))
  }, [service?.id, profile?.parish_id])

  const busyIds = useMemo(() => new Set(
    (service?.people ?? []).filter(p => p.status !== 'swapped').map(p => p.profileId),
  ), [service])
  const list = (people ?? [])
    .filter(p => p.id !== profile?.id && !busyIds.has(p.id))
    .filter(p => !query.trim() || p.full_name.toLowerCase().includes(query.trim().toLowerCase()))

  const submit = () => {
    const p = list.find(x => x.id === selected) ?? people?.find(x => x.id === selected)
    if (!p) { Toast.show({ type: 'info', text1: 'Wybierz osobę do zamiany' }); return }
    onSubmit(p.id, p.full_name)
  }

  return (
    <Sheet
      visible={!!service}
      onClose={onClose}
      title="Poproś o zamianę"
      eyebrow={service ? `${service.title} · ${longDate(service.date)} ${service.time}` : undefined}
      footer={
        <>
          <Button label="Wyślij prośbę" icon="swap-horizontal" onPress={submit} loading={busy} />
          <Button label="Anuluj" variant="secondary" onPress={onClose} />
        </>
      }
    >
      <AppText variant="small" muted>Wybrana osoba dostanie powiadomienie. Gdy się zgodzi, przejmie Twój dyżur.</AppText>
      {(people?.length ?? 0) > 8 && (
        <TextField placeholder="Szukaj osoby" value={query} onChangeText={setQuery} />
      )}
      <View style={[styles.list, { borderColor: c.border, backgroundColor: c.surface }]}>
        {people === null ? <ActivityIndicator color={c.primary} style={styles.pad} /> : list.length === 0 ? (
          <AppText muted style={styles.pad}>Brak osób do wyboru.</AppText>
        ) : (
          <ScrollView style={styles.scroll} nestedScrollEnabled>
            {list.map((p, i) => {
              const on = selected === p.id
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setSelected(p.id)}
                  style={({ hovered }: any) => [
                    styles.row,
                    i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight },
                    (on || hovered) && { backgroundColor: c.highlight },
                  ]}
                >
                  <Avatar name={p.full_name} size={34} color={c.primary} textColor={c.gold} />
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" numberOfLines={1}>{p.full_name}</AppText>
                    {!!p.rank && <AppText variant="small" muted>{p.rank}</AppText>}
                  </View>
                  <Icon name={on ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={on ? c.primary : c.iconMuted} />
                </Pressable>
              )
            })}
          </ScrollView>
        )}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  scroll: { maxHeight: 340 },
  pad: { padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
})
