// Nawigacja redesignu v2: menu sidebaru (web ≥ 1024 px) i tytuły topbaru per rola.

export type NavRole = 'member' | 'admin' | 'parent'
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
    { key: 'members', label: 'Członkowie', icon: 'account-group', href: '/(admin)/(admin-tabs)/members', paths: ['/members', '/member-detail', '/rank-assignment'], badge: 'pending' },
    { key: 'excuses', label: 'Zgłoszenia', icon: 'calendar-remove', href: '/(admin)/absence-requests', paths: ['/absence-requests'], badge: 'excuses' },
    { key: 'points', label: 'Punkty', icon: 'trophy', href: '/(admin)/(admin-tabs)/points', paths: ['/points', '/award-points', '/badge-management'] },
    { key: 'statistics', label: 'Statystyki', icon: 'chart-bar', href: '/(admin)/statistics', paths: ['/statistics'] },
    { key: 'announcements', label: 'Ogłoszenia', icon: 'bullhorn', href: '/(admin)/(admin-tabs)/announcements', paths: ['/announcements'] },
    { key: 'chat', label: 'Czat', icon: 'forum', href: '/(admin)/(admin-tabs)/chat', paths: ['/chat', '/chat-reports'], badge: 'chat' },
    { key: 'settings', label: 'Ustawienia parafii', icon: 'cog', href: '/(admin)/parish-settings', paths: ['/parish-settings', '/mass-schedule', '/churches', '/point-rules', '/rank-management', '/wiedza-admin'] },
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
  parent: '/(parent)/(parent-tabs)/profile',
}

export const ROLE_LABEL: Record<NavRole, string> = {
  member: 'Ministrant',
  admin: 'Opiekun LSO',
  parent: 'Rodzic',
}

/** Rola nawigacji: admin = opiekun (także ministrant z prawami admina w panelu). */
export function navRoleFor(profile: { role?: string | null } | null | undefined, inAdminArea: boolean): NavRole {
  if (profile?.role === 'parent') return 'parent'
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
}

export function equivalentRoute(role: NavRole, pathname: string): string {
  const g = GROUP_ROUTES[role]
  return g.paths.includes(pathname) ? `${g.base}${pathname}` : g.base
}
