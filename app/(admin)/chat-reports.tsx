import { useCallback, useMemo, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from 'react-native'
import Toast from 'react-native-toast-message'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { shadow } from '../../lib/shadows'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ConfirmDialog } from '../../components/ConfirmDialog'

type Report = {
  id: string
  reason: string
  created_at: string
  resolved_at: string | null
  reporter: { full_name: string } | null
  message: {
    id: string
    content: string
    deleted_at: string | null
    created_at: string
    sender: { full_name: string } | null
    channel: { name: string | null; type: string } | null
  } | null
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pl-PL')} ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
}

// Zgłoszenia wiadomości z czatu (moderacja przez admina parafii)
export default function ChatReportsScreen() {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [showResolved, setShowResolved] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Report | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('chat_reports')
      .select(`id, reason, created_at, resolved_at,
        reporter:profiles!chat_reports_reporter_id_fkey(full_name),
        message:chat_messages(id, content, deleted_at, created_at,
          sender:profiles(full_name), channel:chat_channels(name, type))`)
      .order('created_at', { ascending: false })
    if (error) Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
    setReports((data ?? []) as any)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const visible = reports.filter(r => showResolved || !r.resolved_at)

  const resolve = async (r: Report) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('chat_reports')
      .update({ resolved_at: new Date().toISOString(), resolved_by: user?.id }).eq('id', r.id)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    Toast.show({ type: 'success', text1: 'Oznaczono jako rozpatrzone' })
    load()
  }

  const deleteMessage = async () => {
    const r = pendingDelete
    setPendingDelete(null)
    if (!r?.message) return
    const { error } = await supabase.from('chat_messages')
      .update({ deleted_at: new Date().toISOString() }).eq('id', r.message.id)
    if (error) { Toast.show({ type: 'error', text1: 'Nie udało się usunąć', text2: error.message }); return }
    await resolve(r)
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.toggle} onPress={() => setShowResolved(v => !v)}>
        <Ionicons name={showResolved ? 'checkbox' : 'square-outline'} size={20} color={c.primary} />
        <Text style={styles.toggleText}>Pokaż rozpatrzone</Text>
      </TouchableOpacity>

      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="shield-checkmark-outline" size={48} color={c.iconMuted} />
          <Text style={styles.emptyText}>Brak zgłoszeń do rozpatrzenia</Text>
        </View>
      ) : visible.map(r => (
        <View key={r.id} style={[styles.card, r.resolved_at && { opacity: 0.6 }]}>
          <Text style={styles.meta}>
            {r.message?.channel?.type === 'dm' ? 'Wiadomość prywatna' : `Kanał: ${r.message?.channel?.name ?? '—'}`}
            {' · '}{r.message ? formatDateTime(r.message.created_at) : ''}
          </Text>
          <Text style={styles.sender}>{r.message?.sender?.full_name ?? 'Nieznany'} napisał(a):</Text>
          <Text style={[styles.content_, r.message?.deleted_at && styles.deleted]}>
            {r.message?.deleted_at ? 'Wiadomość usunięta' : r.message?.content ?? '—'}
          </Text>
          <View style={styles.reasonBox}>
            <Ionicons name="flag" size={14} color={c.danger} />
            <Text style={styles.reason}>{r.reason}</Text>
          </View>
          <Text style={styles.meta}>Zgłosił(a): {r.reporter?.full_name ?? '—'} · {formatDateTime(r.created_at)}</Text>
          {!r.resolved_at && (
            <View style={styles.actions}>
              {!r.message?.deleted_at && (
                <TouchableOpacity style={styles.deleteBtn} onPress={() => setPendingDelete(r)}>
                  <Text style={styles.deleteText}>Usuń wiadomość</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.resolveBtn} onPress={() => resolve(r)}>
                <Text style={styles.resolveText}>Rozpatrzone</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Usunąć wiadomość?"
        message="Wiadomość zniknie z czatu dla wszystkich, a zgłoszenie zostanie oznaczone jako rozpatrzone."
        confirmText="Usuń"
        destructive
        onConfirm={deleteMessage}
        onCancel={() => setPendingDelete(null)}
      />
    </ScrollView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, ...(Platform.OS === 'web' && { minHeight: 0 }) },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg },
    content: { padding: 16, gap: 12 },
    toggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    toggleText: { fontSize: 14, color: c.text },
    empty: { alignItems: 'center', marginTop: 48, gap: 10 },
    emptyText: { fontSize: 15, color: c.textTertiary },
    card: { backgroundColor: c.surface, borderRadius: 14, padding: 14, gap: 6, ...shadow.xs },
    meta: { fontSize: 12, color: c.subtext },
    sender: { fontSize: 13, fontWeight: '700', color: c.text },
    content_: { fontSize: 15, color: c.text, backgroundColor: c.bg, borderRadius: 10, padding: 10 },
    deleted: { fontStyle: 'italic', color: c.textTertiary },
    reasonBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    reason: { flex: 1, fontSize: 14, fontWeight: '600', color: c.danger },
    actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    deleteBtn: { flex: 1, padding: 11, borderRadius: 10, backgroundColor: c.danger, alignItems: 'center' },
    deleteText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    resolveBtn: { flex: 1, padding: 11, borderRadius: 10, backgroundColor: c.primarySurface, alignItems: 'center' },
    resolveText: { color: c.primary, fontWeight: '700', fontSize: 14 },
  })
}
