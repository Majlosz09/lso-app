import { activeNavItem, isRootPath, NAV, navRoleFor, topbarTitle } from '../../lib/navigation'

describe('navigation', () => {
  it('menus per role match the handoff', () => {
    expect(NAV.member.map(i => i.label)).toEqual(['Pulpit', 'Grafik', 'Punkty', 'Czat', 'Ogłoszenia', 'Wiedza'])
    expect(NAV.admin.map(i => i.label)).toEqual([
      'Pulpit', 'Grafik', 'Członkowie', 'Usprawiedliwienia', 'Punkty', 'Statystyki', 'Ogłoszenia', 'Czat', 'Ustawienia parafii',
    ])
    expect(NAV.parent.map(i => i.label)).toEqual(['Dom', 'Dyżury dzieci', 'Punkty', 'Ogłoszenia', 'Czat'])
  })

  it('navRoleFor: parent > admin/admin-area > member', () => {
    expect(navRoleFor({ role: 'parent' }, true)).toBe('parent')
    expect(navRoleFor({ role: 'admin' }, false)).toBe('admin')
    expect(navRoleFor({ role: 'member' }, true)).toBe('admin') // ministrant z prawami admina w panelu
    expect(navRoleFor({ role: 'member' }, false)).toBe('member')
    expect(navRoleFor(null, false)).toBe('member')
  })

  it('highlights parent menu item for sub-pages', () => {
    expect(activeNavItem('admin', '/member-detail')?.key).toBe('members')
    expect(activeNavItem('admin', '/point-rules')?.key).toBe('settings')
    expect(activeNavItem('member', '/chat/abc-123')?.key).toBe('chat')
    expect(activeNavItem('member', '/wiedza/szaty')?.key).toBe('wiedza')
    expect(activeNavItem('member', '/')?.key).toBe('home')
  })

  it('topbar titles', () => {
    expect(topbarTitle('admin', '/')).toBe('Pulpit opiekuna')
    expect(topbarTitle('parent', '/schedule')).toBe('Dyżury dzieci')
    expect(topbarTitle('member', '/schedule')).toBe('Grafik')
    expect(topbarTitle('admin', '/schedule-form')).toBe('Nowa służba')
    expect(topbarTitle('member', '/chat/xyz')).toBe('Czat')
  })

  it('root vs sub-page (back button)', () => {
    expect(isRootPath('admin', '/statistics')).toBe(true)
    expect(isRootPath('admin', '/member-detail')).toBe(false)
    expect(isRootPath('member', '/')).toBe(true)
  })
})
