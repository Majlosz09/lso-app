import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { BADGE_CATALOG } from '../../lib/badges'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'

type CustomBadge = {
  id: string
  name: string
  icon: string
  criteria_key: string
}

type AwardHistoryRow = {
  id: string
  awarded_at: string
  note: string | null
  profile: { full_name: string } | null
  awarder: { full_name: string } | null
  badge_definition: { name: string; icon: string } | null
}

type AllBadge = {
  id: string; name: string; icon: string; criteria_key: string; parish_id: string | null; type: string
}

type Member = {
  id: string
  full_name: string
}

export default function BadgeManagementScreen() {
  const { profile } = useAuthStore()
  const parishId = profile?.parish_id!
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [customBadges, setCustomBadges] = useState<CustomBadge[]>([])
  const [history, setHistory] = useState<AwardHistoryRow[]>([])
  const [allBadges, setAllBadges] = useState<AllBadge[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [adding, setAdding] = useState(false)

  const [wizardVisible, setWizardVisible] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedBadge, setSelectedBadge] = useState<AllBadge | null>(null)
  const [awardNote, setAwardNote] = useState('')
  const [awarding, setAwarding] = useState(false)

  const fetchData = async () => {
    const [customRes, historyRes, allBadgesRes] = await Promise.all([
      supabase.from('badge_definitions')
        .select('id, name, icon, criteria_key')
        .eq('parish_id', parishId)
        .eq('type', 'manual')
        .order('name'),
      supabase.from('member_badges')
        .select(`
          id, awarded_at, note,
          profile:profiles!profile_id(full_name),
          awarder:profiles!awarded_by(full_name),
          badge_definition:badge_definitions(name, icon)
        `)
        .not('awarded_by', 'is', null)
        .order('awarded_at', { ascending: false })
        .limit(10),
      supabase.from('badge_definitions')
        .select('id, name, icon, criteria_key, parish_id, type')
        .or(`parish_id.is.null,parish_id.eq.${parishId}`)
        .order('name'),
    ])
    if (customRes.error) {
      console.error('[badge-management] custom badges error:', customRes.error)
      Alert.alert('Błąd', 'Nie udało się załadować odznak parafii.')
    }
    if (historyRes.error) {
      console.error('[badge-management] history error:', historyRes.error)
      Alert.alert('Błąd', 'Nie udało się załadować historii przyznanych.')
    }
    setCustomBadges(customRes.data ?? [])
    setHistory((historyRes.data ?? []).filter((h: any) => h.badge_definition !== null) as unknown as AwardHistoryRow[])
    setAllBadges(allBadgesRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [parishId])

  const handleAdd = async () => {
    const name = newName.trim()
    const icon = newIcon.trim()
    if (!name) return
    setAdding(true)
    const { error } = await supabase.from('badge_definitions').insert({
      parish_id: parishId,
      name,
      icon: icon || '🏅',
      type: 'manual',
      persistence: 'permanent',
      criteria_key: 'custom',
    })
    setAdding(false)
    if (error) {
      Alert.alert('Błąd', error.message)
      return
    }
    setNewName('')
    setNewIcon('')
    fetchData()
  }

  const handleDelete = (badge: CustomBadge) => {
    Alert.alert(
      'Usuń odznakę',
      `Usunąć odznakę "${badge.name}"? Zostanie usunięta ze wszystkich ministrantów.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń', style: 'destructive', onPress: async () => {
            const { error } = await supabase.from('badge_definitions').delete().eq('id', badge.id)
            if (error) Alert.alert('Błąd', error.message)
            else fetchData()
          },
        },
      ]
    )
  }

  const fetchMembers = async () => {
    setMembers([])
    setMembersLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('parish_id', parishId)
      .eq('role', 'member')
      .order('full_name')
    if (error) {
      console.error('[badge-management] members error:', error)
      Alert.alert('Błąd', 'Nie udało się załadować listy ministrantów.')
    }
    setMembers(data ?? [])
    setMembersLoading(false)
  }

  const closeWizard = () => {
    setWizardVisible(false)
    setWizardStep(1)
    setSelectedMember(null)
    setSelectedBadge(null)
    setAwardNote('')
    setMemberSearch('')
  }

  const handleAward = async () => {
    if (!selectedMember || !selectedBadge) return
    setAwarding(true)
    const { error } = await supabase.from('member_badges').upsert({
      profile_id: selectedMember.id,
      badge_definition_id: selectedBadge.id,
      awarded_by: profile?.id,
      note: awardNote.trim() || null,
      is_active: true,
    }, { onConflict: 'profile_id,badge_definition_id' })
    setAwarding(false)
    if (error) {
      Alert.alert('Błąd', error.message)
      return
    }
    closeWizard()
    fetchData()
  }

  const filteredMembers = members.filter(m =>
    m.full_name.toLowerCase().includes(memberSearch.toLowerCase())
  )

  const manualBadges = allBadges.filter(b => b.type === 'manual')

  const renderStep1 = () => (
    <View style={{ flex: 1 }}>
      <Text style={styles.stepTitle}>KROK 1 / 3 — Wybierz ministranta</Text>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color={c.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj po imieniu..."
          placeholderTextColor={c.textTertiary}
          value={memberSearch}
          onChangeText={setMemberSearch}
          autoFocus
        />
      </View>
      {membersLoading ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={c.primary} />
      ) : (
        <FlatList
          data={filteredMembers}
          keyExtractor={m => m.id}
          style={styles.pickerList}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = selectedMember?.id === item.id
            return (
              <TouchableOpacity
                style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
                onPress={() => setSelectedMember(item)}
                activeOpacity={0.7}
              >
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>
                    {item.full_name.split(' ').filter(w => w.length > 0).map((w: string) => w[0]).slice(0, 2).join('')}
                  </Text>
                </View>
                <Text style={[styles.pickerRowName, isSelected && { color: '#FFC107' }]}>
                  {item.full_name}
                </Text>
                {isSelected && <Ionicons name="checkmark" size={18} color="#FFC107" />}
              </TouchableOpacity>
            )
          }}
        />
      )}
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.btnBack} onPress={closeWizard}>
          <Text style={styles.btnBackText}>Anuluj</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnNext, !selectedMember && { opacity: 0.4 }]}
          onPress={() => setWizardStep(2)}
          disabled={!selectedMember}
        >
          <Text style={styles.btnNextText}>Dalej →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  const renderStep2 = () => (
    <View style={{ flex: 1 }}>
      <Text style={styles.stepTitle}>KROK 2 / 3 — Wybierz odznakę</Text>
      <Text style={styles.stepSub}>
        Dla: <Text style={{ color: c.text, fontWeight: '700' }}>{selectedMember?.full_name}</Text>
      </Text>
      <FlatList
        data={manualBadges}
        keyExtractor={b => b.id}
        style={styles.pickerList}
        ListEmptyComponent={
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>Brak odznak ręcznych. Dodaj własną odznakę na ekranie Odznaki parafii.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSelected = selectedBadge?.id === item.id
          return (
            <TouchableOpacity
              style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
              onPress={() => setSelectedBadge(item)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 22 }}>{item.icon}</Text>
              <Text style={[styles.pickerRowName, isSelected && { color: '#FFC107' }]}>
                {item.name}
              </Text>
              {isSelected && <Ionicons name="checkmark" size={18} color="#FFC107" />}
            </TouchableOpacity>
          )
        }}
      />
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.btnBack} onPress={() => setWizardStep(1)}>
          <Text style={styles.btnBackText}>← Wstecz</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnNext, !selectedBadge && { opacity: 0.4 }]}
          onPress={() => setWizardStep(3)}
          disabled={!selectedBadge}
        >
          <Text style={styles.btnNextText}>Dalej →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
  const renderStep3 = () => (
    <View>
      <Text style={styles.stepTitle}>KROK 3 / 3 — Potwierdź</Text>

      <View style={styles.summaryCard}>
        <Text style={{ fontSize: 32 }}>{selectedBadge?.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryBadgeName}>{selectedBadge?.name}</Text>
          <Text style={styles.summaryFor}>
            dla: <Text style={{ color: c.text, fontWeight: '700' }}>{selectedMember?.full_name}</Text>
          </Text>
        </View>
      </View>

      <Text style={styles.noteLabel}>Notatka (opcjonalna)</Text>
      <TextInput
        style={styles.noteInput}
        placeholder="Powód wyróżnienia..."
        placeholderTextColor={c.textTertiary}
        value={awardNote}
        onChangeText={setAwardNote}
        multiline
        maxLength={200}
        returnKeyType="done"
        blurOnSubmit
      />

      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.btnBack} onPress={() => setWizardStep(2)}>
          <Text style={styles.btnBackText}>← Wstecz</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnNext, awarding && { opacity: 0.6 }]}
          onPress={handleAward}
          disabled={awarding}
        >
          {awarding
            ? <ActivityIndicator size="small" color="#000" />
            : <Text style={styles.btnNextText}>🏅 Przyznaj</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  )

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 72, 80) }]}
      >
        {/* Sekcja: Odznaki parafii */}
        <SectionHeader label="Odznaki parafii" color="#FFC107" />
        <View style={styles.card}>
          {customBadges.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>Brak własnych odznak. Dodaj pierwszą poniżej.</Text>
            </View>
          ) : (
            customBadges.map((b, i) => (
              <View key={b.id} style={[styles.badgeRow, i < customBadges.length - 1 && styles.rowBorder]}>
                <View style={styles.badgeIconTile}>
                  <Text style={styles.badgeIcon}>{b.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.badgeName}>{b.name}</Text>
                  <Text style={styles.badgeSub}>Przyznawana ręcznie</Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(b)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color="#DC2626" />
                </TouchableOpacity>
              </View>
            ))
          )}
          <View style={[styles.addRow, customBadges.length > 0 && styles.rowBorder]}>
            <TextInput
              style={[styles.addInput, { width: 52 }]}
              placeholder="🏅"
              placeholderTextColor={c.textTertiary}
              value={newIcon}
              onChangeText={setNewIcon}
              maxLength={4}
            />
            <TextInput
              style={[styles.addInput, { flex: 1 }]}
              placeholder="Nazwa odznaki..."
              placeholderTextColor={c.textTertiary}
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={handleAdd}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.addButton, (!newName.trim() || adding) && { opacity: 0.4 }]}
              onPress={handleAdd}
              disabled={!newName.trim() || adding}
            >
              {adding
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="add" size={22} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* Sekcja: Ostatnio przyznane */}
        <SectionHeader label="Ostatnio przyznane" color="#30d158" />
        <View style={styles.card}>
          {history.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>Brak ręcznie przyznanych odznak.</Text>
            </View>
          ) : (
            history.map((h, i) => (
              <View key={h.id} style={[styles.historyRow, i < history.length - 1 && styles.rowBorder]}>
                <Text style={styles.historyIcon}>{h.badge_definition?.icon ?? '🏅'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyBadgeName}>{h.badge_definition?.name ?? ''}</Text>
                  <Text style={styles.historyMeta}>
                    {h.profile?.full_name ?? '—'}
                    {' · '}
                    {new Date(h.awarded_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                  {h.awarder && (
                    <Text style={styles.historyAwarder}>przez {h.awarder.full_name}</Text>
                  )}
                  {h.note && <Text style={styles.historyNote}>{h.note}</Text>}
                </View>
              </View>
            ))
          )}
        </View>
        {/* Sekcja: Katalog systemowy */}
        <SectionHeader label="Katalog systemowy" color="#636366" />
        <View style={styles.card}>
          {allBadges.filter(b => b.type === 'auto').map((b, i, arr) => (
            <View key={b.id} style={[styles.catalogRow, i < arr.length - 1 && styles.rowBorder]}>
              <View style={[styles.badgeIconTile, { backgroundColor: c.inputBg }]}>
                <Text style={styles.badgeIcon}>{b.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.badgeName}>{b.name}</Text>
                <Text style={styles.catalogDesc}>
                  {BADGE_CATALOG[b.criteria_key] ?? '—'}
                </Text>
              </View>
              <View style={styles.autoChip}>
                <Text style={styles.autoChipText}>Auto</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* FAB */}
      <View style={[styles.fabWrap, { bottom: Math.max(insets.bottom + 16, 24) }]}>
        <View style={styles.fabTip}>
          <Text style={styles.fabTipText}>Przyznaj odznakę</Text>
        </View>
        <TouchableOpacity style={styles.fab} onPress={() => { setWizardVisible(true); fetchMembers() }} activeOpacity={0.85}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <Modal
        visible={wizardVisible}
        transparent
        animationType="slide"
        onRequestClose={closeWizard}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeWizard} activeOpacity={1} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <StepDots current={wizardStep} />
            {wizardStep === 1 && renderStep1()}
            {wizardStep === 2 && renderStep2()}
            {wizardStep === 3 && renderStep3()}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

function StepDots({ current }: { current: 1 | 2 | 3 }) {
  const dot = (n: number) => {
    const isActive = n === current
    const isDone = n < current
    return (
      <View
        key={n}
        style={{
          width: isActive ? 20 : 7, height: 7, borderRadius: 4,
          backgroundColor: isDone ? '#30d158' : isActive ? '#FFC107' : '#3a3a3c',
        }}
      />
    )
  }
  return (
    <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'center', marginBottom: 8 }}>
      {[1, 2, 3].map(dot)}
    </View>
  )
}

function SectionHeader({ label, color }: { label: string; color: string }) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={[styles.sectionAccent, { backgroundColor: color }]} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    scroll: { flex: 1 },
    content: { padding: 16, gap: 12 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    sectionHeaderRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 4, paddingBottom: 6,
    },
    sectionAccent: {
      width: 3, height: 13, borderRadius: 2,
    },
    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.8,
    },
    card: {
      backgroundColor: c.surface, borderRadius: 14,
      overflow: 'hidden',
      ...shadow.xs,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: c.primarySurface },
    emptyRow: { padding: 16, alignItems: 'center' },
    emptyText: { fontSize: 13, color: c.textTertiary, textAlign: 'center' },

    badgeRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 12,
    },
    badgeIconTile: {
      width: 32, height: 32, borderRadius: 8,
      backgroundColor: c.goldAlpha,
      justifyContent: 'center', alignItems: 'center',
    },
    badgeIcon: { fontSize: 18 },
    badgeName: { fontSize: 15, fontWeight: '500', color: c.text },
    badgeSub: { fontSize: 11, color: c.textTertiary, marginTop: 1 },

    addRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    addInput: {
      backgroundColor: c.bg, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.border,
    },
    addButton: {
      width: 44, height: 44, borderRadius: 10,
      backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center',
    },

    historyRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      paddingHorizontal: 16, paddingVertical: 12,
    },
    historyIcon: { fontSize: 22, lineHeight: 26 },
    historyBadgeName: { fontSize: 14, fontWeight: '600', color: c.text },
    historyMeta: { fontSize: 12, color: c.subtext, marginTop: 2 },
    historyAwarder: { fontSize: 11, color: c.textTertiary, marginTop: 1 },
    historyNote: { fontSize: 12, color: c.textTertiary, marginTop: 2, fontStyle: 'italic' },

    catalogRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 12,
    },
    catalogDesc: { fontSize: 12, color: c.subtext, marginTop: 2 },
    autoChip: {
      backgroundColor: c.primarySurface, borderRadius: 5,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    autoChipText: { fontSize: 10, color: c.textTertiary },

    fabWrap: {
      position: 'absolute', right: 16,
      flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    fabTip: {
      backgroundColor: c.surface, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6,
      ...shadow.xs,
    },
    fabTipText: { fontSize: 12, color: c.text, fontWeight: '500' },
    fab: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: '#FFC107',
      justifyContent: 'center', alignItems: 'center',
      ...shadow.xs,
    },

    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingHorizontal: 16, paddingBottom: 16,
      paddingTop: 12,
      maxHeight: '85%',
    },
    sheetHandle: {
      width: 36, height: 4, borderRadius: 2,
      backgroundColor: c.border, alignSelf: 'center', marginBottom: 14,
    },

    stepTitle: {
      fontSize: 11, fontWeight: '700', color: '#FFC107',
      textTransform: 'uppercase', letterSpacing: 0.5,
      textAlign: 'center', marginBottom: 12,
    },
    stepSub: { fontSize: 12, color: c.textTertiary, textAlign: 'center', marginBottom: 12 },
    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.bg, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 8,
      marginBottom: 10, borderWidth: 1, borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.text },
    pickerList: { maxHeight: 240 },
    pickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, paddingHorizontal: 4,
      borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    pickerRowSelected: { backgroundColor: '#FFC10710', borderRadius: 8 },
    pickerRowName: { flex: 1, fontSize: 14, color: c.text },
    memberAvatar: {
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: c.primarySurface,
      justifyContent: 'center', alignItems: 'center',
    },
    memberAvatarText: { fontSize: 11, fontWeight: '700', color: c.textTertiary },
    btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    btnBack: {
      flex: 1, backgroundColor: c.bg, borderRadius: 12,
      paddingVertical: 12, alignItems: 'center',
      borderWidth: 1, borderColor: c.border,
    },
    btnBackText: { fontSize: 14, color: c.subtext, fontWeight: '600' },
    btnNext: {
      flex: 1.5, borderRadius: 12,
      paddingVertical: 12, alignItems: 'center',
      backgroundColor: '#FFC107',
    },
    btnNextText: { fontSize: 14, color: '#000', fontWeight: '700' },

    summaryCard: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: c.bg, borderRadius: 12,
      padding: 14, marginBottom: 14,
      borderWidth: 1, borderColor: '#FFC10740',
    },
    summaryBadgeName: { fontSize: 16, fontWeight: '700', color: c.text },
    summaryFor: { fontSize: 12, color: c.textTertiary, marginTop: 3 },
    noteLabel: {
      fontSize: 11, fontWeight: '700', color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
    },
    noteInput: {
      backgroundColor: c.bg, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 14, color: c.text,
      borderWidth: 1, borderColor: c.border,
      minHeight: 72, textAlignVertical: 'top',
      marginBottom: 4,
    },
  })
}
