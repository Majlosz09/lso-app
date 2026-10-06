import { useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../lib/ThemeContext'
import { Colors } from '../lib/theme'

type Announcement = { id: string; title: string; body: string }

// Jednorazowe komunikaty „Co nowego” (tabela app_announcements, migracja 20260929000000).
// Pokazuje nieprzeczytane po kolei; „Rozumiem” zapisuje zamknięcie na koncie.
export function WhatsNewModal({ suppressed }: { suppressed: boolean }) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const profile = useAuthStore(s => s.profile)
  const [queue, setQueue] = useState<Announcement[]>([])
  const [closing, setClosing] = useState(false)

  const eligible = !!profile?.id && !!profile.parish_id && profile.approved !== false

  useEffect(() => {
    if (!eligible) { setQueue([]); return }
    let cancelled = false
    supabase.rpc('get_my_announcements').then(({ data }) => {
      if (!cancelled) setQueue((data ?? []) as Announcement[])
    }, () => {})
    return () => { cancelled = true }
  }, [profile?.id, eligible])

  const current = queue[0]
  if (!current || suppressed) return null

  const dismiss = async () => {
    setClosing(true)
    await supabase.from('app_announcement_dismissals')
      .insert({ announcement_id: current.id, profile_id: profile!.id })
      .then(undefined, () => {})
    setClosing(false)
    setQueue(q => q.slice(1))
  }

  const lines = current.body.split('\n').map(l => l.trim()).filter(Boolean)

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="sparkles" size={24} color="#C9A55C" />
            </View>
            <Text style={styles.title}>{current.title}</Text>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={{ gap: 10 }}>
            {lines.map((line, i) => line.startsWith('•') ? (
              <View key={i} style={styles.bulletRow}>
                <View style={styles.dot} />
                <Text style={styles.bulletText}>{line.replace(/^•\s*/, '')}</Text>
              </View>
            ) : (
              <Text key={i} style={styles.text}>{line}</Text>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.button} onPress={dismiss} disabled={closing}>
            {closing
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>{queue.length > 1 ? 'Dalej' : 'Rozumiem'}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(13,31,107,0.55)', justifyContent: 'center', padding: 20 },
    card: {
      backgroundColor: c.surface, borderRadius: 20, overflow: 'hidden',
      width: '100%', maxWidth: 480, maxHeight: '85%', alignSelf: 'center',
    },
    header: {
      backgroundColor: '#0D1F6B', paddingVertical: 20, paddingHorizontal: 20, alignItems: 'center', gap: 10,
      borderBottomWidth: 3, borderBottomColor: '#C9A55C',
    },
    iconWrap: {
      width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)',
      justifyContent: 'center', alignItems: 'center',
    },
    title: { fontSize: 20, color: '#fff', textAlign: 'center', fontFamily: 'Manrope_800ExtraBold' },
    scroll: { paddingHorizontal: 20, paddingTop: 18, flexGrow: 0 },
    text: { fontSize: 15, lineHeight: 22, color: c.text, fontFamily: 'Manrope_500Medium' },
    bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#C9A55C', marginTop: 8 },
    bulletText: { flex: 1, fontSize: 14, lineHeight: 21, color: c.text, fontFamily: 'Manrope_500Medium' },
    button: {
      margin: 20, marginTop: 16, backgroundColor: '#0B2E5C', borderRadius: 12, paddingVertical: 15, alignItems: 'center',
    },
    buttonText: { color: '#fff', fontSize: 16, fontFamily: 'Manrope_700Bold' },
  })
}
