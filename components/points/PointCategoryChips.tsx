import { StyleSheet, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import type { PointCategory } from '../../hooks/usePointCategories'
import { AppText, Chip, Icon } from '../ui'

/** Punktacja służby: reguły domyślne albo własna kategoria parafii. Ukryte, gdy parafia nie ma kategorii. */
export function PointCategoryChips({ categories, value, onChange, label = true }: {
  categories: PointCategory[]
  value: string | null | undefined
  onChange: (id: string | null) => void
  /** podpis „Punktacja” nad chipami (w edytorze rozkładu — ikona w rzędzie) */
  label?: boolean
}) {
  const { colors: c } = useTheme()
  if (!categories.length) return null
  const chips = (
    <View style={styles.chips}>
      {!label && <Icon name="star-circle" size={16} color={c.subtext} />}
      <Chip label="Wg reguł" selected={!value} onPress={() => onChange(null)} />
      {categories.map(cat => (
        <Chip key={cat.id} icon={cat.icon} label={`${cat.name} · ${cat.points} pkt`} selected={value === cat.id} onPress={() => onChange(cat.id)} />
      ))}
    </View>
  )
  if (!label) return chips
  return (
    <View style={styles.group}>
      <AppText variant="label" muted>Punktacja</AppText>
      {chips}
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
})
