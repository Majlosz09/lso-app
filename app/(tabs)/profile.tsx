import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Platform, Image,
  Modal, TextInput, KeyboardAvoidingView
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { shadow } from '../../lib/shadows'
import { useAuthStore } from '../../stores/authStore'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  member: 'Ministrant',
  parent: 'Rodzic',
}

export default function ProfileScreen() {
  const { profile } = useAuthStore()
  if (profile?.role === 'admin') return <AdminProfile />
  if (profile?.role === 'parent') return <ParentProfile />
  return <MemberProfile />
}

// ─── Shared: Avatar Card ──────────────────────────────────────────────────────

function AvatarCard() {
  const { profile, fetchProfile } = useAuthStore()
  const [uploading, setUploading] = useState(false)
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null)

  const pickAvatar = async () => {
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

    setUploading(true)
    try {
      const uri = result.assets[0].uri
      const response = await fetch(uri)
      if (!response.ok) throw new Error(`Fetch obrazu nieudany: ${response.status}`)

      const blob = await response.blob()
      if (blob.size === 0) throw new Error('Pusty plik obrazu')
      const contentType = blob.type || 'image/jpeg'
      const path = `${profile!.id}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType, upsert: true })

      if (uploadError) { Alert.alert('Błąd uploadu', uploadError.message); return }

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const urlWithBuster = `${publicUrl}?t=${Date.now()}`

      const { error: updateError } = await supabase
        .from('profiles').update({ avatar_url: publicUrl }).eq('id', profile!.id)
      if (updateError) { Alert.alert('Błąd zapisu profilu', updateError.message); return }

      setLocalAvatarUrl(urlWithBuster)
      fetchProfile()
    } catch (e: any) {
      Alert.alert('Błąd', e.message)
    } finally {
      setUploading(false)
    }
  }

  const displayUrl = localAvatarUrl ?? profile?.avatar_url

  return (
    <View style={styles.avatarCard}>
      <TouchableOpacity onPress={pickAvatar} disabled={uploading} style={styles.avatarWrapper}>
        {displayUrl
          ? <Image source={{ uri: displayUrl }} style={styles.avatarImage} />
          : <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={40} color="#534AB7" />
            </View>
        }
        <View style={styles.avatarEditBadge}>
          {uploading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="camera" size={14} color="#fff" />
          }
        </View>
      </TouchableOpacity>
      <Text style={styles.name}>{profile?.full_name ?? '—'}</Text>
      <View style={styles.roleBadge}>
        <Text style={styles.roleText}>{ROLE_LABELS[profile?.role ?? ''] ?? profile?.role}</Text>
      </View>
      <Text style={styles.email}>{useAuthStore.getState().session?.user.email}</Text>
    </View>
  )
}

// ─── Member Profile ───────────────────────────────────────────────────────────

function MemberProfile() {
  const { profile, session, signOut } = useAuthStore()
  const [summary, setSummary] = useState<{ total_points: number; services_count: number } | null>(null)
  const [rank, setRank] = useState<number>(0)
  const [rankName, setRankName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    const queries: PromiseLike<any>[] = [
      supabase.from('points_summary').select('total_points, services_count').eq('profile_id', profile.id).maybeSingle(),
      supabase.from('points_summary').select('profile_id').order('total_points', { ascending: false }),
    ]
    if (profile.rank_id) {
      queries.push(supabase.from('ranks').select('name').eq('id', profile.rank_id).single())
    }
    Promise.all(queries).then(([summaryRes, rankingRes, rankRes]) => {
      if (summaryRes.data) setSummary(summaryRes.data as any)
      if (rankingRes.data) {
        const pos = (rankingRes.data as any[]).findIndex(r => r.profile_id === profile.id) + 1
        setRank(pos)
      }
      if (rankRes?.data) setRankName(rankRes.data.name)
      setLoading(false)
    })
  }, [profile?.id, profile?.rank_id])

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Czy na pewno chcesz się wylogować?')) signOut()
      return
    }
    Alert.alert('Wylogowanie', 'Czy na pewno chcesz się wylogować?', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Wyloguj', style: 'destructive', onPress: signOut },
    ])
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AvatarCard />

      {loading ? (
        <ActivityIndicator color="#534AB7" style={{ marginVertical: 8 }} />
      ) : (
        <View style={styles.statsRow}>
          <StatCard icon="trophy" iconColor="#f0a500" value={summary?.total_points ?? 0} label="Punkty" />
          <StatCard icon="checkmark-circle" iconColor="#27ae60" value={summary?.services_count ?? 0} label="Służby" />
          {rank > 0 && <StatCard icon="podium" iconColor="#534AB7" value={`#${rank}`} label="Ranking" />}
        </View>
      )}

      <InfoSection title="Informacje" onEdit={() => setEditing(true)}>
        <InfoRow icon="person-outline" label="Imię i nazwisko" value={profile?.full_name ?? '—'} />
        <InfoRow icon="mail-outline" label="Email" value={session?.user.email ?? '—'} />
        <InfoRow icon="call-outline" label="Telefon" value={profile?.phone ?? 'Nie podano'} />
        <InfoRow icon="calendar-outline" label="Rocznik" value={profile?.rocznik ? String(profile.rocznik) : 'Nie podano'} />
        <InfoRow icon="ribbon-outline" label="Ranga" value={rankName ?? 'Brak rangi'} last />
      </InfoSection>

      <EditProfileModal visible={editing} onClose={() => setEditing(false)} showRocznik={true} />
      <SignOutButton onPress={handleSignOut} />
    </ScrollView>
  )
}

