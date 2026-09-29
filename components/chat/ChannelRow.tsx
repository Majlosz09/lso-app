import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { ChatChannelListItem } from '../../types/chat'
import { AppText, Avatar, Icon } from '../ui'

interface Props {
  item: ChatChannelListItem
  onPress: () => void
  /** web: wybrana rozmowa (tło + złoty pasek) */
  selected?: boolean
  /** pierwszy wiersz listy — bez dzielnika */
  first?: boolean
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  }
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'wczoraj'
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
}

export function channelTitle(item: { type: string; name: string | null }): string {
  return item.type === 'group' ? `#${item.name ?? ''}` : (item.name ?? 'Wiadomość')
}

function ChannelRowComponent({ item, onPress, selected, first }: Props) {
  const { colors: c } = useTheme()
  const unread = item.unread_count > 0

  const preview = item.last_message_content === null
    ? 'Brak wiadomości'
    : item.last_message_type === 'poll'
      ? `Ankieta: ${item.last_message_content}`
      : item.last_message_content

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ hovered }: any) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: c.borderLight },
        { backgroundColor: selected ? c.goldSurface : hovered ? c.highlight : c.surface },
      ]}
    >
      {selected && <View style={[styles.selBar, { backgroundColor: c.gold }]} />}
      {item.type === 'group' ? (
        <View style={[styles.avatar, { backgroundColor: c.primary }]}>
          <Icon name="account-group" size={22} color={c.gold} filled />
        </View>
      ) : (
        <Avatar name={item.name} size={44} color={c.primary} textColor={c.gold} />
      )}
      <View style={styles.content}>
        <View style={styles.top}>
          <AppText style={[styles.name, { color: c.text }]} numberOfLines={1}>{channelTitle(item)}</AppText>
          {item.last_message_at && (
            <AppText style={[styles.time, { color: c.subtext }]}>{formatTime(item.last_message_at)}</AppText>
          )}
        </View>
        <View style={styles.bottom}>
          <AppText
            style={[styles.preview, { color: unread ? c.text : c.subtext }, unread && sans(700)]}
            numberOfLines={1}
          >
            {preview}
          </AppText>
          {unread && (
            <View style={[styles.badge, { backgroundColor: c.gold }]}>
              <AppText style={styles.badgeText}>{item.unread_count > 99 ? '99+' : item.unread_count}</AppText>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  )
}

export const ChannelRow = memo(ChannelRowComponent)

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12, cursor: 'pointer' } as any,
  selBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, minWidth: 0, gap: 2 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { ...sans(800), fontSize: 15, flex: 1 },
  time: { ...sans(600), fontSize: 11 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  preview: { ...sans(500), fontSize: 13, flex: 1 },
  badge: { borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#071C3A', ...sans(800), fontSize: 11 },
})
