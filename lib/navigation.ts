// Nawigacja redesignu v2: menu sidebaru (web ≥ 1024 px) i tytuły topbaru per rola.
import { Platform } from 'react-native'

export type NavRole = 'member' | 'admin' | 'parent' | 'helper'
export type BadgeKey = 'chat' | 'pending' | 'excuses' | 'announcements'

export type NavItem = {
  key: string
  label: string
  icon: string
  href: string
  /** ścieżki (usePathname, bez grup) podświetlające tę pozycję */
  paths: string[]
  badge?: BadgeKey
}

export const NAV: Record<NavRole, NavItem[]> = {
  member: [
    { key: 'home', label: 'Pulpit', icon: 'view-dashboard', href: '/(tabs)', paths: ['/'] },
    { key: 'schedule', label: 'Grafik', icon: 'calendar-month', href: '/(tabs)/schedule', paths: ['/schedule', '/attendance', '/service'] },
    { key: 'points', label: 'Punkty', icon: 'trophy', href: '/(tabs)/points', paths: ['/points', '/badge-catalog', '/member-profile'] },
    { key: 'chat', label: 'Czat', icon: 'forum', href: '/(tabs)/chat', paths: ['/chat'], badge: 'chat' },
    { key: 'announcements', label: 'Ogłoszenia', icon: 'bullhorn', href: '/(tabs)/announcements', paths: ['/announcements'], badge: 'announcements' },
    { key: 'wiedza', label: 'Wiedza', icon: 'book-open-variant', href: '/(tabs)/wiedza', paths: ['/wiedza'] },
  ],
  admin: [
    { key: 'home', label: 'Pulpit', icon: 'view-dashboard', href: '/(admin)/(admin-tabs)', paths: ['/'] },
    { key: 'schedules', label: 'Grafik', icon: 'calendar-month', href: '/(admin)/(admin-tabs)/schedules', paths: ['/schedules', '/schedule-detail', '/schedule-form', '/schedule-series', '/schedule-day', '/recurring-assignments', '/auto-schedule'] },
    { key: 'members', label: 'Członkowie', icon: 'account-group', href: '/(admin)/(admin-tabs)/members', paths: ['/members', '/member-detail', '/rank-assignment', '/import-members', '/promotions'], badge: 'pending' },
    { key: 'excuses', label: 'Zgłoszenia', icon: 'calendar-remove', href: '/(admin)/absence-requests', paths: ['/absence-requests'], badge: 'excuses' },
    { key: 'points', label: 'Punkty', icon: 'trophy', href: '/(admin)/(admin-tabs)/points', paths: ['/points', '/award-points', '/badge-management', '/challenges'] },
    { key: 'statistics', label: 'Statystyki', icon: 'chart-bar', href: '/(admin)/statistics', paths: ['/statistics', '/monthly-report'] },
    { key: 'announcements', label: 'Ogłoszenia', icon: 'bullhorn', href: '/(admin)/(admin-tabs)/announcements', paths: ['/announcements'] },
    { key: 'chat', label: 'Czat', icon: 'forum', href: '/(admin)/(admin-tabs)/chat', paths: ['/chat', '/chat-reports'], badge: 'chat' },
    { key: 'wiedza', label: 'Wiedza', icon: 'book-open-variant', href: '/(admin)/wiedza', paths: ['/wiedza'] },
    { key: 'settings', label: 'Ustawienia parafii', icon: 'cog', href: '/(admin)/parish-settings', paths: ['/parish-settings', '/mass-schedule', '/churches', '/functions', '/point-rules', '/rank-management', '/wiedza-admin'] },
  ],
  helper: [
    { key: 'schedules', label: 'Grafik', icon: 'calendar-month', href: '/(admin)/(admin-tabs)/schedules', paths: ['/schedules', '/schedule-detail', '/schedule-form', '/schedule-series', '/schedule-day', '/recurring-assignments', '/auto-schedule'] },
    { key: 'excuses', label: 'Zgłoszenia', icon: 'calendar-remove', href: '/(admin)/absence-requests', paths: ['/absence-requests'], badge: 'excuses' },
    { key: 'kiosk', label: 'Tryb zakrystii', icon: 'tablet', href: '/(admin)/kiosk', paths: ['/kiosk'] },
    { key: 'back', label: 'Moja służba', icon: 'arrow-left', href: '/(tabs)', paths: [] },
  ],
  parent: [
    { key: 'home', label: 'Dom', icon: 'home', href: '/(parent)/(parent-tabs)', paths: ['/'] },
    { key: 'schedule', label: 'Dyżury dzieci', icon: 'calendar-month', href: '/(parent)/(parent-tabs)/schedule', paths: ['/schedule'] },
    { key: 'points', label: 'Punkty', icon: 'trophy', href: '/(parent)/(parent-tabs)/points', paths: ['/points', '/member-profile'] },
    { key: 'announcements', label: 'Ogłoszenia', icon: 'bullhorn', href: '/(parent)/(parent-tabs)/announcements', paths: ['/announcements'], badge: 'announcements' },
    { key: 'chat', label: 'Czat', icon: 'forum', href: '/(parent)/(parent-tabs)/chat', paths: ['/chat'], badge: 'chat' },
  ],
}

