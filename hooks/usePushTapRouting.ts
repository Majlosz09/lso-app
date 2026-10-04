import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../stores/authStore'
import { notificationHref } from '../stores/notificationsStore'

/** Kliknięcie w powiadomienie push otwiera właściwy ekran (tak jak wpis w dzwonku). */
export function usePushTapRouting() {
  const router = useRouter()
  const profile = useAuthStore(s => s.profile)
  const handled = useRef<string | null>(null)

  useEffect(() => {
    if (Platform.OS === 'web' || !profile?.id || !profile.approved) return
    const role = profile.role === 'admin' || profile.is_admin ? 'admin' : profile.role === 'parent' ? 'parent' : 'member'

    const open = (resp: Notifications.NotificationResponse | null) => {
      if (!resp) return
      const id = resp.notification.request.identifier
      if (handled.current === id) return
      handled.current = id
      const data = (resp.notification.request.content.data ?? {}) as Record<string, any>
      if (!data.type) return // starsze powiadomienia bez typu — samo otwarcie aplikacji
      router.push(notificationHref({ type: data.type, data } as any, role) as any)
    }

    // aplikacja uruchomiona kliknięciem w powiadomienie
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {})
    const sub = Notifications.addNotificationResponseReceivedListener(open)
    return () => sub.remove()
  }, [profile?.id, profile?.approved, profile?.role, profile?.is_admin])
}
