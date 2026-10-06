import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { useFunctions } from '../../hooks/useFunctions'
import { AppText, Card, Chip } from '../ui'

/**
 * Funkcje liturgiczne osoby. Opiekun (editable) zaznacza, co ministrant może pełnić;
 * ministrant widzi swoje funkcje. Bez funkcji i bez edycji — nic nie pokazuje.
 */
export function MemberFunctionsCard({ profileId, editable, bare }: { profileId: string; editable?: boolean; bare?: boolean }) {
  const { colors: c } = useTheme()
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const { functions, byProfile, refresh } = useFunctions()
  const [busy, setBusy] = useState<string | null>(null)
  const mine = byProfile.get(profileId) ?? new Set<string>()
  if (!functions.length || (!editable && mine.size === 0)) return null

  const toggle = async (fnId: string) => {
    setBusy(fnId)
    const { error } = mine.has(fnId)
      ? await supabase.from('member_functions').delete().eq('profile_id', profileId).eq('function_id', fnId)
      : await supabase.from('member_functions').insert({ profile_id: profileId, function_id: fnId, parish_id: parishId })
    setBusy(null)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: error.message }); return }
    refresh()
  }

  const content = (
    <>
      <AppText variant="eyebrow" color={c.goldInk}>Funkcje liturgiczne</AppText>
      <View style={styles.chips}>
        {(editable ? functions : functions.filter(f => mine.has(f.id))).map(f => (
          <Chip key={f.id} label={busy === f.id ? '…' : f.name} icon={mine.has(f.id) ? 'check' : undefined}
            selected={mine.has(f.id)} onPress={editable ? () => toggle(f.id) : undefined} />
        ))}
      </View>
      {editable && (
        <AppText variant="small" muted>Zaznacz, co ta osoba może pełnić — rolę o tej nazwie na Mszy zajmie sama tylko z tą funkcją.</AppText>
      )}
    </>
  )
  return bare ? <View style={styles.wrap}>{content}</View> : <Card style={styles.wrap}>{content}</Card>
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
