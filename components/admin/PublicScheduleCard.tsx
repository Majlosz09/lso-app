import { useState } from 'react'
import { Linking, Platform, Share, StyleSheet, Switch, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import Toast from 'react-native-toast-message'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { publicScheduleUrl } from '../../lib/shareLinks'
import { AppText, Button, Card } from '../ui'

/** Ustawienia parafii: link do grafiku bez logowania (dla rodziców, na stronę parafii, do gabloty). */
export function PublicScheduleCard() {
  const { colors: c } = useTheme()
  const parish = useAuthStore(s => s.parish)
  const fetchProfile = useAuthStore(s => s.fetchProfile)
  const [busy, setBusy] = useState(false)
  const token = parish?.public_token ?? null
  const url = token ? publicScheduleUrl(token) : null

  const set = async (enabled: boolean, regenerate = false) => {
    setBusy(true)
    const { error } = await supabase.rpc('set_public_schedule', { p_enabled: enabled, p_regenerate: regenerate })
    setBusy(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: error.message }); return }
    await fetchProfile()
    Toast.show({ type: 'success', text1: !enabled ? 'Link wyłączony' : regenerate ? 'Nowy link — stary przestał działać' : 'Link włączony' })
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">Grafik dla rodziców (bez logowania)</AppText>
          <AppText variant="small" muted>Link do podglądu grafiku — do wysłania rodzicom, na stronę parafii albo jako kod QR w gablocie. Ministranci widoczni jako imię i inicjał.</AppText>
        </View>
        <Switch value={!!token} disabled={busy} onValueChange={v => set(v)} trackColor={{ true: c.primary, false: c.inputBorder }} thumbColor="#FFFFFF" />
      </View>
      {url && (
        <>
          <AppText variant="small" color={c.primary} selectable>{url}</AppText>
          <View style={styles.qr}><QRCode value={url} size={150} color="#000000" backgroundColor="#FFFFFF" /></View>
          <View style={styles.buttons}>
            <Button compact label="Kopiuj" icon="content-copy" variant="secondary" style={styles.btn}
              onPress={async () => { await Clipboard.setStringAsync(url); Toast.show({ type: 'success', text1: 'Skopiowano link' }) }} />
            {Platform.OS === 'web'
              ? <Button compact label="Otwórz" icon="open-in-new" variant="secondary" style={styles.btn} onPress={() => Linking.openURL(url)} />
              : <Button compact label="Udostępnij" icon="share-variant" variant="secondary" style={styles.btn} onPress={() => Share.share({ message: `Grafik ministrantów: ${url}` })} />}
            <Button compact label="Nowy link" icon="refresh" variant="ghost" style={styles.btn} onPress={() => set(true, true)} />
          </View>
        </>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  qr: { alignSelf: 'center', padding: 10, backgroundColor: '#FFFFFF', borderRadius: 12 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexGrow: 1, minWidth: 110 },
})