export const PROFILE_HREF: Record<NavRole, string> = {
  member: '/(tabs)/profile',
  admin: '/(admin)/(admin-tabs)/profile',
  helper: '/(tabs)/profile',
  parent: '/(parent)/(parent-tabs)/profile',
}

export const ROLE_LABEL: Record<NavRole, string> = {
  member: 'Ministrant',
  admin: 'Opiekun LSO',
  helper: 'Pomocnik opiekuna',
  parent: 'Rodzic',
}

/** Rola nawigacji: admin = opiekun (także ministrant z prawami admina w panelu); helper = pomocnik w panelu. */
export function navRoleFor(
  profile: { role?: string | null; is_admin?: boolean | null; is_helper?: boolean | null } | null | undefined,
  inAdminArea: boolean,
): NavRole {
  if (profile?.role === 'parent') return 'parent'
  if (inAdminArea && profile?.role === 'member' && !profile.is_admin && profile.is_helper) return 'helper'
  if (profile?.role === 'admin' || inAdminArea) return 'admin'
  return 'member'
}

/** Czy ścieżka należy do pozycji menu (dokładnie albo jako podstrona). */
export function matchesPath(item: NavItem, pathname: string): boolean {
  return item.paths.some(p =>
    p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(p + '/'),
  )
}

export function activeNavItem(role: NavRole, pathname: string): NavItem | undefined {
  // najpierw dokładne dopasowanie (np. „/points” u opiekuna), potem prefiksy
  const items = NAV[role]
  return items.find(i => i.paths.includes(pathname)) ?? items.find(i => matchesPath(i, pathname))
}

// Tytuły topbaru dla podstron spoza menu
const EXTRA_TITLES: Record<string, string> = {
  '/profile': 'Profil',
  '/badge-catalog': 'Katalog odznak',
  '/member-profile': 'Profil ministranta',
  '/member-detail': 'Profil członka',
  '/schedule-detail': 'Służba',
  '/schedule-form': 'Nowa służba',
  '/schedule-series': 'Cykl służb',
  '/schedule-day': 'Służby w dniu',
  '/recurring-assignments': 'Stałe dyżury',
  '/award-points': 'Przyznaj punkty',
  '/badge-management': 'Odznaki',
  '/rank-assignment': 'Przydziel rangi',
  '/rank-management': 'Rangi',
  '/mass-schedule': 'Rozkład Mszy',
  '/churches': 'Kościoły i kaplice',
  '/kiosk': 'Tryb zakrystii',
  '/auto-schedule': 'Ułóż grafik',
  '/functions': 'Funkcje liturgiczne',
  '/import-members': 'Dodaj ministrantów',
  '/promotions': 'Gotowi do awansu',
  '/challenges': 'Wyzwania sezonowe',
  '/monthly-report': 'Raport miesięczny',
  '/point-rules': 'Reguły punktów',
  '/wiedza-admin': 'Wiedza parafii',
  '/chat-reports': 'Zgłoszenia z czatu',
  '/chat/new-dm': 'Nowa wiadomość',
  '/attendance': 'Obecność',
  '/service': 'Służba',
}

