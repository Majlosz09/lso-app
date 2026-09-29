import { useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif, VESTMENT_DOT } from '../../lib/theme'
import { NAV, NavItem, NavRole, PROFILE_HREF, ROLE_LABEL } from '../../lib/navigation'
import { useAuthStore } from '../../stores/authStore'
import { useLiturgyHeader } from '../../hooks/useLiturgyHeader'
import { NavBadges } from '../../hooks/useNavBadges'
import { AppText, Avatar, Button, Icon, Sheet } from '../ui'

const LOGO = require('../../assets/images/icon.png')

type Props = {
  role: NavRole
  active?: NavItem
  badges: NavBadges
}

/** Boczne menu wersji webowej (≥ 1024 px). */
export function Sidebar({ role, active, badges }: Props) {
  const router = useRouter()
  const { colors: c } = useTheme()
  const { profile, parish, signOut } = useAuthStore()
  const liturgy = useLiturgyHeader()
  const [confirmLogout, setConfirmLogout] = useState(false)

  return (
    <View style={[styles.root, { backgroundColor: c.sidebar }]}>
      <View style={styles.brand}>
        <Image source={LOGO} style={styles.logo} />
        <View style={styles.flex}>
          <AppText style={styles.brandName}>LSO App</AppText>
          <AppText style={[styles.parish, { color: c.sidebarMuted }]} numberOfLines={1}>
            {parish?.name ?? ''}
          </AppText>
        </View>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.nav}>
        {NAV[role].map(item => {
          const isActive = active?.key === item.key
          const count = item.badge ? badges[item.badge] ?? 0 : 0
          return (
            <Pressable
              key={item.key}
              accessibilityRole="link"
              accessibilityState={{ selected: isActive }}
              onPress={() => router.navigate(item.href as any)}
              style={({ hovered }: any) => [
                styles.item,
                isActive && styles.itemActive,
                hovered && !isActive && styles.itemHover,
              ]}
            >
              <Icon name={item.icon} size={20} color={isActive ? c.gold : c.sidebarMuted} filled={isActive} />
              <AppText style={[styles.itemText, { color: isActive ? '#FFFFFF' : c.sidebarText }]}>
                {item.label}
              </AppText>
              {count > 0 && (
                <View style={[styles.badge, { backgroundColor: c.gold }]}>
                  <AppText style={styles.badgeText}>{count > 99 ? '99+' : count}</AppText>
                </View>
              )}
            </Pressable>
          )
        })}
      </ScrollView>

      <View style={styles.dayCard}>
        <View style={styles.dayRow}>
          <View style={[styles.dot, { backgroundColor: VESTMENT_DOT[liturgy.color] }]} />
          <AppText variant="eyebrow" color={c.gold} style={styles.dayEyebrow} numberOfLines={1}>
            {liturgy.entry.typeLabel}
          </AppText>
        </View>
        <AppText style={styles.dayName} numberOfLines={2}>{liturgy.entry.name}</AppText>
      </View>

      <View style={styles.user}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Profil"
          onPress={() => router.navigate(PROFILE_HREF[role] as any)}
          style={styles.userMain}
        >
          <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size={36} />
          <View style={styles.flex}>
            <AppText style={styles.userName} numberOfLines={1}>{profile?.full_name ?? ''}</AppText>
            <AppText style={[styles.userRole, { color: c.sidebarMuted }]}>{ROLE_LABEL[role]}</AppText>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wyloguj"
          onPress={() => setConfirmLogout(true)}
          hitSlop={8}
          style={styles.logout}
        >
          <Icon name="logout" size={20} color={c.sidebarText} />
        </Pressable>
      </View>

      <Sheet
        visible={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Wylogować się?"
        footer={
          <>
            <Button label="Wyloguj" variant="danger" onPress={() => { setConfirmLogout(false); signOut() }} />
            <Button label="Anuluj" variant="secondary" onPress={() => setConfirmLogout(false)} />
          </>
        }
      >
        <AppText muted>Zawsze możesz zalogować się ponownie tym samym e-mailem i hasłem.</AppText>
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: 236, paddingVertical: 20, paddingHorizontal: 14, gap: 14 },
  flex: { flex: 1, minWidth: 0 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, marginBottom: 8 },
  logo: { width: 34, height: 34, borderRadius: 9 },
  brandName: { ...serif(), fontSize: 22, lineHeight: 24, color: '#FFFFFF' },
  parish: { ...sans(600), fontSize: 10, lineHeight: 13 },
  nav: { gap: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    cursor: 'pointer',
  } as any,
  itemActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  itemHover: { backgroundColor: 'rgba(255,255,255,0.05)' },
  itemText: { ...sans(700), fontSize: 13, flex: 1 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { ...sans(800), fontSize: 11, color: '#071C3A' },
  dayCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, gap: 4 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: '#C9A55A' },
  dayEyebrow: { fontSize: 10, flex: 1 },
  dayName: { ...sans(600), fontSize: 12, lineHeight: 16, color: '#DCE3EE' },
  user: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  userMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' } as any,
  userName: { ...sans(700), fontSize: 13, color: '#FFFFFF' },
  userRole: { ...sans(500), fontSize: 11 },
  logout: { padding: 6, cursor: 'pointer' } as any,
})
