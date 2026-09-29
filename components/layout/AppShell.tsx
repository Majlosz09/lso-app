import { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { usePathname, useRouter, useSegments } from 'expo-router'
import { useTheme } from '../../lib/ThemeContext'
import { useAuthStore } from '../../stores/authStore'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useNavBadges } from '../../hooks/useNavBadges'
import { activeNavItem, isRootPath, NAV, navRoleFor, topbarTitle } from '../../lib/navigation'
import { Sidebar } from './Sidebar'
import { Topbar, todayLabel } from './Topbar'

/**
 * Rama aplikacji. Na telefonie i wąskim oknie przezroczysta (dolne paski robią nawigację).
 * Na webie ≥ 1024 px po zalogowaniu: sidebar 236 px + topbar 76 px + treść.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop()
  const segments = useSegments()
  const pathname = usePathname()
  const router = useRouter()
  const { colors: c } = useTheme()
  const { session, profile } = useAuthStore()

  const inAuth = segments[0] === '(auth)'
  const ready = isDesktop && !!session && !!profile?.parish_id && profile.approved !== false && !inAuth
  const role = navRoleFor(profile, segments[0] === '(admin)')
  const badges = useNavBadges(role, ready)

  if (!ready) return <>{children}</>

  const active = activeNavItem(role, pathname)
  const root = isRootPath(role, pathname)
  const goBack = () => {
    if (router.canGoBack()) router.back()
    else router.navigate((active?.href ?? NAV[role][0].href) as any)
  }

  return (
    <View style={[styles.frame, { backgroundColor: c.bg }]}>
      <Sidebar role={role} active={active} badges={badges} />
      <View style={styles.main}>
        <Topbar
          title={role === 'member' && pathname === '/' ? `Dzień dobry, ${(profile?.full_name ?? '').split(' ')[0]}` : topbarTitle(role, pathname)}
          subtitle={`${profile?.full_name ?? ''} · ${todayLabel()}`}
          onBack={root ? undefined : goBack}
        />
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { flex: 1, flexDirection: 'row' },
  main: { flex: 1, minWidth: 0 },
  content: { flex: 1, minHeight: 0 },
})
