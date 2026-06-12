import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Platform,
  Modal, TextInput, KeyboardAvoidingView
} from 'react-native'
import Toast from 'react-native-toast-message'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../../lib/supabase'
import { shadow } from '../../../lib/shadows'
import { useAuthStore } from '../../../stores/authStore'
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'
import { useThemeStore, ThemeOverride } from '../../../stores/themeStore'
import { AvatarImage } from '../../../components/AvatarImage'
import {
  PRESET_ICONS, PRESET_COLORS, buildPresetUrl, parsePresetUrl, isPresetUrl,
} from '../../../lib/presetAvatar'
import { OnboardingModal } from '../../../components/OnboardingModal'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  member: 'Ministrant',
  parent: 'Rodzic',
}

// ─── Shared: Avatar Card ──────────────────────────────────────────────────────

function AvatarCard({ rankName }: { rankName?: string | null }) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const { profile, fetchProfile } = useAuthStore()

  const [busy, setBusy] = useState(false)
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null | undefined>(undefined)
  const [menuVisible, setMenuVisible] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [presetVisible, setPresetVisible] = useState(false)
  const [selIcon, setSelIcon] = useState(PRESET_ICONS[0].icon)
  const [selColor, setSelColor] = useState(0)

  // undefined = not overridden (use store), null = explicitly removed
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

  return (
    <View style={styles.avatarCard}>
      <TouchableOpacity onPress={() => setMenuVisible(true)} disabled={busy} style={styles.avatarWrapper}>
        <AvatarImage avatarUrl={displayUrl} size={80} />
        <View style={styles.avatarEditBadge}>
          {busy
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="camera" size={14} color="#fff" />
          }
        </View>
      </TouchableOpacity>
      <Text style={styles.name}>{profile?.full_name ?? '—'}</Text>
      <View style={styles.roleBadge}>
        <Text style={styles.roleText}>{ROLE_LABELS[profile?.role ?? ''] ?? profile?.role}</Text>
      </View>
      {rankName != null && (
        <View style={styles.rankChip}>
          <Ionicons name="ribbon-outline" size={13} color={c.primary} />
          <Text style={styles.rankChipText}>{rankName}</Text>
        </View>
      )}
      <Text style={styles.email}>{useAuthStore.getState().session?.user.email}</Text>

      {/* Action menu */}
      <Modal visible={menuVisible} transparent animationType="slide" onRequestClose={() => { setMenuVisible(false); setConfirmRemove(false) }}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => { setMenuVisible(false); setConfirmRemove(false) }}>
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />
            {confirmRemove ? (
              <>
                <View style={styles.menuConfirmBox}>
                  <Ionicons name="warning-outline" size={22} color={c.danger} />
                  <Text style={styles.menuConfirmText}>Czy na pewno chcesz usunąć zdjęcie profilowe?</Text>
                </View>
                <TouchableOpacity style={styles.menuItem} onPress={doRemove} disabled={busy}>
                  <View style={[styles.menuIconBox, { backgroundColor: c.danger + '18' }]}>
                    {busy
                      ? <ActivityIndicator size="small" color={c.danger} />
                      : <Ionicons name="trash" size={20} color={c.danger} />
                    }
                  </View>
                  <Text style={[styles.menuItemText, { color: c.danger }]}>Tak, usuń</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuItem, { justifyContent: 'center' }]} onPress={() => setConfirmRemove(false)}>
                  <Text style={[styles.menuItemText, { color: c.subtext }]}>Anuluj</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={pickPhoto}>
                  <View style={[styles.menuIconBox, { backgroundColor: c.primaryAlpha08 }]}>
                    <Ionicons name="image-outline" size={20} color={c.primary} />
                  </View>
                  <Text style={styles.menuItemText}>Wybierz ze zdjęć</Text>
                  <Ionicons name="chevron-forward" size={16} color={c.border} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={openPresetPicker}>
                  <View style={[styles.menuIconBox, { backgroundColor: c.primaryAlpha08 }]}>
                    <Ionicons name="color-palette-outline" size={20} color={c.primary} />
                  </View>
                  <Text style={styles.menuItemText}>Wybierz ikonkę</Text>
                  <Ionicons name="chevron-forward" size={16} color={c.border} />
                </TouchableOpacity>
                {hasAvatar && (
                  <TouchableOpacity style={styles.menuItem} onPress={() => setConfirmRemove(true)}>
                    <View style={[styles.menuIconBox, { backgroundColor: c.danger + '18' }]}>
                      <Ionicons name="trash-outline" size={20} color={c.danger} />
                    </View>
                    <Text style={[styles.menuItemText, { color: c.danger }]}>Usuń zdjęcie profilowe</Text>
                    <Ionicons name="chevron-forward" size={16} color={c.border} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.menuItem, { justifyContent: 'center' }]} onPress={() => setMenuVisible(false)}>
                  <Text style={[styles.menuItemText, { color: c.subtext }]}>Anuluj</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Preset picker */}
      <Modal visible={presetVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPresetVisible(false)}>
        <View style={styles.presetModal}>
          <View style={styles.presetHeader}>
            <TouchableOpacity onPress={() => setPresetVisible(false)}>
              <Text style={styles.presetCancel}>Anuluj</Text>
            </TouchableOpacity>
            <Text style={styles.presetTitle}>Wybierz ikonkę</Text>
            <TouchableOpacity onPress={savePreset} disabled={busy}>
              {busy
                ? <ActivityIndicator color={c.primary} />
                : <Text style={styles.presetSave}>Zapisz</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={styles.presetContent}>
            {/* Preview */}
            <View style={styles.presetPreviewRow}>
              <View style={[styles.presetPreview, { backgroundColor: PRESET_COLORS[selColor].bg }]}>
                <Ionicons name={selIcon as any} size={44} color={PRESET_COLORS[selColor].iconColor} />
              </View>
            </View>

            {/* Color row */}
            <Text style={styles.presetSectionLabel}>KOLOR</Text>
            <View style={styles.presetColorRow}>
              {PRESET_COLORS.map((col, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.colorSwatch, { backgroundColor: col.bg }, selColor === idx && styles.colorSwatchSelected]}
                  onPress={() => setSelColor(idx)}
                  activeOpacity={0.8}
                >
                  {selColor === idx && <Ionicons name="checkmark" size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Icon grid */}
            <Text style={styles.presetSectionLabel}>IKONA</Text>
            <View style={styles.iconGrid}>
              {PRESET_ICONS.map((def) => {
                const active = selIcon === def.icon
                return (
                  <TouchableOpacity
                    key={def.icon}
                    style={[
                      styles.iconCell,
                      { backgroundColor: active ? PRESET_COLORS[selColor].bg : c.surface },
                      active && styles.iconCellActive,
                    ]}
                    onPress={() => setSelIcon(def.icon)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={def.icon as any}
                      size={26}
                      color={active ? PRESET_COLORS[selColor].iconColor : c.subtext}
                    />
                    <Text style={[styles.iconCellLabel, active && { color: PRESET_COLORS[selColor].iconColor }]}>
                      {def.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

// ─── Parent Profile ───────────────────────────────────────────────────────────

type Child = {
  id: string
  full_name: string
  rank_name: string | null
  services_count: number
  badges: string[]  // emoji icons of active badges
}

function ParentProfile() {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const { themeOverride, setThemeOverride } = useThemeStore()
  const { profile, session, signOut, parish } = useAuthStore()
  const router = useRouter()
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [unlinking, setUnlinking] = useState<string | null>(null)

  const loadChildren = async (parentId: string) => {
    const { data } = await supabase.from('profiles')
      .select('id, full_name, rank_id, ranks(name)')
      .eq('parent_id', parentId)
    if (!data || data.length === 0) { setLoading(false); return }

    const extras = await Promise.all(
      data.map((kid: any) => Promise.all([
        supabase.from('points_summary').select('services_count').eq('profile_id', kid.id).maybeSingle(),
        supabase.from('member_badges')
          .select('badge_definition:badge_definitions(icon)')
          .eq('profile_id', kid.id)
          .eq('is_active', true),
      ]))
    )
    setChildren(data.map((kid: any, i: number) => ({
      id: kid.id,
      full_name: kid.full_name,
      rank_name: (kid.ranks as any)?.name ?? null,
      services_count: (extras[i][0].data as any)?.services_count ?? 0,
      badges: ((extras[i][1].data ?? []) as any[])
        .map((b: any) => b.badge_definition?.icon)
        .filter(Boolean),
    })))
    setLoading(false)
  }

  useEffect(() => {
    if (!profile?.id) return
    loadChildren(profile.id).catch(console.error)
  }, [profile?.id])

  const handleUnlinkChild = (child: Child) => {
    Alert.alert(
      'Odłącz dziecko',
      `Czy na pewno chcesz odłączyć ${child.full_name} od swojego konta?\nDziecko pozostanie w parafii, ale nie będzie widoczne w Twoim profilu.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Odłącz',
          style: 'destructive',
          onPress: async () => {
            setUnlinking(child.id)
            const { error } = await supabase
              .from('profiles')
              .update({ parent_id: null })
              .eq('id', child.id)
            setUnlinking(null)
            if (error) {
              Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
            } else {
              setChildren(prev => prev.filter(c => c.id !== child.id))
              Toast.show({ type: 'success', text1: `Odłączono ${child.full_name}` })
            }
          },
        },
      ]
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AvatarCard />

      <InfoSection title="Powiązane dzieci">
        {loading ? (
          <ActivityIndicator color={c.primary} style={{ margin: 16 }} />
        ) : children.length === 0 ? (
          <View style={styles.emptyChildren}>
            <Ionicons name="people-outline" size={32} color={c.iconMuted} />
            <Text style={styles.emptyChildrenText}>Brak powiązanych kont dzieci</Text>
          </View>
        ) : (
          children.map((child, i) => (
            <View
              key={child.id}
              style={[styles.childRow, i < children.length - 1 && styles.childRowBorder]}
            >
              <TouchableOpacity
                style={styles.childRowMain}
                onPress={() => router.push(`/(parent)/member-profile?id=${child.id}`)}
                activeOpacity={0.75}
              >
                <View style={styles.childAvatar}>
                  <Ionicons name="person" size={16} color={c.primary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.childName}>{child.full_name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.childRank, !child.rank_name && { color: c.textTertiary }]}>
                      {child.rank_name ?? 'Brak rangi'}
                    </Text>
                    {child.badges.slice(0, 4).map((icon, idx) => (
                      <Text key={idx} style={{ fontSize: 14 }}>{icon}</Text>
                    ))}
                    {child.badges.length > 4 && (
                      <Text style={styles.moreBadges}>+{child.badges.length - 4}</Text>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.unlinkBtn}
                onPress={() => handleUnlinkChild(child)}
                disabled={unlinking === child.id}
                hitSlop={8}
              >
                {unlinking === child.id
                  ? <ActivityIndicator size="small" color={c.danger} />
                  : <Ionicons name="person-remove-outline" size={18} color={c.danger} />
                }
              </TouchableOpacity>
            </View>
          ))
        )}
      </InfoSection>

      <TouchableOpacity
        style={styles.catalogLink}
        onPress={() => router.push('/(tabs)/badge-catalog')}
        activeOpacity={0.75}
      >
        <Ionicons name="ribbon-outline" size={16} color={c.primary} />
        <Text style={styles.catalogLinkText}>Zobacz dostępne odznaki →</Text>
      </TouchableOpacity>

      <InfoSection title="Informacje" onEdit={() => setEditing(true)}>
        <InfoRow icon="person-outline" label="Imię i nazwisko" value={profile?.full_name ?? '—'} />
        <InfoRow icon="mail-outline" label="Email" value={session?.user.email ?? '—'} />
        <InfoRow icon="call-outline" label="Telefon" value={profile?.phone ?? 'Nie podano'} />
        <InfoRow icon="business-outline" label="Parafia" value={parish ? `${parish.name}${parish.city ? `, ${parish.city}` : ''}` : '—'} last />
      </InfoSection>

      {/* Wygląd */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>WYGLĄD</Text>
        </View>
        <View style={styles.themeRow}>
          {([
            { value: 'light',  label: 'Jasny',  icon: 'sunny-outline' },
            { value: 'dark',   label: 'Ciemny', icon: 'moon-outline' },
            { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
          ] as { value: ThemeOverride; label: string; icon: string }[]).map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.themeBtn,
                themeOverride === opt.value && styles.themeBtnActive,
              ]}
              onPress={() => setThemeOverride(opt.value)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={opt.icon as any}
                size={18}
                color={themeOverride === opt.value ? '#fff' : c.subtext}
              />
              <Text style={[
                styles.themeBtnText,
                themeOverride === opt.value && styles.themeBtnTextActive,
              ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={styles.instructionBtn}
        onPress={() => setShowOnboarding(true)}
        activeOpacity={0.75}
      >
        <View style={[styles.menuIconBox, { backgroundColor: c.primaryAlpha08 }]}>
          <Ionicons name="school-outline" size={20} color={c.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.instructionBtnLabel}>Instruktaż aplikacji</Text>
          <Text style={styles.instructionBtnSub}>Powtórz samouczek korzystania z aplikacji</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.primary} />
      </TouchableOpacity>

      <EditProfileModal visible={editing} onClose={() => setEditing(false)} showRocznik={false} />
      <SignOutButton onConfirm={signOut} />
      <OnboardingModal visible={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </ScrollView>
  )
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────

function EditProfileModal({ visible, onClose, showRocznik }: {
  visible: boolean; onClose: () => void; showRocznik: boolean
}) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const { profile, fetchProfile } = useAuthStore()
  const nameParts = (profile?.full_name ?? '').split(' ')
  const [firstName, setFirstName] = useState(nameParts[0] ?? '')
  const [lastName, setLastName] = useState(nameParts.slice(1).join(' ') ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [rocznik, setRocznik] = useState(profile?.rocznik ? String(profile.rocznik) : '')
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
    if (!firstName.trim()) { Alert.alert('Błąd', 'Wpisz imię.'); return }
    if (!lastName.trim()) { Alert.alert('Błąd', 'Wpisz nazwisko.'); return }

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
    if (error) { Alert.alert('Błąd', error.message); return }
    await fetchProfile()
    Toast.show({ type: 'success', text1: 'Profil zaktualizowany' })
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalOverlay}>
          <View style={styles.editSheet}>
            <View style={styles.editSheetHeader}>
              <Text style={styles.editSheetTitle}>Edytuj profil</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={24} color={c.subtext} />
              </TouchableOpacity>
            </View>

            <View style={styles.editNameRow}>
              <TextInput
                style={[styles.editInput, { flex: 1 }]}
                placeholder="Imię"
                value={firstName}
                onChangeText={setFirstName}
              />
              <TextInput
                style={[styles.editInput, { flex: 1 }]}
                placeholder="Nazwisko"
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
            <TextInput
              style={styles.editInput}
              placeholder="Telefon"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            {showRocznik && (
              <TextInput
                style={styles.editInput}
                placeholder="Rocznik (np. 2018)"
                keyboardType="number-pad"
                value={rocznik}
                onChangeText={setRocznik}
                maxLength={4}
              />
            )}

            <View style={styles.editActions}>
              <TouchableOpacity style={styles.editCancelBtn} onPress={onClose}>
                <Text style={styles.editCancelText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editSaveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.editSaveText}>Zapisz</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function InfoSection({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit?: () => void }) {
  const { colors: c } = useTheme()
  const styles = createStyles(c)
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onEdit && <TouchableOpacity onPress={onEdit}><Text style={styles.editLink}>Edytuj</Text></TouchableOpacity>}
      </View>
      <View style={styles.infoCard}>{children}</View>
    </View>
  )
}

function InfoRow({ icon, label, value, last }: { icon: any; label: string; value: string; last?: boolean }) {
  const { colors: c } = useTheme()
  const styles = createStyles(c)
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Ionicons name={icon} size={16} color={c.subtext} style={{ width: 20 }} />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  )
}

function SignOutButton({ onConfirm }: { onConfirm: () => void }) {
  const { colors: c } = useTheme()
  const styles = createStyles(c)
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <TouchableOpacity style={styles.signOutButton} onPress={() => setConfirming(true)}>
        <Ionicons name="log-out-outline" size={20} color={c.danger} />
        <Text style={styles.signOutText}>Wyloguj się</Text>
      </TouchableOpacity>

      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmTitle}>Wylogowanie</Text>
            <Text style={styles.confirmMessage}>Czy na pewno chcesz się wylogować?</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setConfirming(false)}>
                <Text style={styles.editCancelText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmSignOutBtn} onPress={() => { setConfirming(false); onConfirm() }}>
                <Text style={styles.confirmSignOutText}>Wyloguj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, ...(Platform.OS === 'web' && { minHeight: 0 }) },
    content: { padding: 16, gap: 16 },

    avatarCard: {
      backgroundColor: c.surface, borderRadius: 16, padding: 24,
      alignItems: 'center', gap: 8,
      ...shadow.md,
    },
    avatarWrapper: { position: 'relative', marginBottom: 4 },
    avatarEditBadge: {
      position: 'absolute', bottom: 0, right: 0,
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center',
      borderWidth: 2, borderColor: c.surface,
    },

    // Avatar action menu
    menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    menuSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom: 28, paddingTop: 8,
    },
    menuHandle: {
      width: 36, height: 4, borderRadius: 2, backgroundColor: c.border,
      alignSelf: 'center', marginBottom: 12,
    },
    menuItem: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 20, paddingVertical: 14,
    },
    menuIconBox: {
      width: 36, height: 36, borderRadius: 10,
      justifyContent: 'center', alignItems: 'center',
    },
    menuItemText: { flex: 1, fontSize: 15, fontWeight: '500', color: c.text },
    menuConfirmBox: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    menuConfirmText: { flex: 1, fontSize: 14, color: c.text, lineHeight: 20 },

    // Preset picker
    presetModal: { flex: 1, backgroundColor: c.bg },
    presetHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      padding: 16, borderBottomWidth: 1, borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    presetTitle: { fontSize: 16, fontWeight: '600', color: c.text },
    presetCancel: { fontSize: 15, color: c.subtext },
    presetSave: { fontSize: 15, color: c.primary, fontWeight: '600' },
    presetContent: { padding: 20, gap: 16 },
    presetPreviewRow: { alignItems: 'center', paddingVertical: 8 },
    presetPreview: {
      width: 96, height: 96, borderRadius: 48,
      justifyContent: 'center', alignItems: 'center',
      ...shadow.md,
    },
    presetSectionLabel: {
      fontSize: 11, fontWeight: '700', color: c.textTertiary,
      letterSpacing: 0.8, textTransform: 'uppercase',
    },
    presetColorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    colorSwatch: {
      width: 36, height: 36, borderRadius: 18,
      justifyContent: 'center', alignItems: 'center',
    },
    colorSwatchSelected: {
      borderWidth: 3, borderColor: c.text,
    },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    iconCell: {
      width: '22%', flexGrow: 1, aspectRatio: 1,
      borderRadius: 14, alignItems: 'center', justifyContent: 'center',
      gap: 4, padding: 8,
      borderWidth: 1, borderColor: c.border,
    },
    iconCellActive: { borderColor: 'transparent' },
    iconCellLabel: { fontSize: 9, color: c.textTertiary, textAlign: 'center', fontWeight: '600' },
    name: { fontSize: 20, fontWeight: '700', color: c.text },
    roleBadge: {
      backgroundColor: c.primaryAlpha12, borderRadius: 12,
      paddingHorizontal: 12, paddingVertical: 4,
    },
    roleText: { fontSize: 13, color: c.primary, fontWeight: '600' },
    rankChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.primaryAlpha08, borderRadius: 12,
      paddingHorizontal: 10, paddingVertical: 4,
      borderWidth: 1, borderColor: c.primaryAlpha12,
    },
    rankChipText: { fontSize: 13, fontWeight: '600', color: c.primary },
    email: { fontSize: 13, color: c.textTertiary },

    section: { gap: 8 },
    sectionTitle: {
      fontSize: 13, fontWeight: '600', color: c.subtext,
      textTransform: 'uppercase', letterSpacing: 0.5,
    },
    infoCard: {
      backgroundColor: c.surface, borderRadius: 12, overflow: 'hidden',
      ...shadow.xs,
    },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    infoRowBorder: { borderBottomWidth: 1, borderBottomColor: c.primarySurface },
    infoContent: { flex: 1 },
    infoLabel: { fontSize: 12, color: c.textTertiary },
    infoValue: { fontSize: 15, color: c.text, marginTop: 1 },

    childRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
    childRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    childRowBorder: { borderBottomWidth: 1, borderBottomColor: c.primarySurface },
    unlinkBtn: { padding: 8, borderRadius: 8, backgroundColor: c.danger + '10' },
    childAvatar: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: c.primaryAlpha08, justifyContent: 'center', alignItems: 'center',
    },
    childName: { flex: 1, fontSize: 15, fontWeight: '500', color: c.text },
    childBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    childBadgeText: { fontSize: 13, color: c.success, fontWeight: '500' },
    childRank: { fontSize: 12, color: c.primary, fontWeight: '500' },
    moreBadges: { fontSize: 11, color: c.textTertiary },

    emptyChildren: { alignItems: 'center', padding: 24, gap: 8 },
    emptyChildrenText: { fontSize: 14, color: c.textTertiary, textAlign: 'center' },

    instructionBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.primaryAlpha08, borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: c.primaryAlpha20,
    },
    instructionBtnLabel: { fontSize: 15, fontWeight: '600', color: c.primary },
    instructionBtnSub: { fontSize: 12, color: c.subtext, marginTop: 1 },

    signOutButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: c.surface, borderRadius: 12, padding: 16,
      borderWidth: 1, borderColor: c.danger + '22',
      ...shadow.xs,
    },
    signOutText: { fontSize: 15, fontWeight: '600', color: c.danger },

    confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 32 },
    confirmSheet: { backgroundColor: c.surface, borderRadius: 16, padding: 24, gap: 12, width: '100%', maxWidth: 400 },
    confirmTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    confirmMessage: { fontSize: 15, color: c.subtext },
    confirmActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    confirmCancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: c.primarySurface, alignItems: 'center' },
    confirmSignOutBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: c.danger, alignItems: 'center' },
    confirmSignOutText: { fontSize: 15, fontWeight: '600', color: '#fff' },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    editLink: { fontSize: 13, fontWeight: '600', color: c.primary },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    editSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 24, gap: 12,
    },
    editSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    editSheetTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    editNameRow: { flexDirection: 'row', gap: 10 },
    editInput: {
      backgroundColor: c.inputBg, borderRadius: 10, padding: 13,
      fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.border,
    },
    editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    editCancelBtn: {
      flex: 1, padding: 14, borderRadius: 10,
      backgroundColor: c.primarySurface, alignItems: 'center',
    },
    editCancelText: { fontSize: 15, fontWeight: '600', color: c.subtext },
    editSaveBtn: {
      flex: 1, padding: 14, borderRadius: 10,
      backgroundColor: c.primary, alignItems: 'center',
    },
    editSaveText: { fontSize: 15, fontWeight: '600', color: '#fff' },

    themeRow: {
      flexDirection: 'row', gap: 8,
      backgroundColor: c.surface, borderRadius: 14,
      padding: 8, borderWidth: 1, borderColor: c.border,
    },
    themeBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 10, borderRadius: 10,
    },
    themeBtnActive: { backgroundColor: c.primary },
    themeBtnText: { fontSize: 13, fontWeight: '600', color: c.subtext },
    themeBtnTextActive: { color: '#fff' },

    // Catalog link
    catalogLink: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      padding: 14, backgroundColor: c.surface, borderRadius: 12,
      borderWidth: 1, borderColor: c.primaryAlpha12,
    },
    catalogLinkText: { fontSize: 14, color: c.primary, fontWeight: '500' },
  })
}

export default function ProfileScreen() {
  return <ParentProfile />
}
