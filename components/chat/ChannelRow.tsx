import { memo, useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ChatChannelListItem } from '../../types/chat'

interface Props {
  item: ChatChannelListItem
  onPress: () => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
}

function ChannelRowComponent({ item, onPress }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const preview = item.last_message_content === null
    ? 'Brak wiadomości'
    : item.last_message_type === 'poll'
      ? '📊 Ankieta'
      : item.last_message_content

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Ionicons
          name={item.type === 'group' ? 'people' : 'person'}
          size={22}
          color={c.primary}
        />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.channelName} numberOfLines={1}>
            {item.type === 'group' ? `#${item.name}` : item.name}
          </Text>
          {item.last_message_at && (
            <Text style={styles.time}>{formatTime(item.last_message_at)}</Text>
          )}
        </View>
        <View style={styles.rowBottom}>
          <Text
            style={[styles.preview, item.unread_count > 0 && styles.previewUnread]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {item.unread_count > 0 && (
            <View style={[styles.badge, { backgroundColor: c.primary }]}>
              <Text style={styles.badgeText}>
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

export const ChannelRow = memo(ChannelRowComponent)

function createStyles(c: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.surface, borderRadius: 12,
      padding: 12, gap: 12,
    },
    avatar: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: c.primary + '18',
      justifyContent: 'center', alignItems: 'center',
    },
    rowContent: { flex: 1 },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    channelName: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1 },
    time: { fontSize: 12, color: c.subtext, marginLeft: 8 },
    rowBottom: { flexDirection: 'row', alignItems: 'center' },
    preview: { fontSize: 13, color: c.subtext, flex: 1 },
    previewUnread: { color: c.text, fontWeight: '500' },
    badge: {
      borderRadius: 10, minWidth: 20, height: 20,
      justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 5, marginLeft: 8,
    },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  })
}
