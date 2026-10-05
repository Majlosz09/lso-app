import { StyleSheet, View } from 'react-native'
import { useAuthStore } from '../../stores/authStore'
import { useCheckinQueue } from '../../stores/checkinQueueStore'
import { useTheme } from '../../lib/ThemeContext'
import { AppText, Button, Card, Icon } from '../ui'

/** Obecności zapisane w telefonie bez zasięgu + informacja, że grafik jest z pamięci telefonu. */
export function PendingCheckinsBanner({ offline }: { offline?: boolean }) {
  const { colors: c } = useTheme()
  const profileId = useAuthStore(s => s.profile?.id)
  const items = useCheckinQueue(s => s.items).filter(x => x.profileId === profileId)
  const flushing = useCheckinQueue(s => s.flushing)
  if (!profileId || (!items.length && !offline)) return null
  const n = items.length
  const label = n === 1 ? '1 obecność czeka na wysłanie' : n >= 2 && n <= 4 ? `${n} obecności czekają na wysłanie` : `${n} obecności czeka na wysłanie`
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Icon name="cloud-off" size={20} color={c.goldInk} />
        <View style={styles.flex}>
          {n > 0 && <AppText variant="bodyStrong">{label}</AppText>}
          <AppText variant="small" muted>
            {n > 0
              ? `${items.map(x => `${x.title} ${x.time}`).join(', ')} · wyślemy automatycznie, gdy wróci internet.`
              : 'Brak internetu — grafik z pamięci telefonu. Obecność możesz potwierdzić, wyślemy ją później.'}
          </AppText>
        </View>
      </View>
      {n > 0 && (
        <Button compact label={flushing ? 'Wysyłanie…' : 'Wyślij teraz'} icon="send" variant="secondary" disabled={flushing}
          onPress={() => useCheckinQueue.getState().flush(profileId, { manual: true })} />
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  flex: { flex: 1, gap: 2 },
})
