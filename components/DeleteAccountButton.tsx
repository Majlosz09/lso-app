import { useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator,
} from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../lib/ThemeContext'
import { Colors } from '../lib/theme'

const CONFIRM_WORD = 'USUŃ'

// Trwałe usunięcie konta (RODO art. 17, wymóg Google Play / App Store).
// Logika po stronie bazy: RPC delete_my_account (migracja 20260927000001).
export function DeleteAccountButton() {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const signOut = useAuthStore(s => s.signOut)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)

  const close = () => { if (!deleting) { setOpen(false); setTyped('') } }

  const handleDelete = async () => {
    setDeleting(true)
    const { error } = await supabase.rpc('delete_my_account')
    setDeleting(false)
    if (error) {
      Toast.show({ type: 'error', text1: 'Nie udało się usunąć konta', text2: error.message })
      return
    }
    setOpen(false)
    Toast.show({ type: 'success', text1: 'Konto zostało usunięte' })
    await signOut()
  }

  return (
    <>
      <TouchableOpacity style={styles.link} onPress={() => setOpen(true)}>
        <Text style={styles.linkText}>Usuń konto</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Usunąć konto?</Text>
            <Text style={styles.message}>
              Twoje konto i dane (profil, historia służb, punkty, odznaki, wiadomości) zostaną
              trwale usunięte. Tej operacji nie można cofnąć.
            </Text>
            <Text style={styles.message}>Aby potwierdzić, wpisz {CONFIRM_WORD}:</Text>
            <TextInput
              style={styles.input}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={CONFIRM_WORD}
              placeholderTextColor={c.subtext}
              editable={!deleting}
            />
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={close} disabled={deleting}>
                <Text style={styles.cancelText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteBtn, typed.trim().toUpperCase() !== CONFIRM_WORD && styles.disabled]}
                onPress={handleDelete}
                disabled={deleting || typed.trim().toUpperCase() !== CONFIRM_WORD}
              >
                {deleting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.deleteText}>Usuń konto</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    link: { alignItems: 'center', paddingVertical: 8 },
    linkText: { fontSize: 13, color: c.subtext, textDecorationLine: 'underline', fontFamily: 'Manrope_500Medium' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 32 },
    sheet: { backgroundColor: c.surface, borderRadius: 16, padding: 24, gap: 12, width: '100%', maxWidth: 400 },
    title: { fontSize: 18, color: c.text, fontFamily: 'Manrope_700Bold' },
    message: { fontSize: 14, color: c.subtext, fontFamily: 'Manrope_500Medium' },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12,
      fontSize: 15, color: c.text, backgroundColor: c.bg,
      fontFamily: 'Manrope_500Medium',
    },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    cancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: c.primarySurface, alignItems: 'center' },
    cancelText: { fontSize: 15, color: c.primary, fontFamily: 'Manrope_600SemiBold' },
    deleteBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: c.danger, alignItems: 'center' },
    deleteText: { fontSize: 15, color: '#fff', fontFamily: 'Manrope_600SemiBold' },
    disabled: { opacity: 0.4 },
  })
}
