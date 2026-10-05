import { useState } from 'react'
import { Linking, Platform, StyleSheet, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import Toast from 'react-native-toast-message'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import { calendarFeedUrls } from '../lib/shareLinks'
import { AppText, Button, Card } from './ui'

/**
 * „Dyżury w kalendarzu telefonu”: subskrypcja ICS (Apple / Google / inne).
 * Kalendarz sam pobiera zmiany. Link jest osobisty — można go unieważnić.
 */
export function CalendarSubscribeCard({ who }: { who: 'member' | 'parent' | 'staff' }) {
  const { colors: c } = useTheme()
  const [busy, setBusy] = useState(false)
  const [links, setLinks] = useState<ReturnType<typeof calendarFeedUrls> | null>(null)

  const get = async (regenerate = false) => {
    setBusy(true)
    const { data, error } = await supabase.rpc('my_calendar_token', { p_regenerate: regenerate })
    setBusy(false)
    if (error || !data) { Toast.show({ type: 'error', text1: 'Nie udało się', text2: error?.message }); return null }
    const l = calendarFeedUrls(data as string)
    setLinks(l)
    if (regenerate) Toast.show({ type: 'success', text1: 'Nowy link — stary przestał działać' })
    return l
  }
  const open = async (kind: 'webcal' | 'google') => {
    const l = links ?? await get()
    if (l) Linking.openURL(kind === 'webcal' ? l.webcal : l.google)
  }
  const copy = async () => {
    const l = links ?? await get()
    if (!l) return
    await Clipboard.setStringAsync(l.https)
    Toast.show({ type: 'success', text1: 'Skopiowano link kalendarza', text2: 'Wklej go w „Dodaj kalendarz z adresu URL”.' })
  }

  const what = who === 'parent' ? 'Dyżury dzieci' : who === 'staff' ? 'Wszystkie służby parafii' : 'Twoje dyżury'
  return (
    <Card style={styles.card}>
      <AppText variant="eyebrow" color={c.goldInk}>Kalendarz w telefonie</AppText>
      <AppText variant="small" muted>
        {`${what} same pojawią się w kalendarzu telefonu (z przypomnieniem 30 min wcześniej) i będą się aktualizować.`}
      </AppText>
      <View style={styles.row}>
        {Platform.OS !== 'android' && <Button compact label="Kalendarz Apple" icon="apple" style={styles.flex} onPress={() => open('webcal')} loading={busy && !links} />}
        <Button compact label="Kalendarz Google" icon="google" variant={Platform.OS === 'android' ? 'primary' : 'secondary'} style={styles.flex} onPress={() => open('google')} />
      </View>
      <View style={styles.row}>
        <Button compact label="Kopiuj link" icon="content-copy" variant="ghost" style={styles.flex} onPress={copy} />
        {links && <Button compact label="Unieważnij link" icon="refresh" variant="ghost" style={styles.flex} onPress={() => get(true)} />}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  flex: { flexGrow: 1, minWidth: 130 },
})
