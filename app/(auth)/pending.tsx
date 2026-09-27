import { useMemo, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import Toast from 'react-native-toast-message'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ConfirmDialog } from '../../components/ConfirmDialog'

// Konto dołączyło do parafii kodem i czeka na zatwierdzenie przez admina.
// Po zatwierdzeniu profil odświeża się sam (realtime w authStore) i layout przenosi do aplikacji.
export default function PendingApprovalScreen() {
  const { profile, fetchProfile, signOut } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [refreshing, setRefreshing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    await fetchProfile()
    setRefreshing(false)
    if (useAuthStore.getState().profile?.approved === false) {
      Toast.show({ type: 'info', text1: 'Jeszcze nie zatwierdzono', text2: 'Poproś administratora parafii o akceptację.' })
    }
  }

  // Wycofanie prośby (np. zły kod) — wraca do ekranu wyboru parafii
  const cancelRequest = async () => {
    setConfirmCancel(false)
    const { error } = await supabase.from('profiles').update({ parish_id: null }).eq('id', profile!.id)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    await fetchProfile()
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="hourglass-outline" size={44} color={c.primary} />
      </View>
      <Text style={styles.title}>Czekasz na zatwierdzenie</Text>
      <Text style={styles.text}>
        Twoja prośba o dołączenie do parafii została wysłana. Administrator (ksiądz lub opiekun grupy)
        musi ją zatwierdzić — dostaniesz powiadomienie, gdy to nastąpi.
      </Text>
      <Text style={styles.hint}>Dzięki temu do danych ministrantów mają dostęp tylko osoby z parafii.</Text>

      <TouchableOpacity style={styles.primary} onPress={refresh} disabled={refreshing}>
        {refreshing
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.primaryText}>Sprawdź ponownie</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={() => setConfirmCancel(true)}>
        <Text style={styles.secondaryText}>Wycofaj prośbę / zmień kod</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.link} onPress={signOut}>
        <Text style={styles.linkText}>Wyloguj</Text>
      </TouchableOpacity>

      <ConfirmDialog
        visible={confirmCancel}
        title="Wycofać prośbę?"
        message="Wrócisz do ekranu wyboru parafii i możesz wpisać inny kod."
        confirmText="Wycofaj"
        onConfirm={cancelRequest}
        onCancel={() => setConfirmCancel(false)}
      />
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
    iconWrap: {
      width: 88, height: 88, borderRadius: 28, alignSelf: 'center',
      backgroundColor: c.primarySurface, justifyContent: 'center', alignItems: 'center', marginBottom: 6,
    },
    title: { fontSize: 24, fontWeight: '800', color: c.text, textAlign: 'center' },
    text: { fontSize: 15, color: c.subtext, textAlign: 'center', lineHeight: 22 },
    hint: { fontSize: 13, color: c.textTertiary, textAlign: 'center' },
    primary: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    secondary: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: c.border },
    secondaryText: { color: c.primary, fontSize: 15, fontWeight: '600' },
    link: { alignItems: 'center', paddingVertical: 8 },
    linkText: { color: c.subtext, fontSize: 14 },
  })
}
