import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { AppText, Button, Icon, Sheet } from '../../components/ui'

// Konto dołączyło do parafii kodem i czeka na zatwierdzenie przez admina.
// Po zatwierdzeniu profil odświeża się sam (realtime w authStore) i layout przenosi do aplikacji.
export default function PendingApprovalScreen() {
  const { profile, parish, fetchProfile, signOut } = useAuthStore()
  const { colors: c } = useTheme()
  const isDesktop = useIsDesktop()
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
    Toast.show({ type: 'success', text1: 'Prośba wycofana — możesz podać inny kod' })
    await fetchProfile()
  }

  const onNavy = !isDesktop
  const textColor = onNavy ? '#FFFFFF' : c.text
  const steps: [string, string, boolean][] = [
    ['Konto założone', 'check-circle-outline', true],
    ['Kod parafii poprawny', 'check-circle-outline', true],
    ['Zatwierdzenie przez opiekuna', 'clock-outline', false],
  ]

  return (
    <AuthLayout
      variant="hero"
      title="Czekamy na"
      titleAccent="zatwierdzenie"
      subtitle={`Opiekun ${parish?.name ? `parafii ${parish.name} ` : 'parafii '}dostał Twoje zgłoszenie. Damy znać powiadomieniem, gdy konto będzie aktywne. Dzięki temu do danych ministrantów mają dostęp tylko osoby z parafii.`}
      heroTop={
        <View style={[styles.hourglass, { borderColor: c.gold }]}>
          <Icon name="timer-sand" size={36} color={c.gold} />
        </View>
      }
      footer={
        <>
          <Button label="Sprawdź ponownie" variant={onNavy ? 'gold' : 'primary'} onPress={refresh} loading={refreshing} />
          <Button
            label="Wycofaj prośbę / zmień kod"
            variant={onNavy ? 'outlineLight' : 'secondary'}
            onPress={() => setConfirmCancel(true)}
          />
          <Pressable onPress={signOut} accessibilityRole="button" style={styles.logout}>
            <AppText style={[styles.logoutText, { color: onNavy ? '#C9D3E3' : c.subtext }]}>Wyloguj się</AppText>
          </Pressable>
        </>
      }
    >
      <View style={styles.steps}>
        {steps.map(([label, icon, done]) => (
          <View key={label} style={styles.step}>
            <Icon name={icon} size={20} color={done ? '#7FC29B' : c.gold} />
            <AppText style={[styles.stepText, { color: done ? textColor : (onNavy ? '#E3C98E' : c.goldInk) }]}>{label}</AppText>
          </View>
        ))}
      </View>

      <Sheet
        visible={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Wycofać prośbę?"
        footer={
          <>
            <Button label="Wycofaj" variant="danger" onPress={cancelRequest} />
            <Button label="Anuluj" variant="secondary" onPress={() => setConfirmCancel(false)} />
          </>
        }
      >
        <AppText muted>Wrócisz do ekranu wyboru parafii i możesz wpisać inny kod.</AppText>
      </Sheet>
    </AuthLayout>
  )
}

const styles = StyleSheet.create({
  hourglass: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 1,
    backgroundColor: 'rgba(201,165,90,0.16)', alignItems: 'center', justifyContent: 'center',
  },
  steps: { gap: 10, marginTop: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepText: { ...sans(600), fontSize: 14 },
  logout: { alignSelf: 'center', padding: 10, cursor: 'pointer' } as any,
  logoutText: { ...sans(700), fontSize: 14 },
})
