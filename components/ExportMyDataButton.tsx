import { useState } from 'react'
import { Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native'
import Toast from 'react-native-toast-message'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

// RODO art. 15/20: kopia własnych danych w JSON (RPC export_my_data, migracja 20260928020000).
// Web: pobranie pliku; telefon: arkusz udostępniania (zapis, mail, dysk).
export function ExportMyDataButton() {
  const { colors: c } = useTheme()
  const [busy, setBusy] = useState(false)

  const handleExport = async () => {
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('export_my_data')
      if (error) throw error
      const json = JSON.stringify(data, null, 2)
      const fileName = `moje-dane-lso-${new Date().toISOString().slice(0, 10)}.json`

      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      } else {
        const uri = (FileSystem.cacheDirectory ?? '') + fileName
        await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 })
        await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Moje dane z LSO App' })
      }
      Toast.show({ type: 'success', text1: 'Gotowe', text2: 'Plik z Twoimi danymi został przygotowany.' })
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Nie udało się pobrać danych', text2: e?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TouchableOpacity style={styles.link} onPress={handleExport} disabled={busy}>
      {busy
        ? <ActivityIndicator size="small" color={c.subtext} />
        : <Text style={[styles.linkText, { color: c.subtext }]}>Pobierz moje dane</Text>}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  link: { alignItems: 'center', paddingVertical: 8 },
  linkText: { fontSize: 13, textDecorationLine: 'underline' },
})
