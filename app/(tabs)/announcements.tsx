import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
  ActivityIndicator, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, Switch, ScrollView
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { shadow } from '../../lib/shadows'
import { useAuthStore } from '../../stores/authStore'
import { Announcement } from '../../types/database'

export default function AnnouncementsScreen() {
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [modalVisible, setModalVisible] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchAnnouncements = async () => {
    let query = supabase
      .from('announcements')
      .select('*, author:profiles(full_name)')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })

    if (profile?.role === 'member') {
      const targets = ['all', 'members']
      if (profile.rank_id) targets.push(profile.rank_id)
      query = query.in('target_audience', targets)
    } else if (profile?.role === 'parent') {
      query = query.in('target_audience', ['all', 'parents'])
    }

    const { data, error } = await query
    if (!error && data) setAnnouncements(data)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchAnnouncements() }, [])

  const onRefresh = () => { setRefreshing(true); fetchAnnouncements() }

  const handleCreate = async () => {
    if (!newTitle.trim()) { Alert.alert('Błąd', 'Wpisz tytuł ogłoszenia.'); return }
    if (!newContent.trim()) { Alert.alert('Błąd', 'Wpisz treść ogłoszenia.'); return }

    setSubmitting(true)
    const { error } = await supabase.from('announcements').insert({
      title: newTitle.trim(),
      content: newContent.trim(),
      author_id: profile?.id,
      is_pinned: isPinned,
    })
    setSubmitting(false)

    if (error) {
      Alert.alert('Błąd', 'Nie udało się dodać ogłoszenia: ' + error.message)
    } else {
      setModalVisible(false)
      setNewTitle('')
      setNewContent('')
      setIsPinned(false)
      fetchAnnouncements()
    }
  }

  const handleDelete = (item: Announcement) => {
    Alert.alert(
      'Usuń ogłoszenie',
      `Czy na pewno chcesz usunąć "${item.title}"?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń', style: 'destructive',
          onPress: async () => {
            await supabase.from('announcements').delete().eq('id', item.id)
            fetchAnnouncements()
          },
        },
      ]
    )
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={announcements}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="megaphone-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Brak ogłoszeń</Text>
          </View>
        }
        renderItem={({ item }) => (
          <AnnouncementCard
            item={item}
            isAdmin={isAdmin}
            onDelete={() => handleDelete(item)}
          />
        )}
        contentContainerStyle={{ padding: 16, gap: 12 }}
      />

      {isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCancel}>Anuluj</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Nowe ogłoszenie</Text>
            <TouchableOpacity onPress={handleCreate} disabled={submitting}>
              {submitting
                ? <ActivityIndicator color="#534AB7" />
                : <Text style={styles.modalSave}>Dodaj</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Tytuł</Text>
            <TextInput
              style={styles.input}
              placeholder="Tytuł ogłoszenia"
              value={newTitle}
              onChangeText={setNewTitle}
            />

            <Text style={styles.label}>Treść</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Treść ogłoszenia..."
              value={newContent}
              onChangeText={setNewContent}
              multiline
              numberOfLines={6}
            />

            <View style={styles.pinRow}>
              <View>
                <Text style={styles.pinLabel}>Przypnij ogłoszenie</Text>
                <Text style={styles.pinSub}>Przypięte pojawiają się zawsze na górze</Text>
              </View>
              <Switch
                value={isPinned}
                onValueChange={setIsPinned}
                trackColor={{ true: '#534AB7' }}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

function AnnouncementCard({
  item, isAdmin, onDelete
}: {
  item: Announcement; isAdmin: boolean; onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isLong = item.content.length > 150

  return (
    <TouchableOpacity
      style={[styles.card, item.is_pinned && styles.cardPinned]}
      onPress={() => isLong && setExpanded(e => !e)}
      activeOpacity={isLong ? 0.7 : 1}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          {item.is_pinned && (
            <Ionicons name="pin" size={14} color="#534AB7" style={{ marginRight: 4 }} />
          )}
          <Text style={styles.cardTitle}>{item.title}</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Ionicons name="trash-outline" size={18} color="#e74c3c" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.cardContent} numberOfLines={expanded ? undefined : (isLong ? 3 : undefined)}>
        {item.content}
      </Text>

      {isLong && (
        <Text style={styles.expandText}>{expanded ? 'Zwiń' : 'Czytaj więcej'}</Text>
      )}

      <View style={styles.cardFooter}>
        <Ionicons name="person-outline" size={12} color="#bbb" />
        <Text style={styles.cardMeta}>{(item.author as any)?.full_name ?? 'Administrator'}</Text>
        <Text style={styles.cardDot}>·</Text>
        <Text style={styles.cardMeta}>
          {new Date(item.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', marginTop: 80, gap: 12 },
  emptyText: { color: '#aaa', fontSize: 16 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 8,
    ...shadow.md,
  },
  cardPinned: {
    borderLeftWidth: 3, borderLeftColor: '#534AB7',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  cardContent: { fontSize: 14, color: '#444', lineHeight: 21 },
  expandText: { fontSize: 13, color: '#534AB7', fontWeight: '500' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cardMeta: { fontSize: 12, color: '#bbb' },
  cardDot: { color: '#ddd', fontSize: 12 },

  fab: {
    position: 'absolute', right: 20, bottom: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#534AB7', justifyContent: 'center', alignItems: 'center',
    ...shadow.brand,
  },

  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  modalCancel: { fontSize: 15, color: '#888' },
  modalSave: { fontSize: 15, color: '#534AB7', fontWeight: '600' },
  modalBody: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },

  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4, marginTop: 12 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, padding: 13,
    fontSize: 15, color: '#1a1a1a', borderWidth: 1, borderColor: '#e8e8e8',
  },
  inputMultiline: { minHeight: 120, textAlignVertical: 'top' },

  pinRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 16,
  },
  pinLabel: { fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  pinSub: { fontSize: 12, color: '#aaa', marginTop: 2 },
})
