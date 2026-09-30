import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { announcementWhen } from '../announcements/AnnouncementsFeed'
import { AppNotification, NOTIFICATION_ICON, notificationHref, useNotificationsStore } from '../../stores/notificationsStore'
import { AppText, Button, Icon, Sheet } from '../ui'

/**
 * N3: dzwonek z licznikiem nieprzeczytanych + arkusz z listą powiadomień.
 * `tone="header"` — na kolorowym nagłówku (półprzezroczyste tło), domyślnie na jasnym pasku.
 */
export function NotificationBell({ tone = 'bar', fg }: { tone?: 'bar' | 'header'; fg?: string }) {
  const router = useRouter()
  const { colors: c } = useTheme()
  const profile = useAuthStore(s => s.profile)
  const { available, items, unread, load, markRead, markAllRead } = useNotificationsStore()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (profile?.id && useNotificationsStore.getState().profileId !== profile.id) load(profile.id)
  }, [profile?.id])

  if (!available || !profile) return null
  const role = profile.role === 'admin' || profile.is_admin ? 'admin' : profile.role === 'parent' ? 'parent' : 'member'

  const openItem = (n: AppNotification) => {
    markRead(n.id)
    setOpen(false)
    router.push(notificationHref(n, role) as any)
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={unread ? `Powiadomienia, ${unread} nowych` : 'Powiadomienia'}
        onPress={() => { setOpen(true); load(profile.id) }}
        style={({ hovered }: any) => [
          styles.bell,
          tone === 'header'
            ? { backgroundColor: 'rgba(255,255,255,0.16)' }
            : { borderWidth: 1, borderColor: c.inputBorder, backgroundColor: hovered ? c.highlight : c.surface },
        ]}
      >
        <Icon name="bell" size={20} color={tone === 'header' ? (fg ?? '#FFFFFF') : c.primary} />
        {unread > 0 && (
          <View style={[styles.badge, { backgroundColor: c.danger, borderColor: tone === 'header' ? 'transparent' : c.surface }]}>
            <AppText style={styles.badgeText}>{unread > 9 ? '9+' : unread}</AppText>
          </View>
        )}
      </Pressable>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Powiadomienia"
        eyebrow={unread ? `${unread} nowych` : 'Wszystko przeczytane'}
        footer={unread > 0 ? <Button label="Oznacz wszystkie jako przeczytane" icon="check-all" variant="secondary" onPress={markAllRead} /> : undefined}
      >
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="bell-sleep" size={36} color={c.iconMuted} />
            <AppText muted>Nie masz jeszcze powiadomień.</AppText>
          </View>
        ) : (
          <ScrollView style={styles.list} nestedScrollEnabled>
            {items.map((n, i) => (
              <Pressable
                key={n.id}
                onPress={() => openItem(n)}
                style={({ hovered }: any) => [
                  styles.row,
                  i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight },
                  (!n.read_at || hovered) && { backgroundColor: hovered ? c.highlight : c.goldSurface },
                ]}
              >
                <View style={[styles.iconTile, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <Icon name={NOTIFICATION_ICON[n.type] ?? 'bell'} size={18} color={c.goldInk} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>{n.title}</AppText>
                  {!!n.body && <AppText variant="small" muted numberOfLines={2}>{n.body}</AppText>}
                  <AppText style={[styles.when, { color: c.textTertiary }]}>{announcementWhen(n.created_at)}</AppText>
                </View>
                {!n.read_at && <View style={[styles.dot, { backgroundColor: c.primary }]} />}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  bell: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as any,
  badge: {
    position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  badgeText: { ...sans(800), fontSize: 10, color: '#FFFFFF', lineHeight: 12 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  list: { maxHeight: 460, marginHorizontal: -4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 12, cursor: 'pointer' } as any,
  iconTile: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  when: { ...sans(600), fontSize: 11, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5 },
})
