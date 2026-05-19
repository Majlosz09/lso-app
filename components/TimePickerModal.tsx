import { useMemo } from 'react'
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../lib/ThemeContext'
import { Colors } from '../lib/theme'

const TIMES: string[] = []
for (let h = 6; h <= 22; h++) {
  TIMES.push(`${String(h).padStart(2, '0')}:00`)
  TIMES.push(`${String(h).padStart(2, '0')}:30`)
}

interface Props {
  visible: boolean
  value: string       // "HH:MM" or ""
  onConfirm: (time: string) => void
  onClose: () => void
}

export function TimePickerModal({ visible, value, onConfirm, onClose }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1}>
          <View style={styles.header}>
            <Text style={styles.title}>Wybierz godzinę</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={c.subtext} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {TIMES.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, value === t && styles.chipActive]}
                onPress={() => { onConfirm(t); onClose() }}
              >
                <Text style={[styles.chipText, value === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      maxHeight: '65%', paddingBottom: 16,
    },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: 20, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    title: { fontSize: 17, fontWeight: '700', color: c.text },
    grid: {
      flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8,
    },
    chip: {
      width: '22%', paddingVertical: 12, borderRadius: 10,
      backgroundColor: c.bg, alignItems: 'center',
      borderWidth: 1, borderColor: c.border,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 14, fontWeight: '600', color: c.subtext },
    chipTextActive: { color: '#fff' },
  })
}
