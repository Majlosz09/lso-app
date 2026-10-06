import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { FormationProgressCard } from '../../components/FormationProgressCard'
import { CalendarSubscribeCard } from '../../components/CalendarSubscribeCard'
import { MemberFunctionsCard } from '../../components/admin/MemberFunctionsCard'
import { computeAndSyncBadges } from '../../lib/badges'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif } from '../../lib/theme'
import { pl } from '../../lib/dates'
import { useThemeStore, ThemeOverride } from '../../stores/themeStore'
import { AvatarImage } from '../../components/AvatarImage'
import { PRESET_ICONS, PRESET_COLORS, buildPresetUrl, parsePresetUrl, isPresetUrl } from '../../lib/presetAvatar'
import { FormationSection, BadgeWithDef } from '../../components/FormationBadges'
import { BadgeGrid } from '../../components/BadgeGrid'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useLiturgyHeader } from '../../hooks/useLiturgyHeader'
import { useTour } from '../../stores/tourStore'
import { tourRoleFor } from '../../lib/tour'
import { DeleteAccountButton } from '../../components/DeleteAccountButton'
import { ExportMyDataButton } from '../../components/ExportMyDataButton'
import { ForgotPasswordModal } from '../../components/ForgotPasswordModal'
import { attendanceRate } from '../../lib/serviceRules'
import { ChildSummary, useChildren } from '../../hooks/useChildren'
import {
  AppText, Avatar, Button, Card, HeaderChip, Icon, ListRow, Segmented, Sheet, TextField,
} from '../../components/ui'
import { useWiedzaReads } from '../../hooks/useWiedzaReads'
import { builtInKeys, countRead } from '../../lib/wiedza'
import { KeyboardScrollView } from '../../components/ui/KeyboardScrollView'
import { topGap } from '../../lib/safeTop'

const WIEDZA_KEYS = builtInKeys()

const ROLE_LABELS: Record<string, string> = {
  admin: 'Opiekun',
  member: 'Ministrant',
  parent: 'Rodzic',
}

export default function ProfileScreen() {
  const { profile } = useAuthStore()
  return <ProfileView mode={profile?.role === 'admin' ? 'admin' : profile?.role === 'parent' ? 'parent' : 'member'} />
}

// ─── Awatar: zdjęcie / ikonka z kolorem / usunięcie ──────────────────────────

