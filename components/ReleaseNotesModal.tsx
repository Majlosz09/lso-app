import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuthStore } from '../stores/authStore'
import { useTour } from '../stores/tourStore'
import { useTheme } from '../lib/ThemeContext'
import { tourRoleFor } from '../lib/tour'
import { RELEASE_ID, releaseItems, releaseSeenKey, shouldShowRelease } from '../lib/releaseNotes'
import { AppText, Button, Icon, Sheet } from './ui'

/**
 * „Co nowego” po aktualizacji: raz dla każdego dotychczasowego użytkownika (na urządzeniu),
 * z przyciskiem do interaktywnego przewodnika.
 */
export function ReleaseNotesModal({ suppressed, onVisibleChange }: { suppressed: boolean; onVisibleChange?: (v: boolean) => void }) {
  const { colors: c } = useTheme()
  const profile = useAuthStore(s => s.profile)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!profile?.id) { setVisible(false); return }
    let cancelled = false
    ;(async () => {
      let seen: string | null = null
      try { seen = await AsyncStorage.getItem(releaseSeenKey(profile.id)) } catch { /* bez pamięci — pokażemy */ }
      if (!cancelled) setVisible(shouldShowRelease(profile, seen))
    })()
    return () => { cancelled = true }
  }, [profile?.id, profile?.onboarding_completed, profile?.approved])

  const show = visible && !suppressed
  useEffect(() => { onVisibleChange?.(show) }, [show])

  const close = async (startTour: boolean) => {
    setVisible(false)
    if (profile?.id) {
      try { await Promise.resolve(AsyncStorage.setItem(releaseSeenKey(profile.id), RELEASE_ID)) } catch { /* trudno */ }
    }
    if (startTour && profile) setTimeout(() => useTour.getState().start(tourRoleFor(profile)), 350)
  }

  if (!profile) return null
  const items = releaseItems(tourRoleFor(profile))

  return (
    <Sheet
      visible={show}
      onClose={() => close(false)}
      eyebrow="Nowa wersja LSO App"
      title="Co nowego?"
      footer={
        <>
          <Button label="Pokaż mi, co gdzie jest" icon="map-marker-path" onPress={() => close(true)} />
          <Button label="Zamknij" variant="secondary" onPress={() => close(false)} />
        </>
      }
    >
      <AppText variant="small" muted>
        Aplikacja dostała nowy wygląd i sporo nowych możliwości. Oto najważniejsze zmiany — a przewodnik pokaże Ci, gdzie co jest.
      </AppText>
      {items.map(it => (
        <View key={it.title} style={styles.row}>
          <View style={[styles.icon, { backgroundColor: c.goldSurface }]}>
            <Icon name={it.icon} size={20} color={c.goldInk} />
          </View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{it.title}</AppText>
            <AppText variant="small" muted>{it.text}</AppText>
          </View>
        </View>
      ))}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0, gap: 2 },
})
