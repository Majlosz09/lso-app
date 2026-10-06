import { StyleSheet, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { pl, weekdayShortDate } from '../../lib/dates'
import { AppText, Button, Segmented, Sheet } from '../ui'

export type RozkladPolicy = 'move' | 'cancel' | 'keep'
export type RozkladChange = {
  date: string
  time: string
  title: string
  people: string[]
  action: 'move' | 'cancel' | 'keep'
  to_time: string | null
}

const POLICY_HINT: Record<RozkladPolicy, string> = {
  move: 'Zapisani przechodzą na godzinę, która zastępuje dotychczasową (albo najbliższą tego dnia). Dostaną powiadomienie.',
  cancel: 'Zapisy zostaną odwołane, ministranci (i rodzice) dostaną powiadomienie.',
  keep: 'Służby z zapisami zostaną w grafiku jako dodatkowe — nic się nie zmieni dla zapisanych.',
}

type Props = {
  visible: boolean
  changes: RozkladChange[]
  policy: RozkladPolicy
  onPolicy: (p: RozkladPolicy) => void
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}

/** Podgląd skutków zmiany rozkładu: kogo dotyczy i co się stanie z zapisami. */
export function RozkladPreviewSheet({ visible, changes, policy, onPolicy, loading, onConfirm, onClose }: Props) {
  const { colors: c } = useTheme()
  const people = changes.reduce((n, ch) => n + ch.people.length, 0)
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow="Zmiana rozkładu"
      title={`${people} ${pl(people, ['zapis', 'zapisy', 'zapisów'])} na godzinach, które się zmieniają`}
      footer={<Button label="Zapisz zmiany" icon="check" onPress={onConfirm} loading={loading} />}
    >
      <Segmented<RozkladPolicy>
        options={[{ value: 'move', label: 'Przenieś' }, { value: 'cancel', label: 'Odwołaj' }, { value: 'keep', label: 'Zostaw' }]}
        value={policy}
        onChange={onPolicy}
      />
      <AppText variant="small" muted>{POLICY_HINT[policy]}</AppText>
      <View style={styles.list}>
        {changes.map((ch, i) => (
          <View key={`${ch.date}-${ch.time}-${i}`} style={[styles.item, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <AppText variant="bodyStrong">
              {`${weekdayShortDate(ch.date)} · ${ch.time}`}
              <AppText variant="bodyStrong" color={ch.action === 'move' ? c.success : ch.action === 'cancel' ? c.danger : c.subtext}>
                {ch.action === 'move' ? `  →  ${ch.to_time}` : ch.action === 'cancel' ? '  · odwołana' : '  · zostaje'}
              </AppText>
            </AppText>
            <AppText variant="small" muted>{`${ch.title} — ${ch.people.join(', ')}`}</AppText>
          </View>
        ))}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  item: { paddingVertical: 8, gap: 2 },
})
