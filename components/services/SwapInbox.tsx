import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { useTheme } from '../../lib/ThemeContext'
import { dayShort, relativeDay, shortDate } from '../../lib/dates'
import { useSwapStore } from '../../stores/swapStore'
import { AppText, Avatar, Button, Card, Icon } from '../ui'

/** N4: prośby o zamianę skierowane do mnie — przyjmij (przejmuję dyżur) / odrzuć. */
export function SwapInbox({ onChanged }: { onChanged?: () => void }) {
  const { colors: c } = useTheme()
  const incoming = useSwapStore(s => s.incoming)
  const [busy, setBusy] = useState<string | null>(null)
  if (!incoming.length) return null

  const respond = async (id: string, accept: boolean, name: string) => {
    setBusy(id + accept)
    const err = await useSwapStore.getState().respond(id, accept)
    setBusy(null)
    if (err) { Toast.show({ type: 'error', text1: 'Nie udało się', text2: err }); return }
    Toast.show(accept
      ? { type: 'success', text1: 'Dyżur przejęty', text2: `Zastępujesz: ${name}` }
      : { type: 'info', text1: 'Prośba odrzucona', text2: name })
    onChanged?.()
  }

  return (
    <Card large style={[styles.card, { borderColor: c.gold }]}>
      <View style={styles.head}>
        <Icon name="swap-horizontal" size={20} color={c.goldInk} />
        <AppText variant="eyebrow" color={c.goldInk} style={styles.flex}>
          {incoming.length === 1 ? 'Prośba o zamianę' : `Prośby o zamianę (${incoming.length})`}
        </AppText>
      </View>
      {incoming.map((o, i) => (
        <View key={o.id} style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
          <View style={styles.row}>
            <Avatar name={o.fromName} size={38} color={c.primary} textColor={c.gold} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong" numberOfLines={1}>{`${o.fromName} prosi o zastępstwo`}</AppText>
              <AppText variant="small" muted>{`${o.title} · ${dayShort(o.date)} ${shortDate(o.date)} ${o.time} (${relativeDay(o.date)})`}</AppText>
              {!!o.message && <AppText variant="small" style={{ color: c.text }}>{`„${o.message}”`}</AppText>}
            </View>
          </View>
          <View style={styles.row}>
            <Button label="Odrzuć" variant="secondary" compact style={styles.flex} loading={busy === o.id + false} onPress={() => respond(o.id, false, o.fromName)} />
            <Button label="Przejmuję" icon="check" compact style={styles.flex} loading={busy === o.id + true} onPress={() => respond(o.id, true, o.fromName)} />
          </View>
        </View>
      ))}
    </Card>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { gap: 4, borderWidth: 1.5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  item: { gap: 10, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
})
