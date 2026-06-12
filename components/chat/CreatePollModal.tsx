import { useMemo, useState } from 'react'
import {
  Alert, Modal, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

interface Props {
  visible: boolean
  onClose: () => void
  onSubmit: (question: string, options: string[], allowMultiple: boolean) => Promise<void>
}

export function CreatePollModal({ visible, onClose, onSubmit }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setQuestion('')
    setOptions(['', ''])
    setAllowMultiple(false)
  }

  const handleClose = () => { reset(); onClose() }

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
  }

  const addOption = () => {
    if (options.length < 6) setOptions((prev) => [...prev, ''])
  }

  const removeOption = (index: number) => {
    if (options.length > 2) setOptions((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    const trimmedQ = question.trim()
    const trimmedOpts = options.map((o) => o.trim()).filter(Boolean)
    if (!trimmedQ) { Alert.alert('Błąd', 'Wpisz pytanie.'); return }
    if (trimmedOpts.length < 2) { Alert.alert('Błąd', 'Dodaj co najmniej 2 opcje.'); return }
    setSubmitting(true)
    try {
      await onSubmit(trimmedQ, trimmedOpts, allowMultiple)
      reset()
      onClose()
    } catch {
      // onSubmit showed an Alert — leave modal open so user can retry
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.text }]}>Nowa ankieta</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={[styles.cancel, { color: c.subtext }]}>Anuluj</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: c.subtext }]}>Pytanie</Text>
            <TextInput
              style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.border }]}
              value={question}
              onChangeText={setQuestion}
              placeholder="Wpisz pytanie..."
              placeholderTextColor={c.subtext}
              maxLength={200}
            />
            <Text style={[styles.label, { color: c.subtext }]}>Opcje ({options.length}/6)</Text>
            {options.map((opt, i) => (
              <View key={i} style={styles.optionRow}>
                <TextInput
                  style={[styles.input, styles.optionInput, { color: c.text, backgroundColor: c.inputBg, borderColor: c.border }]}
                  value={opt}
                  onChangeText={(v) => updateOption(i, v)}
                  placeholder={`Opcja ${i + 1}`}
                  placeholderTextColor={c.subtext}
                  maxLength={100}
                />
                {options.length > 2 && (
                  <TouchableOpacity onPress={() => removeOption(i)} style={styles.removeBtn}>
                    <Text style={{ color: c.danger, fontSize: 18 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {options.length < 6 && (
              <TouchableOpacity onPress={addOption} style={styles.addBtn}>
                <Text style={[styles.addBtnText, { color: c.primary }]}>+ Dodaj opcję</Text>
              </TouchableOpacity>
            )}
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: c.text }]}>Wielokrotny wybór</Text>
              <Switch
                value={allowMultiple}
                onValueChange={setAllowMultiple}
                trackColor={{ true: c.primary }}
              />
            </View>
          </ScrollView>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: submitting ? c.border : c.primary }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.submitText}>Utwórz ankietę</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      padding: 16, paddingBottom: 12,
    },
    title: { fontSize: 18, fontWeight: '700' },
    cancel: { fontSize: 15 },
    body: { padding: 16, gap: 8 },
    label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    input: {
      borderRadius: 10, borderWidth: 1,
      paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 15,
    },
    optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    optionInput: { flex: 1 },
    removeBtn: { padding: 4 },
    addBtn: { paddingVertical: 8 },
    addBtnText: { fontSize: 14, fontWeight: '600' },
    toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    toggleLabel: { fontSize: 15 },
    submitBtn: { margin: 16, borderRadius: 12, padding: 14, alignItems: 'center' },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  })
}
