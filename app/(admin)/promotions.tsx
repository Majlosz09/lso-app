import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { FormationProgressCard } from '../../components/FormationProgressCard'
import { AppText, Avatar, Button, Card } from '../../components/ui'

type Ready = { id: string; full_name: string; current: { id: string; name: string } | null; next: { id: string; name: string } }

/** Gotowi do awansu: spełnili wymagania ścieżki formacji — opiekun nadaje stopień jednym kliknięciem. */
export default function PromotionsScreen() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const [list, setList] = useState<Ready[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('formation_ready')
    setList(error ? [] : ((data ?? []) as Ready[]))
  }, [])
  useEffect(() => { load() }, [load])

  const promote = async (r: Ready) => {
    setBusy(r.id)
    const { error } = await supabase.from('profiles').update({ rank_id: r.next.id }).eq('id', r.id)
    setBusy(null)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: error.message }); return }
    Toast.show({ type: 'success', text1: `${r.full_name.split(' ')[0]}: ${r.next.name}`, text2: 'Wysłaliśmy gratulacje (także rodzicowi).' })
    load()
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.body, isDesktop && styles.desktop]}>
      <AppText variant="small" muted style={styles.intro}>
        Ministranci, którzy spełnili wymagania do kolejnego stopnia. Wymagania ustawisz w Ustawieniach parafii → Rangi.
      </AppText>
      {list === null ? <ActivityIndicator color={c.primary} /> : list.length === 0 ? (
        <Card large style={styles.card}>
          <AppText>Nikt jeszcze nie spełnił wszystkich wymagań.</AppText>
          <Button label="Ustaw wymagania stopni" variant="secondary" compact onPress={() => router.push('/(admin)/rank-management')} />
        </Card>
      ) : list.map(r => (
        <Card key={r.id} large style={styles.card}>
          <View style={styles.row}>
            <Avatar name={r.full_name} size={40} color={c.primary} textColor={c.gold} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{r.full_name}</AppText>
              <AppText variant="small" muted>{`${r.current?.name ?? 'bez stopnia'} → ${r.next.name}`}</AppText>
            </View>
          </View>
          <FormationProgressCard profileId={r.id} who="admin" bare />
          <Button label={`Nadaj stopień: ${r.next.name}`} icon="arrow-up-bold-circle" loading={busy === r.id} onPress={() => promote(r)} />
        </Card>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 820, width: '100%' },
  intro: { paddingHorizontal: 4 },
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
