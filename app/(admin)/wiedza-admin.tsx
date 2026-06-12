import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, KeyboardAvoidingView,
  Platform, Alert
} from 'react-native'
import Toast from 'react-native-toast-message'
import { Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { WIEDZA_DATA } from '../../lib/wiedza'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'

type Entry = {
  id: string
  category_id: string
  section: string
  title: string
  content: string
  subtitle: string | null
  display_order: number
}

const CATEGORIES = WIEDZA_DATA.map(c => ({ id: c.id, title: c.title, emoji: c.emoji }))

const EMPTY_FORM = { category_id: 'modlitwy', section: '', title: '', content: '', subtitle: '' }

export default function WiedzaAdminScreen() {
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const insets = useSafeAreaInsets()

  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [formVisible, setFormVisible] = useState(false)
  const [editEntry, setEditEntry] = useState<Entry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchEntries = useCallback(async () => {
    if (!profile?.parish_id) return
    const { data, error } = await supabase
      .from('wiedza_entries')
      .select('*')
      .eq('parish_id', profile.parish_id)
      .order('category_id')
      .order('display_order')
    if (!error) setEntries(data ?? [])
    setLoading(false)
  }, [profile?.parish_id])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const openAdd = () => {
    setEditEntry(null)
    setForm({ ...EMPTY_FORM, category_id: selectedCategory ?? 'modlitwy' })
    setFormVisible(true)
  }

  const openEdit = (entry: Entry) => {
    setEditEntry(entry)
    setForm({
      category_id: entry.category_id,
      section: entry.section,
      title: entry.title,
      content: entry.content,
      subtitle: entry.subtitle ?? '',
    })
    setFormVisible(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) { Toast.show({ type: 'error', text1: 'Wpisz tytuł' }); return }
    if (!form.content.trim()) { Toast.show({ type: 'error', text1: 'Wpisz treść' }); return }

    setSaving(true)
    if (editEntry) {
      const { error } = await supabase.from('wiedza_entries').update({
        category_id: form.category_id,
        section: form.section.trim(),
        title: form.title.trim(),
        content: form.content.trim(),
        subtitle: form.subtitle.trim() || null,
      }).eq('id', editEntry.id)
      setSaving(false)
      if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
      Toast.show({ type: 'success', text1: 'Wpis zaktualizowany' })
    } else {
      const { error } = await supabase.from('wiedza_entries').insert({
        parish_id: profile!.parish_id,
        category_id: form.category_id,
        section: form.section.trim(),
        title: form.title.trim(),
        content: form.content.trim(),
        subtitle: form.subtitle.trim() || null,
        display_order: entries.filter(e => e.category_id === form.category_id).length,
      })
      setSaving(false)
      if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
      Toast.show({ type: 'success', text1: 'Wpis dodany' })
    }
    setFormVisible(false)
    fetchEntries()
  }

  const handleDelete = (entry: Entry) => {
    Alert.alert(
      'Usuń wpis',
      `Usunąć "${entry.title}"? Tej operacji nie można cofnąć.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń', style: 'destructive',
          onPress: async () => {
            setDeleting(entry.id)
            const { error } = await supabase.from('wiedza_entries').delete().eq('id', entry.id)
            setDeleting(null)
            if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
            setEntries(prev => prev.filter(e => e.id !== entry.id))
            Toast.show({ type: 'success', text1: 'Wpis usunięty' })
          },
        },
      ]
    )
  }

  const filteredEntries = selectedCategory
    ? entries.filter(e => e.category_id === selectedCategory)
    : entries

  const catLabel = (id: string) => CATEGORIES.find(c => c.id === id)?.title ?? id

  return (
    <>
      <Stack.Screen options={{ title: 'Wiedza — wpisy parafii' }} />

      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 80, 32) }]}>

        {/* Filtr kategorii */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, selectedCategory === null && styles.filterChipActive]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={[styles.filterChipText, selectedCategory === null && styles.filterChipTextActive]}>Wszystkie</Text>
          </TouchableOpacity>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.filterChip, selectedCategory === cat.id && styles.filterChipActive]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Text style={styles.filterChipEmoji}>{cat.emoji}</Text>
              <Text style={[styles.filterChipText, selectedCategory === cat.id && styles.filterChipTextActive]}>{cat.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Informacja */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={16} color={c.primary} />
          <Text style={styles.infoText}>
            Tutaj dodajesz własne wpisy dla swojej parafii. Pojawiają się one w sekcji Wiedzy obok domyślnych treści.
          </Text>
        </View>

        {/* Lista wpisów */}
        {loading ? (
          <ActivityIndicator color={c.primary} style={{ marginTop: 40 }} />
        ) : filteredEntries.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={48} color={c.iconMuted} />
            <Text style={styles.emptyTitle}>Brak własnych wpisów</Text>
            <Text style={styles.emptySub}>Naciśnij „+" aby dodać pierwszy wpis dla tej parafii</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {filteredEntries.map(entry => (
              <View key={entry.id} style={styles.entryCard}>
                <View style={styles.entryMeta}>
                  <Text style={styles.entryCat}>
                    {CATEGORIES.find(cat => cat.id === entry.category_id)?.emoji ?? '📄'} {catLabel(entry.category_id)}
                    {entry.section ? ` · ${entry.section}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={() => openEdit(entry)} hitSlop={8}>
                      <Ionicons name="create-outline" size={20} color={c.primary} />
                    </TouchableOpacity>
                    {deleting === entry.id
                      ? <ActivityIndicator size="small" color={c.danger} />
                      : <TouchableOpacity onPress={() => handleDelete(entry)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={20} color={c.danger} />
                        </TouchableOpacity>
                    }
                  </View>
                </View>
                <Text style={styles.entryTitle}>{entry.title}</Text>
                {entry.subtitle ? <Text style={styles.entrySubtitle}>{entry.subtitle}</Text> : null}
                <Text style={styles.entryContent} numberOfLines={3}>{entry.content}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB dodaj */}
      <TouchableOpacity
        style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 16 }]}
        onPress={openAdd}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Formularz dodaj/edytuj */}
      <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.formModal, { paddingTop: insets.top + 16 }]}>
            <View style={styles.formHeader}>
              <TouchableOpacity onPress={() => setFormVisible(false)}>
                <Text style={styles.formCancel}>Anuluj</Text>
              </TouchableOpacity>
              <Text style={styles.formTitle}>{editEntry ? 'Edytuj wpis' : 'Nowy wpis'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={c.primary} />
                  : <Text style={styles.formSave}>Zapisz</Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">

              {/* Kategoria */}
              <Text style={styles.fieldLabel}>Kategoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.filterChip, form.category_id === cat.id && styles.filterChipActive]}
                    onPress={() => setForm(f => ({ ...f, category_id: cat.id }))}
                  >
                    <Text style={styles.filterChipEmoji}>{cat.emoji}</Text>
                    <Text style={[styles.filterChipText, form.category_id === cat.id && styles.filterChipTextActive]}>{cat.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>Sekcja <Text style={styles.fieldOptional}>(opcjonalnie)</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="np. Modlitwy specjalne"
                placeholderTextColor={c.textTertiary}
                value={form.section}
                onChangeText={t => setForm(f => ({ ...f, section: t }))}
              />

              <Text style={styles.fieldLabel}>Tytuł *</Text>
              <TextInput
                style={styles.input}
                placeholder="Tytuł wpisu"
                placeholderTextColor={c.textTertiary}
                value={form.title}
                onChangeText={t => setForm(f => ({ ...f, title: t }))}
              />

              <Text style={styles.fieldLabel}>Podtytuł <Text style={styles.fieldOptional}>(opcjonalnie, np. łaciński odpowiednik)</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="np. łac. Pater Noster"
                placeholderTextColor={c.textTertiary}
                value={form.subtitle}
                onChangeText={t => setForm(f => ({ ...f, subtitle: t }))}
              />

              <Text style={styles.fieldLabel}>Treść *</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Pełna treść wpisu..."
                placeholderTextColor={c.textTertiary}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
                value={form.content}
                onChangeText={t => setForm(f => ({ ...f, content: t }))}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 16 },

    filterRow: { gap: 8, paddingBottom: 4 },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.surface, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1, borderColor: c.border,
    },
    filterChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    filterChipEmoji: { fontSize: 14 },
    filterChipText: { fontSize: 13, fontWeight: '500', color: c.subtext },
    filterChipTextActive: { color: '#fff' },

    infoBox: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8,
      backgroundColor: c.primaryAlpha08, borderRadius: 10,
      padding: 12, borderWidth: 1, borderColor: c.primaryAlpha20,
    },
    infoText: { flex: 1, fontSize: 13, color: c.subtext, lineHeight: 18 },

    empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: c.textTertiary },
    emptySub: { fontSize: 13, color: c.iconMuted, textAlign: 'center', paddingHorizontal: 24 },

    entryCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14, gap: 6,
      ...shadow.xs,
    },
    entryMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
    entryCat: { fontSize: 12, color: c.primary, fontWeight: '600' },
    entryTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    entrySubtitle: { fontSize: 12, color: c.subtext, fontStyle: 'italic' },
    entryContent: { fontSize: 13, color: c.textTertiary, lineHeight: 19 },

    fab: {
      position: 'absolute', right: 20,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center',
      ...shadow.md,
    },

    formModal: { flex: 1, backgroundColor: c.bg },
    formHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingBottom: 16,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    formTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    formCancel: { fontSize: 15, color: c.subtext },
    formSave: { fontSize: 15, color: c.primary, fontWeight: '600' },
    formContent: { padding: 20, gap: 4, paddingBottom: 40 },

    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.subtext, marginTop: 12, marginBottom: 6 },
    fieldOptional: { fontWeight: '400', color: c.textTertiary },
    input: {
      backgroundColor: c.surface, borderRadius: 10, padding: 13,
      fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.border,
    },
    inputMultiline: { minHeight: 160, maxHeight: 300 },
  })
}