const HOME_TITLE: Record<NavRole, string> = {
  member: 'Pulpit',
  admin: 'Pulpit opiekuna',
  helper: 'Grafik',
  parent: 'Dom',
}

export function topbarTitle(role: NavRole, pathname: string): string {
  if (pathname === '/') return HOME_TITLE[role]
  if (EXTRA_TITLES[pathname]) return EXTRA_TITLES[pathname]
  if (pathname.startsWith('/chat/')) return 'Czat'
  if (pathname.startsWith('/wiedza/')) return 'Wiedza'
  return activeNavItem(role, pathname)?.label ?? 'LSO App'
}

/** Pozycja główna menu (bez „Wstecz”) vs podstrona. */
export function isRootPath(role: NavRole, pathname: string): boolean {
  return pathname === '/' || NAV[role].some(i => i.paths[0] === pathname)
}

// ── Ta sama podstrona w grupie właściwej dla roli ─────────────────────────
// Adresy bez grup są niejednoznaczne (np. „/schedule” istnieje u ministranta i u rodzica),
// więc po odświeżeniu strony router może trafić do cudzej grupy. Zamiast wyrzucać na start,
// przenosimy do odpowiednika w grupie użytkownika.
const GROUP_ROUTES: Record<NavRole, { base: string; paths: string[] }> = {
  member: {
    base: '/(tabs)',
    paths: ['/schedule', '/points', '/chat', '/announcements', '/profile', '/wiedza', '/badge-catalog', '/member-profile', '/attendance', '/service'],
  },
  parent: {
    base: '/(parent)/(parent-tabs)',
    paths: ['/schedule', '/points', '/chat', '/announcements', '/profile'],
  },
  admin: {
    base: '/(admin)/(admin-tabs)',
    paths: ['/schedules', '/members', '/points', '/chat', '/announcements', '/profile'],
  },
  helper: {
    base: '/(admin)/(admin-tabs)/schedules',
    paths: [],
  },
}

/** Ekrany panelu opiekuna dostępne dla pomocnika. */
export const HELPER_PATHS = ['/schedules', '/schedule-detail', '/schedule-form', '/schedule-series', '/schedule-day', '/recurring-assignments', '/auto-schedule', '/absence-requests', '/kiosk']
export const helperAllowed = (pathname: string) => HELPER_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

/**
 * Odpowiednik bieżącego adresu w panelu danej roli — do przekierowań w strażnikach paneli.
 * Web: adresy jak /points, /chat, /profile są w kilku panelach naraz; po odświeżeniu expo-router 57
 * dopasowuje je najpierw do innego panelu i przepisuje adres na „/”, zanim strażnik zadziała.
 */
// Adres strony w chwili jej otwarcia (web) — zapamiętany przy starcie, zanim expo-router go przepisze.
const initialWebUrl: { path: string; search: string } | null =
  Platform.OS === 'web' && typeof window !== 'undefined' && window.location
    ? { path: window.location.pathname, search: window.location.search ?? '' }
    : null
let initialUsed = false

export function redirectForRole(role: NavRole, pathname: string): string {
  // pierwsze przekierowanie po otwarciu / odświeżeniu strony: adres, który wpisał użytkownik
  if (initialWebUrl && !initialUsed) {
    initialUsed = true
    const target = equivalentRoute(role, initialWebUrl.path)
    return target !== GROUP_ROUTES[role].base ? target + initialWebUrl.search : target
  }
  return equivalentRoute(role, pathname)
}

export function equivalentRoute(role: NavRole, pathname: string): string {
  // ekrany panelu opiekuna poza zakładkami, które mają odpowiednik u ministranta
  if (role === 'admin' && pathname === '/wiedza') return '/(admin)/wiedza'
  const g = GROUP_ROUTES[role]
  return g.paths.includes(pathname) ? `${g.base}${pathname}` : g.base
}
