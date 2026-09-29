import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useTheme } from '../../lib/ThemeContext'
import { headerPalette, sans, VestmentColor } from '../../lib/theme'
import { getLiturgicalDay } from '../../lib/liturgy'
import { localDateStr } from '../../lib/dates'
import { useServices } from '../../hooks/useServices'
import { useServiceActions } from '../../components/services/useServiceActions'
import { ServiceDetail } from '../../components/services/ServiceDetail'
import { AppText, Icon } from '../../components/ui'

/** Szczegóły jednej służby (telefon). Na webie ten sam widok jest panelem w Grafiku. */
export default function ServiceScreen() {
  const { id, date, time } = useLocalSearchParams<{ id: string; date: string; time?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors: c, isDark } = useTheme()
  const day = date ?? localDateStr()
  const { services, loading, refresh } = useServices(day, day)
  const actions = useServiceActions(refresh)
  // wolne miejsce z rozkładu po zapisie staje się prawdziwą służbą o innym id — wtedy szukamy po godzinie
  const service = services.find(s => s.id === id)
    ?? (time ? services.find(s => s.time === time && s.category === 'msza') : undefined)
  const pal = headerPalette((getLiturgicalDay(day).color ?? 'GREEN') as VestmentColor, isDark)

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/schedule'))

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <StatusBar style={pal.statusBar} />
      <View style={{ backgroundColor: pal.bg, paddingTop: insets.top + 6, paddingHorizontal: 22 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Wstecz" onPress={back} style={styles.back}>
          <Icon name="chevron-left" size={22} color={pal.fg} />
          <AppText style={[styles.backText, { color: pal.fg }]}>Wstecz</AppText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {loading ? (
          <ActivityIndicator color={c.primary} style={styles.loader} />
        ) : service ? (
          <ServiceDetail service={service} actions={actions} />
        ) : (
          <AppText muted style={styles.gone}>Ta służba została zmieniona albo usunięta. Wróć do grafiku.</AppText>
        )}
      </ScrollView>
      {actions.sheets}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -6, alignSelf: 'flex-start', paddingBottom: 4 },
  backText: { ...sans(700), fontSize: 13 },
  loader: { marginTop: 40 },
  gone: { padding: 24, textAlign: 'center' },
})