// ─── Admin Profile ────────────────────────────────────────────────────────────

function AdminProfile() {
  const { profile, session, signOut } = useAuthStore()
  const [stats, setStats] = useState({ members: 0, upcoming: 0 })
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'member').eq('is_active', true),
      supabase.from('schedules').select('id', { count: 'exact', head: true }).gte('date', today),
    ]).then(([membersRes, schedulesRes]) => {
      setStats({ members: membersRes.count ?? 0, upcoming: schedulesRes.count ?? 0 })
      setLoading(false)
    })
  }, [])

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Czy na pewno chcesz się wylogować?')) signOut()
      return
    }
    Alert.alert('Wylogowanie', 'Czy na pewno chcesz się wylogować?', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Wyloguj', style: 'destructive', onPress: signOut },
    ])
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AvatarCard />

      {loading ? (
        <ActivityIndicator color="#534AB7" style={{ marginVertical: 8 }} />
      ) : (
        <View style={styles.statsRow}>
          <StatCard icon="people" iconColor="#534AB7" value={stats.members} label="Ministranci parafii" />
          <StatCard icon="calendar" iconColor="#27ae60" value={stats.upcoming} label="Nadchodzące służby" />
        </View>
      )}

      <InfoSection title="Informacje" onEdit={() => setEditing(true)}>
        <InfoRow icon="person-outline" label="Imię i nazwisko" value={profile?.full_name ?? '—'} />
        <InfoRow icon="mail-outline" label="Email" value={session?.user.email ?? '—'} />
        <InfoRow icon="call-outline" label="Telefon" value={profile?.phone ?? 'Nie podano'} last />
      </InfoSection>

      <EditProfileModal visible={editing} onClose={() => setEditing(false)} showRocznik={false} />
      <SignOutButton onPress={handleSignOut} />
    </ScrollView>
  )
}

// ─── Parent Profile ───────────────────────────────────────────────────────────

type Child = { id: string; full_name: string; services_count: number }

function ParentProfile() {
  const { profile, session, signOut } = useAuthStore()
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    supabase.from('profiles').select('id, full_name').eq('parent_id', profile.id).then(async ({ data }) => {
      if (!data || data.length === 0) { setLoading(false); return }

      const summaries = await Promise.all(
        data.map((c: any) =>
          supabase.from('points_summary').select('services_count').eq('profile_id', c.id).single()
        )
      )
      setChildren(data.map((c: any, i: number) => ({
        id: c.id,
        full_name: c.full_name,
        services_count: (summaries[i].data as any)?.services_count ?? 0,
      })))
      setLoading(false)
    })
  }, [profile?.id])

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Czy na pewno chcesz się wylogować?')) signOut()
      return
    }
    Alert.alert('Wylogowanie', 'Czy na pewno chcesz się wylogować?', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Wyloguj', style: 'destructive', onPress: signOut },
    ])
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AvatarCard />

      <InfoSection title="Powiązane dzieci">
        {loading ? (
          <ActivityIndicator color="#534AB7" style={{ margin: 16 }} />
        ) : children.length === 0 ? (
          <View style={styles.emptyChildren}>
            <Ionicons name="people-outline" size={32} color="#ccc" />
            <Text style={styles.emptyChildrenText}>Brak powiązanych kont dzieci</Text>
          </View>
        ) : (
          children.map((child, i) => (
            <View key={child.id} style={[styles.childRow, i < children.length - 1 && styles.childRowBorder]}>
              <View style={styles.childAvatar}>
                <Ionicons name="person" size={16} color="#534AB7" />
              </View>
              <Text style={styles.childName}>{child.full_name}</Text>
              <View style={styles.childBadge}>
                <Ionicons name="checkmark-circle-outline" size={13} color="#27ae60" />
                <Text style={styles.childBadgeText}>{child.services_count} służb</Text>
              </View>
            </View>
          ))
        )}
      </InfoSection>

      <InfoSection title="Informacje" onEdit={() => setEditing(true)}>
        <InfoRow icon="person-outline" label="Imię i nazwisko" value={profile?.full_name ?? '—'} />
        <InfoRow icon="mail-outline" label="Email" value={session?.user.email ?? '—'} />
        <InfoRow icon="call-outline" label="Telefon" value={profile?.phone ?? 'Nie podano'} last />
      </InfoSection>

      <EditProfileModal visible={editing} onClose={() => setEditing(false)} showRocznik={false} />
      <SignOutButton onPress={handleSignOut} />
    </ScrollView>
  )
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────

