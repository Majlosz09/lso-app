import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../../../stores/authStore'
import { useTheme } from '../../../lib/ThemeContext'
import { sans, serif } from '../../../lib/theme'
import { dayMonth, dayShort, localDateStr, pl, shortDate } from '../../../lib/dates'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { useLiturgyHeader } from '../../../hooks/useLiturgyHeader'
import { useAdminDashboard } from '../../../hooks/useAdminDashboard'
import { WeekChart } from '../../../components/admin/WeekChart'
import { MonthCalendar } from '../../../components/admin/MonthCalendar'
import { AppText, Avatar, Card, Icon, ListRow, SectionHeader } from '../../../components/ui'
import { NotificationBell } from '../../../components/layout/NotificationBell'
import { TourTarget, tourRef } from '../../../components/tour/TourTarget'
import { topGap } from '../../../lib/safeTop'

export default function AdminHome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const { profile } = useAuthStore()
  const liturgy = useLiturgyHeader()
  const pal = liturgy.palette
  const { data, reload } = useAdminDashboard()
  const [refreshing, setRefreshing] = useState(false)
  const go = (href: string) => router.push(href as any)

  // ── „Wymaga uwagi” / „Do zrobienia” ──────────────────────────────────────
  const todo = data ? [
    data.excuses.count > 0 && {
      key: 'ex', icon: 'calendar-remove', tone: 'danger',
      title: `${data.excuses.count} ${pl(data.excuses.count, ['usprawiedliwienie', 'usprawiedliwienia', 'usprawiedliwień'])}`,
      sub: data.excuses.names.slice(0, 4).join(', '), href: '/(admin)/absence-requests',
    },
    data.promotions.count > 0 && {
      key: 'pr', icon: 'arrow-up-bold-circle', tone: 'gold',
      title: `${data.promotions.count} ${pl(data.promotions.count, ['osoba gotowa', 'osoby gotowe', 'osób gotowych'])} do awansu`,
      sub: data.promotions.names.slice(0, 4).join(', '), href: '/(admin)/promotions',
    },
    data.attendanceReports.count > 0 && {
      key: 'ar', icon: 'account-question', tone: 'gold',
      title: `${data.attendanceReports.count} ${pl(data.attendanceReports.count, ['zgłoszenie', 'zgłoszenia', 'zgłoszeń'])} obecności`,
      sub: data.attendanceReports.names.slice(0, 4).join(', '), href: '/(admin)/absence-requests?tab=reports',
    },
    data.pending.count > 0 && {
      key: 'pe', icon: 'account-plus', tone: 'gold',
      title: `${data.pending.count} ${pl(data.pending.count, ['osoba', 'osoby', 'osób'])} do zatwierdzenia`,
      sub: 'Nowe konta z kodu zaproszenia', href: '/(admin)/(admin-tabs)/members',
    },
    data.unstaffed7 > 0 && {
      key: 'un', icon: 'alert', tone: 'danger',
      title: `${data.unstaffed7} ${pl(data.unstaffed7, ['służba', 'służby', 'służb'])} bez obsady`,
      sub: data.firstUnstaffed ? `Najbliższa: ${dayShort(data.firstUnstaffed.date)} ${shortDate(data.firstUnstaffed.date)} · ${data.firstUnstaffed.time}` : '',
      href: '/(admin)/(admin-tabs)/schedules',
    },
    data.reports > 0 && {
      key: 're', icon: 'flag', tone: 'gold',
      title: `${data.reports} ${pl(data.reports, ['zgłoszenie', 'zgłoszenia', 'zgłoszeń'])} z czatu`,
      sub: 'Wiadomości do przejrzenia', href: '/(admin)/chat-reports',
    },
  ].filter(Boolean) as { key: string; icon: string; tone: string; title: string; sub: string; href: string }[] : []

  const todoCard = (
    <Card flush>
      <View style={styles.cardHead}><AppText variant="eyebrow" color={c.goldInk}>{isDesktop ? 'Do zrobienia' : 'Wymaga uwagi'}</AppText></View>
      {todo.length === 0 ? (
        <ListRow first icon="check-circle" iconColor={c.success} iconBg={c.successSurface} title="Wszystko ogarnięte" subtitle="Brak spraw do rozpatrzenia" />
      ) : todo.map((t, i) => (
        <ListRow
          key={t.key}
          first={i === 0}
          icon={t.icon}
          iconColor={t.tone === 'danger' ? c.danger : c.goldInk}
          iconBg={t.tone === 'danger' ? c.dangerSurface : c.goldSurface}
          title={t.title}
          subtitle={t.sub}
          onPress={() => go(t.href)}
        />
      ))}
    </Card>
  )

  const weekCard = (
    <Card large style={styles.pad18}>
      <View style={styles.rowBetween}>
        {isDesktop
          ? <AppText variant="eyebrow" color={c.goldInk}>Obsada tygodnia</AppText>
          : <AppText variant="title">Obsada tygodnia</AppText>}
        {data && (
          <AppText variant="small" muted>
            {`${data.week.reduce((s, d) => s + d.staffed, 0)} z ${data.week.reduce((s, d) => s + d.total, 0)} służb`}
          </AppText>
        )}
      </View>
      {data && <WeekChart days={data.week} height={isDesktop ? 110 : 90} />}
    </Card>
  )

  const quick = (
    <View style={styles.quickGrid}>
      {[
        ['plus-circle', 'Dodaj służbę', '/(admin)/schedule-form'],
        ['star-circle', 'Przyznaj punkty', '/(admin)/award-points'],
        ['bullhorn', 'Nowe ogłoszenie', '/(admin)/(admin-tabs)/announcements'],
        ['chart-bar', 'Statystyki', '/(admin)/statistics'],
        ['file-chart', 'Raport miesięczny', '/(admin)/monthly-report'],
        ['book-open-variant', 'Wiedza', '/(admin)/wiedza'],
      ].map(([icon, label, href]) => (
        <Card key={label} style={styles.quick} onPress={() => go(href)}>
          <Icon name={icon} size={24} color={c.goldInk} />
          <AppText variant="bodyStrong">{label}</AppText>
        </Card>
      ))}
    </View>
  )

  const settings = (
    <Card flush>
      <ListRow first icon="church" title="Ustawienia parafii" subtitle="Kod, obecność, Msze, czat, punktacja" onPress={() => go('/(admin)/parish-settings')} />
      <ListRow icon="calendar-sync" title="Stałe dyżury" subtitle="Ministranci przypisani co tydzień" onPress={() => go('/(admin)/recurring-assignments')} />
      <ListRow icon="shield-star" title="Rangi" subtitle="Masowe przypisywanie rang formacyjnych" onPress={() => go('/(admin)/rank-assignment')} />
      <ListRow icon="medal" title="Odznaki" subtitle="Wyróżnienia ministrantów" onPress={() => go('/(admin)/badge-management')} />
      <ListRow icon="book-open-variant" title="Wiedza parafii" subtitle="Własne wpisy dla parafii" onPress={() => go('/(admin)/wiedza-admin')} />
      <ListRow
        icon="flag"
        title={`Zgłoszenia z czatu${data?.reports ? ` (${data.reports})` : ''}`}
        subtitle="Moderacja wiadomości"
        onPress={() => go('/(admin)/chat-reports')}
      />
      {profile?.role === 'member' && profile?.is_admin && (
        <ListRow icon="account-arrow-left" title="Wróć do widoku ministranta" onPress={() => router.replace('/(tabs)')} />
      )}
    </Card>
  )

  const onRefresh = async () => { setRefreshing(true); await reload(); setRefreshing(false) }

  // ── Web ──────────────────────────────────────────────────────────────────
  if (isDesktop) {
    const tiles = [
      ['account-group', String(data?.members ?? '—'), 'Ministranci', c.successStrong, '/(admin)/(admin-tabs)/members'],
      ['calendar-alert', String(data?.unstaffed7 ?? '—'), 'Bez obsady (7 dni)', c.gold, '/(admin)/(admin-tabs)/schedules'],
      ['alert-circle', String(data?.excuses.count ?? '—'), 'Prośby o usprawiedliwienie', c.dangerStrong, '/(admin)/absence-requests'],
      ['chart-bar', data?.avgAttendance != null ? `${data.avgAttendance}%` : '—', 'Średnia frekwencja (30 dni)', c.primary, '/(admin)/statistics'],
    ] as const
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.desktop}>
        <View style={styles.tiles}>
          {tiles.map(([icon, value, label, color, href]) => (
            <Card key={label} large style={[styles.tile, { borderTopColor: color }]} onPress={() => go(href)}>
              <Icon name={icon} size={22} color={color} />
              <AppText style={[serif(), styles.tileValue, { color: c.text }]}>{value}</AppText>
              <AppText variant="small" muted>{label}</AppText>
            </Card>
          ))}
        </View>
        <View style={[styles.band, { backgroundColor: pal.bg }]}>
          <AppText variant="eyebrow" color={pal.accent}>{liturgy.entry.typeLabel}</AppText>
          <AppText style={[styles.bandName, { color: pal.fg }]} numberOfLines={1}>{liturgy.entry.name}</AppText>
          <AppText variant="label" color={pal.fg}>{liturgy.vestmentName}</AppText>
        </View>
        <View style={styles.cols}>
          <View style={styles.colMain}>
            <Card flush>
              <View style={[styles.cardHead, styles.rowBetween]}>
                <AppText variant="eyebrow" color={c.goldInk}>Najbliższe służby</AppText>
                <Pressable onPress={() => go('/(admin)/(admin-tabs)/schedules')}><AppText variant="label" color={c.primary}>Cały grafik →</AppText></Pressable>
              </View>
              {(data?.upcoming ?? []).map(s => (
                <Pressable
                  key={s.id}
                  onPress={() => go(`/(admin)/schedule-detail?id=${s.id}`)}
                  style={({ hovered }: any) => [styles.upRow, { borderTopColor: c.borderLight }, hovered && { backgroundColor: c.highlight }]}
                >
                  <AppText variant="small" muted style={styles.upDate}>{`${dayShort(s.date)} ${shortDate(s.date)}`}</AppText>
                  <AppText style={[styles.upTime, { color: c.text }]}>{s.time}</AppText>
                  <AppText variant="bodyStrong" style={styles.flex} numberOfLines={1}>{s.title}</AppText>
                  <View style={[styles.bar, { backgroundColor: c.borderLight }]}>
                    <View style={[styles.barFill, { width: s.people ? '100%' : '0%', backgroundColor: c.successStrong }]} />
                  </View>
                  <AppText style={[styles.upPeople, { color: s.people ? c.text : c.dangerStrong }]}>
                    {s.people ? `${s.people} ${pl(s.people, ['osoba', 'osoby', 'osób'])}` : 'brak'}
                  </AppText>
                </Pressable>
              ))}
            </Card>
            {weekCard}
            <MonthCalendar />
          </View>
          <View style={styles.colSide}>
            <TourTarget id="admin:todo">{todoCard}</TourTarget>
            {quick}
            {settings}
          </View>
        </View>
      </ScrollView>
    )
  }

  // ── Telefon ──────────────────────────────────────────────────────────────
  return (
    <ScrollView style={{ backgroundColor: c.bg }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <StatusBar style={pal.statusBar} />
      <View style={[styles.header, { backgroundColor: pal.bg, paddingTop: topGap(insets.top, 10) }]}>
        <View style={styles.rowBetween}>
          <AppText variant="eyebrow" color={pal.accent}>Panel opiekuna</AppText>
          <View style={styles.headActions}>
            <NotificationBell tone="header" fg={pal.fg} />
            <Pressable ref={tourRef('profile')} onPress={() => go('/(admin)/(admin-tabs)/profile')} accessibilityRole="button" accessibilityLabel="Profil">
              <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size={38} />
            </Pressable>
          </View>
        </View>
        <AppText style={[serif(), styles.headerTitle, { color: pal.fg }]}>Króluj nam Chryste!</AppText>
        <AppText style={[styles.headerSub, { color: pal.fg }]}>{`${profile?.full_name ?? ''} · Dziś, ${dayMonth(localDateStr())}`}</AppText>
        <AppText style={[styles.headerLit, { color: pal.fg }]}>{liturgy.entry.name}</AppText>
      </View>
      <View style={styles.body}>
        <TourTarget id="admin:todo">{todoCard}</TourTarget>
        {weekCard}
        {quick}
        <SectionHeader title="Kalendarz" />
        <MonthCalendar />
        <SectionHeader title="Ustawienia" />
        {settings}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pad18: { padding: 18, gap: 14 },
  header: { paddingHorizontal: 22, paddingBottom: 22, gap: 6 },
  headerTitle: { fontSize: 38, lineHeight: 41, marginTop: 4 },
  headerSub: { ...sans(700), fontSize: 13 },
  headerLit: { ...sans(500), fontSize: 13, opacity: 0.9 },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  cardHead: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quick: { width: '48%', flexGrow: 1, gap: 8, padding: 16 },
  desktop: { padding: 28, paddingHorizontal: 32, gap: 18 },
  tiles: { flexDirection: 'row', gap: 16 },
  tile: { flex: 1, gap: 6, padding: 18, borderTopWidth: 4 },
  tileValue: { fontSize: 44, lineHeight: 48 },
  band: { flexDirection: 'row', alignItems: 'center', gap: 18, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  bandName: { ...sans(700), fontSize: 14, flex: 1 },
  cols: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  colMain: { flex: 1.6, gap: 18 },
  colSide: { flex: 1, gap: 18 },
  upRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, cursor: 'pointer' } as any,
  upDate: { width: 64 },
  upTime: { ...sans(800), fontSize: 14, minWidth: 46, flexShrink: 0, fontVariant: ['tabular-nums'] },
  bar: { width: 110, height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  upPeople: { ...sans(700), fontSize: 12, width: 70, textAlign: 'right' },
})