function useAvatarEditor() {
  const { profile, fetchProfile } = useAuthStore()
  const [busy, setBusy] = useState(false)
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null | undefined>(undefined)
  const [menuVisible, setMenuVisible] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [presetVisible, setPresetVisible] = useState(false)
  const [selIcon, setSelIcon] = useState(PRESET_ICONS[0].icon)
  const [selColor, setSelColor] = useState(0)
  const { colors: c } = useTheme()

  // undefined = bez nadpisania (bierzemy ze store), null = usunięty
  const displayUrl = localAvatarUrl !== undefined ? localAvatarUrl : (profile?.avatar_url ?? null)
  const hasAvatar = !!displayUrl

  const pickPhoto = async () => {
    setMenuVisible(false)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Brak uprawnień', 'Zezwól na dostęp do zdjęć w ustawieniach.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets?.[0]) return

    setBusy(true)
    try {
      const p = useAuthStore.getState().profile!
      const uri = result.assets[0].uri
      const response = await fetch(uri)
      if (!response.ok) throw new Error(`Fetch obrazu nieudany: ${response.status}`)
      const blob = await response.blob()
      if (blob.size === 0) throw new Error('Pusty plik obrazu')
      const path = `${p.id}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true })
      if (uploadError) { Alert.alert('Błąd uploadu', uploadError.message); return }

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const newUrl = `${publicUrl}?t=${Date.now()}`
      const { error } = await supabase.from('profiles').update({ avatar_url: newUrl }).eq('id', p.id)
      if (error) { Alert.alert('Błąd', error.message); return }
      setLocalAvatarUrl(newUrl)
      fetchProfile()
      Toast.show({ type: 'success', text1: 'Zdjęcie zapisane' })
    } catch (e: any) {
      Alert.alert('Błąd', e.message)
    } finally {
      setBusy(false)
    }
  }

  const openPresetPicker = () => {
    const parsed = parsePresetUrl(displayUrl)
    setSelIcon(parsed?.icon ?? PRESET_ICONS[0].icon)
    setSelColor(parsed?.colorIndex ?? 0)
    setMenuVisible(false)
    setPresetVisible(true)
  }

  const savePreset = async () => {
    setBusy(true)
    const p = useAuthStore.getState().profile!
    const currentUrl = p.avatar_url
    if (!isPresetUrl(currentUrl) && currentUrl) {
      await supabase.storage.from('avatars').remove([`${p.id}.jpg`])
    }
    const newUrl = buildPresetUrl(selIcon, selColor)
    const { error } = await supabase.from('profiles').update({ avatar_url: newUrl }).eq('id', p.id)
    setBusy(false)
    if (error) { Alert.alert('Błąd', error.message); return }
    setLocalAvatarUrl(newUrl)
    fetchProfile()
    Toast.show({ type: 'success', text1: 'Avatar zapisany' })
    setPresetVisible(false)
  }

  const doRemove = async () => {
    setMenuVisible(false)
    setConfirmRemove(false)
    setBusy(true)
    const p = useAuthStore.getState().profile!
    const currentUrl = p.avatar_url
    if (!isPresetUrl(currentUrl) && currentUrl) {
      await supabase.storage.from('avatars').remove([`${p.id}.jpg`])
    }
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', p.id)
    if (error) {
      Alert.alert('Błąd', error.message)
    } else {
      setLocalAvatarUrl(null)
      fetchProfile()
      Toast.show({ type: 'success', text1: 'Avatar usunięty' })
    }
    setBusy(false)
  }

  const avatar = (size: number, ringColor: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Zmień avatar"
      onPress={() => setMenuVisible(true)}
      disabled={busy}
      style={[styles.avatarWrap, { borderColor: ringColor }]}
    >
      {displayUrl
        ? <AvatarImage avatarUrl={displayUrl} size={size} />
        : <Avatar name={profile?.full_name} size={size} />}
      <View style={[styles.cameraBadge, { backgroundColor: c.surface }]}>
        {busy ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="camera" size={16} color={c.primary} />}
      </View>
    </Pressable>
  )

  const sheets = (
    <>
      <Sheet
        visible={menuVisible}
        onClose={() => { setMenuVisible(false); setConfirmRemove(false) }}
        title={confirmRemove ? 'Usunąć zdjęcie profilowe?' : 'Avatar'}
        footer={confirmRemove ? (
          <>
            <Button label="Tak, usuń" variant="danger" onPress={doRemove} loading={busy} />
            <Button label="Anuluj" variant="secondary" onPress={() => setConfirmRemove(false)} />
          </>
        ) : undefined}
      >
        {!confirmRemove && (
          <Card flush>
            <ListRow first icon="image" title="Wybierz ze zdjęć" onPress={pickPhoto} />
            <ListRow icon="palette" title="Kolor i ikona" subtitle="Bez zdjęcia — sam wybierasz symbol" onPress={openPresetPicker} />
            {hasAvatar && <ListRow icon="delete" title="Usuń avatar" destructive onPress={() => setConfirmRemove(true)} />}
          </Card>
        )}
      </Sheet>

      <Sheet
        visible={presetVisible}
        onClose={() => setPresetVisible(false)}
        title="Kolor i ikona"
        footer={<Button label="Zapisz avatar" onPress={savePreset} loading={busy} />}
      >
        <View style={styles.presetPreviewRow}>
          <View style={[styles.presetPreview, { backgroundColor: PRESET_COLORS[selColor].bg }]}>
            <Ionicons name={selIcon as any} size={44} color={PRESET_COLORS[selColor].iconColor} />
          </View>
        </View>
        <AppText variant="eyebrow" color={c.goldInk}>Kolor</AppText>
        <View style={styles.swatches}>
          {PRESET_COLORS.map((col, idx) => (
            <Pressable
              key={idx}
              accessibilityRole="button"
              accessibilityState={{ selected: selColor === idx }}
              style={[styles.swatch, { backgroundColor: col.bg }, selColor === idx && { borderColor: c.primary, borderWidth: 3 }]}
              onPress={() => setSelColor(idx)}
            >
              {selColor === idx && <Ionicons name="checkmark" size={14} color="#fff" />}
            </Pressable>
          ))}
        </View>
        <AppText variant="eyebrow" color={c.goldInk}>Ikona</AppText>
        <View style={styles.iconGrid}>
          {PRESET_ICONS.map(def => {
            const active = selIcon === def.icon
            return (
              <Pressable
                key={def.icon}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.iconCell,
                  { backgroundColor: active ? PRESET_COLORS[selColor].bg : c.surface, borderColor: active ? 'transparent' : c.border },
                ]}
                onPress={() => setSelIcon(def.icon)}
              >
                <Ionicons name={def.icon as any} size={24} color={active ? PRESET_COLORS[selColor].iconColor : c.subtext} />
                <AppText style={[styles.iconLabel, { color: active ? PRESET_COLORS[selColor].iconColor : c.subtext }]} numberOfLines={1}>
                  {def.label}
                </AppText>
              </Pressable>
            )
          })}
        </View>
      </Sheet>
    </>
  )

  return { avatar, sheets }
}

// ─── Dane profilu ─────────────────────────────────────────────────────────────

type RankItem = { id: string; name: string; order: number }

function useProfileData(mode: ProfileMode) {
  const admin = mode === 'admin'
  const { profile } = useAuthStore()
  const [stats, setStats] = useState<{ a: string; al: string; b: string; bl: string; c: string; cl: string } | null>(null)
  const [allRanks, setAllRanks] = useState<RankItem[]>([])
  const [badges, setBadges] = useState<BadgeWithDef[]>([])
  const [parentName, setParentName] = useState<string | null>(null)

  const fetchBadges = useCallback(() => {
    if (!profile?.id) return
    supabase
      .from('member_badges')
      .select('id, awarded_at, badge_definition:badge_definitions(id, name, icon, criteria_key)')
      .eq('profile_id', profile.id)
      .eq('is_active', true)
      .then(({ data }) => {
        const seen = new Set<string>()
        setBadges(((data ?? []) as any[]).filter(b => {
          if (!b.badge_definition) return false
          const key = b.badge_definition.criteria_key ?? b.badge_definition.id
          if (seen.has(key)) return false
          seen.add(key)
          return true
        }))
      })
      .then(undefined, console.error)
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id || !profile.parish_id) return
    if (mode === 'parent') return
    if (admin) {
      const today = new Date().toISOString().split('T')[0]
      const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]
      Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('parish_id', profile.parish_id).eq('role', 'member').eq('is_active', true),
        supabase.from('schedules').select('id', { count: 'exact', head: true }).eq('parish_id', profile.parish_id).gte('date', today).lte('date', in30),
      ]).then(([m, s]) => setStats({
        a: String(m.count ?? 0), al: pl(m.count ?? 0, ['ministrant', 'ministrantów', 'ministrantów']),
        b: String(s.count ?? 0), bl: 'służb (30 dni)',
        c: '', cl: '',
      }))
      return
    }
    Promise.all([
      supabase.from('points_summary').select('profile_id, total_points, services_count').eq('parish_id', profile.parish_id).order('total_points', { ascending: false }),
      supabase.from('schedule_assignments').select('status, schedule:schedules!inner(date)')
        .eq('profile_id', profile.id).lt('schedule.date', new Date().toISOString().slice(0, 10)),
      supabase.from('ranks').select('id, name, order').or(`parish_id.is.null,parish_id.eq.${profile.parish_id}`).order('order'),
      profile.parent_id
        ? supabase.from('profiles').select('full_name').eq('id', profile.parent_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]).then(([rank, assign, ranks, parent]) => {
      const rows = (rank.data ?? []) as any[]
      const me = rows.find(r => r.profile_id === profile.id)
      const rate = attendanceRate(((assign.data ?? []) as any[]).map(a => a.status))
      const services = me?.services_count ?? 0
      setStats({
        a: String(me?.total_points ?? 0), al: 'pkt',
        b: rate != null ? `${rate}%` : '—', bl: 'frekwencja',
        c: String(services), cl: pl(services, ['służba', 'służby', 'służb']),
      })
      setAllRanks((ranks.data ?? []) as RankItem[])
      setParentName((parent as any).data?.full_name ?? null)
    })
    fetchBadges()
    computeAndSyncBadges(supabase, profile.id, profile.parish_id).catch(console.error)
  }, [profile?.id, profile?.parish_id, profile?.parent_id, admin, mode, fetchBadges])

  useRealtimeTable('member_badges', fetchBadges, profile?.id ? `profile_id=eq.${profile.id}` : undefined)
  return { stats, allRanks, badges, parentName }
}

// ─── Widok profilu ────────────────────────────────────────────────────────────

export type ProfileMode = 'member' | 'admin' | 'parent'

export function ProfileView({ mode }: { mode: ProfileMode }) {
  const admin = mode === 'admin'
  const parent = mode === 'parent'
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const { palette } = useLiturgyHeader()
  const { themeOverride, setThemeOverride } = useThemeStore()
  const { profile, session, signOut, parish, pushEnabled } = useAuthStore()
  const { stats, allRanks, badges, parentName } = useProfileData(mode)
  const { reads: wiedzaReads, available: readsOn } = useWiedzaReads()
  const wiedzaRead = countRead(WIEDZA_KEYS, wiedzaReads)
  const kids = useChildren(0)
  const [unlinkChild, setUnlinkChild] = useState<ChildSummary | null>(null)
  const doUnlink = async () => {
    const child = unlinkChild
    if (!child) return
    setUnlinkChild(null)
    const { error } = await supabase.from('profiles').update({ parent_id: null }).eq('id', child.id)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    kids.setChildren(prev => prev.filter(k => k.id !== child.id))
    Toast.show({ type: 'success', text1: `Odłączono ${child.full_name}` })
  }
  const { avatar, sheets } = useAvatarEditor()
  const [editing, setEditing] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const insets = useSafeAreaInsets()
  const rankName = allRanks.find(r => r.id === profile?.rank_id)?.name ?? null
  const homeHref = admin ? '/(admin)/(admin-tabs)' : parent ? '/(parent)/(parent-tabs)' : '/(tabs)'
  const back = () => (router.canGoBack() ? router.back() : router.replace(homeHref as any))

  const hero = (
    <View style={[styles.hero, { backgroundColor: palette.bg }, isDesktop ? styles.heroDesktop : { paddingTop: topGap(insets.top, 40) }]}>
      {!isDesktop && <StatusBar style={palette.statusBar} />}
      {!isDesktop && (
        <View style={[styles.heroTop, { top: topGap(insets.top, 8) }]}>
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Wstecz" style={styles.heroBack}>
            <Icon name="chevron-left" size={22} color={palette.fg} />
            <AppText style={[styles.heroLink, { color: palette.fg }]}>Wstecz</AppText>
          </Pressable>
          <Pressable onPress={() => setEditing(true)} accessibilityRole="button">
            <AppText style={[styles.heroLink, { color: palette.fg }]}>Edytuj</AppText>
          </Pressable>
        </View>
      )}
      {avatar(isDesktop ? 84 : 92, palette.chip)}
      <AppText style={[serif(), styles.heroName, { color: palette.fg }]}>{profile?.full_name ?? '—'}</AppText>
      <View style={styles.heroChips}>
        <HeaderChip label={ROLE_LABELS[profile?.role ?? ''] ?? 'Ministrant'} palette={palette} />
        {!!rankName && <HeaderChip label={rankName} palette={palette} />}
      </View>
      {!!parish && (
        <AppText style={[styles.heroParish, { color: palette.fg }]}>
          {`${parish.name}${parish.city ? `, ${parish.city}` : ''}`}
        </AppText>
      )}
    </View>
  )

  const pushCard = pushEnabled === false && (
    <View style={[styles.push, { backgroundColor: c.goldSurface, borderColor: c.gold }]}>
      <Icon name="bell-off" size={22} color={c.goldInk} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={c.goldText}>Powiadomienia wyłączone</AppText>
        <AppText variant="small" color={c.goldText}>Włącz je w ustawieniach telefonu, aby dostawać przypomnienia o służbie.</AppText>
      </View>
    </View>
  )

  const statTiles = stats && (
    <View style={styles.stats}>
      {[[stats.a, stats.al], [stats.b, stats.bl], ...(stats.c ? [[stats.c, stats.cl]] : [])].map(([v, l]) => (
        <Card key={l} style={styles.stat}>
          <AppText style={[styles.statValue, { color: c.text }]}>{v}</AppText>
          <AppText variant="small" muted>{l}</AppText>
        </Card>
      ))}
    </View>
  )

  const childrenCard = parent && (
    <Card flush>
      <View style={[styles.cardHead, { borderBottomColor: c.borderLight }]}>
        <AppText variant="eyebrow" color={c.goldInk} style={styles.flex}>Moje dzieci</AppText>
      </View>
      {kids.children.length === 0 ? (
        <ListRow first icon="account-child" title="Brak powiązanych dzieci" subtitle="Opiekun parafii może połączyć konto dziecka z Twoim" />
      ) : kids.children.map((ch, i) => (
        <ListRow
          key={ch.id}
          first={i === 0}
          left={<Avatar name={ch.full_name} avatarUrl={ch.avatar_url} size={38} />}
          title={ch.full_name}
          subtitle={`${ch.rankName ?? 'Ministrant'} · ${ch.points} pkt${ch.badges.length ? '  ' + ch.badges.slice(0, 4).join(' ') : ''}`}
          onPress={() => router.push(`/(parent)/member-profile?id=${ch.id}` as any)}
          right={
            <Pressable onPress={() => setUnlinkChild(ch)} hitSlop={8} accessibilityLabel={`Odłącz ${ch.full_name}`}>
              <Icon name="link-variant-off" size={20} color={c.dangerStrong} />
            </Pressable>
          }
        />
      ))}
    </Card>
  )

  const formation = mode === 'member' && (
    <Card style={styles.formation}>
      {allRanks.length > 0 && <FormationSection ranks={allRanks} currentRankId={profile?.rank_id ?? null} c={c} />}
      {mode === 'member' && !!profile?.id && <FormationProgressCard profileId={profile.id} bare />}
      {!!profile?.id && <MemberFunctionsCard profileId={profile.id} bare />}
      <AppText variant="eyebrow" color={c.goldInk}>Wyróżnienia</AppText>
      <BadgeGrid badges={badges} emptyText="Nie masz jeszcze wyróżnień." />
      <Pressable onPress={() => router.push('/(tabs)/badge-catalog')} accessibilityRole="link">
        <AppText variant="label" color={c.primary}>Zobacz dostępne odznaki →</AppText>
      </Pressable>
    </Card>
  )

  const info = (
    <Card flush>
      <View style={[styles.cardHead, { borderBottomColor: c.borderLight }]}>
        <AppText variant="eyebrow" color={c.goldInk} style={styles.flex}>Dane konta</AppText>
        <Pressable onPress={() => setEditing(true)} accessibilityRole="button">
          <AppText variant="label" color={c.primary}>Edytuj</AppText>
        </Pressable>
      </View>
      <ListRow first icon="account" title={profile?.full_name ?? '—'} subtitle="Imię i nazwisko" />
      <ListRow icon="email" title={session?.user.email ?? '—'} subtitle="E-mail" />
      <ListRow icon="phone" title={profile?.phone ?? 'Nie podano'} subtitle="Telefon" />
      {mode === 'member' && <ListRow icon="calendar" title={profile?.rocznik ? String(profile.rocznik) : 'Nie podano'} subtitle="Rocznik" />}
      {mode === 'member' && readsOn && (
        <ListRow icon="book-open-variant" title={`${wiedzaRead} z ${WIEDZA_KEYS.length} haseł`} subtitle="Przeczytane w Wiedzy" onPress={() => router.push('/(tabs)/wiedza')} />
      )}
      {mode === 'member' && (
        <ListRow icon="human-male-female-child" title={parentName ?? 'Brak połączonego rodzica'} subtitle="Połączony rodzic — widzi Twój grafik i punkty" />
      )}
    </Card>
  )

  const settings = (
    <>
    <CalendarSubscribeCard who={admin || profile?.is_helper ? 'staff' : parent ? 'parent' : 'member'} />
    <Card flush>
      <View style={styles.themeBox}>
        <AppText variant="eyebrow" color={c.goldInk}>Wygląd</AppText>
        <Segmented
          value={themeOverride}
          onChange={(v: ThemeOverride) => setThemeOverride(v)}
          options={[{ value: 'light', label: 'Jasny' }, { value: 'dark', label: 'Ciemny' }, { value: 'system', label: 'Systemowy' }]}
        />
      </View>
      <ListRow icon="lock-reset" title="Zmień hasło" subtitle="Wyślemy link na Twój e-mail" onPress={() => setPasswordOpen(true)} />
      <ListRow icon="school" title="Instruktaż aplikacji" subtitle="Przewodnik po ekranach, krok po kroku" onPress={() => useTour.getState().start(tourRoleFor(profile))} />
    </Card>
    </>
  )

  const account = (
    <Card style={styles.account}>
      <Button label="Wyloguj się" icon="logout" variant="secondary" onPress={() => setConfirmLogout(true)} />
      <View style={styles.accountLinks}>
        <ExportMyDataButton />
        <DeleteAccountButton />
      </View>
    </Card>
  )

  const modals = (
    <>
      {sheets}
      <EditProfileSheet visible={editing} onClose={() => setEditing(false)} showRocznik={mode === 'member'} />
      <ForgotPasswordModal visible={passwordOpen} initialEmail={session?.user.email ?? ''} onClose={() => setPasswordOpen(false)} />
      <Sheet
        visible={!!unlinkChild}
        onClose={() => setUnlinkChild(null)}
        title="Odłączyć dziecko?"
        footer={<><Button label="Odłącz" variant="danger" onPress={doUnlink} /><Button label="Anuluj" variant="secondary" onPress={() => setUnlinkChild(null)} /></>}
      >
        <AppText muted>{`${unlinkChild?.full_name ?? ''} zostanie w parafii, ale zniknie z Twojego konta (grafik, punkty).`}</AppText>
      </Sheet>
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
    </>
  )

  if (isDesktop) {
    return (
      <KeyboardScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.desktop}>
        <View style={styles.desktopLeft}>
          {hero}
          <Button label="Edytuj dane" icon="pencil" variant="secondary" onPress={() => setEditing(true)} />
          {statTiles}
          {account}
        </View>
        <View style={styles.desktopRight}>
          {pushCard}
          {childrenCard}
          {formation}
          {info}
          {settings}
        </View>
        {modals}
      </KeyboardScrollView>
    )
  }

  return (
    <KeyboardScrollView style={{ backgroundColor: c.bg }}>
      {hero}
      <View style={styles.body}>
        {pushCard}
        {statTiles}
        {childrenCard}
        {formation}
        {info}
        {settings}
        {account}
      </View>
      {modals}
    </KeyboardScrollView>
  )
}

// ─── Edycja danych ────────────────────────────────────────────────────────────

function EditProfileSheet({ visible, onClose, showRocznik }: { visible: boolean; onClose: () => void; showRocznik: boolean }) {
  const { profile, fetchProfile } = useAuthStore()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [rocznik, setRocznik] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      const parts = (profile?.full_name ?? '').split(' ')
      setFirstName(parts[0] ?? '')
      setLastName(parts.slice(1).join(' ') ?? '')
      setPhone(profile?.phone ?? '')
      setRocznik(profile?.rocznik ? String(profile.rocznik) : '')
    }
  }, [visible])

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Toast.show({ type: 'error', text1: 'Wpisz imię i nazwisko' })
      return
    }
    setSaving(true)
    const updates: Record<string, any> = {
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone.trim() || null,
    }
    if (showRocznik) {
      const yr = parseInt(rocznik)
      updates.rocznik = (rocznik && yr >= 1990) ? yr : null
    }
    const { error } = await supabase.from('profiles').update(updates).eq('id', profile!.id)
    setSaving(false)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    await fetchProfile()
    Toast.show({ type: 'success', text1: 'Profil zapisany' })
    onClose()
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Edytuj profil"
      footer={
        <>
          <Button label="Zapisz" onPress={handleSave} loading={saving} />
          <Button label="Anuluj" variant="secondary" onPress={onClose} />
        </>
      }
    >
      <View style={styles.row}>
        <TextField label="Imię" value={firstName} onChangeText={setFirstName} containerStyle={styles.flex} />
        <TextField label="Nazwisko" value={lastName} onChangeText={setLastName} containerStyle={styles.flex} />
      </View>
      <TextField label="Telefon" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      {showRocznik && (
        <TextField label="Rocznik" keyboardType="number-pad" value={rocznik} onChangeText={setRocznik} maxLength={4} placeholder="np. 2012" />
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', gap: 10 },
  hero: { alignItems: 'center', paddingHorizontal: 22, paddingBottom: 26, paddingTop: 56, gap: 8 },
  heroDesktop: { borderRadius: 22, paddingTop: 28 },
  heroTop: { position: 'absolute', left: 16, right: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBack: { flexDirection: 'row', alignItems: 'center' },
  heroLink: { ...sans(700), fontSize: 13 },
  heroName: { fontSize: 34, lineHeight: 37, textAlign: 'center', marginTop: 6 },
  heroChips: { flexDirection: 'row', gap: 8 },
  heroParish: { ...sans(500), fontSize: 13, textAlign: 'center', opacity: 0.9 },
  avatarWrap: { borderRadius: 999, borderWidth: 4, marginTop: 16 },
  cameraBadge: { position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 14, paddingBottom: 40 },
  push: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { ...sans(800), fontSize: 22, fontVariant: ['tabular-nums'] },
  formation: { gap: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  themeBox: { padding: 14, gap: 10 },
  account: { gap: 12 },
  accountLinks: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap' },
  presetPreviewRow: { alignItems: 'center' },
  presetPreview: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderColor: 'transparent' },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconCell: { width: 76, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 4 },
  iconLabel: { ...sans(600), fontSize: 10 },
  desktop: { flexDirection: 'row', gap: 20, padding: 28, paddingHorizontal: 32, alignItems: 'flex-start' },
  desktopLeft: { width: 340, gap: 14 },
  desktopRight: { flex: 1, gap: 14 },
})
