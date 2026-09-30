import { useCallback, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, ScrollView,
} from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import { Colors } from '../lib/theme'

interface BlockRow {
  blocked_id: string
  blocked: { full_name: string | null } | null
}

// Lista osób zablokowanych w czacie z możliwością odblokowania
// (tabela user_blocks, migracja 20260930000000). Blokuje się z menu wiadomości.
export function BlockedUsersButton() {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<BlockRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocked_id, blocked:profiles!user_blocks_blocked_id_fkey(full_name)')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      Toast.show({ type: 'error', text1: 'Nie udało się wczytać listy', text2: error.message })
      return
    }
    setRows((data ?? []) as unknown as BlockRow[])
  }, [])

  const openList = () => { setOpen(true); load() }

  const unblock = async (blockedId: string) => {
    setBusyId(blockedId)
    const { error } = await supabase.from('user_blocks').delete().eq('blocked_id', blockedId)
    setBusyId(null)
    if (error) {
      Toast.show({ type: 'error', text1: 'Nie udało się odblokować', text2: error.message })
      return
    }
    setRows(prev => prev.filter(r => r.blocked_id !== blockedId))
    Toast.show({ type: 'success', text1: 'Odblokowano' })
  }

  return (
    <>
      <TouchableOpacity style={styles.link} onPress={openList}>
        <Text style={styles.linkText}>Zablokowane osoby</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Zablokowane osoby</Text>
            <Text style={styles.message}>
              Nie widzisz wiadomości tych osób w czacie, a w rozmowie prywatnej nie możecie do siebie pisać.
            </Text>
            {loading ? (
              <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} />
            ) : rows.length === 0 ? (
              <Text style={styles.empty}>Nikogo nie blokujesz.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {rows.map(r => (
                  <View key={r.blocked_id} style={[styles.row, { borderBottomColor: c.border }]}>
                    <Text style={styles.name} numberOfLines={1}>{r.blocked?.full_name ?? 'Użytkownik'}</Text>
                    <TouchableOpacity
                      style={styles.unblockBtn}
                      onPress={() => unblock(r.blocked_id)}
                      disabled={busyId === r.blocked_id}
                    >
                      {busyId === r.blocked_id
                        ? <ActivityIndicator size="small" color={c.primary} />
                        : <Text style={styles.unblockText}>Odblokuj</Text>}
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    link: { alignItems: 'center', paddingVertical: 8 },
    linkText: { fontSize: 13, color: c.subtext, textDecorationLine: 'underline' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 32 },
    sheet: { backgroundColor: c.surface, borderRadius: 16, padding: 24, gap: 12, width: '100%', maxWidth: 400 },
    title: { fontSize: 18, fontWeight: '700', color: c.text },
    message: { fontSize: 14, color: c.subtext },
    empty: { fontSize: 14, color: c.subtext, textAlign: 'center', paddingVertical: 12 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
    name: { flex: 1, fontSize: 15, color: c.text },
    unblockBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: c.primarySurface, minWidth: 90, alignItems: 'center' },
    unblockText: { fontSize: 14, fontWeight: '600', color: c.primary },
    closeBtn: { padding: 14, borderRadius: 10, backgroundColor: c.primarySurface, alignItems: 'center', marginTop: 4 },
    closeText: { fontSize: 15, fontWeight: '600', color: c.primary },
  })
}
