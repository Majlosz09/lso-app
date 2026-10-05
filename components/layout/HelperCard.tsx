import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { AppText, Button, Card } from '../ui'

/** Ministrant-pomocnik opiekuna: skróty do grafiku, zgłoszeń i trybu zakrystii. */
export function HelperCard() {
  const router = useRouter()
  const { colors: c } = useTheme()
  const profile = useAuthStore(s => s.profile)
  if (!profile?.is_helper || profile.role !== 'member' || profile.is_admin) return null
  return (
    <Card style={styles.card}>
      <AppText variant="eyebrow" color={c.goldInk}>Pomocnik opiekuna</AppText>
      <AppText variant="small" muted>Układasz grafik, zaznaczasz obecność i rozpatrujesz zgłoszenia.</AppText>
      <View style={styles.row}>
        <Button compact label="Grafik" icon="calendar-month" style={styles.flex} onPress={() => router.push('/(admin)/(admin-tabs)/schedules' as any)} />
        <Button compact label="Zgłoszenia" icon="calendar-remove" variant="secondary" style={styles.flex} onPress={() => router.push('/(admin)/absence-requests' as any)} />
        <Button compact label="Zakrystia" icon="tablet" variant="secondary" style={styles.flex} onPress={() => router.push('/(admin)/kiosk' as any)} />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  flex: { flexGrow: 1, minWidth: 100 },
})
