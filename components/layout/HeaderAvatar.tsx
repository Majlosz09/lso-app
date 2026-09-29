import { Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../../stores/authStore'
import { useLiturgyHeader } from '../../hooks/useLiturgyHeader'
import { Avatar, Icon } from '../ui'

/** Avatar w prawym rogu nagłówka (telefon) → profil. */
export function HeaderAvatar({ href }: { href: string }) {
  const router = useRouter()
  const profile = useAuthStore(s => s.profile)
  const { palette } = useLiturgyHeader()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Profil"
      onPress={() => router.push(href as any)}
      hitSlop={8}
      style={{ marginRight: 16, borderRadius: 18, borderWidth: 2, borderColor: palette.chip }}
    >
      <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size={32} />
    </Pressable>
  )
}

/** „‹” w lewym rogu nagłówka ukrytych zakładek (Ogłoszenia, Wiedza, Profil…) na telefonie. */
export function HeaderBack({ fallback }: { fallback: string }) {
  const router = useRouter()
  const { palette } = useLiturgyHeader()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Wstecz"
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as any))}
      hitSlop={8}
      style={{ marginLeft: 8 }}
    >
      <Icon name="chevron-left" size={30} color={palette.fg} />
    </Pressable>
  )
}
