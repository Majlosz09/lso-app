import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  RefreshControl, ScrollView
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import { Announcement, Rank } from '../../../types/database'
import { shadow } from '../../../lib/shadows'
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'

type AudienceOption = { key: string; label: string; color: string }

export default function AnnouncementsTab() {
  const { profile } = useAuthStore()
  const { openModal } = useLocalSearchParams<{ openModal?: string }>()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modalVisible, setModalVisible] = useState(openModal === 'true')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [pinned, setPinned] = useState(false)
  const [audience, setAudience] = useState('all')
  const [ranks, setRanks] = useState<Rank[]>([])
  const [submitting, setSubmitting] = useState(false)

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const FIXED_AUDIENCES: AudienceOption[] = useMemo(() => [
    { key: 'all', label: 'Wszyscy', color: c.primary },
    { key: 'members', label: 'Wszyscy ministranci', color: '#2563EB' },
    { key: 'parents', label: 'Wszyscy rodzice', color: '#16A34A' },
  ], [c.primary])

  const fetchAnnouncements = async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('*, author:profiles(full_name)')
      .eq('parish_id', profile?.parish_id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })

    if (!error && data) setAnnouncements(data as Announcement[])
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    supabase.from('ranks').select('*').order('order').then(({ data }) => {
      setRanks(data ?? [])
    })
  }, [])

  useEffect(() => { fetchAnnouncements() }, [])

  const onRefresh = () => { setRefreshing(true); fetchAnnouncements() }

  const handleAdd = async () => {
    if (!title.trim()) { Alert.alert('Błąd', 'Podaj tytuł ogłoszenia.'); return }
    if (!content.trim()) { Alert.alert('Błąd', 'Podaj treść ogłoszenia.'); return }

    setSubmitting(true)
    const { error } = await supabase.from('announcements').insert({
      title: title.trim(),
      content: content.trim(),
      author_id: profile?.id,
      is_pinned: pinned,
      target_audience: audience,
      parish_id: profile?.parish_id,
    })
    setSubmitting(false)

    if (error) {
      Alert.alert('Błąd', error.message)
    } else {
      setTitle(''); setContent(''); setPinned(false); setAudience('all')
      setModalVisible(false)
      fetchAnnouncements()
    }
  }

  const handleDelete = (id: string, annoTitle: string) => {
    Alert.alert('Usuń ogłoszenie', `Usunąć "${annoTitle}"?`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('announcements').delete().eq('id', id)
          if (error) Alert.alert('Błąd', error.message)
          else setAnnouncements(prev => prev.filter(a => a.id !== id))
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.addButtonText}>Nowe ogłoszenie</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
      ) : (
        <FlatList
          data={announcements}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={48} color={c.iconMuted} />
              <Text style={styles.emptyText}>Brak ogłoszeń</Text>
            </View>
          }
          renderItem={({ item }) => {
            const fixedAud = FIXED_AUDIENCES.find(a => a.key === item.target_audience)
            const rankAud = !fixedAud && item.target_audience !== 'all'
              ? ranks.find(r => r.id === item.target_audience)
              : null
            return (
            <View style={[styles.card, item.is_pinned && styles.cardPinned]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  {item.is_pinned && (
                    <View style={styles.pinnedBadge}>
                      <Ionicons name="pin" size={10} color={c.primary} />
                      <Text style={styles.pinnedText}>Przypięte</Text>
                    </View>
                  )}
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    {item.target_audience !== 'all' && (
                      <View style={[styles.audienceBadge, {
                        backgroundColor: (fixedAud?.color ?? c.subtext) + '22',
                      }]}>
                        <Text style={[styles.audienceBadgeText, {
                          color: fixedAud?.color ?? c.subtext,
                        }]}>
                          {fixedAud?.label ?? rankAud?.name ?? item.target_audience}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity onPress={() => handleDelete(item.id, item.title)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </TouchableOpacity>
              </View>
              <Text style={styles.cardContent}>{item.content}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardMeta}>
                  {item.author?.full_name ?? 'Nieznany autor'}
                </Text>
                <Text style={styles.cardMeta}>
                  {new Date(item.created_at).toLocaleDateString('pl-PL', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </Text>
              </View>
            </View>
            )
          }}
          contentContainerStyle={{ padding: 16, gap: 10 }}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setModalVisible(false); setTitle(''); setContent(''); setPinned(false) }}>
              <Ionicons name="close" size={24} color={c.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Nowe ogłoszenie</Text>
            <TouchableOpacity
              onPress={handleAdd}
              disabled={submitting}
              style={[styles.modalSave, submitting && { opacity: 0.5 }]}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.modalSaveText}>Opublikuj</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.inputLabel}>Tytuł *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Tytuł ogłoszenia"
              placeholderTextColor={c.textTertiary}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.inputLabel}>Treść *</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Treść ogłoszenia..."
              placeholderTextColor={c.textTertiary}
              value={content}
              onChangeText={setContent}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            <Text style={styles.inputLabel}>Odbiorcy</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={styles.audienceRow}>
                {[...FIXED_AUDIENCES, ...ranks.map(r => ({ key: r.id, label: r.name, color: c.subtext }))].map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.audienceChip, audience === opt.key && { borderColor: opt.color, backgroundColor: opt.color + '18' }]}
                    onPress={() => setAudience(opt.key)}
                  >
                    <Text style={[styles.audienceChipText, audience === opt.key && { color: opt.color, fontWeight: '700' }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.pinnedToggle}
              onPress={() => setPinned(p => !p)}
            >
              <Ionicons
                name={pinned ? 'checkbox' : 'square-outline'}
                size={22}
                color={c.primary}
              />
              <Text style={styles.pinnedToggleText}>Przypiąć ogłoszenie na górze</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    addButton: {
      flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
      backgroundColor: c.primary, margin: 16, marginBottom: 0,
      borderRadius: 12, padding: 12,
    },
    addButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    card: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14, gap: 8,
      ...shadow.xs,
    },
    cardPinned: { borderLeftWidth: 3, borderLeftColor: c.primary },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardHeaderLeft: { flex: 1, gap: 4, marginRight: 8 },
    pinnedBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.primaryAlpha08, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
      alignSelf: 'flex-start',
    },
    pinnedText: { fontSize: 10, fontWeight: '600', color: c.primary },
    titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    audienceBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    audienceBadgeText: { fontSize: 10, fontWeight: '700' },
    cardContent: { fontSize: 14, color: c.subtext, lineHeight: 20 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
    cardMeta: { fontSize: 12, color: c.textTertiary },

    empty: { alignItems: 'center', marginTop: 60, gap: 12 },
    emptyText: { color: c.textTertiary, fontSize: 15 },

    modalHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.primarySurface,
      backgroundColor: c.surface,
    },
    modalTitle: { fontSize: 17, fontWeight: '600', color: c.text },
    modalSave: {
      backgroundColor: c.primary, borderRadius: 8,
      paddingHorizontal: 14, paddingVertical: 7,
    },
    modalSaveText: { color: '#fff', fontWeight: '600', fontSize: 14 },

    modalBody: { flex: 1, backgroundColor: c.bg },
    modalContent: { padding: 16, gap: 6 },

    inputLabel: { fontSize: 13, fontWeight: '600', color: c.subtext, marginTop: 8 },
    textInput: {
      backgroundColor: c.surface, borderRadius: 10, padding: 13,
      fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.border,
    },
    textArea: { minHeight: 120, textAlignVertical: 'top' },

    pinnedToggle: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, marginTop: 4,
    },
    pinnedToggleText: { fontSize: 15, color: c.text },

    audienceRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
    audienceChip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
    },
    audienceChipText: { fontSize: 13, color: c.subtext, fontWeight: '500' },
  })
}