function EditProfileModal({ visible, onClose, showRocznik }: {
  visible: boolean; onClose: () => void; showRocznik: boolean
}) {
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
      updates.rocznik = (rocznik && yr >= 1990 && yr <= new Date().getFullYear()) ? yr : null
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', profile!.id)
    setSaving(false)
    if (error) { Alert.alert('Błąd', error.message); return }
    await fetchProfile()
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
                <Ionicons name="close" size={24} color="#666" />
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

function StatCard({ icon, iconColor, value, label }: { icon: any; iconColor: string; value: number | string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={22} color={iconColor} />
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function InfoSection({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit?: () => void }) {
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
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Ionicons name={icon} size={16} color="#888" style={{ width: 20 }} />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  )
}

function SignOutButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.signOutButton} onPress={onPress}>
      <Ionicons name="log-out-outline" size={20} color="#e74c3c" />
      <Text style={styles.signOutText}>Wyloguj się</Text>
    </TouchableOpacity>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, gap: 16 },

  avatarCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    alignItems: 'center', gap: 8,
    ...shadow.md,
  },
  avatarWrapper: { position: 'relative', marginBottom: 4 },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#534AB711', justifyContent: 'center', alignItems: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#534AB7', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  name: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  roleBadge: {
    backgroundColor: '#534AB722', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  roleText: { fontSize: 13, color: '#534AB7', fontWeight: '600' },
  email: { fontSize: 13, color: '#aaa' },

  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14,
    alignItems: 'center', gap: 4,
    ...shadow.xs,
  },
  statNumber: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  statLabel: { fontSize: 11, color: '#888', textAlign: 'center' },

  section: { gap: 8 },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  infoCard: {
    backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    ...shadow.xs,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, color: '#aaa' },
  infoValue: { fontSize: 15, color: '#1a1a1a', marginTop: 1 },

  childRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  childRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  childAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#534AB711', justifyContent: 'center', alignItems: 'center',
  },
  childName: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  childBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  childBadgeText: { fontSize: 13, color: '#27ae60', fontWeight: '500' },

  emptyChildren: { alignItems: 'center', padding: 24, gap: 8 },
  emptyChildrenText: { fontSize: 14, color: '#aaa', textAlign: 'center' },

  signOutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#e74c3c22',
    ...shadow.xs,
  },
  signOutText: { fontSize: 15, fontWeight: '600', color: '#e74c3c' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { fontSize: 13, fontWeight: '600', color: '#534AB7' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  editSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 12,
  },
  editSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  editSheetTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  editNameRow: { flexDirection: 'row', gap: 10 },
  editInput: {
    backgroundColor: '#f5f5f5', borderRadius: 10, padding: 13,
    fontSize: 15, color: '#1a1a1a', borderWidth: 1, borderColor: '#e8e8e8',
  },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  editCancelBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    backgroundColor: '#f0f0f0', alignItems: 'center',
  },
  editCancelText: { fontSize: 15, fontWeight: '600', color: '#666' },
  editSaveBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    backgroundColor: '#534AB7', alignItems: 'center',
  },
  editSaveText: { fontSize: 15, fontWeight: '600', color: '#fff' },
})
