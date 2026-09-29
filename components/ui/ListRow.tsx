import { ReactNode } from 'react'
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { AppText } from './AppText'
import { Icon } from './Icon'

type Props = {
  title: string
  subtitle?: string
  /** ikona po lewej w złotym kafelku */
  icon?: string
  iconColor?: string
  iconBg?: string
  /** własny element po lewej (np. Avatar) — zamiast ikony */
  left?: ReactNode
  /** własny element po prawej — domyślnie chevron, jeśli jest onPress */
  right?: ReactNode
  onPress?: () => void
  /** pierwszy wiersz w karcie — bez górnego dzielnika */
  first?: boolean
  /** wybrany element (web): tło highlight + złoty pasek z lewej */
  selected?: boolean
  destructive?: boolean
  style?: StyleProp<ViewStyle>
}

export function ListRow({
  title, subtitle, icon, iconColor, iconBg, left, right, onPress, first, selected, destructive, style,
}: Props) {
  const { colors: c } = useTheme()
  const content = (
    <>
      {selected && <View style={[styles.selBar, { backgroundColor: c.gold }]} />}
      {left ?? (icon ? (
        <View style={[styles.iconTile, { backgroundColor: iconBg ?? c.goldSurface }]}>
          <Icon name={icon} size={20} color={iconColor ?? (destructive ? c.danger : c.goldInk)} />
        </View>
      ) : null)}
      <View style={styles.body}>
        <AppText variant="bodyStrong" color={destructive ? c.danger : c.text} numberOfLines={2}>{title}</AppText>
        {!!subtitle && <AppText variant="small" muted numberOfLines={2}>{subtitle}</AppText>}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={22} color={c.iconMuted} /> : null)}
    </>
  )
  const rowStyle = [
    styles.row,
    { borderTopColor: first ? 'transparent' : c.borderLight },
    selected && { backgroundColor: c.highlight },
    style,
  ]
  if (!onPress) return <View style={rowStyle}>{content}</View>
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed, hovered }: any) => [rowStyle, (pressed || hovered) && !selected && { backgroundColor: c.highlight }]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    cursor: 'pointer',
  } as any,
  iconTile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  selBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
})
